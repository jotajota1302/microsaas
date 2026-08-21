/*
 * The job machine: one resumable job per stage transition.
 *
 *   script  : text → review → notify          (free; the user reads the script)
 *   sample  : sheet → pages[1, mid]           (free; two illustrated pages)
 *   full    : pages[rest] → lineart → pdf → approval   (paid; human approves → delivered)
 *   retouch : pages[chosen] → pdf → approval  (one round, included in the price)
 *
 * Every step persists its result in jobs.steps before the next one runs, so a
 * crash or a timeout resumes exactly where it stopped. Cost is summed per job
 * and the ceiling stops the job for human review instead of burning credit.
 *
 * Every external dependency is injected through `deps`, so the whole machine
 * is tested without a network. Names in `deps`: db, generateStory,
 * reviewStory, buildSheet, renderPages, toLineArt, renderPdf, sendEmail, log.
 */

const C = require("./collection.js");
const money = require("./money.js");

const BUCKET = "stories";
const SAMPLE_PAGES = [0, 5]; // page 1 and a middle one — never the ending
const COLORING_FROM = [0, 3, 6, 9];
const MAX_ATTEMPTS = 3;

/*
 * How much work one invocation does before saving and asking to be called
 * again. A serverless function has a wall clock (60 s on Vercel's Hobby plan,
 * 300 s on Pro) and illustrating twelve pages does not fit in either with any
 * margin. Each batch is sized to finish in well under a minute — four pages
 * is exactly one wave of renderPages' concurrency, two line-art edits run
 * sequentially — and everything it produced is persisted before the function
 * returns, so the next call resumes instead of starting over.
 */
const PAGE_BATCH = 4;
const LINEART_BATCH = 2;

const PLAN = {
  script: ["text", "review", "notify"],
  sample: ["sheet", "pages", "notify"],
  full: ["pages", "lineart", "pdf", "approval"],
  retouch: ["pages", "pdf", "approval"],
};

class StopForReview extends Error {
  constructor(message) { super(message); this.name = "StopForReview"; }
}

/** Strips every personal datum before anything reaches a model. */
function anonymise(personalization) {
  const p = personalization || {};
  return {
    ageBand: p.ageBand,
    gender: p.gender,
    hairColor: p.hairColor,
    hairType: p.hairType,
    skin: p.skin,
    glasses: Boolean(p.glasses),
    pet: p.pet || "ninguna",
    hobby: p.hobby,
    theme: p.theme,
    moment: p.moment || "aventura",
    tone: p.tone || "divertido",
    people: (Array.isArray(p.people) ? p.people : []).slice(0, C.MAX_PEOPLE).map((x) => ({ relation: x.relation, ageBand: x.ageBand || null })),
    instructions: Array.isArray(p.instructions) ? p.instructions : [],
    // The one free line the parent wrote. It has passed moderation and it
    // holds no name: the form asks for a trait, not for who anyone is.
    notes: typeof p.notes === "string" ? p.notes.trim() : "",
    locale: p.locale || "es",
  };
}

const pad = (i) => String(i + 1).padStart(2, "0");
const toCents = (usd) => Math.round((usd || 0) * 100 * 0.92); // USD → EUR cents, conservative

async function loadPages(db, story, indices) {
  const out = [];
  for (const i of indices) {
    const path = story.page_paths && story.page_paths[String(i)];
    out.push(path ? { buffer: await db.download(BUCKET, path), fallback: false } : { buffer: null, fallback: true, fallbackPath: C.fallbackImage(story.story.theme || "mar", i) });
  }
  return out;
}

// --- the steps -----------------------------------------------------------------

const STEPS = {
  // Note: the revision counter is NOT touched here. reviseHandler owns it —
  // it is what checks a round is available and what reports how many are left.
  // Incrementing in both places spent both free rounds on a single request.
  async text(ctx, deps) {
    const input = anonymise(ctx.order.personalization);
    const { story, attempts, costUsd } = await deps.generateStory(input);
    const peopleCount = input.people.length;
    const withTheme = { ...story, theme: input.theme };
    if (ctx.story) {
      ctx.story = await deps.db.updateStory(ctx.story.id, {
        story: withTheme,
        people_count: peopleCount,
        instructions: input.instructions,
      });
    } else {
      ctx.story = await deps.db.createStory({ orderId: ctx.order.id, story: withTheme, peopleCount });
      await deps.db.saveJob(ctx.job.id, { story_id: ctx.story.id });
    }
    return { attempts, costCents: toCents(costUsd) };
  },

  async review(ctx, deps) {
    const verdict = await deps.reviewStory(ctx.story.story);
    if (!verdict.ok) {
      // forget the text so the retry writes a new one
      ctx.job.steps.text = { done: false, rejected: verdict.issues };
      throw new Error(`story rejected by reviewer: ${verdict.issues.join("; ")}`);
    }
    return { issues: verdict.issues || [] };
  },

  async sheet(ctx, deps) {
    const { sheet, costUsd } = await deps.buildSheet(ctx.story.story.character_sheet);
    const path = `${ctx.story.token}/sheet.png`;
    await deps.db.upload(BUCKET, path, sheet, "image/png");
    ctx.story = await deps.db.updateStory(ctx.story.id, { sheet_path: path });
    return { path, costCents: toCents(costUsd) };
  },

  async pages(ctx, deps) {
    const story = ctx.story;
    const done = story.page_paths || {};
    const previous = ctx.job.steps.pages || {};
    // A page that came back as a fallback leaves no path behind, so "not done"
    // alone would ask for it again on every batch and the job would never end.
    // What has been tried is remembered instead.
    const tried = previous.attempted || [];
    let queue;
    if (ctx.job.kind === "retouch") queue = (ctx.job.input.pages || []).map(Number);
    else if (ctx.job.kind === "sample") queue = SAMPLE_PAGES.filter((i) => !done[String(i)] && !tried.includes(i));
    else queue = story.story.pages.map((_, i) => i).filter((i) => !done[String(i)] && !tried.includes(i));
    if (!queue.length) return { rendered: 0, attempted: tried };

    const indices = queue.slice(0, PAGE_BATCH);
    const sheet = await deps.db.download(BUCKET, story.sheet_path);
    const { pages, costUsd, fallbacks } = await deps.renderPages(
      { ...story.story, theme: story.story.theme },
      [sheet],
      { indices }
    );
    const paths = { ...done };
    for (const p of pages) {
      if (p.buffer) {
        const path = `${story.token}/p${pad(p.index)}.png`;
        await deps.db.upload(BUCKET, path, p.buffer, "image/png");
        paths[String(p.index)] = path;
      } else {
        delete paths[String(p.index)];
      }
    }
    const totalFallbacks = (story.fallbacks || 0) + fallbacks;
    const left = queue.length - indices.length;
    const patch = { page_paths: paths, fallbacks: totalFallbacks };
    if (ctx.job.kind === "sample" && !left) patch.stage = "sample";
    ctx.story = await deps.db.updateStory(story.id, patch);
    // Per batch the renderer already refuses more than MAX_FALLBACKS; this is
    // the same rule over the whole book, which batching would otherwise let
    // through one undrawn page at a time.
    if (totalFallbacks > 2) throw new StopForReview(`${totalFallbacks} pages could not be illustrated`);
    return {
      rendered: pages.length,
      fallbacks: totalFallbacks,
      costCents: toCents(costUsd),
      attempted: tried.concat(indices),
      partial: left > 0,
      left,
    };
  },

  async lineart(ctx, deps) {
    const story = ctx.story;
    const hints = story.story.coloring_hints || [];
    const sources = COLORING_FROM.filter((i) => story.page_paths && story.page_paths[String(i)]).slice(0, C.COLORING_PAGE_COUNT);
    // if some source pages fell back, use any illustrated page so we still have four
    const extra = Object.keys(story.page_paths || {}).map(Number).filter((i) => !sources.includes(i));
    while (sources.length < C.COLORING_PAGE_COUNT && extra.length) sources.push(extra.shift());
    if (sources.length < C.COLORING_PAGE_COUNT) throw new StopForReview("not enough illustrated pages for the colouring section");

    // Line art is four sequential edits of ~15 s. They are done a couple at a
    // time and saved, so the count already stored says where to carry on.
    const paths = (story.coloring_paths || []).slice();
    const end = Math.min(paths.length + LINEART_BATCH, C.COLORING_PAGE_COUNT);
    let cost = 0;
    for (let k = paths.length; k < end; k++) {
      const src = await deps.db.download(BUCKET, story.page_paths[String(sources[k])]);
      const { buffer, costUsd } = await deps.toLineArt(src, hints[k]);
      const path = `${story.token}/c${pad(k)}.png`;
      await deps.db.upload(BUCKET, path, buffer, "image/png");
      paths.push(path);
      cost += costUsd || 0;
    }
    ctx.story = await deps.db.updateStory(story.id, { coloring_paths: paths });
    const left = C.COLORING_PAGE_COUNT - paths.length;
    return { paths, costCents: toCents(cost), partial: left > 0, left };
  },

  async pdf(ctx, deps) {
    const story = ctx.story;
    const images = await loadPages(deps.db, story, story.story.pages.map((_, i) => i));
    const coloring = [];
    for (const p of story.coloring_paths || []) coloring.push(await deps.db.download(BUCKET, p));
    const sheet = story.sheet_path ? await deps.db.download(BUCKET, story.sheet_path) : undefined;
    const person = ctx.order.personalization || {};
    const buffer = await deps.renderPdf({
      story: story.story,
      images,
      coloring,
      sheet,
      personalization: {
        name: person.name,
        people: person.people || [],
        dedication: person.dedication,
        date: new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date()),
      },
      mode: "screen",
    });
    const path = `${story.token}/libro.pdf`;
    await deps.db.upload(BUCKET, path, buffer, "application/pdf");
    ctx.story = await deps.db.updateStory(story.id, { pdf_path: path });
    return { path, bytes: buffer.length };
  },

  async approval(ctx) {
    // A pause, not a failure: a human looks before anything is delivered.
    throw new StopForReview("awaiting human approval");
  },

  async notify(ctx, deps) {
    if (!deps.sendEmail) return { skipped: true };
    await deps.sendEmail({
      kind: ctx.job.kind === "script" ? "script_ready" : "sample_ready",
      to: ctx.order.email,
      locale: ctx.order.locale,
      token: ctx.story.token,
    });
    return { sent: true };
  },
};

// --- the runner ----------------------------------------------------------------

async function runJob(jobId, deps) {
  const { db } = deps;
  const log = deps.log || ((m) => console.log(`[cuentos] ${m}`));

  const job = await db.claimJob(jobId);
  if (!job) return { state: "locked" };
  if (job.state === "done") return { state: "done" };

  const plan = PLAN[job.kind];
  if (!plan) {
    await db.saveJob(job.id, { state: "failed", error: `unknown job kind ${job.kind}` });
    return { state: "failed" };
  }

  const ctx = {
    job: { ...job, steps: job.steps || {} },
    order: await db.getOrder(job.order_id),
    story: await db.getStoryByOrder(job.order_id),
  };
  const ceiling = job.kind === "sample" ? money.PREVIEW_BUDGET_CENTS : money.MAX_AI_COST_CENTS;
  let costCents = job.cost_cents || 0;

  for (const name of plan) {
    if (ctx.job.steps[name] && ctx.job.steps[name].done) continue;
    try {
      log(`job ${job.id} (${job.kind}) step ${name}`);
      const result = await STEPS[name](ctx, deps);
      costCents += (result && result.costCents) || 0;
      // A step that did as much as fits in one invocation says so. Its work is
      // saved, the lock is released and the job stays pending: whoever calls
      // next (the viewer, the cron, the panel) carries on from here.
      if (result && result.partial) {
        ctx.job.steps[name] = { done: false, at: new Date().toISOString(), ...result };
        await db.saveJob(job.id, {
          state: "pending",
          steps: ctx.job.steps,
          cost_cents: costCents,
          story_id: ctx.story ? ctx.story.id : job.story_id,
          locked_until: null,
        });
        return { state: "pending", partial: name, left: result.left };
      }
      ctx.job.steps[name] = { done: true, at: new Date().toISOString(), ...result };
      await db.saveJob(job.id, { steps: ctx.job.steps, cost_cents: costCents, story_id: ctx.story ? ctx.story.id : job.story_id });
      if (costCents > ceiling) {
        await db.saveJob(job.id, { state: "needs_review", error: `cost ${costCents} cents exceeds ceiling ${ceiling}` });
        return { state: "needs_review", reason: "cost" };
      }
    } catch (e) {
      if (e instanceof StopForReview) {
        await db.saveJob(job.id, { state: "needs_review", steps: ctx.job.steps, cost_cents: costCents, error: e.message });
        if (ctx.order) await db.updateOrder(ctx.order.id, { status: "needs_review" });
        return { state: "needs_review", reason: e.message };
      }
      const attempts = (job.attempts || 0) + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await db.saveJob(job.id, {
        state: exhausted ? "needs_review" : "pending",
        attempts,
        steps: ctx.job.steps,
        cost_cents: costCents,
        error: `${name}: ${e.message}`.slice(0, 500),
        locked_until: null,
      });
      log(`job ${job.id} step ${name} failed (attempt ${attempts}): ${e.message}`);
      return { state: exhausted ? "needs_review" : "pending", failedStep: name, attempts };
    }
  }

  await db.saveJob(job.id, { state: "done", steps: ctx.job.steps, cost_cents: costCents, locked_until: null });
  if (ctx.order && ctx.story) {
    if (job.kind === "script") await db.updateOrder(ctx.order.id, { status: "script" });
    if (job.kind === "sample") await db.updateOrder(ctx.order.id, { status: "sample" });
  }
  return { state: "done", costCents };
}

module.exports = { runJob, STEPS, PLAN, anonymise, toCents, StopForReview, SAMPLE_PAGES, COLORING_FROM, BUCKET, MAX_ATTEMPTS, PAGE_BATCH, LINEART_BATCH };
