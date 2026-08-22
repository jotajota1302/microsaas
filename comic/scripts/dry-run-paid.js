/*
 * Walks the WHOLE paid half end to end, on a laptop, for nothing.
 *
 *   webhook said paid -> sheets -> panels -> pdf -> deliver -> done
 *
 * The trick is that the panels are already drawn: this seeds the blob store
 * from a comic generated earlier, so every step runs its real code and finds
 * its work already done. What is exercised for real is the state machine, the
 * blob keys, the PDF builder and the delivery — which is everything that has
 * never had a customer through it — without seven minutes and 0,22 EUR of
 * provider time, and without a card.
 *
 * The one thing it does NOT prove is that the provider draws 78 usable panels
 * in production. That needs a real order and is the next thing to do.
 *
 * Usage:
 *   node scripts/dry-run-paid.js
 *   node scripts/dry-run-paid.js --story stories/kia.json --img out/demo/img
 *   node scripts/dry-run-paid.js --holes 5     # ¿se planta si faltan viñetas?
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Everything local: files on disk, email to the console, no provider key needed.
process.env.STORE = process.env.STORE || "files";
process.env.BLOBS = process.env.BLOBS || "files";
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "console";

/*
 * With --holes the point is to check the gate that refuses to deliver, so the
 * withheld panels must STAY withheld. Without this the render simply drew them
 * — correct behaviour, and it meant the first run of this test proved nothing
 * about the gate.
 */
if (process.argv.includes("--holes")) process.env.MAX_TRIES_PER_PANEL = "0";

const { store } = require("../lib/store.js");
const { blobs, keys } = require("../lib/blobs.js");
const { advanceRender } = require("../lib/render-job.js");

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

async function main() {
  const storyArg = flag("story", "stories/nerea.json");
  const slug = path.basename(storyArg).replace(/\.json$/, "");
  const imgDir = path.join(ROOT, flag("img", `out/${slug === "kia" ? "demo" : slug}/img`));
  const holes = Number(flag("holes", 0));
  const token = `dryrun-${slug}`;

  const story = JSON.parse(fs.readFileSync(path.join(ROOT, storyArg), "utf8"));
  if (!fs.existsSync(imgDir)) throw new Error(`no hay imágenes en ${imgDir}`);

  // --- seed the blobs from the earlier comic ---------------------------------
  let seeded = 0;
  let skipped = 0;
  const cover = path.join(imgDir, "cover.jpg");
  if (fs.existsSync(cover)) { await blobs.put(keys.cover(token), fs.readFileSync(cover)); seeded++; }
  for (const who of ["hero", ...Object.keys(story.cast || {})]) {
    const f = path.join(imgDir, `sheet-${who}.jpg`);
    if (fs.existsSync(f)) { await blobs.put(keys.sheet(token, who), fs.readFileSync(f)); seeded++; }
  }
  let n = 0;
  for (const [pi, page] of story.pages.entries()) {
    for (const qi of page.panels.keys()) {
      const f = path.join(imgDir, `p${pi + 1}-${qi + 1}.jpg`);
      // --holes leaves the last N undrawn, to check the gate that refuses to
      // deliver a comic full of blanks.
      const withheld = holes && n >= story.pages.reduce((a, p) => a + p.panels.length, 0) - holes;
      if (fs.existsSync(f) && !withheld) { await blobs.put(keys.panel(token, pi, qi), fs.readFileSync(f)); seeded++; }
      else skipped++;
      n++;
    }
  }
  console.log(`\nsembradas ${seeded} imágenes${skipped ? `, ${skipped} a propósito no` : ""} · token ${token}`);

  // --- a job in exactly the state the webhook leaves one in -------------------
  await store.create({
    token,
    status: "ready",
    step: "done",
    progress: 100,
    order: story.order || { name: story.hero.name, lang: "es" },
    email: "prueba@example.com",
    lang: "es",
    base_url: "http://localhost:3003",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cover_url: `/api/file?token=${token}&k=cover`,
    data: { story },
    paid_at: new Date().toISOString(),
    payment: { provider: "stripe", provider_id: "cs_test_dryrun", amount_cents: 1499, currency: "eur" },
    render_status: "pending",
    render_step: "sheets",
    render_progress: 0,
    render_attempts: 0,
  });

  // --- drive it the way the viewer and the cron do ---------------------------
  const t0 = Date.now();
  for (let i = 1; i <= 40; i++) {
    const { job, done } = await advanceRender(token);
    const r = job.render || {};
    const where = job.render_step === "panels" && r.total ? `${r.drawn}/${r.total}` : "";
    console.log(`  ${String(i).padStart(2)} · ${String(job.render_step).padEnd(8)} ${String(job.render_status).padEnd(16)} ${where}`);
    if (done) break;
  }

  const final = await store.get(token);
  const pdf = await blobs.get(keys.pdf(token));
  console.log(`\n  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  estado    ${final.render_status}${final.render_error ? ` (${final.render_error})` : ""}`);
  console.log(`  pdf       ${pdf ? `${(pdf.length / 1024 / 1024).toFixed(2)} MB` : "NO SE HA GENERADO"}`);
  console.log(`  entregado ${final.delivered_at || "no"}`);
  if (final.render && final.render.email) console.log(`  correo    ${JSON.stringify(final.render.email)}`);
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
