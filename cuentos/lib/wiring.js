/*
 * Builds the real dependency set for the API handlers. If the environment is
 * incomplete (no Supabase yet, no key), deps() returns null and the handler
 * answers 503 "not_configured" instead of crashing with a 500.
 */

const H = require("./handlers.js");
const { getDb } = require("./db.js");
const moderation = require("./moderation.js");
const { runJob } = require("./steps.js");
const { generateStory } = require("./prompt-story.js");
const { buildSheet, renderPages } = require("./character.js");
const { toLineArt } = require("./lineart.js");
const { renderPdf } = require("./pdf.js");
const { sendEmail } = require("./email.js");
const turnstile = require("./turnstile.js");
const stripe = require("./stripe.js");
const { send, query } = require("./http.js");

let cached;
function deps() {
  if (cached !== undefined) return cached;
  try {
    const db = getDb();
    const jobDeps = { db, generateStory, reviewStory: moderation.reviewStory, buildSheet, renderPages, toLineArt, renderPdf, sendEmail };
    cached = { db, moderation, sendEmail, stripe, turnstile: (token, ip) => turnstile.verify(token, ip), runJob: (id) => runJob(id, jobDeps) };
  } catch (e) {
    console.error(`[cuentos] not configured: ${e.message}`);
    cached = null;
  }
  return cached;
}

/** Wraps a handler factory from lib/handlers.js into a Vercel function. */
function mount(factoryName) {
  let handler;
  return async (req, res) => {
    const d = deps();
    if (!d) return send(res, 503, { error: "not_configured" });
    if (!handler) handler = H[factoryName](d);
    try {
      return await handler(req, res);
    } catch (e) {
      console.error(`[cuentos] ${factoryName} failed: ${e.stack || e.message}`);
      return send(res, 500, { error: "internal" });
    }
  };
}

/*
 * Several endpoints behind one function file.
 *
 * Vercel counts one Serverless Function per file under api/, and the Hobby
 * plan allows twelve. Thirteen one-line files failed to deploy at all, which
 * is a silly reason for a shop to be shut. The public URLs do not change: the
 * rewrites in vercel.json point /api/<name> at the function that carries it
 * and add ?fn=<name>, and the dev server reads those same rewrites.
 *
 * Values are either a factory name from lib/handlers.js (built with the real
 * dependencies, 503 when the environment is incomplete) or a plain handler,
 * for the few endpoints that must answer even when nothing is configured.
 */
function mountRouter(routes) {
  const built = {};
  const handler = async (req, res) => {
    const fn = String(query(req).fn || "");
    const route = routes[fn];
    if (!route) return send(res, 404, { error: "unknown_endpoint" });
    try {
      if (typeof route === "function") return await route(req, res);
      const d = deps();
      if (!d) return send(res, 503, { error: "not_configured" });
      if (!built[fn]) built[fn] = H[route](d);
      return await built[fn](req, res);
    } catch (e) {
      console.error(`[cuentos] ${fn} failed: ${e.stack || e.message}`);
      return send(res, 500, { error: "internal" });
    }
  };
  // What this file answers to, so a rewrite in vercel.json that points at an
  // endpoint nobody carries can be caught by a test instead of by a customer.
  handler.routes = Object.keys(routes);
  return handler;
}

module.exports = { deps, mount, mountRouter };
