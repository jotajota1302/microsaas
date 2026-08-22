/*
 * GET /api/config — the handful of PUBLIC values a static front cannot know.
 *
 * The site is plain HTML with no build step, so anything that changes per
 * deployment has to be fetched rather than baked in. Today that is the
 * Turnstile site key (public by design — it identifies the widget, it does not
 * authorise anything) and the price, so a change in lib/money.js reaches the
 * page instead of being retyped into two HTML files and forgotten in a third.
 *
 * Nothing secret is served here, and the rule that keeps it that way is that
 * every value is one somebody could read off the rendered page anyway.
 */

const { siteKey } = require("../lib/turnstile.js");
const { PRODUCT, format } = require("../lib/money.js");
const { send, requireMethod } = require("../lib/http.js");
const { retention } = require("./cron.js");

/*
 * Who is selling. Spanish law (LSSI art. 10) requires this to be on the site,
 * findable without registering: name or company, tax number, address, contact.
 *
 * It lives in environment variables rather than typed into three HTML files
 * because it is real personal data of the operator, this repository is PUBLIC,
 * and a placeholder that ships is worse than one that is obviously absent —
 * "{{NIF}}" rendered to a customer is the version this replaces.
 */
function operator() {
  const v = (k) => String(process.env[k] || "").trim();
  return {
    name: v("LEGAL_NAME"),
    nif: v("LEGAL_NIF"),
    address: v("LEGAL_ADDRESS"),
    email: v("LEGAL_EMAIL") || v("EMAIL_REPLY_TO"),
  };
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;

  res.setHeader("Cache-Control", "public, max-age=300");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    turnstileSiteKey: siteKey(),
    price: {
      cents: PRODUCT.priceCents,
      es: format(PRODUCT.priceCents, "es"),
      en: format(PRODUCT.priceCents, "en"),
    },
    operator: operator(),
    // The same numbers the cron actually deletes by, read from there rather
    // than written twice: a retention promise and a retention job that
    // disagree is exactly the bug this is replacing.
    retention,
  }));
};

module.exports.operator = operator;
