const { test } = require("node:test");
const assert = require("node:assert");
const { buildSheet, renderPages, mapLimit, TooManyFallbacksError, SHEET_PROMPT, PAGE_PROMPT } = require("../lib/character.js");
const { ImageBlockedError, ImageError } = require("../lib/images.js");
const story = require("./fixtures/story-valid.json");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const okImage = async () => ({ buffer: PNG, costUsd: 0.034, model: "lite" });
const yes = async () => ({ ok: true, issues: [] });
const no = async () => ({ ok: false, issues: ["3D render"] });
const withTheme = { ...story, theme: "mar" };

test("the sheet prompt describes the child and asks for four panels, no text", () => {
  const p = SHEET_PROMPT(story.character_sheet);
  assert.match(p, /curly brown hair/);
  assert.match(p, /four clean panels/);
  assert.match(p, /No text/);
});

test("the page prompt anchors appearance and outfit before the scene", () => {
  const p = PAGE_PROMPT(story.character_sheet, "on a beach");
  assert.ok(p.indexOf("curly brown hair") < p.indexOf("Scene: on a beach"));
  assert.match(p, /fluffy grey cat/);
});

test("buildSheet returns the whole sheet as the single reference", async () => {
  const r = await buildSheet(story.character_sheet, { generateImage: okImage });
  assert.strictEqual(r.refs.length, 1);
  assert.strictEqual(r.refs[0], r.sheet);
  assert.strictEqual(r.costUsd, 0.034);
});

test("renderPages renders every page in order with the judge approving", async () => {
  const r = await renderPages(withTheme, [PNG], {}, { generateImage: okImage, verifyPage: yes });
  assert.strictEqual(r.pages.length, 12);
  assert.deepStrictEqual(r.pages.map((p) => p.index), [...Array(12).keys()]);
  assert.ok(r.pages.every((p) => !p.fallback));
  assert.ok(Math.abs(r.costUsd - 12 * 0.034) < 1e-9);
});

test("renderPages can render only the requested pages (the sample)", async () => {
  const r = await renderPages(withTheme, [PNG], { indices: [0, 5] }, { generateImage: okImage, verifyPage: yes });
  assert.deepStrictEqual(r.pages.map((p) => p.index), [0, 5]);
});

test("a page rejected by the judge is regenerated once", async () => {
  let calls = 0;
  const judge = async () => (++calls === 1 ? { ok: false, issues: ["wrong style"] } : { ok: true, issues: [] });
  const r = await renderPages(withTheme, [PNG], { indices: [3] }, { generateImage: okImage, verifyPage: judge });
  assert.strictEqual(r.pages[0].fallback, false);
  assert.strictEqual(calls, 2);
  assert.ok(Math.abs(r.pages[0].costUsd - 0.068) < 1e-9, "both attempts are paid for");
});

test("a page rejected twice falls back to the catalogue and keeps the reasons", async () => {
  const r = await renderPages(withTheme, [PNG], { indices: [2] }, { generateImage: okImage, verifyPage: no });
  const p = r.pages[0];
  assert.strictEqual(p.fallback, true);
  assert.strictEqual(p.buffer, null);
  assert.match(p.fallbackPath, /assets\/img\/fallback\/mar-03\.jpg/);
  assert.ok(p.issues.length >= 2);
  assert.strictEqual(r.fallbacks, 1);
});

test("a content block falls back immediately without a second try", async () => {
  let calls = 0;
  const blocked = async () => { calls++; throw new ImageBlockedError("safety"); };
  const r = await renderPages(withTheme, [PNG], { indices: [0] }, { generateImage: blocked, verifyPage: yes });
  assert.strictEqual(r.pages[0].fallback, true);
  assert.strictEqual(calls, 1);
});

test("a transient error is retried within the page", async () => {
  let calls = 0;
  const flaky = async () => { if (++calls === 1) throw new ImageError("502"); return { buffer: PNG, costUsd: 0.034 }; };
  const r = await renderPages(withTheme, [PNG], { indices: [0] }, { generateImage: flaky, verifyPage: yes });
  assert.strictEqual(r.pages[0].fallback, false);
});

test("three or more fallbacks throw TooManyFallbacksError, with the pages attached", async () => {
  await assert.rejects(
    () => renderPages(withTheme, [PNG], { indices: [0, 1, 2, 3] }, { generateImage: okImage, verifyPage: no }),
    (e) => e instanceof TooManyFallbacksError && e.count === 4 && e.pages.length === 4 && e.costUsd > 0
  );
});

test("two fallbacks are tolerated", async () => {
  let n = 0;
  const judge = async () => (n++ < 4 ? { ok: false, issues: ["x"] } : { ok: true, issues: [] });
  const r = await renderPages(withTheme, [PNG], { indices: [0, 1, 2], concurrency: 1 }, { generateImage: okImage, verifyPage: judge });
  assert.strictEqual(r.fallbacks, 2);
});

test("verify:false skips the judge entirely", async () => {
  let judged = 0;
  const judge = async () => { judged++; return { ok: true, issues: [] }; };
  await renderPages(withTheme, [PNG], { indices: [0, 1], verify: false }, { generateImage: okImage, verifyPage: judge });
  assert.strictEqual(judged, 0);
});

test("mapLimit never runs more than the limit at once and preserves order", async () => {
  let active = 0, peak = 0;
  const out = await mapLimit([5, 1, 3, 2, 4], 2, async (ms) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, ms));
    active--;
    return ms * 10;
  });
  assert.deepStrictEqual(out, [50, 10, 30, 20, 40]);
  assert.ok(peak <= 2, `peak concurrency ${peak}`);
});

// The protagonist stayed the same across pages because the sheet described
// them. A grandmother with no sheet was re-invented in every scene.
test("with people declared, a second reference sheet pins their look too", async () => {
  const calls = [];
  const generateImage = async (args) => { calls.push(args); return { buffer: PNG, costUsd: 0.034, model: "m" }; };
  const sheet = {
    appearance: "a 6-year-old girl with curly brown hair",
    outfit: "a yellow raincoat",
    companion: "a grey cat",
    people: ["a woman in her seventies, short white hair, blue cardigan"],
  };
  const out = await buildSheet(sheet, { generateImage });
  assert.strictEqual(calls.length, 2, "one sheet for the child, one for the people");
  assert.match(calls[1].prompt, /short white hair/);
  assert.strictEqual(out.refs.length, 2, "both sheets travel as references to every page");
  assert.ok(Math.abs(out.costUsd - 0.068) < 1e-9);
});

test("with nobody declared there is no second sheet and no second cost", async () => {
  const calls = [];
  const generateImage = async (args) => { calls.push(args); return { buffer: PNG, costUsd: 0.034, model: "m" }; };
  const out = await buildSheet({ appearance: "a child", outfit: "a coat", companion: null, people: [] }, { generateImage });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(out.refs.length, 1);
});

test("the page prompt names the people by their sheet description, not by relation", async () => {
  const seen = [];
  const generateImage = async (args) => { seen.push(args.prompt); return { buffer: PNG, costUsd: 0.03, model: "m" }; };
  const story = {
    character_sheet: { appearance: "a child", outfit: "a coat", companion: null, people: ["a woman in her seventies, short white hair, blue cardigan"] },
    pages: [{ image_hint: "the kitchen at dawn" }],
  };
  await renderPages(story, [PNG, PNG], { indices: [0], verify: false }, { generateImage });
  assert.match(seen[0], /short white hair/, "the look must travel with every page");
  assert.match(seen[0], /identical/i);
});
