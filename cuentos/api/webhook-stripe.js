/*
 * Stripe's signature is computed over the raw bytes, so the body must NOT be
 * parsed before it reaches the handler.
 */
const { mount } = require("../lib/wiring.js");

module.exports = mount("stripeWebhookHandler");
module.exports.config = { api: { bodyParser: false } };
