/*
 * The free preview, as a state machine that advances one step per call.
 *
 * Measured on 2026-08-22: the script takes 90-240 s and the cover about 20 s.
 * Neither fits in a Vercel Hobby function (60 s), and the full script does not
 * fit in a Pro one (300 s) with any margin. So nothing here runs to completion:
 * each call does ONE step, persists, and says whether there is more to do.
 * Whoever looks pushes — the viewer polls, and a cron sweeps the ones nobody
 * is watching. Same shape as cuentos/lib/steps.js.
 *
 *   outline -> critique -> rewrite -> breakdown -> cover -> done
 *
 * The steps deliberately stop at the cover: the free preview is one image plus
 * the whole script. The other ninety panels only get drawn after somebody pays.
 *
 * EL PULIDO DE DIÁLOGO YA NO ESTÁ AQUÍ (2026-08-22). Estaba, y medido costaba
 * 0,076 $ y 7,6 minutos: el 68 % del tiempo de la vista previa y el 83 % de su
 * coste de texto — pagado también por los diecinueve de cada veinte que miran
 * y no compran. Se ha ido a la máquina de pago, que es quien puede permitírselo.
 */

const C = require("./catalog.js");
const P = require("./prompt-script.js");
const S = require("./style.js");
const { completeJson } = require("./llm.js");
const { validateStory, judgeCritique, pageProblems } = require("./validate-story.js");
const { store } = require("./store.js");
const { unmask } = require("./names.js");

const STEPS = ["outline", "critique", "rewrite", "breakdown", "cover", "done"];

/** How many breakdown pages one invocation will attempt before yielding. */
const PAGES_PER_CALL = Number(process.env.PAGES_PER_CALL || 4);
/* Longer than the slowest step (four breakdown pages, ~90 s) and shorter than
 * the cron's five minutes, so a function that dies mid-step frees the job
 * before the next sweep rather than stalling it. */
const LOCK_SECONDS = Number(process.env.PREVIEW_LOCK_SECONDS || 240);

function heroFromOrder(o) {
  return {
    name: o.name,
    age: o.age,
    gender: o.gender,
    hair: `${C.HAIR_SHAPE[o.hairShape]}, ${C.HAIR_COLOUR[o.hairColour]}`,
    eyes: C.EYES[o.eyes],
    skin: C.SKIN[o.skin],
    outfit: `${C.MARKS[o.mark]}, ${C.BUILD[o.build]}`,
    trait: C.TRAITS[o.trait].label,
  };
}

function layoutFor(panelCount, pageIndex) {
  if (panelCount <= 3) return pageIndex % 2 ? "tall-stack" : "wide-two";
  if (panelCount === 4) return "quad";
  if (panelCount === 5) return "five";
  return "six";
}

function normaliseRef(value) {
  if (!value) return null;
  const first = String(value).split(/[,/|]/)[0].trim().toLowerCase();
  return ["hero", "ally", "villain"].includes(first) ? first : null;
}

/** One page, optionally with the previous attempt's complaints attached. */
async function buildPage(order, outline, i, problems) {
  const prompt = P.breakdownPrompt(order, outline, i);
  if (problems && problems.length) {
    prompt.user += "\n\nTu intento anterior falló en esto:\n- " + problems.join("\n- ") +
      "\n\nEl campo \"scene\" va SIEMPRE en inglés y describe SOLO lo que se ve dibujado: " +
      "nunca menciones bocadillos, rótulos, carteles con texto ni palabras escritas.";
  }
  const { json } = await completeJson(prompt);
  const panels = (json.panels || []).slice(0, 6).map((x) => ({ ...x, ref: normaliseRef(x.ref) }));
  return { beat: outline.pages[i].beat, layout: layoutFor(panels.length, i), panels };
}

/** Percentage for the viewer's progress bar. Rough on purpose; it only reassures. */
function progressOf(job) {
  const base = { outline: 5, critique: 20, rewrite: 35, breakdown: 45, cover: 92, done: 100 };
  let pct = base[job.step] || 0;
  if (job.step === "breakdown" && job.data && job.data.outline) {
    const total = job.data.outline.pages.length || 1;
    const built = (job.data.pages || []).filter(Boolean).length;
    pct = 45 + Math.round((built / total) * 45);
  }
  return pct;
}

/**
 * Advances the job by one step.
 * @returns {{ job: object, done: boolean }}
 */
async function advance(token) {
  const job = await store.get(token);
  if (!job) throw new Error("no existe");
  if (job.status === "done" || job.status === "failed") return { job, done: true };

  /*
   * Same claim as the paid render, and for the same reason — this half was
   * left without one, which was an oversight and not a judgement.
   *
   * The viewer polls this while somebody waits and the cron sweeps every five
   * minutes. Two callers on the same job run the same step twice: two calls to
   * the writer, two to the editor, two covers drawn. Cheaper per collision
   * than the paid side, but the shape of the bug is identical and so is the
   * fix. The one that does not get the claim reports the current state, which
   * is what a poller wanted anyway.
   */
  if (!(await store.claim(token, LOCK_SECONDS))) return { job, done: false, busy: true };
  try {
    return await runStep(token, job);
  } finally {
    await store.release(token);
  }
}

/** One step's worth of work. Only ever called with the claim held. */
async function runStep(token, job) {
  const order = job.order;
  const band = C.ageBand(order.ageBand);
  const d = job.data || {};
  let patch = {};

  try {
    switch (job.step) {
      case "outline": {
        d.outline = (await completeJson(P.draftPrompt(order))).json;
        patch = { step: "critique", data: d };
        break;
      }

      /*
       * El editor es una PUERTA DE CALIDAD, no un requisito para existir.
       *
       * La primera versión dejaba que un fallo aquí matara el pedido entero, y
       * el 2026-08-23 pasó exactamente eso en producción: el saldo de
       * OpenRouter llegó a cero, el editor devolvió 403 y el embudo se paró en
       * seco — con el esqueleto ya escrito y pagado. Un proveedor caído no
       * puede tirar un producto que ya tiene la historia hecha.
       *
       * Así que un editor que no responde se anota y se sigue. La historia
       * queda marcada como NO JUZGADA: el validador estructural la sigue
       * mirando entera, pero nadie ha opinado sobre si es buena, y eso se ve en
       * el panel en vez de fingir que aprobó.
       */
      case "critique": {
        try {
          d.critique = (await completeJson({ ...P.criticPrompt(order, d.outline), provider: "critic" })).json;
          d.verdict = judgeCritique(d.critique);
        } catch (e) {
          d.critique = null;
          d.verdict = { needsRewrite: false, unjudged: true, why: String(e.message).slice(0, 200) };
          console.warn(`[comic] sin editor, sigo sin juzgar: ${String(e.message).slice(0, 140)}`);
        }
        patch = { step: d.verdict.needsRewrite ? "rewrite" : "breakdown", data: d };
        break;
      }

      case "rewrite": {
        d.outline = (await completeJson(P.rewritePrompt(order, d.outline, d.critique))).json;
        // Page count is a product parameter. One corrective retry lives in the
        // step itself; trimming from the middle is the graceful floor.
        const got = (d.outline.pages || []).length;
        if (got > band.pages) {
          const extra = got - band.pages;
          d.outline.pages.splice(Math.max(2, Math.floor(got / 2) - Math.floor(extra / 2)), extra);
        } else if (got < band.pages) {
          throw new Error(`el esqueleto trae ${got} páginas y el pedido pide ${band.pages}`);
        }
        patch = { step: "breakdown", data: d };
        break;
      }

      case "breakdown": {
        d.pages = d.pages || new Array(d.outline.pages.length).fill(null);
        const todo = d.pages.map((p, i) => i).filter((i) => !d.pages[i]).slice(0, PAGES_PER_CALL);
        for (const i of todo) {
          try {
            let page = await buildPage(order, d.outline, i);
            /*
             * A page whose scenes the validator rejects gets one retry with the
             * complaint attached, here and not at the end: a scene that asks for
             * text inside the drawing used to sail through the breakdown and
             * then block the whole job at the final validation, unfixably.
             */
            const cast = { ally: d.outline.ally, villain: d.outline.villain };
            const problems = pageProblems(page, order, cast);
            if (problems.length) {
              page = await buildPage(order, d.outline, i, problems);
              if (pageProblems(page, order, cast).length) throw new Error(`la página ${i + 1} sigue mal`);
            }
            d.pages[i] = page;
          } catch {
            d.pages[i] = null; // retried on the next call; failed[] stops a loop
            d.failed = (d.failed || {});
            d.failed[i] = (d.failed[i] || 0) + 1;
            if (d.failed[i] >= 3) throw new Error(`la página ${i + 1} falla tres veces`);
          }
        }
        const left = d.pages.filter((p) => !p).length;
        patch = { step: left ? "breakdown" : "cover", data: d };
        break;
      }

      case "cover": {
        const story = assemble(job, d);
        const check = validateStory(story, order);
        if (!check.ok) throw new Error(`el guion no valida: ${check.errors[0]}`);
        d.story = story;
        d.coverPrompt = S.coverPrompt({
          block: S.characterBlock(story.hero),
          scene: story.cover.scene,
          styleId: order.style,
        });
        // The image itself is drawn by the caller (api/job.js), which owns the
        // provider and the softening ladder. This step only prepares it.
        patch = { step: "done", status: "ready", data: d };
        break;
      }

      default:
        patch = { step: "done", status: "ready" };
    }
  } catch (e) {
    const attempts = (job.attempts || 0) + 1;
    if (attempts >= 4) {
      await store.update(token, { status: "failed", error: String(e.message).slice(0, 300), attempts });
      return { job: await store.get(token), done: true };
    }
    await store.update(token, { attempts, last_error: String(e.message).slice(0, 200) });
    return { job: await store.get(token), done: false };
  }

  const next = await store.update(token, { ...patch, attempts: 0, progress: progressOf({ ...job, ...patch }) });
  return { job: next, done: next.step === "done" };
}

/**
 * Builds the story in the exact shape gen-demo.js and the PDF already consume.
 *
 * THIS is where the real names come back, and it is the last thing that
 * happens before the story is stored: every model call — writer, editor,
 * breakdown, dialogue polish — is already behind us, so the names have not
 * been anywhere. What follows (the letterer, the PDF, the viewer) is all our
 * own code. See lib/names.js.
 */
function assemble(job, d) {
  const order = job.order;
  return unmask(buildStory(job, d, order), job.names);
}

function buildStory(job, d, order) {
  return {
    title: d.outline.title,
    subtitle: "Volumen 1",
    logline: d.outline.logline,
    genre: order.trope,
    style: order.style,
    language: order.lang,
    order,
    hero: heroFromOrder(order),
    cast: {
      ally: { label: d.outline.ally.label, sheet: d.outline.ally.sheet },
      villain: { label: d.outline.villain.label, sheet: d.outline.villain.sheet },
    },
    cover: {
      ref: "hero",
      scene:
        `comic book cover composition: the teenager standing in the foreground, ` +
        `the ally behind and to one side, and far back the silhouette of the antagonist; ` +
        `${C.TROPES[order.trope].world}`,
    },
    critique: d.critique
      ? { verdict: d.critique.verdict, scores: d.critique.scores, worst: d.critique.worst }
      : null,
    dialogue: d.dialogueBefore ? { before: d.dialogueBefore.score } : null,
    pages: d.pages.filter(Boolean),
  };
}

module.exports = { advance, assemble, heroFromOrder, progressOf, STEPS };
