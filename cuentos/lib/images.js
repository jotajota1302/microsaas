/*
 * Image generation behind one switchable adapter.
 *
 * Providers:
 *   openrouter  (default) Gemini image models through OpenRouter — one key
 *               for text and images. Model from OPENROUTER_IMAGE_MODEL,
 *               default gemini-3.1-flash-lite-image (measured 2026-08-21:
 *               same character, same style, 5 s, 0,034 $). If the primary
 *               model fails, the next one in IMAGE_FALLBACK_MODELS is tried.
 *   minimax     image-01: cheap, but style drifts between pages (measured).
 *               Kept only as a last resort and for catalogue illustrations.
 *
 * Every prompt gets the collection's STYLE suffix. References (the character
 * sheet) travel as images; never a photo of a real person.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { env } = require("./env.js");
const C = require("./collection.js");
const llm = require("./llm.js");
const meter = require("./meter.js");

class ImageBlockedError extends Error {
  constructor(message) { super(message); this.name = "ImageBlockedError"; }
}
/*
 * There is no credit left. Not "this image failed" — nothing will be drawn for
 * anyone until somebody pays. It must never be confused with a page that could
 * not be drawn: that reads as a defective book and sends a paid order to human
 * review, when what is needed is a top-up. A 5xx or a 429 is NOT this: those
 * are worth retrying and worth trying another model for.
 */
class OutOfCreditError extends Error {
  constructor(message, { status } = {}) { super(message); this.name = "OutOfCreditError"; this.status = status; }
}

const OUT_OF_CREDIT = new Set([402]);

class ImageError extends Error {
  constructor(message, { status } = {}) { super(message); this.name = "ImageError"; this.status = status; }
}

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-image";
const DEFAULT_FALLBACKS = ["google/gemini-3.1-flash-image"];

// Measured / published cost per 1K image, used only when the provider does
// not report usage.cost itself.
const MODEL_COST_USD = {
  "google/gemini-3.1-flash-lite-image": 0.034,
  "google/gemini-3.1-flash-image": 0.067,
  "google/gemini-2.5-flash-image": 0.039,
  "google/gemini-3-pro-image": 0.134,
  "image-01": 0.0035,
};

const BLOCKED_RE = /safety|blocked|prohibited|content.?filter|sensitive|policy|violat/i;

function withStyle(prompt) {
  return prompt.includes(C.STYLE.trim()) ? prompt : `${prompt}${C.STYLE}`;
}

function toDataUri(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function download(url, fetchFn) {
  const res = await fetchFn(url);
  if (!res.ok) throw new ImageError(`download HTTP ${res.status}`, { status: res.status });
  return Buffer.from(await res.arrayBuffer());
}

// --- providers ---------------------------------------------------------------

async function openrouterOnce({ model, prompt, refs, size, fetchFn }) {
  const content = [{ type: "text", text: prompt }];
  for (const ref of refs) content.push({ type: "image_url", image_url: { url: toDataUri(ref) } });

  const res = await fetchFn("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "cuentos",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: size },
      usage: { include: true },
    }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new ImageError(`openrouter non-JSON ${res.status}: ${text.slice(0, 200)}`, { status: res.status }); }

  if (!res.ok) {
    const msg = JSON.stringify(data.error || data).slice(0, 300);
    if (BLOCKED_RE.test(msg)) throw new ImageBlockedError(msg);
    if (OUT_OF_CREDIT.has(res.status)) {
      throw new OutOfCreditError(`openrouter HTTP ${res.status}: ${msg}`, { status: res.status });
    }
    throw new ImageError(`openrouter HTTP ${res.status}: ${msg}`, { status: res.status });
  }

  const choice = data.choices && data.choices[0];
  const finish = (choice && (choice.native_finish_reason || choice.finish_reason)) || "";
  if (/SAFETY|PROHIBITED|content_filter/i.test(finish)) throw new ImageBlockedError(finish);

  const img = choice && choice.message && choice.message.images && choice.message.images[0];
  const url = img && img.image_url && img.image_url.url;
  if (!url) throw new ImageError(`openrouter returned no image: ${JSON.stringify(data).slice(0, 200)}`);

  const buffer = url.startsWith("data:")
    ? Buffer.from(url.slice(url.indexOf(",") + 1), "base64")
    : await download(url, fetchFn);

  const costUsd = data.usage && typeof data.usage.cost === "number" ? data.usage.cost : (MODEL_COST_USD[model] || 0);
  return { buffer, costUsd, model };
}

async function minimaxOnce({ prompt, refs, size, fetchFn }) {
  const body = {
    model: "image-01",
    prompt: prompt.slice(0, 1500),
    aspect_ratio: size,
    response_format: "url",
    n: 1,
  };
  if (refs.length) {
    body.subject_reference = [{ type: "character", image_file: toDataUri(refs[0]) }];
  }
  const res = await fetchFn(`${env.MINIMAX_BASE_URL || "https://api.minimax.io/v1"}/image_generation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MINIMAX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const url = data.data && data.data.image_urls && data.data.image_urls[0];
  if (!url) {
    const msg = JSON.stringify(data.base_resp || data).slice(0, 300);
    if (BLOCKED_RE.test(msg)) throw new ImageBlockedError(msg);
    throw new ImageError(`minimax: ${msg}`, { status: res.status });
  }
  return { buffer: await download(url, fetchFn), costUsd: MODEL_COST_USD["image-01"], model: "image-01" };
}

// --- local cache -------------------------------------------------------------
//
// Off unless IMAGE_CACHE_DIR is set, so it never exists in production. It is
// for the bench: an end-to-end run of the full book is 14 images (~0,48 $), and
// re-running it to check a PDF change should not pay for them again.

function cacheKey({ prompt, refs = [], size = "1:1", provider, models, style = true }) {
  const h = crypto.createHash("sha256");
  h.update(JSON.stringify([prompt, size, style, provider || env.IMAGE_PROVIDER || "", models || env.OPENROUTER_IMAGE_MODEL || ""]));
  for (const ref of refs) h.update(crypto.createHash("sha256").update(ref).digest());
  return h.digest("hex").slice(0, 32);
}

function cachePath(args) {
  const dir = env.IMAGE_CACHE_DIR;
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${cacheKey(args)}.png`);
}

function readCache(args) {
  const file = cachePath(args);
  if (!file || !fs.existsSync(file)) return null;
  console.log(`[cuentos] image from cache ${path.basename(file)}`);
  return { buffer: fs.readFileSync(file), costUsd: 0, model: "cache", cached: true };
}

function writeCache(args, out) {
  const file = cachePath(args);
  if (file && out && out.buffer) fs.writeFileSync(file, out.buffer);
}

// --- public API --------------------------------------------------------------

/**
 * Generates one image. Tries the primary model, then each fallback model,
 * each with one retry on transient errors. Blocked content is never retried:
 * it is a verdict, and it propagates so the caller can fall back to the
 * catalogue and flag the order.
 */
async function generateImage(args, deps = {}) {
  const startedAt = Date.now();
  const cached = readCache(args);
  if (cached) {
    meter.record("image", 0, { model: "cache", ms: Date.now() - startedAt, label: args.label || "", cached: true });
    return cached;
  }
  const out = await generateImageUncached(args, deps);
  // The vision judge goes through completeJson, which llm.js already meters as
  // text — recording it here as well would count it twice.
  meter.record("image", out.costUsd || 0, { model: out.model || "", ms: Date.now() - startedAt, label: args.label || "" });
  writeCache(args, out);
  return out;
}

async function generateImageUncached({ prompt, refs = [], size = "1:1", provider, models, style = true }, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const which = provider || env.IMAGE_PROVIDER || "openrouter";
  // Line art asks for the opposite of the collection style (no colour, no
  // paper texture): appending the suffix there fights the prompt.
  const styled = style ? withStyle(prompt) : prompt;

  if (which === "minimax") {
    return attempt(() => minimaxOnce({ prompt: styled, refs, size, fetchFn }), deps);
  }
  if (which !== "openrouter") throw new ImageError(`unknown image provider "${which}"`);

  const chain = models || [
    env.OPENROUTER_IMAGE_MODEL || DEFAULT_MODEL,
    ...(env.IMAGE_FALLBACK_MODELS ? env.IMAGE_FALLBACK_MODELS.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_FALLBACKS),
  ];

  let lastError;
  for (const model of chain) {
    try {
      const out = await attempt(() => openrouterOnce({ model, prompt: styled, refs, size, fetchFn }), deps);
      return { ...out, provider: "openrouter" };
    } catch (e) {
      if (e instanceof ImageBlockedError) throw e;
      // Another model on the same account is refused for the same reason.
      if (e instanceof OutOfCreditError) throw e;
      lastError = e;
      console.warn(`[cuentos] image model ${model} failed (${e.message.slice(0, 120)}), trying next`);
    }
  }
  throw lastError;
}

async function attempt(fn, deps) {
  const delay = deps.retryDelayMs != null ? deps.retryDelayMs : 1500;
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ImageBlockedError) throw e;
    if (e instanceof OutOfCreditError) throw e; // waiting 1.5 s does not buy credit
    if (delay) await new Promise((r) => setTimeout(r, delay));
    return fn();
  }
}

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["same_character", "style_matches", "issues"],
  properties: {
    same_character: { type: "boolean" },
    style_matches: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
  },
};

/**
 * Asks a cheap vision model whether a page shows the same character as the
 * sheet, in the same style. Fail-open on infrastructure errors (returns
 * ok with a note) — a page is never rejected because the judge was down;
 * the human review catches the rare bad one.
 */
async function verifyPage(sheet, page, deps = {}) {
  const complete = deps.completeJson || llm.completeJson;
  try {
    const { data } = await complete({
      model: env.VERIFY_MODEL || "google/gemini-2.5-flash-lite",
      maxTokens: 300,
      schema: VERIFY_SCHEMA,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "First image: a character reference sheet. Second image: a storybook page. " +
                "Answer strictly: same_character = is the child on the page clearly the same child as on the sheet " +
                "(hair colour and shape, glasses, skin tone, outfit colours)? style_matches = is the page drawn in the " +
                "same soft watercolour illustration style as the sheet (not 3D, not vector, not photo-real)? " +
                "List concrete issues if any.",
            },
            { type: "image_url", image_url: { url: toDataUri(sheet) } },
            { type: "image_url", image_url: { url: toDataUri(page) } },
          ],
        },
      ],
    });
    return {
      ok: Boolean(data.same_character && data.style_matches),
      sameCharacter: Boolean(data.same_character),
      styleMatches: Boolean(data.style_matches),
      issues: data.issues || [],
    };
  } catch (e) {
    console.warn(`[cuentos] page verification unavailable: ${e.message}`);
    return { ok: true, sameCharacter: true, styleMatches: true, issues: [`verifier unavailable: ${e.message}`], unverified: true };
  }
}

module.exports = {
  OutOfCreditError,
  generateImage,
  verifyPage,
  withStyle,
  ImageBlockedError,
  ImageError,
  DEFAULT_MODEL,
  MODEL_COST_USD,
};
