/*
 * The script pipeline, end to end:
 *
 *   1. draft      - the model writes the skeleton (14 page beats)
 *   2. critique   - a SECOND call judges it against a written rubric
 *   3. rewrite    - the writer fixes what the editor found (only if needed)
 *   4. breakdown  - one call per page turns beats into panels and dialogue
 *   5. validate   - code decides whether an illustrator ever sees it
 *
 * Steps 1-3 are where the money is: they cost about two cents together and they
 * are the difference between a comic a teenager reads twice and one they put
 * down. Step 5 costs nothing and is the only step that can say no.
 *
 * Usage:
 *   node scripts/gen-script.js --order orders/demo.json
 *   node scripts/gen-script.js --order orders/demo.json --out stories/nuevo.json
 *   node scripts/gen-script.js --order orders/demo.json --no-critic   # for A/B
 */

const fs = require("fs");
const path = require("path");
const C = require("../lib/catalog.js");
const P = require("../lib/prompt-script.js");
const { completeJson, PROVIDER, CRITIC_PROVIDER } = require("../lib/llm.js");
const { validateStory, judgeCritique } = require("../lib/validate-story.js");

const ROOT = path.join(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1] : fallback;
}

/** Turns the closed-list order into the frozen English description of the hero. */
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

/*
 * The layout follows the panel count, and for a three-panel page it alternates
 * so consecutive pages do not look identical. The model is not asked: when it
 * was, it named a layout and then wrote a different number of panels on eleven
 * pages out of fourteen.
 */
function layoutFor(panelCount, pageIndex) {
  if (panelCount <= 3) return pageIndex % 2 ? "tall-stack" : "wide-two";
  if (panelCount === 4) return "quad";
  if (panelCount === 5) return "five";
  return "six";
}

/* Models answer "hero,ally" when two people are in shot. Only one reference can
   be sent, so we keep the first valid one rather than reject the panel. */
function normaliseRef(value) {
  if (!value) return null;
  const first = String(value).split(/[,/|]/)[0].trim().toLowerCase();
  return ["hero", "ally", "villain"].includes(first) ? first : null;
}

async function pool(items, limit, worker) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await worker(items[i], i); }
  }));
  return out;
}

async function main() {
  const orderFile = arg("order", "orders/demo.json");
  const outFile = arg("out", null);
  const skipCritic = process.argv.includes("--no-critic");
  const order = JSON.parse(fs.readFileSync(path.join(ROOT, orderFile), "utf8"));
  const band = C.ageBand(order.ageBand);

  console.log(`\nproveedor de texto: ${PROVIDER}`);
  console.log(`pedido: ${order.name}, ${order.age} años · ${C.TROPES[order.trope].label} · ${C.STYLES[order.style].label}`);
  console.log(`rasgo: ${C.TRAITS[order.trait].label} · ${band.pages} páginas\n`);

  const timings = {};
  const t = async (label, fn) => {
    const t0 = Date.now();
    const r = await fn();
    timings[label] = +((Date.now() - t0) / 1000).toFixed(1);
    return r;
  };

  // 1. draft -------------------------------------------------------------------
  process.stdout.write("1/5 borrador del esqueleto... ");
  let outline = await t("borrador", async () => (await completeJson(P.draftPrompt(order))).json);
  console.log(`${timings.borrador}s · "${outline.title}"`);

  // 2. critique ----------------------------------------------------------------
  let critique = null;
  let verdict = null;
  if (!skipCritic) {
    process.stdout.write("2/5 el editor lo lee...      ");
    critique = await t("critico", async () => (await completeJson({ ...P.criticPrompt(order, outline), provider: "critic" })).json);
    verdict = judgeCritique(critique);
    const s = critique.scores || {};
    console.log(`${timings.critico}s · ${critique.verdict} · total ${verdict.total}/30`);
    Object.entries(s).forEach(([k, v]) => console.log(`      ${String(v)}/5  ${k}`));
    if (critique.worst) console.log(`      lo peor: ${critique.worst}`);
    (critique.issues || []).slice(0, 6).forEach((i) =>
      console.log(`      p${i.page}: ${i.problem}`));

    // 3. rewrite ---------------------------------------------------------------
    if (verdict.needsRewrite) {
      process.stdout.write("3/5 el guionista reescribe... ");
      outline = await t("reescritura", async () =>
        (await completeJson(P.rewritePrompt(order, outline, critique))).json);
      console.log(`${timings.reescritura}s`);
      // One more read, to see whether the rewrite actually helped. We do not
      // loop: a third pass costs more than a human glance and, measured across
      // other projects, mostly shuffles the same problems around.
      process.stdout.write("    el editor lo relee...   ");
      const second = await t("critico2", async () =>
        (await completeJson({ ...P.criticPrompt(order, outline), provider: "critic" })).json);
      const v2 = judgeCritique(second);
      console.log(`${timings.critico2}s · ${second.verdict} · total ${v2.total}/30 (antes ${verdict.total})`);
      critique = second;
      verdict = v2;
    } else {
      console.log("3/5 no hace falta reescribir");
    }
  } else {
    console.log("2-3/5 sin crítico (--no-critic)");
  }

  /*
   * Page count is a product parameter, not a suggestion: it decides the format
   * and the price. The rewrite came back with fifteen pages for a fourteen-page
   * order (2026-08-22), and the mismatch was only caught after paying for
   * fifteen breakdown calls. One corrective retry, then give up loudly.
   */
  if ((outline.pages || []).length !== band.pages) {
    console.log(`    el esqueleto trae ${(outline.pages || []).length} páginas y el pedido pide ${band.pages}; corrigiendo`);
    const fix = P.rewritePrompt(order, outline, {
      issues: [{ page: 0, problem: `el esqueleto tiene ${(outline.pages || []).length} páginas`,
                 fix: `devuélvelo con EXACTAMENTE ${band.pages} páginas, ni una más ni una menos` }],
      worst: `el número de páginas no es ${band.pages}`,
    });
    outline = (await completeJson(fix)).json;
    /*
     * If it still will not count (it came back with 15 for a 14-page order even
     * after being told), do not fail the whole order over it. Drop pages from
     * the middle, never the opening or the ending: the first two set up who the
     * hero is and the last two are the resolution, and losing either breaks the
     * story. A middle beat is the one thing a comic can survive without.
     */
    const got = (outline.pages || []).length;
    if (got > band.pages) {
      const extra = got - band.pages;
      const from = Math.max(2, Math.floor(got / 2) - Math.floor(extra / 2));
      outline.pages.splice(from, extra);
      console.log(`    el modelo insiste en ${got}; quito ${extra} página(s) del medio`);
    } else if (got < band.pages) {
      throw new Error(`el esqueleto tiene ${got} páginas y el pedido pide ${band.pages}: faltan beats, no se puede rellenar`);
    }
  }

  // 4. breakdown ---------------------------------------------------------------
  const pageCount = (outline.pages || []).length;
  console.log(`4/5 desglose de ${pageCount} páginas en viñetas...`);
  const built = await t("desglose", () => pool(outline.pages, 3, async (_, i) => {
    try {
      const { json } = await completeJson(P.breakdownPrompt(order, outline, i));
      const panels = (json.panels || []).slice(0, 6).map((x) => ({ ...x, ref: normaliseRef(x.ref) }));
      const layout = layoutFor(panels.length, i);
      process.stdout.write(`      p${i + 1} ${layout} (${panels.length})\n`);
      return { beat: outline.pages[i].beat, layout, panels };
    } catch (e) {
      /*
       * A page that fails outright is a missing page, and the order is sold by
       * page count — 2026-08-22 one broken JSON left a 14-page order with 13.
       * Retry it once before giving up.
       */
      console.log(`      p${i + 1} falla (${e.message.slice(0, 50)}), reintentando`);
      try {
        const { json } = await completeJson(P.breakdownPrompt(order, outline, i));
        const panels = (json.panels || []).slice(0, 6).map((x) => ({ ...x, ref: normaliseRef(x.ref) }));
        console.log(`      p${i + 1} recuperada (${panels.length})`);
        return { beat: outline.pages[i].beat, layout: layoutFor(panels.length, i), panels };
      } catch (e2) {
        console.log(`      p${i + 1} FALLA definitiva: ${e2.message.slice(0, 60)}`);
        return null;
      }
    }
  }));
  console.log(`    ${timings.desglose}s`);

    /*
   * Retry any page the validator complains about, telling the model exactly
   * what it did wrong. Two failures showed up in real runs and both are
   * per-page fixable: scenes written in Spanish (they draw worse, because that
   * string goes straight to the illustrator) and scenes that ask for text
   * inside the drawing (the letterer puts the words on, not the model).
   *
   * Reusing the validator instead of a second ad-hoc check means the retry can
   * never disagree with the gate it has to pass.
   */
  const castForCheck = { ally: outline.ally, villain: outline.villain };
  const pageProblems = (page) => {
    if (!page) return [];
    const r = validateStory({ title: "x", hero: { name: "x" }, cover: { scene: "x" },
      cast: castForCheck, pages: [page] }, order);
    return r.errors.concat(r.warnings)
      .filter((m) => /escena/.test(m))
      .map((m) => m.replace(/^página 1, /, ""));
  };

  const retryable = built
    .map((page, i) => ({ page, i, problems: pageProblems(page) }))
    .filter((x) => x.problems.length);

  if (retryable.length) {
    console.log(`    ${retryable.length} páginas con problemas de escena, reintentando`);
    await t("reintentos", () => pool(retryable, 3, async ({ i, problems }) => {
      const prompt = P.breakdownPrompt(order, outline, i);
      prompt.user += "\n\nTu intento anterior falló en esto:\n- " + problems.join("\n- ") +
        "\n\nEl campo \"scene\" va SIEMPRE en inglés y describe SOLO lo que se ve dibujado: " +
        "nunca menciones bocadillos, rótulos, carteles con texto ni palabras escritas. " +
        "Los bocadillos van en español y los pone el maquetador encima del dibujo.";
      try {
        const { json } = await completeJson(prompt);
        const panels = (json.panels || []).slice(0, 6).map((x) => ({ ...x, ref: normaliseRef(x.ref) }));
        const fixed = { beat: outline.pages[i].beat, layout: layoutFor(panels.length, i), panels };
        const left = pageProblems(fixed);
        if (left.length) { console.log(`      p${i + 1} sigue mal: ${left[0]}`); return; }
        built[i] = fixed;
        console.log(`      p${i + 1} corregida`);
      } catch (e) {
        console.log(`      p${i + 1} el reintento falla: ${e.message.slice(0, 60)}`);
      }
    }));
  }

  // 4b. dialogue --------------------------------------------------------------
  /*
   * Dialogue scored 2/5 with two providers and two critics, and the outline
   * critic could not fix it: it never sees a single line of dialogue, because
   * dialogue is written later, in the breakdown. So it gets its own pass, on
   * the finished bubbles, measured before and after.
   *
   * The pass may only change words. If a page comes back with a different
   * number of bubbles, or different speakers, that page keeps its original
   * dialogue: a rewrite that reshapes the page is a rewrite we cannot trust.
   */
  const pagesNow = built.filter(Boolean);
  let dialogueBefore = null;
  let dialogueAfter = null;
  let story_dialogueFixed = null;
  if (!skipCritic && pagesNow.length) {
    process.stdout.write("4b/5 diálogo, nota antes...  ");
    dialogueBefore = await t("dialogo_antes", async () =>
      (await completeJson({ ...P.dialogueCriticPrompt(order, pagesNow), provider: "critic" })).json);
    console.log(`${dialogueBefore.score}/5`);
    (dialogueBefore.worst_lines || []).slice(0, 3).forEach((l) =>
      console.log(`      «${l.line}» — ${l.why}`));

    console.log("    puliendo réplicas página a página");
    let polished = 0;
    let rejected = 0;
    await t("dialogo_pulido", () => pool(pagesNow, 3, async (page, i) => {
      const withText = page.panels.some((x) => (x.bubbles || []).length);
      if (!withText) return;
      try {
        const { json } = await completeJson({
          ...P.dialoguePolishPrompt(order, page, i, pagesNow.length, dialogueBefore),
          // Dialogue is the product here, and it is barely any text: it gets the
          // good model. Bulk writing stays on the cheap one. Measured 2026-08-22:
          // the cheap model replaced every flagged line and a strict judge still
          // scored the replacements lower.
          provider: "critic",
        });
        const byIndex = new Map((json.panels || []).map((x) => [Number(x.index), x.bubbles || []]));
        // Shape check: same bubble count per panel, or we keep the original.
        const ok = page.panels.every((panel, q) => {
          const want = (panel.bubbles || []).length;
          const got = byIndex.has(q) ? byIndex.get(q).length : 0;
          return want === got;
        });
        if (!ok) { rejected++; return; }
        page.panels.forEach((panel, q) => {
          const fresh = byIndex.get(q) || [];
          (panel.bubbles || []).forEach((b, bi) => {
            const text = fresh[bi] && String(fresh[bi].text || "").trim();
            if (text) b.text = text;
          });
        });
        polished++;
      } catch (e) {
        rejected++;
      }
    }));
    console.log(`    ${polished} páginas pulidas, ${rejected} descartadas por cambiar de forma`);

    process.stdout.write("    nota después...          ");
    dialogueAfter = await t("dialogo_despues", async () =>
      (await completeJson({ ...P.dialogueCriticPrompt(order, pagesNow), provider: "critic" })).json);
    /*
     * A 0-5 integer cannot show that eight lines got better, so measure the
     * concrete thing as well: are the lines the editor named still in there?
     * That is a yes/no per line and it cannot hide behind a rounded score.
     */
    const allText = pagesNow.flatMap((pg) => (pg.panels || [])
      .flatMap((x) => (x.bubbles || []).map((b) => b.text)));
    const flagged = (dialogueBefore.worst_lines || []).map((l) => String(l.line || "").trim());
    const survivors = flagged.filter((line) => line && allText.some((t) => t.trim() === line));
    if (flagged.length) {
      console.log(`\n    réplicas señaladas: ${flagged.length} · siguen tal cual: ${survivors.length}`);
      survivors.forEach((l) => console.log(`      sigue: «${l}»`));
    }
    story_dialogueFixed = flagged.length - survivors.length;
    const delta = (dialogueAfter.score || 0) - (dialogueBefore.score || 0);
    console.log(`${dialogueAfter.score}/5 (${delta >= 0 ? "+" : ""}${delta})`);
    if (dialogueAfter.note) console.log(`      ${dialogueAfter.note}`);
  }

  // Assemble in the exact shape gen-demo.js already consumes.
  const hero = heroFromOrder(order);
  const story = {
    title: outline.title,
    subtitle: "Volumen 1",
    logline: outline.logline,
    genre: order.trope,
    style: order.style,
    language: "es",
    order,
    hero,
    cast: {
      ally: { label: outline.ally.label, sheet: outline.ally.sheet },
      villain: { label: outline.villain.label, sheet: outline.villain.sheet },
    },
    cover: {
      ref: "hero",
      scene:
        `comic book cover composition: the teenager standing in the foreground, ` +
        `the ally behind and to one side, and far back the silhouette of ${outline.villain.label}; ` +
        `${C.TROPES[order.trope].world}`,
    },
    critique: critique ? { verdict: critique.verdict, scores: critique.scores, worst: critique.worst } : null,
    dialogueFixed: story_dialogueFixed,
    dialogue: dialogueAfter ? { before: dialogueBefore.score, after: dialogueAfter.score, note: dialogueAfter.note } : null,
    pages: built.filter(Boolean),
  };

  // 5. validate ----------------------------------------------------------------
  console.log("5/5 validador");
  const check = validateStory(story, order);
  console.log(`    ${JSON.stringify(check.stats)}`);
  check.warnings.forEach((w) => console.log(`    aviso   ${w}`));
  check.errors.forEach((e) => console.log(`    ERROR   ${e}`));

  /*
   * The validator says whether the comic is drawable. It cannot say whether it
   * is good — that is the critic's job, and the first version of this script
   * printed a failing dialogue score and then wrote the file as if nothing had
   * happened. A story the editor still fails goes out flagged, the way every
   * paid order in cuentos gets a human glance before it ships.
   */
  if (dialogueAfter && (dialogueAfter.score || 0) < 3) {
    story.needsHumanReview = (story.needsHumanReview || []).concat(
      `el diálogo sigue en ${dialogueAfter.score}/5`);
  }
  if (verdict && verdict.fatal.length) {
    story.needsHumanReview = (story.needsHumanReview || []).concat(verdict.fatal);
    console.log(`    ⚠ el editor sigue suspendiendo: ${verdict.fatal.join("; ")}`);
  }

  const dest = path.join(ROOT, outFile || `stories/${slug(outline.title)}.json`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(story, null, 2));

  const total = Object.values(timings).reduce((a, b) => a + b, 0);
  // Three outcomes, not two: drawable and good, drawable but the editor still
  // fails it, and not drawable. The middle one is a real state and hiding it
  // behind a green tick is how a bad script reaches a paying customer.
  const flag = !check.ok
    ? `❌ ${check.errors.length} errores`
    : story.needsHumanReview
      ? "⚠ válido para dibujar, pero a revisión humana"
      : "✅ válido";
  console.log(`\n${flag} · ${total.toFixed(0)}s en total`);
  console.log(`escrito en ${path.relative(ROOT, dest)}\n`);
  process.exitCode = check.ok ? 0 : 1;
}

function slug(text) {
  return String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "historia";
}

main().catch((e) => { console.error("\n" + e.message); process.exit(1); });
