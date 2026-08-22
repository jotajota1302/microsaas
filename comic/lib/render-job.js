/*
 * The paid render, as a second state machine.
 *
 *   dialogue -> sheets -> panels -> pdf -> deliver -> done
 *
 * The preview one (lib/preview-job.js) stops at the cover on purpose. This is
 * what runs after the webhook says somebody paid.
 *
 * MEDIDO de punta a punta el 2026-08-22, banda 16-17 (la más larga): 16
 * páginas, 90 viñetas, 94 imágenes contando las hojas de personaje y la
 * portada. Doce minutos de reloj y 0,33 $ solo de dibujo, con una mediana de
 * 20,4 s por imagen y tres a la vez. Nada de esto corre hasta el final: cada
 * llamada dibuja un lote acotado, lo guarda y dice si queda trabajo.
 *
 * Two policies worth stating, because both were decisions and not defaults:
 *
 *  - A panel that will not draw does NOT fail the comic. It is retried, and
 *    after three tries it is given up on and the page keeps its empty cell.
 *    Fourteen pages held hostage by one panel is a worse outcome than one
 *    visibly missing frame.
 *  - But a comic with more than MAX_HOLES missing panels is NOT emailed to the
 *    customer. It stops at `needs_attention` and waits for a human. Sending
 *    somebody a comic with a quarter of it blank, and calling that delivered,
 *    is the failure mode this whole file exists to avoid.
 */

const S = require("./style.js");
const P = require("./prompt-script.js");
const { completeJson } = require("./llm.js");
const { assemble } = require("./preview-job.js");
const L = require("./layout.js");
const { store } = require("./store.js");
const { blobs, keys } = require("./blobs.js");
const { drawWithLadder } = require("./images.js");
const { checkPanel } = require("./panel-check.js");
const { buildPdf } = require("./comic-pdf.js");
const { deliver } = require("./email.js");

const RENDER_STEPS = ["dialogue", "sheets", "panels", "pdf", "deliver", "done"];

/** Panels attempted per invocation. Eight at concurrency 3 is ~70 s of a 300 s budget. */
const PANELS_PER_CALL = Number(process.env.PANELS_PER_CALL || 8);
const CONCURRENCY = Number(process.env.PANEL_CONCURRENCY || 3);
/** Above this many permanently missing panels the comic is not sent out. */
const MAX_HOLES = Number(process.env.MAX_HOLES || 2);
/* Tries per panel before it is given up on. An env var so scripts/dry-run-paid.js
 * can set it to 0 and actually exercise the not-deliverable gate. */
const MAX_TRIES_PER_PANEL = Number(process.env.MAX_TRIES_PER_PANEL || 3);
/* How long a claim lasts. Longer than the slowest step (eight panels at
 * concurrency three, about 70 s) and shorter than the cron's five minutes, so
 * a function that dies mid-batch frees the job before the next sweep. */
const LOCK_SECONDS = Number(process.env.RENDER_LOCK_SECONDS || 240);

/** Bounded fan-out. The provider rate-limits above three and drops panels. */
async function pool(items, limit, worker) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    })
  );
  return out;
}

/**
 * One reference sheet per character.
 *
 * image-01 takes a single subject_reference, so a panel can lock the hero OR
 * the ally, never both — which is why panels name which one they need.
 */
function subjectsOf(story) {
  const subjects = {
    hero: { block: S.characterBlock(story.hero), lock: S.identityLock(story.hero) },
  };
  for (const [key, c] of Object.entries(story.cast || {})) {
    subjects[key] = {
      block: S.castBlock(c.label, c.sheet),
      lock: `Keep ${c.label} strictly identical to the reference image: same clothes, same colours, same build`,
    };
  }
  return subjects;
}

/** Every panel of every page, flattened, with the prompt it needs. */
function panelJobs(story, token) {
  const subjects = subjectsOf(story);
  const jobs = [];
  story.pages.forEach((page, pi) => {
    const aspects = L.panelAspects(page.layout, page.panels.length);
    page.panels.forEach((panel, qi) => {
      jobs.push({
        id: `p${pi + 1}-${qi + 1}`,
        key: keys.panel(token, pi, qi),
        aspect: aspects[qi],
        refKey: panel.ref || null,
        prompt: S.panelPrompt({
          subject: panel.ref ? subjects[panel.ref] : null,
          scene: panel.scene,
          room: panel.room,
          styleId: story.style,
        }),
      });
    });
  });
  return jobs;
}

function renderProgress(job, drawn, total) {
  const base = { dialogue: 3, sheets: 8, panels: 12, pdf: 92, deliver: 97, done: 100 };
  if (job.render_step === "panels" && total) {
    return 12 + Math.round((drawn / total) * 78);
  }
  return base[job.render_step] || 0;
}

/**
 * Pushes the paid render forward by one step.
 * @returns {{ job: object, done: boolean }}
 */
async function advanceRender(token) {
  const job = await store.get(token);
  if (!job) throw new Error("no existe");
  if (!job.paid_at) throw new Error("sin pagar");
  if (job.render_status === "done" || job.render_status === "needs_attention") {
    return { job, done: true };
  }

  /*
   * The viewer polls this while the buyer watches, and the cron sweeps every
   * five minutes. Both would happily start the same batch: two callers see the
   * same eight panels missing and both draw them. That is not a wasted query,
   * it is 0,028 EUR of images bought twice and two writers overwriting each
   * other's progress.
   *
   * Whoever does not get the claim simply reports the current state, which is
   * exactly what a poller wanted anyway.
   */
  if (!(await store.claim(token, LOCK_SECONDS))) return { job, done: false, busy: true };

  // The claim has to come back on EVERY path out, including the throws, or one
  // bad order locks itself out for LOCK_SECONDS on every sweep.
  try {
    return await runStep(token, job);
  } finally {
    await store.release(token);
  }
}

/** One step's worth of work. Only ever called with the claim held. */
async function runStep(token, job) {
  const d = job.data || {};
  const order = job.order;
  // `story` se rehace en el paso de diálogo, así que se lee de `d` en cada
  // paso en vez de capturarse una vez: capturarla arriba dejaría a los pasos
  // siguientes dibujando la versión sin pulir.
  if (!d.story) throw new Error("este pedido no tiene guion");

  const r = job.render || {};
  let patch = {};

  try {
    switch (job.render_step || "dialogue") {
      /*
       * El pulido de diálogo, que vivía en la vista previa y ahora se paga solo
       * cuando alguien paga. Medido el 2026-08-22: 0,076 $ y 7,6 minutos por
       * cómic, y se gastaba también en los que nunca compran.
       *
       * Dos cosas que no son obvias:
       *
       * 1. Trabaja sobre `d.pages`, el desglose ENMASCARADO, no sobre
       *    `d.story`. La historia ya lleva los nombres reales puestos por
       *    assemble(), y esto es una llamada a un modelo: pulir sobre la
       *    historia mandaría el nombre del menor al proveedor y desharía la
       *    corrección de privacidad de esta misma mañana.
       * 2. Lo pule OpenRouter, y eso se probó al revés antes de decidirlo.
       *    Pasarlo a MiniMax deja el pulido en 0,008 $ en vez de 0,076 $, y
       *    MiniMax pule de verdad — cambia réplicas, y algunas a mejor. Pero
       *    medido el 2026-08-22 sobre este mismo cómic, el juez daba 2 antes y
       *    2 después: con MiniMax el pase no mueve la nota, y con GPT-5 mini
       *    la movía de 2 a 3.
       *
       *    Lo que hizo barato el pulido fue MOVERLO aquí, no cambiar de
       *    proveedor: en la vista previa costaba 1,52 $ por venta (se pagaba
       *    veinte veces, una por cada mirón), y aquí cuesta 0,076 $. Cambiar
       *    además de proveedor ahorra 6,8 céntimos más por venta y se lleva por
       *    delante el único punto de calidad que teníamos en el diálogo.
       */
      case "dialogue": {
        const pages = (d.pages || []).filter(Boolean);
        if (!pages.length) { patch = { render_step: "sheets" }; break; }

        d.dialogueBefore = (await completeJson({
          ...P.dialogueCriticPrompt(order, pages), provider: "critic",
        })).json;

        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          if (!page.panels.some((x) => (x.bubbles || []).length)) continue;
          try {
            const { json } = await completeJson({
              ...P.dialoguePolishPrompt(order, page, i, pages.length, d.dialogueBefore),
              provider: "critic",
            });
            const byIndex = new Map((json.panels || []).map((x) => [Number(x.index), x.bubbles || []]));
            const sameShape = page.panels.every((panel, q) =>
              (panel.bubbles || []).length === ((byIndex.get(q) || []).length));
            if (!sameShape) continue;
            page.panels.forEach((panel, q) => {
              const fresh = byIndex.get(q) || [];
              (panel.bubbles || []).forEach((b, bi) => {
                const text = fresh[bi] && String(fresh[bi].text || "").trim();
                if (text) b.text = text;
              });
            });
          } catch { /* una página que no pule se queda con sus réplicas */ }
        }

        // La historia se rehace con las réplicas nuevas y se le vuelven a poner
        // los nombres reales. Es lo que leerá el PDF y lo que verá el visor.
        d.story = assemble({ order, names: job.names }, d);
        patch = { render_step: "sheets", data: d };
        break;
      }

      /*
       * The character sheets are the reference every panel is drawn against.
       * They are two or three images, and they gate everything else, so they
       * get their own step rather than being folded into the first batch.
       */
      case "sheets": {
        const subjects = subjectsOf(d.story);
        const todo = Object.keys(subjects);
        const already = await blobs.which(todo.map((k) => keys.sheet(token, k)));
        await pool(todo.filter((k) => !already.has(keys.sheet(token, k))), 2, async (key) => {
          try {
            const { buffer } = await drawWithLadder({
              prompt: S.sheetPrompt(subjects[key].block, d.story.style),
              aspect: "3:2",
            });
            await blobs.put(keys.sheet(token, key), buffer);
          } catch (e) {
            /*
             * A missing sheet is not fatal: the panels that wanted it are
             * drawn without a reference, so the character drifts between
             * panels instead of the comic not existing. Recorded so the drift
             * is a known cause and not a mystery.
             */
            r.sheetFailures = [...(r.sheetFailures || []), `${key}: ${String(e.message).slice(0, 80)}`];
          }
        });
        patch = { render_step: "panels", render: r };
        break;
      }

      case "panels": {
        const all = panelJobs(d.story, token);
        const done = await blobs.which(all.map((j) => j.key));
        const tries = r.tries || {};
        const todo = all
          .filter((j) => !done.has(j.key))
          .filter((j) => (tries[j.id] || 0) < MAX_TRIES_PER_PANEL)
          .slice(0, PANELS_PER_CALL);

        if (todo.length) {
          // Loaded once per batch, not once per panel: the same two or three
          // buffers were being fetched eight times a call.
          const refs = {};
          for (const key of new Set(todo.map((j) => j.refKey).filter(Boolean))) {
            refs[key] = await blobs.get(keys.sheet(token, key));
          }

          r.checks = r.checks || {};
          await pool(todo, CONCURRENCY, async (j) => {
            const attempt = (tries[j.id] = (tries[j.id] || 0) + 1);
            try {
              const { buffer } = await drawWithLadder({
                prompt: j.prompt,
                ref: j.refKey ? refs[j.refKey] : null,
                aspect: j.aspect,
              });

              /*
               * Nothing the model draws is stored unlooked at. See
               * lib/panel-check.js: a colour accident on good line art is
               * desaturated for free, but a panel that came back as a
               * photograph is not stored at all — it is left for the next
               * batch to draw again.
               */
              const checked = await checkPanel(buffer, d.story.style);
              if (checked.redraw) {
                r.checks[j.id] = `${checked.verdict} x${attempt}`;
                if (attempt < MAX_TRIES_PER_PANEL) return; // no blob: it gets another go
                // Out of tries. A photograph is a worse page than a hole, so
                // the hole is what the customer gets, and the gate in `pdf`
                // decides whether that is still deliverable.
                r.checks[j.id] = `${checked.verdict}, abandonada`;
                return;
              }
              if (checked.fixed) r.checks[j.id] = checked.verdict;
              await blobs.put(j.key, checked.buffer);
            } catch (e) {
              r.lastPanelError = `${j.id}: ${String(e.message).slice(0, 120)}`;
            }
          });
        }

        const after = await blobs.which(all.map((j) => j.key));
        // Panels nobody is going to draw any more: out of tries and still absent.
        const abandoned = all.filter((j) => !after.has(j.key) && (tries[j.id] || 0) >= MAX_TRIES_PER_PANEL);
        const left = all.filter((j) => !after.has(j.key) && (tries[j.id] || 0) < MAX_TRIES_PER_PANEL);

        r.tries = tries;
        r.drawn = after.size;
        r.total = all.length;
        r.holes = abandoned.map((j) => j.id);
        patch = {
          render: r,
          render_step: left.length ? "panels" : "pdf",
          render_progress: renderProgress({ render_step: "panels" }, after.size, all.length),
        };
        break;
      }

      case "pdf": {
        const all = panelJobs(d.story, token);
        const images = new Map();
        const cover = await blobs.get(keys.cover(token));
        if (cover) images.set(keys.cover(token), cover);
        for (const j of all) {
          const buf = await blobs.get(j.key);
          if (buf) images.set(j.key, buf);
        }

        const { bytes, missing } = await buildPdf({ story: d.story, images, token });
        await blobs.put(keys.pdf(token), bytes);

        r.pdfBytes = bytes.length;
        r.missing = missing;

        /*
         * The gate. Too many holes and this stops here: the customer is not
         * emailed a comic we already know is broken, and we get told instead.
         * Refunding one order is cheap; a review saying the pages were blank
         * is not.
         */
        const holes = missing.filter((k) => !k.endsWith("cover.jpg")).length;
        if (holes > MAX_HOLES) {
          patch = {
            render: r,
            render_step: "deliver",
            render_status: "needs_attention",
            render_error: `${holes} viñetas sin dibujar`,
          };
          console.error(`[comic] ${token} finished with ${holes} holes — not delivered`);
          break;
        }
        patch = { render: r, render_step: "deliver", render_progress: 92 };
        break;
      }

      case "deliver": {
        // needs_attention reached this step only to stop cleanly; it does not
        // email anybody.
        if (job.render_status === "needs_attention") return { job, done: true };
        const to = [job.email, job.paid_email].filter(Boolean);
        const sent = await deliver({ job, story: d.story, to });
        patch = {
          render_step: "done",
          render_status: "done",
          render_progress: 100,
          delivered_at: new Date().toISOString(),
          render: { ...r, email: sent },
        };
        break;
      }

      default:
        patch = { render_step: "done", render_status: "done", render_progress: 100 };
    }
  } catch (e) {
    const attempts = (job.render_attempts || 0) + 1;
    if (attempts >= 5) {
      await store.update(token, {
        render_status: "needs_attention",
        render_error: String(e.message).slice(0, 300),
        render_attempts: attempts,
      });
      console.error(`[comic] render of ${token} gave up: ${e.message}`);
      return { job: await store.get(token), done: true };
    }
    await store.update(token, { render_attempts: attempts, render_last_error: String(e.message).slice(0, 200) });
    return { job: await store.get(token), done: false };
  }

  const next = await store.update(token, {
    render_attempts: 0,
    render_status: patch.render_status || "running",
    ...patch,
  });
  return { job: next, done: next.render_step === "done" || next.render_status === "needs_attention" };
}

module.exports = { advanceRender, panelJobs, subjectsOf, RENDER_STEPS, PANELS_PER_CALL, MAX_HOLES };
