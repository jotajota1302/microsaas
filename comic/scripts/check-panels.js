/*
 * Looks at the drawn panels and says which ones betray the style.
 *
 * The one defect that is genuinely measurable is COLOUR. `manga-bn` is the
 * default style precisely because greyscale removes the axis the model kept
 * escaping along — but "removes the axis" was an argument, not a measurement,
 * and a colour panel in the middle of a black and white comic is the most
 * visible failure this product can ship.
 *
 * Saturation, per pixel, on a downsampled copy: max(r,g,b) - min(r,g,b) over
 * max(r,g,b). A greyscale drawing scores ~0 everywhere. A JPEG of a greyscale
 * drawing scores a little above zero from chroma noise, which is why the
 * threshold is a share of clearly-coloured pixels and not "any colour at all".
 *
 * What this canNOT see is the other drift the eye catches: a panel that came
 * out looking like a 3D render rather than inked manga. That is a judgement
 * about rendering style, not a number in the pixels, and it needs either a
 * vision model scoring each panel or a human looking. Said plainly rather than
 * papered over with a metric that does not measure it.
 *
 * With --fix it also repairs what is repairable, in place, keeping the
 * originals in a sibling folder. Only DRIFT is repairable — see
 * lib/panel-check.js for why a collapsed panel has to be drawn again.
 *
 * Usage:
 *   node scripts/check-panels.js [--img out/nerea/img]
 *   node scripts/check-panels.js --img out/nerea/img --fix
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { judgePanel, desaturate } = require("../lib/panel-check.js");

const ROOT = path.join(__dirname, "..");

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

/** Share of pixels that are unambiguously coloured, and how strong the colour is. */
async function colourness(file, satFloor) {
  const { data, info } = await sharp(file)
    .resize(96, 96, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let coloured = 0;
  let sum = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    sum += sat;
    if (sat >= satFloor) coloured++;
  }
  return { share: coloured / n, mean: sum / n };
}

async function main() {
  const dir = path.join(ROOT, flag("img", "out/nerea/img"));
  const styleId = flag("style", "manga-bn");
  const fix = process.argv.includes("--fix");

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
  if (!files.length) throw new Error(`no hay jpg en ${dir}`);

  console.log(`\n${files.length} imágenes en ${path.relative(ROOT, dir)} · estilo ${styleId}\n`);

  const rows = [];
  for (const f of files) {
    const j = await judgePanel(fs.readFileSync(path.join(dir, f)), styleId);
    rows.push({ f, ...j });
  }
  rows.sort((a, b) => b.colour - a.colour);

  const drift = rows.filter((r) => r.verdict === "drift");
  const collapse = rows.filter((r) => r.verdict === "collapse");

  for (const r of rows.filter((x) => x.verdict !== "ok")) {
    console.log(`  ${r.verdict.toUpperCase().padEnd(9)} ${r.f.padEnd(14)} color ${(r.colour * 100).toFixed(0).padStart(3)} % · tinta ${(r.ink * 100).toFixed(0).padStart(3)} %`);
  }

  console.log(`\n  ${rows.length - drift.length - collapse.length} correctas · ${drift.length} con color colado · ${collapse.length} sin tinta (el modelo dejó de dibujar cómic)`);

  if (fix && drift.length) {
    // The originals are kept: a threshold that turns out to be too eager must
    // be reversible without regenerating anything.
    const backup = path.join(dir, "..", "img-original");
    fs.mkdirSync(backup, { recursive: true });
    for (const r of drift) {
      const src = path.join(dir, r.f);
      const keep = path.join(backup, r.f);
      if (!fs.existsSync(keep)) fs.copyFileSync(src, keep);
      fs.writeFileSync(src, await desaturate(fs.readFileSync(src)));
    }
    console.log(`  ${drift.length} desaturadas · originales en ${path.relative(ROOT, backup)}`);
  }
  if (fix && collapse.length) {
    console.log(`  ${collapse.length} NO se pueden arreglar aquí, hay que redibujarlas: ${collapse.map((r) => r.f).join(", ")}`);
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
