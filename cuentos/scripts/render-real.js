/*
 * Renders the book of a story already in out/real (see the download step) so
 * the layout can be judged on real illustrations rather than on placeholders.
 * Development only.
 *
 *   node scripts/render-real.js  →  out/real/libro.pdf
 */
const fs = require("fs");
const path = require("path");
const { renderPdf } = require("../lib/pdf.js");

const DIR = path.join(__dirname, "..", "out", "real");

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, "story.json"), "utf8"));
  const images = data.story.pages.map((_, i) => {
    const f = path.join(DIR, `p${i}.png`);
    return fs.existsSync(f) ? { buffer: fs.readFileSync(f), fallback: false } : { buffer: null, fallback: true };
  });
  const coloring = [0, 1, 2, 3].map((k) => path.join(DIR, `c${k}.png`)).filter(fs.existsSync).map((f) => fs.readFileSync(f));
  const sheet = fs.existsSync(path.join(DIR, "sheet.png")) ? fs.readFileSync(path.join(DIR, "sheet.png")) : undefined;
  const p = data.personalization || {};
  const pdf = await renderPdf({
    story: data.story,
    images,
    coloring,
    sheet,
    personalization: { name: p.name, people: p.people || [], dedication: p.dedication, date: "agosto de 2026", locale: p.locale },
    mode: "screen",
  });
  const out = path.join(DIR, "libro.pdf");
  fs.writeFileSync(out, pdf);
  console.log(`${out} · ${(pdf.length / 1e6).toFixed(2)} MB`);
})();
