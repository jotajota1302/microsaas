const { test } = require("node:test");
const assert = require("node:assert");
const { PDFDocument } = require("pdf-lib");
const { renderPdf, MM, PAGE_PT, BLEED_PT, substitute } = require("../lib/pdf.js");
const story = require("./fixtures/story-valid.json");

// A 1x1 png, enough for layout tests: we are checking geometry, not pixels.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const IMAGES = Array.from({ length: 12 }, () => ({ buffer: PIXEL, fallback: false }));
const COLORING = Array.from({ length: 4 }, () => PIXEL);
const PERSONALIZATION = {
  name: "Ana",
  companionName: "Leo",
  dedication: "Para Ana, que nunca deja un dibujo a medias.",
  date: "agosto de 2026",
};

const base = (over = {}) => ({
  story,
  images: IMAGES,
  coloring: COLORING,
  personalization: PERSONALIZATION,
  ...over,
});

async function load(buffer) {
  return PDFDocument.load(buffer);
}

test("produces exactly 32 pages", async () => {
  const doc = await load(await renderPdf(base({ mode: "screen" })));
  assert.strictEqual(doc.getPageCount(), 32);
});

test("screen mode pages are 20x20 cm with no bleed", async () => {
  const doc = await load(await renderPdf(base({ mode: "screen" })));
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - PAGE_PT) < 0.5, `width ${width} != ${PAGE_PT}`);
  assert.ok(Math.abs(height - PAGE_PT) < 0.5, `height ${height} != ${PAGE_PT}`);
});

test("print mode adds 3 mm of bleed on every side", async () => {
  const doc = await load(await renderPdf(base({ mode: "print" })));
  const { width, height } = doc.getPage(0).getSize();
  const expected = PAGE_PT + 2 * BLEED_PT;
  assert.ok(Math.abs(width - expected) < 0.5, `width ${width} != ${expected}`);
  assert.ok(Math.abs(height - expected) < 0.5);
});

test("20 cm at 3 mm bleed is the geometry we told the printer", () => {
  assert.ok(Math.abs(PAGE_PT - 200 * MM) < 0.001);
  assert.ok(Math.abs(BLEED_PT - 3 * MM) < 0.001);
});

test("substitute replaces every placeholder with the real values", () => {
  const out = substitute("{{NOMBRE}} y {{AMIGO}} miraron el mar. {{NOMBRE}} sonrió.", PERSONALIZATION);
  assert.strictEqual(out, "Ana y Leo miraron el mar. Ana sonrió.");
});

test("substitute leaves no double braces behind", () => {
  const out = substitute("Hola {{NOMBRE}}", PERSONALIZATION);
  assert.ok(!out.includes("{{"));
});

test("substitute refuses an unknown placeholder instead of printing it", () => {
  assert.throws(() => substitute("Hola {{APELLIDO}}", PERSONALIZATION), /unknown placeholder/i);
});

test("substitute refuses to run without a name", () => {
  assert.throws(() => substitute("Hola {{NOMBRE}}", { name: "" }), /name is required/i);
});

test("a story that mentions {{AMIGO}} without a companion name is rejected", async () => {
  const withFriend = JSON.parse(JSON.stringify(story));
  withFriend.pages[0].text = withFriend.pages[0].text.replace("{{NOMBRE}}", "{{AMIGO}}");
  await assert.rejects(
    () => renderPdf(base({ story: withFriend, personalization: { ...PERSONALIZATION, companionName: "" } })),
    /companion/i
  );
});

test("rejects a story with the wrong number of illustrations", async () => {
  await assert.rejects(() => renderPdf(base({ images: IMAGES.slice(0, 11) })), /12 illustrations/);
});

test("rejects the wrong number of colouring pages", async () => {
  await assert.rejects(() => renderPdf(base({ coloring: COLORING.slice(0, 3) })), /4 colouring/);
});

test("the real name reaches the document metadata, with no placeholder left", async () => {
  const doc = await load(await renderPdf(base({ mode: "screen" })));
  const title = doc.getTitle();
  assert.match(title, /Ana/);
  assert.ok(!title.includes("{{"), `placeholder leaked into the title: ${title}`);
});

test("preview differs from screen because of the watermark", async () => {
  const preview = await renderPdf(base({ mode: "preview" }));
  const screen = await renderPdf(base({ mode: "screen" }));
  assert.ok(!preview.equals(screen), "preview and screen are byte-identical: no watermark was drawn");
});

test("the rendered file is a real PDF, not an empty shell", async () => {
  const buffer = await renderPdf(base({ mode: "screen" }));
  assert.strictEqual(buffer.subarray(0, 5).toString(), "%PDF-");
  // 1x1 test images and subset fonts: ~35 KB is right. An empty shell is ~1 KB.
  assert.ok(buffer.length > 20_000, `suspiciously small: ${buffer.length} bytes`);
});

test("preview mode still produces the full 32 pages", async () => {
  const doc = await load(await renderPdf(base({ mode: "preview" })));
  assert.strictEqual(doc.getPageCount(), 32);
});

test("an unknown mode is rejected rather than silently defaulted", async () => {
  await assert.rejects(() => renderPdf(base({ mode: "poster" })), /unknown mode/i);
});
