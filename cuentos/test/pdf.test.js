const { test } = require("node:test");
const assert = require("node:assert");
const { PDFDocument } = require("pdf-lib");
const { renderPdf, MM, PAGE_PT, substitute } = require("../lib/pdf.js");
const C = require("../lib/collection.js");
const story = require("./fixtures/story-valid.json");

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const IMAGES = Array.from({ length: 12 }, () => ({ buffer: PIXEL, fallback: false }));
const COLORING = Array.from({ length: 4 }, () => PIXEL);
const PERSON = {
  name: "Ana",
  people: [{ name: "Leo", relation: "hermano" }, { name: "Carmen", relation: "abuela" }],
  dedication: "Para Ana, que nunca deja un dibujo a medias.",
  date: "agosto de 2026",
};
const base = (over = {}) => ({ story, images: IMAGES, coloring: COLORING, personalization: PERSON, sheet: PIXEL, ...over });
const load = (buffer) => PDFDocument.load(buffer);

test("produces exactly 18 pages", async () => {
  const doc = await load(await renderPdf(base()));
  assert.strictEqual(doc.getPageCount(), C.BOOK_PAGE_COUNT);
  assert.strictEqual(C.BOOK_PAGE_COUNT, 18);
});

test("pages are 20x20 cm with no bleed", async () => {
  const doc = await load(await renderPdf(base()));
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - 200 * MM) < 0.5);
  assert.ok(Math.abs(height - PAGE_PT) < 0.5);
});

test("substitute replaces every placeholder, including both people", () => {
  const out = substitute("{{NOMBRE}} fue con {{PERSONA1}} y {{PERSONA2}}.", PERSON);
  assert.strictEqual(out, "Ana fue con Leo y Carmen.");
  assert.ok(!out.includes("{{"));
});

test("substitute refuses an unknown placeholder instead of printing it", () => {
  assert.throws(() => substitute("Hola {{APELLIDO}}", PERSON), /unknown placeholder/i);
});

test("substitute refuses to run without a name", () => {
  assert.throws(() => substitute("Hola {{NOMBRE}}", { name: "" }), /name is required/i);
});

test("a story that uses {{PERSONA2}} without a second person is rejected", async () => {
  const s = JSON.parse(JSON.stringify(story));
  s.pages[0].text = s.pages[0].text.replace("{{NOMBRE}}", "{{PERSONA2}}");
  await assert.rejects(() => renderPdf(base({ story: s, personalization: { ...PERSON, people: [PERSON.people[0]] } })), /person 2/i);
});

test("rejects the wrong number of illustrations or colouring pages", async () => {
  await assert.rejects(() => renderPdf(base({ images: IMAGES.slice(0, 11) })), /12 illustrations/);
  await assert.rejects(() => renderPdf(base({ coloring: COLORING.slice(0, 3) })), /4 colouring/);
});

test("a fallback page without a catalogue file still renders (tinted box, text intact)", async () => {
  const images = IMAGES.slice();
  images[4] = { buffer: null, fallback: true, fallbackPath: "assets/img/fallback/does-not-exist.jpg" };
  const doc = await load(await renderPdf(base({ images })));
  assert.strictEqual(doc.getPageCount(), 18);
});

test("the real name reaches the document title, with no placeholder left", async () => {
  const doc = await load(await renderPdf(base()));
  assert.match(doc.getTitle(), /Ana/);
  assert.ok(!doc.getTitle().includes("{{"));
});

test("preview differs from screen because of the watermark", async () => {
  const preview = await renderPdf(base({ mode: "preview" }));
  const screen = await renderPdf(base({ mode: "screen" }));
  assert.ok(!preview.equals(screen));
});

test("an unknown mode is rejected rather than silently defaulted", async () => {
  await assert.rejects(() => renderPdf(base({ mode: "print" })), /unknown mode/i);
});

test("works without a character sheet", async () => {
  const doc = await load(await renderPdf(base({ sheet: undefined })));
  assert.strictEqual(doc.getPageCount(), 18);
});

test("the rendered file is a real PDF", async () => {
  const buffer = await renderPdf(base());
  assert.strictEqual(buffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buffer.length > 20_000);
});
