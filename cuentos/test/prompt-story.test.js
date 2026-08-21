const { test } = require("node:test");
const assert = require("node:assert");
const { buildMessages, generateStory, describeChild, peopleOf } = require("../lib/prompt-story.js");
const valid = require("./fixtures/story-valid.json");

const INPUT = {
  ageBand: "6-8",
  gender: "nina",
  hairColor: "castano",
  hairType: "rizado",
  skin: "clara",
  glasses: true,
  pet: "gato",
  hobby: "dibujar",
  theme: "mar",
  moment: "hermanito",
  tone: "dormir",
  people: [{ relation: "abuela" }, { relation: "hermano", ageBand: "3-5" }],
  locale: "es",
};

const dump = (input, errors) => JSON.stringify(buildMessages(input, errors));

// --- privacy -----------------------------------------------------------------

test("the prompt uses placeholders and never a real name", () => {
  const all = dump(INPUT);
  assert.ok(all.includes("{{NOMBRE}}"));
  assert.ok(all.includes("{{PERSONA1}}"));
  assert.ok(all.includes("{{PERSONA2}}"));
  assert.ok(!/\bAna\b|\bLeo\b|\bCarmen\b|\bMarcos\b/.test(all));
});

test("people are described by relation and age, never by name", () => {
  const all = dump(INPUT);
  assert.match(all, /\{\{PERSONA1\}\}: su abuela/);
  // the age reads as words from the companion list, not as a raw band id
  assert.match(all, /\{\{PERSONA2\}\}: su hermano \(3 a 5 años\)/);
});

test("a person is given as a name anyway? it is not accepted as input", () => {
  const all = dump({ ...INPUT, people: [{ relation: "abuela", name: "Carmen" }] });
  assert.ok(!all.includes("Carmen"), "a name leaked into the prompt");
});

// --- content of the brief ---------------------------------------------------

test("the prompt carries the theme, hobby, pet, moment and tone", () => {
  const all = dump(INPUT);
  assert.match(all, /El mar/);
  assert.match(all, /Dibujar/i);
  assert.match(all, /gato/);
  assert.match(all, /Va a tener un hermanito/);
  assert.match(all, /dejar de ser importante/);
  assert.match(all, /Para dormir/);
  assert.match(all, /arrullan/);
});

test("without people the prompt forbids inventing named characters", () => {
  const all = dump({ ...INPUT, people: [] });
  assert.match(all, /no inventes amigos, hermanos ni familiares/i);
  assert.ok(!all.includes("{{PERSONA1}}: "));
});

test("without a pet the prompt forbids inventing one", () => {
  const all = dump({ ...INPUT, pet: "ninguna" });
  assert.match(all, /no inventes ninguna/i);
  assert.ok(!/fluffy grey cat/.test(all));
});

test("moment and tone default to adventure and funny when omitted", () => {
  const { moment, tone, ...rest } = INPUT;
  const all = dump(rest);
  assert.match(all, /Una aventura sin más/);
  assert.match(all, /Divertido/);
});

test("a third person is silently capped at two", () => {
  const p = peopleOf({ people: [{ relation: "abuela" }, { relation: "abuelo" }, { relation: "primo" }] });
  assert.strictEqual(p.length, 2);
});

test("the legacy hasCompanion flag maps to one friend", () => {
  const p = peopleOf({ hasCompanion: true });
  assert.deepStrictEqual(p.map((x) => x.marker), ["{{PERSONA1}}"]);
  assert.strictEqual(p[0].role, "su amigo");
});

test("the child description is in english and has no name", () => {
  const d = describeChild(INPUT);
  assert.match(d, /7-year-old girl/);
  assert.match(d, /curly brown hair/);
  assert.match(d, /glasses/);
  assert.ok(!/\{\{/.test(d));
});

test("gender rules: girl, boy, unstated", () => {
  assert.match(dump({ ...INPUT, gender: "nina" }), /la niña/);
  assert.match(dump({ ...INPUT, gender: "nino" }), /el niño/);
  assert.match(dump({ ...INPUT, gender: "neutro" }), /NO uses nunca/);
  const noGender = { ...INPUT }; delete noGender.gender;
  assert.match(dump(noGender), /NO uses nunca/);
});

test("unknown options are rejected loudly instead of silently guessed", () => {
  assert.throws(() => buildMessages({ ...INPUT, theme: "no-existe" }), /unknown theme/);
  assert.throws(() => buildMessages({ ...INPUT, hobby: "esgrima" }), /unknown option/);
  assert.throws(() => buildMessages({ ...INPUT, moment: "boda" }), /unknown option/);
  assert.throws(() => buildMessages({ ...INPUT, tone: "triste" }), /unknown option/);
  assert.throws(() => buildMessages({ ...INPUT, people: [{ relation: "vecino" }] }), /unknown option/);
  assert.throws(() => buildMessages({ ...INPUT, gender: "otro" }), /unknown option/);
});

// --- revisions ("cambiar algo") ---------------------------------------------

test("accumulated instructions are passed verbatim, numbered", () => {
  const all = dump({ ...INPUT, instructions: ["que la abuela tenga más protagonismo", "menos miedo en la página 6"] });
  assert.match(all, /1\. que la abuela tenga más protagonismo/);
  assert.match(all, /2\. menos miedo en la página 6/);
});

test("no instruction block when there are none", () => {
  assert.ok(!dump(INPUT).includes("ha pedido estos cambios"));
  assert.ok(!dump({ ...INPUT, instructions: [] }).includes("ha pedido estos cambios"));
});

// --- retries -----------------------------------------------------------------

test("a retry includes the validator errors verbatim; the first attempt does not", () => {
  assert.match(dump(INPUT, ["page 4: 41 words, must be between 60 and 90 words"]), /41 words/);
  assert.ok(!dump(INPUT).includes("RECHAZADO"));
});

test("generateStory validates against the declared number of people", async () => {
  // the fixture has no {{PERSONA1}}: with one person declared it must be rejected every time
  const completeJson = async () => ({ data: valid, costUsd: 0.001 });
  await assert.rejects(
    () => generateStory({ ...INPUT, people: [{ relation: "abuela" }] }, { completeJson }),
    (e) => e.name === "StoryNotValidError" && e.errors.some((x) => /PERSONA1/.test(x))
  );
});

test("generateStory returns on the first valid story", async () => {
  let calls = 0;
  const completeJson = async () => { calls++; return { data: valid, costUsd: 0.002 }; };
  const r = await generateStory({ ...INPUT, people: [] }, { completeJson });
  assert.strictEqual(r.attempts, 1);
  assert.strictEqual(calls, 1);
});

test("generateStory retries until the story validates and sums the cost", async () => {
  const broken = JSON.parse(JSON.stringify(valid));
  broken.pages.pop();
  let calls = 0;
  const completeJson = async () => { calls++; return { data: calls === 1 ? broken : valid, costUsd: 0.002 }; };
  const r = await generateStory({ ...INPUT, people: [] }, { completeJson });
  assert.strictEqual(r.attempts, 2);
  assert.ok(Math.abs(r.costUsd - 0.004) < 1e-9);
});

test("generateStory gives up after three attempts and reports the errors", async () => {
  const broken = JSON.parse(JSON.stringify(valid));
  broken.pages.pop();
  const completeJson = async () => ({ data: broken, costUsd: 0.002 });
  await assert.rejects(
    () => generateStory({ ...INPUT, people: [] }, { completeJson }),
    (e) => e.name === "StoryNotValidError" && e.errors.length > 0 && e.costUsd > 0
  );
});

// Measured against the real model: the commonest rejection is a page or two
// coming in at 56-59 words. Regenerating the whole story to fix that trades a
// known small defect for a fresh unknown one, which is how a run burns all
// three attempts. When every error names a page, repair those pages only.

test("generateStory repairs page-level errors instead of regenerating everything", async () => {
  const short = JSON.parse(JSON.stringify(valid));
  short.pages[3].text = "Solo cinco palabras aqui vale.";
  const seen = [];
  const completeJson = async ({ messages, schema }) => {
    seen.push({ schema, last: messages[messages.length - 1].content });
    if (seen.length === 1) return { data: short, costUsd: 0.001 };
    return { data: { pages: [{ n: 4, text: valid.pages[3].text, image_hint: valid.pages[3].image_hint }] }, costUsd: 0.0002 };
  };
  const r = await generateStory({ ...INPUT, people: [] }, { completeJson });
  assert.strictEqual(r.attempts, 2);
  assert.strictEqual(r.story.pages[3].text, valid.pages[3].text, "the repaired page must be merged back");
  assert.strictEqual(r.story.title, valid.title, "the rest of the story must survive untouched");
  assert.match(seen[1].last, /pagina 4|página 4/i);
  assert.ok(seen[1].last.length < seen[0].last.length, "the repair prompt is the short one");
});

test("generateStory regenerates in full when an error is not about one page", async () => {
  const broken = JSON.parse(JSON.stringify(valid));
  broken.pages.pop(); // "12 pages required" — not a page-level error
  let calls = 0;
  const completeJson = async ({ messages }) => {
    calls++;
    if (calls === 1) return { data: broken, costUsd: 0.001 };
    assert.match(messages[messages.length - 1].content, /RECHAZADO/);
    return { data: valid, costUsd: 0.001 };
  };
  const r = await generateStory({ ...INPUT, people: [] }, { completeJson });
  assert.strictEqual(r.attempts, 2);
});
