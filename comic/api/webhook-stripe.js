/*
 * POST /api/webhook-stripe — Stripe tells us a payment happened.
 *
 * Nothing here is believed until the signature checks out. Without that check
 * this endpoint reads "give me a free comic" to anybody who knows the URL.
 *
 * It does NOT draw the comic. Illustrating 78 panels takes about seven minutes
 * and a webhook that has not answered in seconds is a failed webhook to
 * Stripe: it would retry, and every retry would start the work again. The
 * render is queued and acknowledged; the page the buyer is being returned to
 * drives it, and the cron picks up whatever nobody is watching.
 */

const { store } = require("../lib/store.js");
const { readEvent } = require("../lib/stripe.js");
const { send, requireMethod, rawBody } = require("../lib/http.js");
const { PRODUCT } = require("../lib/money.js");
const { RENDER_STEPS } = require("../lib/render-job.js");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;

  let event;
  try {
    event = readEvent(await rawBody(req), req.headers["stripe-signature"]);
  } catch (e) {
    console.warn(`[comic] stripe webhook refused: ${e.message}`);
    return send(res, 400, { error: "bad_signature" });
  }

  // Everything else is acknowledged rather than rejected: a 4xx makes Stripe
  // retry an event we simply do not want.
  if (event.type !== "checkout.session.completed") return send(res, 200, { ignored: event.type });

  const session = (event.data && event.data.object) || {};
  if (session.payment_status && session.payment_status !== "paid") {
    return send(res, 200, { ignored: "unpaid" });
  }

  const token = session.client_reference_id || (session.metadata && session.metadata.token);
  const job = token && (await store.get(token));
  if (!job) return send(res, 200, { ignored: "unknown_job" });

  // Stripe retries. A retried webhook must be a no-op, not a second comic.
  if (job.paid_at) return send(res, 200, { already: "paid" });

  /*
   * The address the buyer typed into Stripe's own form is where the receipt
   * just landed, so it is the one we know works. If it differs from the one
   * they typed into our form, ours had a typo — and a typo used to lose the
   * customer for good. Delivery goes to both.
   */
  const paidEmail = String(
    (session.customer_details && session.customer_details.email) || session.customer_email || ""
  ).trim().toLowerCase();

  const patch = {
    paid_at: new Date().toISOString(),
    payment: {
      provider: "stripe",
      provider_id: session.id,
      payment_intent: session.payment_intent || null,
      amount_cents: session.amount_total != null ? session.amount_total : PRODUCT.priceCents,
      currency: session.currency || PRODUCT.currency,
      // Whether Stripe or we owe the VAT depends on who the merchant of record
      // was for THIS sale, so it is recorded per sale and not read off config.
      managed: Boolean(session.managed_payments && session.managed_payments.enabled),
      vat_rate: PRODUCT.vatRate,
    },
    /*
     * El render es una segunda máquina de estados y aquí se arma, EN SU PRIMER
     * PASO, leído de ella y no escrito a mano.
     *
     * Estaba escrito a mano —"panels"— y eso se saltaba los dos pasos de
     * delante. El de diálogo es una mejora que se perdía; el de las hojas de
     * personaje NO: son la referencia contra la que se dibuja cada viñeta, y
     * sin ellas las noventa salen sin referencia y el protagonista cambia de
     * cara a lo largo del cómic. Habría salido así en la primera venta.
     */
    render_status: "pending",
    render_step: RENDER_STEPS[0],
    render_progress: 0,
    render_attempts: 0,
  };
  if (paidEmail && paidEmail !== String(job.email || "").toLowerCase()) patch.paid_email = paidEmail;

  try {
    await store.update(token, patch);
  } catch (e) {
    // A 500 here is correct: Stripe retries, and we WANT this retried. Losing
    // it means somebody paid and nothing was ever queued.
    console.error(`[comic] could not record payment for ${token}: ${e.message}`);
    return send(res, 500, { error: "store_failed" });
  }

  console.log(`[comic] paid ${token} · ${(patch.payment.amount_cents / 100).toFixed(2)} ${patch.payment.currency}`);
  return send(res, 200, { queued: token });
};

// Stripe's signature is computed over the raw bytes, so the body must not be
// parsed before it reaches the handler.
module.exports.config = { api: { bodyParser: false } };
