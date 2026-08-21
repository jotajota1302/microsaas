/*
 * Renders a real book from whatever we have on disk, so the layout can be
 * judged with human eyes instead of assertions.
 *
 * Story:  out/spike-text/<model>/<case>.json if present, else the test fixture.
 * Images: out/spike/<provider>/<character>/p01..p12.png if present, else a
 *         plain placeholder, so the script always produces something.
 *
 * Usage:
 *   node scripts/render-fixture.js
 *   node scripts/render-fixture.js --images minimax/ana --name Ana --mode print
 */

const fs = require("fs");
const path = require("path");
const { renderPdf } = require("../lib/pdf.js");
const C = require("../lib/collection.js");

const ROOT = path.join(__dirname, "..");

function argOf(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function firstStory() {
  const dir = path.join(ROOT, "out", "spike-text");
  if (fs.existsSync(dir)) {
    for (const model of fs.readdirSync(dir)) {
      const modelDir = path.join(dir, model);
      if (!fs.statSync(modelDir).isDirectory()) continue;
      const file = fs.readdirSync(modelDir).find((f) => f.endsWith(".json") && !f.includes(".errors."));
      if (file) {
        console.log(`[cuentos] story: out/spike-text/${model}/${file}`);
        return JSON.parse(fs.readFileSync(path.join(modelDir, file), "utf8"));
      }
    }
  }
  console.log("[cuentos] story: test/fixtures/story-valid.json");
  return require("../test/fixtures/story-valid.json");
}

/** A calm coloured square, so a missing illustration is obvious but not ugly. */
function placeholder(index) {
  const shades = ["e8dcc8", "d9e2e8", "e8d9d9", "dee8d9"];
  const hex = shades[index % shades.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">` +
    `<rect width="1024" height="1024" fill="#${hex}"/>` +
    `<text x="512" y="512" font-family="sans-serif" font-size="48" fill="#8a8577" ` +
    `text-anchor="middle">ilustración ${index + 1}</text></svg>`;
  return require("sharp")(Buffer.from(svg)).png().toBuffer();
}

(async () => {
  const story = firstStory();
  const imagesArg = argOf("images", "minimax/ana");
  const imageDir = path.join(ROOT, "out", "spike", ...imagesArg.split("/"));

  const images = [];
  for (let i = 0; i < C.PAGE_COUNT; i++) {
    const file = path.join(imageDir, `p${String(i + 1).padStart(2, "0")}.png`);
    if (fs.existsSync(file)) {
      images.push({ buffer: fs.readFileSync(file), fallback: false });
    } else {
      images.push({ buffer: await placeholder(i), fallback: true });
    }
  }
  const missing = images.filter((i) => i.fallback).length;
  console.log(`[cuentos] images: ${C.PAGE_COUNT - missing} real, ${missing} placeholder (from ${imagesArg})`);

  // No line art yet: reuse four illustrations desaturated, just for layout.
  const sharp = require("sharp");
  const coloring = [];
  for (let i = 0; i < C.COLORING_PAGE_COUNT; i++) {
    coloring.push(
      await sharp(images[i * 3].buffer).greyscale().normalise().median(3).threshold(190).png().toBuffer()
    );
  }

  const personalization = {
    name: argOf("name", "Ana"),
    companionName: argOf("friend", "Leo"),
    dedication: argOf("dedication", "Para Ana, que nunca deja un dibujo a medias. De la abuela."),
    date: "agosto de 2026",
  };

  const outDir = path.join(ROOT, "out");
  fs.mkdirSync(outDir, { recursive: true });

  for (const mode of [argOf("mode", "screen"), "preview"]) {
    const buffer = await renderPdf({ story, images, coloring, personalization, mode });
    const file = path.join(outDir, `libro-${mode}.pdf`);
    fs.writeFileSync(file, buffer);
    console.log(`[cuentos] wrote ${file} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
  }
})().catch((e) => {
  console.error("[cuentos] render-fixture failed:", e.message);
  process.exit(1);
});
