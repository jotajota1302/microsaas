/*
 * Checks a built PDF without opening it.
 *
 * Two things, both of which have been wrong before and neither of which is
 * obvious from a thumbnail:
 *
 *   1. structure — the page count and the page size are what we asked for
 *   2. geometry  — no bubble box is bigger than the panel it sits in
 *
 * The second is the regression test for the defect that was found by eye:
 * lettering ending up where it should not. Re-running the same arithmetic
 * drawBubble runs and asserting containment is cheaper and more reliable than
 * looking at fourteen pages, and it fails loudly when a longer line of
 * dialogue or a narrower layout pushes a bubble out.
 *
 * Usage: node scripts/check-pdf.js [--story stories/nerea.json] [--pdf out/nerea-servidor.pdf]
 */

const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const L = require("../lib/layout.js");
const CP = require("../lib/comic-pdf.js");

const ROOT = path.join(__dirname, "..");
const MM = CP.MM;
const mm = (v) => v * MM;

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

async function main() {
  const storyFile = flag("story", "stories/nerea.json");
  const slug = path.basename(storyFile).replace(/\.json$/, "");
  const pdfFile = flag("pdf", `out/${slug}-servidor.pdf`);

  const story = JSON.parse(fs.readFileSync(path.join(ROOT, storyFile), "utf8"));
  const pdf = await PDFDocument.load(fs.readFileSync(path.join(ROOT, pdfFile)));
  const pages = pdf.getPages();

  const expected = story.pages.length + 2; // cover + pages + colophon
  const { width, height } = pages[0].getSize();
  const problems = [];

  console.log(`\n${pdfFile}`);
  console.log(`  páginas ${pages.length} (esperadas ${expected})`);
  console.log(`  tamaño  ${(width / MM).toFixed(0)} x ${(height / MM).toFixed(0)} mm`);
  if (pages.length !== expected) problems.push(`el PDF trae ${pages.length} páginas y la historia pide ${expected}`);
  if (Math.abs(width / MM - L.PAGE.w) > 0.5 || Math.abs(height / MM - L.PAGE.h) > 0.5) {
    problems.push(`la página mide ${(width / MM).toFixed(1)}x${(height / MM).toFixed(1)} mm y debería ser ${L.PAGE.w}x${L.PAGE.h}`);
  }

  /*
   * The same maths drawBubble does — and, critically, the same FONTS. Measuring
   * with Helvetica while the renderer draws Barlow Condensed makes this check
   * an opinion about a different document: Barlow fits 32 % more characters per
   * line, so every number here would be pessimistic by a third.
   */
  const probe = await PDFDocument.create();
  const fonts = await CP.loadFonts(probe);
  const bold = fonts.bold;
  const italic = fonts.italic;
  if (!fonts.embedded) console.log("  (aviso: sin tipografías incrustadas, mido con las estándar)");
  const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}]/gu, "");

  let checked = 0;
  const escapes = [];

  story.pages.forEach((page, pi) => {
    const rects = L.panelRects(page.layout, page.panels.length);
    page.panels.forEach((panel, qi) => {
      const rect = rects[qi];
      const box = { w: mm(rect.w), h: mm(rect.h) };
      for (const b of panel.bubbles || []) {
        const isCaption = b.type === "caption";
        const size = isCaption ? mm(2.6) : mm(2.7);
        const font = isCaption ? italic : bold;
        const padX = mm(1.9);
        const padY = mm(1.3);
        const text = isCaption ? CP.winAnsi(b.text) : CP.winAnsi(b.text).toUpperCase();
        const lines = CP.wrap(text, font, size, box.w * 0.44 - padX * 2);
        const raw = (b.who || "").trim();
        const label = raw && norm(raw) !== norm(story.hero.name) ? CP.winAnsi(raw).toUpperCase() : "";
        const labelSize = size * 0.85;
        const textW = Math.max(
          ...lines.map((l) => font.widthOfTextAtSize(l, size)),
          label ? bold.widthOfTextAtSize(label, labelSize) : 0
        );
        const w = textW + padX * 2;
        const h = lines.length * size * 1.15 + (label ? labelSize * 1.2 : 0) + padY * 2;
        checked++;
        // 92 %: a bubble that fills its panel edge to edge is technically
        // inside it and still a ruined drawing.
        if (w > box.w * 0.92 || h > box.h * 0.92) {
          escapes.push(`p${pi + 1}-${qi + 1} · bocadillo ${w.toFixed(0)}x${h.toFixed(0)} pt en viñeta ${box.w.toFixed(0)}x${box.h.toFixed(0)} · "${String(b.text).slice(0, 45)}"`);
        }
      }
    });
  });

  console.log(`  bocadillos ${checked}${escapes.length ? `, ${escapes.length} demasiado grandes` : ", ninguno se sale"}`);
  escapes.slice(0, 12).forEach((e) => console.log(`    ${e}`));
  if (escapes.length) problems.push(`${escapes.length} bocadillos ocupan más del 92 % de su viñeta`);

  console.log(problems.length ? `\n  ${problems.length} problema(s)\n` : "\n  todo correcto\n");
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
