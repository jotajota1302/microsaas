/*
 * Draws the SAME panel in every style in the catalogue.
 *
 * Five of the six anchors in lib/catalog.js were written and never generated —
 * they are offered in the form, so they are promises. This is the cheapest
 * possible check that each one produces what its label says, and it doubles as
 * the thumbnail set the form needs.
 *
 * Same scene, same character, same everything but the anchor: the only variable
 * is the style. No character reference on purpose — a reference drags its own
 * look in, and here the anchor is exactly what is under test.
 *
 * Usage: node scripts/spike-styles.js [--scene 2]
 * Output: out/styles/<id>.jpg + out/styles/index.html
 */

const fs = require("fs");
const path = require("path");
const C = require("../lib/catalog.js");
const S = require("../lib/style.js");
const { draw, COST_PER_IMAGE } = require("../lib/images.js");

const OUT = path.join(__dirname, "..", "out", "styles");

// A neutral teenager: no name (the privacy rule), described the way the
// pipeline describes one, so the test matches production.
const HERO = {
  name: "hero",
  age: 15,
  gender: "m",
  hair: "short messy hair, black",
  eyes: "dark brown",
  skin: "light brown",
  outfit: "an oversized grey hoodie worn with the hood down, average build",
};

// Deliberately ordinary: a style has nowhere to hide in a quiet two-shot.
// An explosion looks dramatic in every style and tells you nothing.
const SCENES = [
  "two teenagers sitting on a low wall outside a school at the end of the day, backpacks on the ground, one talking and the other listening",
  "a teenager standing alone at the end of a long corridor of lockers, looking back over one shoulder",
  "a teenager running down a wet street at night between parked cars, seen from a low angle",
];

async function main() {
  const i = process.argv.indexOf("--scene");
  const scene = SCENES[(i >= 0 ? Number(process.argv[i + 1]) : 0)] || SCENES[0];
  fs.mkdirSync(OUT, { recursive: true });

  const ids = Object.keys(C.STYLES);
  console.log(`\n${ids.length} estilos, misma escena, sin referencia de personaje\n`);
  console.log(`escena: ${scene.slice(0, 70)}…\n`);

  const rows = [];
  for (const id of ids) {
    const file = path.join(OUT, `${id}.jpg`);
    if (fs.existsSync(file)) { console.log(`  ${id.padEnd(16)} (reutilizada)`); rows.push({ id, ok: true }); continue; }
    const prompt = S.panelPrompt({
      subject: { block: S.characterBlock(HERO) },
      scene,
      styleId: id,
    });
    try {
      const { buffer, ms } = await draw({ prompt, aspect: "3:2" });
      fs.writeFileSync(file, buffer);
      console.log(`  ${id.padEnd(16)} ${(ms / 1000).toFixed(1)}s`);
      rows.push({ id, ok: true, ms });
    } catch (e) {
      console.log(`  ${id.padEnd(16)} FALLA ${e.message.slice(0, 70)}`);
      rows.push({ id, ok: false, error: e.message });
    }
  }

  const ok = rows.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(OUT, "index.html"), sheet(rows, scene));
  console.log(`\n${ok}/${rows.length} · ${(ok * COST_PER_IMAGE).toFixed(4)} $`);
  console.log(`open: ${path.join(OUT, "index.html")}\n`);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function sheet(rows, scene) {
  const cards = rows.map((r) => {
    const s = C.STYLES[r.id];
    return `<figure>
      ${r.ok ? `<img src="${r.id}.jpg" alt="${esc(s.label)}" loading="lazy">`
             : `<div class="fail">no salió<br><small>${esc(String(r.error).slice(0, 120))}</small></div>`}
      <figcaption><b>${esc(s.label)}</b><br><span>${esc(s.hint)}</span></figcaption>
    </figure>`;
  }).join("");

  return `<!doctype html><meta charset="utf-8"><title>Estilos del catálogo</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:2rem;background:#171c24;color:#e8e3d8;
       max-width:1200px;margin-inline:auto}
  h1{font-size:1.3rem;margin:0 0 .3rem}
  p.lead{opacity:.7;margin:0 0 2rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:1.4rem}
  figure{margin:0}
  img{width:100%;border:1px solid #3d4854;background:#232b36;display:block}
  figcaption{font-size:.85rem;margin-top:.5rem}
  figcaption b{color:#e8a33d}figcaption span{opacity:.65}
  .fail{aspect-ratio:3/2;display:grid;place-items:center;text-align:center;padding:1rem;
        border:1px dashed #b3271b;color:#e8685d;font-size:.8rem}
</style>
<h1>Los seis estilos del catálogo, la misma viñeta</h1>
<p class="lead">Misma escena, mismo personaje, sin referencia: lo único que cambia es el ancla de estilo.<br>
<em>${esc(scene)}</em></p>
<div class="grid">${cards}</div>
`;
}

main().catch((e) => { console.error(e); process.exit(1); });
