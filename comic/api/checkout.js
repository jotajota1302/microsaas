/*
 * /api/checkout?token=… — the second door: from a free preview to a paid comic.
 *
 * GET redirects to Stripe, POST answers with the URL. The GET exists because
 * the button on the preview page is an ordinary link: if our JavaScript fails
 * on somebody's phone, the one click that produces revenue still works.
 *
 * Nothing is generated here and no money is believed here. This opens a
 * session and gets out of the way; what actually happened is decided by the
 * webhook, against Stripe's signature.
 */

const { store } = require("../lib/store.js");
const { createCheckout, isConfigured, StripeError } = require("../lib/stripe.js");
const { send, requireMethod, readJson, baseUrlOf } = require("../lib/http.js");

/** GET gets a redirect, POST gets JSON. Same decision, two audiences. */
function answer(req, res, { url, status = 303 }) {
  if (req.method === "GET") {
    res.statusCode = status;
    res.setHeader("Location", url);
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  }
  return send(res, 200, { url });
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "GET", "POST")) return;

  const url = new URL(req.url, "http://localhost");
  let token = (url.searchParams.get("token") || "").replace(/[^\w-]/g, "");
  if (!token && req.method === "POST") {
    const body = await readJson(req).catch(() => ({}));
    token = String(body.token || "").replace(/[^\w-]/g, "");
  }
  if (!token) return send(res, 400, { error: "falta el token" });

  const base = baseUrlOf(req);
  const back = `${base}/c/${token}`;

  const job = await store.get(token);
  if (!job) return send(res, 404, { error: "esta vista previa no existe o ha caducado" });

  // Already paid: send them to their comic instead of charging twice. The
  // browser's back button lands here more often than you would think.
  if (job.paid_at) return answer(req, res, { url: `${back}?pagado=1` });

  /*
   * Paying before the script exists would be selling blind — and the script is
   * the whole differentiator, so there is nothing to buy until it is written.
   */
  if (job.status !== "ready") {
    if (req.method === "GET") return answer(req, res, { url: back });
    return send(res, 409, { error: "la vista previa todavía se está escribiendo", retry: true });
  }

  /*
   * A story the editor failed does not get sold. It can still be looked at for
   * free — that is what `needsHumanReview` is for — but taking 9,99 € for a
   * script we ourselves marked as bad is the exact thing that state exists to
   * prevent.
   */
  if (job.data && job.data.verdict && job.data.verdict.needsHumanReview) {
    return send(res, 409, {
      error: "esta historia no ha pasado nuestro propio control de calidad; no la vendemos",
      review: true,
    });
  }

  if (!isConfigured()) {
    // Loud, and only to us: a landing with a buy button and no payment key is
    // a shop with the till missing, and it must not look like a customer error.
    console.error("[comic] /api/checkout called with no STRIPE_SECRET_KEY");
    return send(res, 503, { error: "el pago no está disponible ahora mismo" });
  }

  try {
    const session = await createCheckout({ job, baseUrl: base });
    await store.update(token, { checkout_id: session.id, checkout_at: new Date().toISOString() });
    return answer(req, res, { url: session.url });
  } catch (e) {
    const detail = e instanceof StripeError ? e.message : String(e.message || e);
    console.error(`[comic] checkout failed for ${token}: ${detail}`);
    return send(res, 502, { error: "no hemos podido abrir el pago, prueba en un momento" });
  }
};
