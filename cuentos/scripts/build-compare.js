/*
 * Builds out/compare.html: the same character and the same 12 scenes, side by
 * side, MiniMax image-01 vs Nano Banana 2 — from images already on disk.
 * Zero AI calls.
 *
 * Usage: node scripts/build-compare.js [--character ana]
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const character = (() => { const i = process.argv.indexOf("--character"); return i > -1 ? process.argv[i + 1] : "ana"; })();

const SCENES = [
  "Playa soleada, recogiendo conchas", "Bosque de noche con un farolillo", "Horneando pan en una cocina",
  "En la cubierta de un velero", "Cueva de cristales luminosos", "Biblioteca enorme, subida a una escalera",
  "Cima de una montaña sobre las nubes", "Mercado con puestos de fruta", "Nave espacial mirando las estrellas",
  "Jardín bajo la lluvia con paraguas", "Ventanilla de un tren en marcha", "Quedándose dormida en su cuarto",
];

const PROVIDERS = [
  { id: "minimax", name: "MiniMax image-01", cost: "0,0035 $/img · 40-65 s · 1024 px", dir: path.join(ROOT, "out/spike/minimax", character) },
  { id: "or-nb2", name: "Nano Banana 2 (OpenRouter)", cost: "0,07 $/img · 14 s · 1024-1376 px", dir: path.join(ROOT, "out/spike/or-nb2", character) },
];

async function uri(file, width) {
  if (!fs.existsSync(file)) return null;
  const buf = await sharp(file).resize({ width, withoutEnlargement: true }).jpeg({ quality: 74 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

(async () => {
  const sheets = await Promise.all(PROVIDERS.map((p) => uri(path.join(p.dir, "sheet.png"), 900)));
  const rows = [];
  for (let i = 1; i <= 12; i++) {
    const cells = await Promise.all(PROVIDERS.map((p) => uri(path.join(p.dir, `p${String(i).padStart(2, "0")}.png`), 640)));
    rows.push({ i, cells });
  }

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MiniMax frente a Nano Banana</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Karla:wght@400;700&family=Fraunces:opsz,wght@9..144,600&display=swap">
<style>
  :root{--paper:#F4F6F2;--ink:#1B2430;--muted:#5B6672;--hair:#D6DBD3;--sea:#2E6E63;color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:Karla,system-ui,sans-serif;line-height:1.55}
  .wrap{max-width:64rem;margin:0 auto;padding:1.5rem 1rem 5rem}
  h1{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:clamp(1.5rem,3.5vw,2.2rem);margin:0 0 .4rem}
  .lede{color:var(--muted);max-width:60ch;margin:0 0 1.5rem}
  .head{display:grid;grid-template-columns:3rem 1fr 1fr;gap:.8rem;align-items:end;position:sticky;top:0;background:var(--paper);padding:.6rem 0;border-bottom:1px solid var(--hair);z-index:2}
  .head h2{font-family:Fraunces,Georgia,serif;font-size:1.05rem;margin:0}
  .head small{display:block;color:var(--muted);font-size:.75rem;font-weight:400}
  .row{display:grid;grid-template-columns:3rem 1fr 1fr;gap:.8rem;align-items:start;padding:1rem 0;border-bottom:1px solid var(--hair)}
  .row .n{font-family:Fraunces,Georgia,serif;font-size:1.4rem;color:var(--sea)}
  .row .n small{display:block;font-family:Karla,sans-serif;font-size:.7rem;color:var(--muted);line-height:1.3}
  .row img{width:100%;border-radius:8px;display:block;background:#fff;border:1px solid var(--hair)}
  .missing{aspect-ratio:4/3;border:1px dashed var(--hair);border-radius:8px;display:grid;place-items:center;color:var(--muted);font-size:.8rem}
  .sheets{display:grid;grid-template-columns:3rem 1fr 1fr;gap:.8rem;padding:1rem 0;border-bottom:2px solid var(--hair)}
  .sheets .n{font-size:.8rem;color:var(--muted)}
  .verdict{margin-top:2rem;background:#fff;border:1px solid var(--hair);border-radius:12px;padding:1.2rem 1.4rem}
  .verdict h2{font-family:Fraunces,Georgia,serif;font-size:1.2rem;margin:0 0 .6rem}
  .verdict ul{margin:0;padding-left:1.1rem;font-size:.9rem;color:var(--muted)}
  .verdict li b{color:var(--ink)}
  @media (max-width:40rem){.head,.row,.sheets{grid-template-columns:2rem 1fr 1fr;gap:.4rem}}
</style></head>
<body><div class="wrap">
  <h1>La misma niña, las mismas doce escenas</h1>
  <p class="lede">Descripción idéntica («niña de 5 años, pelo castaño rizado, gafas redondas, vestido mostaza, zapatos rojos»), el mismo sufijo de estilo acuarela y la hoja de personaje de cada proveedor como referencia. Nada retocado ni seleccionado: son las primeras y únicas imágenes que salieron.</p>

  <div class="head"><div></div>${PROVIDERS.map((p) => `<div><h2>${p.name}</h2><small>${p.cost}</small></div>`).join("")}</div>

  <div class="sheets"><div class="n">Hoja de personaje</div>${sheets.map((s) => s ? `<img src="${s}" alt="hoja de personaje">` : `<div class="missing">sin hoja</div>`).join("")}</div>

  ${rows.map((r) => `<div class="row"><div class="n">${r.i}<small>${SCENES[r.i - 1]}</small></div>${r.cells.map((c) => c ? `<img src="${c}" alt="escena ${r.i}" loading="lazy">` : `<div class="missing">no generada</div>`).join("")}</div>`).join("")}

  <div class="verdict">
    <h2>Qué mirar</h2>
    <ul>
      <li><b>¿Es la misma niña?</b> En las dos columnas, casi siempre sí. Eso MiniMax lo hace razonablemente bien.</li>
      <li><b>¿Es el mismo libro?</b> Recorre la columna izquierda de arriba abajo: acuarela, vectorial saturado, pintura digital, 3D. Recorre la derecha: una sola mano. Un libro impreso o un PDF que se hojea en el móvil se juzga por esto.</li>
      <li><b>Detalles que se pagan:</b> manos, zapatos, la lámpara, el bosque de noche. Y la firma que MiniMax deja abajo a la derecha en varias páginas pese a pedir «no watermark».</li>
      <li><b>Lo que cuesta la diferencia:</b> 17 imágenes por cuento → 0,06 $ frente a 1,20 $. Sobre 12,90 € de venta, la derecha se come el 9 % del precio; la izquierda, nada — pero hay que poder venderla.</li>
      <li><b>Tiempo:</b> el cliente espera su muestra ilustrada: 3 imágenes son ~45 s con Nano Banana y ~2,5 min con MiniMax en serie.</li>
    </ul>
  </div>
</div></body></html>`;

  fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
  const file = path.join(ROOT, "out", "compare.html");
  fs.writeFileSync(file, html);
  console.log(`[cuentos] wrote ${file} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
})().catch((e) => { console.error("[cuentos] build-compare failed:", e.message); process.exit(1); });
