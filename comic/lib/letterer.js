/*
 * Decides WHERE each bubble goes, by looking at the drawing.
 *
 * The first version trusted a corner written in the story JSON. That fails for
 * a reason no amount of prompting fixes: the model decides the composition, not
 * us. We ask it to leave the top-left clear and it centres the face there
 * anyway, and the bubble lands on the face (measured on page 5, panel 3, where
 * "QUÉDATE AQUÍ" sat on Vigía's head).
 *
 * So the corner is measured instead of declared. A face is the busiest, highest
 * contrast area of a comic panel — eyes, ink lines, hair — so the quietest
 * region of the image is almost never a face. We downsample to greyscale, score
 * each candidate box by how much the pixels vary inside it, and take the
 * calmest boxes that do not overlap each other.
 *
 * Cheap, deterministic, no model involved. The story JSON's `at` becomes a hint
 * used only to break ties.
 */

let sharp = null;
try { sharp = require("sharp"); } catch { /* optional */ }

const GRID = 96; // the image is scored at 96x96; finer buys nothing

// x0, y0, x1, y1 as fractions. Corners first, then the two centre strips for
// panels whose subject sits to one side.
const REGIONS = {
  "top-left":      [0.00, 0.00, 0.48, 0.30],
  "top-right":     [0.52, 0.00, 1.00, 0.30],
  "bottom-left":   [0.00, 0.70, 0.48, 1.00],
  "bottom-right":  [0.52, 0.70, 1.00, 1.00],
  "top-center":    [0.24, 0.00, 0.76, 0.26],
  "bottom-center": [0.24, 0.74, 0.76, 1.00],
};

function overlaps(a, b) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/** Standard deviation of luminance inside a fractional box. */
function busyness(pixels, box) {
  const x0 = Math.floor(box[0] * GRID), x1 = Math.ceil(box[2] * GRID);
  const y0 = Math.floor(box[1] * GRID), y1 = Math.ceil(box[3] * GRID);
  let sum = 0, sumSq = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = pixels[y * GRID + x];
      sum += v; sumSq += v * v; n++;
    }
  }
  if (!n) return Infinity;
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
}

/**
 * Returns one region name per bubble, quietest first, never overlapping.
 * Falls back to the hints from the JSON when sharp is not available.
 */
async function place(file, bubbles) {
  const hints = bubbles.map((b) => b.at || "top-left");
  if (!sharp || !bubbles.length) return hints;

  let pixels;
  try {
    pixels = await sharp(file).greyscale().resize(GRID, GRID, { fit: "fill" }).raw().toBuffer();
  } catch {
    return hints;
  }

  const scored = Object.entries(REGIONS)
    .map(([name, box]) => ({
      name,
      box,
      // A tiny bonus for the corner the writer had in mind, enough to break a
      // tie between two equally empty corners but not to override a busy one.
      score: busyness(pixels, box) * (hints.includes(name) ? 0.9 : 1),
    }))
    .sort((a, b) => a.score - b.score);

  const chosen = [];
  for (const cand of scored) {
    if (chosen.length === bubbles.length) break;
    if (chosen.some((c) => overlaps(c.box, cand.box))) continue;
    chosen.push(cand);
  }
  // More bubbles than free regions: the leftovers keep their declared corner.
  while (chosen.length < bubbles.length) chosen.push({ name: hints[chosen.length] });

  /* Captions read as narration and belong at the top of the panel; dialogue can
     go anywhere. Order the chosen regions so captions get the upper ones. */
  const upper = (n) => (n.startsWith("top") ? 0 : 1);
  const order = bubbles.map((b, i) => i).sort((a, b) => {
    const ca = bubbles[a].type === "caption" ? 0 : 1;
    const cb = bubbles[b].type === "caption" ? 0 : 1;
    return ca - cb;
  });
  const byPreference = [...chosen].sort((a, b) => upper(a.name) - upper(b.name));
  const out = new Array(bubbles.length);
  order.forEach((bubbleIndex, slot) => { out[bubbleIndex] = byPreference[slot].name; });
  return out;
}

module.exports = { place, REGIONS };
