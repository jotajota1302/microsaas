/*
 * The only door between the model and the illustrator. Nothing gets drawn that
 * has not passed through here.
 *
 * The split matters: the critic in prompt-script.js judges whether the story is
 * GOOD, which is a matter of taste and needs a model. This file checks whether
 * it is USABLE, which is a matter of fact and must never need one. A missing
 * layout, a bubble with forty words, a `ref` naming a character that does not
 * exist — none of that is an opinion, and none of it should cost a token.
 *
 * Also a CLI:  node lib/validate-story.js stories/kia.json
 */

const C = require("./catalog.js");

/*
 * Layout is DERIVED from how many panels the page has, never chosen by the
 * model. Measured 2026-08-22: asked to pick a layout and fill it, the model
 * picked "wide-two" and then wrote five panels, on eleven of fourteen pages.
 * Counting is a job for code.
 */
const LAYOUT_PANELS = { "wide-two": 3, "tall-stack": 3, quad: 4, five: 5, six: 6 };
const BUBBLE_TYPES = new Set(["speech", "thought", "shout", "caption"]);
const REFS = new Set(["hero", "ally", "villain", null]);
const MAX_BUBBLES_PER_PANEL = 2;
const MIN_MUTE_RATIO = 0.25; // at least a quarter of panels carry no text

/** Lowercase, unaccented, punctuation-free — so "Pokémon" and "pokemon" both hit. */
function normalise(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blocklisted(text) {
  const hay = ` ${normalise(text)} `;
  return C.BLOCKLIST.filter((word) => hay.includes(` ${normalise(word)} `));
}

/**
 * @returns {{ ok: boolean, errors: string[], warnings: string[], stats: object }}
 * Errors block the illustrator. Warnings are for the human reviewing the order.
 */
function validateStory(story, order) {
  const errors = [];
  const warnings = [];
  const at = (p, q) => (q == null ? `página ${p + 1}` : `página ${p + 1}, viñeta ${q + 1}`);

  if (!story || typeof story !== "object") {
    return { ok: false, errors: ["la historia no es un objeto"], warnings: [], stats: {} };
  }

  // --- shell ------------------------------------------------------------------
  if (!story.title || String(story.title).trim().length < 3) errors.push("falta el título");
  if (String(story.title || "").length > 60) errors.push("el título pasa de 60 caracteres");
  if (!story.hero || !story.hero.name) errors.push("falta el protagonista");
  if (!story.cast || !story.cast.villain || !story.cast.ally) {
    errors.push("faltan el antagonista o el aliado en cast");
  }
  if (!story.cover || !story.cover.scene) errors.push("falta la escena de portada");

  const pages = Array.isArray(story.pages) ? story.pages : [];
  const expected = order ? C.ageBand(order.ageBand).pages : pages.length;
  if (!pages.length) errors.push("la historia no tiene páginas");
  else if (order && pages.length !== expected) {
    errors.push(`tiene ${pages.length} páginas y el pedido pide ${expected}`);
  }

  // --- style and options are ours, not the model's -----------------------------
  if (order) {
    if (!C.STYLES[order.style]) errors.push(`estilo desconocido: ${order.style}`);
    if (!C.TROPES[order.trope]) errors.push(`mundo desconocido: ${order.trope}`);
    if (!C.TRAITS[order.trait]) errors.push(`rasgo desconocido: ${order.trait}`);
    if (!C.TONES[order.tone]) errors.push(`tono desconocido: ${order.tone}`);
  }

  // --- pages and panels --------------------------------------------------------
  let panelCount = 0;
  let muteCount = 0;
  let bubbleCount = 0;
  let refCount = { hero: 0, ally: 0, villain: 0, none: 0 };
  const words = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;
  const maxWords = order ? C.ageBand(order.ageBand).words[1] : 22;

  // Every name that must never reach the image provider inside a scene.
  const personNames = [
    order && order.name,
    order && order.sidekick && order.sidekick.name,
    story.cast && story.cast.ally && story.cast.ally.label,
    story.cast && story.cast.villain && story.cast.villain.label,
  ]
    .filter(Boolean)
    .flatMap((n) => String(n).split(/\s+/))
    .filter((n) => n.length > 2)
    .map((n) => n.replace(/[^\p{L}]/gu, ""));

  pages.forEach((page, p) => {
    const need = LAYOUT_PANELS[page.layout];
    const panels = Array.isArray(page.panels) ? page.panels : [];
    if (!need) { errors.push(`${at(p)}: layout desconocido "${page.layout}"`); return; }
    if (panels.length !== need) {
      errors.push(`${at(p)}: layout "${page.layout}" pide ${need} viñetas y tiene ${panels.length}`);
    }

    panels.forEach((panel, q) => {
      panelCount++;
      const ref = panel.ref === undefined ? null : panel.ref;
      if (!REFS.has(ref)) errors.push(`${at(p, q)}: ref desconocido "${panel.ref}"`);
      refCount[ref || "none"]++;

      if (!panel.scene || words(panel.scene) < 4) {
        errors.push(`${at(p, q)}: la escena está vacía o es demasiado corta`);
      }
      // The model writes scenes in English for the illustrator; a Spanish scene
      // means it lost the thread, and the drawing will be worse for it.
      if (panel.scene && /\b(el|la|los|las|un|una|está|que|con)\b/i.test(panel.scene)) {
        warnings.push(`${at(p, q)}: la escena parece estar en español y debería ir en inglés`);
      }
      if (panel.scene && /speech bubble|text|lettering|caption/i.test(panel.scene)) {
        errors.push(`${at(p, q)}: la escena pide texto dentro del dibujo`);
      }
      // Scenes were not checked at first, and the model drew "two mugs of
      // ColaCao" into a panel: a real trademark inside a product we sell.
      const sceneHits = panel.scene ? blocklisted(panel.scene) : [];
      if (sceneHits.length) errors.push(`${at(p, q)}: la escena nombra "${sceneHits[0]}"`);

      /*
       * No real names in a scene. Two reasons, and the first one is not
       * negotiable:
       *
       *  1. PRIVACY. The scene string is what we send to the image provider.
       *     ../CLAUDE.md forbids sending a child's real name to a model without
       *     a DPA in the EU, and the breakdown was putting it in every panel.
       *  2. It also appears to trip the content filter: on 2026-08-22 MiniMax
       *     refused 19 of 83 images, and the named-minor scenes were almost all
       *     of them — including entirely harmless ones ("walking alone in the
       *     grey morning", "lying on the couch with a phone").
       *
       * The illustrator does not need the name: the character block already
       * describes what the person looks like.
       */
      if (panel.scene) {
        const named = personNames.filter((n) => new RegExp(`\\b${n}\\b`, "i").test(panel.scene));
        if (named.length) {
          errors.push(`${at(p, q)}: la escena lleva el nombre "${named[0]}" y ningún nombre puede viajar al modelo`);
        }
      }

      const bubbles = Array.isArray(panel.bubbles) ? panel.bubbles : [];
      if (!bubbles.length) muteCount++;
      if (bubbles.length > MAX_BUBBLES_PER_PANEL) {
        errors.push(`${at(p, q)}: ${bubbles.length} bocadillos, el máximo es ${MAX_BUBBLES_PER_PANEL}`);
      }
      bubbles.forEach((b, bi) => {
        bubbleCount++;
        if (!BUBBLE_TYPES.has(b.type)) errors.push(`${at(p, q)}: tipo de bocadillo desconocido "${b.type}"`);
        if (!b.text || !String(b.text).trim()) errors.push(`${at(p, q)}: bocadillo ${bi + 1} vacío`);
        else if (words(b.text) > maxWords) {
          errors.push(`${at(p, q)}: bocadillo de ${words(b.text)} palabras, el máximo es ${maxWords}`);
        }
        const hits = blocklisted(`${b.text || ""} ${b.who || ""}`);
        if (hits.length) errors.push(`${at(p, q)}: palabra prohibida "${hits[0]}"`);
      });
    });
  });

  // --- the things that make it a story, not a slideshow ------------------------
  if (panelCount && muteCount / panelCount < MIN_MUTE_RATIO) {
    warnings.push(
      `solo ${muteCount} de ${panelCount} viñetas van sin texto; un cómic necesita respirar`
    );
  }
  if (refCount.villain === 0) errors.push("el antagonista no aparece en ninguna viñeta");
  if (refCount.ally === 0) errors.push("el aliado no aparece en ninguna viñeta");
  if (refCount.ally === 1) warnings.push("el aliado solo aparece en una viñeta");
  if (refCount.hero < panelCount * 0.3) {
    warnings.push(`el protagonista sale en ${refCount.hero} de ${panelCount} viñetas: parece poco`);
  }

  // The hero has to be there at the end. A resolution he is not in is not his.
  const last = pages[pages.length - 1];
  if (last && Array.isArray(last.panels) && !last.panels.some((x) => x.ref === "hero")) {
    errors.push("el protagonista no aparece en la última página");
  }

  // --- free text ---------------------------------------------------------------
  const hits = blocklisted(`${story.title || ""} ${story.logline || ""}`);
  if (hits.length) errors.push(`título o logline con palabra prohibida: "${hits[0]}"`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { pages: pages.length, panels: panelCount, bubbles: bubbleCount, mute: muteCount, refs: refCount },
  };
}

/**
 * The critic's numbers, judged in code. The model gives scores; the threshold is
 * ours, so a generous model cannot wave a broken story through.
 */
function judgeCritique(critique) {
  const s = (critique && critique.scores) || {};
  const fatal = [];
  if ((s.resuelve_el_rasgo ?? 0) < 4) {
    fatal.push("el conflicto no lo resuelve el rasgo del protagonista");
  }
  if ((s.fracaso_propio ?? 0) < 3) fatal.push("no fracasa por su culpa antes de ganar");
  // Dialogue is NOT judged here: the outline has none. It is gated separately,
  // on the finished bubbles, in gen-script.js.
  if ((s.causalidad ?? 5) < 3) fatal.push("hay cosas que pasan porque el guion las necesita");
  const total = Object.values(s).reduce((a, b) => a + (Number(b) || 0), 0);
  return { needsRewrite: fatal.length > 0 || critique.verdict !== "aprobado", fatal, total };
}

/**
 * Everything wrong with ONE page's scenes, phrased so it can be handed straight
 * back to the model.
 *
 * Shared on purpose: the batch script had this check and the serverless job did
 * not, so a scene asking for text inside the drawing was retried by one and
 * blocked the other for good. Two copies of a rule are one rule and one bug.
 */
function pageProblems(page, order, cast) {
  if (!page) return [];
  const probe = {
    title: "x", hero: { name: "x" }, cover: { scene: "x" },
    cast: cast || { ally: {}, villain: {} },
    pages: [page],
  };
  /*
   * The order matters here, and forgetting it was a real bug: without it the
   * probe has no list of names, so the privacy check finds nothing and a
   * sidekick's name sailed through every per-page retry to die at the final
   * validation. A checker that cannot see what the gate sees is not a checker.
   */
  const r = validateStory(probe, order ? { ...order, ageBand: order.ageBand } : null);

  /*
   * Qué quejas puede arreglar volver a pedir ESTA página, que es lo único que
   * hace quien llama.
   *
   * La regla es la de las que APUNTAN A UNA VIÑETA CONCRETA. No es una lista de
   * palabras y no es «los errores»: sobre una página suelta el validador emite
   * quejas espurias («falta el título», «tiene 1 páginas y el pedido pide 12»,
   * «el antagonista no aparece») que son ciertas de una historia de una página
   * y no significan nada aquí. Rehacer esta página no arregla ninguna. Lo que
   * sí arregla es lo que señala una de sus viñetas.
   *
   * Se llega a esto tras dos intentos peores, los dos por filtrar por palabra:
   *
   *   1. /escena/ — tiraba todo lo demás. El 2026-08-23 un cómic entero murió
   *      en producción por una réplica de 17 palabras con el tope en 16: esta
   *      función la había visto y la había descartado, así que reapareció en la
   *      validación final, donde ya no hay nada que pueda arreglarla.
   *   2. añadir /bocadillo|viñeta|nombre/ — enganchaba las quejas de historia
   *      entera y habría reintentado las doce páginas por ruido.
   */
  return r.errors.concat(r.warnings)
    .filter((m) => /^página 1, viñeta \d+/.test(m))
    .map((m) => m.replace(/^página 1, /, ""));
}

module.exports = { validateStory, judgeCritique, pageProblems, normalise, blocklisted, LAYOUT_PANELS };

// --- CLI ---------------------------------------------------------------------
if (require.main === module) {
  const fs = require("fs");
  const file = process.argv[2];
  if (!file) { console.error("uso: node lib/validate-story.js <fichero.json>"); process.exit(2); }
  const story = JSON.parse(fs.readFileSync(file, "utf8"));
  const r = validateStory(story, story.order);
  console.log(JSON.stringify(r.stats, null, 2));
  r.warnings.forEach((w) => console.log(`  aviso   ${w}`));
  r.errors.forEach((e) => console.log(`  ERROR   ${e}`));
  console.log(r.ok ? "\n✅ válido\n" : `\n❌ ${r.errors.length} errores\n`);
  process.exit(r.ok ? 0 : 1);
}
