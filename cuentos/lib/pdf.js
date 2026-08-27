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

/*
 * Line breaking is memoised per font, and it is not a micro-optimisation.
 *
 * sceneLayout searches ~30 art heights and, for each, fitSize tries 7 type
 * sizes — so one page asks for the same wrap over two hundred times, and every
 * ask shapes the paragraph word by word through fontkit on a face that is NOT
 * subset. Measured: thirty seconds to lay out twelve pages, which on Vercel's
 * slower CPU went past the 60 s function limit and left the job wedged,
 * retrying the same doomed step for ever (27-08-2026).
 *
 * The cache changes nothing about the output — same font, same size, same
 * measure, same lines — it just stops asking the same question. The map hangs
 * off the font object, so it dies with the document.
 */
const WRAP_CACHE = new WeakMap();

function wrap(text, font, size, maxWidth) {
  let byFont = WRAP_CACHE.get(font);
  if (!byFont) { byFont = new Map(); WRAP_CACHE.set(font, byFont); }
  const key = `${size}|${maxWidth}|${text}`;
  const hit = byFont.get(key);
  if (hit) return hit;
  const lines = wrapUncached(text, font, size, maxWidth);
  byFont.set(key, lines);
  return lines;
}

function wrapUncached(text, font, size, maxWidth) {
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
  // Square plate, square illustration: nothing to crop, but it still has to be
  // re-encoded. Handing the raw PNG to pdf-lib took the book from 4.5 MB to
  // 7.6 MB the day the box became square — and Etsy refuses a file over 20 MB.
  if (Math.abs(meta.width / meta.height - target) < 0.01) {
    return sharp(buffer).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  }

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
 * The fix after that took the picture as high as the text could spare, which
 * turned out to be the same mistake wearing a different hat: the search
 * started at the biggest possible picture and shrank it only until the words
 * fitted AT THE SMALLEST TYPE ALLOWED. The text was never a claimant, only a
 * remainder. Measured over a delivered book: the plate took 68 % of the page
 * height on average and every single one of the twelve pages came out at the
 * 11 pt floor, packed edge to edge under the picture like a caption.
 *
 * So the order is reversed. The type is chosen first — the largest body size
 * the page can carry — and the picture takes what is left, with a floor so it
 * never becomes a stamp and a ceiling so a two-line page does not become a
 * poster. Same book, now 13.5-14 pt type and a plate around half the page.
 *
 * The plate is SQUARE and centred, not full measure. The illustrations are
 * square, so any other box crops them: the old full-width band at 68 % height
 * was throwing away a quarter of every picture to look big. A smaller square
 * shows more of the drawing than a bigger letterbox does.
 */
const GAP_PT = 24; // between the plate and the first line of text
const FOOT_PT = 14; // room under the text for the page number
const BODY_MAX = 17; // a page with thirty words is a toddler's page: big type
const BODY_MIN = 11.5;
const BODY_FLOOR = 10; // only for the longest pages of the oldest band
const LEAD = 1.6; // a child reads line by line; the leading is generous on purpose
const ART_MAX = 0.58; // of the page height — beyond this the text is a caption again
const ART_MIN = 0.44; // below this the picture stops carrying the page
const ART_FLOOR = 0.36; // and below THIS nothing fits at all, so something must give
const ART_ASPECT = 1.32; // how wide the plate may be for its height — see sceneLayout

const room = (textHeight) => PAGE_PT - SAFE_PT - GAP_PT - textHeight - (SAFE_PT + FOOT_PT);

function textHeightAt(text, font, size) {
  return wrap(text, font, size, PAGE_PT - 2 * SAFE_PT).length * size * LEAD;
}

/**
 * ONE body size for the whole book: the largest that leaves every page a
 * picture worth printing.
 *
 * Sizing each page on its own read as a mistake — a four-line page at 17 pt
 * facing a nine-line page at 13 pt looks like two different books. What varies
 * from page to page in a picture book is how much room the picture takes, not
 * how big the letters are. So the type is decided once, by the page that needs
 * the most room, and every page is set in it.
 */
function bookBodySize(texts, font) {
  const fits = (size, floor) => texts.every((t) => room(textHeightAt(t, font, size)) >= PAGE_PT * floor);
  for (let size = BODY_MAX; size >= BODY_MIN; size -= 0.5) if (fits(size, ART_MIN)) return size;
  // The longest pages of the oldest band do not fit at 11.5 pt beside a
  // picture that size. Ten point is still comfortable at that age; a picture
  // below the floor is not a picture any more, so the type gives first.
  for (let size = BODY_MIN - 0.5; size >= BODY_FLOOR; size -= 0.5) if (fits(size, ART_FLOOR)) return size;
  return BODY_FLOOR;
}

/*
 * The plate shrinks in BOTH directions, and that is the whole point.
 *
 * Three things cannot all be true at once, because the illustrations come out
 * of the model square:
 *
 *   full measure  ·  shallow crop  ·  room for readable type
 *
 * Full measure at a safe 1.32:1 needs 68 % of the page height, which is the
 * book that was delivered: 11 pt type packed underneath like a caption. Full
 * measure at half the height means a 1.73:1 letterbox, and a letterbox on
 * these watercolours is what cut the parents' heads off on an earlier
 * delivered book. A square plate keeps every pixel but is 22 % of the page,
 * and then the picture stops being the point of the page.
 *
 * So the plate keeps its aspect ratio and gets smaller: it is as wide as
 * ART_ASPECT allows for the height the text leaves it, centred, never wider
 * than the measure. The crop stays exactly as shallow as it is today.
 *
 * The way to stop paying for this at all is not a layout change: it is to stop
 * generating square art for a hole that is not square — the image model takes
 * an aspect ratio, and lib/images.js already passes one.
 */
function sceneLayout(text, font, size) {
  const measure = PAGE_PT - 2 * SAFE_PT;
  const body = size || bookBodySize([text], font);
  const free = room(textHeightAt(text, font, body));
  const height = Math.max(PAGE_PT * ART_FLOOR, Math.min(free, PAGE_PT * ART_MAX));
  const width = Math.min(measure, height * ART_ASPECT);
  const top = SAFE_PT + height + GAP_PT;
  return {
    // Centred, because the plate is narrower than the measure of the text.
    art: { x: SAFE_PT + (measure - width) / 2, y: PAGE_PT - SAFE_PT - height, width, height },
    size: body,
    lead: body * LEAD,
    textTop: PAGE_PT - top,
    textHeight: PAGE_PT - (SAFE_PT + FOOT_PT) - top,
  };
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
  const scenes = story.pages.map((p) => substitute(p.text, personalization));
  const body = bookBodySize(scenes, regular);
  for (let i = 0; i < C.PAGE_COUNT; i++) {
    const page = newPage(doc);
    const buffer = illustrationBuffer(images[i]);
    const text = scenes[i];
    const L = sceneLayout(text, regular, body);
    if (buffer) {
      drawCover(page, await embedImage(doc, await cropToBox(buffer, L.art)), L.art);
      // A hairline keeps the plate from floating loose on the paper.
      page.drawRectangle({ ...L.art, borderColor: HAIR, borderWidth: 0.5, opacity: 0 });
    } else {
      page.drawRectangle({ ...L.art, color: TINT });
    }
    drawParagraph(page, { text, font: regular, size: L.size, lineHeight: L.lead, x: margin, top: L.textTop, maxWidth: textWidth });
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

module.exports = { renderPdf, substitute, wrap, fitSize, sceneLayout, bookBodySize, words, MM, PAGE_PT, SAFE_PT, ART_MIN, ART_MAX, BODY_MIN, BODY_MAX, MODES };
