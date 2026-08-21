/*
 * The HTTP handlers, built from injected dependencies so every branch is
 * testable without a network. api/*.js files are one-liners that wire the
 * real dependencies in.
 *
 * Flow: order (script) → story (viewer) → revise ×2 → approve (sample) →
 * [payment: Etsy today, Stripe later] → admin marks paid (full) → admin
 * approves → delivered. cron sweeps jobs, sends reminders, purges.
 */

const C = require("./collection.js");
const money = require("./money.js");
const { validateOrderInput } = require("./order-input.js");
const { substitute } = require("./pdf.js");
const { send, readJson, query, clientIp, requireMethod, requireSecret } = require("./http.js");

const CAPS = () => ({
  scriptsPerDay: Number(process.env.MAX_SCRIPTS_PER_DAY || 200),
  samplesPerDay: Number(process.env.MAX_SAMPLES_PER_DAY || 40),
  scriptsPerIp: Number(process.env.MAX_SCRIPTS_PER_IP || 3),
  revisions: 2,
});

const BUCKET = "stories";
const SIGNED_SECONDS = 60 * 60; // viewer images
const PDF_SECONDS = 60 * 60 * 24; // download link in the viewer

// --- POST /api/order ---------------------------------------------------------------

function orderHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    if (!body) return send(res, 400, { error: "bad_json" });

    const input = validateOrderInput(body);
    if (!input.ok) return send(res, 400, { error: "invalid", details: input.errors });

    if (deps.turnstile && !(await deps.turnstile(body.turnstile, clientIp(req)))) {
      return send(res, 400, { error: "turnstile" });
    }

    const verdict = await deps.moderation.checkInput({
      name: input.personalization.name,
      people: input.personalization.people,
      dedication: input.personalization.dedication,
    });
    if (!verdict.ok) {
      await deps.db.recordBlockedInput(verdict.reason, JSON.stringify(input.personalization)).catch(() => {});
      return send(res, 422, { error: "blocked", reason: verdict.reason });
    }

    const caps = CAPS();
    const ipHash = deps.db.hashIp(clientIp(req));
    const [today, byEmail, byIp] = await Promise.all([
      deps.db.countStagesToday("script"),
      deps.db.countOrdersToday({ email: input.email }),
      deps.db.countOrdersToday({ ipHash }),
    ]);
    if (today >= caps.scriptsPerDay) return send(res, 503, { error: "sold_out" });
    if (byEmail >= 1) return send(res, 429, { error: "email_limit" });
    if (byIp >= caps.scriptsPerIp) return send(res, 429, { error: "ip_limit" });

    const product = money.storyProductFor(input.locale);
    const order = await deps.db.createOrder({
      email: input.email,
      locale: input.locale,
      product: product.id,
      price_cents: product.priceCents,
      vat_rate: product.vatRate,
      personalization: input.personalization,
      status: "script",
      needs_review: Boolean(verdict.needsReview),
      ip_hash: ipHash,
    });
    const job = await deps.db.createJob({ orderId: order.id, kind: "script" });

    // Run inline: the user is waiting for the script (~10-30 s). If this
    // times out, the cron finishes the job and the email still arrives.
    const result = await deps.runJob(job.id);
    const story = await deps.db.getStoryByOrder(order.id);
    const status = result.state === "done" ? 201 : 202;
    return send(res, status, { orderId: order.id, token: story ? story.token : null, state: result.state });
  };
}

// --- GET /api/story?token= -----------------------------------------------------

function storyView(story, order, urls) {
  const person = order.personalization || {};
  const names = { name: person.name, people: person.people || [] };
  const sub = (t) => substitute(t, names);
  const caps = CAPS();
  return {
    token: story.token,
    stage: story.stage,
    locale: order.locale,
    expiresAt: story.expires_at,
    title: sub(story.story.title),
    dedication: person.dedication || sub(story.story.dedication_hint),
    childName: person.name,
    pages: story.story.pages.map((p, i) => ({
      n: i + 1,
      text: sub(p.text),
      image: urls.pages[String(i)] || null,
      illustratedLater: !urls.pages[String(i)],
    })),
    sheet: urls.sheet || null,
    coloring: urls.coloring || [],
    pdf: urls.pdf || null,
    moral: sub(story.story.moral),
    revisionsLeft: Math.max(0, caps.revisions - (story.revisions || 0)),
    retouched: Boolean(story.retouched),
    price: money.formatEur(order.price_cents, order.locale),
    priceCents: order.price_cents,
    status: order.status,
    etsyUrl: process.env.ETSY_LISTING_URL || null,
  };
}

function storyHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "GET")) return;
    const { token } = query(req);
    if (!token || !/^[A-Za-z0-9_-]{22}$/.test(token)) return send(res, 400, { error: "bad_token" });

    const story = await deps.db.getStoryByToken(token);
    if (!story) return send(res, 404, { error: "not_found" });
    if (new Date(story.expires_at) < new Date()) return send(res, 410, { error: "expired" });
    const order = await deps.db.getOrder(story.order_id);

    const urls = { pages: {}, coloring: [] };
    if (story.sheet_path) urls.sheet = await deps.db.signedUrl(BUCKET, story.sheet_path, SIGNED_SECONDS);
    for (const [i, p] of Object.entries(story.page_paths || {})) {
      // before payment only the sample pages are visible; after it, all
      if (story.stage === "full" || Object.keys(story.page_paths).length <= 2) {
        urls.pages[i] = await deps.db.signedUrl(BUCKET, p, SIGNED_SECONDS);
      }
    }
    if (story.stage === "full") {
      for (const p of story.coloring_paths || []) urls.coloring.push(await deps.db.signedUrl(BUCKET, p, SIGNED_SECONDS));
      if (story.pdf_path) urls.pdf = await deps.db.signedUrl(BUCKET, story.pdf_path, PDF_SECONDS);
    }
    return send(res, 200, storyView(story, order, urls));
  };
}

// --- POST /api/revise { token, instruction } -------------------------------------

function reviseHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    if (!body || !body.token) return send(res, 400, { error: "bad_request" });
    const instruction = String(body.instruction || "").trim();
    if (instruction.length < 3 || instruction.length > 200) return send(res, 400, { error: "instruction_length" });

    const story = await deps.db.getStoryByToken(body.token);
    if (!story) return send(res, 404, { error: "not_found" });
    if (new Date(story.expires_at) < new Date()) return send(res, 410, { error: "expired" });
    if (story.stage !== "script") return send(res, 409, { error: "wrong_stage" });
    if ((story.revisions || 0) >= CAPS().revisions) return send(res, 409, { error: "no_revisions_left" });

    const verdict = await deps.moderation.checkInput({ name: "x", dedication: instruction });
    if (!verdict.ok) return send(res, 422, { error: "blocked", reason: verdict.reason });

    const order = await deps.db.getOrder(story.order_id);
    const instructions = [...(story.instructions || []), instruction];
    await deps.db.updateOrder(order.id, { personalization: { ...order.personalization, instructions } });
    const updated = await deps.db.updateStory(story.id, { instructions, revisions: (story.revisions || 0) + 1 });
    const job = await deps.db.createJob({ orderId: order.id, storyId: story.id, kind: "script", input: { revision: true } });
    const result = await deps.runJob(job.id);
    return send(res, result.state === "done" ? 200 : 202, { token: story.token, state: result.state, revisionsLeft: Math.max(0, CAPS().revisions - (updated.revisions || 0)) });
  };
}

// --- POST /api/approve { token } — the script is liked: illustrate the sample ----

function approveHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    if (!body || !body.token) return send(res, 400, { error: "bad_request" });

    const story = await deps.db.getStoryByToken(body.token);
    if (!story) return send(res, 404, { error: "not_found" });
    if (new Date(story.expires_at) < new Date()) return send(res, 410, { error: "expired" });
    if (story.stage !== "script") return send(res, 409, { error: "wrong_stage" });

    const today = await deps.db.countStagesToday("sample");
    if (today >= CAPS().samplesPerDay) return send(res, 503, { error: "sold_out" });

    const job = await deps.db.createJob({ orderId: story.order_id, storyId: story.id, kind: "sample" });
    const result = await deps.runJob(job.id);
    return send(res, result.state === "done" ? 200 : 202, { token: story.token, state: result.state });
  };
}

// --- POST /api/waitlist { email, locale, reason } ----------------------------------

function waitlistHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    const email = String((body && body.email) || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: "invalid_email" });
    // 'cap' the daily limit, 'print' the printed-book button, 'gallery' the free
    // colouring pages. Anything else is treated as the daily limit.
    const reason = ["print", "gallery"].includes(body.reason) ? body.reason : "cap";
    await deps.db.addWaitlist(email, body.locale === "en" ? "en" : "es", reason);
    return send(res, 201, { ok: true });
  };
}

// --- POST /api/print-interest { token } --------------------------------------------

function printInterestHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    if (!body || !body.token) return send(res, 400, { error: "bad_request" });
    const story = await deps.db.getStoryByToken(body.token);
    if (!story) return send(res, 404, { error: "not_found" });
    const order = await deps.db.getOrder(story.order_id);
    await deps.db.addPrintInterest(order.id, order.email);
    return send(res, 201, { ok: true });
  };
}

// --- GET /api/cron (Vercel cron, Authorization: Bearer CRON_SECRET) ---------------

function cronHandler(deps) {
  return async (req, res) => {
    if (!requireSecret(req, res, process.env.CRON_SECRET)) return;

    const report = { resumed: 0, reminded: 0, purged: 0 };

    for (const job of await deps.db.staleJobs(5)) {
      await deps.runJob(job.id);
      report.resumed++;
    }

    for (const story of await deps.db.storiesExpiringSoon(50)) {
      const order = await deps.db.getOrder(story.order_id);
      if (order && deps.sendEmail) {
        await deps.sendEmail({ kind: "expiring", to: order.email, locale: order.locale, token: story.token }).catch(() => {});
      }
      await deps.db.updateStory(story.id, { reminder_sent_at: new Date().toISOString() });
      report.reminded++;
    }

    for (const story of await deps.db.expiredStories(50)) {
      const paths = [story.sheet_path, story.pdf_path, ...Object.values(story.page_paths || {}), ...(story.coloring_paths || [])].filter(Boolean);
      await deps.db.remove(BUCKET, paths);
      await deps.db.purgeStory(story.id);
      const order = await deps.db.getOrder(story.order_id);
      if (order) {
        await deps.db.updateOrder(order.id, { personalization: null, status: "expired" });
        if (deps.sendEmail && order.status !== "delivered") {
          await deps.sendEmail({ kind: "expired", to: order.email, locale: order.locale }).catch(() => {});
        }
      }
      report.purged++;
    }

    return send(res, 200, report);
  };
}

// --- POST /api/job { id } (internal) -----------------------------------------------

function jobHandler(deps) {
  return async (req, res) => {
    if (!requireSecret(req, res, process.env.CRON_SECRET)) return;
    const body = await readJson(req).catch(() => ({}));
    const id = body.id || query(req).id;
    if (!id) return send(res, 400, { error: "bad_request" });
    return send(res, 200, await deps.runJob(id));
  };
}

// --- /api/admin (GET queue, POST actions) -----------------------------------------

function adminHandler(deps) {
  return async (req, res) => {
    if (!requireSecret(req, res, process.env.ADMIN_TOKEN)) return;

    if (req.method === "GET") {
      const jobs = await deps.db.jobsNeedingReview(50);
      const items = [];
      for (const job of jobs) {
        const order = await deps.db.getOrder(job.order_id);
        const story = await deps.db.getStoryByOrder(job.order_id);
        const urls = { pages: {}, coloring: [] };
        if (story) {
          if (story.sheet_path) urls.sheet = await deps.db.signedUrl(BUCKET, story.sheet_path, SIGNED_SECONDS);
          for (const [i, p] of Object.entries(story.page_paths || {})) urls.pages[i] = await deps.db.signedUrl(BUCKET, p, SIGNED_SECONDS);
          for (const p of story.coloring_paths || []) urls.coloring.push(await deps.db.signedUrl(BUCKET, p, SIGNED_SECONDS));
          if (story.pdf_path) urls.pdf = await deps.db.signedUrl(BUCKET, story.pdf_path, SIGNED_SECONDS);
        }
        items.push({
          job: { id: job.id, kind: job.kind, state: job.state, error: job.error, costCents: job.cost_cents, steps: job.steps },
          order: order && { id: order.id, email: order.email, status: order.status, locale: order.locale, createdAt: order.created_at, personalization: order.personalization },
          story: story && storyView(story, order, urls),
        });
      }
      return send(res, 200, { items });
    }

    if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
    const body = await readJson(req).catch(() => ({}));

    switch (body.action) {
      case "mark_paid": {
        // Etsy (or a manual sale): the customer has paid → illustrate the rest.
        const story = await deps.db.getStoryByToken(body.token);
        if (!story) return send(res, 404, { error: "not_found" });
        const order = await deps.db.getOrder(story.order_id);
        await deps.db.recordBilling({
          order_id: order.id, provider: body.provider || "etsy", provider_id: String(body.reference || `manual-${order.id}`),
          amount_cents: order.price_cents, currency: "eur", vat_rate: order.vat_rate, status: "paid",
        });
        await deps.db.updateOrder(order.id, { status: "paid", channel: body.provider === "stripe" ? "web" : "etsy", external_ref: body.reference || null });
        await deps.db.markPaid(story.id);
        const job = await deps.db.createJob({ orderId: order.id, storyId: story.id, kind: "full" });
        const result = await deps.runJob(job.id);
        return send(res, 200, { state: result.state });
      }
      case "approve": {
        const job = await deps.db.getJob(body.jobId);
        if (!job) return send(res, 404, { error: "not_found" });
        const story = await deps.db.getStoryByOrder(job.order_id);
        const order = await deps.db.getOrder(job.order_id);
        await deps.db.updateStory(story.id, { stage: "full", retouched: job.kind === "retouch" ? true : story.retouched });
        await deps.db.saveJob(job.id, { state: "done", error: null });
        await deps.db.updateOrder(order.id, { status: "delivered", needs_review: false });
        if (deps.sendEmail) await deps.sendEmail({ kind: "book_ready", to: order.email, locale: order.locale, token: story.token });
        return send(res, 200, { ok: true });
      }
      case "retry": {
        const job = await deps.db.getJob(body.jobId);
        if (!job) return send(res, 404, { error: "not_found" });
        await deps.db.saveJob(job.id, { state: "pending", attempts: 0, error: null, locked_until: null });
        return send(res, 200, await deps.runJob(job.id));
      }
      case "retouch": {
        const story = await deps.db.getStoryByToken(body.token);
        if (!story) return send(res, 404, { error: "not_found" });
        if (story.stage !== "full") return send(res, 409, { error: "wrong_stage" });
        if (story.retouched) return send(res, 409, { error: "already_retouched" });
        const pages = (body.pages || []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < C.PAGE_COUNT).slice(0, 3);
        if (!pages.length) return send(res, 400, { error: "no_pages" });
        const job = await deps.db.createJob({ orderId: story.order_id, storyId: story.id, kind: "retouch", input: { pages } });
        await deps.db.updateStory(story.id, { retouched: true });
        return send(res, 200, await deps.runJob(job.id));
      }
      default:
        return send(res, 400, { error: "unknown_action" });
    }
  };
}

module.exports = {
  orderHandler, storyHandler, reviseHandler, approveHandler, waitlistHandler,
  printInterestHandler, cronHandler, jobHandler, adminHandler, storyView, CAPS,
};
