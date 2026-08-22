/*
 * Where every panel sits on the page.
 *
 * This used to exist only as a CSS grid inside scripts/make-pdf.js, which meant
 * the layout was whatever headless Chrome decided. Chrome is not going to be
 * on the server, so the geometry moves here and becomes numbers: the same five
 * layouts, solved into rectangles, used by both the PDF and the web reader.
 *
 * Everything is in millimetres on a 180x270 page — the classic 2:3 comic
 * proportion. Nothing is printed for real yet, so the only job is to read well
 * on a phone; the size is here so it can become A5 without a search-replace.
 *
 * A reminder of why the model does not choose this: asked for a layout, it
 * picked one and then wrote a different number of panels on 11 pages out of 14.
 * The layout is derived from the panel count, in code, and cannot disagree.
 */

const PAGE = Object.freeze({ w: 180, h: 270, pad: 6, gap: 3 });

/*
 * Each layout is a grid plus one cell span per panel: [col, row, colSpan, rowSpan].
 * The column and row weights are the `fr` units the CSS used, kept identical so
 * the printed page and the web reader are the same page.
 */
const LAYOUTS = Object.freeze({
  "wide-two": {
    cols: [1, 1], rows: [0.78, 1],
    cells: [[0, 0, 2, 1], [0, 1, 1, 1], [1, 1, 1, 1]],
    aspects: ["16:9", "1:1", "1:1"],
  },
  "tall-stack": {
    cols: [1.15, 1], rows: [1, 1],
    cells: [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1]],
    aspects: ["2:3", "3:2", "3:2"],
  },
  quad: {
    cols: [1, 1], rows: [1, 1],
    cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]],
    aspects: ["1:1", "1:1", "1:1", "1:1"],
  },
  five: {
    cols: [1, 1], rows: [0.85, 1, 1],
    cells: [[0, 0, 2, 1], [0, 1, 1, 1], [1, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1]],
    aspects: ["16:9", "3:2", "3:2", "3:2", "3:2"],
  },
  six: {
    cols: [1, 1], rows: [1, 1, 1],
    cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1]],
    aspects: ["3:2", "3:2", "3:2", "3:2", "3:2", "3:2"],
  },
});

/** Turns a track list of `fr` weights into [offset, size] pairs, gaps included. */
function tracks(weights, total, gap) {
  const free = total - gap * (weights.length - 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  let at = 0;
  return weights.map((w) => {
    const size = (free * w) / sum;
    const out = [at, size];
    at += size + gap;
    return out;
  });
}

/**
 * The rectangles for one page, in millimetres from the top-left of the page.
 *
 * A layout that does not have a cell for panel N — which should not happen,
 * because the layout is chosen from the panel count — gets the last cell rather
 * than nothing. A panel drawn twice is a visible bug; a panel silently dropped
 * is a hole nobody notices until a customer does.
 *
 * @returns {Array<{x:number,y:number,w:number,h:number}>}
 */
function panelRects(layoutId, panelCount, page = PAGE) {
  const L = LAYOUTS[layoutId] || LAYOUTS.quad;
  const innerW = page.w - page.pad * 2;
  const innerH = page.h - page.pad * 2;
  const cols = tracks(L.cols, innerW, page.gap);
  const rows = tracks(L.rows, innerH, page.gap);

  return Array.from({ length: panelCount }, (_, i) => {
    const [c, r, cs, rs] = L.cells[i] || L.cells[L.cells.length - 1];
    const [x, w0] = cols[c];
    const [y, h0] = rows[r];
    const w = w0 + (cs - 1) * (cols[c + 1] ? cols[c + 1][1] + page.gap : 0);
    const h = h0 + (rs - 1) * (rows[r + 1] ? rows[r + 1][1] + page.gap : 0);
    return { x: page.pad + x, y: page.pad + y, w, h };
  });
}

/** The aspect ratio to ask the image provider for, per panel of a layout. */
function panelAspects(layoutId, panelCount) {
  const L = LAYOUTS[layoutId] || LAYOUTS.quad;
  return Array.from({ length: panelCount }, (_, i) => L.aspects[i] || "1:1");
}

/**
 * The layout for a page, chosen from how many panels it actually has.
 * `pageIndex` only breaks the tie for three panels, so consecutive short pages
 * do not come out looking like the same page twice.
 */
function layoutFor(panelCount, pageIndex = 0) {
  if (panelCount <= 3) return pageIndex % 2 ? "tall-stack" : "wide-two";
  if (panelCount === 4) return "quad";
  if (panelCount === 5) return "five";
  return "six";
}

module.exports = { PAGE, LAYOUTS, panelRects, panelAspects, layoutFor, tracks };
