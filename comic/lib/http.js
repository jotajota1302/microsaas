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
 * Every one of these headers is a plain string the client can set. They are
 * only worth anything when a proxy we control OVERWRITES them, and the code
 * cannot tell whether one is in front of it — so it has to be told.
 *
 * TRUST_PROXY_HOPS is how many proxies sit between the internet and this
 * process. It defaults to 1 on Vercel and to 0 everywhere else, which means
 * the local dev server and any self-hosted run ignore the headers entirely
 * and use the socket.
 *
 * The default of 1 is safe because Vercel's own documentation says it
 * OVERWRITES x-forwarded-for and does not forward external IPs, specifically
 * to prevent spoofing (vercel.com/docs/headers/request-headers). So the chain
 * arrives with exactly one entry and it is the real client. Somewhere without
 * that guarantee must set the variable itself.
 *
 * Two versions of this function have now been wrong, in opposite directions,
 * and both made the per-visitor cap decorative:
 *
 *   1. read x-forwarded-for[0] — the first entry is the one the CLIENT sent
 *   2. read x-real-ip unconditionally — no chain, no proxy, no check: send
 *      a different value per request and the cap is gone
 *
 * The second was written while fixing the first, with a comment claiming the
 * problem was handled. Hence the shape below: nothing is trusted unless we
 * have been told a proxy put it there.
 */
const TRUST_PROXY_HOPS = Number(
  process.env.TRUST_PROXY_HOPS != null ? process.env.TRUST_PROXY_HOPS : (process.env.VERCEL ? 1 : 0)
);

function clientIp(req) {
  const h = req.headers || {};
  const socket = (req.socket && req.socket.remoteAddress) || "";

  if (!(TRUST_PROXY_HOPS > 0)) return socket;

  /*
   * The chain reads client, proxy1, proxy2… Counting `hops` back from the end
   * lands on the address the OUTERMOST trusted proxy actually saw. Taking the
   * last entry blindly is only right when there is exactly one hop; with two
   * it returns the inner proxy's address, and then every visitor shares one
   * "IP" and the cap silently becomes a global one.
   */
  const chain = String(h["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (chain.length >= TRUST_PROXY_HOPS) return chain[chain.length - TRUST_PROXY_HOPS];

  // Fewer entries than hops means the chain is not what we were told it is.
  // x-real-ip is the platform's own single value; on Vercel it is overwritten
  // per request, which is the only reason it is worth reading at all.
  const real = String(h["x-real-ip"] || "").trim();
  if (real) return real;

  return socket;
}

/*
 * Where this deployment lives.
 *
 * This builds the URL Stripe sends the buyer back to and the links that go
 * inside the delivery email, so it must not be assembled from something the
 * caller controls. `Host` and `x-forwarded-host` are client-settable: a request
 * carrying "Host: evil.example" would produce a payment redirect and an email
 * pointing there.
 *
 * The damage is bounded — an attacker can only poison the order they placed
 * themselves, since the email goes to the address they gave — so this is
 * tidiness rather than an open door. But the sources are ordered by how much
 * they are worth trusting, and the header is last and only when no proxy has
 * been declared, which is the local dev case.
 */
function baseUrlOf(req) {
  const env = process.env;
  if (env.PUBLIC_BASE_URL) return String(env.PUBLIC_BASE_URL).replace(/\/$/, "");
  // Set by Vercel itself, not by the caller.
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;

  const h = (req && req.headers) || {};
  if (TRUST_PROXY_HOPS > 0) {
    // Behind a proxy with no PUBLIC_BASE_URL configured: nothing here is
    // trustworthy, and guessing from a header is how a redirect ends up
    // somewhere else. Loud, because it means a required variable is missing.
    console.warn("[comic] falta PUBLIC_BASE_URL: los enlaces del correo y la vuelta de Stripe pueden salir mal");
  }
  const host = h["x-forwarded-host"] || h.host;
  if (!host) return "http://localhost:3003";
  const proto = h["x-forwarded-proto"] || (/^localhost|^127\./.test(String(host)) ? "http" : "https");
  return `${proto}://${host}`;
}

module.exports = { send, requireMethod, readJson, rawBody, clientIp, baseUrlOf };
