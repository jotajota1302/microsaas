/*
 * Text model behind a switch, like cuentos/lib/llm.js: TEXT_PROVIDER decides,
 * nothing else in the codebase knows who answers.
 *
 * Two things learnt the hard way in cuentos and re-applied here:
 *
 *   - MiniMax does NOT honour response_format with a JSON schema. It guesses
 *     field names and fails 100 % of the time unless the exact shape of the
 *     JSON is written into the prompt. So callers pass `shape`, always.
 *   - M3 returns its reasoning inside <think>...</think> before the JSON, and
 *     with thinking disabled it produces sloppier JSON: unescaped quotes,
 *     control characters, trailing commas. repairJson handles those instead of
 *     throwing away a whole generation over one apostrophe.
 */

const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const PROVIDER = process.env.TEXT_PROVIDER || "minimax";

class LlmError extends Error {}

async function callMiniMax({ system, user, maxTokens }) {
  const res = await fetch(`${process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1"}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.MINIMAX_MODEL || "MiniMax-M3",
      // Measured in the RPG: with reasoning on, M3 takes 200+ s and blows past
      // any serverless timeout. Disabled it is ~55 s and the JSON is worse,
      // which is what repairJson and the validator are for.
      thinking: { type: "disabled" },
      max_tokens: maxTokens || 8000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await res.json();
  const choice = data.choices && data.choices[0];
  if (!choice) throw new LlmError(JSON.stringify(data.base_resp || data).slice(0, 300));
  return choice.message.content || "";
}

async function callOpenRouter({ system, user, maxTokens, model }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || process.env.TEXT_MODEL || "google/gemini-2.5-flash-lite",
      max_tokens: maxTokens || 8000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await res.json();
  const choice = data.choices && data.choices[0];
  if (!choice) throw new LlmError(JSON.stringify(data.error || data).slice(0, 300));
  return choice.message.content || "";
}

/** Strips M3's reasoning block and any markdown fence around the JSON. */
function extractJson(text) {
  let out = String(text).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = out.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) out = fence[1].trim();
  const start = out.search(/[{[]/);
  if (start > 0) out = out.slice(start);
  const lastBrace = Math.max(out.lastIndexOf("}"), out.lastIndexOf("]"));
  if (lastBrace >= 0) out = out.slice(0, lastBrace + 1);
  return out.trim();
}

/**
 * Fixes what a model with reasoning disabled actually gets wrong: raw control
 * characters inside strings and trailing commas. Deliberately conservative —
 * this repairs syntax, it never invents content.
 */
function repairJson(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === "\\") { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString && ch === "\n") { out += "\\n"; continue; }
    if (inString && ch === "\t") { out += "\\t"; continue; }
    if (inString && ch === "\r") { continue; }
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}

/**
 * One call that must return JSON. `shape` is the literal example of the object
 * we want — not a schema, an example — because that is what actually works with
 * a provider that ignores response_format.
 *
 * Retries parse failures once with the broken output shown back to the model:
 * cheaper than regenerating from scratch and it usually lands.
 */
/*
 * Which provider answers. Callers pass `provider: "critic"` for anything that
 * JUDGES rather than writes.
 *
 * A model marking its own homework is a weak reviewer: on 2026-08-22 the writer
 * and the critic were the same model in both A/B runs, and the scores are worth
 * less for it. CRITIC_PROVIDER defaults to the other one of the two we have, so
 * the editor is never the author's twin.
 */
const CRITIC_PROVIDER =
  process.env.CRITIC_PROVIDER || (PROVIDER === "minimax" ? "openrouter" : "minimax");

/*
 * The editor gets its own, better model. Judging is four short calls per comic
 * against a few thousand tokens, so a stronger model here costs well under a
 * cent — and the whole point of the second pass is that the judgement is worth
 * something. Writing stays on the cheap model, where the volume is.
 */
const CRITIC_MODEL = process.env.CRITIC_MODEL || "openai/gpt-5-mini";

function pick(role) {
  const isCritic = role === "critic";
  const name = isCritic ? CRITIC_PROVIDER : PROVIDER;
  return {
    name,
    model: isCritic && name === "openrouter" ? CRITIC_MODEL : undefined,
    call: name === "openrouter" ? callOpenRouter : callMiniMax,
  };
}

async function completeJson({ system, user, shape, maxTokens, attempts = 2, provider }) {
  const { call, model } = pick(provider);
  const framed =
    `${user}\n\n` +
    `Devuelve ÚNICAMENTE un objeto JSON válido con exactamente esta forma, sin texto antes ni después, ` +
    `sin markdown y sin comentarios:\n${shape}`;

  let lastError;
  let lastRaw = "";
  for (let i = 0; i < attempts; i++) {
    const prompt = i === 0
      ? framed
      : `${framed}\n\nTu respuesta anterior no era JSON válido (${lastError}). Devuélvela corregida, solo el JSON.`;
    const started = Date.now();
    const raw = await call({ system, user: prompt, maxTokens, model });
    lastRaw = raw;
    try {
      const json = JSON.parse(repairJson(extractJson(raw)));
      return { json, ms: Date.now() - started, raw };
    } catch (e) {
      lastError = e.message.slice(0, 120);
    }
  }
  throw new LlmError(`JSON inválido tras ${attempts} intentos: ${lastError}\n${lastRaw.slice(0, 400)}`);
}

module.exports = { completeJson, extractJson, repairJson, LlmError, PROVIDER, CRITIC_PROVIDER, CRITIC_MODEL };
