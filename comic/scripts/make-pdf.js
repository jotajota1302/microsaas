/*
 * Turns the generated comic into PDFs you can read on a phone.
 *
 * Two files, because they answer different questions:
 *   comic-vinetas.pdf  - the real product: panels laid out and lettered by code
 *   comic-paginas.pdf  - the cheap alternative: one image per page, no lettering
 *
 * The web reader (out/demo/index.html) flows; a PDF cannot. So this builds its
 * own print HTML where every page is exactly one fixed page box with the grid
 * centred inside it, and hands that to headless Chrome.
 *
 * Usage: node scripts/make-pdf.js
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const letterer = require("../lib/letterer.js");

// Which story to bind. Each one has its own output folder, so a second comic
// does not overwrite the first.
const storyArg = (() => {
  const i = process.argv.indexOf("--story");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "stories/kia.json";
})();
const STORY_FILE = path.join(__dirname, "..", storyArg);
const slug = path.basename(storyArg).replace(/\.json$/, "");

const OUT = path.join(__dirname, "..", "out", slug === "kia" ? "demo" : slug);
const IMG = path.join(OUT, "img");
const WEB = path.join(OUT, "img-web");

// sharp lives in the sibling project; this is a demo script, not shipped code.
// If it is missing we still produce a PDF, just a heavy one.
let sharp = null;
try { sharp = require("sharp"); } catch { /* optional */ }

// 2:3 page box, the classic comic proportion. Nothing is printed for real yet,
// so this only has to read well on a phone.
const PAGE_W = 180;
const PAGE_H = 270;

let DIR = "img";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.CHROME_PATH,
].filter(Boolean);

function findChrome() {
  const hit = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!hit) throw new Error(`Chrome not found. Tried:\n  ${CHROME_CANDIDATES.join("\n  ")}`);
  return hit;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// --- the lettered edition ----------------------------------------------------

/*
 * The speaker label is only for other characters. Real comics never tag the
 * protagonist's own bubbles, and the model fills `who` with the hero's name on
 * every line, which made every page read like a screenplay.
 */
function bubble(b, at, heroName) {
  const label = b.who && b.who.trim();
  const isHero = label && heroName &&
    label.toLowerCase().replace(/[^\p{L}]/gu, "") === heroName.toLowerCase().replace(/[^\p{L}]/gu, "");
  const who = label && !isHero ? `<b class="who">${esc(label)}</b>` : "";
  return `<div class="bub ${b.type} at-${at}">${who}${esc(b.text)}</div>`;
}

async function letteredHtml(story) {
  const placed = [];
  for (const [pi, page] of story.pages.entries()) {
    const rows = [];
    for (const [qi, panel] of page.panels.entries()) {
      const file = path.join(IMG, `p${pi + 1}-${qi + 1}.jpg`);
      rows.push(await letterer.place(file, panel.bubbles || []));
    }
    placed.push(rows);
  }
  const pages = story.pages.map((page, pi) => `
    <section class="sheet">
      <div class="grid ${page.layout}">
        ${page.panels.map((p, qi) => `
          <figure class="panel a${qi + 1}">
            <img src="${DIR}/p${pi + 1}-${qi + 1}.jpg" alt="">
            ${(p.bubbles || []).map((b, bi) => bubble(b, placed[pi][qi][bi], story.hero && story.hero.name)).join("")}
          </figure>`).join("")}
      </div>
      <span class="folio">${pi + 1}</span>
    </section>`).join("");

  return `<!doctype html><meta charset="utf-8"><title>${esc(story.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bangers&family=Nunito:wght@700;900&display=swap" rel="stylesheet">
<style>
  @page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font:16px/1.45 Nunito,system-ui,sans-serif}

  .sheet{width:${PAGE_W}mm;height:${PAGE_H}mm;padding:6mm;display:flex;align-items:center;
         justify-content:center;position:relative;page-break-after:always;background:#f4f1ea}
  .sheet:last-child{page-break-after:auto}

  /* The grid fills the page instead of floating in the middle of it: a quad
     layout is roughly square and left a third of a 2:3 page empty. Panels take
     whatever rectangle the layout gives them and the art cover-crops. */
  .grid{width:100%;height:100%;display:grid;gap:3mm}
  .grid.quad{grid-template-columns:1fr 1fr}
  .grid.wide-two{grid-template-columns:1fr 1fr;grid-template-areas:"a a" "b c"}
  .grid.wide-two .a1{grid-area:a}.grid.wide-two .a2{grid-area:b}.grid.wide-two .a3{grid-area:c}
  .grid.tall-stack{grid-template-columns:1.15fr 1fr;grid-template-areas:"a b" "a c"}
  .grid.tall-stack .a1{grid-area:a}.grid.tall-stack .a2{grid-area:b}.grid.tall-stack .a3{grid-area:c}
  .grid.five{grid-template-columns:1fr 1fr;grid-template-areas:"a a" "b c" "d e";
             grid-template-rows:0.85fr 1fr 1fr}
  .grid.five .a1{grid-area:a}.grid.five .a2{grid-area:b}.grid.five .a3{grid-area:c}
  .grid.five .a4{grid-area:d}.grid.five .a5{grid-area:e}
  .grid.six{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr 1fr}

  .panel{margin:0;position:relative;overflow:hidden;border:1.2mm solid #111;background:#ddd}
  /* 3 % crop on every edge: MiniMax leaves a signature in a corner now and then. */
  .panel img{width:106%;height:106%;margin:-3%;object-fit:cover;display:block}
  .grid.quad{grid-template-rows:1fr 1fr}
  .grid.wide-two{grid-template-rows:0.78fr 1fr}
  .grid.tall-stack{grid-template-rows:1fr 1fr}

  .bub{position:absolute;max-width:44%;padding:1.3mm 1.9mm;color:#111;font-weight:900;
       font-size:2.7mm;line-height:1.15;text-transform:uppercase;z-index:2}
  .bub .who{display:block;font-size:.85em;color:#c62828}
  .at-top-left{top:4%;left:3%}.at-top-right{top:4%;right:3%}
  .at-bottom-left{bottom:4%;left:3%}.at-bottom-right{bottom:4%;right:3%}
  .at-top-center{top:4%;left:50%;transform:translateX(-50%)}
  .at-bottom-center{bottom:4%;left:50%;transform:translateX(-50%)}
  .at-top-center.shout,.at-bottom-center.shout{transform:translateX(-50%) rotate(-2deg)}
  .speech,.shout,.thought{background:#fff;border:.9mm solid #111}
  /* No tails: a fixed triangle points at nothing, because the bubble does not
     know where the speaker is in the panel. Aim them only once the gutter
     detector can tell us where each figure sits. */
  .speech{border-radius:4mm}
  .thought{border-radius:7mm;border-style:dashed}
  .shout{border-radius:1mm;border-width:1.1mm;color:#b71c1c;transform:rotate(-2deg);
    clip-path:polygon(3% 0,97% 4%,100% 50%,96% 100%,40% 96%,4% 100%,0 48%)}
  .caption{background:#ffe9a8;border:.9mm solid #111;font-weight:700;
    text-transform:none;font-style:italic;font-size:2.6mm}

  .folio{position:absolute;bottom:3mm;right:6mm;font-size:2.6mm;opacity:.45}

  /* Cover and colophon get their own full-bleed page. */
  .cover{width:${PAGE_W}mm;height:${PAGE_H}mm;position:relative;overflow:hidden;
         page-break-after:always;background:#111}
  .cover img{width:100%;height:100%;object-fit:cover;display:block}
  .cover .txt{position:absolute;inset:0 0 auto;padding:12mm 8mm 20mm;text-align:center;color:#fff;
              background:linear-gradient(#000d 0%,#0009 55%,#0000 100%)}
  .cover .vol{font:4mm/1 Bangers,'Arial Black',sans-serif;letter-spacing:.22em;
              text-transform:uppercase;opacity:.85;margin:0 0 3mm}
  .cover h1{font:14mm/1 Bangers,'Arial Black',sans-serif;margin:0;text-shadow:1.5mm 1.5mm 0 #c62828}
  .cover .by{margin:4mm 0 0;font-size:3.2mm;opacity:.9}
  .end{width:${PAGE_W}mm;height:${PAGE_H}mm;display:flex;flex-direction:column;
       align-items:center;justify-content:center;text-align:center;padding:20mm;background:#f4f1ea}
  .end h2{font:9mm/1 Bangers,'Arial Black',sans-serif;margin:0 0 6mm}
  .end p{font-size:3.2mm;max-width:110mm;opacity:.75;margin:.6em 0}
</style>
<section class="cover">
  <img src="${DIR}/cover.jpg" alt="">
  <div class="txt">
    <p class="vol">${esc(story.subtitle)}</p>
    <h1>${esc(story.title)}</h1>
    <p class="by">protagonista: <b>${esc(story.hero.name)}</b>, ${story.hero.age} años</p>
  </div>
</section>
${pages}
<section class="end">
  <h2>Fin del volumen 1</h2>
  <p><b>${esc(story.hero.name)}</b> no ganó por tener poderes. Ganó porque ${esc(story.hero.trait)}.</p>
  <p>Demo generada con IA (MiniMax <code>image-01</code>). Los textos y la maquetación no los escribe el modelo: los pone el código.</p>
</section>`;
}

// --- the cheap edition: one image per page -----------------------------------

function fullPageHtml(story, prefix = "full") {
  const pages = story.pages
    .map((_, pi) => `<section class="full"><img src="${DIR}/${prefix}-${pi + 1}.jpg" alt=""></section>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>${esc(story.title)} — páginas enteras</title>
<style>
  @page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
  html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .full{width:${PAGE_W}mm;height:${PAGE_H}mm;display:flex;align-items:center;justify-content:center;
        page-break-after:always;background:#f4f1ea}
  .full:last-child{page-break-after:auto}
  .full img{max-width:100%;max-height:100%;display:block}
</style>
${pages}`;
}

// --- render ------------------------------------------------------------------

function toPdf(chrome, htmlFile, pdfFile) {
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=20000",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfFile}`,
    `file:///${htmlFile.replace(/\\/g, "/")}`,
  ], { stdio: "pipe" });
  const kb = Math.round(fs.statSync(pdfFile).size / 1024);
  console.log(`  ${path.basename(pdfFile).padEnd(24)} ${kb} KB`);
}

/*
 * A phone has to be able to open this. Chrome embeds the JPEGs untouched, which
 * made the first render 23 MB; re-encoding at 1000 px / q72 brings it under a
 * third of that with no visible loss at page size. Etsy also caps PDFs at 20 MB.
 */
async function compress() {
  if (!sharp) { console.log("  (sin sharp: se usan las imágenes originales)"); return "img"; }
  fs.mkdirSync(WEB, { recursive: true });
  const files = fs.readdirSync(IMG).filter((f) => f.endsWith(".jpg"));
  let before = 0, after = 0;
  for (const f of files) {
    const src = path.join(IMG, f);
    const dst = path.join(WEB, f);
    before += fs.statSync(src).size;
    if (!fs.existsSync(dst)) {
      await sharp(src).resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toFile(dst);
    }
    after += fs.statSync(dst).size;
  }
  console.log(`  ${files.length} imágenes: ${Math.round(before / 1048576)} MB → ${Math.round(after / 1048576)} MB`);
  return "img-web";
}

async function main() {
  const story = JSON.parse(fs.readFileSync(STORY_FILE, "utf8"));
  if (!fs.existsSync(path.join(IMG, "cover.jpg"))) {
    throw new Error("no hay imágenes en out/demo/img — corre antes scripts/gen-demo.js");
  }
  const chrome = findChrome();
  console.log("\nrecomprimiendo para móvil");
  DIR = await compress();

  const jobs = [
    ["print-vinetas.html", "comic-vinetas.pdf", await letteredHtml(story)],
  ];
  // Only if the whole-page comparison was actually generated for this story:
  // binding fourteen missing images produces a 7 KB PDF of empty pages.
  if (fs.existsSync(path.join(IMG, "full-1.jpg"))) {
    jobs.push(["print-paginas.html", "comic-paginas.pdf", fullPageHtml(story, "full")]);
  }
  // Only if the reference experiment has been run.
  if (fs.existsSync(path.join(IMG, "ref-1.jpg"))) {
    jobs.push(["print-paginas-ref.html", "comic-paginas-ref.pdf", fullPageHtml(story, "ref")]);
  }
  console.log(`\nChrome: ${chrome}\n`);
  for (const [htmlName, pdfName, html] of jobs) {
    const htmlFile = path.join(OUT, htmlName);
    fs.writeFileSync(htmlFile, html);
    toPdf(chrome, htmlFile, path.join(OUT, pdfName));
  }
  console.log(`\nen ${OUT}\n`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
