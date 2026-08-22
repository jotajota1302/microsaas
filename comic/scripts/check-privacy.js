/*
 * Builds EVERY prompt this product can send and asserts that no real name is
 * in any of them.
 *
 * This is the regression test for the defect that has now happened twice:
 *
 *   Aug 2026  the child's name was inside every scene description sent to the
 *             image model. Fixed there, and the fix was believed to be the
 *             whole fix.
 *   Aug 22    it was still in "PROTAGONISTA: <name>" in every text prompt
 *             (MiniMax and OpenRouter both) and in characterBlock()'s opening
 *             words, so image-01 had it on every sheet and every panel.
 *
 * Twice is a pattern, and the pattern is that the rule lived in people's heads.
 * So it lives here now: this walks the actual prompt builders with an actual
 * order and greps the strings that would go over the wire. It costs nothing and
 * it runs in a second.
 *
 * Usage: node scripts/check-privacy.js
 * Exit code 1 if anything leaks.
 */

const P = require("../lib/prompt-script.js");
const S = require("../lib/style.js");
const N = require("../lib/names.js");
const { pipelineOrder } = require("../lib/order.js");
const { heroFromOrder } = require("../lib/preview-job.js");

// Deliberately ordinary Spanish first names. A rare string would pass a check
// that a real customer's name would fail.
const RAW = {
  name: "Nerea",
  age: 15,
  gender: "f",
  ageBand: "14-15",
  hairShape: "largo",
  hairColour: "castano",
  eyes: "miel",
  skin: "clara",
  build: "delgado",
  mark: "capucha",
  trait: "observador",
  trope: "academia",
  tone: "oscuro",
  style: "manga-bn",
  lang: "es",
  sidekick: { name: "Leo", relation: "hermano" },
  _email: "madre@ejemplo.es",
};

// A plausible model answer, with the placeholders the model is asked to use.
const OUTLINE = {
  title: "Lo que {{NOMBRE}} no dijo",
  logline: "{{NOMBRE}} se fija en todo, y eso es un problema.",
  ally: { label: "Nube", sheet: "a tall boy with a shaved head and a denim jacket" },
  villain: { label: "El Gris", sheet: "a thin man in a long grey coat" },
  pages: Array.from({ length: 14 }, (_, i) => ({ beat: `beat ${i + 1} con {{NOMBRE}} y {{AMIGO1}}` })),
};
const PAGE = {
  beat: "beat",
  layout: "quad",
  panels: [
    { scene: "a girl at a window at dusk", ref: "hero", bubbles: [{ type: "speech", who: "{{AMIGO1}}", text: "{{NOMBRE}}, corre." }] },
    { scene: "an empty corridor of lockers", ref: null, bubbles: [] },
  ],
};
const CRITIQUE = { verdict: "flojo", score: 3, scores: {}, worst: "el diálogo suena a póster", notes: ["{{NOMBRE}} habla raro"] };

function main() {
  const { order, names } = pipelineOrder(RAW);
  const hero = heroFromOrder(order);

  const prompts = [
    ["draftPrompt", P.draftPrompt(order)],
    ["criticPrompt", P.criticPrompt(order, OUTLINE)],
    ["rewritePrompt", P.rewritePrompt(order, OUTLINE, CRITIQUE)],
    ["breakdownPrompt", P.breakdownPrompt(order, OUTLINE, 0)],
    ["dialoguePolishPrompt", P.dialoguePolishPrompt(order, PAGE, 0, 14, CRITIQUE)],
    ["dialogueCriticPrompt", P.dialogueCriticPrompt(order, [PAGE])],
    ["characterBlock", S.characterBlock(hero)],
    ["identityLock", S.identityLock(hero)],
    ["sheetPrompt", S.sheetPrompt(S.characterBlock(hero), order.style)],
    ["panelPrompt", S.panelPrompt({
      subject: { block: S.characterBlock(hero), lock: S.identityLock(hero) },
      scene: PAGE.panels[0].scene,
      styleId: order.style,
    })],
    ["coverPrompt", S.coverPrompt({
      block: S.characterBlock(hero),
      scene: "comic book cover composition: the teenager in the foreground",
      styleId: order.style,
    })],
  ];

  console.log(`\nnombres reales: ${Object.values(names).join(", ")}`);
  console.log(`prompts comprobados: ${prompts.length}\n`);

  const leaks = [];
  for (const [label, prompt] of prompts) {
    const text = N.promptText(prompt);
    const hits = N.findRealNames(text, names);
    const mark = hits.length ? "FUGA " : "  ok ";
    console.log(`  ${mark} ${label.padEnd(22)} ${String(text.length).padStart(5)} caracteres${hits.length ? ` · ${hits.join(", ")}` : ""}`);
    if (hits.length) leaks.push({ label, hits, text });
  }

  // The email must never be in a prompt either. It is not a minor's name, but
  // it is the one piece of adult personal data we hold.
  const emailLeaks = prompts.filter(([, p]) => N.promptText(p).includes(RAW._email)).map(([l]) => l);

  console.log("");
  if (leaks.length) {
    console.log(`  ${leaks.length} prompt(s) llevan un nombre real:\n`);
    for (const l of leaks) {
      const at = l.text.toLowerCase().indexOf(String(l.hits[0]).toLowerCase());
      console.log(`  ${l.label}: …${l.text.slice(Math.max(0, at - 60), at + 60).replace(/\n/g, " ")}…\n`);
    }
  }
  if (emailLeaks.length) console.log(`  el correo aparece en: ${emailLeaks.join(", ")}`);

  const bad = leaks.length + emailLeaks.length;
  console.log(bad ? `  ${bad} problema(s) de privacidad\n` : "  ningún dato personal sale hacia un proveedor\n");
  process.exit(bad ? 1 : 0);
}

main();
