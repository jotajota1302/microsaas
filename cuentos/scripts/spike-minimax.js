/*
 * Does the comic project's prompt discipline rescue MiniMax image-01 for this
 * book? Phase 0 rejected image-01 because the character reference ate the
 * style suffix. ../comic/docs/demo-2026-08-22.md reports that fixed by four
 * changes, in order of measured impact:
 *
 *   1. the style ANCHOR goes first, not last (a suffix is the weakest place)
 *   2. NAMED negatives, one per drift mode actually observed
 *   3. a NAMED closed palette, not "warm limited palette"
 *   4. a frozen character block, never paraphrased  (cuentos already does this)
 *
 * Why it matters here: image-01 costs 0,0035 $ against the ~0,037 $ we pay per
 * illustration today. Seventeen images a book is 5 cents instead of 60 — and
 * the free sample given to everyone who never buys drops from 12 cents to one.
 *
 * The control set is real: out/real/p*.png are the illustrations of a book
 * that was actually delivered, from the same story and the same character
 * sheet. Same scenes, two providers, side by side.
 *
 *   node scripts/spike-minimax.js            → 6 scenes  (~0,025 $)
 *   node scripts/spike-minimax.js --pages 12 → the lot
 */

const fs = require("fs");
const path = require("path");
const { env } = require("../lib/env.js");
const images = require("../lib/images.js");
const { mapLimit } = require("../lib/character.js");

const ROOT = path.join(__dirname, "..");
const REAL = path.join(ROOT, "out", "real");
const OUT = path.join(ROOT, "out", "minimax");

// --- the four defences, applied to this collection ---------------------------

// 1 + 3: the medium first, and the palette named rather than described.
const ANCHOR =
  "Soft children's storybook watercolour illustration, hand-painted on textured paper, " +
  "light ink linework of even weight, visible cold-press paper grain, " +
  "warm limited palette of cream, terracotta, sage green, soft ochre and dusty blue, " +
  "gentle rounded shapes, flat soft washes, no gradients from a computer";

// 2: every way an image model drifts off a watercolour, named one by one.
// Generic negatives ("no watermark") were measured to do nothing in ../comic.
const NEGATIVES =
  "Strictly a hand-painted 2D watercolour illustration. NOT photorealistic, NOT a 3D render, " +
  "NOT CGI, NOT a Pixar or Disney style, no plastic skin, no realistic skin pores, " +
  "no cinematic lighting, no depth of field, no bokeh, no lens blur, no airbrush, " +
  "no digital oil painting, no thick impasto brushwork, no neon or saturated colours. " +
  "No text, no lettering, no signage, no numbers, no watermark, no signature, no border, no frame";

function promptFor(sheet, hint, people) {
  const cast = (people || []).length ? ` Also in this story: ${people.join("; ")}.` : "";
  return [
    ANCHOR,
    `The child: ${sheet.appearance}, wearing ${sheet.outfit}${sheet.companion ? `, with ${sheet.companion}` : ""}.${cast}`,
    `Scene: ${hint}.`,
    `Keep the child strictly identical to the reference image: same face shape, same hair, same glasses, same clothes and the same colours.`,
    NEGATIVES,
  ].join(" ");
}

const SHEET_PROMPT = (sheet) =>
  [
    ANCHOR,
    `A character reference sheet: the SAME child drawn four times on one page, in a 2x2 grid on plain cream background — ` +
      `full body facing forward, full body from the side, three-quarter view, and a close-up of the face.`,
    `The child: ${sheet.appearance}, wearing ${sheet.outfit}.`,
    `Identical face, hair and clothes in all four drawings.`,
    NEGATIVES,
  ].join(" ");

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

(async () => {
  if (!env.MINIMAX_API_KEY) {
    console.error("\n  Falta MINIMAX_API_KEY en .env\n");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(path.join(REAL, "story.json"), "utf8"));
  const sheet = data.story.character_sheet;
  const people = sheet.people || [];
  const count = Number(argOf("pages", 6));
  const indices = data.story.pages.map((_, i) => i).slice(0, count);

  fs.mkdirSync(OUT, { recursive: true });
  const opts = { provider: "minimax", style: false, size: "1:1" };
  const started = Date.now();

  console.log(`\n  Hoja de personaje…`);
  const sheetOut = await images.generateImage({ prompt: SHEET_PROMPT(sheet), ...opts, label: "sheet" });
  fs.writeFileSync(path.join(OUT, "sheet.jpg"), sheetOut.buffer);
  console.log(`  hoja lista (${sheetOut.costUsd} $)`);

  const results = await mapLimit(indices, 3, async (i) => {
    const t = Date.now();
    try {
      const out = await images.generateImage({
        prompt: promptFor(sheet, data.story.pages[i].image_hint, people),
        refs: [sheetOut.buffer],
        ...opts,
        label: `page-${i + 1}`,
      });
      fs.writeFileSync(path.join(OUT, `p${i}.jpg`), out.buffer);
      console.log(`  página ${i + 1} · ${((Date.now() - t) / 1000).toFixed(1)} s · ${out.costUsd} $`);
      return { i, ok: true, costUsd: out.costUsd, ms: Date.now() - t };
    } catch (e) {
      console.log(`  página ${i + 1} · FALLO · ${e.name}: ${e.message.slice(0, 120)}`);
      return { i, ok: false, error: `${e.name}: ${e.message.slice(0, 200)}` };
    }
  });

  const ok = results.filter((r) => r.ok);
  const cost = ok.reduce((a, r) => a + (r.costUsd || 0), 0) + (sheetOut.costUsd || 0);
  const avg = ok.length ? ok.reduce((a, r) => a + r.ms, 0) / ok.length / 1000 : 0;

  // The comparison page: the same scene, both providers, nothing else.
  const rows = indices
    .filter((i) => fs.existsSync(path.join(OUT, `p${i}.jpg`)))
    .map(
      (i) => `<div class="row">
      <div class="n">página ${i + 1}<br><small>${(data.story.pages[i].image_hint || "").slice(0, 90)}</small></div>
      <figure><img src="../real/p${i}.png"><figcaption>Nano Banana · lo entregado</figcaption></figure>
      <figure><img src="p${i}.jpg"><figcaption>MiniMax image-01 · prompt reforzado</figcaption></figure>
    </div>`
    )
    .join("");

  fs.writeFileSync(
    path.join(OUT, "index.html"),
    `<meta charset="utf-8"><title>MiniMax vs Nano Banana</title>
<body style="background:#1d1d1f;color:#eee;font:14px/1.5 system-ui;margin:24px">
<h1 style="font:600 22px system-ui">Las mismas escenas, dos proveedores</h1>
<p>${ok.length}/${indices.length} correctas · ${cost.toFixed(4)} $ · ${avg.toFixed(1)} s de media.
Nano Banana costó ~${(indices.length * 0.037).toFixed(3)} $ por estas mismas.</p>
<div class="row"><div class="n">hoja</div><figure><img src="../real/sheet.png"><figcaption>Nano Banana</figcaption></figure><figure><img src="sheet.jpg"><figcaption>MiniMax</figcaption></figure></div>
${rows}
<style>.row{display:flex;gap:14px;align-items:flex-start;margin-bottom:18px}
.n{width:170px;flex:none;color:#bbb}figure{margin:0}img{width:330px;display:block;border:1px solid #444;border-radius:6px}
figcaption{font-size:12px;color:#aaa;margin-top:4px}</style></body>`
  );

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, cost, avg, ms: Date.now() - started }, null, 1));
  console.log(`\n  ${ok.length}/${indices.length} correctas · ${cost.toFixed(4)} $ · ${avg.toFixed(1)} s de media`);
  console.log(`  comparación → out/minimax/index.html\n`);
})();
