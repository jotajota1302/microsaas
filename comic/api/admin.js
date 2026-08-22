/*
 * GET /api/admin — the operator's read of the whole thing.
 * POST /api/admin { action, token } — the two nudges that are not approvals.
 *
 * This panel does NOT gate delivery. A comic that passes the validators is
 * sent the moment it is finished; nobody signs anything off. The only queue
 * with a person in it is `needs_attention`, which is not "waiting for
 * approval" but "we already know this one is broken".
 *
 * So the two actions here are `retry` (push a stuck job back into the machine)
 * and `release` (send a comic we stopped, once a human has looked at the PDF
 * and decided the holes are acceptable). Neither creates a routine step.
 *
 * The key never travels in the URL: a query string ends up in access logs, in
 * the Referer header of anything the page loads, and in browser history.
 */

const crypto = require("crypto");
const { store } = require("../lib/store.js");
const { report } = require("../lib/dashboard.js");
const { advanceRender } = require("../lib/render-job.js");
const { send, requireMethod, readJson } = require("../lib/http.js");

function authorised(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false; // no token configured means no panel, never an open one
  const given = String(req.headers["x-admin-token"] || "")
    || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Only the names, never the values. This answer goes to a browser. */
function envNames() {
  const keys = [
    "STORE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MINIMAX_API_KEY", "MINIMAX_MODEL",
    "OPENROUTER_API_KEY", "CRITIC_MODEL", "IMAGE_PROVIDER", "RESEND_API_KEY", "EMAIL_FROM",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_MANAGED_PAYMENTS", "PUBLIC_BASE_URL",
    "CRON_SECRET", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "ADMIN_TOKEN",
    "MAX_PREVIEWS_PER_DAY", "MAX_PREVIEWS_PER_IP",
    // Public by law: these are printed on the legal pages for anyone to read.
    "LEGAL_NAME", "LEGAL_NIF", "LEGAL_ADDRESS", "LEGAL_EMAIL", "EMAIL_REPLY_TO",
  ];
  const out = {};
  for (const k of keys) {
    // Health only ever asks "is this present". Secrets are reduced to a marker
    // here so a bug downstream cannot leak one.
    const v = process.env[k];
    out[k] = v ? (/KEY|TOKEN|SECRET/.test(k) ? "set" : v) : "";
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "GET", "POST")) return;

  if (!authorised(req)) {
    // 401 with nothing else: an unauthenticated caller learns only that the
    // endpoint exists, which they already knew.
    res.setHeader("WWW-Authenticate", 'Bearer realm="admin"');
    return send(res, 401, { error: "no" });
  }

  if (req.method === "POST") {
    const body = await readJson(req).catch(() => ({}));
    const token = String(body.token || "").replace(/[^\w-]/g, "");
    const job = token && (await store.get(token));
    if (!job) return send(res, 404, { error: "no existe" });

    if (body.action === "retry") {
      // Back into the machine from wherever it stopped. Panels already drawn
      // are found in the blob store and not paid for twice.
      await store.update(token, {
        render_status: "pending",
        render_error: null,
        render_attempts: 0,
        render_step: job.render_step === "done" ? "panels" : (job.render_step || "sheets"),
      });
      const r = await advanceRender(token);
      return send(res, 200, { ok: true, step: r.job.render_step, status: r.job.render_status });
    }

    if (body.action === "release") {
      // A human has opened the PDF and decided the holes are acceptable. This
      // jumps straight to delivery; it does not re-run the gate.
      if (!job.paid_at) return send(res, 409, { error: "sin pagar" });
      await store.update(token, { render_status: "running", render_step: "deliver", render_error: null, render_attempts: 0 });
      const r = await advanceRender(token);
      return send(res, 200, { ok: true, status: r.job.render_status, delivered: r.job.delivered_at || null });
    }

    return send(res, 400, { error: "acción desconocida" });
  }

  const rows = (await store.all(400)) || [];
  return send(res, 200, report(rows, envNames()));
};
