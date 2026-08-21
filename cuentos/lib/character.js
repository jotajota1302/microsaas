/*
 * The character sheet and the story pages.
 *
 * buildSheet  - one reference image of the protagonist (front, profile,
 *               full body, close-up) generated from the text description.
 *               The WHOLE sheet is the reference for every page: measured
 *               on 2026-08-21, it keeps character and style; cropping it
 *               into quadrants did not (generators ignore the grid layout).
 * renderPages - the requested pages in parallel (concurrency 4), each
 *               checked by the vision judge; one regeneration on a bad
 *               verdict, then the catalogue illustration as fallback. Three
 *               or more fallbacks in one story is not a book we deliver.
 */

const C = require("./collection.js");
const images = require("./images.js");

const SHEET_PROMPT = (sheet) =>
  `Character reference sheet on a plain white background, four clean panels of the same single child: ` +
  `front view, side profile, full body standing, happy face close-up. The child is ${sheet.appearance}, ` +
  `wearing ${sheet.outfit}. No text, no labels.`;

/** The described people, if any. Tolerates an older story with no list. */
function peopleOf(sheet) {
  return (Array.isArray(sheet && sheet.people) ? sheet.people : [])
    .map((d) => String(d || "").trim())
    .filter(Boolean);
}

const PEOPLE_SHEET_PROMPT = (people) =>
  `Character reference sheet on a plain white background: ${people.length} separate full-body panels, ` +
  `one per person, each shown standing and facing forward. ` +
  people.map((d, i) => `Panel ${i + 1}: ${d}.`).join(" ") +
  ` Same illustration style as the reference image. No text, no labels.`;

const PAGE_PROMPT = (sheet, hint) => {
  const people = peopleOf(sheet);
  return `${sheet.appearance}, wearing ${sheet.outfit}` +
    (sheet.companion ? `, with ${sheet.companion}` : "") +
    (people.length ? `. Also in this story: ${people.join("; ")}` : "") +
    `. Scene: ${hint}. Keep the child exactly identical to the reference sheet: same face, same hair, ` +
    `same glasses, same clothes and colours` +
    (people.length ? `, and keep every other person identical to their reference panel too: same face, same hair, same clothes` : "") +
    `. Storybook page, no text.`;
};

class TooManyFallbacksError extends Error {
  constructor(count) {
    super(`${count} pages fell back to the catalogue — not deliverable`);
    this.name = "TooManyFallbacksError";
    this.count = count;
  }
}

const MAX_FALLBACKS = 2; // 3+ means review, never silent delivery

/**
 * One sheet for the child, and — when anyone else is in the story — a second
 * one for them. Both travel as references to every page.
 *
 * Measured on a delivered book: the protagonist was the same throughout
 * because the sheet described them, while the grandmother was re-invented in
 * every scene because nothing did. The second sheet costs one more image
 * (~0,034 $ on a 57-cent book) and is the only thing that fixes it.
 */
async function buildSheet(characterSheet, deps = {}) {
  const generate = deps.generateImage || images.generateImage;
  const out = await generate({ prompt: SHEET_PROMPT(characterSheet), refs: [], size: "16:9", label: "sheet" }, deps);

  const people = peopleOf(characterSheet);
  if (!people.length) {
    return { sheet: out.buffer, refs: [out.buffer], costUsd: out.costUsd, model: out.model };
  }

  const cast = await generate(
    { prompt: PEOPLE_SHEET_PROMPT(people), refs: [out.buffer], size: "16:9", label: "sheet-people" },
    deps
  );
  return {
    sheet: out.buffer,
    refs: [out.buffer, cast.buffer],
    costUsd: (out.costUsd || 0) + (cast.costUsd || 0),
    model: out.model,
  };
}

/** Minimal semaphore: run `fn` over `items` with at most `limit` in flight. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function renderOne({ story, sheetBuffer, refs, index, verify }, deps) {
  const generate = deps.generateImage || images.generateImage;
  const judge = deps.verifyPage || images.verifyPage;
  const page = story.pages[index];
  const prompt = PAGE_PROMPT(story.character_sheet, page.image_hint);
  let costUsd = 0;
  const issues = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    let out;
    try {
      out = await generate({ prompt, refs, size: "1:1", label: `page-${index + 1}` }, deps);
    } catch (e) {
      // No credit left: nothing is wrong with this page and nothing will be
      // by trying again. Let it out, so the job stops and says what it needs
      // instead of delivering a book with blanks in it.
      if (e instanceof images.OutOfCreditError) throw e;
      issues.push(`attempt ${attempt}: ${e.name}: ${e.message.slice(0, 120)}`);
      if (e instanceof images.ImageBlockedError) break; // a verdict, not a glitch
      continue;
    }
    costUsd += out.costUsd || 0;

    if (!verify) return { index, buffer: out.buffer, fallback: false, costUsd, issues, model: out.model };

    const verdict = await judge(sheetBuffer, out.buffer, deps);
    if (verdict.ok) {
      return { index, buffer: out.buffer, fallback: false, costUsd, issues: verdict.issues || [], model: out.model, unverified: Boolean(verdict.unverified) };
    }
    issues.push(`attempt ${attempt} rejected by judge: ${(verdict.issues || []).join("; ")}`);
  }

  return {
    index,
    buffer: null,
    fallback: true,
    fallbackPath: C.fallbackImage(story.theme || "mar", index),
    costUsd,
    issues,
  };
}

/**
 * @param {object} story      validated story (needs character_sheet, pages, theme)
 * @param {Buffer[]} refs     reference images (the sheet)
 * @param {object} options    { indices?: number[], verify?: boolean, concurrency?: number }
 */
async function renderPages(story, refs, options = {}, deps = {}) {
  const indices = options.indices || story.pages.map((_, i) => i);
  const verify = options.verify !== false;
  const concurrency = options.concurrency || 4;
  const sheetBuffer = refs[0];

  const pages = await mapLimit(indices, concurrency, (index) =>
    renderOne({ story, sheetBuffer, refs, index, verify }, deps)
  );

  const costUsd = pages.reduce((sum, p) => sum + (p.costUsd || 0), 0);
  const fallbacks = pages.filter((p) => p.fallback).length;
  if (fallbacks > MAX_FALLBACKS) {
    const err = new TooManyFallbacksError(fallbacks);
    err.pages = pages;
    err.costUsd = costUsd;
    throw err;
  }
  return { pages, costUsd, fallbacks };
}

module.exports = { buildSheet, PEOPLE_SHEET_PROMPT, renderPages, mapLimit, SHEET_PROMPT, PAGE_PROMPT, TooManyFallbacksError, MAX_FALLBACKS };
