/*
 * Stripe Checkout, kept to the two calls the product actually needs: open a
 * session, and read back a webhook we can trust.
 *
 * The rules that matter here are about not trusting the browser:
 *
 *  - The PRICE comes from lib/money.js on the server, never from the request.
 *    A checkout that took an amount from the client would sell books for a
 *    cent to anyone who edited a form field.
 *  - The webhook SIGNATURE is verified before a single byte is believed.
 *    Without it, "I paid" is just an HTTP request anybody can send, and the
 *    book goes out for free.
 *  - The story is identified by client_reference_id, which we set. Anything
 *    the customer could edit would let them pay for one book and claim another.
 *
 * Plain fetch, no SDK: two endpoints do not justify a dependency, and the
 * signature check is twenty lines of crypto.
 */

const crypto = require("crypto");
const { env } = require("./env.js");
const money = require("./money.js");

const API = "https://api.stripe.com/v1";

class StripeError extends Error {
  constructor(message, { status } = {}) { super(message); this.name = "StripeError"; this.status = status; }
}

function isConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY);
}

async function call(path, params, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const res = await fetchFn(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new StripeError((data.error && data.error.message) || `HTTP ${res.status}`, { status: res.status });
  }
  return data;
}

/**
 * Opens a Checkout session for one story.
 *
 * @param story  { token }
 * @param order  { id, email, locale, product } — the product decides the price
 * @returns { id, url }
 */
async function createCheckout({ story, order, baseUrl }, deps = {}) {
  const product = money.product(order.product);
  const base = (baseUrl || env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const back = `${base}/c/${story.token}`;

  return call("/checkout/sessions", {
    mode: "payment",
    // Ours, not the customer's: it is how the webhook finds the story again.
    client_reference_id: story.token,
    customer_email: order.email,
    success_url: `${back}?pagado=1`,
    cancel_url: back,
    locale: order.locale === "en" ? "en" : "es",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    // The price is read from the server's own table. Never from the request.
    "line_items[0][price_data][unit_amount]": String(product.priceCents),
    "line_items[0][price_data][product_data][name]": product[order.locale === "en" ? "en" : "es"],
    "line_items[0][price_data][product_data][description]":
      order.locale === "en" ? "18-page personalised PDF, delivered by email" : "PDF personalizado de 18 páginas, entregado por email",
    "metadata[token]": story.token,
    "metadata[order_id]": order.id,
  }, deps);
}

/**
 * Verifies a webhook the way Stripe documents it and returns the event.
 *
 * Throws unless the signature matches the raw body with our endpoint secret.
 * This is the whole security of the payment path: without it, anyone who
 * knows the URL can claim a payment and walk off with a book.
 */
function readEvent(rawBody, signatureHeader, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeError("no STRIPE_WEBHOOK_SECRET configured");
  if (!signatureHeader) throw new StripeError("missing signature");

  const parts = Object.fromEntries(
    String(signatureHeader).split(",").map((p) => p.split("=", 2)).filter((p) => p.length === 2)
  );
  const timestamp = Number(parts.t);
  if (!timestamp) throw new StripeError("malformed signature");

  // A replayed old event must not deliver a second book.
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) throw new StripeError("signature timestamp out of tolerance");

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const given = String(parts.v1 || "");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new StripeError("signature mismatch");

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new StripeError("event body is not JSON");
  }
}

module.exports = { createCheckout, readEvent, isConfigured, StripeError, API };
