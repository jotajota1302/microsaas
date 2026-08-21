/*
 * Renders the 18-page PDF (revision 2026-08-21: digital only, no bleed).
 *
 * Modes:
 *   screen  - the file the customer downloads
 *   preview - the same with a watermark, for the free generic sample
 *
 * This module is the ONLY place where the child's real name enters the
 * product. Everything upstream works with {{NOMBRE}} / {{PERSONA1}} / {{PERSONA2}}.
 *
 * Page map (18 pages, 20x20 cm):
 *   1        title page with dedication
 *   2-13     12 scenes: illustration on the top 58 %, text below
 *   14-17    4 colouring pages
 *   18       character card + colophon with the AI disclosure
 */

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, degrees } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const sharp = require("sharp");
const C = require("./collection.js");

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
  return String(text).replace(/\{\{[^}]*\}\}/g, (match) => {
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
  const regular = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "Andika-Regular.ttf")), { subset: false });
  const bold = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "Andika-Bold.ttf")), { subset: false });

  const title = substitute(story.title, personalization);
  doc.setTitle(title);
  doc.setCreator("cuentos");
  doc.setProducer("cuentos");

  const margin = SAFE_PT;
  const textWidth = PAGE_PT - 2 * margin;
  // The illustration sits inside a margin, like a plate on a page, instead of
  // bleeding to the top edge: bled, the page read as if the art had slipped
  // upwards and the whole spread felt off balance.
  const artBox = { x: ART_BOX.x, y: PAGE_PT - ART_BOX.top - ART_BOX.height, width: ART_BOX.width, height: ART_BOX.height };
  const textTop = artBox.y - 24;
  const textBoxHeight = artBox.y - margin - 26;

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
    const y = drawParagraph(page, {
      text: title, font: bold, size: titleSize, lineHeight: titleSize * 1.3,
      x: margin, top: PAGE_PT * 0.4, maxWidth: textWidth, align: "center",
    });
    const dedication = (personalization && personalization.dedication) || substitute(story.dedication_hint, personalization);
    drawParagraph(page, {
      text: dedication, font: regular, size: 12, lineHeight: 18,
      x: margin, top: y - 26, maxWidth: textWidth, color: MUTED, align: "center",
    });
    if (mode === "preview") stampWatermark(page, bold);
  }

  // --- 2-13. scenes ----------------------------------------------------------
  for (let i = 0; i < C.PAGE_COUNT; i++) {
    const page = newPage(doc);
    const buffer = illustrationBuffer(images[i]);
    if (buffer) {
      drawCover(page, await embedImage(doc, await cropToBox(buffer, artBox)), artBox);
      // A hairline keeps the plate from floating loose on the paper.
      page.drawRectangle({ ...artBox, borderColor: HAIR, borderWidth: 0.5, opacity: 0 });
    } else {
      page.drawRectangle({ ...artBox, color: TINT });
    }
    const text = substitute(story.pages[i].text, personalization);
    const size = fitSize(text, regular, textWidth, textBoxHeight);
    drawParagraph(page, { text, font: regular, size, lineHeight: size * 1.55, x: margin, top: textTop, maxWidth: textWidth });
    page.drawText(String(i + 1), { x: PAGE_PT / 2 - 3, y: margin - 4, size: 8, font: regular, color: MUTED });
    if (mode === "preview") stampWatermark(page, bold);
  }

  // --- 14-17. colouring pages ------------------------------------------------
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
    if (i === 0) {
      page.drawText("Para colorear", { x: margin, y: PAGE_PT - margin - 10, size: 11, font: bold, color: MUTED });
    }
    if (mode === "preview") stampWatermark(page, bold);
  }

  // --- 18. character card + colophon ----------------------------------------
  {
    const page = newPage(doc);
    const name = substitute("{{NOMBRE}}", personalization);
    let y = PAGE_PT - margin - 24;
    drawParagraph(page, { text: `Así es ${name}`, font: bold, size: 20, lineHeight: 26, x: margin, top: y, maxWidth: textWidth, align: "center" });
    y -= 40;
    if (sheet) {
      const s = await embedImage(doc, sheet);
      const box = { width: textWidth, height: PAGE_PT * 0.34 };
      const scale = Math.min(box.width / s.width, box.height / s.height);
      page.drawImage(s, { x: margin + (box.width - s.width * scale) / 2, y: y - s.height * scale, width: s.width * scale, height: s.height * scale });
      y -= s.height * scale + 24;
    }
    y = drawParagraph(page, {
      text: substitute(story.moral, personalization), font: regular, size: 12, lineHeight: 19,
      x: margin, top: y, maxWidth: textWidth, color: MUTED, align: "center",
    });
    const when = (personalization && personalization.date) || "";
    drawParagraph(page, {
      text: `Hecho para ${name}${when ? `, en ${when}` : ""}.`, font: bold, size: 12, lineHeight: 18,
      x: margin, top: margin + 58, maxWidth: textWidth, align: "center",
    });
    drawParagraph(page, {
      text: "Texto e ilustraciones generados con inteligencia artificial a partir de lo que nos contaste, y revisados a mano antes de entregarlos.",
      font: regular, size: 8.5, lineHeight: 13,
      x: margin, top: margin + 34, maxWidth: textWidth, color: MUTED, align: "center",
    });
  }

  return Buffer.from(await doc.save());
}

module.exports = { renderPdf, substitute, wrap, fitSize, MM, PAGE_PT, SAFE_PT, ART_RATIO, ART_BOX, MODES };
