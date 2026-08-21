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
const PERSON_AGE_IDS = ids(C.PERSON_AGES);
const ADULT_RELATIONS = new Set(C.RELATIONS.filter((r) => r.adult).map((r) => r.id));
const MAX_NOTES = 300;
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
        // An adult has no age band: offering one is the form contradicting
        // itself, and the prompt would repeat the contradiction.
        const age = (x && x.ageBand) || null;
        if (age != null && ADULT_RELATIONS.has(x.relation)) errors.push(`people[${i}].ageBand: adults are not given an age`);
        else if (age != null && !PERSON_AGE_IDS.has(age)) errors.push(`people[${i}].ageBand: not one of the allowed options`);
        people.push({ name: pname, relation: x && x.relation, ageBand: ADULT_RELATIONS.has(x && x.relation) ? null : age });
      });
    }
  }

  const dedication = p.dedication == null ? "" : String(p.dedication).trim();

  // One free line for whatever the closed lists could not hold ("le da miedo
  // el ascensor"). Bounded here, moderated like the dedication afterwards.
  const notes = p.notes == null ? "" : String(p.notes).trim();
  if (notes.length > MAX_NOTES) errors.push(`notes: at most ${MAX_NOTES} characters`);

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
      notes,
      dedication,
      locale,
    },
  };
}

module.exports = { validateOrderInput, REQUIRED };
