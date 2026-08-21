/* Tiny helpers for Vercel Node functions. No framework. */

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function query(req) {
  if (req.query && typeof req.query === "object") return req.query;
  const url = new URL(req.url || "/", "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

/**
 * The client address as the platform saw it. Vercel sets x-real-ip and the
 * x-forwarded-for chain itself; the LAST hop of the chain is the one the edge
 * appended, the first can be anything the client sent. Never trust the first.
 */
function clientIp(req) {
  const h = req.headers || {};
  const real = String(h["x-real-ip"] || "").trim();
  if (real) return real;
  const chain = String(h["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (chain.length) return chain[chain.length - 1];
  return (req.socket && req.socket.remoteAddress) || "";
}

/** Fail closed: an endpoint guarded by a secret refuses everything until the secret exists. */
function requireSecret(req, res, secret) {
  if (!secret) { send(res, 503, { error: "not_configured" }); return false; }
  if (bearer(req) !== secret) { send(res, 401, { error: "unauthorized" }); return false; }
  return true;
}

function requireMethod(req, res, method) {
  if (req.method === method) return true;
  send(res, 405, { error: "method_not_allowed" });
  return false;
}

function bearer(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  return String(h).replace(/^Bearer\s+/i, "").trim();
}

module.exports = { send, readJson, query, clientIp, requireMethod, requireSecret, bearer };
