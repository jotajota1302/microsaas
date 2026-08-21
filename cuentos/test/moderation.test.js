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

// The free note is free text a stranger typed: it gets the same treatment as
// the dedication, or it becomes the way round the filter.
test("checkInput holds the free note to the same rules as the dedication", async () => {
  const never = async () => { throw new Error("the model must not be reached for an obvious refusal"); };
  const base = { name: "Ana" };

  const phone = await checkInput({ ...base, notes: "llamame al 600 123 456" }, { completeJson: never });
  assert.strictEqual(phone.ok, false);
  assert.match(phone.reason, /notes/);

  const url = await checkInput({ ...base, notes: "mira en http://algo.com" }, { completeJson: never });
  assert.strictEqual(url.ok, false);

  const blocked = await checkInput({ ...base, notes: "le gusta jugar a matar bichos" }, { completeJson: never });
  assert.strictEqual(blocked.ok, false);
  assert.match(blocked.reason, /blocked word/);

  const long = await checkInput({ ...base, notes: "x".repeat(400) }, { completeJson: never });
  assert.strictEqual(long.ok, false);
});

test("a harmless note reaches the model together with the dedication", async () => {
  let seen = null;
  const spy = async (args) => { seen = args; return { data: { safe: true, reason: "" } }; };
  const v = await checkInput({ name: "Ana", dedication: "Para Ana", notes: "le da miedo el ascensor" }, { completeJson: spy });
  assert.strictEqual(v.ok, true);
  const text = seen.messages.map((m) => m.content).join(" ");
  assert.match(text, /Para Ana/);
  assert.match(text, /ascensor/);
});

test("a note alone still gets judged when there is no dedication", async () => {
  let called = 0;
  const spy = async () => { called++; return { data: { safe: false, reason: "no" } }; };
  const v = await checkInput({ name: "Ana", notes: "algo ambiguo" }, { completeJson: spy });
  assert.strictEqual(called, 1);
  assert.strictEqual(v.ok, false);
});
