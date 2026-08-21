/*
 * Phase 0 spike — measures the only thing that decides the image provider:
 * does the same child stay the same child across twelve pages?
 *
 * For each (provider, character) it generates one 2x2 character sheet, crops
 * it into four references, and then twelve scenes that receive those
 * references. It records cost, latency, refusals and real resolution.
 *
 * Usage:
 *   node scripts/spike-images.js                          # everything
 *   node scripts/spike-images.js --provider minimax       # one provider
 *   node scripts/spike-images.js --provider seedream --character ana
 *   node scripts/spike-images.js --scenes 3               # cheap smoke test
 *
 * Output: out/spike/<provider>/<character>/{sheet.png,ref-1..4.png,p01..p12.png}
 *         out/spike/results.json
 */

const fs = require("fs");
const path = require("path");
const { env } = require("../lib/env.js");
const { STYLE } = require("../lib/collection.js");

const OUT = path.join(__dirname, "..", "out", "spike");

// --- what we test ------------------------------------------------------------

const CHARACTERS = [
  { id: "ana", desc: "a 5-year-old girl with curly brown hair, light skin and round glasses, wearing a mustard yellow dress and red shoes" },
  { id: "leo", desc: "a 7-year-old boy with straight black hair, brown skin, wearing a green striped t-shirt and blue shorts" },
  { id: "sofi", desc: "a 4-year-old girl with red hair in two braids, freckles and light skin, wearing blue dungarees, with a small brown dog" },
];

const SCENES = [
  "walking on a sunny beach collecting shells",
  "in a dark forest at night holding a paper lantern",
  "baking bread in a warm kitchen, flour on the table",
  "standing on the deck of a small wooden sailboat",
  "inside a cave with glowing crystals",
  "in a huge library climbing a wooden ladder",
  "on a mountain top above the clouds",
  "in a busy street market with fruit stalls",
  "inside a spaceship looking out at the stars",
  "in a garden in the rain holding an umbrella",
  "sitting by the window of a moving train",
  "falling asleep in a cosy bedroom",
];

const SHEET_PROMPT = (desc) =>
  `Character reference sheet, 2x2 grid on a plain white background, four views of the same single character: ` +
  `top left front view, top right side profile, bottom left full body standing, bottom right happy face close-up. ` +
  `The character is ${desc}${STYLE}`;

const SCENE_PROMPT = (desc, scene) =>
  `${desc}, ${scene}. Keep the character exactly identical to the reference images: same face, same hair, ` +
  `same clothes, same age${STYLE}`;

// --- providers ---------------------------------------------------------------
// Each returns { buffer, costUsd }. They throw BlockedError when the provider
// refuses the prompt on content grounds — that is a result, not a crash.

class BlockedError extends Error {
  constructor(message) { super(message); this.name = "BlockedError"; }
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/* MiniMax image-01 — our current key. No true multi-reference: this is the
   baseline the research says is not good enough. We measure it to be sure. */
async function minimax({ prompt, refs }) {
  const body = {
    model: "image-01",
    prompt: prompt.slice(0, 1500),
    aspect_ratio: "1:1",
    response_format: "url",
    n: 1,
  };
  if (refs && refs.length) {
    // image-01 accepts a single subject reference, as a data URI.
    body.subject_reference = [
      { type: "character", image_file: `data:image/png;base64,${refs[0].toString("base64")}` },
    ];
  }
  const res = await fetch(`${env.MINIMAX_BASE_URL || "https://api.minimax.io/v1"}/image_generation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MINIMAX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const url = data.data && data.data.image_urls && data.data.image_urls[0];
  if (!url) {
    const msg = JSON.stringify(data.base_resp || data).slice(0, 300);
    if (/sensitive|risk|policy|violat/i.test(msg)) throw new BlockedError(msg);
    throw new Error(msg);
  }
  return { buffer: await download(url), costUsd: 0.0035 };
}

/* Seedream 4.5 via fal.ai — up to 10 reference images, 2K native. */
async function seedream({ prompt, refs }) {
  const endpoint = refs && refs.length
    ? "https://fal.run/fal-ai/bytedance/seedream/v4.5/edit"
    : "https://fal.run/fal-ai/bytedance/seedream/v4.5/text-to-image";
  const body = { prompt, image_size: { width: 2048, height: 2048 }, num_images: 1 };
  if (refs && refs.length) {
    body.image_urls = refs.map((b) => `data:image/png;base64,${b.toString("base64")}`);
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const url = data.images && data.images[0] && data.images[0].url;
  if (!url) {
    const msg = JSON.stringify(data).slice(0, 300);
    if (/nsfw|content|policy|blocked|safety/i.test(msg)) throw new BlockedError(msg);
    throw new Error(msg);
  }
  return { buffer: await download(url), costUsd: 0.04 };
}

/* Gemini 3.1 Flash Image (Nano Banana 2) — up to 4 character references. */
async function nanobanana({ prompt, refs }) {
  const parts = [{ text: prompt }];
  for (const b of refs || []) {
    parts.push({ inline_data: { mime_type: "image/png", data: b.toString("base64") } });
  }
  const model = env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  );
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  if (cand && /SAFETY|PROHIBITED/i.test(cand.finishReason || "")) {
    throw new BlockedError(cand.finishReason);
  }
  const part = cand && cand.content && cand.content.parts.find((p) => p.inline_data || p.inlineData);
  const inline = part && (part.inline_data || part.inlineData);
  if (!inline) throw new Error(JSON.stringify(data).slice(0, 300));
  return { buffer: Buffer.from(inline.data, "base64"), costUsd: 0.067 };
}

/* Gemini image models THROUGH OPENROUTER — one key for text and images.
   Chat-completions shape with modalities:["image","text"]; references go as
   image_url parts; the result comes back as a data URI in message.images. */
function viaOpenRouter(model, defaultCostUsd) {
  return async function openrouterImage({ prompt, refs }) {
    const content = [{ type: "text", text: prompt }];
    for (const b of refs || []) {
      content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${b.toString("base64")}` } });
    }
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "cuentos-spike",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
        usage: { include: true },
      }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`non-JSON ${res.status}: ${text.slice(0, 200)}`); }
    if (!res.ok) {
      const msg = JSON.stringify(data.error || data).slice(0, 300);
      if (/safety|blocked|prohibited|policy/i.test(msg)) throw new BlockedError(msg);
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }
    const choice = data.choices && data.choices[0];
    if (choice && /SAFETY|PROHIBITED|content_filter/i.test(choice.finish_reason || choice.native_finish_reason || "")) {
      throw new BlockedError(choice.native_finish_reason || choice.finish_reason);
    }
    const img = choice && choice.message && choice.message.images && choice.message.images[0];
    const url = img && img.image_url && img.image_url.url;
    if (!url) throw new Error(`no image in response: ${JSON.stringify(data).slice(0, 300)}`);
    const base64 = url.startsWith("data:") ? url.slice(url.indexOf(",") + 1) : null;
    const buffer = base64 ? Buffer.from(base64, "base64") : await download(url);
    const costUsd = data.usage && typeof data.usage.cost === "number" ? data.usage.cost : defaultCostUsd;
    return { buffer, costUsd };
  };
}

const PROVIDERS = {
  minimax,
  seedream,
  nanobanana,
  // Nano Banana 2 and Nano Banana (2.5) via OpenRouter — the ones we can run today.
  "or-nb2": viaOpenRouter(env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image", 0.067),
  "or-nb25": viaOpenRouter("google/gemini-2.5-flash-image", 0.039),
  "or-lite": viaOpenRouter("google/gemini-3.1-flash-lite-image", 0.034),
  "or-pro": viaOpenRouter("google/gemini-3-pro-image", 0.134),
};

// --- helpers -----------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function cropSheet(buffer, dir) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.warn("[cuentos] sharp not installed — using the whole sheet as a single reference");
    return [buffer];
  }
  const meta = await sharp(buffer).metadata();
  const w = Math.floor(meta.width / 2);
  const h = Math.floor(meta.height / 2);
  const refs = [];
  const quads = [
    { left: 0, top: 0 }, { left: w, top: 0 },
    { left: 0, top: h }, { left: w, top: h },
  ];
  for (let i = 0; i < quads.length; i++) {
    const out = await sharp(buffer).extract({ ...quads[i], width: w, height: h }).png().toBuffer();
    fs.writeFileSync(path.join(dir, `ref-${i + 1}.png`), out);
    refs.push(out);
  }
  return refs;
}

async function dimensions(buffer) {
  try {
    const sharp = require("sharp");
    const m = await sharp(buffer).metadata();
    return `${m.width}x${m.height}`;
  } catch {
    return "unknown";
  }
}

// --- run ---------------------------------------------------------------------

(async () => {
  const providerNames = arg("provider") ? [arg("provider")] : Object.keys(PROVIDERS);
  const characterIds = arg("character") ? [arg("character")] : CHARACTERS.map((c) => c.id);
  const sceneCount = Number(arg("scenes", SCENES.length));

  const results = [];

  for (const providerName of providerNames) {
    const provider = PROVIDERS[providerName];
    if (!provider) throw new Error(`unknown provider: ${providerName}`);

    for (const character of CHARACTERS.filter((c) => characterIds.includes(c.id))) {
      const dir = path.join(OUT, providerName, character.id);
      fs.mkdirSync(dir, { recursive: true });

      const row = {
        provider: providerName, character: character.id,
        sheetOk: false, pages: 0, blocked: 0, failed: 0,
        costUsd: 0, msTotal: 0, size: null, errors: [],
      };
      const started = Date.now();

      let refs = [];
      try {
        const sheet = await provider({ prompt: SHEET_PROMPT(character.desc), refs: [] });
        fs.writeFileSync(path.join(dir, "sheet.png"), sheet.buffer);
        row.costUsd += sheet.costUsd;
        row.sheetOk = true;
        row.size = await dimensions(sheet.buffer);
        refs = await cropSheet(sheet.buffer, dir);
        console.log(`[${providerName}/${character.id}] sheet ok (${row.size})`);
      } catch (e) {
        row.errors.push(`sheet: ${e.name}: ${e.message}`);
        console.error(`[${providerName}/${character.id}] sheet FAILED: ${e.message}`);
        results.push(row);
        continue;
      }

      for (let i = 0; i < sceneCount; i++) {
        const label = String(i + 1).padStart(2, "0");
        try {
          const page = await provider({ prompt: SCENE_PROMPT(character.desc, SCENES[i]), refs });
          fs.writeFileSync(path.join(dir, `p${label}.png`), page.buffer);
          row.costUsd += page.costUsd;
          row.pages++;
          console.log(`[${providerName}/${character.id}] p${label} ok`);
        } catch (e) {
          if (e.name === "BlockedError") row.blocked++;
          else row.failed++;
          row.errors.push(`p${label}: ${e.name}: ${e.message}`);
          console.error(`[${providerName}/${character.id}] p${label} ${e.name}: ${e.message}`);
        }
      }

      row.msTotal = Date.now() - started;
      results.push(row);
      console.log(
        `[${providerName}/${character.id}] done: ${row.pages}/${sceneCount} pages, ` +
        `${row.blocked} blocked, ${row.failed} failed, $${row.costUsd.toFixed(3)}, ` +
        `${Math.round(row.msTotal / 1000)}s`
      );
    }
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));

  console.log("\n=== summary ===");
  for (const r of results) {
    const perImage = r.pages ? Math.round(r.msTotal / (r.pages + 1) / 1000) : 0;
    console.log(
      `${r.provider}/${r.character}: ${r.pages} pages, ${r.blocked} blocked, ${r.failed} failed, ` +
      `${r.size}, $${r.costUsd.toFixed(3)}, ~${perImage}s/image`
    );
  }
  console.log("\nNow run: node scripts/spike-contact-sheet.js  and judge consistency by eye.");
})();
