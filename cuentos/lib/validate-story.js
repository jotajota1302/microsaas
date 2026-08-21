/*
 * The single gate between the model and the product.
 *
 * Nothing reaches a PDF, an email or a printing press without passing here.
 * validateStory() never throws and never stops at the first problem: it
 * returns every error as a plain sentence, because those sentences are fed
 * back to the model verbatim on the retry.
 */

const SCHEMA = require("../schema/story.schema.json");
const C = require("./collection.js");

// --- text helpers ------------------------------------------------------------

/** lowercase, accent-free, for blocklist matching. */
function normalise(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function countWords(text) {
  const t = String(text).trim();
  return t ? t.split(/\s+/).length : 0;
}

function stripPlaceholders(text) {
  return String(text).replace(/\{\{[A-Z_]+\}\}/g, "");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- generic JSON Schema check (only the keywords our schema uses) -----------

function checkSchema(value, schema, path, errors) {
  const label = path || "story";

  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      errors.push(`${label} must be one of: ${schema.enum.join(", ")}`);
    }
    return;
  }

  // Union types such as ["string", "null"]: accept null, otherwise check the
  // first non-null type.
  if (Array.isArray(schema.type)) {
    if (value === null && schema.type.includes("null")) return;
    const concrete = schema.type.find((t) => t !== "null");
    return checkSchema(value, { ...schema, type: concrete }, path, errors);
  }

  switch (schema.type) {
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${label} must be an object`);
        return;
      }
      for (const key of schema.required || []) {
        if (!(key in value)) errors.push(`${label === "story" ? "" : label + "."}field "${key}" is required`);
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!schema.properties || !(key in schema.properties)) {
            errors.push(`${label === "story" ? "" : label + "."}field "${key}" is not allowed`);
          }
        }
      }
      for (const [key, sub] of Object.entries(schema.properties || {})) {
        if (key in value) checkSchema(value[key], sub, path ? `${path}.${key}` : key, errors);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        errors.push(`${label} must be an array`);
        return;
      }
      if (schema.minItems != null && value.length < schema.minItems) {
        errors.push(`${label} must have at least ${schema.minItems} items, has ${value.length}`);
      }
      if (schema.maxItems != null && value.length > schema.maxItems) {
        errors.push(`${label} must have at most ${schema.maxItems} items, has ${value.length}`);
      }
      if (schema.items) {
        value.forEach((item, i) => checkSchema(item, schema.items, `${label}[${i}]`, errors));
      }
      return;
    }
    case "string": {
      if (typeof value !== "string") {
        errors.push(`${label} must be a string`);
        return;
      }
      if (schema.minLength != null && value.length < schema.minLength) {
        errors.push(`${label} must be at least ${schema.minLength} characters, has ${value.length}`);
      }
      if (schema.maxLength != null && value.length > schema.maxLength) {
        errors.push(`${label} must be at most ${schema.maxLength} characters, has ${value.length}`);
      }
      return;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push(`${label} must be an integer`);
        return;
      }
      if (schema.minimum != null && value < schema.minimum) {
        errors.push(`${label} must be at least ${schema.minimum}`);
      }
      if (schema.maximum != null && value > schema.maximum) {
        errors.push(`${label} must be at most ${schema.maximum}`);
      }
      return;
    }
    default:
      // No type declared: nothing to check beyond enum, handled above.
      return;
  }
}

// --- domain rules ------------------------------------------------------------

const PLACEHOLDER_MIN_PAGES = 6;
const PERSON_MIN_PAGES = 2;

/** The markers a story may use, given how many people were declared. */
function allowedPlaceholders(people) {
  const out = ["{{NOMBRE}}"];
  for (let i = 1; i <= (people || 0); i++) out.push(`{{PERSONA${i}}}`);
  return out;
}

// Characters that legitimately precede a capital letter without it being a
// proper name: sentence ends, dialogue dashes, quotes and Spanish openers.
const SENTENCE_OPENERS = ".!?…:;—–-«»\"'“”‘’¿¡()[]\n\r";

const IMAGE_TEXT_WORDS = /\b(sign|signage|signpost|text|reads|reading|letters?|words?|poster|banner|label|written|writing|caption|title)\b/i;

const PREACHY_PATTERNS = [
  /^la moraleja\b/i,
  /^y la moraleja\b/i,
  /\baprendi[oó] que deb[ií]a\b/i,
  /\bnunca debemos\b/i,
  /\bsiempre hay que\b/i,
  /\bdebemos obedecer\b/i,
  /\bhay que obedecer siempre\b/i,
  /\bla lecci[oó]n es\b/i,
];

function blocklistHits(text) {
  const hay = normalise(text);
  const hits = [];
  for (const word of C.BLOCKLIST) {
    const needle = normalise(word);
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(needle)}([^a-z0-9]|$)`);
    if (re.test(hay)) hits.push(word);
  }
  return hits;
}

/** Capitalised words that are not at the start of a sentence: invented names. */
function inventedNames(text) {
  const clean = stripPlaceholders(text);
  const found = [];
  const re = /[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    let i = m.index - 1;
    while (i >= 0 && /\s/.test(clean[i])) i--;
    const isSentenceStart = i < 0 || SENTENCE_OPENERS.includes(clean[i]);
    if (isSentenceStart) continue;
    if (C.NAME_WHITELIST.includes(m[0])) continue;
    if (!found.includes(m[0])) found.push(m[0]);
  }
  return found;
}

function sentences(text) {
  return String(text)
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.replace(/^[—–\-«"“'‘¿¡\s]+/, "").trim())
    .filter(Boolean);
}

function checkPlaceholders(story, errors, options) {
  const pages = Array.isArray(story.pages) ? story.pages : [];
  const allowed = allowedPlaceholders(options.people);
  const pagesWith = Object.fromEntries(allowed.map((m) => [m, 0]));

  const scan = (text, where) => {
    const re = /\{\{[^}]*\}\}/g;
    let m;
    while ((m = re.exec(String(text))) !== null) {
      if (!allowed.includes(m[0])) {
        errors.push(`${where}: unknown placeholder ${m[0]} (only ${allowed.join(", ")} allowed)`);
      }
    }
  };

  scan(story.title, "title");
  scan(story.dedication_hint, "dedication_hint");

  pages.forEach((page, i) => {
    if (!page || typeof page.text !== "string") return;
    scan(page.text, `page ${i + 1}`);
    for (const marker of allowed) if (page.text.includes(marker)) pagesWith[marker]++;
  });

  if (!pages.length) return;
  if (pagesWith["{{NOMBRE}}"] < PLACEHOLDER_MIN_PAGES) {
    errors.push(`{{NOMBRE}} must appear on at least ${PLACEHOLDER_MIN_PAGES} pages, found on ${pagesWith["{{NOMBRE}}"]}`);
  }
  for (const marker of allowed.slice(1)) {
    if (pagesWith[marker] < PERSON_MIN_PAGES) {
      errors.push(`${marker} was declared and must appear on at least ${PERSON_MIN_PAGES} pages with a real role, found on ${pagesWith[marker]}`);
    }
  }

  // Everyone who appears must be pinned to a look. The protagonist was
  // consistent across pages because the sheet described them; the grandmother
  // was re-invented in every scene because nothing described her.
  const declared = Number(options.people) || 0;
  const described = (story.character_sheet && Array.isArray(story.character_sheet.people))
    ? story.character_sheet.people.filter((d) => typeof d === "string" && d.trim())
    : [];
  if (described.length !== declared) {
    errors.push(
      `character_sheet.people must describe exactly the ${declared} declared person(s), got ${described.length} — ` +
      `without a description nobody can draw them the same way twice`
    );
  }
}

function checkStructure(story, errors) {
  const pages = story.pages;
  if (!Array.isArray(pages)) return;

  if (pages.length !== C.PAGE_COUNT) {
    errors.push(`story must have exactly ${C.PAGE_COUNT} pages, got ${pages.length}`);
  }

  const numbers = pages.map((p) => (p && typeof p.n === "number" ? p.n : null));
  const expected = pages.map((_, i) => i + 1);
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    errors.push(`pages must be numbered 1 to ${pages.length} in order, got ${numbers.join(", ")}`);
  }

  pages.forEach((page, i) => {
    if (!page || typeof page.text !== "string") return;
    const words = countWords(page.text);
    if (words < C.WORDS_MIN || words > C.WORDS_MAX) {
      errors.push(`page ${i + 1}: ${words} words, must be between ${C.WORDS_MIN} and ${C.WORDS_MAX} words`);
    }
  });

  const beats = pages.map((p) => (p && typeof p.beat === "string" ? p.beat : null));
  if (beats.length) {
    if (beats[0] !== C.BEAT_RULES.firstPage) {
      errors.push(`first page must have beat "${C.BEAT_RULES.firstPage}", got "${beats[0]}"`);
    }
    if (beats[beats.length - 1] !== C.BEAT_RULES.lastPage) {
      errors.push(`last page must have beat "${C.BEAT_RULES.lastPage}", got "${beats[beats.length - 1]}"`);
    }
    const attempts = beats.filter((b) => b === "attempt").length;
    if (attempts < C.BEAT_RULES.minAttempts) {
      errors.push(`story must have at least ${C.BEAT_RULES.minAttempts} pages with beat "attempt", got ${attempts}`);
    }
    const problems = beats.filter((b) => b === "problem").length;
    if (problems < C.BEAT_RULES.minProblems) {
      errors.push(`story must have at least ${C.BEAT_RULES.minProblems} page with beat "problem", got ${problems}`);
    }
  }
}

function checkContent(story, errors) {
  for (const field of ["title", "dedication_hint", "moral"]) {
    if (typeof story[field] !== "string") continue;
    for (const word of blocklistHits(story[field])) {
      errors.push(`${field}: blocklisted word "${word}" — this is a story for 3-8 year olds`);
    }
  }

  const pages = Array.isArray(story.pages) ? story.pages : [];
  pages.forEach((page, i) => {
    if (!page || typeof page !== "object") return;
    const where = `page ${i + 1}`;

    if (typeof page.text === "string") {
      for (const word of blocklistHits(page.text)) {
        errors.push(`${where}: blocklisted word "${word}" — this is a story for 3-8 year olds`);
      }
      for (const name of inventedNames(page.text)) {
        errors.push(`${where}: invented proper name "${name}" — use {{NOMBRE}} or a description, never a made-up name`);
      }
      for (const sentence of sentences(page.text)) {
        if (PREACHY_PATTERNS.some((re) => re.test(sentence))) {
          errors.push(`${where}: preachy moral ("${sentence.slice(0, 40)}...") — the lesson must be shown, never stated`);
          break;
        }
      }
    }

    if (typeof page.image_hint === "string") {
      const words = countWords(page.image_hint);
      if (words > 30) {
        errors.push(`${where}: image_hint has ${words} words, max 30 words`);
      }
      const match = page.image_hint.match(IMAGE_TEXT_WORDS);
      if (match) {
        errors.push(`${where}: image_hint asks for text in image ("${match[0]}") — the model cannot write, describe the picture only`);
      }
    }
  });

  const hints = Array.isArray(story.coloring_hints) ? story.coloring_hints : [];
  hints.forEach((hint, i) => {
    if (typeof hint !== "string") return;
    const match = hint.match(IMAGE_TEXT_WORDS);
    if (match) {
      errors.push(`coloring_hints[${i}]: asks for text in image ("${match[0]}")`);
    }
  });
}

// --- public API --------------------------------------------------------------

/**
 * @param {object} story
 * @param {object} [options]  { people: number } — how many {{PERSONAn}} were declared (0-2)
 */
function validateStory(story, options = {}) {
  const errors = [];
  try {
    if (story === null || typeof story !== "object" || Array.isArray(story)) {
      return { ok: false, errors: ["story must be an object"] };
    }
    checkSchema(story, SCHEMA, "", errors);
    checkStructure(story, errors);
    checkPlaceholders(story, errors, { people: Number(options.people) || 0 });
    checkContent(story, errors);
  } catch (e) {
    errors.push(`validator crashed: ${e.message}`);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { validateStory, allowedPlaceholders, normalise, countWords, blocklistHits, inventedNames };
