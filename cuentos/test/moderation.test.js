const { test } = require("node:test");
const assert = require("node:assert");
const { checkInput, reviewStory, localNameProblem } = require("../lib/moderation.js");

const never = async () => { throw new Error("the model must not be called for this input"); };
const safe = async () => ({ data: { safe: true, reason: "" }, costUsd: 0 });
const unsafe = async () => ({ data: { safe: false, reason: "contiene un insulto" }, costUsd: 0 });
const down = async () => { throw new Error("503 upstream"); };

const CLEAN = { name: "Ana", companionName: "Leo", dedication: "Para Ana, con todo el cariño de la abuela." };

// --- input: local rules, no model call --------------------------------------

test("a clean name with no dedication never reaches the model", async () => {
  const r = await checkInput({ name: "Ana" }, { completeJson: never });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.needsReview, false);
});

test("an empty name is rejected", async () => {
  const r = await checkInput({ name: "   " }, { completeJson: never });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /name is required/);
});

test("a very long name is rejected without a model call", async () => {
  const r = await checkInput({ name: "A".repeat(31) }, { completeJson: never });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /longer than 30/);
});

test("digits in a name are rejected", async () => {
  const r = await checkInput({ name: "Ana2000" }, { completeJson: never });
  assert.match(r.reason, /digits/);
});

test("a URL in the dedication is rejected without a model call", async () => {
  const r = await checkInput({ name: "Ana", dedication: "Mira en www.ejemplo.com" }, { completeJson: never });
  assert.match(r.reason, /contact details/);
});

test("an email in the dedication is rejected", async () => {
  const r = await checkInput({ name: "Ana", dedication: "Escríbeme a hola@ejemplo.es" }, { completeJson: never });
  assert.match(r.reason, /contact details/);
});

test("a phone number in the dedication is rejected", async () => {
  const r = await checkInput({ name: "Ana", dedication: "Llámame al 600 123 456" }, { completeJson: never });
  assert.match(r.reason, /contact details/);
});

test("a blocked word in the dedication is rejected without a model call", async () => {
  const r = await checkInput({ name: "Ana", dedication: "Para Ana, mi pequeña de Disney" }, { completeJson: never });
  assert.match(r.reason, /blocked word/);
});

test("a blocked word in a name is rejected", async () => {
  const r = await checkInput({ name: "Batman" }, { completeJson: never });
  assert.match(r.reason, /blocked word/);
});

test("an over-long dedication is rejected", async () => {
  const r = await checkInput({ name: "Ana", dedication: "a".repeat(141) }, { completeJson: never });
  assert.match(r.reason, /longer than 140/);
});

test("a bad companion name is rejected too", async () => {
  const r = await checkInput({ name: "Ana", companionName: "Leo <script>" }, { completeJson: never });
  assert.match(r.reason, /companion name/);
});

test("accented and hyphenated names are accepted", async () => {
  for (const name of ["Martín", "Mª Ángeles", "Jean-Luc", "Nuria", "Íñigo"]) {
    const r = await checkInput({ name }, { completeJson: never });
    assert.strictEqual(r.ok, true, `${name} was wrongly rejected: ${r.reason}`);
  }
});

// --- input: model pass -------------------------------------------------------

test("an ambiguous dedication reaches the model and can pass", async () => {
  const r = await checkInput(CLEAN, { completeJson: safe });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.needsReview, false);
});

test("the model can reject a dedication the local rules missed", async () => {
  const r = await checkInput(CLEAN, { completeJson: unsafe });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /insulto/);
});

test("input moderation fails OPEN and flags for review when the model is down", async () => {
  const r = await checkInput(CLEAN, { completeJson: down });
  assert.strictEqual(r.ok, true, "a sale must not be lost to a timeout");
  assert.strictEqual(r.needsReview, true, "but a human must look at it");
});

// --- story review ------------------------------------------------------------

const STORY = { pages: [{ text: "{{NOMBRE}} miró el mar." }, { text: "Y sonrió." }] };

test("a clean story passes review", async () => {
  const r = await reviewStory(STORY, {
    completeJson: async () => ({ data: { safe: true, issues: [] }, costUsd: 0 }),
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.issues, []);
});

test("review reports the issues the model found", async () => {
  const r = await reviewStory(STORY, {
    completeJson: async () => ({ data: { safe: false, issues: ["final angustioso"] }, costUsd: 0 }),
  });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.issues, ["final angustioso"]);
});

test("story review fails CLOSED when the model is down", async () => {
  const r = await reviewStory(STORY, { completeJson: down });
  assert.strictEqual(r.ok, false, "we do not print what nobody has read");
  assert.match(r.issues[0], /unavailable/);
});

test("an unusable verdict is treated as a failure, not as a pass", async () => {
  const r = await reviewStory(STORY, { completeJson: async () => ({ data: { nonsense: true }, costUsd: 0 }) });
  assert.strictEqual(r.ok, false);
});

test("localNameProblem returns null for an absent optional field", () => {
  assert.strictEqual(localNameProblem(undefined, "companion name"), null);
  assert.strictEqual(localNameProblem("", "companion name"), null);
});

test("people names go through the same local rules", async () => {
  const r = await checkInput({ name: "Ana", people: [{ relation: "abuela", name: "Carmen" }, { relation: "hermano", name: "Leo99" }] }, { completeJson: never });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /person 2 name.*digits/);
});

test("clean people names pass without a model call", async () => {
  const r = await checkInput({ name: "Ana", people: [{ relation: "abuela", name: "Carmen" }] }, { completeJson: never });
  assert.strictEqual(r.ok, true);
});
