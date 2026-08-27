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
const { send, readJson, rawBody, query, clientIp, requireMethod, requireSecret } = require("./http.js");
const dashboard = require("./dashboard.js");
const analytics = require("./analytics.js");
const { recipientsOf } = require("./email.js");
const { SAMPLE_PAGES, PLAN } = require("./steps.js");

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
      notes: input.personalization.notes,
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
    // How much of the book exists. After payment the viewer shows this as a
    // progress bar instead of a spinner that says nothing.
    illustrated: Object.keys(urls.pages || {}).length,
    total: story.story.pages.length,
    etsyUrl: process.env.ETSY_LISTING_URL || null,
    // Whether the card route is live. Half-wired Stripe (no webhook secret)
    // deliberately reads as not live: it would take the money and deliver
    // nothing.
    canPayByCard: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
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
    // What may be seen is decided by whether the book has been paid for, never
    // by how many pages happen to exist. Counting them hid the two sample
    // pages the moment the third was drawn — the buyer watched their preview
    // disappear right after paying.
    const paid = story.stage === "full" || ["paid", "needs_review", "delivered"].includes(order.status);
    for (const [i, p] of Object.entries(story.page_paths || {})) {
      if (paid || SAMPLE_PAGES.includes(Number(i))) {
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
    // The sample gate is a way in, not a dead end: while free rewrites remain
    // the customer can still change the text. A paid book cannot: it has its
    // own retouch.
    if (story.stage !== "script" && story.stage !== "sample") return send(res, 409, { error: "wrong_stage" });
    if ((story.revisions || 0) >= CAPS().revisions) return send(res, 409, { error: "no_revisions_left" });

    const verdict = await deps.moderation.checkInput({ name: "x", dedication: instruction });
    if (!verdict.ok) return send(res, 422, { error: "blocked", reason: verdict.reason });

    const order = await deps.db.getOrder(story.order_id);
    const instructions = [...(story.instructions || []), instruction];
    await deps.db.updateOrder(order.id, { personalization: { ...order.personalization, instructions } });

    // Coming back from the sample: the drawings illustrate a text that is about
    // to change, so they are thrown away rather than left to mislead.
    const undo = story.stage === "sample"
      ? { stage: "script", sheet_path: null, page_paths: {}, coloring_paths: [] }
      : {};
    if (story.stage === "sample") {
      const orphans = [story.sheet_path, ...Object.values(story.page_paths || {})].filter(Boolean);
      if (orphans.length) await deps.db.remove(BUCKET, orphans);
    }

    const updated = await deps.db.updateStory(story.id, { instructions, revisions: (story.revisions || 0) + 1, ...undo });
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

// --- payment: POST /api/checkout { token } and POST /api/webhook-stripe -----------

function checkoutHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    if (!body || !body.token) return send(res, 400, { error: "bad_request" });

    const story = await deps.db.getStoryByToken(body.token);
    if (!story) return send(res, 404, { error: "not_found" });
    if (new Date(story.expires_at) < new Date()) return send(res, 410, { error: "expired" });
    // Only from the sample gate: paying before seeing a page would be selling
    // blind, and paying again for a finished book would be taking money twice.
    if (story.stage !== "sample") return send(res, 409, { error: "wrong_stage" });

    const order = await deps.db.getOrder(story.order_id);
    const session = await deps.stripe.createCheckout({ story, order });
    return send(res, 200, { url: session.url });
  };
}

/**
 * Stripe tells us a payment happened. Nothing here is believed until the
 * signature checks out: without that, this endpoint is "give me a free book"
 * for anyone who knows the URL.
 */
function stripeWebhookHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;

    let event;
    try {
      event = deps.stripe.readEvent(await rawBody(req), req.headers["stripe-signature"]);
    } catch (e) {
      console.warn(`[cuentos] stripe webhook refused: ${e.message}`);
      return send(res, 400, { error: "bad_signature" });
    }

    // Anything else is acknowledged: a 4xx would make Stripe retry an event we
    // simply do not want.
    if (event.type !== "checkout.session.completed") return send(res, 200, { ignored: event.type });

    const session = event.data.object || {};
    if (session.payment_status && session.payment_status !== "paid") {
      return send(res, 200, { ignored: "unpaid" });
    }

    const token = session.client_reference_id || (session.metadata && session.metadata.token);
    const story = token && (await deps.db.getStoryByToken(token));
    if (!story) return send(res, 200, { ignored: "unknown_story" });

    const order = await deps.db.getOrder(story.order_id);

    // The unique index on provider_id makes a retried webhook a no-op rather
    // than a second book. Stripe retries; this must be safe when it does.
    await deps.db.recordBilling({
      order_id: order.id,
      provider: "stripe",
      provider_id: session.id,
      amount_cents: session.amount_total != null ? session.amount_total : order.price_cents,
      currency: session.currency || "eur",
      vat_rate: order.vat_rate,
      status: "paid",
    });

    if (order.status === "paid" || order.status === "needs_review" || order.status === "delivered") {
      return send(res, 200, { already: order.status });
    }

    // The address the buyer typed into Stripe's own form, which is where the
    // receipt just landed. If it is not the one they typed into ours, ours had
    // a typo — and a typo used to lose the customer for good, because the book,
    // the link and every reminder went to nobody. Delivery goes to both.
    const paidEmail = String((session.customer_details && session.customer_details.email) || session.customer_email || "").trim().toLowerCase();
    const patch = { status: "paid", channel: "web", external_ref: session.id };
    if (paidEmail && paidEmail !== String(order.email || "").toLowerCase()) patch.paid_email = paidEmail;
    await deps.db.updateOrder(order.id, patch);
    await deps.db.markPaid(story.id);
    const job = await deps.db.createJob({ orderId: order.id, storyId: story.id, kind: "full" });
    // The book is NOT drawn here. Illustrating it takes minutes and a webhook
    // that has not answered in seconds is a failed webhook to Stripe: it would
    // retry, and each retry would start the work again. The job is queued and
    // acknowledged; the viewer the customer is being returned to drives it,
    // and the cron picks up whatever was left behind.
    return send(res, 200, { queued: job.id });
  };
}

// --- POST /api/resume { token } ----------------------------------------------------
//
// One invocation of a serverless function cannot illustrate twelve pages, so
// the work is done in batches and something has to ask for the next one. That
// something is whoever is looking at the story: the page polls this while
// there is work owed. Safe to call at any time — the job lock means two
// callers never do the same batch twice, and an idle story answers "done".

function resumeHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    if (!body || !body.token) return send(res, 400, { error: "bad_request" });

    const story = await deps.db.getStoryByToken(body.token);
    if (!story) return send(res, 404, { error: "not_found" });

    const job = await deps.db.runnableJobFor(story.order_id);
    if (!job) return send(res, 200, { state: "idle" });

    const result = await deps.runJob(job.id);
    const after = await deps.db.getStoryByToken(body.token);
    return send(res, 200, {
      state: result.state,
      kind: job.kind,
      illustrated: Object.keys((after && after.page_paths) || {}).length,
      total: (after && after.story && after.story.pages.length) || C.PAGE_COUNT,
    });
  };
}

// --- POST /api/recover { email } -------------------------------------------------
//
// There are no accounts on purpose: no password to forget, no profile to keep.
// The trade-off is that the link IS the key, so losing the email would mean
// losing the book. This sends the live links back.

function recoverHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    const email = String((body && body.email) || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: "invalid_email" });

    const orders = await deps.db.liveStoriesFor(email);
    for (const order of orders) {
      const story = await deps.db.getStoryByOrder(order.id);
      // A dead link is worse than no email: it reads as "your book is gone".
      if (!story || new Date(story.expires_at) < new Date()) continue;
      await deps.sendEmail({ kind: "recover", to: order.email, locale: order.locale, token: story.token });
    }

    // Always the same answer. Telling a stranger whether an address is ours
    // would turn this into a way to test email addresses.
    return send(res, 200, { ok: true });
  };
}

// --- POST /api/print-interest { token } --------------------------------------------

// --- POST /api/track ---------------------------------------------------------------
//
// One row per thing that happened before an order exists. Everything after
// that is already in the database and is not guessed from a click.
//
// It answers 204 whatever happens: measurement must never be something the
// customer can feel, and a failure here is ours to find in the logs.

function trackHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    const row = analytics.toRow(body, { ipHash: deps.db.hashIp(clientIp(req)) });
    if (row) {
      await deps.db.recordEvent(row).catch((e) => console.warn(`[cuentos] track dropped: ${e.message}`));
    }
    res.statusCode = 204;
    return res.end();
  };
}

// --- POST /api/contact { email, message, token? } ------------------------------
//
// The last resort when nothing else worked: the address was wrong, the link is
// gone, or something is simply not right with the book. It reaches a person.
// The story token travels when the customer writes from their own page, which
// saves asking them for it — it is the one thing that identifies the order.

const CONTACT_MAX = 1500;

function contactHandler(deps) {
  return async (req, res) => {
    if (!requireMethod(req, res, "POST")) return;
    const body = await readJson(req).catch(() => null);
    const email = String((body && body.email) || "").trim().toLowerCase();
    const message = String((body && body.message) || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: "invalid_email" });
    if (message.length < 5) return send(res, 400, { error: "empty_message" });

    const token = String((body && body.token) || "").trim();
    const story = /^[A-Za-z0-9_-]{22}$/.test(token) ? await deps.db.getStoryByToken(token).catch(() => null) : null;
    const order = story ? await deps.db.getOrder(story.order_id).catch(() => null) : null;

    // A failure to relay is ours to find in the logs. Answering "something
    // went wrong" to somebody already writing because something went wrong is
    // the worst reply available.
    if (deps.sendContact) {
      await deps.sendContact({
        from: email,
        message: message.slice(0, CONTACT_MAX),
        token: story ? story.token : null,
        orderEmail: order ? order.email : null,
        status: order ? order.status : null,
      }).catch((e) => console.error(`[cuentos] contact relay failed for ${email}: ${e.message}`));
    }
    // Always the same answer, sent or not: the customer has done their part and
    // a failure to relay is ours to see in the logs, not theirs to decode.
    return send(res, 200, { ok: true });
  };
}

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

    const report = { resumed: 0, batches: 0, reminded: 0, purged: 0 };

    // Work arrives in batches, so resuming a job once would move it one step a
    // run. Keep pushing the same job while there is time left in this
    // invocation; whatever is still owed is picked up by the next sweep.
    const started = Date.now();
    const BUDGET_MS = Number(process.env.CRON_BUDGET_MS || 45000);
    for (const job of await deps.db.staleJobs(5)) {
      report.resumed++;
      for (let i = 0; i < 30; i++) {
        const result = await deps.runJob(job.id);
        report.batches++;
        if (result.state !== "pending" || !result.partial) break;
        if (Date.now() - started > BUDGET_MS) break;
      }
      if (Date.now() - started > BUDGET_MS) break;
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
      // The queue alone does not say whether the shop can trade: the panel also
      // reports which integrations are wired and how the funnel is converting.
      const [orders, allJobs] = await Promise.all([deps.db.recentOrders(200), deps.db.recentJobs(500)]);
      // Every story, not the last 25: this is the only place the shop can be
      // looked at. One query for all of them, and the cost comes from the jobs
      // already fetched for the economics rather than from more round trips.
      const rows = await deps.db.storiesForOrders(orders.map((o) => o.id));
      const byId = new Map(orders.map((o) => [o.id, o]));
      const stories = new Map();
      for (const s of rows || []) {
        // The stored title keeps the placeholder, because the child's name
        // never travels to a model. The panel is not a model: showing
        // "El Gran Viaje de {{NOMBRE}}" to the person running the shop is just
        // a leak of how the sausage is made.
        const person = (byId.get(s.order_id) || {}).personalization || {};
        stories.set(s.order_id, {
          token: s.token, stage: s.stage,
          title: substitute((s.story && s.story.title) || "", { name: person.name, people: person.people || [] }),
          revisions: s.revisions, retouched: s.retouched, expiresAt: s.expires_at,
          illustrated: Object.keys(s.page_paths || {}).length,
          hasPdf: Boolean(s.pdf_path),
        });
      }
      const spent = new Map();
      for (const j of allJobs || []) spent.set(j.order_id, (spent.get(j.order_id) || 0) + (j.cost_cents || 0));
      const recent = orders.map((o) => ({
        id: o.id, email: o.email, status: o.status, channel: o.channel, locale: o.locale,
        priceCents: o.price_cents, createdAt: o.created_at, needsReview: o.needs_review,
        paidEmail: o.paid_email || null,
        costCents: spent.get(o.id) || 0,
        story: stories.get(o.id) || null,
      }));
      // The half of the funnel the database cannot see. Best effort: a shop
      // must open even if its statistics do not.
      const sinceIso = new Date(Date.now() - 30 * 86400000).toISOString();
      const events = await deps.db.recentEvents(sinceIso).catch((e) => {
        console.warn(`[cuentos] events unavailable: ${e.message}`);
        return [];
      });
      const inRange = (days) => {
        const from = Date.now() - days * 86400000;
        const ev = (events || []).filter((e) => new Date(e.at).getTime() >= from);
        const od = orders.filter((o) => new Date(o.created_at).getTime() >= from);
        return { funnel: analytics.funnel(ev, od), sources: analytics.sources(ev), devices: analytics.devices(ev), pages: analytics.pages(ev), events: ev.length };
      };

      /*
       * Work that is owed and that nobody is doing. This is the half the panel
       * was blind to: a job only ever appeared here once it reached
       * needs_review, so one that died mid-step — killed by the function's
       * wall clock, leaving no error behind — was owed, unfinished and
       * invisible, while the customer's page paid for another doomed attempt
       * every time they opened it (a real paid book, 27-08-2026).
       */
      const stuck = [];
      const owed = await Promise.resolve()
        .then(() => deps.db.stuckJobs())
        .catch((e) => { console.warn(`[cuentos] stuck jobs unavailable: ${e.message}`); return []; });
      for (const job of owed || []) {
        const s = await deps.db.getStoryByOrder(job.order_id);
        const o = await deps.db.getOrder(job.order_id);
        if (o && ["cancelled", "expired", "refunded"].includes(o.status)) continue;
        stuck.push({
          jobId: job.id, kind: job.kind, state: job.state, orderId: job.order_id,
          error: job.error || null, attempts: job.attempts || 0,
          step: (PLAN[job.kind] || []).find((n) => !(job.steps && job.steps[n] && job.steps[n].done)) || null,
          since: job.updated_at || job.created_at,
          email: o && o.email,
          token: s && s.token,
          illustrated: s ? Object.keys(s.page_paths || {}).length : 0,
          missing: s && s.story ? s.story.pages.map((_, i) => i).filter((i) => !(s.page_paths || {})[String(i)]) : [],
        });
      }

      return send(res, 200, {
        items,
        stuck,
        recent,
        overview: dashboard.overview({ orders, jobs: allJobs, env: process.env }),
        traffic: { today: inRange(1), week: inRange(7), month: inRange(30) },
      });
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
        // Queued, not drawn here: the panel would sit on a dead request for
        // minutes. It polls /api/resume with the token, exactly as the
        // customer's own page does.
        return send(res, 200, { queued: job.id, token: story.token });
      }
      case "approve": {
        const job = await deps.db.getJob(body.jobId);
        if (!job) return send(res, 404, { error: "not_found" });
        const story = await deps.db.getStoryByOrder(job.order_id);
        const order = await deps.db.getOrder(job.order_id);
        await deps.db.updateStory(story.id, { stage: "full", retouched: job.kind === "retouch" ? true : story.retouched });
        await deps.db.saveJob(job.id, { state: "done", error: null });
        await deps.db.updateOrder(order.id, { status: "delivered", needs_review: false });
        // To every address we have for them, which after a typo is two.
        if (deps.sendEmail) await deps.sendEmail({ kind: "book_ready", to: recipientsOf(order), locale: order.locale, token: story.token });
        return send(res, 200, { ok: true });
      }
      // Closes an order for good: nothing more is generated, nothing more is
      // spent, and the customer's link stops working. The money is NOT touched
      // — a refund is a decision taken in Stripe, by a person, on purpose.
      case "cancel": {
        const story = body.token ? await deps.db.getStoryByToken(body.token) : null;
        const orderId = body.orderId || (story && story.order_id);
        if (!orderId) return send(res, 400, { error: "bad_request" });
        const order = await deps.db.getOrder(orderId);
        if (!order) return send(res, 404, { error: "not_found" });
        // Read before writing: after the update the status is "cancelled" and
        // whether money had changed hands would be unanswerable.
        const wasPaid = ["paid", "needs_review", "delivered"].includes(order.status);

        await deps.db.cancelJobsFor(orderId);
        await deps.db.updateOrder(orderId, { status: "cancelled", needs_review: false });
        // Expiring the story rather than deleting it: the sweep purges the
        // content on its next run, and until then a mistake can be undone.
        const s2 = story || (await deps.db.getStoryByOrder(orderId));
        if (s2) await deps.db.updateStory(s2.id, { expires_at: new Date().toISOString() });
        return send(res, 200, { ok: true, cancelled: orderId, wasPaid });
      }
      /*
       * A customer writes in because the book never arrived: they mistyped
       * their address. This is the counter where that is fixed. It changes
       * where we write to and sends the link again — it never touches the
       * story, the payment or anything the customer could not see anyway.
       */
      case "set_email": {
        const email = String(body.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return send(res, 400, { error: "invalid_email" });
        const story = body.token ? await deps.db.getStoryByToken(body.token) : null;
        const orderId = body.orderId || (story && story.order_id);
        if (!orderId) return send(res, 400, { error: "bad_request" });
        const order = await deps.db.getOrder(orderId);
        if (!order) return send(res, 404, { error: "not_found" });
        const s2 = story || (await deps.db.getStoryByOrder(orderId));
        await deps.db.updateOrder(orderId, { email });
        if (body.resend !== false && deps.sendEmail && s2) {
          const kind = order.status === "delivered" ? "book_ready" : s2.stage === "sample" ? "sample_ready" : "script_ready";
          await deps.sendEmail({ kind, to: [email], locale: order.locale, token: s2.token });
        }
        return send(res, 200, { ok: true, email });
      }
      // Sends the link again to wherever we already write. For "it went to
      // spam" and "I deleted it", which is most of the post is.
      case "resend": {
        const story = body.token ? await deps.db.getStoryByToken(body.token) : await deps.db.getStoryByOrder(body.orderId);
        if (!story) return send(res, 404, { error: "not_found" });
        const order = await deps.db.getOrder(story.order_id);
        const to = recipientsOf(order);
        if (!to.length) return send(res, 409, { error: "no_recipient" });
        const kind = order.status === "delivered" ? "book_ready" : story.stage === "sample" ? "sample_ready" : "script_ready";
        if (deps.sendEmail) await deps.sendEmail({ kind, to, locale: order.locale, token: story.token });
        return send(res, 200, { ok: true, sent: to.length });
      }
      /*
       * Unstick a job. It clears the lock and the failure count and hands the
       * work back to the drive loop rather than doing it here: this endpoint
       * has the same 60 s wall clock as any other, and it was a step that ran
       * past that clock which got the job stuck in the first place. The panel
       * polls /api/resume with the token, exactly as the customer's page does.
       */
      case "retry": {
        const job = await deps.db.getJob(body.jobId);
        if (!job) return send(res, 404, { error: "not_found" });
        await deps.db.saveJob(job.id, { state: "pending", attempts: 0, error: null, locked_until: null });
        const story = await deps.db.getStoryByOrder(job.order_id);
        if (story) return send(res, 200, { queued: job.id, token: story.token });
        // No story yet (the text step never got that far): nothing to poll with.
        return send(res, 200, await deps.runJob(job.id));
      }
      /*
       * Draw a page again. Not the customer's retouch — that is one round,
       * paid for, and it is theirs to spend. This is the shop's own repair for
       * a page that came out as a catalogue fallback because the image
       * provider was down or the credit had run out: the page is simply owed,
       * and once the cause is fixed it should be drawn, not shipped blank.
       */
      case "redraw": {
        const story = await deps.db.getStoryByToken(body.token);
        if (!story) return send(res, 404, { error: "not_found" });
        const pages = (body.pages || []).map(Number)
          .filter((n) => Number.isInteger(n) && n >= 0 && n < C.PAGE_COUNT);
        if (!pages.length) return send(res, 400, { error: "no_pages" });
        const job = await deps.db.lastJobFor(story.order_id, "full");
        if (!job) return send(res, 409, { error: "no_full_job" });

        const steps = { ...(job.steps || {}) };
        const attempted = ((steps.pages || {}).attempted || []).filter((i) => !pages.includes(Number(i)));
        // "Attempted" is what stops the batcher asking for the same page for
        // ever; forgetting it for these pages is the whole repair.
        steps.pages = { ...(steps.pages || {}), done: false, partial: false, attempted };
        steps.pdf = { done: false };
        delete steps.approval;

        const paths = { ...(story.page_paths || {}) };
        let recovered = 0;
        for (const i of pages) {
          if (paths[String(i)]) delete paths[String(i)];
          else recovered++;
        }
        await deps.db.updateStory(story.id, {
          page_paths: paths,
          fallbacks: Math.max(0, (story.fallbacks || 0) - recovered),
        });
        await deps.db.saveJob(job.id, { state: "pending", attempts: 0, error: null, locked_until: null, steps });
        await deps.db.updateOrder(story.order_id, { needs_review: false });
        return send(res, 200, { queued: job.id, token: story.token, pages });
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
  printInterestHandler, contactHandler, trackHandler, recoverHandler, checkoutHandler, stripeWebhookHandler, resumeHandler, cronHandler, jobHandler, adminHandler, storyView, CAPS,
};
