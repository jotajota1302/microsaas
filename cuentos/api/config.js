/*
 * The public half of the front's configuration. Only values that are meant to
 * be seen by a browser: a Turnstile site key is public by design, its secret
 * never leaves the server.
 */

const { siteKey } = require("../lib/turnstile.js");
const { send, requireMethod } = require("../lib/http.js");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, "GET")) return;
  res.setHeader("Cache-Control", "public, max-age=300");
  return send(res, 200, { turnstileSiteKey: siteKey() });
};
