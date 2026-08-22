/*
 * The small endpoints, in one function: public configuration, the waiting
 * list, the print button, "send me my link back", and the internal job
 * trigger. See lib/wiring.js.
 */
const { mountRouter } = require("../lib/wiring.js");
const { siteKey } = require("../lib/turnstile.js");
const { send, requireMethod } = require("../lib/http.js");

// The only endpoint that must answer with the environment half empty: the
// front asks for it before it can draw the form.
async function config(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  res.setHeader("Cache-Control", "public, max-age=300");
  return send(res, 200, { turnstileSiteKey: siteKey() });
}

/*
 * Is the machine able to work at all? The two native pieces (sharp's platform
 * binary, the PDF writer) either load on this runtime or the paid book cannot
 * be produced, and the only way to find out used to be a customer paying. It
 * reports capabilities and versions, never a secret and never a value.
 */
async function health(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  const can = (m) => { try { require(m); return true; } catch (e) { return String(e.message).slice(0, 120); } };
  return send(res, 200, { ok: true, node: process.version, region: process.env.VERCEL_REGION || null, sharp: can("sharp"), pdf: can("pdf-lib") });
}

module.exports = mountRouter({
  config,
  health,
  waitlist: "waitlistHandler",
  "print-interest": "printInterestHandler",
  recover: "recoverHandler",
  contact: "contactHandler",
  track: "trackHandler",
  job: "jobHandler",
});
