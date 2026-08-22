/*
 * The comic, as a PDF, built on the server with no browser involved.
 *
 * The demo made its PDF by writing HTML and handing it to headless Chrome.
 * That cannot ship: Chrome is not on the serverless runtime, and putting it
 * there to draw fourteen pages of rectangles is a 300 MB dependency for a job
 * that is arithmetic.
 *
 * So the division of labour is:
 *   sharp     crops each panel to the shape of its cell (and shaves the edge,
 *             because image-01 leaves a signature in a corner now and then)
 *   pdf-lib   places the panels and draws every bubble as VECTOR
 *
 * Drawing the text with pdf-lib rather than rasterising it buys two things
 * that matter more than they sound. The lettering stays sharp at any zoom on a
 * phone, and it needs no fonts installed on the machine — a rasterised bubble
 * depends on whatever librsvg finds on the runtime, which on a Linux function
 * is usually not what it found on this laptop.
 *
 * The lettering uses REAL embedded faces (assets/fonts, both SIL Open Font
 * License, which explicitly permits embedding in a document):
 *
 *   Bangers            the cover title. It is already the brand's face on the
 *                      landing, so the comic and the site look like one thing.
 *   Barlow Condensed   every bubble. Condensed is not a taste: at the same
 *                      point size it fits about a fifth more characters per
 *                      line than Helvetica, which makes each bubble smaller,
 *                      which means less of the drawing is covered by it.
 *
 * Embedding also retires the WinAnsi problem. The standard fonts could only
 * render Latin-1, so proper quotes, dashes and ellipses had to be folded down
 * to ASCII before drawing; an embedded TrueType subset renders them, and
 * Spanish dialogue reads noticeably better with « » and — in it.
 */

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const sharp = require("sharp");
const L = require("./layout.js");
const letterer = require("./letterer.js");
const { keys } = require("./blobs.js");

const MM = 2.834645669291339; // points per millimetre
const mm = (v) => v * MM;

// Read on a phone, delivered through an email link, so weight matters as much
// as sharpness. Both are knobs because the printed edition will want 300/90.
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

const DPI = Number(process.env.PDF_DPI || 200);
const QUALITY = Number(process.env.PDF_QUALITY || 78);

const INK = rgb(0.07, 0.07, 0.07);
const PAPER = rgb(0.957, 0.945, 0.918); // #F4F1EA
const WHITE = rgb(1, 1, 1);
const RED = rgb(0.776, 0.157, 0.157); // #C62828
const SHOUT = rgb(0.718, 0.11, 0.11); // #B71C1C
const CAPTION_BG = rgb(1, 0.914, 0.659); // #FFE9A8

// Bubbles are placed by measuring the drawing (lib/letterer.js). These are the
// same six anchors, as a fraction of the panel box.
const ANCHORS = {
  "top-left": { ax: 0, ay: 0 },
  "top-center": { ax: 0.5, ay: 0 },
  "top-right": { ax: 1, ay: 0 },
  "bottom-left": { ax: 0, ay: 1 },
  "bottom-center": { ax: 0.5, ay: 1 },
  "bottom-right": { ax: 1, ay: 1 },
};

/*
 * With embedded fonts almost nothing needs folding: Barlow and Bangers carry
 * the full Latin set plus real punctuation, so the guillemets, em dashes and
 * ellipses a Spanish script is full of now DRAW instead of being flattened to
 * ASCII. That folding existed only because the standard PDF fonts are WinAnsi.
 *
 * What is left is the handful of invisible characters a language model emits,
 * which have no glyph in either face and would either draw nothing or throw.
 *
 * The name stays because every caller says winAnsi(); it no longer describes
 * an encoding, it describes "make this safe to draw".
 */
const FOLD = [
  [new RegExp("[" + String.fromCharCode(0x200b, 0x200c, 0x200d, 0xfeff) + "]", "g"), ""],
  [new RegExp(String.fromCharCode(0xa0), "g"), " "],   // nbsp: a real space wraps
  [new RegExp("[" + String.fromCharCode(0x2028, 0x2029) + "]", "g"), " "],
];
function winAnsi(text) {
  let s = String(text == null ? "" : text);
  for (const [re, to] of FOLD) s = s.replace(re, to);
  return s;
}

/** Greedy wrap using the font's real metrics, so nothing overflows its bubble. */
function wrap(text, font, size, maxWidth) {
  const words = winAnsi(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** A rounded rectangle in SVG coordinates (y down), for page.drawSvgPath. */
function roundedRect(w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  return `M ${k} 0 H ${w - k} A ${k} ${k} 0 0 1 ${w} ${k} V ${h - k} ` +
    `A ${k} ${k} 0 0 1 ${w - k} ${h} H ${k} A ${k} ${k} 0 0 1 0 ${h - k} ` +
    `V ${k} A ${k} ${k} 0 0 1 ${k} 0 Z`;
}

/** The jagged burst a shout gets, same silhouette as the demo's clip-path. */
function burst(w, h) {
  const pts = [[3, 0], [97, 4], [100, 50], [96, 100], [40, 96], [4, 100], [0, 48]];
  return pts.map(([px, py], i) => `${i ? "L" : "M"} ${(px / 100) * w} ${(py / 100) * h}`).join(" ") + " Z";
}

/**
 * The four faces, embedded, falling back to the standard ones.
 *
 * The fallback is not defensive padding: a missing font file must degrade the
 * lettering, never lose a comic somebody has paid for. `subset: true` keeps
 * only the glyphs actually used, which is what stops four TrueType faces
 * adding a megabyte to every PDF.
 */
async function loadFonts(pdf) {
  const file = (name) => path.join(FONT_DIR, name);
  try {
    pdf.registerFontkit(fontkit);
    const embed = (name) => pdf.embedFont(fs.readFileSync(file(name)), { subset: true });
    return {
      display: await embed("Bangers-Regular.ttf"),
      bold: await embed("BarlowCondensed-Bold.ttf"),
      regular: await embed("BarlowCondensed-SemiBold.ttf"),
      italic: await embed("BarlowCondensed-SemiBoldItalic.ttf"),
      embedded: true,
    };
  } catch (e) {
    console.warn(`[comic] no he podido incrustar las tipografías, uso las estándar: ${e.message}`);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    return {
      display: bold,
      bold,
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      embedded: false,
    };
  }
}

/**
 * Crops one panel to the shape of the cell it goes in.
 *
 * The 3 % inset is not cosmetic: MiniMax occasionally signs a corner, and a
 * signature on a page somebody paid 14,99 EUR for is worse than losing three
 * per cent of the drawing. `position: attention` lets sharp keep the busiest
 * part of the frame, which for a comic panel is the figure.
 */
async function fitPanel(buffer, rect) {
  const img = sharp(buffer, { failOn: "none" });
  const meta = await img.metadata();
  const inset = 0.03;
  const left = Math.round(meta.width * inset);
  const top = Math.round(meta.height * inset);
  const cropped = await img
    .extract({
      left, top,
      width: Math.max(1, meta.width - left * 2),
      height: Math.max(1, meta.height - top * 2),
    })
    .toBuffer();

  /*
   * Resolution is chosen from the size the panel will actually be printed at,
   * capped at the source's own 1024 px. Never upscale — stretching a 1024 px
   * drawing to print size adds megabytes and blur without adding detail.
   *
   * 200 dpi rather than 300 because this is read on a phone, and the whole
   * comic has to arrive through a mail link. The first version asked for 1024
   * on every panel regardless of its size and produced an 11,6 MB file for
   * fourteen pages; this is the same pages at about a third of that.
   */
  const longMm = Math.max(rect.w, rect.h);
  const long = Math.min(1024, Math.round((longMm / 25.4) * DPI));
  const target = rect.w >= rect.h
    ? { w: long, h: Math.round((long * rect.h) / rect.w) }
    : { h: long, w: Math.round((long * rect.w) / rect.h) };

  return sharp(cropped)
    .resize(target.w, target.h, { fit: "cover", position: "attention" })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();
}

/** One bubble, drawn into a panel box given in PDF points. */
function drawBubble(page, fonts, bubble, at, box, heroName) {
  const isCaption = bubble.type === "caption";
  const isShout = bubble.type === "shout";
  const isThought = bubble.type === "thought";

  const size = isCaption ? mm(2.6) : mm(2.7);
  const font = isCaption ? fonts.italic : fonts.bold;
  const padX = mm(1.9);
  const padY = mm(1.3);
  const maxText = box.w * 0.44 - padX * 2;

  const text = isCaption ? winAnsi(bubble.text) : winAnsi(bubble.text).toUpperCase();
  const lines = wrap(text, font, size, maxText);
  const lineH = size * 1.15;

  /*
   * The speaker label goes on other characters only. Real comics never tag the
   * protagonist's own bubbles, and the model fills `who` with the hero's name
   * on every single line — with the label on, every page read like a
   * screenplay rather than a comic.
   */
  const raw = (bubble.who || "").trim();
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}]/gu, "");
  const label = raw && !(heroName && norm(raw) === norm(heroName)) ? winAnsi(raw).toUpperCase() : "";
  const labelSize = size * 0.85;

  const textW = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size)),
    label ? fonts.bold.widthOfTextAtSize(label, labelSize) : 0);
  const w = textW + padX * 2;
  const h = lines.length * lineH + (label ? labelSize * 1.2 : 0) + padY * 2;

  const anchor = ANCHORS[at] || ANCHORS["bottom-center"];
  const margin = 0.04;
  // x from the panel's left edge; ax slides the box from left to right.
  const x = box.x + box.w * margin + (box.w * (1 - margin * 2) - w) * anchor.ax;
  // PDF y grows upwards, so the top anchor is the far one from the origin.
  const yTop = anchor.ay === 0
    ? box.y + box.h - box.h * margin
    : box.y + box.h * margin + h;

  const shape = {
    x, y: yTop,
    borderColor: INK,
    borderWidth: isShout ? mm(1.1) : mm(0.9),
    color: isCaption ? CAPTION_BG : WHITE,
  };
  if (isThought) shape.borderDashArray = [mm(1.6), mm(1.1)];
  if (isShout) shape.rotate = degrees(-2);

  const path = isShout ? burst(w, h) : roundedRect(w, h, isThought ? mm(7) : isCaption ? mm(1.2) : mm(4));
  page.drawSvgPath(path, shape);

  let cursor = yTop - padY;
  if (label) {
    cursor -= labelSize;
    page.drawText(label, { x: x + padX, y: cursor, size: labelSize, font: fonts.bold, color: RED });
    cursor -= labelSize * 0.2;
  }
  for (const line of lines) {
    cursor -= size;
    page.drawText(line, {
      x: x + padX,
      y: cursor,
      size,
      font,
      color: isShout ? SHOUT : INK,
    });
    cursor -= lineH - size;
  }
}

/** Centred text, wrapped, returning the y it finished at. */
function drawCentred(page, text, { font, size, y, colour, maxWidth, pageW, lineGap = 1.25 }) {
  const lines = wrap(text, font, size, maxWidth);
  let cursor = y;
  for (const line of lines) {
    const w = font.widthOfTextAtSize(line, size);
    page.drawText(line, { x: (pageW - w) / 2, y: cursor, size, font, color: colour });
    cursor -= size * lineGap;
  }
  return cursor;
}

/**
 * Builds the whole PDF.
 *
 * @param story   the validated story JSON
 * @param images  Map<blobKey, Buffer> — every panel and the cover
 * @param opts    { token, brand }
 * @returns {Promise<{ bytes: Buffer, missing: string[] }>}
 */
async function buildPdf({ story, images, token, brand = "MyOwnManga" }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${story.title} - ${story.hero.name}`);
  pdf.setAuthor(brand);
  pdf.setSubject(story.logline || "");
  pdf.setCreator(brand);
  pdf.setProducer(brand);

  const fonts = await loadFonts(pdf);

  const W = mm(L.PAGE.w);
  const H = mm(L.PAGE.h);
  const missing = [];

  /*
   * Everything reaching here has been through fitPanel, which always emits
   * JPEG, so this embeds those exact bytes. The first version re-encoded once
   * more "to be sure it is a JPEG" — every panel compressed twice, for nothing
   * but generation loss and a third of the file size.
   */
  const embed = (jpegBuffer) => pdf.embedJpg(jpegBuffer);

  // --- cover ------------------------------------------------------------------
  const coverBuf = images.get(keys.cover(token));
  const cover = pdf.addPage([W, H]);
  cover.drawRectangle({ x: 0, y: 0, width: W, height: H, color: INK });
  if (coverBuf) {
    const fitted = await fitPanel(coverBuf, { w: L.PAGE.w, h: L.PAGE.h });
    const img = await embed(fitted);
    cover.drawImage(img, { x: 0, y: 0, width: W, height: H });
  } else {
    missing.push(keys.cover(token));
  }
  // No gradients in PDF, so the legibility band is one flat scrim. It has to be
  // there: white display type over an unknown drawing is a coin flip.
  cover.drawRectangle({ x: 0, y: H - mm(78), width: W, height: mm(78), color: INK, opacity: 0.62 });

  drawCentred(cover, story.subtitle || "", {
    font: fonts.bold, size: mm(4), y: H - mm(18), colour: rgb(0.9, 0.9, 0.9),
    maxWidth: W - mm(20), pageW: W,
  });
  // The red offset behind the title is the demo's text-shadow, drawn as a
  // second pass because a PDF has no shadows.
  // Bangers is all-caps by design and already quite wide, so it gets a
  // smaller point size than Helvetica needed for the same line.
  const titleSize = mm(fonts.embedded ? 11 : 13);
  const title = winAnsi(story.title).toUpperCase();
  const titleLines = wrap(title, fonts.display, titleSize, W - mm(16));
  let ty = H - mm(32);
  for (const line of titleLines) {
    const lw = fonts.display.widthOfTextAtSize(line, titleSize);
    const lx = (W - lw) / 2;
    cover.drawText(line, { x: lx + mm(1.5), y: ty - mm(1.5), size: titleSize, font: fonts.display, color: RED });
    cover.drawText(line, { x: lx, y: ty, size: titleSize, font: fonts.display, color: WHITE });
    ty -= titleSize * 1.1;
  }
  drawCentred(cover, `protagonista: ${story.hero.name}, ${story.hero.age} años`, {
    font: fonts.regular, size: mm(3.2), y: ty - mm(4), colour: rgb(0.88, 0.88, 0.88),
    maxWidth: W - mm(20), pageW: W,
  });

  // --- the pages --------------------------------------------------------------
  for (const [pi, storyPage] of story.pages.entries()) {
    const page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });

    const rects = L.panelRects(storyPage.layout, storyPage.panels.length);

    for (const [qi, panel] of storyPage.panels.entries()) {
      const rect = rects[qi];
      // PDF measures y from the bottom; the layout measures it from the top.
      const box = { x: mm(rect.x), y: H - mm(rect.y + rect.h), w: mm(rect.w), h: mm(rect.h) };
      const key = keys.panel(token, pi, qi);
      const buf = images.get(key);

      if (buf) {
        const fitted = await fitPanel(buf, rect);
        page.drawImage(await embed(fitted), { x: box.x, y: box.y, width: box.w, height: box.h });
      } else {
        // A hole in the middle of a page is a broken product, but so is a page
        // that silently renumbers itself. The cell stays, empty and obvious.
        missing.push(key);
        page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, color: rgb(0.87, 0.87, 0.87) });
      }
      page.drawRectangle({
        x: box.x, y: box.y, width: box.w, height: box.h,
        borderColor: INK, borderWidth: mm(1.2),
      });

      const bubbles = panel.bubbles || [];
      if (bubbles.length) {
        // Measured against the drawing, not against a corner written in the
        // JSON: the model composes the panel, so only the pixels know where
        // the face is. With no drawing there is nothing to measure and the
        // letterer falls back to the script's hints.
        const at = await letterer.place(buf || null, bubbles);
        bubbles.forEach((b, bi) => drawBubble(page, fonts, b, at[bi], box, story.hero.name));
      }
    }

    const folio = String(pi + 1);
    page.drawText(folio, {
      x: W - mm(6) - fonts.regular.widthOfTextAtSize(folio, mm(2.6)),
      y: mm(3), size: mm(2.6), font: fonts.regular, color: rgb(0.45, 0.45, 0.45),
    });
  }

  // --- colophon ---------------------------------------------------------------
  const end = pdf.addPage([W, H]);
  end.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
  drawCentred(end, "FIN DEL VOLUMEN 1", {
    font: fonts.display, size: mm(9), y: H * 0.62, colour: INK, maxWidth: W - mm(40), pageW: W,
  });
  let y = drawCentred(end, `${story.hero.name} no ganó por tener poderes. Ganó porque ${story.hero.trait}.`, {
    font: fonts.regular, size: mm(3.4), y: H * 0.5, colour: rgb(0.25, 0.25, 0.25),
    maxWidth: W - mm(50), pageW: W, lineGap: 1.5,
  });
  drawCentred(end, `${brand} - los dibujos los genera una IA; la historia, la maquetación y cada palabra de esta página las decide el código, no el modelo.`, {
    font: fonts.italic, size: mm(2.8), y: y - mm(10), colour: rgb(0.45, 0.45, 0.45),
    maxWidth: W - mm(40), pageW: W, lineGap: 1.5,
  });

  return { bytes: Buffer.from(await pdf.save()), missing };
}

module.exports = { buildPdf, loadFonts, fitPanel, wrap, winAnsi, MM };
