const { test } = require("node:test");
const assert = require("node:assert");
const { runJob, anonymise, PLAN, SAMPLE_PAGES, PAGE_BATCH } = require("../lib/steps.js");
const valid = require("./fixtures/story-valid.json");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** In-memory db with the same surface as lib/db.js. */
function memDb({ job, order, story = null }) {
  const state = { job: { steps: {}, attempts: 0, cost_cents: 0, ...job }, order, story, files: {}, saves: [] };
  return {
    state,
    async claimJob() { return { ...state.job }; },
    async getOrder() { return state.order; },
    async getStoryByOrder() { return state.story; },
    async saveJob(_, patch) { state.job = { ...state.job, ...patch }; state.saves.push(patch); return state.job; },
    async updateOrder(_, patch) { state.order = { ...state.order, ...patch }; return state.order; },
    async createStory({ orderId, story, peopleCount }) {
      state.story = { id: "s1", order_id: orderId, token: "tok123", stage: "script", story, people_count: peopleCount, page_paths: {}, coloring_paths: [], revisions: 0, fallbacks: 0 };
      return state.story;
    },
    async updateStory(_, patch) { state.story = { ...state.story, ...patch }; return state.story; },
    async upload(_, path, buffer) { state.files[path] = buffer; return path; },
    async download(_, path) { return state.files[path] || PNG; },
  };
}

/**
 * What the viewer, the panel and the cron all do: keep asking until the job
 * stops asking. Work comes in batches so one invocation fits inside a
 * serverless function's wall clock, so "run it to the end" is a loop.
 */
async function drain(jobId, deps, max = 20) {
  let r;
  for (let i = 0; i < max; i++) {
    r = await runJob(jobId, deps);
    if (r.state !== "pending" || !r.partial) return r;
  }
  throw new Error("job never finished");
}

const ORDER = {
  id: "o1", email: "a@b.c", locale: "es",
  personalization: { name: "Ana", gender: "nina", ageBand: "6-8", hairColor: "castano", hairType: "rizado", skin: "clara", glasses: true, pet: "gato", hobby: "dibujar", theme: "mar", moment: "hermanito", tone: "dormir", people: [{ name: "Carmen", relation: "abuela" }], dedication: "Para Ana" },
};

const okDeps = (db, over = {}) => ({
  db,
  log: () => {},
  generateStory: async () => ({ story: valid, attempts: 1, costUsd: 0.001 }),
  reviewStory: async () => ({ ok: true, issues: [] }),
  buildSheet: async () => ({ sheet: PNG, refs: [PNG], costUsd: 0.034 }),
  renderPages: async (_, __, { indices }) => ({ pages: indices.map((i) => ({ index: i, buffer: PNG, fallback: false })), costUsd: 0.034 * indices.length, fallbacks: 0 }),
  toLineArt: async () => ({ buffer: PNG, costUsd: 0.034 }),
  renderPdf: async () => Buffer.from("%PDF-1.7 fake"),
  sendEmail: async () => {},
  ...over,
});

// --- anonymise -----------------------------------------------------------------

test("anonymise strips every name and the dedication, keeps traits and relations", () => {
  const a = anonymise(ORDER.personalization);
  const s = JSON.stringify(a);
  assert.ok(!s.includes("Ana") && !s.includes("Carmen") && !s.includes("Para Ana"));
  assert.deepStrictEqual(a.people, [{ relation: "abuela", ageBand: null }]);
  assert.strictEqual(a.moment, "hermanito");
  assert.strictEqual(a.tone, "dormir");
});

test("anonymise defaults moment, tone, pet and caps people at two", () => {
  const a = anonymise({ people: [{ relation: "a" }, { relation: "b" }, { relation: "c" }] });
  assert.strictEqual(a.moment, "aventura");
  assert.strictEqual(a.tone, "divertido");
  assert.strictEqual(a.pet, "ninguna");
  assert.strictEqual(a.people.length, 2);
});

// --- script ----------------------------------------------------------------------

test("script job: writes the story, creates the story row, notifies, ends done", async () => {
  const db = memDb({ job: { id: "j1", kind: "script", order_id: "o1" }, order: ORDER });
  const sent = [];
  const r = await runJob("j1", okDeps(db, { sendEmail: async (m) => sent.push(m) }));
  assert.strictEqual(r.state, "done");
  assert.strictEqual(db.state.story.stage, "script");
  assert.strictEqual(db.state.story.token, "tok123");
  assert.strictEqual(db.state.story.story.theme, "mar", "theme is stored with the story");
  assert.strictEqual(db.state.order.status, "script");
  assert.deepStrictEqual(sent.map((m) => m.kind), ["script_ready"]);
  assert.ok(db.state.job.steps.text.done && db.state.job.steps.review.done && db.state.job.steps.notify.done);
});

test("script job: the model only ever sees anonymised input", async () => {
  const db = memDb({ job: { id: "j1", kind: "script", order_id: "o1" }, order: ORDER });
  let seen;
  await runJob("j1", okDeps(db, { generateStory: async (input) => { seen = input; return { story: valid, attempts: 1, costUsd: 0 }; } }));
  assert.ok(!JSON.stringify(seen).includes("Ana"));
});

test("a reviewer rejection forgets the text so the retry rewrites it", async () => {
  const db = memDb({ job: { id: "j1", kind: "script", order_id: "o1" }, order: ORDER });
  const r = await runJob("j1", okDeps(db, { reviewStory: async () => ({ ok: false, issues: ["final angustioso"] }) }));
  assert.strictEqual(r.state, "pending");
  assert.strictEqual(r.failedStep, "review");
  assert.strictEqual(db.state.job.steps.text.done, false);
  assert.strictEqual(db.state.job.attempts, 1);
});

test("a completed step is not run again on resume", async () => {
  const db = memDb({
    job: { id: "j1", kind: "script", order_id: "o1", steps: { text: { done: true } } },
    order: ORDER,
    story: { id: "s1", token: "tok", stage: "script", story: valid, page_paths: {} },
  });
  let textCalls = 0;
  const r = await runJob("j1", okDeps(db, { generateStory: async () => { textCalls++; return { story: valid, attempts: 1, costUsd: 0 }; } }));
  assert.strictEqual(r.state, "done");
  assert.strictEqual(textCalls, 0);
});

test("three failures on the same step send the job to needs_review", async () => {
  const db = memDb({ job: { id: "j1", kind: "script", order_id: "o1", attempts: 2 }, order: ORDER });
  const r = await runJob("j1", okDeps(db, { generateStory: async () => { throw new Error("model down"); } }));
  assert.strictEqual(r.state, "needs_review");
  assert.match(db.state.job.error, /text: model down/);
});

// --- sample ----------------------------------------------------------------------

test("sample job: sheet + two pages (never the ending), stage becomes sample", async () => {
  const db = memDb({
    job: { id: "j2", kind: "sample", order_id: "o1", story_id: "s1" },
    order: ORDER,
    story: { id: "s1", token: "tok", stage: "script", story: { ...valid, theme: "mar" }, page_paths: {}, coloring_paths: [] },
  });
  let asked;
  const r = await runJob("j2", okDeps(db, { renderPages: async (_, refs, { indices }) => { asked = indices; return { pages: indices.map((i) => ({ index: i, buffer: PNG })), costUsd: 0.068, fallbacks: 0 }; } }));
  assert.strictEqual(r.state, "done");
  assert.deepStrictEqual(asked, SAMPLE_PAGES);
  assert.ok(!asked.includes(11), "the ending is never illustrated for free");
  assert.strictEqual(db.state.story.stage, "sample");
  assert.strictEqual(db.state.story.sheet_path, "tok/sheet.png");
  assert.deepStrictEqual(Object.keys(db.state.story.page_paths), ["0", "5"]);
  assert.strictEqual(db.state.order.status, "sample");
});

test("sample job stops for review if it blows the preview budget", async () => {
  const db = memDb({
    job: { id: "j2", kind: "sample", order_id: "o1", story_id: "s1" },
    order: ORDER,
    story: { id: "s1", token: "tok", stage: "script", story: { ...valid, theme: "mar" }, page_paths: {} },
  });
  const r = await runJob("j2", okDeps(db, { buildSheet: async () => ({ sheet: PNG, refs: [PNG], costUsd: 0.9 }) }));
  assert.strictEqual(r.state, "needs_review");
  assert.strictEqual(r.reason, "cost");
});

// --- full ------------------------------------------------------------------------

test("full job: renders the remaining 10 pages, 4 colouring pages, the PDF, then waits for approval", async () => {
  const db = memDb({
    job: { id: "j3", kind: "full", order_id: "o1", story_id: "s1" },
    order: ORDER,
    story: { id: "s1", token: "tok", stage: "sample", story: { ...valid, theme: "mar" }, sheet_path: "tok/sheet.png", page_paths: { 0: "tok/p01.png", 5: "tok/p06.png" }, coloring_paths: [] },
  });
  const asked = [];
  const r = await drain("j3", okDeps(db, { renderPages: async (_, __, { indices }) => { asked.push(...indices); return { pages: indices.map((i) => ({ index: i, buffer: PNG })), costUsd: 0.034 * indices.length, fallbacks: 0 }; } }));
  assert.strictEqual(r.state, "needs_review");
  assert.match(r.reason, /awaiting human approval/);
  assert.strictEqual(asked.length, 10);
  assert.ok(!asked.includes(0) && !asked.includes(5), "the sample pages are reused, not regenerated");
  assert.strictEqual(Object.keys(db.state.story.page_paths).length, 12);
  assert.strictEqual(db.state.story.coloring_paths.length, 4);
  assert.strictEqual(db.state.story.pdf_path, "tok/libro.pdf");
  assert.strictEqual(db.state.order.status, "needs_review");
  assert.strictEqual(db.state.story.stage, "sample", "stage only becomes full when a human approves");
});

test("full job: the PDF gets the real names and the dedication", async () => {
  const db = memDb({
    job: { id: "j3", kind: "full", order_id: "o1", story_id: "s1" },
    order: ORDER,
    story: { id: "s1", token: "tok", stage: "sample", story: { ...valid, theme: "mar" }, sheet_path: "tok/sheet.png", page_paths: Object.fromEntries([...Array(12).keys()].map((i) => [i, `tok/p${i}.png`])), coloring_paths: [] },
  });
  let seen;
  await drain("j3", okDeps(db, { renderPdf: async (args) => { seen = args; return Buffer.from("%PDF"); } }));
  assert.strictEqual(seen.personalization.name, "Ana");
  assert.strictEqual(seen.personalization.people[0].name, "Carmen");
  assert.strictEqual(seen.personalization.dedication, "Para Ana");
  assert.strictEqual(seen.images.length, 12);
  assert.strictEqual(seen.coloring.length, 4);
});

test("retouch job re-renders only the chosen pages, rebuilds the PDF and waits for approval", async () => {
  const db = memDb({
    job: { id: "j4", kind: "retouch", order_id: "o1", story_id: "s1", input: { pages: [2, 7] } },
    order: ORDER,
    story: { id: "s1", token: "tok", stage: "full", story: { ...valid, theme: "mar" }, sheet_path: "tok/sheet.png", page_paths: Object.fromEntries([...Array(12).keys()].map((i) => [i, `tok/p${i}.png`])), coloring_paths: ["a", "b", "c", "d"], pdf_path: "tok/libro.pdf" },
  });
  let asked;
  const r = await runJob("j4", okDeps(db, { renderPages: async (_, __, { indices }) => { asked = indices; return { pages: indices.map((i) => ({ index: i, buffer: PNG })), costUsd: 0.068, fallbacks: 0 }; } }));
  assert.deepStrictEqual(asked, [2, 7]);
  assert.strictEqual(r.state, "needs_review");
});

test("an unknown job kind fails cleanly", async () => {
  const db = memDb({ job: { id: "j9", kind: "dance", order_id: "o1" }, order: ORDER });
  const r = await runJob("j9", okDeps(db));
  assert.strictEqual(r.state, "failed");
});

test("a locked job is left alone", async () => {
  const db = memDb({ job: { id: "j1", kind: "script", order_id: "o1" }, order: ORDER });
  db.claimJob = async () => null;
  const r = await runJob("j1", okDeps(db));
  assert.strictEqual(r.state, "locked");
});

test("every plan ends in a notification or an approval, never in silence", () => {
  for (const [kind, steps] of Object.entries(PLAN)) {
    const last = steps[steps.length - 1];
    assert.ok(["notify", "approval"].includes(last), `${kind} ends with ${last}`);
  }
});

// The revision counter has exactly one owner: reviseHandler, which is what
// decides whether a round is available and what tells the customer how many are
// left. The text step incrementing it too spent two of the two free rounds on
// one request, and the reply said "1 left" right before refusing the next one.
test("a revision job does not touch the revision counter", async () => {
  const story = { id: "s1", order_id: "o1", token: "tok123", stage: "script", story: valid, revisions: 1, instructions: ["mas gato"], page_paths: {}, coloring_paths: [], fallbacks: 0 };
  const db = memDb({ job: { id: "j1", order_id: "o1", story_id: "s1", kind: "script", input: { revision: true } }, order: ORDER, story });
  await runJob("j1", okDeps(db));
  assert.strictEqual(db.state.story.revisions, 1, "the counter belongs to the handler alone");
});

// The free note is the one place a parent can say something the closed lists
// cannot hold. It must reach the model — and it must never carry a name.
test("anonymise passes the free note through and still strips every name", () => {
  const out = anonymise({
    name: "Ana", theme: "mar", ageBand: "6-8", gender: "nina",
    people: [{ name: "Carmen", relation: "abuela", ageBand: null }],
    dedication: "Para Ana, de la abuela",
    notes: "Le da miedo el ascensor y le encanta el color rojo",
  });
  assert.strictEqual(out.notes, "Le da miedo el ascensor y le encanta el color rojo");
  const json = JSON.stringify(out);
  assert.ok(!json.includes("Ana"), "the child's name must not travel");
  assert.ok(!json.includes("Carmen"), "a companion's name must not travel");
  assert.ok(!("dedication" in out), "the dedication is written into the PDF, not sent to the model");
});

test("anonymise drops a note that would carry a name straight through", () => {
  const out = anonymise({ theme: "mar", people: [], notes: "" });
  assert.strictEqual(out.notes, "");
});

// --- batching: the reason any of this survives a serverless wall clock -----------

test("the full job never asks for more than one batch of pages at a time", async () => {
  const db = memDb({
    job: { id: "j5", kind: "full", order_id: "o1", story_id: "s1" },
    order: ORDER,
    story: { id: "s1", token: "tok", stage: "sample", story: { ...valid, theme: "mar" }, sheet_path: "tok/sheet.png", page_paths: {}, coloring_paths: [] },
  });
  const batches = [];
  const r = await drain("j5", okDeps(db, {
    renderPages: async (_, __, { indices }) => { batches.push(indices.length); return { pages: indices.map((i) => ({ index: i, buffer: PNG })), costUsd: 0.034 * indices.length, fallbacks: 0 }; },
  }));
  assert.strictEqual(r.state, "needs_review");
  assert.ok(batches.length > 1, "twelve pages in one invocation is exactly what times out");
  assert.ok(Math.max(...batches) <= PAGE_BATCH, `a batch of ${Math.max(...batches)} is over the budget`);
  assert.strictEqual(batches.reduce((a, b) => a + b, 0), 12);
  assert.strictEqual(Object.keys(db.state.story.page_paths).length, 12);
});

test("a page that keeps failing to draw does not loop forever", async () => {
  const db = memDb({
    job: { id: "j6", kind: "full", order_id: "o1", story_id: "s1" },
    order: ORDER,
    story: { id: "s1", token: "tok", stage: "sample", story: { ...valid, theme: "mar" }, sheet_path: "tok/sheet.png", page_paths: {}, coloring_paths: [] },
  });
  let calls = 0;
  const r = await drain("j6", okDeps(db, {
    // page 2 never comes back with an image: without remembering what was
    // tried, "not drawn yet" would put it in every batch for ever.
    renderPages: async (_, __, { indices }) => {
      calls++;
      const pages = indices.map((i) => (i === 2 ? { index: i, buffer: null, fallback: true } : { index: i, buffer: PNG }));
      return { pages, costUsd: 0.034 * indices.length, fallbacks: pages.filter((p) => !p.buffer).length };
    },
  }));
  assert.ok(calls <= 4, `${calls} batches for twelve pages means it went round again`);
  assert.strictEqual(r.state, "needs_review");
  assert.strictEqual(Object.keys(db.state.story.page_paths).length, 11);
});

test("line art comes two at a time and carries on where it stopped", async () => {
  const db = memDb({
    job: { id: "j7", kind: "full", order_id: "o1", story_id: "s1", steps: { pages: { done: true } } },
    order: ORDER,
    story: { id: "s1", token: "tok", stage: "sample", story: { ...valid, theme: "mar" }, sheet_path: "tok/sheet.png", page_paths: Object.fromEntries([...Array(12).keys()].map((i) => [i, `tok/p${i}.png`])), coloring_paths: [] },
  });
  let drawn = 0;
  await drain("j7", okDeps(db, { toLineArt: async () => { drawn++; return { buffer: PNG, costUsd: 0.03 }; } }));
  assert.strictEqual(drawn, 4, "four colouring pages, no more and no fewer");
  assert.strictEqual(db.state.story.coloring_paths.length, 4);
  assert.deepStrictEqual(db.state.story.coloring_paths, ["tok/c01.png", "tok/c02.png", "tok/c03.png", "tok/c04.png"]);
});
