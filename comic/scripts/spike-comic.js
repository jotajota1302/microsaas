/*
 * Spike — the only question that decides whether this product can exist:
 * can MiniMax image-01 draw the SAME teenage hero across the panels of a
 * comic page, in a consistent comic/anime register, at a price we can pay?
 *
 * It measures four things at once, because they are all cheap once the key
 * is warm:
 *
 *   1. Character consistency across 6 panels of one page (the thing that
 *      killed image-01 for `cuentos` was style drift, not character drift).
 *   2. Style register across GENRES: hero academy vs spirit hunters. If both
 *      come back looking the same, the closed genre list is cosmetic.
 *   3. Speech bubbles: can the model letter readable Spanish inside the
 *      panel, or do we draw mute panels and composite bubbles in code?
 *   4. Real resolution, latency and cost per panel.
 *
 * Throwaway measurement code. Output is a contact sheet a human looks at:
 *   out/spike/*.jpg + out/spike/index.html + out/spike/results.json
 *
 * Usage: node scripts/spike-comic.js [--only <id>] [--concurrency 4]
 */

const fs = require("fs");
const path = require("path");

// --- env ---------------------------------------------------------------------
// Same rule as cuentos/lib/env.js: the project's .env wins over the shell,
// because a stale global key shadowed a project key once (2026-08-21).
const ENV_FILE = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
if (!process.env.MINIMAX_API_KEY) throw new Error("missing MINIMAX_API_KEY");

const BASE = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const OUT = path.join(__dirname, "..", "out", "spike");
const COST_PER_IMAGE = 0.0035; // measured 2026-08-21 in cuentos/docs/fase-0-resultados.md

// --- what we test ------------------------------------------------------------

// The hero is described, never named. No franchise, no lookalike: this is the
// IP rule the product runs on (genres are free, works are not).
const HERO =
  "a 15-year-old boy with messy black hair, light brown skin, a small scar on his left eyebrow, " +
  "wearing a navy school jacket over a white shirt and a red scarf";

// One style suffix per genre. If these two produce the same look, the closed
// genre list buys us nothing and the product has one collection, not seven.
const STYLES = {
  academy:
    ", modern shōnen manga style, bold clean ink linework, dynamic cel shading, " +
    "screentone texture, vivid saturated palette, expressive eyes, dramatic camera angle, " +
    "no text, no lettering, no speech bubbles, no watermark, no signature",
  hunters:
    ", dark historical anime style, heavy brush ink linework, muted indigo and ember palette, " +
    "washi paper texture, moody rim lighting, ukiyo-e influenced composition, " +
    "no text, no lettering, no speech bubbles, no watermark, no signature",
};

const SHEET = {
  id: "00-sheet",
  group: "reference",
  note: "Character sheet — the reference every panel is generated from",
  prompt:
    `Character reference sheet, 2x2 grid on a plain white background, four views of the same ` +
    `single character: top left front view, top right side profile, bottom left full body standing, ` +
    `bottom right determined face close-up. The character is ${HERO}${STYLES.academy}`,
  ref: false,
};

// Six panels of one page. Deliberately varied: establishing shot, close-up,
// action, two-shot, wide, hero beat. If the character survives all six, it
// survives a comic.
const PANELS = [
  ["01-establishing", "academy", "standing at the gate of a huge modern academy building on his first day, backpack on one shoulder, wide establishing shot"],
  ["02-closeup", "academy", "extreme close-up of his shocked face lit from below as his own hand glows with energy"],
  ["03-action", "academy", "leaping sideways to dodge a falling steel beam inside a training hall, motion lines, debris in the air"],
  ["04-twoshot", "academy", "facing an older student in a school corridor, both in profile, tense standoff, lockers behind them"],
  ["05-wide", "academy", "sitting alone on a rooftop at sunset, the city skyline far below, small figure in a wide frame"],
  ["06-hero", "academy", "standing up in heavy rain, energy aura around him, low angle hero shot, lightning behind"],
];

// Second genre, same hero, to see whether the style suffix actually changes
// the register or just swaps the background.
const GENRE_TEST = [
  ["07-hunters-forest", "hunters", "walking through a misty bamboo forest at night holding a paper lantern, traditional Japanese clothing"],
  ["08-hunters-shrine", "hunters", "drawing a sword under moonlight on the steps of an old shrine, cherry petals in the air"],
];

// The bubble question. Same panel, three ways.
const BUBBLES = [
  {
    id: "09-bubble-drawn",
    group: "bubbles",
    note: "Model letters the Spanish itself — read it: any typos?",
    genre: "academy",
    scene:
      "shouting with his fist raised, seen from below. A large white comic speech bubble in the " +
      "top left of the panel contains exactly this Spanish text in bold black comic lettering: " +
      "\"¡NO PIENSO RENDIRME!\"",
    style: STYLES.academy.replace(", no text, no lettering, no speech bubbles", ""),
  },
  {
    id: "10-bubble-mute",
    group: "bubbles",
    note: "Mute panel with empty sky top-left — room for a bubble drawn in code",
    genre: "academy",
    scene:
      "shouting with his fist raised, seen from below, with a large area of empty plain sky in the " +
      "top left third of the frame and the character placed in the lower right",
    style: STYLES.academy,
  },
];

// --- provider ----------------------------------------------------------------

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function generate({ prompt, ref, aspect }) {
  const body = {
    model: "image-01",
    prompt: prompt.slice(0, 1500),
    aspect_ratio: aspect || "1:1",
    response_format: "url",
    n: 1,
  };
  if (ref) {
    body.subject_reference = [
      { type: "character", image_file: `data:image/jpeg;base64,${ref.toString("base64")}` },
    ];
  }
  const started = Date.now();
  const res = await fetch(`${BASE}/image_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const url = data.data && data.data.image_urls && data.data.image_urls[0];
  if (!url) {
    const msg = JSON.stringify(data.base_resp || data).slice(0, 400);
    const blocked = /sensitive|risk|policy|violat/i.test(msg);
    const err = new Error(msg);
    err.blocked = blocked;
    throw err;
  }
  const buffer = await download(url);
  return { buffer, ms: Date.now() - started };
}

// --- image dimensions without a dependency -----------------------------------

function dimensions(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: "png" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), type: "jpeg" };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { w: 0, h: 0, type: "unknown" };
}

// --- runner ------------------------------------------------------------------

async function pool(items, limit, worker) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    })
  );
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const concurrency = Number(args[args.indexOf("--concurrency") + 1]) || 4;
  fs.mkdirSync(OUT, { recursive: true });

  const results = [];
  const record = (job, extra) => {
    const row = { id: job.id, group: job.group, note: job.note || "", ...extra };
    results.push(row);
    const label = extra.error ? `FAIL ${extra.error.slice(0, 60)}` : `${extra.w}x${extra.h} ${(extra.ms / 1000).toFixed(1)}s`;
    console.log(`  ${job.id.padEnd(20)} ${label}`);
    return row;
  };

  console.log(`\nMiniMax image-01 — comic spike\n`);
  console.log(`1/3 character sheet (no reference)`);

  let ref = null;
  try {
    const { buffer, ms } = await generate({ prompt: SHEET.prompt });
    fs.writeFileSync(path.join(OUT, `${SHEET.id}.jpg`), buffer);
    ref = buffer;
    record(SHEET, { ...dimensions(buffer), ms, file: `${SHEET.id}.jpg` });
  } catch (e) {
    record(SHEET, { error: e.message, blocked: !!e.blocked, ms: 0 });
    console.error("\nNo character sheet, no references. Stopping.\n");
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
    return;
  }

  const jobs = [
    ...PANELS.map(([id, genre, scene]) => ({
      id, group: "page", genre,
      note: scene.slice(0, 70),
      prompt: `${HERO}, ${scene}. Keep the character exactly identical to the reference image: ` +
        `same face, same hair, same scar, same clothes${STYLES[genre]}`,
    })),
    ...GENRE_TEST.map(([id, genre, scene]) => ({
      id, group: "genre", genre,
      note: scene.slice(0, 70),
      prompt: `${HERO}, ${scene}. Keep the character exactly identical to the reference image: ` +
        `same face, same hair, same scar${STYLES[genre]}`,
    })),
    ...BUBBLES.map((b) => ({
      id: b.id, group: b.group, genre: b.genre, note: b.note,
      prompt: `${HERO}, ${b.scene}. Keep the character exactly identical to the reference image: ` +
        `same face, same hair, same scar, same clothes${b.style}`,
    })),
  ];

  console.log(`\n2/3 ${jobs.length} panels, concurrency ${concurrency}`);
  await pool(jobs, concurrency, async (job) => {
    try {
      const { buffer, ms } = await generate({ prompt: job.prompt, ref });
      fs.writeFileSync(path.join(OUT, `${job.id}.jpg`), buffer);
      return record(job, { ...dimensions(buffer), ms, file: `${job.id}.jpg`, genre: job.genre });
    } catch (e) {
      return record(job, { error: e.message, blocked: !!e.blocked, ms: 0, genre: job.genre });
    }
  });

  // --- report ----------------------------------------------------------------
  const ok = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  const totalMs = results.reduce((a, r) => a + (r.ms || 0), 0);
  const summary = {
    images_requested: results.length,
    images_ok: ok.length,
    blocked: failed.filter((r) => r.blocked).length,
    errors: failed.length,
    cost_usd: +(ok.length * COST_PER_IMAGE).toFixed(4),
    avg_seconds: ok.length ? +(totalMs / ok.length / 1000).toFixed(1) : 0,
    resolutions: [...new Set(ok.map((r) => `${r.w}x${r.h}`))],
  };
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ summary, results }, null, 2));

  console.log(`\n3/3 contact sheet`);
  fs.writeFileSync(path.join(OUT, "index.html"), contactSheet(summary, results));
  console.log(`\n${JSON.stringify(summary, null, 2)}\n`);
  console.log(`open: ${path.join(OUT, "index.html")}\n`);
}

function contactSheet(summary, results) {
  const groups = ["reference", "page", "genre", "bubbles"];
  const titles = {
    reference: "La referencia — de esta imagen salen todas las demás",
    page: "Una página, seis viñetas — ¿es el mismo chaval en las seis? ¿y el mismo estilo?",
    genre: "Otro género, mismo héroe — ¿cambia el registro visual o solo el fondo?",
    bubbles: "Bocadillos — ¿sabe rotular en español, o dejamos la viñeta muda?",
  };
  const card = (r) => `
    <figure class="${r.error ? "fail" : ""}">
      ${r.error ? `<div class="err">${r.blocked ? "BLOQUEADO" : "ERROR"}<br><small>${esc(r.error).slice(0, 200)}</small></div>`
               : `<img src="${r.file}" alt="${esc(r.id)}" loading="lazy">`}
      <figcaption><b>${esc(r.id)}</b>${r.error ? "" : ` · ${r.w}×${r.h} · ${(r.ms / 1000).toFixed(0)} s`}
      <br><span>${esc(r.note)}</span></figcaption>
    </figure>`;
  return `<!doctype html><meta charset="utf-8"><title>Spike cómic · MiniMax image-01</title>
<style>
  :root{color-scheme:light dark}
  body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:2rem;max-width:1200px;margin-inline:auto}
  h1{font-size:1.4rem;margin:0 0 .25rem}
  .sum{display:flex;flex-wrap:wrap;gap:1.5rem;padding:1rem;border:1px solid #8884;border-radius:8px;margin:1rem 0 2rem}
  .sum div{font-size:.85rem;opacity:.75}.sum b{display:block;font-size:1.3rem;opacity:1}
  h2{font-size:1rem;margin:2.5rem 0 .75rem;padding-bottom:.4rem;border-bottom:1px solid #8884}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem}
  figure{margin:0}img{width:100%;border-radius:6px;display:block;background:#8881}
  figcaption{font-size:.75rem;margin-top:.4rem}figcaption span{opacity:.6}
  .err{aspect-ratio:1;display:grid;place-items:center;text-align:center;padding:1rem;
       border:1px dashed #c66;border-radius:6px;color:#c66;font-size:.8rem}
</style>
<h1>Spike cómic — MiniMax <code>image-01</code></h1>
<p style="opacity:.7;margin:0">Mira las imágenes, no los números: ¿es el mismo personaje? ¿es el mismo estilo? ¿hay marca de agua?</p>
<div class="sum">
  <div><b>${summary.images_ok}/${summary.images_requested}</b>imágenes</div>
  <div><b>${summary.cost_usd} $</b>coste total</div>
  <div><b>${summary.avg_seconds} s</b>media por imagen</div>
  <div><b>${summary.blocked}</b>bloqueos del filtro</div>
  <div><b>${summary.resolutions.join(", ") || "—"}</b>resolución</div>
</div>
${groups.map((g) => {
  const rows = results.filter((r) => r.group === g);
  return rows.length ? `<h2>${titles[g]}</h2><div class="grid">${rows.map(card).join("")}</div>` : "";
}).join("")}
`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

main().catch((e) => { console.error(e); process.exit(1); });
