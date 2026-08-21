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

test("six themes, each with spanish and english labels and a seed idea", () => {
  assert.strictEqual(C.THEMES.length, 6);
  for (const t of C.THEMES) {
    assert.ok(t.id && t.es && t.en && t.seed_idea, `theme ${t.id} is incomplete`);
  }
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
  assert.throws(() => C.fallbackImage("piratas", 0), /unknown theme/);
});

// Measured 2026-08-21: a story about stargazing was rejected four times for
// "invented proper name Osa Mayor". Real names the model may legitimately use
// belong in the whitelist, or the validator fights the story it asked for.
test("the whitelist covers real names a children's story reaches for", () => {
  for (const n of ["Osa", "Mayor", "Menor", "Vía", "Láctea", "Polar", "Marte", "Júpiter", "Saturno", "Enero", "Lunes", "España"]) {
    assert.ok(C.NAME_WHITELIST.includes(n), `"${n}" should be whitelisted`);
  }
});
