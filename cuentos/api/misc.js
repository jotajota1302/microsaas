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

module.exports = mountRouter({
  config,
  waitlist: "waitlistHandler",
  "print-interest": "printInterestHandler",
  recover: "recoverHandler",
  job: "jobHandler",
});
