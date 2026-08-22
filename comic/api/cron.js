/*
 * GET /api/cron — pushes along whatever nobody is watching.
 *
 * Both state machines rely on "whoever looks, pushes", which works right up
 * until the buyer closes the tab. This is the other half of that: a scheduled
 * sweep so a comic somebody paid for finishes even if they never come back.
 *
 * Paid renders go first, always. A free preview can wait five more minutes; a
 * customer who has been charged cannot.
 *
 * One step per job per sweep, not a loop until done. The budget of a single
 * invocation is spent across several orders rather than all of it on the first
 * one — otherwise a stuck order starves everybody behind it.
 */

const { store } = require("../lib/store.js");
const { blobs } = require("../lib/blobs.js");
const { advance } = require("../lib/preview-job.js");
const { advanceRender } = require("../lib/render-job.js");
const { send, requireMethod } = require("../lib/http.js");

const RENDERS_PER_SWEEP = Number(process.env.CRON_RENDERS || 2);
const PREVIEWS_PER_SWEEP = Number(process.env.CRON_PREVIEWS || 3);

/*
 * Retention. legal/privacidad.html promises these numbers to the customer, so
 * they are the same numbers in both places — and until today nothing at all
 * deleted anything, which made that page a promise we were quietly breaking
 * with a minor's first name in the record.
 *
 * Two clocks because the two cases are not the same promise: an unpaid preview
 * is data somebody gave us that we no longer need, while a paid comic is a
 * service they bought and expect to be able to open again.
 */
const KEEP_UNPAID_DAYS = Number(process.env.KEEP_UNPAID_DAYS || 7);
const KEEP_PAID_DAYS = Number(process.env.KEEP_PAID_DAYS || 365);
const PURGE_PER_SWEEP = Number(process.env.CRON_PURGE || 20);

/*
 * Vercel signs its own cron calls with a bearer token. Without this check the
 * endpoint is "spend my image budget" for anyone who finds the URL — and it is
 * in the sitemap of every deployment by virtue of existing.
 */
function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // local sweeps, never live
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return given === secret;
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "GET", "POST")) return;
  if (!authorised(req)) return send(res, 401, { error: "no" });

  const out = { renders: [], previews: [] };

  for (const job of await store.pendingRenders(RENDERS_PER_SWEEP)) {
    try {
      const r = await advanceRender(job.token);
      out.renders.push({ token: job.token, step: r.job.render_step, status: r.job.render_status });
    } catch (e) {
      out.renders.push({ token: job.token, error: String(e.message).slice(0, 120) });
    }
  }

  for (const job of await store.pending(PREVIEWS_PER_SWEEP)) {
    try {
      const r = await advance(job.token);
      out.previews.push({ token: job.token, step: r.job.step, status: r.job.status });
    } catch (e) {
      out.previews.push({ token: job.token, error: String(e.message).slice(0, 120) });
    }
  }

  /*
   * The retention sweep, last: pushing along work somebody is waiting for
   * matters more than deleting work nobody is.
   *
   * The blobs go BEFORE the row. If it were the other way round and the
   * function died in between, the row would be gone and the panels would be
   * orphaned in the bucket for ever, with nothing left pointing at them to
   * find them by. This order can only leave a row whose blobs are already
   * gone, which the next sweep tidies.
   */
  out.purged = [];
  try {
    const old = await store.expired({ unpaidDays: KEEP_UNPAID_DAYS, paidDays: KEEP_PAID_DAYS });
    for (const job of old.slice(0, PURGE_PER_SWEEP)) {
      try {
        const files = await blobs.removeAll(job.token);
        await store.remove(job.token);
        out.purged.push({ token: job.token, paid: Boolean(job.paid_at), files });
      } catch (e) {
        out.purged.push({ token: job.token, error: String(e.message).slice(0, 120) });
      }
    }
    if (old.length > PURGE_PER_SWEEP) out.purgePending = old.length - PURGE_PER_SWEEP;
  } catch (e) {
    out.purgeError = String(e.message).slice(0, 160);
  }

  return send(res, 200, out);
};

module.exports.retention = { KEEP_UNPAID_DAYS, KEEP_PAID_DAYS };
