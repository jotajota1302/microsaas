/*
 * The handful of request/response chores every endpoint repeats.
 *
 * Small on purpose: this is not a framework, it is the four things that were
 * being written four times and getting written differently each time — one of
 * them wrongly (see clientIp).
 */

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function requireMethod(req, res, ...allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader("Allow", allowed.join(", "));
  send(res, 405, { error: `usa ${allowed.join(" o ")}` });
  return false;
}

async function readJson(req, { maxBytes = 16 * 1024 } = {}) {
  if (req.body && typeof req.body === "object") return req.body; // the platform parsed it
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("cuerpo demasiado grande");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/*
 * The bytes exactly as they arrived. Stripe's signature is computed over them,
 * so anything that re-serialises the body produces a signature mismatch.
 *
 * Vercel parses JSON bodies and exposes the original on req.rawBody when it
 * does. Falling back to JSON.stringify(req.body) is deliberately NOT done: it
 * would turn "the platform ate the body" into "Stripe is sending bad
 * signatures", which is a much worse afternoon.
 */
async function rawBody(req) {
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody.toString("utf8") : String(req.rawBody);
  if (typeof req.body === "string") return req.body;
  if (typeof req[Symbol.asyncIterator] !== "function") {
    throw new Error("the raw body is gone: the platform parsed it and exposed no rawBody");
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

/*
 * The client address as the PLATFORM saw it, not as the client claimed it.
 *
 * x-forwarded-for is a chain the client can start: anyone can send
 * "X-Forwarded-For: 1.2.3.4" and the proxy appends to it. So the FIRST entry is
 * attacker-controlled and the LAST one is the hop the edge added. Reading the
 * first is how a per-IP rate limit becomes decorative — which is exactly what
 * this endpoint's first version did.
 */
function clientIp(req) {
  const h = req.headers || {};
  const real = String(h["x-real-ip"] || "").trim();
  if (real) return real;
  const chain = String(h["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (chain.length) return chain[chain.length - 1];
  return (req.socket && req.socket.remoteAddress) || "";
}

/** Where this deployment lives, from the request, so previews and local both work. */
function baseUrlOf(req) {
  if (process.env.PUBLIC_BASE_URL) return String(process.env.PUBLIC_BASE_URL).replace(/\/$/, "");
  const h = req.headers || {};
  const host = h["x-forwarded-host"] || h.host;
  if (!host) return "http://localhost:3003";
  const proto = h["x-forwarded-proto"] || (String(host).startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

module.exports = { send, requireMethod, readJson, rawBody, clientIp, baseUrlOf };
