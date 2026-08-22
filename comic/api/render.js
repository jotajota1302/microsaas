/*
 * GET/POST /api/render?token=… — pushes the PAID render forward by one step.
 *
 * Same shape as /api/job and for the same reason: seven minutes of drawing does
 * not fit in a function, so whoever looks pushes. The buyer coming back from
 * Stripe is looking at their own comic being drawn, which makes them the best
 * worker we have; the cron sweeps whatever nobody is watching.
 *
 * Requires a paid order. This is not an authorisation check on the token — the
 * token is the authorisation — it is a check that there is anything to do:
 * without a payment there is no render to advance, and letting this start one
 * would be handing out 0,22 EUR of drawing to anyone with a preview link.
 */

const { store } = require("../lib/store.js");
const { advanceRender } = require("../lib/render-job.js");
const { send, requireMethod } = require("../lib/http.js");

/** What the buyer is allowed to see. Never the email, never the IP hash. */
function view(job) {
  const r = job.render || {};
  return {
    token: job.token,
    paid: Boolean(job.paid_at),
    status: job.render_status || "pending",
    step: job.render_step || "sheets",
    progress: job.render_progress || 0,
    drawn: r.drawn || 0,
    total: r.total || 0,
    // A comic finished with a couple of missing panels is still delivered; the
    // buyer is told, rather than finding out on page nine.
    holes: (r.holes || []).length,
    pdf: job.render_status === "done" ? `/api/file?token=${encodeURIComponent(job.token)}&k=pdf` : null,
    error: job.render_status === "needs_attention"
      ? "Hemos parado esto para mirarlo a mano. Te escribimos hoy mismo."
      : null,
  };
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "GET", "POST")) return;

  const url = new URL(req.url, "http://localhost");
  const token = (url.searchParams.get("token") || "").replace(/[^\w-]/g, "");
  if (!token) return send(res, 400, { error: "falta el token" });

  let job = await store.get(token);
  if (!job) return send(res, 404, { error: "no existe" });
  if (!job.paid_at) return send(res, 402, { error: "sin pagar", paid: false });

  // Finished, or stopped on purpose: answer without spending anything.
  if (job.render_status === "done" || job.render_status === "needs_attention") {
    return send(res, 200, view(job));
  }

  try {
    const r = await advanceRender(token);
    job = r.job;
  } catch (e) {
    console.error(`[comic] render step failed for ${token}: ${e.message}`);
    return send(res, 200, { ...view(job), note: String(e.message).slice(0, 160) });
  }

  return send(res, 200, view(job));
};

module.exports.view = view;
