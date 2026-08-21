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

// Measured on a real delivered book: with subset:true the embedded font lost
// almost every glyph and the pages came out as scattered letters. The font
// goes in whole. The size of the output is the cheapest reliable signal:
// a subset of this text is a few kB, the full face is a couple of hundred.
test("the font is embedded whole, not subset — a subset loses the glyphs", async () => {
  const pdf = await renderPdf(base());
  assert.ok(pdf.length > 300 * 1024, `the PDF is ${Math.round(pdf.length / 1024)} kB: the font looks subset`);
});

// Also measured there: a square illustration in a landscape box was scaled to
// cover and drawn WITHOUT clipping, so it spilled over the text underneath.
// The fix crops before embedding, so the embedded image carries the box's
// aspect ratio rather than its own.
test("a square illustration keeps its head: the crop is shallow, never a letterbox", async () => {
  // It used to be cropped to a fixed 1.70:1 band, throwing away 41 % of every
  // picture — and "attention" chose the middle, so a delivered book had the
  // parents' heads cut off. The picture now takes what the text can spare.
  const sharp = require("sharp");
  const square = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#4a7" } }).png().toBuffer();
  const pdf = await renderPdf(base({ images: Array.from({ length: 12 }, () => ({ buffer: square, fallback: false })) }));
  const doc = await PDFDocument.load(pdf);

  const sizes = [];
  for (const page of doc.getPages()) {
    const xo = page.node.Resources()?.lookup(require("pdf-lib").PDFName.of("XObject"));
    if (!xo) continue;
    for (const key of xo.keys()) {
      const img = xo.lookup(key);
      const w = img?.dict?.get(require("pdf-lib").PDFName.of("Width"))?.asNumber?.();
      const h = img?.dict?.get(require("pdf-lib").PDFName.of("Height"))?.asNumber?.();
      if (w && h) sizes.push(w / h);
    }
  }
  assert.ok(sizes.length >= 12, `found ${sizes.length} embedded images, expected at least 12`);
  const scenes = sizes.filter((r) => r > 1.05); // the sheet and the colouring pages are square
  assert.ok(scenes.length >= 12, "the scenes are cropped at all");
  const worst = Math.max(...scenes);
  assert.ok(worst <= 1.32, `a scene was cut to ${worst.toFixed(2)}:1 — that is a letterbox, and heads live at the top`);
});

// Etsy refuses a digital file over 20 MB, and the crop step used to re-encode
// every watercolour as PNG, which took a 7 MB book to nearly 17.
test("the finished book stays well under Etsy's 20 MB limit", async () => {
  const sharp = require("sharp");
  const photo = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#c8a06a" } })
    .png().toBuffer();
  const pdf = await renderPdf(base({ images: Array.from({ length: 12 }, () => ({ buffer: photo, fallback: false })) }));
  const mb = pdf.length / 1024 / 1024;
  assert.ok(mb < 12, `the book is ${mb.toFixed(1)} MB`);
});

// The illustration bled to the top edge with no air above it, and the page
// read as unbalanced. It sits inside a margin now, like a plate on a page.
test("the illustration is inset from the page edges, not bled to the top", async () => {
  const { ART_BOX } = require("../lib/pdf.js");
  assert.ok(ART_BOX.top > 0, "there must be air above the illustration");
  assert.ok(ART_BOX.x > 0, "and a margin at the sides");
  assert.ok(ART_BOX.top + ART_BOX.height < PAGE_PT, "the art must not reach the bottom either");
});

test("the book can be quoted: every letter comes back out as itself", async () => {
  // The shaper turns "fi" into one glyph and pdf-lib cannot map that back to
  // two letters, so a delivered colophon read "arti?cial" to anyone who copied
  // it. Ligatures are off; this is what proves they stay off.
  const { PDFDocument } = require("pdf-lib");
  const fontkit = require("@pdf-lib/fontkit");
  const fs = require("fs");
  const path = require("path");

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const face = fs.readFileSync(path.join(__dirname, "..", "assets", "fonts", "Andika-Regular.ttf"));
  const withLigatures = await doc.embedFont(face, { subset: false });
  const asWeEmbedIt = await doc.embedFont(face, { subset: false, features: { liga: false, clig: false, rlig: false } });

  // encodeText gives a PDF hex string, <XXXX> per glyph: four digits a glyph
  const glyphs = (font, text) => (font.encodeText(text).toString().match(/[0-9a-f]{4}/gi) || []).length;
  for (const word of ["artificial", "oficio", "filo", "afligido"]) {
    assert.strictEqual(glyphs(asWeEmbedIt, word), word.length, `${word}: letters were merged into one glyph`);
  }
  assert.ok(glyphs(withLigatures, "artificial") < "artificial".length, "the default really does ligate — the guard is not theatre");
});
