const { test } = require("node:test");
const assert = require("node:assert");
const B = require("../lib/brand.js");

test("the brand exists in both languages and keeps its wordplay", () => {
  assert.strictEqual(B.name("es"), "Familia de cuento");
  assert.strictEqual(B.name("en"), "Storybook Family");
  // "storybook" carries the same double meaning as "de cuento": idyllic, and
  // literally a book of stories. "Fairytale" would promise fantasy instead.
  assert.doesNotMatch(B.name("en"), /fairy/i);
});

test("an unknown locale falls back to Spanish rather than showing undefined", () => {
  for (const l of [undefined, null, "", "fr", "pt-BR"]) {
    assert.strictEqual(B.name(l), "Familia de cuento", String(l));
    assert.ok(B.tagline(l));
  }
});

test("the accent word is part of the name it belongs to", () => {
  for (const l of ["es", "en"]) {
    assert.ok(B.name(l).includes(B.ACCENT_WORD[l]), `${l}: the highlighted word must be in the name`);
  }
});

test("full() reads as a sender line", () => {
  assert.strictEqual(B.full("es"), "Familia de cuento — el cuento de su vida");
  assert.strictEqual(B.full("en"), "Storybook Family — the story of their life");
});
