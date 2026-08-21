/*
 * Draws the free colouring gallery once. The output is committed to the repo
 * and served as static files, so this script runs on a laptop, never in
 * production.
 *
 *   node scripts/gen-coloring-gallery.js              every missing theme
 *   node scripts/gen-coloring-gallery.js gatos espacio  just these
 *   node scripts/gen-coloring-gallery.js --force gatos  redraw one
 *
 * Per theme it writes:
 *   colorear/img/<slug>.png        A4 300 dpi, pure black and white (print)
 *   colorear/img/<slug>-thumb.webp small preview for the gallery grid
 *   colorear/pdf/<slug>.pdf        one A4 page, the actual download
 *
 * Cost: one image per theme (~0,034 $ with the lite model). Already-drawn
 * themes are skipped, so an interrupted run is safe to repeat.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const { generateImage } = require("../lib/images.js");
const { cleanToA4, A4 } = require("../lib/lineart.js");
const G = require("../lib/coloring.js");

const ROOT = path.join(__dirname, "..");
const IMG_DIR = path.join(ROOT, "colorear", "img");
const PDF_DIR = path.join(ROOT, "colorear", "pdf");
const A4_PT = { width: 595.28, height: 841.89 }; // 210 x 297 mm in points

async function toPdf(pngBuffer, title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("cuentos");
  doc.setSubject("Pagina para colorear gratuita");
  const page = doc.addPage([A4_PT.width, A4_PT.height]);
  const img = await doc.embedPng(pngBuffer);
  page.drawImage(img, { x: 0, y: 0, width: A4_PT.width, height: A4_PT.height });
  return Buffer.from(await doc.save());
}

async function drawTheme(theme) {
  const started = Date.now();
  const out = await generateImage({ prompt: G.coloringPrompt(theme), size: "3:4", style: false });

  const png = await cleanToA4(out.buffer);
  fs.writeFileSync(path.join(IMG_DIR, `${theme.slug}.png`), png);

  // The thumbnail comes from the pre-threshold drawing so the grid keeps its
  // antialiasing; the printable page stays pure black and white.
  const thumb = await sharp(out.buffer)
    .flatten({ background: "#fff" })
    .greyscale()
    .normalise()
    .resize({ width: 560, height: Math.round(560 * A4.height / A4.width), fit: "contain", background: "#fff" })
    .webp({ quality: 82 })
    .toBuffer();
  fs.writeFileSync(path.join(IMG_DIR, `${theme.slug}-thumb.webp`), thumb);

  fs.writeFileSync(path.join(PDF_DIR, `${theme.slug}.pdf`), await toPdf(png, theme.title.es));

  const kb = (n) => `${Math.round(n / 1024)} kB`;
  console.log(
    `  ok ${theme.slug.padEnd(14)} ${((Date.now() - started) / 1000).toFixed(1)} s  ` +
    `${(out.costUsd || 0).toFixed(3)} $  png ${kb(png.length)}  thumb ${kb(thumb.length)}  [${out.model}]`
  );
  return out.costUsd || 0;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const wanted = args.filter((a) => !a.startsWith("--"));

  fs.mkdirSync(IMG_DIR, { recursive: true });
  fs.mkdirSync(PDF_DIR, { recursive: true });

  let themes = G.THEMES;
  if (wanted.length) {
    themes = wanted.map((s) => {
      const t = G.findTheme(s);
      if (!t) throw new Error(`unknown theme "${s}"`);
      return t;
    });
  }
  const todo = themes.filter((t) => force || !fs.existsSync(path.join(IMG_DIR, `${t.slug}.png`)));

  if (!todo.length) {
    console.log("nothing to draw: every theme already has its files");
    return;
  }
  console.log(`drawing ${todo.length} colouring page(s), about ${(todo.length * 0.034).toFixed(2)} $\n`);

  let spent = 0;
  const failed = [];
  for (const theme of todo) {
    try {
      spent += await drawTheme(theme);
    } catch (e) {
      failed.push(theme.slug);
      console.error(`  FAIL ${theme.slug}: ${e.message.slice(0, 160)}`);
    }
  }

  console.log(`\ndone: ${todo.length - failed.length}/${todo.length} pages, ${spent.toFixed(3)} $ spent`);
  if (failed.length) {
    console.log(`retry the failures with: node scripts/gen-coloring-gallery.js ${failed.join(" ")}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
