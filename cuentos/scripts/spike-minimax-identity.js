/*
 * Second MiniMax spike: can WORDS hold the cast when the API will only hold
 * one face?
 *
 * The first run (scripts/spike-minimax.js) showed the reinforced style prompt
 * from ../comic fixes the drift that killed image-01 in phase 0 — but the
 * child gained and lost glasses between pages, and the parents were re-invented
 * every scene. The API answers why: sending two reference images is refused
 * outright with "image_reference must be one". Only the child can have a face
 * to copy; everyone else exists only as text.
 *
 * Two arms, same four scenes, against the illustrations of a delivered book:
 *
 *   A · dicho  — the character block is built by CODE from the order form
 *                (hair, skin, glasses, age, gender — we KNOW these, there is
 *                no reason to trust the model's prose), every person repeated
 *                word for word, and the head count stated as a negative.
 *   B · cadena — the previous page is the reference for the next, as a chain,
 *                which is the obvious thing to try when you only get one slot.
 *
 *   node scripts/spike-minimax-identity.js     (~8 images, 0,03 $)
 */

const fs = require("fs");
const path = require("path");
const { env } = require("../lib/env.js");
const images = require("../lib/images.js");
const C = require("../lib/collection.js");

const ROOT = path.join(__dirname, "..");
const REAL = path.join(ROOT, "out", "real");
const OUT = path.join(ROOT, "out", "minimax-id");
const SCENES = [0, 1, 3, 5];

const ANCHOR =
  "Soft children's storybook watercolour illustration, hand-painted on textured paper, " +
  "light ink linework of even weight, visible cold-press paper grain, " +
  "warm limited palette of cream, terracotta, sage green, soft ochre and dusty blue, " +
  "gentle rounded shapes, flat soft washes";

const NEGATIVES =
  "Strictly a hand-painted 2D watercolour illustration. NOT photorealistic, NOT a 3D render, " +
  "NOT CGI, NOT a Pixar or Disney style, no plastic skin, no cinematic lighting, no depth of field, " +
  "no bokeh, no digital oil painting, no neon colours. " +
  "No text, no lettering, no numbers, no watermark, no signature, no border, no frame";

/*
 * The child, described from the ORDER FORM rather than from the story's prose.
 * Every trait that wandered in the first run is stated here, positively or
 * negatively, in the same words on every page — glasses above all, because
 * "no glasses" left unsaid is an invitation.
 */
function childBlock(p) {
  const look = (list, id, field = "visual") => {
    const found = list.find((x) => x.id === id);
    return found ? found[field] : "";
  };
  const band = C.ageBand(p.ageBand);
  const who = p.gender === "nina" ? "girl" : p.gender === "nino" ? "boy" : "child";
  return (
    `THE CHILD is ${band.visual.replace(/^a /, "")} ${who} with ${look(C.HAIR_TYPES, p.hairType)} ` +
    `${look(C.HAIR_COLORS, p.hairColor)} hair, ${look(C.SKIN_TONES, p.skin)}, ` +
    `${p.glasses ? "wearing round glasses" : "NO glasses, never any glasses"}, ` +
    `no freckles, no scars and no facial marks`
  );
}

/** Everyone else, frozen word for word, with the head count as a fence. */
function castBlock(sheet, people) {
  const named = (sheet.people || []).map((d, i) => {
    const rel = C.RELATIONS.find((r) => r.id === (people[i] && people[i].relation));
    return `${rel ? rel.role.toUpperCase() : `PERSON ${i + 1}`}: ${d}`;
  });
  const count = 1 + named.length;
  return (
    (named.length ? `${named.join(". ")}. ` : "") +
    `Exactly ${count} ${count === 1 ? "person" : "people"} may appear in this illustration and nobody else: ` +
    `no other children, no other adults, no extra characters in the background`
  );
}

const build = ({ arm, sheet, p, hint, chained }) =>
  [
    ANCHOR,
    childBlock(p),
    `The child wears ${sheet.outfit}, always the same clothes.`,
    sheet.companion ? `Their pet: ${sheet.companion}, the same animal every time.` : "",
    castBlock(sheet, p.people || []),
    `Scene: ${hint}.`,
    chained
      ? "Keep every character strictly identical to the reference image: the same faces, the same hair, the same clothes and the same colours as in that picture. Only the action and the place change."
      : "Keep the child strictly identical to the reference image: same face shape, same hair, same clothes, same colours.",
    NEGATIVES,
  ]
    .filter(Boolean)
    .join(" ");

(async () => {
  if (!env.MINIMAX_API_KEY) { console.error("\n  Falta MINIMAX_API_KEY\n"); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path.join(REAL, "story.json"), "utf8"));
  const sheet = data.story.character_sheet;
  const p = data.personalization;
  fs.mkdirSync(OUT, { recursive: true });

  const sheetRef = fs.readFileSync(path.join(ROOT, "out", "minimax", "sheet.jpg"));
  const opts = { provider: "minimax", style: false, size: "1:1" };
  let cost = 0;

  console.log("\n  A · dicho: la ficha manda siempre, el reparto va escrito por código");
  for (const i of SCENES) {
    const t = Date.now();
    const out = await images.generateImage(
      { prompt: build({ arm: "A", sheet, p, hint: data.story.pages[i].image_hint }), refs: [sheetRef], ...opts, label: `A-${i}` }
    );
    fs.writeFileSync(path.join(OUT, `A-p${i}.jpg`), out.buffer);
    cost += out.costUsd || 0;
    console.log(`     página ${i + 1} · ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }

  console.log("\n  B · cadena: cada página se mira en la anterior");
  let ref = sheetRef;
  for (const i of SCENES) {
    const t = Date.now();
    const out = await images.generateImage(
      { prompt: build({ arm: "B", sheet, p, hint: data.story.pages[i].image_hint, chained: ref !== sheetRef }), refs: [ref], ...opts, label: `B-${i}` }
    );
    fs.writeFileSync(path.join(OUT, `B-p${i}.jpg`), out.buffer);
    ref = out.buffer; // the chain
    cost += out.costUsd || 0;
    console.log(`     página ${i + 1} · ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }

  console.log(`\n  ${SCENES.length * 2} imágenes · ${cost.toFixed(4)} $`);
  console.log(`  monta la lámina con: node scripts/contact-sheet.js\n`);
})();
