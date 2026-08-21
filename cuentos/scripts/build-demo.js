/*
 * Builds out/demo.html: a self-contained mock of the /c/<token> viewer with
 * REAL generated material already on disk — no new AI calls, zero cost.
 *
 *   story  : first validated story found in out/spike-text/<model>/
 *   images : out/spike/or-nb2/ana/{sheet,p01..p12}.png (Nano Banana 2)
 *
 * The spike scenes were fixed for the comparison, so they do not match the
 * story text page by page; the page says so. What it does show faithfully:
 * the real text quality, the real illustration quality and consistency, and
 * the real viewer flow (script → sample → full).
 *
 * Usage: node scripts/build-demo.js [--model google_gemini-2.5-flash-lite] [--case mar-gato]
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { validateStory } = require("../lib/validate-story.js");
const { substitute } = require("../lib/pdf.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "out");

function argOf(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function pickStory() {
  const dir = path.join(ROOT, "out", "spike-text");
  const preferModel = argOf("model");
  const preferCase = argOf("case");
  const models = fs.readdirSync(dir).filter((m) => fs.statSync(path.join(dir, m)).isDirectory());
  const ordered = preferModel ? [preferModel, ...models.filter((m) => m !== preferModel)] : models;
  for (const model of ordered) {
    const files = fs.readdirSync(path.join(dir, model)).filter((f) => f.endsWith(".json") && !f.includes(".errors."));
    const chosen = preferCase ? files.find((f) => f.startsWith(preferCase)) : files[0];
    if (!chosen) continue;
    const story = JSON.parse(fs.readFileSync(path.join(dir, model, chosen), "utf8"));
    if (validateStory(story).ok) return { story, model, file: chosen };
  }
  throw new Error("no validated story on disk — run scripts/spike-text.js first");
}

async function dataUri(file, width) {
  const buf = await sharp(file).resize({ width, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

(async () => {
  const { story, model, file } = pickStory();
  const person = { name: "Ana", companionName: "Leo", dedication: "Para Ana, que nunca deja un dibujo a medias. De la abuela.", date: "agosto de 2026" };
  const imgDir = path.join(ROOT, "out", "spike", "or-nb2", "ana");

  const sheet = await dataUri(path.join(imgDir, "sheet.png"), 1100);
  const pages = [];
  for (let i = 1; i <= 12; i++) {
    pages.push(await dataUri(path.join(imgDir, `p${String(i).padStart(2, "0")}.png`), 900));
  }

  const title = esc(substitute(story.title, person));
  const pageHtml = story.pages.map((p, i) => {
    const text = esc(substitute(p.text, person));
    const sample = i === 0 || i === 5; // what a free sample would illustrate
    return `
    <article class="pg" data-n="${i + 1}">
      <div class="art ${sample ? "" : "locked"}">
        <img src="${pages[i]}" alt="" loading="lazy">
        ${sample ? "" : `<div class="veil"><span>Esta página se ilustra al completar el cuento</span></div>`}
      </div>
      <div class="txt"><p>${text}</p><span class="n">${i + 1}</span></div>
    </article>`;
  }).join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Andika:wght@400;700&family=Fraunces:opsz,wght@9..144,600&display=swap">
<style>
  :root{--paper:#F6F3EC;--ink:#2A2722;--muted:#756F66;--hair:#E2DCCF;--sea:#2E6E63;--sea-soft:#E2EDE9;--ochre:#8A6410;--ochre-soft:#F2EBD8;color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:Andika,system-ui,sans-serif;line-height:1.6}
  .wrap{max-width:52rem;margin:0 auto;padding:1.5rem 1rem 5rem}
  .bar{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center;justify-content:space-between;padding:.8rem 1rem;background:#fff;border:1px solid var(--hair);border-radius:12px;margin-bottom:1.5rem;font-size:.85rem}
  .bar b{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:1rem}
  .bar .exp{color:var(--muted)}
  .toggle{display:flex;gap:.25rem;background:var(--paper);border-radius:999px;padding:.2rem}
  .toggle button{border:0;background:transparent;padding:.35rem .8rem;border-radius:999px;font:inherit;cursor:pointer;color:var(--muted)}
  .toggle button[aria-pressed="true"]{background:var(--sea);color:#fff}
  .cta{background:var(--sea);color:#fff;border:0;border-radius:999px;padding:.55rem 1.1rem;font:inherit;font-weight:700;cursor:pointer}
  .note{background:var(--ochre-soft);border-left:3px solid var(--ochre);padding:.8rem 1rem;border-radius:0 8px 8px 0;font-size:.85rem;margin-bottom:1.5rem}
  h1{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:clamp(1.6rem,4vw,2.4rem);line-height:1.15;margin:0 0 .3rem;text-wrap:balance}
  .ded{color:var(--muted);font-style:italic;margin:0 0 1.5rem}
  .sheet{background:#fff;border:1px solid var(--hair);border-radius:12px;padding:1rem;margin-bottom:2rem}
  .sheet img{width:100%;border-radius:8px;display:block}
  .sheet figcaption{font-size:.8rem;color:var(--muted);margin-top:.5rem}
  .book{display:flex;flex-direction:column;gap:1.5rem}
  .pg{background:#fff;border:1px solid var(--hair);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px -18px rgba(0,0,0,.3)}
  .art{position:relative;aspect-ratio:16/9;background:var(--sea-soft)}
  .art img{width:100%;height:100%;object-fit:cover;display:block}
  .art.locked img{filter:blur(14px) saturate(.6);transform:scale(1.05)}
  .veil{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:1rem;text-align:center}
  .veil span{background:rgba(255,255,255,.92);border-radius:999px;padding:.5rem 1rem;font-size:.85rem;color:var(--muted)}
  .txt{padding:1.2rem 1.4rem 1rem;position:relative}
  .txt p{margin:0;font-size:1.05rem;max-width:60ch}
  .n{position:absolute;right:1rem;bottom:.5rem;font-size:.75rem;color:var(--muted)}
  body.full .art.locked img{filter:none;transform:none}
  body.full .veil{display:none}
  body.script .art{display:none}
  body.script .sheet{display:none}
  .foot{margin-top:2.5rem;font-size:.8rem;color:var(--muted);border-top:1px solid var(--hair);padding-top:1rem}
  .foot code{background:#fff;padding:.05rem .3rem;border-radius:4px}
</style></head>
<body class="sample">
<div class="wrap">
  <div class="bar">
    <div><b>cuentos</b> <span class="exp">· este enlace caduca en 7 días</span></div>
    <div class="toggle" role="group" aria-label="Estado del cuento">
      <button data-stage="script">1 · Guion</button>
      <button data-stage="sample" aria-pressed="true">2 · Muestra</button>
      <button data-stage="full">3 · Completo</button>
    </div>
    <button class="cta" id="cta">Completar el cuento — 12,90 €</button>
  </div>

  <div class="note"><b>Qué es esto.</b> Un prototipo del visor con material <b>real</b> ya generado: el texto lo escribió <code>${esc(model)}</code> (caso <code>${esc(file)}</code>), las ilustraciones son las 13 de Nano Banana 2 del spike de consistencia. Las escenas del spike eran fijas para comparar proveedores, así que <b>no coinciden página a página con el texto</b>; en producción cada ilustración se genera desde el <code>image_hint</code> de su página. Lo que sí es fiel: la calidad del texto, la de las imágenes, la consistencia del personaje y el flujo guion → muestra → completo. Coste de esta página: 0 $.</div>

  <h1>${title}</h1>
  <p class="ded">${esc(person.dedication)}</p>

  <figure class="sheet">
    <img src="${sheet}" alt="Hoja de personaje de Ana">
    <figcaption>Así es Ana — la hoja de personaje que el modelo recibe como referencia en cada página.</figcaption>
  </figure>

  <div class="book">${pageHtml}</div>

  <p class="foot">Moraleja (no se imprime como sermón; se muestra): <em>${esc(story.moral)}</em> · Páginas para colorear y ficha final: en el PDF completo. · Texto e ilustraciones generados con IA y revisados a mano antes de entregar.</p>
</div>
<script>
  const body=document.body, btns=document.querySelectorAll('.toggle button'), cta=document.getElementById('cta');
  const labels={script:'Me gusta, ver cómo quedaría',sample:'Completar el cuento — 12,90 €',full:'Descargar PDF'};
  btns.forEach(b=>b.addEventListener('click',()=>{const s=b.dataset.stage;body.className=s;btns.forEach(x=>x.setAttribute('aria-pressed',x===b));cta.textContent=labels[s];}));
</script>
</body></html>`;

  fs.mkdirSync(OUT, { recursive: true });
  const file2 = path.join(OUT, "demo.html");
  fs.writeFileSync(file2, html);
  console.log(`[cuentos] wrote ${file2} (${(html.length / 1024 / 1024).toFixed(2)} MB) — story from ${model}/${file}`);
})().catch((e) => { console.error("[cuentos] build-demo failed:", e.message); process.exit(1); });
