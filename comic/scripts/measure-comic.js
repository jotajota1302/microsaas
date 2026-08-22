/*
 * Un cómic entero por el camino de producción, cronometrado y con el coste
 * MEDIDO, no estimado.
 *
 * Ejecuta las dos máquinas de estados reales (lib/preview-job.js y
 * lib/render-job.js) paso a paso, como las ejecutarían el visor y el cron, y
 * saca al final lo que ha costado según lo que han reportado los propios
 * proveedores: imágenes a tarifa plana, texto por tokens de entrada y salida.
 *
 * Lo que NO mide, dicho antes de que alguien use el número para algo:
 *   - la latencia de la plataforma. Esto corre desde un portátil en España; en
 *     Vercel las funciones salen de iad1 y el trayecto hasta MiniMax es otro.
 *     El tiempo de proveedor es el mismo; el de red, no.
 *   - el almacén. Aquí escribe en ficheros; en producción es Supabase, que
 *     añade una ida y vuelta por paso y no aparece en estos números.
 *
 * Uso:
 *   node scripts/measure-comic.js
 *   node scripts/measure-comic.js --band 12-13 --style shonen
 *   node scripts/measure-comic.js --preview-only     # solo la mitad gratis
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

process.env.STORE = process.env.STORE || "files";
process.env.BLOBS = process.env.BLOBS || "files";
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "console";
process.env.STORE_DIR = process.env.STORE_DIR || path.join(ROOT, "out", "medicion", "jobs");
process.env.BLOB_DIR = process.env.BLOB_DIR || path.join(ROOT, "out", "medicion", "blobs");

// images.js carga el .env del proyecto al requerirse; esto lo fuerza antes de
// que nada más mire las claves.
require("../lib/images.js");

const meter = require("../lib/meter.js");
const { store } = require("../lib/store.js");
const { blobs, keys } = require("../lib/blobs.js");
const { parseOrder, pipelineOrder } = require("../lib/order.js");
const { advance } = require("../lib/preview-job.js");
const { advanceRender } = require("../lib/render-job.js");
const { PRODUCT } = require("../lib/money.js");

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

/*
 * Un pedido inventado, pero plausible: chico de 16-17 (la banda más larga, 16
 * páginas, que es el caso caro), mundo de cazadores, tono oscuro, y un rasgo
 * que la historia tiene que resolver. Nombres corrientes a propósito — un
 * nombre raro pasaría comprobaciones que uno normal no pasa.
 */
const PEDIDO = {
  name: "Bruno",
  ageBand: flag("band", "16-17"),
  gender: "m",
  hairShape: "despeinado",
  hairColour: "negro",
  eyes: "marron",
  skin: "media",
  build: "delgado",
  mark: "cazadora",
  trait: "tozudo",
  trope: flag("trope", "cazador"),
  tone: "oscuro",
  style: flag("style", "manga-bn"),
  email: "prueba@example.com",
  lang: "es",
  sidekick: { name: "Iria", relation: "mejor-amiga" },
};

const seg = (ms) => `${(ms / 1000).toFixed(1)} s`;

async function correr(nombre, token, avanzar, hecho) {
  const pasos = [];
  const t0 = Date.now();
  for (let i = 1; i <= 60; i++) {
    const antes = Date.now();
    const r = await avanzar(token);
    const dur = Date.now() - antes;
    const donde = hecho(r.job);
    pasos.push({ paso: donde, ms: dur });
    console.log(`  ${String(i).padStart(2)}  ${donde.padEnd(26)} ${seg(dur).padStart(8)}`);
    if (r.done) break;
  }
  const total = Date.now() - t0;
  console.log(`  ${nombre}: ${seg(total)} en ${pasos.length} llamadas\n`);
  return { pasos, total };
}

function tabla(titulo, s) {
  console.log(`\n${titulo}`);
  console.log("  " + "proveedor / modelo".padEnd(30) + "llam.".padStart(6) + "entrada".padStart(10) + "salida".padStart(9) + "     $");
  for (const [k, v] of Object.entries(s.by).sort()) {
    console.log("  " + k.padEnd(30) + String(v.calls).padStart(6) +
      String(v.inTokens || "-").padStart(10) + String(v.outTokens || "-").padStart(9) +
      ("  " + v.usd.toFixed(4)).padStart(10) + (v.unpriced ? `  (${v.unpriced} sin tarifa)` : ""));
  }
  console.log("  " + "".padEnd(30) + "".padStart(6) + "".padStart(10) + "TOTAL".padStart(9) + ("  " + s.usd.toFixed(4)).padStart(10));
}

async function main() {
  fs.rmSync(path.join(ROOT, "out", "medicion"), { recursive: true, force: true });
  meter.reset();

  const { ok, errors, order } = parseOrder(PEDIDO);
  if (!ok) throw new Error(`el pedido no vale: ${errors[0]}`);
  const { order: masked, names } = pipelineOrder(order);

  const token = "medicion";
  await store.create({
    token, status: "pending", step: "outline", progress: 0, attempts: 0,
    order: masked, names, email: order._email, lang: order.lang,
    base_url: "http://localhost:3003",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    data: {},
  });

  console.log(`\n${PEDIDO.name}, ${PEDIDO.ageBand} · ${PEDIDO.trope} · ${PEDIDO.tone} · ${PEDIDO.style}`);
  console.log(`secundario: ${PEDIDO.sidekick.name} (${PEDIDO.sidekick.relation})\n`);

  console.log("MITAD GRATIS — guion + portada");
  const gratis = await correr("vista previa", token, advance, (j) => `${j.step} · ${j.status}`);
  const trasGratis = meter.summary();

  // La portada la dibuja api/job.js, no el paso; aquí se hace lo mismo a mano
  // para que la medición cubra lo que el cliente recibe gratis.
  const job = await store.get(token);
  if (job.status === "ready" && job.data.coverPrompt && !(await blobs.get(keys.cover(token)))) {
    const { drawWithLadder } = require("../lib/images.js");
    const { checkPanel } = require("../lib/panel-check.js");
    const t = Date.now();
    const drawn = await drawWithLadder({ prompt: job.data.coverPrompt, aspect: "2:3" });
    const checked = await checkPanel(drawn.buffer, job.data.story.style);
    await blobs.put(keys.cover(token), checked.buffer);
    console.log(`  portada ${seg(Date.now() - t)}${checked.verdict !== "ok" ? ` (${checked.verdict})` : ""}\n`);
    gratis.total += Date.now() - t;
  }

  const story = (await store.get(token)).data.story;
  if (!story) throw new Error("no hay guion: la vista previa no llegó a terminar");
  const vinetas = story.pages.reduce((a, p) => a + p.panels.length, 0);
  console.log(`«${story.title}» · ${story.pages.length} páginas · ${vinetas} viñetas`);
  tabla("COSTE DE LA MITAD GRATIS", trasGratis);

  if (process.argv.includes("--preview-only")) return informe(gratis, null, story, vinetas);

  await store.update(token, {
    paid_at: new Date().toISOString(),
    payment: { provider: "prueba", amount_cents: PRODUCT.priceCents, currency: "eur" },
    render_status: "pending", render_step: "sheets", render_progress: 0, render_attempts: 0,
  });

  console.log("\nMITAD DE PAGO — hojas de personaje + viñetas + PDF + entrega");
  const pagado = await correr("render", token, advanceRender, (j) => {
    const r = j.render || {};
    return `${j.render_step} · ${r.total ? `${r.drawn}/${r.total}` : j.render_status}`;
  });

  informe(gratis, pagado, story, vinetas);
}

function informe(gratis, pagado, story, vinetas) {
  const s = meter.summary();
  tabla("COSTE TOTAL DEL CÓMIC", s);

  const eur = s.usd * 0.92;
  const precio = PRODUCT.priceCents / 100;
  console.log(`\nTIEMPOS`);
  console.log(`  vista previa   ${seg(gratis.total)}`);
  if (pagado) console.log(`  render         ${seg(pagado.total)}`);
  if (pagado) console.log(`  total          ${seg(gratis.total + pagado.total)}`);

  console.log(`\nDINERO`);
  console.log(`  coste          ${s.usd.toFixed(4)} $  =  ${eur.toFixed(3)} €`);
  console.log(`  precio         ${precio.toFixed(2)} €`);
  console.log(`  el coste es el ${((eur / precio) * 100).toFixed(1)} % del precio`);
  if (s.unpriced) console.log(`  ⚠ ${s.unpriced} llamadas sin tarifa conocida: el total se queda corto`);

  const blob = path.join(ROOT, "out", "medicion", "blobs", "medicion");
  const imgs = fs.existsSync(blob) ? fs.readdirSync(blob) : [];
  console.log(`\nSALIDA`);
  console.log(`  ${imgs.length} ficheros en out/medicion/blobs/medicion/`);
  const pdf = imgs.find((f) => f.endsWith(".pdf"));
  if (pdf) {
    const bytes = fs.statSync(path.join(blob, pdf)).size;
    console.log(`  ${pdf} · ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  }
  fs.writeFileSync(path.join(ROOT, "out", "medicion", "llamadas.json"), JSON.stringify(meter.all(), null, 2));
  console.log(`  detalle llamada a llamada en out/medicion/llamadas.json\n`);
}

main().catch((e) => { console.error("\n" + e.stack); process.exit(1); });
