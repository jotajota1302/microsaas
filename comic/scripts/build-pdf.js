/*
 * Builds the PDF exactly the way the server does — pdf-lib and sharp, no
 * browser — from images that are already on disk.
 *
 * This is not a second PDF generator, it is the shipped one exercised without
 * a provider bill or a payment: scripts/make-pdf.js is the old Chrome demo and
 * stays only for comparison. If this and the server ever disagree, the bug is
 * in this file, because lib/comic-pdf.js is the same code both run.
 *
 * Usage:
 *   node scripts/build-pdf.js --story stories/nerea.json
 *   node scripts/build-pdf.js --story stories/kia.json --img out/demo/img
 */

const fs = require("fs");
const path = require("path");
const { buildPdf } = require("../lib/comic-pdf.js");
const { keys } = require("../lib/blobs.js");

const ROOT = path.join(__dirname, "..");

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

async function main() {
  const storyArg = flag("story", "stories/nerea.json");
  const story = JSON.parse(fs.readFileSync(path.join(ROOT, storyArg), "utf8"));
  const slug = path.basename(storyArg).replace(/\.json$/, "");
  const imgDir = path.join(ROOT, flag("img", `out/${slug === "kia" ? "demo" : slug}/img`));

  if (!fs.existsSync(imgDir)) throw new Error(`no hay imágenes en ${imgDir}`);

  // The same keys the blob store uses, so buildPdf cannot tell the difference.
  const token = slug;
  const images = new Map();
  const cover = path.join(imgDir, "cover.jpg");
  if (fs.existsSync(cover)) images.set(keys.cover(token), fs.readFileSync(cover));

  let found = 0;
  let absent = 0;
  story.pages.forEach((page, pi) => {
    page.panels.forEach((_, qi) => {
      const f = path.join(imgDir, `p${pi + 1}-${qi + 1}.jpg`);
      if (fs.existsSync(f)) { images.set(keys.panel(token, pi, qi), fs.readFileSync(f)); found++; }
      else absent++;
    });
  });

  console.log(`\n"${story.title}" · ${story.pages.length} páginas · ${found} viñetas en disco${absent ? `, ${absent} ausentes` : ""}`);

  const t0 = Date.now();
  const { bytes, missing } = await buildPdf({ story, images, token });
  const out = path.join(ROOT, "out", `${slug}-servidor.pdf`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);

  console.log(`\n  ${(Date.now() - t0) / 1000}s · ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
  if (missing.length) console.log(`  huecos: ${missing.length} (${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""})`);
  console.log(`  ${out}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
