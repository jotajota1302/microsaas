const { test } = require("node:test");
const assert = require("node:assert");
const sharp = require("sharp");
const { toLineArt, A4 } = require("../lib/lineart.js");

// A soft grey gradient with a dark stroke: what an "almost line art" image
// from the model looks like before cleaning.
async function softImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#bbb"/></linearGradient></defs>
    <rect width="400" height="300" fill="url(#g)"/>
    <circle cx="200" cy="150" r="80" fill="none" stroke="#111" stroke-width="12"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test("output is A4 at 300 dpi", async () => {
  const src = await softImage();
  const r = await toLineArt(src, "a circle", { generateImage: async () => ({ buffer: src, costUsd: 0.034 }) });
  const m = await sharp(r.buffer).metadata();
  assert.strictEqual(m.width, A4.width);
  assert.strictEqual(m.height, A4.height);
});

test("output contains only pure black and pure white", async () => {
  const src = await softImage();
  const r = await toLineArt(src, "a circle", { generateImage: async () => ({ buffer: src, costUsd: 0 }) });
  const { data } = await sharp(r.buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  let grey = 0, black = 0;
  for (let i = 0; i < data.length; i += 97) {
    if (data[i] !== 0 && data[i] !== 255) grey++;
    if (data[i] === 0) black++;
  }
  assert.strictEqual(grey, 0, "found grey pixels");
  assert.ok(black > 0, "the stroke vanished");
});

test("asks the model for line art with the page as reference", async () => {
  const src = await softImage();
  let seen;
  await toLineArt(src, "a lighthouse", { generateImage: async (args) => { seen = args; return { buffer: src, costUsd: 0 }; } });
  assert.match(seen.prompt, /colouring book page/i);
  assert.match(seen.prompt, /a lighthouse/);
  assert.strictEqual(seen.refs.length, 1);
});

test("a model failure propagates instead of returning a colour image", async () => {
  const src = await softImage();
  await assert.rejects(
    () => toLineArt(src, "x", { generateImage: async () => { throw new Error("down"); } }),
    /down/
  );
});

test("reports the model cost", async () => {
  const src = await softImage();
  const r = await toLineArt(src, "x", { generateImage: async () => ({ buffer: src, costUsd: 0.034 }) });
  assert.strictEqual(r.costUsd, 0.034);
});
