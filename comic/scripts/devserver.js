/*
 * Local server. Serves the static site and routes /api/* to the same handlers
 * Vercel will run, plus the two rewrites production needs.
 *
 * It reads the rewrites from vercel.json rather than hardcoding them, for the
 * reason cuentos learnt the hard way: a dev server whose routing drifts from
 * production is a dev server that lies to you.
 *
 * Usage: node scripts/devserver.js [--port 4123]
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[process.argv.indexOf("--port") + 1]) || 4123;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
  ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf",
};

const rewrites = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).rewrites || []; }
  catch { return []; }
})();

/*
 * Drop every cached module that lives inside the project, not just the handler.
 * Clearing only api/*.js means an edit to lib/ is invisible until a restart —
 * which cost an hour of debugging a "fix" the server was never running.
 * node_modules stays cached: reloading it on every request is slow and pointless.
 */
function freshRequire(file) {
  const root = path.resolve(ROOT);
  Object.keys(require.cache).forEach((key) => {
    if (key.startsWith(root) && !key.includes("node_modules")) delete require.cache[key];
  });
  return require(file);
}

function apiHandler(name) {
  const file = path.join(ROOT, "api", `${name}.js`);
  if (!fs.existsSync(file)) return null;
  return freshRequire(file);
}

function send(res, code, type, body) {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  // /api/<name>
  const api = pathname.match(/^\/api\/([\w-]+)$/);
  if (api) {
    const handler = apiHandler(api[1]);
    if (!handler) return send(res, 404, "application/json", JSON.stringify({ error: "no existe" }));
    try {
      return await handler(req, res);
    } catch (e) {
      console.error(`[api/${api[1]}]`, e);
      if (!res.headersSent) send(res, 500, "application/json", JSON.stringify({ error: e.message }));
      return;
    }
  }

  // /c/<token> is one page for every token.
  if (/^\/c\/[\w-]+$/.test(pathname)) pathname = "/c/index.html";

  // Whatever vercel.json rewrites, we rewrite the same way.
  for (const r of rewrites) {
    if (r.source === pathname) { pathname = r.destination.split("?")[0]; break; }
  }

  if (pathname.endsWith("/")) pathname += "index.html";
  // cleanUrls: /en works as well as /en/
  let file = path.join(ROOT, pathname);
  if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
  /* A DIRECTORY with an index.html inside it is a page, not a 404. The first
     version only looked for the index when the path did not exist at all, so
     /admin and /legal — which do exist, as folders — fell through to the
     "is it a directory?" check below and answered 404. */
  if (fs.existsSync(file) && fs.statSync(file).isDirectory() && fs.existsSync(path.join(file, "index.html"))) {
    file = path.join(file, "index.html");
  }

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, "text/html; charset=utf-8", "<h1>404</h1>");
  }
  // Never serve anything above the project, whatever the path says.
  if (!path.resolve(file).startsWith(path.resolve(ROOT))) return send(res, 403, "text/plain", "no");

  send(res, 200, TYPES[path.extname(file)] || "application/octet-stream", fs.readFileSync(file));
});

server.listen(PORT, () => {
  console.log(`\n  http://localhost:${PORT}        landing (ES)`);
  console.log(`  http://localhost:${PORT}/en/    landing (EN)`);
  console.log(`  almacén: ${process.env.STORE || "files"} · imagen: ${process.env.IMAGE_PROVIDER || "minimax"}\n`);
});
