/*
 * Stripe Checkout, kept to the two calls this product needs: open a session,
 * and read back a webhook we can trust.
 *
 * Plain fetch, no SDK — the same call this codebase's sibling makes, for the
 * same reason: two endpoints do not justify a dependency, and the signature
 * check below is twenty lines of crypto.
 *
 * Three rules, all of them about not trusting the browser:
 *
 *  - The PRICE is read from lib/money.js on this side. A checkout that took an
 *    amount from the request would sell comics for a cent to anyone who opened
 *    the network tab.
 *  - The SIGNATURE is verified before a single byte of a webhook is believed.
 *    Without it "I paid" is an HTTP request anyone can send, and the comic
 *    goes out for free to whoever knows the URL.
 *  - The job is identified by client_reference_id, which WE set. Anything the
 *    buyer could edit would let them pay for one comic and claim another.
 *
 * Managed Payments (Stripe as merchant of record) is behind an env flag rather
 * than hardcoded. `../CLAUDE.md` records it as the decision for digital sales,
 * but Stripe's own rollout is still mostly US-first, so an account in Spain
 * may not be eligible yet. With the flag off this is an ordinary Stripe sale
 * and the VAT is ours to declare; with it on, Stripe handles the tax. Which of
 * the two is live changes one variable, not this file.
 */

const crypto = require("crypto");
const { PRODUCT } = require("./money.js");

const API = "https://api.stripe.com/v1";

/*
 * La versión de la API: por defecto NINGUNA, es decir la de la cuenta.
 *
 * Aquí había un pin a "2026-04-22", sacado de una búsqueda web sobre Managed
 * Payments y jamás comprobado contra la cuenta. Stripe lo rechazaba con
 * "Invalid Stripe API version" y el botón de comprar devolvía 502 — el único
 * clic que produce ingresos, roto por una cadena que me inventé.
 *
 * La versión real de la cuenta resultó ser "2026-04-22.dahlia", con sufijo de
 * canal. Podría escribirla aquí, pero pinear a la versión que la cuenta ya usa
 * no protege de nada y vuelve a poner una cadena que nadie puede verificar sin
 * la cuenta delante. Un pin equivocado es peor que ningún pin.
 *
 * Cuando haya un motivo real para fijarla —Managed Payments exige una mínima—
 * se pone en STRIPE_API_VERSION, que es donde se puede comprobar antes de
 * desplegar.
 */
const API_VERSION = process.env.STRIPE_API_VERSION || null;

class StripeError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = "StripeError";
    this.status = status;
  }
}

function isConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function managedPayments() {
  return process.env.STRIPE_MANAGED_PAYMENTS === "1";
}

async function call(path, params, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const res = await fetchFn(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(API_VERSION ? { "Stripe-Version": API_VERSION } : {}),
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new StripeError((data.error && data.error.message) || `HTTP ${res.status}`, { status: res.status });
  }
  return data;
}

/**
 * Opens a Checkout session for one preview that the buyer wants finished.
 *
 * @param job      the stored job — only its token, lang and email are used
 * @param baseUrl  where to send the buyer back to
 * @returns {Promise<{id: string, url: string}>}
 */
async function createCheckout({ job, baseUrl }, deps = {}) {
  const lang = job.lang === "en" ? "en" : "es";
  const base = String(baseUrl || process.env.PUBLIC_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
  const back = `${base}/c/${job.token}`;

  const params = {
    mode: "payment",
    // Ours, not the buyer's: it is how the webhook finds this job again.
    client_reference_id: job.token,
    success_url: `${back}?pagado=1`,
    cancel_url: back,
    locale: lang,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": PRODUCT.currency,
    // Read from our own table. Never from the request.
    "line_items[0][price_data][unit_amount]": String(PRODUCT.priceCents),
    "line_items[0][price_data][product_data][name]": PRODUCT.name[lang],
    "line_items[0][price_data][product_data][description]": PRODUCT.description[lang],
    "line_items[0][price_data][product_data][tax_code]": PRODUCT.taxCode,
    "metadata[token]": job.token,
    "metadata[product]": PRODUCT.id,
    /*
     * Spanish law lets a digital download escape the 14-day withdrawal right
     * only when the buyer expressly consented to immediate delivery and
     * acknowledged losing it. Stripe's own consent box is where that is
     * recorded, and it is recorded on Stripe's side, which is the side that
     * would be asked to prove it in a chargeback.
     */
    "consent_collection[terms_of_service]": "required",
  };

  // A typo in our form loses the customer for good, because the comic and every
  // reminder go to nobody. Prefilling Stripe's field, which they can correct,
  // is how the right address gets a second chance to arrive.
  if (job.email) params.customer_email = job.email;

  if (managedPayments()) {
    // Stripe becomes the merchant of record: it takes on the indirect tax in
    // 80-odd countries, the fraud, and the disputes.
    params["managed_payments[enabled]"] = "true";
  } else if (process.env.STRIPE_AUTOMATIC_TAX === "1") {
    // Not the MoR, so the VAT is ours. Stripe Tax at least computes it.
    params["automatic_tax[enabled]"] = "true";
  }

  try {
    const session = await call("/checkout/sessions", params, deps);
    return { id: session.id, url: session.url, consent: true };
  } catch (e) {
    /*
     * Stripe solo deja pedir el consentimiento si hay una URL de condiciones
     * configurada EN SU PANEL — no se puede poner por API en la cuenta propia,
     * lo intenté. Sin ella devuelve este error y el botón de comprar daba 502.
     *
     * Que el único clic que produce ingresos se caiga por un ajuste de un panel
     * ajeno es inaceptable, así que se vende igual. Pero se pierde algo real y
     * por eso el aviso es de error y no de nota: sin ese consentimiento el
     * comprador CONSERVA los 14 días de desistimiento sobre un fichero que ya
     * ha descargado. Se arregla en 30 segundos en
     * dashboard.stripe.com/settings/public poniendo /legal/condiciones.
     */
    if (!/terms of service/i.test(String(e.message))) throw e;
    console.error(
      "[comic] VENDIENDO SIN CONSENTIMIENTO DE ENTREGA INMEDIATA: falta la URL de " +
      "condiciones en el panel de Stripe, así que el comprador conserva el desistimiento"
    );
    delete params["consent_collection[terms_of_service]"];
    const session = await call("/checkout/sessions", params, deps);
    return { id: session.id, url: session.url, consent: false };
  }
}

/**
 * Verifies a webhook the way Stripe documents it and returns the parsed event.
 *
 * Throws unless the signature matches the RAW body with our endpoint secret.
 * This function is the entire security of the payment path.
 */
function readEvent(rawBody, signatureHeader, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeError("no STRIPE_WEBHOOK_SECRET configured");
  if (!signatureHeader) throw new StripeError("missing signature");

  const parts = Object.fromEntries(
    String(signatureHeader).split(",").map((p) => p.split("=", 2)).filter((p) => p.length === 2)
  );
  const timestamp = Number(parts.t);
  if (!timestamp) throw new StripeError("malformed signature");

  // A replayed old event must not deliver a second comic.
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) {
    throw new StripeError("signature timestamp out of tolerance");
  }

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

module.exports = { createCheckout, readEvent, isConfigured, managedPayments, StripeError, API, API_VERSION };
