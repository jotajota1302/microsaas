/*
 * ¿Termina un cómic PAGADO sin que nadie lo mire?
 *
 * Esta es la prueba del fallo del 2026-08-27: un pedido cobrado a las 08:04 se
 * quedó parado en `panels` con `locked_until` libre y el progreso a cero,
 * porque el comprador cerró la pestaña. La máquina era «quien mira, empuja», y
 * cuando nadie mira, nadie empuja: el único motor de un cómic de 15 EUR era una
 * pestaña de navegador abierta durante veinticinco minutos.
 *
 * CÓMO PRUEBA ESO, que es lo único que importa aquí: da UN SOLO golpe a
 * /api/render y a partir de ahí NO vuelve a tocar ningún endpoint. El progreso
 * se lee del almacén en disco, nunca por HTTP, porque llamar a /api/render para
 * "consultar" sería empujar el trabajo y la prueba se aprobaría a sí misma.
 *
 * Si el pedido llega a `done` con una sola llamada, la cadena existe. Si se
 * queda a medias, es el fallo de producción reproducido en el portátil.
 *
 * Las viñetas están ya dibujadas (se siembran de un cómic anterior, igual que
 * en dry-run-paid.js): esto mide el TRANSPORTE, no al proveedor. Cuesta cero.
 *
 * Uso:
 *   node scripts/dry-run-chain.js
 *   node scripts/dry-run-chain.js --port 4127 --wait 240
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");

process.env.STORE = "files";
process.env.BLOBS = "files";
process.env.EMAIL_PROVIDER = "console";

const { store } = require("../lib/store.js");
const { blobs, keys } = require("../lib/blobs.js");

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

const PORT = Number(flag("port", 4127));
const WAIT_S = Number(flag("wait", 240));
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "chaintest";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** El servidor local, con el mismo almacén en disco que este proceso. */
function startServer() {
  const child = spawn(process.execPath, [path.join(ROOT, "scripts", "devserver.js"), "--port", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      STORE: "files",
      BLOBS: "files",
      EMAIL_PROVIDER: "console",
      // Sin esto el disparo de la cadena no sabe a qué host llamarse.
      PUBLIC_BASE_URL: BASE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  const keep = (b) => { const s = b.toString(); log.push(s); if (process.env.VERBOSE) process.stdout.write(s); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  return { child, log };
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/api/config`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch { /* todavía no */ }
    await sleep(200);
  }
  throw new Error("el servidor local no ha arrancado");
}

async function seed() {
  const story = JSON.parse(fs.readFileSync(path.join(ROOT, "stories", "nerea.json"), "utf8"));
  const imgDir = path.join(ROOT, "out", "nerea", "img");
  if (!fs.existsSync(imgDir)) throw new Error(`no hay imágenes en ${imgDir}`);

  let seeded = 0;
  const cover = path.join(imgDir, "cover.jpg");
  if (fs.existsSync(cover)) { await blobs.put(keys.cover(TOKEN), fs.readFileSync(cover)); seeded++; }
  for (const who of ["hero", ...Object.keys(story.cast || {})]) {
    const f = path.join(imgDir, `sheet-${who}.jpg`);
    if (fs.existsSync(f)) { await blobs.put(keys.sheet(TOKEN, who), fs.readFileSync(f)); seeded++; }
  }
  for (const [pi, page] of story.pages.entries()) {
    for (const qi of page.panels.keys()) {
      const f = path.join(imgDir, `p${pi + 1}-${qi + 1}.jpg`);
      if (fs.existsSync(f)) { await blobs.put(keys.panel(TOKEN, pi, qi), fs.readFileSync(f)); seeded++; }
    }
  }

  /*
   * Exactamente el estado en el que el webhook deja un pedido, salvo que
   * arranca en `sheets` y no en `dialogue`: el pulido llama a OpenRouter y esta
   * prueba no debe depender de un proveedor ni gastar nada.
   */
  await store.create({
    token: TOKEN,
    status: "ready",
    step: "done",
    progress: 100,
    order: story.order || { name: story.hero.name, lang: "es" },
    email: "prueba@example.com",
    lang: "es",
    base_url: BASE,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cover_url: `/api/file?token=${TOKEN}&k=cover`,
    data: { story },
    paid_at: new Date().toISOString(),
    payment: { provider: "stripe", provider_id: "cs_test_chain", amount_cents: 1499, currency: "eur" },
    render_status: "pending",
    render_step: "sheets",
    render_progress: 0,
    render_attempts: 0,
  });
  return seeded;
}

async function main() {
  // Un pedido anterior con el mismo token falsearía el resultado.
  try { await store.remove(TOKEN); } catch { /* no estaba */ }

  const seeded = await seed();
  console.log(`\nsembradas ${seeded} imágenes · token ${TOKEN}`);

  const { child, log } = startServer();
  try {
    await waitForServer();
    console.log(`servidor en ${BASE}\n`);

    // ---- ¿ve el servidor el mismo pedido que este proceso? ------------------
    const onDisk = await store.get(TOKEN);
    const probe = await fetch(`${BASE}/api/file?token=${TOKEN}&k=cover`);
    console.log(`en disco: ${onDisk ? onDisk.render_step : "NO"} · el servidor lo ve: ${probe.status}`);

    // ---- EL ÚNICO GOLPE ----------------------------------------------------
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/render?token=${TOKEN}`, { signal: AbortSignal.timeout(300000) });
    const body = await res.text();
    console.log(`un solo golpe a /api/render -> ${res.status} ${body.slice(0, 160)}`);
    if (!res.ok) throw new Error(`el golpe inicial no fue aceptado: ${res.status} ${body.slice(0, 200)}`);
    console.log("a partir de aquí NADIE vuelve a llamar a ningún endpoint.\n");

    // ---- mirar sin tocar ---------------------------------------------------
    let last = "";
    let done = null;
    while ((Date.now() - t0) / 1000 < WAIT_S) {
      const job = await store.get(TOKEN);
      const r = (job && job.render) || {};
      const where = job.render_step === "panels" && r.total ? ` ${r.drawn}/${r.total}` : "";
      const line = `${job.render_step}${where} ${job.render_status}`;
      if (line !== last) {
        console.log(`  ${String(((Date.now() - t0) / 1000).toFixed(0)).padStart(4)}s  ${line}`);
        last = line;
      }
      if (job.render_status === "done" || job.render_status === "needs_attention") { done = job; break; }
      await sleep(2000);
    }

    const job = done || (await store.get(TOKEN));
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const pdf = await blobs.get(keys.pdf(TOKEN));
    console.log("");
    if (job.render_status === "done") {
      console.log(`OK · el cómic ha terminado SOLO en ${secs}s, con una única llamada.`);
      console.log(`     pdf ${pdf ? `${(pdf.length / 1024 / 1024).toFixed(2)} MB` : "NO"} · entregado ${job.delivered_at || "no"}`);
    } else {
      console.log(`FALLA · sigue en "${job.render_step}" (${job.render_status}) tras ${secs}s sin que nadie lo empuje.`);
      console.log("        Esto es el fallo de producción: el pedido depende de que alguien mire.");
    }
    const kicks = log.join("").match(/\[comic\] cadena/g);
    console.log(`     disparos de cadena en el log: ${kicks ? kicks.length : 0}`);
    console.log("");
    process.exitCode = job.render_status === "done" ? 0 : 1;
  } finally {
    child.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
