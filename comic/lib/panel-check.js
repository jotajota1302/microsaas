/*
 * The validator for what comes back from the image model.
 *
 * Every other output of a model in this codebase goes through a validator
 * before the engine will touch it — that is the golden rule inherited from the
 * RPG. Images were the exception, and the exception cost us: measured on the
 * first full comic, 9 panels out of 83 (10,8 %) betrayed the style of a comic
 * sold as black and white, and it was noticed by eye rather than by code.
 *
 * They are not one defect, they are two, and telling them apart is the whole
 * point of this file because the fixes cost different things:
 *
 *   DRIFT     the drawing is correct inked manga with a colour accident in it
 *             — a lit lamp, a screen, a glow. Measured: p10-1 is a genuinely
 *             good panel with an orange streetlight and a blue monitor.
 *             Fix: desaturate. Free, instant, keeps a good drawing.
 *
 *   COLLAPSE  the model ignored the style anchor and produced a PHOTOGRAPH.
 *             Measured: p1-4 came back as a stock photo of a café terrace.
 *             Fix: draw it again. Desaturating a photo gives a black and white
 *             photo, which is still not a comic.
 *
 * What separates them is ink density: the share of pixels that are nearly pure
 * black or nearly pure white. Inked line art is bimodal by construction —
 * measured across the 74 correct panels the floor was 52 % and the median 72 %.
 * The photograph scored 11,6 %. Everything with a colour problem but real ink
 * scored 45 % or more. A threshold at 30 % has the whole population on one
 * side and the collapse alone on the other.
 *
 * What this deliberately does NOT claim to see: a panel that is inked, correct
 * on both metrics, and still off-model — the wrong character, a hand with six
 * fingers, a composition that does not match the beat. Those need eyes or a
 * vision model. A number that does not measure them would be worse than
 * admitting they are not measured.
 */

const sharp = require("sharp");

// Above this fraction of clearly coloured pixels, a black and white comic is
// not black and white. Below it, JPEG chroma noise.
const COLOUR_SHARE = Number(process.env.PANEL_COLOUR_SHARE || 0.06);
const COLOUR_SAT = Number(process.env.PANEL_COLOUR_SAT || 0.18);
// Below this share of near-black + near-white pixels there is no ink in the
// picture, whatever else is in it.
const INK_FLOOR = Number(process.env.PANEL_INK_FLOOR || 0.30);

const GRID = 96; // 9216 pixels is plenty for a population statistic

/** Colour share, mean saturation and ink density, from one downsampled read. */
async function measure(buffer) {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .resize(GRID, GRID, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const n = info.width * info.height;
  let coloured = 0;
  let satSum = 0;
  let ink = 0;

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    satSum += sat;
    if (sat >= COLOUR_SAT) coloured++;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 45 || lum > 210) ink++;
  }

  return { colour: coloured / n, saturation: satSum / n, ink: ink / n };
}

/**
 * Judges one panel against the style it was drawn for.
 *
 * @param buffer   the JPEG the provider returned
 * @param styleId  the catalogue style; only `manga-bn` forbids colour
 * @returns {Promise<{verdict:"ok"|"drift"|"collapse", …metrics}>}
 */
async function judgePanel(buffer, styleId) {
  const m = await measure(buffer);
  const greyscale = styleId === "manga-bn";

  /*
   * LA DENSIDAD DE TINTA SOLO VALE PARA `manga-bn`, y creer lo contrario costó
   * un cómic entero.
   *
   * El umbral se midió sobre 74 viñetas correctas de un cómic en blanco y
   * negro (suelo 52 %, mediana 72 %) contra una fotografía que dio 11,6 %, y
   * de ahí se dedujo un suelo del 30 % «cierto en todos los estilos». No lo
   * es. Medido el 2026-08-23 sobre las muestras de los seis estilos:
   *
   *   manga-bn 92 %  ·  ligne-claire 31 %  ·  shonen 25 %
   *   novela-grafica 25 %  ·  americano 24 %  ·  seinen 11 %
   *
   * Cuatro de seis suspenden, y `seinen` da exactamente lo mismo que la
   * fotografía. Esto no mide «esto es un cómic», mide «esto es línea en blanco
   * y negro»: un estilo con color y medios tonos vive en los grises por
   * definición. En producción tiró siete viñetas seguidas de un cómic seinen
   * dándolas por colapsadas.
   *
   * Así que fuera de manga-bn NO HAY detector de colapso. Se podría inventar
   * otro umbral, pero seinen y la fotografía puntúan igual: no hay número que
   * los separe, y poner uno sería volver a hacer lo mismo con más decimales.
   * Lo que hay para esos estilos es el validador de guion y unos ojos.
   */
  if (greyscale && m.ink < INK_FLOOR) return { verdict: "collapse", ...m };
  if (greyscale && m.colour >= COLOUR_SHARE) return { verdict: "drift", ...m };

  return { verdict: "ok", ...m };
}

/**
 * Takes the colour out without touching the drawing.
 *
 * `normalise` is deliberately NOT applied: a panel that is mostly a dark room
 * would get its blacks stretched to grey, which is a different picture from
 * the one the model drew and the one the letterer measured.
 */
async function desaturate(buffer) {
  return sharp(buffer, { failOn: "none" })
    .greyscale()
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/**
 * The whole policy in one call: judge, and fix what can be fixed for free.
 *
 * @returns {Promise<{buffer:Buffer, verdict:string, fixed:boolean, redraw:boolean}>}
 */
async function checkPanel(buffer, styleId) {
  const judged = await judgePanel(buffer, styleId);

  if (judged.verdict === "drift") {
    return { buffer: await desaturate(buffer), verdict: "drift", fixed: true, redraw: false, metrics: judged };
  }
  if (judged.verdict === "collapse") {
    return { buffer, verdict: "collapse", fixed: false, redraw: true, metrics: judged };
  }
  return { buffer, verdict: "ok", fixed: false, redraw: false, metrics: judged };
}

module.exports = { checkPanel, judgePanel, measure, desaturate, COLOUR_SHARE, COLOUR_SAT, INK_FLOOR };
