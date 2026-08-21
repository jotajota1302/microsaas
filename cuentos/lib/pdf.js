/*
 * Renders the 32-page book.
 *
 * Three modes:
 *   screen  - 20x20 cm, RGB, for the customer's download
 *   print   - same page plus 3 mm bleed on every side, for the press
 *   preview - screen with a watermark, for the free sample
 *
 * This module is the ONLY place where the child's real name enters the
 * product. Everything upstream works with {{NOMBRE}} / {{AMIGO}}.
 *
 * Page map (32 pages):
 *   1        title page with dedication
 *   2-25     12 spreads: illustration on the even page, text on the odd one
 *   26-29    4 colouring pages
 *   30       character card
 *   31       colophon: made for X, QR, AI disclosure
 *   32       blank inside back cover
 */

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, degrees } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const C = require("./collection.js");

const MM = 72 / 25.4; // points per millimetre
const PAGE_PT = 200 * MM; // 20 cm
const BLEED_PT = 3 * MM;
const SAFE_PT = 10 * MM; // keep text this far from the trim

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const MODES = ["screen", "print", "preview"];

const INK = rgb(0.16, 0.15, 0.19);
const PAPER = rgb(0.99, 0.98, 0.95);
const MUTED = rgb(0.45, 0.44, 0.48);

const PLACEHOLDERS = {
  "{{NOMBRE}}": (p) => {
    if (!p.name) throw new Error("[cuentos] name is required to render the book");
    return p.name;
  },
  "{{AMIGO}}": (p) => {
    if (!p.companionName) {
      throw new Error("[cuentos] the story uses {{AMIGO}} but no companion name was given");
    }
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

/** Greedy word wrap against the embedded font's real metrics. */
function wrap(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawParagraph(page, { text, font, size, lineHeight, x, top, maxWidth, color = INK, align = "left" }) {
  const lines = wrap(text, font, size, maxWidth);
  let y = top;
  for (const line of lines) {
    let lineX = x;
    if (align === "center") {
      lineX = x + (maxWidth - font.widthOfTextAtSize(line, size)) / 2;
    }
    page.drawText(line, { x: lineX, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

/** Text size that makes the page text fill its box without overflowing. */
function fitSize(text, font, maxWidth, maxHeight, { max = 17, min = 11, ratio = 1.62 } = {}) {
  for (let size = max; size >= min; size -= 0.5) {
    const lines = wrap(text, font, size, maxWidth);
    if (lines.length * size * ratio <= maxHeight) return size;
  }
  return min;
}

async function embedImage(doc, buffer) {
  try {
    return await doc.embedPng(buffer);
  } catch {
    return doc.embedJpg(buffer);
  }
}

function newPage(doc, bleed) {
  const side = PAGE_PT + 2 * bleed;
  const page = doc.addPage([side, side]);
  page.drawRectangle({ x: 0, y: 0, width: side, height: side, color: PAPER });
  return page;
}

/** Covers the whole page including bleed, cropping to fill rather than squashing. */
function drawFullBleed(page, image, bleed) {
  const side = PAGE_PT + 2 * bleed;
  const scale = Math.max(side / image.width, side / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: (side - width) / 2,
    y: (side - height) / 2,
    width,
    height,
  });
}

function stampWatermark(page, font, bleed) {
  const side = PAGE_PT + 2 * bleed;
  page.drawText("MUESTRA", {
    x: side * 0.12,
    y: side * 0.42,
    size: 54,
    font,
    color: rgb(0.85, 0.3, 0.25),
    opacity: 0.22,
    rotate: degrees(28),
  });
}

async function renderPdf({ story, images, coloring, personalization, mode = "screen" }) {
  if (!MODES.includes(mode)) {
    throw new Error(`[cuentos] unknown mode "${mode}" — expected ${MODES.join(", ")}`);
  }
  if (!story || !Array.isArray(story.pages) || story.pages.length !== C.PAGE_COUNT) {
    throw new Error(`[cuentos] the story must have ${C.PAGE_COUNT} pages`);
  }
  if (!Array.isArray(images) || images.length !== C.PAGE_COUNT) {
    throw new Error(`[cuentos] expected ${C.PAGE_COUNT} illustrations, got ${images ? images.length : 0}`);
  }
  if (!Array.isArray(coloring) || coloring.length !== C.COLORING_PAGE_COUNT) {
    throw new Error(`[cuentos] expected ${C.COLORING_PAGE_COUNT} colouring pages, got ${coloring ? coloring.length : 0}`);
  }

  const bleed = mode === "print" ? BLEED_PT : 0;
  const side = PAGE_PT + 2 * bleed;
  const margin = bleed + SAFE_PT;
  const textWidth = side - 2 * margin;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "Andika-Regular.ttf")), { subset: true });
  const bold = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, "Andika-Bold.ttf")), { subset: true });

  doc.setTitle(substitute(story.title, personalization));
  doc.setCreator("cuentos");
  doc.setProducer("cuentos");

  // --- 1. title page ---------------------------------------------------------
  {
    const page = newPage(doc, bleed);
    const title = substitute(story.title, personalization);
    const titleSize = fitSize(title, bold, textWidth, side * 0.28, { max: 34, min: 18 });
    let y = drawParagraph(page, {
      text: title, font: bold, size: titleSize, lineHeight: titleSize * 1.3,
      x: margin, top: side * 0.68, maxWidth: textWidth, align: "center",
    });

    const dedication = personalization && personalization.dedication
      ? personalization.dedication
      : substitute(story.dedication_hint, personalization);
    drawParagraph(page, {
      text: dedication, font: regular, size: 13, lineHeight: 20,
      x: margin, top: y - 34, maxWidth: textWidth, color: MUTED, align: "center",
    });

    if (mode === "preview") stampWatermark(page, bold, bleed);
  }

  // --- 2-25. twelve spreads --------------------------------------------------
  for (let i = 0; i < C.PAGE_COUNT; i++) {
    const imagePage = newPage(doc, bleed);
    const embedded = await embedImage(doc, images[i].buffer);
    drawFullBleed(imagePage, embedded, bleed);
    if (mode === "preview") stampWatermark(imagePage, bold, bleed);

    const textPage = newPage(doc, bleed);
    const text = substitute(story.pages[i].text, personalization);
    const boxHeight = side - 2 * margin - 40;
    const size = fitSize(text, regular, textWidth, boxHeight);
    const lines = wrap(text, regular, size, textWidth);
    const blockHeight = lines.length * size * 1.62;
    drawParagraph(textPage, {
      text, font: regular, size, lineHeight: size * 1.62,
      x: margin, top: (side + blockHeight) / 2 - size, maxWidth: textWidth,
    });
    textPage.drawText(String(i + 1), {
      x: side / 2, y: margin - 6, size: 9, font: regular, color: MUTED,
    });
    if (mode === "preview") stampWatermark(textPage, bold, bleed);
  }

  // --- 26-29. colouring pages ------------------------------------------------
  for (let i = 0; i < C.COLORING_PAGE_COUNT; i++) {
    const page = newPage(doc, bleed);
    const embedded = await embedImage(doc, coloring[i]);
    const box = side - 2 * margin;
    const scale = Math.min(box / embedded.width, box / embedded.height);
    page.drawImage(embedded, {
      x: (side - embedded.width * scale) / 2,
      y: (side - embedded.height * scale) / 2,
      width: embedded.width * scale,
      height: embedded.height * scale,
    });
    if (i === 0) {
      page.drawText("Para colorear", {
        x: margin, y: side - margin - 12, size: 12, font: bold, color: MUTED,
      });
    }
    if (mode === "preview") stampWatermark(page, bold, bleed);
  }

  // --- 30. character card ----------------------------------------------------
  {
    const page = newPage(doc, bleed);
    const name = substitute("{{NOMBRE}}", personalization);
    drawParagraph(page, {
      text: `Así es ${name}`, font: bold, size: 24, lineHeight: 30,
      x: margin, top: side * 0.62, maxWidth: textWidth, align: "center",
    });
    drawParagraph(page, {
      text: substitute(story.moral, personalization), font: regular, size: 13, lineHeight: 21,
      x: margin, top: side * 0.5, maxWidth: textWidth, color: MUTED, align: "center",
    });
    if (mode === "preview") stampWatermark(page, bold, bleed);
  }

  // --- 31. colophon ----------------------------------------------------------
  {
    const page = newPage(doc, bleed);
    const name = substitute("{{NOMBRE}}", personalization);
    const when = (personalization && personalization.date) || "";
    drawParagraph(page, {
      text: `Hecho para ${name}${when ? `, en ${when}` : ""}.`,
      font: bold, size: 14, lineHeight: 22,
      x: margin, top: side * 0.58, maxWidth: textWidth, align: "center",
    });
    drawParagraph(page, {
      text:
        "Este cuento es único: se ha escrito e ilustrado con inteligencia artificial " +
        "a partir de lo que nos contaste, y se ha revisado a mano antes de imprimirlo.",
      font: regular, size: 10, lineHeight: 16,
      x: margin, top: side * 0.46, maxWidth: textWidth, color: MUTED, align: "center",
    });
  }

  // --- 32. blank -------------------------------------------------------------
  newPage(doc, bleed);

  return Buffer.from(await doc.save());
}

module.exports = { renderPdf, substitute, wrap, fitSize, MM, PAGE_PT, BLEED_PT, SAFE_PT, MODES };
