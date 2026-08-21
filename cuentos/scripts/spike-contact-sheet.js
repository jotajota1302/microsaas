/*
 * Builds out/spike/index.html: every provider/character on one page, sheet
 * first and pages after, so consistency can be judged by eye in one scroll.
 *
 * Usage: node scripts/spike-contact-sheet.js
 */

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "out", "spike");

if (!fs.existsSync(OUT)) {
  console.error("[cuentos] no spike output yet — run scripts/spike-images.js first");
  process.exit(1);
}

const results = fs.existsSync(path.join(OUT, "results.json"))
  ? JSON.parse(fs.readFileSync(path.join(OUT, "results.json"), "utf8"))
  : [];

const dirs = [];
for (const provider of fs.readdirSync(OUT)) {
  const providerDir = path.join(OUT, provider);
  if (!fs.statSync(providerDir).isDirectory()) continue;
  for (const character of fs.readdirSync(providerDir)) {
    dirs.push({ provider, character, dir: path.join(providerDir, character) });
  }
}

const blocks = dirs.map(({ provider, character, dir }) => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  const sheet = files.find((f) => f === "sheet.png");
  const pages = files.filter((f) => /^p\d+\.png$/.test(f));
  const row = results.find((r) => r.provider === provider && r.character === character) || {};
  const stats = row.pages != null
    ? `${row.pages} páginas · ${row.blocked} bloqueadas · ${row.failed} fallidas · ${row.size} · $${(row.costUsd || 0).toFixed(3)} · ~${Math.round((row.msTotal || 0) / 1000)}s total`
    : "";

  return `
    <section>
      <h2>${provider} / ${character}</h2>
      <p class="stats">${stats}</p>
      ${sheet ? `<img class="sheet" src="${provider}/${character}/sheet.png" alt="hoja de personaje">` : ""}
      <div class="grid">
        ${pages.map((p) => `<figure><img src="${provider}/${character}/${p}" alt="${p}"><figcaption>${p.replace(".png", "")}</figcaption></figure>`).join("")}
      </div>
    </section>`;
}).join("");

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Spike de consistencia — cuentos</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 1200px; padding: 24px; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-bottom: 4px; }
  .stats { color: #666; font-size: .85rem; margin-top: 0; }
  .sheet { max-width: 320px; border: 1px solid #ccc; border-radius: 8px; display: block; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
  figure { margin: 0; }
  figure img { width: 100%; border-radius: 6px; display: block; }
  figcaption { font-size: .75rem; color: #666; text-align: center; }
  section { border-top: 1px solid #ddd; padding-top: 16px; margin-top: 24px; }
</style></head>
<body>
  <h1>Spike de consistencia de personaje</h1>
  <p>Criterio: el personaje debe ser reconociblemente el mismo en <strong>≥ 80 %</strong> de las páginas,
     con <strong>0 bloqueos</strong> del filtro y <strong>≥ 1.900 px</strong> de lado.
     Mira también si el <strong>estilo</strong> se mantiene (acuarela suave) o deriva.</p>
  ${blocks}
</body></html>`;

fs.writeFileSync(path.join(OUT, "index.html"), html);
console.log(`[cuentos] wrote ${path.join(OUT, "index.html")} with ${dirs.length} blocks`);
