const { test } = require("node:test");
const assert = require("node:assert");
const { buildMessages, generateStory, describeChild } = require("../lib/prompt-story.js");
const valid = require("./fixtures/story-valid.json");

const INPUT = {
  ageBand: "6-8",
  hairColor: "castano",
  hairType: "rizado",
  skin: "clara",
  glasses: true,
  pet: "gato",
  hobby: "dibujar",
  theme: "mar",
  hasCompanion: true,
  locale: "es",
};

const dump = (input, errors) => JSON.stringify(buildMessages(input, errors));

test("the prompt uses placeholders and never a real name", () => {
  const all = dump(INPUT);
  assert.ok(all.includes("{{NOMBRE}}"));
  assert.ok(all.includes("{{AMIGO}}"));
  assert.ok(!/\bAna\b|\bLeo\b|\bMarcos\b/.test(all));
});

test("the prompt carries the chosen theme, hobby and pet", () => {
  const all = dump(INPUT);
  assert.match(all, /El mar/);
  assert.match(all, /Dibujar/i);
  assert.match(all, /gato/);
});

test("without a pet the prompt forbids inventing one", () => {
  const all = dump({ ...INPUT, pet: "ninguna" });
  assert.match(all, /no inventes ninguna/i);
  assert.ok(!/fluffy grey cat/.test(all));
});

test("without a companion the prompt forbids inventing friends", () => {
  const all = dump({ ...INPUT, hasCompanion: false });
  assert.match(all, /no inventes amigos/i);
});

test("the child description is in english and has no name", () => {
  const d = describeChild(INPUT);
  assert.match(d, /curly brown hair/);
  assert.match(d, /light skin/);
  assert.match(d, /glasses/);
  assert.ok(!/\{\{/.test(d));
});

test("an unknown option is rejected loudly instead of silently guessed", () => {
  assert.throws(() => buildMessages({ ...INPUT, theme: "piratas" }), /unknown theme/);
  assert.throws(() => buildMessages({ ...INPUT, hobby: "esgrima" }), /unknown option/);
});

test("a retry includes the validator errors verbatim", () => {
  const all = dump(INPUT, ["page 4: 41 words, must be between 60 and 90 words"]);
  assert.match(all, /41 words/);
  assert.match(all, /RECHAZADO/);
});

test("the first attempt carries no error block", () => {
  assert.ok(!dump(INPUT).includes("RECHAZADO"));
});

test("generateStory returns on the first valid story", async () => {
  let calls = 0;
  const completeJson = async () => { calls++; return { data: valid, costUsd: 0.002 }; };
  const r = await generateStory(INPUT, { completeJson });
  assert.strictEqual(r.attempts, 1);
  assert.strictEqual(calls, 1);
  assert.strictEqual(r.story.title, valid.title);
});

test("generateStory retries until the story validates and sums the cost", async () => {
  const broken = JSON.parse(JSON.stringify(valid));
  broken.pages.pop();
  let calls = 0;
  const completeJson = async () => {
    calls++;
    return { data: calls === 1 ? broken : valid, costUsd: 0.002 };
  };
  const r = await generateStory(INPUT, { completeJson });
  assert.strictEqual(r.attempts, 2);
  assert.ok(Math.abs(r.costUsd - 0.004) < 1e-9);
});

test("generateStory gives up after three attempts and reports the errors", async () => {
  const broken = JSON.parse(JSON.stringify(valid));
  broken.pages.pop();
  const completeJson = async () => ({ data: broken, costUsd: 0.002 });
  await assert.rejects(
    () => generateStory(INPUT, { completeJson }),
    (e) => e.name === "StoryNotValidError" && e.errors.length > 0 && e.costUsd > 0
  );
});

test("the retry prompt of attempt 3 carries the errors of attempt 2", async () => {
  const broken = JSON.parse(JSON.stringify(valid));
  broken.pages[0].text = "{{NOMBRE}} miró el mar.";
  const seen = [];
  const completeJson = async ({ messages }) => {
    seen.push(JSON.stringify(messages));
    return { data: broken, costUsd: 0 };
  };
  await generateStory(INPUT, { completeJson }).catch(() => {});
  assert.strictEqual(seen.length, 3);
  assert.match(seen[2], /page 1:.*words/);
});

test("a girl protagonist forces feminine agreement in the prompt", () => {
  const all = dump({ ...INPUT, gender: "nina" });
  assert.match(all, /la niña/);
  assert.match(all, /género gramatical/);
  assert.match(all, /a 7-year-old girl/);
});

test("a boy protagonist forces masculine agreement", () => {
  const all = dump({ ...INPUT, gender: "nino" });
  assert.match(all, /el niño/);
  assert.match(all, /a 7-year-old boy/);
});

test("an unstated gender forbids gendered words instead of guessing", () => {
  const all = dump({ ...INPUT, gender: "neutro" });
  assert.match(all, /NO uses nunca/);
  assert.match(all, /a 7-year-old child/);
  assert.ok(!/género gramatical correspondiente/.test(all));
});

test("omitting gender defaults to the neutral rule, never to a guess", () => {
  const withoutGender = { ...INPUT };
  delete withoutGender.gender;
  assert.match(dump(withoutGender), /NO uses nunca/);
});

test("an unknown gender is rejected loudly", () => {
  assert.throws(() => buildMessages({ ...INPUT, gender: "otro" }), /unknown option/);
});
