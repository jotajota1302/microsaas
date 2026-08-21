/*
 * Runs the whole site locally the way Vercel does: static files plus the api/
 * functions, with no 60-second function ceiling.
 *
 *   node scripts/devserver.js            → http://localhost:3000
 *   node scripts/devserver.js 4000
 *
 * Every API call prints what it cost, and the running total, so a real run
 * through the funnel produces measurements rather than impressions. Set
 * COST_LOG to also write one JSON line per paid call:
 *
 *   COST_LOG=out/cost.jsonl node scripts/devserver.js
 *   node scripts/cost-report.js out/cost.jsonl
 *
 * Development only. It is not what serves production.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
process.chdir(ROOT);
const { env } = require("../lib/env.js");
const meter = require("../lib/meter.js");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".pdf": "application/pdf",
  ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain", ".woff2": "font/woff2",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

const PORT = Number(process.argv[2] || 3000);
const BASE = `http://localhost:${PORT}`;
const USD_EUR = 0.92;
const money = (usd) => `${(usd * USD_EUR).toFixed(4).replace(".", ",")} €`;

function announce(route, spentBefore, ms, body) {
  const spent = meter.summary().usd;
  const delta = spent - spentBefore;
  const bits = [`${route}  ${(ms / 1000).toFixed(1)} s`];
  if (delta > 0) bits.push(`gasto ${money(delta)}  ·  acumulado ${money(spent)}`);
  console.log(`  → ${bits.join("  ·  ")}`);
  // Surface the story link so nobody has to dig it out of the network tab.
  const token = body && (body.token || (body.story && body.story.token));
  if (token && route.includes("/api/order")) console.log(`     cuento: ${BASE}/c/${token}`);
}

/*
 * The same rewrites production uses, read from vercel.json rather than copied.
 * Several endpoints share one function file (Vercel's Hobby plan allows twelve
 * of them), so without this the dev server would answer 404 where production
 * answers fine — the worst kind of difference between the two.
 */
const REWRITES = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).rewrites || [];

function rewrite(pathname) {
  for (const r of REWRITES) {
    const re = new RegExp("^" + r.source.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/:[a-zA-Z]+/g, "([^/]+)") + "$");
    if (re.test(pathname)) return r.destination;
  }
  return null;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  let p = decodeURIComponent(url.pathname);

  const to = rewrite(p);
  if (to) {
    const [target, search] = to.split("?");
    if (search) for (const [k, v] of new URLSearchParams(search)) url.searchParams.set(k, v);
    p = target;
  }

  if (p.startsWith("/api/")) {
    const file = path.join(ROOT, "api", p.slice(5).replace(/\/$/, "") + ".js");
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end(JSON.stringify({ error: "no_such_function" })); }
    req.query = Object.fromEntries(url.searchParams.entries());

    const started = Date.now();
    const spentBefore = meter.summary().usd;
    console.log(`\n${req.method} ${p}`);

    // Wrap res.end so the cost line lands after the handler has answered.
    const end = res.end.bind(res);
    res.end = (chunk, ...rest) => {
      let body = null;
      try { body = JSON.parse(String(chunk)); } catch { /* not json, fine */ }
      announce(`${res.statusCode} ${p}`, spentBefore, Date.now() - started, body);
      return end(chunk, ...rest);
    };

    try {
      return await require(file)(req, res);
    } catch (e) {
      console.error(`  ✗ ${e.stack || e.message}`);
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "internal", detail: String(e.message) }));
    }
  }

  // (the /c/:token rewrite came from vercel.json, at the top of the request)

  let file = path.join(ROOT, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end("404 " + p); }
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  const has = (k) => (env[k] ? "sí" : "NO");
  console.log(`\ncuentos en ${BASE}`);
  console.log(`  formulario   ${BASE}/crear/`);
  console.log(`  revisión     ${BASE}/admin/   (token: ADMIN_TOKEN del .env)`);
  console.log(`\n  base de datos ${has("SUPABASE_SERVICE_ROLE_KEY")}   ·   IA ${has("OPENROUTER_API_KEY")}   ·   email ${has("RESEND_API_KEY")}`);
  if (env.COST_LOG) console.log(`  registro de coste → ${env.COST_LOG}`);
  if (env.IMAGE_CACHE_DIR) console.log(`  ⚠ caché de imágenes activa (${env.IMAGE_CACHE_DIR}): las repetidas costarán 0`);
  console.log("");
});
