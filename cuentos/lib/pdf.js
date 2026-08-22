/*
 * Renders the 20-page PDF (revision 2026-08-21: digital only, no bleed).
 *
 * Modes:
 *   screen  - the file the customer downloads
 *   preview - the same with a watermark, for the free generic sample
 *
 * This module is the ONLY place where the child's real name enters the
 * product. Everything upstream works with {{NOMBRE}} / {{PERSONA1}} / {{PERSONA2}}.
 *
 * Page map (20 pages, 20x20 cm):
 *   1        title page
 *   2        nameplate and dedication
 *   3-14     12 scenes: illustration on the top 58 %, text below
 *   15-18    4 colouring pages
 *   19       character card
 *   20       colophon with the AI disclosure
 *
 * TWENTY, not eighteen, and the reason is printing (measured 2026-08-22).
 * A bound book is made of folded sheets of four pages, so printers ask for a
 * page count that is a MULTIPLE OF FOUR — Blurb states it outright, and it is
 * the normal requirement everywhere. At 18 every printer would have to pad the
 * book with two blanks, or refuse it. The two pages that close the gap are not
 * padding: the dedication moves off the title page onto its own, the way books
 * do it, and the character card stops sharing a page with the colophon, which
 * was the most crowded page in the book. See docs/impresion-2026-08-22.md.
 */

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, degrees } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const sharp = require("sharp");
const C = require("./collection.js");
const brand = require("./brand.js");

const MM = 72 / 25.4;
const PAGE_PT = 200 * MM; // 20 cm
const SAFE_PT = 10 * MM; // text margin
const ART_RATIO = 0.58; // share of the page height the illustration takes

/**
 * Where the illustration sits on a scene page. Inset on all four sides: the
 * art used to bleed to the top edge, which read as unbalanced against the
 * text resting on a margin below.
 */
const ART_BOX = {
  x: SAFE_PT,
  top: SAFE_PT,
  width: PAGE_PT - 2 * SAFE_PT,
  height: PAGE_PT * ART_RATIO - SAFE_PT,
};

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const ROOT = path.join(__dirname, "..");
const MODES = ["screen", "preview"];

const INK = rgb(0.16, 0.15, 0.19);
const PAPER = rgb(0.99, 0.98, 0.95);
const MUTED = rgb(0.45, 0.44, 0.48);
const TINT = rgb(0.89, 0.93, 0.91);
const HAIR = rgb(0.886, 0.863, 0.812); // the same hairline as the web

/*
 * The few words the book says in its own voice, rather than the story's.
 *
 * They were Spanish literals, so an English book — which costs more — was
 * delivered with a Spanish nameplate and a Spanish colophon. The story itself
 * was always written in the buyer's language; only the furniture was wrong.
 */
const T = {
  es: {
    belongs: (name) => `Este cuento es de ${name}`,
    thisIs: (name) => `Así es ${name}`,
    madeFor: (name, when) => `Hecho para ${name}${when ? `, en ${when}` : ""}.`,
    ai: "Texto e ilustraciones generados con inteligencia artificial a partir de lo que nos contaste, y revisados a mano antes de entregarlos.",
  },
  en: {
    belongs: (name) => `This story belongs to ${name}`,
    thisIs: (name) => `This is ${name}`,
    madeFor: (name, when) => `Made for ${name}${when ? `, in ${when}` : ""}.`,
    ai: "Text and illustrations generated with artificial intelligence from what you told us, and checked by hand before delivery.",
  },
};

const words = (locale) => T[locale === "en" ? "en" : "es"];

const PLACEHOLDERS = {
  "{{NOMBRE}}": (p) => {
    if (!p.name) throw new Error("[cuentos] name is required to render the book");
    return p.name;
  },
  "{{PERSONA1}}": (p) => {
    if (!p.people || !p.people[0] || !p.people[0].name) throw new Error("[cuentos] the story uses {{PERSONA1}} but no person 1 was given");
    return p.people[0].name;
  },
  "{{PERSONA2}}": (p) => {
    if (!p.people || !p.people[1] || !p.people[1].name) throw new Error("[cuentos] the story uses {{PERSONA2}} but no person 2 was given");
    return p.people[1].name;
  },
  // legacy marker from the first design; still resolved if present
  "{{AMIGO}}": (p) => {
    if (!p.companionName) throw new Error("[cuentos] the story uses {{AMIGO}} but no companion name was given");
    return p.companionName;
  },
};

/** Replaces the placeholders and refuses to print any it does not know. */
function substitute(text, personalization) {
  // String(undefined) is "undefined", and this function feeds the page: a
  // missing field would have been PRINTED as the word "undefined" in a book
  // somebody paid for. The validator guarantees these fields exist; this is
  // the belt for the day it stops.
  if (typeof text !== "string") throw new Error(`[cuentos] nothing to print: expected text, got ${typeof text}`);
  return text.replace(/\{\{[^}]*\}\}/g, (match) => {
    const resolve = PLACEHOLDERS[match];
    if (!resolve) throw new Error(`[cuentos] unknown placeholder ${match} — refusing to print it`);
    return resolve(personalization || {});
  });
}

function wrap(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawParagraph(page, { text, font, size, lineHeight, x, top, maxWidth, color = INK, align = "left" }) {
  let y = top;
  for (const line of wrap(text, font, size, maxWidth)) {
    const lineX = align === "center" ? x + (maxWidth - font.widthOfTextAtSize(line, size)) / 2 : x;
    page.drawText(line, { x: lineX, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

function fitSize(text, font, maxWidth, maxHeight, { max = 15, min = 10, ratio = 1.55 } = {}) {
  for (let size = max; size >= min; size -= 0.5) {
    if (wrap(text, font, size, maxWidth).length * size * ratio <= maxHeight) return size;
  }
  return min;
}

async function embedImage(doc, buffer) {
  // JPEG first: the illustrations are cropped to JPEG and the colouring
  // pages stay PNG, so try both rather than assuming either.
  try { return await doc.embedJpg(buffer); } catch { return doc.embedPng(buffer); }
}

/** Resolves a page's illustration: its buffer, the catalogue fallback, or nothing. */
function illustrationBuffer(image) {
  if (!image) return null;
  if (image.buffer) return image.buffer;
  if (image.fallbackPath) {
    const file = path.join(ROOT, image.fallbackPath);
    if (fs.existsSync(file)) return fs.readFileSync(file);
  }
  return null;
}

function newPage(doc) {
  const page = doc.addPage([PAGE_PT, PAGE_PT]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_PT, height: PAGE_PT, color: PAPER });
  return page;
}

/** Draws an image covering a box, cropping to fill rather than squashing. */
/**
 * Fills the box exactly. The image is cropped to the box's aspect ratio BEFORE
 * it is embedded, because pdf-lib has no clipping: scaling a square to cover a
 * landscape box drew it at full height over the story text underneath
 * (measured on a delivered book).
 */
async function cropToBox(buffer, box) {
  const target = box.width / box.height;
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return buffer;
  if (Math.abs(meta.width / meta.height - target) < 0.01) return buffer;

  const height = meta.width / target <= meta.height ? Math.round(meta.width / target) : meta.height;
  const width = height === meta.height ? Math.round(meta.height * target) : meta.width;
  // "attention" keeps the subject rather than the geometric middle: a centred
  // crop of a portrait scene beheads the child.
  // JPEG, not PNG: these are watercolours, and re-encoding twelve of them as
  // PNG took a 7 MB book to nearly 17, close to the 20 MB Etsy refuses.
  return sharp(buffer).resize({ width, height, fit: "cover", position: "attention" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/*
 * How a scene page is divided.
 *
 * The illustrations are square and the art box was a fixed 1.70:1 letterbox,
 * so 41 % of every picture was thrown away — and the crop chose the band with
 * the most detail, which on these watercolours is the middle: it cut the
 * parents' heads off. Reported on a delivered book.
 *
 * The picture now takes as much height as the text can spare, up to a full
 * square (no crop at all), and the text gets the rest. A short page for a
 * three-year-old gets an uncropped illustration; a long one for a ten-year-old
 * gets a slightly shallower picture instead of unreadable type.
 */
const GAP_PT = 16;

function sceneLayout(text, font) {
  const width = PAGE_PT - 2 * SAFE_PT;
  const maxArt = width; // square
  const minArt = PAGE_PT * 0.44;
  for (let art = maxArt; art >= minArt; art -= 6) {
    const top = SAFE_PT + art + GAP_PT;
    const height = PAGE_PT - SAFE_PT - top;
    if (height < 24) continue;
    const size = fitSize(text, font, width, height, { max: 14, min: 11 });
    if (wrap(text, font, size, width).length * size * 1.55 <= height) {
      return { art: { x: SAFE_PT, y: PAGE_PT - SAFE_PT - art, width, height: art }, size, textTop: PAGE_PT - top, textHeight: height };
    }
  }
  // Nothing fits comfortably: give the text the floor size and the art what is
  // left, rather than letting a paragraph run off the page.
  const art = minArt;
  const top = SAFE_PT + art + GAP_PT;
  const height = PAGE_PT - SAFE_PT - top;
  return { art: { x: SAFE_PT, y: PAGE_PT - SAFE_PT - art, width, height: art }, size: fitSize(text, font, width, height, { max: 12, min: 9 }), textTop: PAGE_PT - top, textHeight: height };
}

function drawCover(page, image, box) {
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h });
}

function stampWatermark(page, font) {
  page.drawText("MUESTRA", {
    x: PAGE_PT * 0.14, y: PAGE_PT * 0.42, size: 52, font,
    color: rgb(0.85, 0.3, 0.25), opacity: 0.22, rotate: degrees(28),
  });
}

async function renderPdf({ story, images, coloring, personalization, sheet, mode = "screen" }) {
  if (!MODES.includes(mode)) throw new Error(`[cuentos] unknown mode "${mode}" — expected ${MODES.join(", ")}`);
  if (!story || !Array.isArray(story.pages) || story.pages.length !== C.PAGE_COUNT) {
    throw new Error(`[cuentos] the story must have ${C.PAGE_COUNT} pages`);
  }
  if (!Array.isArray(images) || images.length !== C.PAGE_COUNT) {
    throw new Error(`[cuentos] expected ${C.PAGE_COUNT} illustrations, got ${images ? images.length : 0}`);
  }
  if (!Array.isArray(coloring) || coloring.length !== C.COLORING_PAGE_COUNT) {
    throw new Error(`[cuentos] expected ${C.COLORING_PAGE_COUNT} colouring pages, got ${coloring ? coloring.length : 0}`);
  }

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // NOT subset. Measured on a delivered book: subsetting this face dropped
  // almost every glyph and the pages came out as scattered single letters.
  // The whole face costs about 500 kB across the two weights, which is
  // nothing next to fourteen illustrations, and it always renders.
  //
  // Ligatures OFF, and not for looks: the shaper turns "fi" into a single
  // glyph, and pdf-lib has no way back from that glyph to two letters, so the
  // book said "artificial" on paper and gave "arti?cial" to anyone who copied
  // the text out or searched it. A children's book has to survive being
  // quoted. Reported on a delivered colophon.
  const FACE = { subset: false, features: { liga: false, clig: false, rlig: false } };
  const regular = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "Andika-Regular.ttf")), FACE);
  const bold = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "Andika-Bold.ttf")), FACE);

  const title = substitute(story.title, personalization);
  const W = words(personalization && personalization.locale);
  doc.setTitle(title);
  doc.setCreator(brand.name(personalization && personalization.locale));
  doc.setProducer(brand.name(personalization && personalization.locale));
  doc.setAuthor(brand.name(personalization && personalization.locale));

  const margin = SAFE_PT;
  const textWidth = PAGE_PT - 2 * margin;
  // The illustration sits inside a margin, like a plate on a page, instead of
  // bleeding to the top edge: bled, the page read as if the art had slipped
  // upwards and the whole spread felt off balance.
  const artBox = { x: ART_BOX.x, y: PAGE_PT - ART_BOX.top - ART_BOX.height, width: ART_BOX.width, height: ART_BOX.height };

  // --- 1. title page ---------------------------------------------------------
  {
    const page = newPage(doc);
    const sheetBuffer = sheet ? await embedImage(doc, sheet) : null;
    if (sheetBuffer) {
      const box = { x: margin, y: PAGE_PT * 0.5, width: textWidth, height: PAGE_PT * 0.38 };
      const scale = Math.min(box.width / sheetBuffer.width, box.height / sheetBuffer.height);
      page.drawImage(sheetBuffer, {
        x: box.x + (box.width - sheetBuffer.width * scale) / 2, y: box.y,
        width: sheetBuffer.width * scale, height: sheetBuffer.height * scale,
      });
    }
    const titleSize = fitSize(title, bold, textWidth, PAGE_PT * 0.2, { max: 30, min: 16, ratio: 1.3 });
    drawParagraph(page, {
      text: title, font: bold, size: titleSize, lineHeight: titleSize * 1.3,
      x: margin, top: PAGE_PT * 0.4, maxWidth: textWidth, align: "center",
    });
    if (mode === "preview") stampWatermark(page, bold);
  }

  // --- 2. nameplate and dedication -------------------------------------------
  // The page a children's book has so somebody can be told the book is theirs.
  // The dedication used to sit under the title, where it read as a subtitle.
  {
    const page = newPage(doc);
    const name = substitute("{{NOMBRE}}", personalization);
    const y = drawParagraph(page, {
      text: W.belongs(name), font: bold, size: 15, lineHeight: 22,
      x: margin, top: PAGE_PT * 0.62, maxWidth: textWidth, align: "center",
    });
    page.drawLine({
      start: { x: PAGE_PT * 0.34, y: y - 16 }, end: { x: PAGE_PT * 0.66, y: y - 16 },
      thickness: 0.75, color: HAIR,
    });
    const dedication = (personalization && personalization.dedication) || substitute(story.dedication_hint, personalization);
    drawParagraph(page, {
      text: dedication, font: regular, size: 13, lineHeight: 21,
      x: margin, top: y - 44, maxWidth: textWidth, color: MUTED, align: "center",
    });
    if (mode === "preview") stampWatermark(page, bold);
  }

  // --- 3-14. scenes ----------------------------------------------------------
  for (let i = 0; i < C.PAGE_COUNT; i++) {
    const page = newPage(doc);
    const buffer = illustrationBuffer(images[i]);
    const text = substitute(story.pages[i].text, personalization);
    const L = sceneLayout(text, regular);
    if (buffer) {
      drawCover(page, await embedImage(doc, await cropToBox(buffer, L.art)), L.art);
      // A hairline keeps the plate from floating loose on the paper.
      page.drawRectangle({ ...L.art, borderColor: HAIR, borderWidth: 0.5, opacity: 0 });
    } else {
      page.drawRectangle({ ...L.art, color: TINT });
    }
    drawParagraph(page, { text, font: regular, size: L.size, lineHeight: L.size * 1.55, x: margin, top: L.textTop, maxWidth: textWidth });
    page.drawText(String(i + 1), { x: PAGE_PT / 2 - 3, y: margin - 4, size: 8, font: regular, color: MUTED });
    if (mode === "preview") stampWatermark(page, bold);
  }

  // --- 15-18. colouring pages ------------------------------------------------
  for (let i = 0; i < C.COLORING_PAGE_COUNT; i++) {
    const page = newPage(doc);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_PT, height: PAGE_PT, color: rgb(1, 1, 1) });
    const embedded = await embedImage(doc, coloring[i]);
    const box = PAGE_PT - 2 * margin;
    const scale = Math.min(box / embedded.width, box / embedded.height);
    page.drawImage(embedded, {
      x: (PAGE_PT - embedded.width * scale) / 2, y: (PAGE_PT - embedded.height * scale) / 2,
      width: embedded.width * scale, height: embedded.height * scale,
    });
    if (mode === "preview") stampWatermark(page, bold);
  }

  // --- 19. character card ----------------------------------------------------
  // It used to share a page with the colophon: a heading, a portrait, the
  // moral, a dedication line, the AI notice and the brand, all on one page.
  {
    const page = newPage(doc);
    const name = substitute("{{NOMBRE}}", personalization);
    let y = PAGE_PT - margin - 24;
    drawParagraph(page, { text: W.thisIs(name), font: bold, size: 20, lineHeight: 26, x: margin, top: y, maxWidth: textWidth, align: "center" });
    y -= 40;
    if (sheet) {
      const s = await embedImage(doc, sheet);
      const box = { width: textWidth, height: PAGE_PT * 0.42 };
      const scale = Math.min(box.width / s.width, box.height / s.height);
      page.drawImage(s, { x: margin + (box.width - s.width * scale) / 2, y: y - s.height * scale, width: s.width * scale, height: s.height * scale });
      y -= s.height * scale + 30;
    }
    drawParagraph(page, {
      text: substitute(story.moral, personalization), font: regular, size: 13, lineHeight: 21,
      x: margin, top: y, maxWidth: textWidth, color: MUTED, align: "center",
    });
    if (mode === "preview") stampWatermark(page, bold);
  }

  // --- 20. colophon ----------------------------------------------------------
  {
    const page = newPage(doc);
    const name = substitute("{{NOMBRE}}", personalization);
    const when = (personalization && personalization.date) || "";
    drawParagraph(page, {
      text: W.madeFor(name, when), font: bold, size: 14, lineHeight: 21,
      x: margin, top: PAGE_PT * 0.56, maxWidth: textWidth, align: "center",
    });
    drawParagraph(page, {
      // A shade narrower than the page's measure: a small legal notice set to
      // the full width reads as body text the reader is meant to skip.
      text: W.ai, font: regular, size: 9.5, lineHeight: 15,
      x: margin + textWidth * 0.07, top: PAGE_PT * 0.44, maxWidth: textWidth * 0.86, color: MUTED, align: "center",
    });
    drawParagraph(page, {
      text: `${brand.name(personalization && personalization.locale)} · ${brand.DOMAIN}`,
      font: bold, size: 9, lineHeight: 13,
      x: margin, top: margin + 16, maxWidth: textWidth, color: MUTED, align: "center",
    });
    if (mode === "preview") stampWatermark(page, bold);
  }

  return Buffer.from(await doc.save());
}

module.exports = { renderPdf, substitute, wrap, fitSize, words, MM, PAGE_PT, SAFE_PT, ART_RATIO, ART_BOX, MODES };
