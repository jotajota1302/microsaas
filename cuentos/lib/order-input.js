/*
 * Validates what the order form sends. Closed fields must match the
 * collection's ids exactly; free text is bounded here and judged by
 * lib/moderation.js afterwards.
 */

const C = require("./collection.js");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ids = (list) => new Set(list.map((x) => x.id));

const CLOSED = {
  gender: ids(C.GENDERS),
  ageBand: ids(C.AGE_BANDS),
  hairColor: ids(C.HAIR_COLORS),
  hairType: ids(C.HAIR_TYPES),
  skin: ids(C.SKIN_TONES),
  pet: ids(C.PETS),
  hobby: ids(C.HOBBIES),
  theme: ids(C.THEMES),
  moment: ids(C.MOMENTS),
  tone: ids(C.TONES),
};
const RELATION_IDS = ids(C.RELATIONS);
const REQUIRED = ["gender", "ageBand", "hairColor", "hairType", "skin", "hobby", "theme", "moment", "tone"];

function validateOrderInput(body) {
  const errors = [];
  const b = body || {};
  const p = b.personalization || {};

  const email = String(b.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) errors.push("email: invalid");

  const locale = b.locale === "en" ? "en" : "es";

  const name = String(p.name || "").trim();
  if (!name) errors.push("name: required");

  for (const field of REQUIRED) {
    if (!CLOSED[field].has(p[field])) errors.push(`${field}: not one of the allowed options`);
  }
  if (p.pet != null && !CLOSED.pet.has(p.pet)) errors.push("pet: not one of the allowed options");

  const people = [];
  if (p.people != null) {
    if (!Array.isArray(p.people)) errors.push("people: must be a list");
    else {
      if (p.people.length > C.MAX_PEOPLE) errors.push(`people: at most ${C.MAX_PEOPLE}`);
      p.people.slice(0, C.MAX_PEOPLE).forEach((x, i) => {
        const pname = String((x && x.name) || "").trim();
        if (!pname) errors.push(`people[${i}].name: required`);
        if (!x || !RELATION_IDS.has(x.relation)) errors.push(`people[${i}].relation: not one of the allowed options`);
        if (x && x.ageBand != null && !CLOSED.ageBand.has(x.ageBand)) errors.push(`people[${i}].ageBand: not one of the allowed options`);
        people.push({ name: pname, relation: x && x.relation, ageBand: (x && x.ageBand) || null });
      });
    }
  }

  const dedication = p.dedication == null ? "" : String(p.dedication).trim();

  return {
    ok: errors.length === 0,
    errors,
    email,
    locale,
    personalization: {
      name,
      gender: p.gender,
      ageBand: p.ageBand,
      hairColor: p.hairColor,
      hairType: p.hairType,
      skin: p.skin,
      glasses: Boolean(p.glasses),
      pet: p.pet || "ninguna",
      hobby: p.hobby,
      theme: p.theme,
      moment: p.moment,
      tone: p.tone,
      people,
      dedication,
      locale,
    },
  };
}

module.exports = { validateOrderInput, REQUIRED };
