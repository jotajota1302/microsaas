/*
 * The style system — the answer to the finding that killed the first spike:
 * image-01 lets the character reference eat the style suffix, so the same
 * prompt produced flat cel anime, digital painting and near-photorealistic 3D
 * in the same set (see docs/spike-2026-08-21.md).
 *
 * Four defences, in the order they matter:
 *
 *   1. POSITION. The style anchor goes FIRST, before the character and the
 *      scene. A suffix is the weakest place in the prompt; the opening tokens
 *      set the medium.
 *   2. REPETITION. It is restated at the end, in different words, so the model
 *      cannot forget it while describing the scene.
 *   3. NAMED NEGATIVES. Generic "no watermark" did nothing. We now forbid the
 *      exact four drift modes we measured: photorealism, 3D/CGI, digital
 *      painting, and lens blur.
 *   4. A FROZEN CHARACTER BLOCK. Identical wording in every panel — never
 *      paraphrased — because paraphrase is where the eye colour and the age
 *      wandered.
 *
 * Everything here is frozen on purpose, exactly like cuentos/lib/collection.js:
 * a different style is a different collection, not an edit of this one.
 */

// The medium, stated as a medium. "Flat" and "2D" appear three times between
// the anchor and the negatives because that is the axis the model drifts on.
const C = require("./catalog.js");

/*
 * The style now comes from the catalogue: every prompt builder takes a style
 * id and looks the anchor up. A story says which collection it was sold as,
 * and the illustrator must not be able to draw it in a different one.
 *
 * FALLBACK_ANCHOR is only for callers that pass no style at all (the first
 * spikes did); it is the shonen anchor those spikes were measured with.
 */
function anchorFor(styleId) {
  const style = C.STYLES[styleId];
  return style ? style.anchor : FALLBACK_ANCHOR;
}

const FALLBACK_ANCHOR =
  "Flat 2D cel-shaded anime comic panel, hand-drawn animation cel, " +
  "bold black ink outlines of even weight, three-tone flat shading with hard edges, " +
  "halftone screentone texture, limited flat palette of navy blue, crimson red, cream white and teal, " +
  "high contrast, clean vector-like fills, no gradients";

// Every drift mode we actually measured on 2026-08-21, named one by one.
// Generic negatives ("no watermark") were ignored; specific ones are cheap to
// add and this is the only lever image-01 gives us.
const NEGATIVES =
  "Strictly flat 2D drawn illustration. NOT photorealistic, NOT a 3D render, NOT CGI, " +
  "no realistic skin pores, no realistic fabric or knitted wool texture, no cinematic lighting, " +
  "no depth of field, no bokeh, no lens blur, no painterly brushwork, no digital oil painting, " +
  "no airbrush, no soft focus. " +
  "No watermark, no signature, no artist mark, no page border, no panel frame. " +
  // Not cosmetic: the model put a recognisable Apple logo on the laptop in the
  // cover and in p5-2 (2026-08-22). A real trademark on a product we sell is
  // the same class of problem as the franchise rule in CLAUDE.md.
  "All devices and clothing are unbranded: no brand logos, no company logos, no trademarks, " +
  "no readable brand names on laptops, phones or clothes";

// Added when the panel must leave room for a bubble drawn in code. Measured to
// work in the spike (10-bubble-mute left exactly the requested empty corner).
const ROOM = {
  "top-left": "Leave the upper left third of the frame as clear simple background with nothing in it; place the subject to the lower right.",
  "top-right": "Leave the upper right third of the frame as clear simple background with nothing in it; place the subject to the lower left.",
  "bottom-left": "Leave the lower left third of the frame as clear simple background with nothing in it; place the subject to the upper right.",
  "bottom-right": "Leave the lower right third of the frame as clear simple background with nothing in it; place the subject to the upper left.",
};

/**
 * The character block. Frozen wording: callers pass a hero object and always
 * get the same sentence back, so no panel ever paraphrases it.
 *
 * Deliberately absent: scars and birthmarks. They wandered across the face in
 * the spike (eyebrow -> cheek -> forehead, where it read as a bleeding wound).
 * Eye colour and age are stated explicitly in every panel for the same reason.
 */
function characterBlock(hero) {
  /*
   * No name. This used to open with hero.name.toUpperCase(), which put a real
   * minor's first name into every character sheet and every panel prompt sent
   * to a provider with no EU DPA — the same rule the scene descriptions were
   * cleaned of in August, still broken here a fortnight later.
   *
   * Nothing is lost: a name tells an image model nothing about a face, and
   * "THE PROTAGONIST" binds the attributes that follow just as well.
   */
  return `THE PROTAGONIST is a ${hero.age}-year-old ${hero.gender === "f" ? "girl" : "boy"}, ` +
    `${hero.hair}, ${hero.eyes} eyes, ${hero.skin} skin, no scars and no facial marks, ` +
    `wearing ${hero.outfit}`;
}

/**
 * The lock repeated on every panel that uses the character sheet as reference.
 *
 * The hairstyle gets its own emphatic clause because naming it once inside a
 * list was not enough: measured 2026-08-22, a character ordered with a ponytail
 * came back with a bun, then loose hair, then a ponytail again across one comic.
 * The fix is the same one that stopped the style drifting — name the failure
 * mode and forbid it, rather than only stating the desired outcome.
 */
function identityLock(hero) {
  const hair = String(hero.hair || "");
  const negated = [
    /ponytail|tied back/i.test(hair) && "never loose, never in a bun, never down",
    /braid/i.test(hair) && "never loose, never in a ponytail",
    /long straight|curly|messy|cropped|buzzed|fringe/i.test(hair) && "never tied up, never in a ponytail or bun",
  ].filter(Boolean)[0];

  return `Keep the character strictly identical to the reference image: same face shape, ` +
    `same ${hero.eyes} eyes, same ${hero.age}-year-old age, same ${hero.outfit}. ` +
    `The hair is ${hair} in EVERY panel${negated ? `, ${negated}` : ""}`;
}

/** A supporting character, described the same frozen way as the hero. */
function castBlock(label, sheet) {
  return `${label} is ${sheet}`;
}

/**
 * One panel prompt. Order is the whole point: style, then who, then what,
 * then the identity lock, then the negatives.
 *
 * `subject` is null for panels that have no named character in them — a screen,
 * a skyline, an explosion. Those panels are also generated WITHOUT a reference
 * image, because image-01 obeys the reference over the prompt: measured
 * 2026-08-22, a "close-up of the laptop screen" came back with the hero filling
 * half the frame, and a panel that asked for the armoured hero came back as the
 * hero's face wearing a red jacket.
 */
function panelPrompt({ subject, scene, room, styleId }) {
  const parts = [
    anchorFor(styleId) + ".",
    subject ? subject.block + "." : null,
    "Scene: " + scene + ".",
    room ? ROOM[room] : null,
    subject && subject.lock ? subject.lock + "." : null,
    C.NEGATIVES + ".",
  ].filter(Boolean);
  return clamp(parts.join(" "));
}

/** A reference sheet. Generated once per character, then reused as the reference. */
function sheetPrompt(block, styleId) {
  return clamp(
    `${anchorFor(styleId)}. Character reference sheet on a plain flat white background, ` +
      `three views of the same single character side by side: full body standing front view, ` +
      `head and shoulders three-quarter view, and determined face close-up. ` +
      `${block}. ${C.NEGATIVES}.`
  );
}

/** The cover. No title on the image: the lettering goes on top, in code. */
function coverPrompt({ block, scene, styleId }) {
  return clamp(
    `${anchorFor(styleId)}. ${block}. Comic book cover illustration: ${scene}. ` +
      `Leave the upper quarter of the image as clear simple sky with nothing in it, for a title. ` +
      `${C.NEGATIVES}.`
  );
}

/**
 * The whole-page experiment: one image per page instead of one per panel.
 * Twenty times cheaper if it works. Fase 0 of cuentos measured that image-01
 * ignores a 2x2 grid instruction, but a comic page is a pattern it has seen
 * far more often than a reference sheet, so it is worth the 0.02 $ to know.
 */
/*
 * The same negatives, compressed. A whole-page prompt has to fit the anchor,
 * the cast, four scene descriptions AND the negatives inside 1500 characters;
 * the full list does not fit and clamp() would eat it silently, which is worse
 * than trimming it deliberately. These are the ones that were doing the work.
 */
// 70 characters per beat is the measured ceiling: at 80 the negatives get
// clamped off seven of the fourteen pages, and losing them silently is exactly
// how the style drifted in the first place.
const BEAT_MAX = 70;

const NEGATIVES_SHORT =
  "Strictly flat 2D drawn illustration. NOT photorealistic, NOT 3D, no depth of field, " +
  "no painterly brushwork. No watermark, no signature, no brand logos on devices or clothes";

function fullPagePrompt({ blocks, panels, lock, styleId }) {
  // Scenes are written for a full panel; on a page they only need to say what
  // the beat is. Trimming them on a word boundary is what makes room above.
  const beats = panels
    .map((p, i) => `Panel ${i + 1}: ${trim(p.scene, BEAT_MAX)}`)
    .join(". ");
  // The 1500-char cap bites here: anchor + cast + four scenes + negatives is
  // already close to it. Anything appended after clamp() is silently rejected
  // by the API (2013 invalid params), so the lock has to go in before it.
  return clamp(
    `${anchorFor(styleId)}. A complete comic book page divided into ${panels.length} clearly separated ` +
      `rectangular panels with white gutters between them, read left to right, top to bottom. ` +
      `${blocks.join(". ")}. ${beats}. ` +
      `Keep every character identical from panel to panel. ` +
      (lock ? `${lock} in every panel where he appears. ` : "") +
      `No speech bubbles and no text anywhere. ${C.NEGATIVES_SHORT}.`
  );
}

/** Cut to a word boundary, for the places where a full sentence will not fit. */
function trim(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" "));
}

// image-01 truncates past 1500 characters; cut on a word so we never send half
// a negative (a dangling "no depth of" would be worse than nothing).
function clamp(text) {
  if (text.length <= 1500) return text;
  const cut = text.slice(0, 1500);
  return cut.slice(0, cut.lastIndexOf(" "));
}

module.exports = {
  anchorFor, FALLBACK_ANCHOR,
  characterBlock, castBlock, identityLock,
  panelPrompt, sheetPrompt, coverPrompt, fullPagePrompt,
};
