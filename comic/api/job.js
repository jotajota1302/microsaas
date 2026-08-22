/*
 * GET/POST /api/job?token=… — pushes one job forward by one step and reports.
 *
 * Whoever looks, pushes. The viewer polls this while somebody is waiting; the
 * cron calls it for the ones nobody is watching. Each call does a bounded
 * amount of work and returns, so no invocation ever approaches the function
 * timeout — the reason the whole preview is a state machine and not a loop.
 *
 * It also owns the image, because the image provider and its content-filter
 * ladder live on this side, not in the job logic.
 */

const { store } = require("../lib/store.js");
const { blobs, keys } = require("../lib/blobs.js");
const { advance } = require("../lib/preview-job.js");
const { drawWithLadder } = require("../lib/images.js");
const { checkPanel } = require("../lib/panel-check.js");
const { previewReady } = require("../lib/email.js");

/** What the viewer is allowed to see. Never the email, never the IP hash. */
function publicView(job) {
  const story = job.data && job.data.story;
  return {
    token: job.token,
    status: job.status,
    step: job.step,
    progress: job.progress || 0,
    error: job.status === "failed" ? "No hemos podido terminar esta historia." : null,
    // Whether this was paid for, so somebody arriving from the delivery email
    // days later lands on their comic and not on the buy button again.
    paid: Boolean(job.paid_at),
    title: story ? story.title : null,
    logline: story ? story.logline : null,
    hero: story ? { name: story.hero.name, trait: story.hero.trait } : null,
    cover: job.cover_url || null,
    pages: story ? story.pages.map((p) => ({
      beat: p.beat,
      lines: p.panels.flatMap((panel) => (panel.bubbles || []).map((b) => ({
        type: b.type, who: b.who || null, text: b.text,
      }))),
    })) : null,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const url = new URL(req.url, "http://localhost");
  const token = (url.searchParams.get("token") || "").replace(/[^\w-]/g, "");
  if (!token) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "falta el token" }));
  }

  let job = await store.get(token);
  if (!job) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: "esta vista previa no existe o ha caducado" }));
  }

  // Already finished: answer without spending anything.
  if (job.status === "ready" && job.cover_url) {
    return res.end(JSON.stringify(publicView(job)));
  }
  if (job.status === "failed") {
    res.statusCode = 200;
    return res.end(JSON.stringify(publicView(job)));
  }

  try {
    if (job.status !== "ready") {
      const r = await advance(token);
      job = r.job;
    }

    /*
     * The script is finished but the cover is not drawn yet. Doing it here
     * rather than inside the step keeps every provider call in one place — and
     * this is the one image the free preview pays for.
     */
    if (job.status === "ready" && !job.cover_url && job.data && job.data.coverPrompt) {
      const drawn = await drawWithLadder({
        prompt: job.data.coverPrompt,
        aspect: "2:3",
      });
      const level = drawn.level;

      /*
       * The cover gets the same validator the panels get, and it matters more
       * here than anywhere: this single image is the whole free sample, the
       * thing on the landing page, and the first thing a teenager sees. A
       * photograph instead of a drawing loses the sale on sight.
       *
       * A collapse is thrown rather than stored, which puts the job back in
       * the retry loop and draws it again. Four attempts at 0,0035 $ is the
       * cheapest insurance in this codebase.
       */
      const checked = await checkPanel(drawn.buffer, (job.data.story && job.data.story.style) || job.order.style);
      if (checked.redraw) throw new Error(`la portada ha salido ${checked.verdict}`);
      const buffer = checked.buffer;
      /*
       * Into the blob store, not onto the disk: a serverless function's
       * filesystem does not survive the invocation that wrote it, so the
       * original version of this drew a cover that nobody could ever see.
       * It is also the same cover the paid PDF uses, so it belongs where the
       * panels will.
       */
      await blobs.put(keys.cover(token), buffer);
      job = await store.update(token, {
        cover_url: `/api/file?token=${encodeURIComponent(token)}&k=cover`,
        cover_level: level,
        progress: 100,
      });

      /*
       * The form promises "te avisamos". Sent once, right here, because this
       * is the single moment the preview becomes worth looking at — and never
       * retried on failure: a duplicate "your preview is ready" is worse than
       * a missing one when the page they would open is already open.
       */
      if (job.email && !job.notified_at) {
        const sent = await previewReady({ job, story: job.data.story });
        job = await store.update(token, { notified_at: new Date().toISOString(), notify: sent });
      }
    }
  } catch (e) {
    // A step that throws has already recorded its own attempt count; anything
    // that escapes to here is reported without killing the job.
    res.statusCode = 200;
    return res.end(JSON.stringify({ ...publicView(job), note: String(e.message).slice(0, 160) }));
  }

  res.end(JSON.stringify(publicView(job)));
};

module.exports.publicView = publicView;
