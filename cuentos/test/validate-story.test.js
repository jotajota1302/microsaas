const { test } = require("node:test");
const assert = require("node:assert");
const { validateStory } = require("../lib/validate-story.js");
const valid = require("./fixtures/story-valid.json");

const clone = () => JSON.parse(JSON.stringify(valid));
const joined = (story) => validateStory(story).errors.join(" | ");

// --- the reference story -----------------------------------------------------

test("the reference story passes with no errors", () => {
  const r = validateStory(valid);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.ok, true);
});

// --- schema ------------------------------------------------------------------

test("rejects a story that is not an object", () => {
  assert.match(joined(null), /must be an object/);
  assert.match(joined("hello"), /must be an object/);
});

test("rejects a missing required field", () => {
  const s = clone();
  delete s.moral;
  assert.match(joined(s), /moral.*required/i);
});

test("rejects an unknown field instead of ignoring it", () => {
  const s = clone();
  s.audio_url = "https://example.com/a.mp3";
  assert.match(joined(s), /audio_url.*not allowed/i);
});

test("rejects a wrong type", () => {
  const s = clone();
  s.pages[0].n = "1";
  assert.match(joined(s), /pages\[0\]\.n.*integer/i);
});

test("rejects a beat outside the allowed set", () => {
  const s = clone();
  s.pages[4].beat = "climax";
  assert.match(joined(s), /beat.*one of/i);
});

// --- structure ---------------------------------------------------------------

test("rejects a story without exactly 12 pages", () => {
  const s = clone();
  s.pages.pop();
  assert.match(joined(s), /12 pages/);
});

test("rejects out-of-order or duplicated page numbers", () => {
  const s = clone();
  s.pages[3].n = 3;
  assert.match(joined(s), /numbered 1 to 12/);
});

test("rejects a page under 60 words", () => {
  const s = clone();
  s.pages[3].text = "{{NOMBRE}} subió al faro y encendió la luz sin ninguna dificultad, porque era muy lista y ya está.";
  assert.match(joined(s), /page 4:.*words/);
});

test("rejects a page over 90 words", () => {
  const s = clone();
  s.pages[3].text = s.pages[3].text + " " + s.pages[4].text;
  assert.match(joined(s), /page 4:.*words/);
});

test("rejects a story whose first page is not the setup", () => {
  const s = clone();
  s.pages[0].beat = "attempt";
  assert.match(joined(s), /first page.*setup/i);
});

test("rejects a story whose last page is not the resolution", () => {
  const s = clone();
  s.pages[11].beat = "attempt";
  assert.match(joined(s), /last page.*resolution/i);
});

test("rejects a story with fewer than two attempts", () => {
  const s = clone();
  for (const p of s.pages) if (p.beat === "attempt") p.beat = "problem";
  assert.match(joined(s), /at least 2 .*attempt/i);
});

test("rejects a story with no problem beat", () => {
  const s = clone();
  s.pages[1].beat = "attempt";
  assert.match(joined(s), /at least 1 .*problem/i);
});

// --- placeholders and names --------------------------------------------------

test("rejects a story where {{NOMBRE}} appears on fewer than 6 pages", () => {
  const s = clone();
  for (let i = 0; i < 6; i++) {
    s.pages[i].text = s.pages[i].text.replace(/\{\{NOMBRE\}\}/g, "la niña");
  }
  assert.match(joined(s), /\{\{NOMBRE\}\}.*6 pages/);
});

test("rejects an unknown placeholder", () => {
  const s = clone();
  s.pages[2].text = s.pages[2].text.replace("{{NOMBRE}}", "{{NOMBRE_DEL_NINO}}");
  assert.match(joined(s), /unknown placeholder/i);
});

test("rejects an invented proper name mid-sentence", () => {
  const s = clone();
  s.pages[2].text = s.pages[2].text.replace("El camino", "Entonces Marcos dijo que el camino");
  assert.match(joined(s), /proper name.*Marcos/i);
});

test("accepts a capitalised word that opens a sentence", () => {
  const s = clone();
  s.pages[2].text = s.pages[2].text.replace("Dentro olía", "Dentro olía");
  assert.deepStrictEqual(validateStory(s).errors, []);
});

test("accepts a capitalised word that opens a line of dialogue", () => {
  // Page 2 already starts with an em dash followed by a capital letter.
  assert.deepStrictEqual(validateStory(valid).errors, []);
});

test("accepts whitelisted capitalised words like Sol or Navidad", () => {
  const s = clone();
  s.pages[4].text = s.pages[4].text.replace("Encontró una cuerda", "Bajo el Sol encontró una cuerda");
  const errors = validateStory(s).errors.filter((e) => /proper name/i.test(e));
  assert.deepStrictEqual(errors, []);
});

// --- content -----------------------------------------------------------------

test("rejects blocklisted content in a page", () => {
  const s = clone();
  s.pages[5].text = s.pages[5].text.replace("un cartel", "una pistola");
  assert.match(joined(s), /blocklist.*pistola/i);
});

test("blocklist ignores accents and case", () => {
  const s = clone();
  s.pages[5].text = s.pages[5].text.replace("un cartel", "una EXPLOSIÓN");
  assert.match(joined(s), /blocklist/i);
});

test("blocklist matches whole words only", () => {
  const s = clone();
  // "armario" contains "arma" but is perfectly innocent.
  const errors = validateStory(s).errors.filter((e) => /blocklist/i.test(e));
  assert.deepStrictEqual(errors, []);
});

test("rejects a title or moral with blocklisted content", () => {
  const s = clone();
  s.title = "{{NOMBRE}} y la guerra";
  assert.match(joined(s), /title.*blocklist/i);
});

test("rejects an image_hint that asks for text in the picture", () => {
  const s = clone();
  s.pages[1].image_hint = "a wooden sign that reads Welcome to the village";
  assert.match(joined(s), /text in image/i);
});

test("rejects an image_hint longer than 30 words", () => {
  const s = clone();
  s.pages[1].image_hint = Array(35).fill("boat").join(" ");
  assert.match(joined(s), /image_hint.*30 words/i);
});

test("rejects a preachy moral inside the story text", () => {
  const s = clone();
  s.pages[11].text =
    "La moraleja es que debemos obedecer siempre a los mayores sin rechistar nunca jamás, porque ellos saben mucho más que nosotros de todo lo que pasa en el mundo y así todo sale bien, nadie se enfada en casa y las cosas vuelven a estar tranquilas para siempre jamás.";
  assert.match(joined(s), /preachy/i);
});

// --- error reporting ---------------------------------------------------------

test("reports every problem at once, not just the first", () => {
  const s = clone();
  s.pages.pop();
  s.pages[0].text = "{{NOMBRE}} miró el mar.";
  assert.ok(validateStory(s).errors.length >= 2, "expected several errors");
});

test("errors are plain strings, ready to paste into a retry prompt", () => {
  const s = clone();
  s.pages[0].text = "{{NOMBRE}} miró el mar.";
  for (const e of validateStory(s).errors) assert.strictEqual(typeof e, "string");
});

test("never throws on malformed input", () => {
  assert.doesNotThrow(() => validateStory({ pages: "no" }));
  assert.doesNotThrow(() => validateStory({ pages: [null] }));
  assert.doesNotThrow(() => validateStory(undefined));
});

test("accepts a null companion (strict-mode schema makes it required but nullable)", () => {
  const s = clone();
  s.character_sheet.companion = null;
  assert.deepStrictEqual(validateStory(s).errors, []);
});

test("still rejects a companion of the wrong type", () => {
  const s = clone();
  s.character_sheet.companion = 42;
  assert.match(joined(s), /companion.*string/);
});

// --- people ------------------------------------------------------------------

test("with no people declared, {{PERSONA1}} is an unknown placeholder", () => {
  const s = clone();
  s.pages[2].text = s.pages[2].text.replace("{{NOMBRE}}", "{{PERSONA1}}");
  assert.match(validateStory(s).errors.join(" | "), /unknown placeholder \{\{PERSONA1\}\}/);
});

test("a declared person must appear on at least 2 pages", () => {
  const s = clone();
  assert.match(validateStory(s, { people: 1 }).errors.join(" | "), /PERSONA1.*at least 2 pages.*found on 0/);
  s.pages[3].text = s.pages[3].text.replace("{{NOMBRE}}", "{{PERSONA1}}");
  assert.match(validateStory(s, { people: 1 }).errors.join(" | "), /found on 1/);
  s.pages[6].text = s.pages[6].text.replace("{{NOMBRE}}", "{{PERSONA1}}");
  assert.deepStrictEqual(validateStory(s, { people: 1 }).errors, []);
});

test("two people: both are required, a third is unknown", () => {
  const s = clone();
  // pages 5 and 11 of the fixture have no {{NOMBRE}}; pick pages that do
  for (const i of [3, 6]) s.pages[i].text = s.pages[i].text.replace("{{NOMBRE}}", "{{PERSONA1}}");
  for (const i of [7, 8]) s.pages[i].text = s.pages[i].text.replace("{{NOMBRE}}", "{{PERSONA2}}");
  assert.deepStrictEqual(validateStory(s, { people: 2 }).errors, []);
  s.pages[9].text = s.pages[9].text.replace("{{NOMBRE}}", "{{PERSONA3}}");
  assert.match(validateStory(s, { people: 2 }).errors.join(" | "), /unknown placeholder \{\{PERSONA3\}\}/);
});

test("{{AMIGO}} is no longer a valid placeholder", () => {
  const s = clone();
  s.pages[2].text = s.pages[2].text.replace("{{NOMBRE}}", "{{AMIGO}}");
  assert.match(validateStory(s, { people: 1 }).errors.join(" | "), /unknown placeholder \{\{AMIGO\}\}/);
});
