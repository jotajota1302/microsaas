/*
 * Server-side validation of an order.
 *
 * The form in assets/js/app.js checks the same things, and that check is a
 * courtesy: anybody can POST whatever they like to /api/preview. Every value
 * that reaches the pipeline is verified against lib/catalog.js here, on the
 * server, because the catalogue is the only thing that decides what the
 * generator has been designed for.
 *
 * Also the one place free text enters the product: a first name and, later, a
 * dedication. Both go through the blocklist.
 */

const { maskOrder } = require("./names.js");
const C = require("./catalog.js");
const { blocklisted, normalise } = require("./validate-story.js");

const MAX_NAME = 20;
const NAME_RE = /^[\p{L}][\p{L}\s'’.-]{1,19}$/u;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,20}$/;

/** A field that must be one of the catalogue's keys. */
function inCatalog(value, table, field, errors) {
  if (!Object.prototype.hasOwnProperty.call(table, value)) {
    errors.push(`${field} no es válido`);
    return null;
  }
  return value;
}

/**
 * A person's first name. Rejects digits, URLs, anything that is not a name, and
 * anything on the blocklist — somebody will type the name of their favourite
 * series in here, and that name must never reach a prompt or a listing.
 */
function cleanName(raw, field, errors, { required }) {
  const value = String(raw == null ? "" : raw).trim().replace(/\s+/g, " ");
  if (!value) {
    if (required) errors.push(`falta ${field}`);
    return null;
  }
  if (value.length > MAX_NAME) { errors.push(`${field} es demasiado largo`); return null; }
  if (!NAME_RE.test(value)) { errors.push(`${field} no parece un nombre`); return null; }
  const hits = blocklisted(value);
  if (hits.length) { errors.push(`${field} no se puede usar`); return null; }
  return value;
}

/**
 * @returns {{ ok: boolean, errors: string[], order: object|null }}
 * `order` is a fresh object built field by field — never the request body, so
 * nothing the client sent can ride along into the pipeline.
 */
function parseOrder(body) {
  const errors = [];
  const b = body && typeof body === "object" ? body : {};

  const name = cleanName(b.name, "el nombre", errors, { required: true });
  const email = String(b.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) errors.push("el correo no es válido");

  const ageBand = inCatalog(b.ageBand, C.AGE_BANDS, "la edad", errors);
  const gender = b.gender === "f" || b.gender === "m" ? b.gender : (errors.push("el género no es válido"), null);

  const appearance = {
    hairShape: inCatalog(b.hairShape, C.HAIR_SHAPE, "el pelo", errors),
    hairColour: inCatalog(b.hairColour, C.HAIR_COLOUR, "el color de pelo", errors),
    eyes: inCatalog(b.eyes, C.EYES, "los ojos", errors),
    skin: inCatalog(b.skin, C.SKIN, "la piel", errors),
    build: inCatalog(b.build, C.BUILD, "la complexión", errors),
    mark: inCatalog(b.mark, C.MARKS, "lo que siempre lleva", errors),
  };

  const trait = inCatalog(b.trait, C.TRAITS, "el rasgo", errors);
  const trope = inCatalog(b.trope, C.TROPES, "el mundo", errors);
  const tone = inCatalog(b.tone, C.TONES, "el tono", errors);
  const style = inCatalog(b.style, C.STYLES, "el estilo", errors);

  // The sidekick is optional, but half a sidekick is not: a name with no
  // relation would reach the writer as "someone", which is worse than nobody.
  let sidekick = null;
  const sideName = b.sidekick && b.sidekick.name;
  const sideRel = b.sidekick && b.sidekick.relation;
  if (sideName || sideRel) {
    const n = cleanName(sideName, "el nombre del acompañante", errors, { required: true });
    const r = sideRel && Object.prototype.hasOwnProperty.call(C.RELATIONS, sideRel) ? sideRel : null;
    if (!r) errors.push("la relación del acompañante no es válida");
    if (n && r) sidekick = { name: n, relation: r };
  }

  if (name && sidekick && normalise(name) === normalise(sidekick.name)) {
    errors.push("el acompañante no puede llamarse igual que el protagonista");
  }

  if (errors.length) return { ok: false, errors, order: null };

  // Age inside the band, so the prompts have a number without asking for a
  // birth date we do not need and would have to protect.
  /*
   * Una edad concreta por banda, para el dibujo. Se coge el extremo alto: es
   * menos malo que a alguien de 24 lo dibujen de 24 que de 18.
   */
  const age = { "12-13": 13, "14-15": 15, "16-17": 17, "18-24": 24, "25-30": 30 }[ageBand];

  return {
    ok: true,
    errors: [],
    order: {
      name, age, ageBand, gender, ...appearance,
      trait, trope, tone, style, sidekick,
      lang: b.lang === "en" ? "en" : "es",
      // Kept out of the order that reaches the writer: contact and attribution.
      _email: email,
      _utm: cleanUtm(b.utm),
    },
  };
}

/** UTM values are attacker-controlled strings; they are only ever stored. */
function cleanUtm(utm) {
  if (!utm || typeof utm !== "object") return {};
  const out = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach((k) => {
    const v = utm[k];
    if (typeof v === "string" && v) out[k] = v.slice(0, 60).replace(/[^\w.\-|]/g, "");
  });
  return out;
}

/**
 * What the writer and illustrator see: no email, no tracking, no extras — and
 * NO REAL NAMES.
 *
 * The masking happens here rather than at each prompt builder on purpose. This
 * is the one function every order passes through before it is stored, so from
 * the moment a job exists its `order` already carries {{NOMBRE}}; a prompt
 * builder written next month cannot leak a name it was never given. See
 * lib/names.js for what went wrong when the rule lived in people's heads.
 *
 * @returns {{ order: object, names: Record<string,string> }}
 */
function pipelineOrder(order) {
  const copy = { ...order };
  delete copy._email;
  delete copy._utm;
  return maskOrder(copy);
}

module.exports = { parseOrder, pipelineOrder, cleanName, MAX_NAME };
