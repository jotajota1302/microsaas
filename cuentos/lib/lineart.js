/*
 * Turns a finished illustration into a colouring page.
 *
 * The model does the drawing (edit the page into clean black outlines);
 * sharp only cleans up: greyscale, normalise, median filter against
 * antialiasing speckle, hard threshold to pure black and white, then fit
 * onto an A4 sheet at 300 dpi with a 10 mm margin. Thresholding a shaded
 * illustration directly produces blobs, not outlines — measured.
 */

const sharp = require("sharp");
const C = require("./collection.js");
const images = require("./images.js");

const A4 = { width: 2480, height: 3508 }; // 300 dpi
const MARGIN = Math.round(10 / 25.4 * 300); // 10 mm

async function toLineArt(pageBuffer, hint, deps = {}) {
  const generate = deps.generateImage || images.generateImage;
  const out = await generate(
    { prompt: `${C.LINEART_STYLE} The scene: ${hint || "the same scene as the reference"}.`, refs: [pageBuffer], size: "3:4", style: false, label: "lineart" },
    deps
  );

  return { buffer: await cleanToA4(out.buffer), costUsd: out.costUsd || 0, model: out.model };
}

/**
 * Drawing -> printable A4 colouring page: pure black and white, centred,
 * 10 mm margin, 300 dpi. Shared with the free gallery.
 *
 * sharp applies operations in a fixed order inside one pipeline (resize
 * before extend, and a second resize replaces the first), so this is done
 * in three explicit passes. The threshold comes LAST: any resampling after
 * it would reintroduce grey.
 */
async function cleanToA4(input) {
  const fitted = await sharp(input)
    .flatten({ background: "#fff" })
    .greyscale()
    .normalise()
    .median(3)
    .resize({ width: A4.width - 2 * MARGIN, height: A4.height - 2 * MARGIN, fit: "inside" })
    .png()
    .toBuffer();

  const meta = await sharp(fitted).metadata();
  const left = Math.floor((A4.width - meta.width) / 2);
  const top = Math.floor((A4.height - meta.height) / 2);
  const framed = await sharp(fitted)
    .extend({
      left,
      right: A4.width - meta.width - left,
      top,
      bottom: A4.height - meta.height - top,
      background: "#fff",
    })
    .png()
    .toBuffer();

  return sharp(framed).threshold(200).png().toBuffer();
}

module.exports = { toLineArt, cleanToA4, A4, MARGIN };
