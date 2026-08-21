/*
 * Two gates around the generator.
 *
 * checkInput  - runs BEFORE charging. Cheap local rules first (length, URLs,
 *               emails, digits, blocklist); only ambiguous input reaches a
 *               model. Fail-OPEN if the model is down: never lose a sale to
 *               infrastructure, but flag the order for review.
 * reviewStory - runs AFTER generating, before rendering. Fail-CLOSED: if the
 *               model is down we would rather have a human look than print
 *               something we have not read.
 */

const C = require("./collection.js");
const { completeJson } = require("./llm.js");
const { normalise } = require("./validate-story.js");

const MAX_NAME_LENGTH = 30;
const MAX_DEDICATION_LENGTH = 140;
const MAX_NOTES_LENGTH = 300;

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|es|io|ai|co)\b)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /\b(?:\+?\d[\d\s.-]{7,}\d)\b/;

const INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["safe", "reason"],
  properties: {
    safe: { type: "boolean" },
    reason: { type: "string" },
  },
};

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["safe", "issues"],
  properties: {
    safe: { type: "boolean" },
    issues: { type: "array", items: { type: "string" } },
  },
};

function localNameProblem(value, field) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > MAX_NAME_LENGTH) return `${field} is longer than ${MAX_NAME_LENGTH} characters`;
  if (/\d/.test(text)) return `${field} contains digits`;
  if (URL_RE.test(text)) return `${field} contains a web address`;
  if (EMAIL_RE.test(text)) return `${field} contains an email address`;
  if (/[<>{}[\]|\\^~`]/.test(text)) return `${field} contains characters that do not belong in a name`;
  const hits = blocklisted(text);
  if (hits.length) return `${field} contains a blocked word: ${hits[0]}`;
  return null;
}

function blocklisted(text) {
  const hay = normalise(text);
  return C.BLOCKLIST.filter((word) => {
    const needle = normalise(word);
    return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(hay);
  });
}

/**
 * Runs before charging. Returns { ok, reason, needsReview }.
 * needsReview is true when we let it through without a model verdict.
 */
async function checkInput({ name, companionName, people, dedication, notes }, deps = {}) {
  const complete = deps.completeJson || completeJson;

  if (!name || !String(name).trim()) {
    return { ok: false, reason: "name is required", needsReview: false };
  }

  const named = [[name, "name"], [companionName, "companion name"]];
  (Array.isArray(people) ? people : []).forEach((p, i) => named.push([p && p.name, `person ${i + 1} name`]));
  for (const [value, field] of named) {
    const problem = localNameProblem(value, field);
    if (problem) return { ok: false, reason: problem, needsReview: false };
  }

  // Every free-text field gets the same cheap rules. The note is as free as
  // the dedication, so treating it more gently would just be the way round
  // the filter.
  const free = [
    { field: "dedication", value: dedication, max: MAX_DEDICATION_LENGTH },
    { field: "notes", value: notes, max: MAX_NOTES_LENGTH },
  ].filter((f) => f.value && String(f.value).trim());

  for (const { field, value, max } of free) {
    const text = String(value).trim();
    if (text.length > max) {
      return { ok: false, reason: `${field} is longer than ${max} characters`, needsReview: false };
    }
    if (URL_RE.test(text) || EMAIL_RE.test(text) || PHONE_RE.test(text)) {
      return { ok: false, reason: `${field} contains contact details`, needsReview: false };
    }
    const hits = blocklisted(text);
    if (hits.length) {
      return { ok: false, reason: `${field} contains a blocked word: ${hits[0]}`, needsReview: false };
    }
  }

  // Nothing obvious. Only free text is worth a model call: names alone have
  // already passed every cheap rule.
  if (!free.length) {
    return { ok: true, needsReview: false };
  }

  try {
    const { data } = await complete({
      schema: INPUT_SCHEMA,
      maxTokens: 200,
      messages: [
        {
          role: "system",
          content:
            "Eres un filtro de contenido para un producto infantil. Recibes texto escrito por un adulto (una dedicatoria " +
            "y/o una nota sobre el niño) que se usará en un cuento para un niño de 3 a 8 años. " +
            "Responde safe:false si contiene insultos, contenido sexual, odio, violencia, drogas, política, religión, " +
            "publicidad, datos de contacto, o cualquier cosa que no querrías ver impresa en un libro infantil. " +
            "Un texto cariñoso, familiar, gracioso o un rasgo del niño («le da miedo el ascensor») es safe:true. Ante la duda razonable, safe:true.",
        },
        { role: "user", content: free.map((f) => `${f.field === "notes" ? "Nota del adulto sobre el niño" : "Dedicatoria"}: «${String(f.value).trim()}»`).join("\n") },
      ],
    });
    if (data && data.safe === false) {
      return { ok: false, reason: data.reason || "the dedication was rejected", needsReview: false };
    }
    return { ok: true, needsReview: false };
  } catch (e) {
    // Fail open: a sale is not lost because a model timed out, but a human
    // sees this order before anything is printed.
    console.warn(`[cuentos] input moderation unavailable, flagging for review: ${e.message}`);
    return { ok: true, needsReview: true };
  }
}

/**
 * Runs after generation, before rendering. Returns { ok, issues }.
 * Fail-closed: an unavailable model means a human must look.
 */
async function reviewStory(story, deps = {}) {
  const complete = deps.completeJson || completeJson;
  const text = (story.pages || []).map((p, i) => `${i + 1}. ${p.text}`).join("\n");

  try {
    const { data } = await complete({
      schema: REVIEW_SCHEMA,
      maxTokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Eres el revisor final de un cuento que se va a imprimir para un niño de 3 a 8 años. " +
            "Marca safe:false y explica en issues si encuentras: violencia, muerte, miedo intenso, crueldad, " +
            "contenido sexual, drogas, estereotipos ofensivos, marcas registradas, personajes con derechos de autor, " +
            "un final angustioso, o un sermón moralizante. También si el cuento no tiene sentido, se contradice, " +
            "o el protagonista no resuelve nada por sí mismo. Un cuento tierno y coherente es safe:true con issues vacío.",
        },
        { role: "user", content: text },
      ],
    });
    if (!data || typeof data.safe !== "boolean") {
      return { ok: false, issues: ["the reviewer returned an unusable verdict"] };
    }
    return { ok: data.safe, issues: data.issues || [] };
  } catch (e) {
    console.warn(`[cuentos] story review unavailable, sending to human review: ${e.message}`);
    return { ok: false, issues: [`reviewer unavailable: ${e.message}`] };
  }
}

module.exports = {
  checkInput,
  reviewStory,
  blocklisted,
  localNameProblem,
  MAX_NAME_LENGTH,
  MAX_DEDICATION_LENGTH,
};
