const { test } = require("node:test");
const assert = require("node:assert");
const C = require("../lib/collection.js");

test("style suffix is frozen and forbids text in images", () => {
  assert.match(C.STYLE, /watercolour/i);
  assert.match(C.STYLE, /no text/i);
  assert.throws(() => {
    "use strict";
    C.STYLE = "other";
  }, TypeError);
});

test("theme ids are unique", () => {
  const seen = new Set(C.ids(C.THEMES));
  assert.strictEqual(seen.size, C.THEMES.length);
});

test("narrative beats are the five the validator checks", () => {
  assert.deepStrictEqual(C.BEATS, ["setup", "problem", "attempt", "attempt", "resolution"]);
});

test("book maths: title + 12 scenes + 4 colouring + card make 18 pages", () => {
  assert.strictEqual(C.PAGE_COUNT, 12);
  assert.strictEqual(C.COLORING_PAGE_COUNT, 4);
  assert.strictEqual(C.BOOK_PAGE_COUNT, 18);
  assert.strictEqual(1 + C.PAGE_COUNT + C.COLORING_PAGE_COUNT + 1, C.BOOK_PAGE_COUNT);
});

test("word limits leave room for a 3-8 year old page", () => {
  assert.strictEqual(C.WORDS_MIN, 60);
  assert.strictEqual(C.WORDS_MAX, 90);
});

test("blocklist covers violence, adult content and trademarks", () => {
  for (const word of ["matar", "alcohol", "pokemon", "patrulla canina"]) {
    assert.ok(C.BLOCKLIST.includes(word), `blocklist is missing ${word}`);
  }
});

test("the pet list offers an explicit none option", () => {
  const none = C.PETS.find((p) => p.id === "ninguna");
  assert.ok(none);
  assert.strictEqual(none.visual, null);
});

test("fallbackImage returns a path inside the theme battery and wraps around", () => {
  assert.strictEqual(C.fallbackImage("mar", 0), "assets/img/fallback/mar-01.jpg");
  assert.strictEqual(C.fallbackImage("mar", 6), "assets/img/fallback/mar-01.jpg");
  assert.strictEqual(C.fallbackImage("bosque", 2), "assets/img/fallback/bosque-03.jpg");
});

test("fallbackImage rejects an unknown theme instead of guessing", () => {
  assert.throws(() => C.fallbackImage("no-existe", 0), /unknown theme/);
});

// Measured 2026-08-21: a story about stargazing was rejected four times for
// "invented proper name Osa Mayor". Real names the model may legitimately use
// belong in the whitelist, or the validator fights the story it asked for.
test("the whitelist covers real names a children's story reaches for", () => {
  for (const n of ["Osa", "Mayor", "Menor", "Vía", "Láctea", "Polar", "Marte", "Júpiter", "Saturno", "Enero", "Lunes", "España"]) {
    assert.ok(C.NAME_WHITELIST.includes(n), `"${n}" should be whitelisted`);
  }
});

// Measured 2026-08-21: "el sol vino a despertarla" was refused as alcohol.
// "vino" is the preterite of "venir" and is far commoner in a children's story
// than the drink; a bare word match cannot tell them apart, so the drink is
// matched in the shapes it actually appears in.
test("the blocklist does not trip over the preterite of venir", () => {
  assert.ok(!C.BLOCKLIST.includes("vino"), '"vino" alone catches "vino a verla"');
  assert.ok(C.BLOCKLIST.some((w) => /vino/.test(w)), "the drink must still be blocked in context");
});

test("the blocklist keeps the words that actually matter", () => {
  for (const w of ["matar", "sangre", "pistola", "droga", "suicidio", "borracho"]) {
    assert.ok(C.BLOCKLIST.includes(w), `"${w}" must stay blocked`);
  }
});

test("there are enough places for a story to feel chosen, each visually distinct", () => {
  assert.ok(C.THEMES.length >= 14, `only ${C.THEMES.length} places to set a story in`);
  const ids = C.THEMES.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const t of C.THEMES) {
    assert.ok(t.es && t.en, `${t.id}: needs both languages`);
    assert.ok(t.seed_idea && t.seed_idea.length >= 40, `${t.id}: seed idea too thin`);
    assert.ok(!/[áéíóúñ]/i.test(t.seed_idea), `${t.id}: the seed idea goes to the model in English`);
  }
});

// A father offered "3 to 5 years old" is the form contradicting itself. Ages
// only make sense for the companions who are children.
test("relations say whether they are adults, and only children take an age", () => {
  const adults = ["padre", "madre", "abuelo", "abuela"];
  for (const r of C.RELATIONS) {
    assert.strictEqual(typeof r.adult, "boolean", `${r.id}: missing the adult flag`);
    assert.strictEqual(r.adult, adults.includes(r.id), `${r.id}: wrong adult flag`);
  }
  assert.ok(C.PERSON_AGES.length >= 4);
  for (const a of C.PERSON_AGES) assert.ok(a.id && a.es && a.en, `${a.id}: incomplete`);
  // the protagonist's own bands stay inside what the product is written for
  assert.deepStrictEqual(C.AGE_BANDS.map((a) => a.id), ["3-5", "6-8"]);
});
