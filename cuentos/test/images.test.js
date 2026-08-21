const { test } = require("node:test");
const assert = require("node:assert");
const { generateImage, verifyPage, withStyle, ImageBlockedError, ImageError, DEFAULT_MODEL } = require("../lib/images.js");
const C = require("../lib/collection.js");

process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key";
process.env.MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "test-key";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const DATA = `data:image/png;base64,${PNG.toString("base64")}`;

function stub(responses) {
  let i = 0;
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, body: options && options.body ? JSON.parse(options.body) : null });
    const r = responses[Math.min(i++, responses.length - 1)];
    const bodyText = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return {
      ok: (r.status || 200) < 400,
      status: r.status || 200,
      text: async () => bodyText,
      json: async () => JSON.parse(bodyText),
      arrayBuffer: async () => PNG,
    };
  };
  return { fetchFn, calls };
}

const orImage = (cost = 0.034) => ({ body: { choices: [{ message: { images: [{ image_url: { url: DATA } }] }, finish_reason: "stop" }], usage: { cost } } });
const deps = (s) => ({ fetch: s.fetchFn, retryDelayMs: 0 });

test("withStyle appends the frozen suffix exactly once", () => {
  const once = withStyle("a girl on a beach");
  assert.ok(once.endsWith(C.STYLE));
  assert.strictEqual(withStyle(once), once);
});

test("openrouter is the default provider and lite the default model", async () => {
  delete process.env.IMAGE_PROVIDER;
  delete process.env.OPENROUTER_IMAGE_MODEL;
  const s = stub([orImage()]);
  const r = await generateImage({ prompt: "a girl" }, deps(s));
  assert.strictEqual(r.provider, "openrouter");
  assert.strictEqual(r.model, DEFAULT_MODEL);
  assert.match(s.calls[0].url, /openrouter\.ai/);
  assert.strictEqual(s.calls[0].body.model, DEFAULT_MODEL);
});

test("sends square images by default and references as image_url parts", async () => {
  const s = stub([orImage()]);
  await generateImage({ prompt: "a girl", refs: [PNG, PNG] }, deps(s));
  const body = s.calls[0].body;
  assert.deepStrictEqual(body.image_config, { aspect_ratio: "1:1" });
  assert.deepStrictEqual(body.modalities, ["image", "text"]);
  const parts = body.messages[0].content;
  assert.strictEqual(parts.filter((p) => p.type === "image_url").length, 2);
  assert.ok(parts[0].text.endsWith(C.STYLE), "style suffix missing");
});

test("decodes the data URI into a buffer and reports the provider cost", async () => {
  const s = stub([orImage(0.0344)]);
  const r = await generateImage({ prompt: "a girl" }, deps(s));
  assert.ok(Buffer.isBuffer(r.buffer));
  assert.strictEqual(r.buffer.length, PNG.length);
  assert.strictEqual(r.costUsd, 0.0344);
});

test("retries once on a transient error, then succeeds", async () => {
  const s = stub([{ status: 502, body: { error: "bad gateway" } }, orImage()]);
  const r = await generateImage({ prompt: "a girl" }, deps(s));
  assert.ok(r.buffer);
  assert.strictEqual(s.calls.length, 2);
});

test("falls back to the next model when the primary keeps failing", async () => {
  const s = stub([
    { status: 500, body: { error: "boom" } },
    { status: 500, body: { error: "boom" } },
    orImage(0.067),
  ]);
  const r = await generateImage({ prompt: "a girl", models: ["primary/model", "backup/model"] }, deps(s));
  assert.strictEqual(r.model, "backup/model");
  assert.strictEqual(s.calls[2].body.model, "backup/model");
});

test("a content block is a verdict: no retry, no fallback, distinguishable error", async () => {
  const s = stub([{ status: 400, body: { error: { message: "blocked by safety filters" } } }]);
  await assert.rejects(
    () => generateImage({ prompt: "a girl", models: ["a", "b"] }, deps(s)),
    (e) => e instanceof ImageBlockedError
  );
  assert.strictEqual(s.calls.length, 1);
});

test("a SAFETY finish reason is also a block", async () => {
  const s = stub([{ body: { choices: [{ message: {}, native_finish_reason: "SAFETY" }] } }]);
  await assert.rejects(() => generateImage({ prompt: "x", models: ["a"] }, deps(s)), ImageBlockedError);
});

test("throws ImageError when every model fails for real", async () => {
  const s = stub([{ status: 500, body: { error: "down" } }]);
  await assert.rejects(() => generateImage({ prompt: "x", models: ["a", "b"] }, deps(s)), ImageError);
});

test("an unknown provider is rejected loudly", async () => {
  await assert.rejects(() => generateImage({ prompt: "x", provider: "dalle" }), /unknown image provider/);
});

test("minimax provider uses image-01 with a single subject reference", async () => {
  const s = stub([{ body: { data: { image_urls: ["https://cdn.example/img.png"] } } }, { body: "" }]);
  const r = await generateImage({ prompt: "a girl", refs: [PNG, PNG], provider: "minimax" }, deps(s));
  assert.strictEqual(r.model, "image-01");
  assert.match(s.calls[0].url, /minimax/);
  assert.strictEqual(s.calls[0].body.subject_reference.length, 1);
  assert.strictEqual(r.costUsd, 0.0035);
});

test("verifyPage reports ok only when character and style both match", async () => {
  const yes = async () => ({ data: { same_character: true, style_matches: true, issues: [] } });
  const no = async () => ({ data: { same_character: true, style_matches: false, issues: ["3D render"] } });
  assert.strictEqual((await verifyPage(PNG, PNG, { completeJson: yes })).ok, true);
  const r = await verifyPage(PNG, PNG, { completeJson: no });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.issues, ["3D render"]);
});

test("verifyPage fails open when the judge is down, and says so", async () => {
  const down = async () => { throw new Error("503"); };
  const r = await verifyPage(PNG, PNG, { completeJson: down });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.unverified, true);
});

test("verifyPage sends both images to the judge", async () => {
  let seen;
  const spy = async (args) => { seen = args; return { data: { same_character: true, style_matches: true, issues: [] } }; };
  await verifyPage(PNG, PNG, { completeJson: spy });
  const images = seen.messages[0].content.filter((p) => p.type === "image_url");
  assert.strictEqual(images.length, 2);
});

test("style:false leaves the prompt alone, so line art is not asked for watercolour", async () => {
  let seen;
  const fetchFn = async (_url, opts) => {
    seen = JSON.parse(opts.body);
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,AA==" } }] } }] }) };
  };
  await generateImage({ prompt: "black outlines only, no colour", style: false }, { fetch: fetchFn });
  const parts = seen.messages[0].content;
  assert.strictEqual(parts[0].text, "black outlines only, no colour");
  assert.ok(!parts[0].text.includes("watercolour"), "watercolour suffix leaked into a line-art prompt");
});

test("with a cache directory an identical image request is served from disk", async () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuentos-img-"));
  process.env.IMAGE_CACHE_DIR = dir;
  try {
    let calls = 0;
    const fetchFn = async () => {
      calls++;
      return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,QUJD" } }] } }] }) };
    };
    const a = await generateImage({ prompt: "a lighthouse at dusk" }, { fetch: fetchFn });
    const b = await generateImage({ prompt: "a lighthouse at dusk" }, { fetch: fetchFn });
    assert.strictEqual(calls, 1, "the second identical request must not hit the network");
    assert.deepStrictEqual(b.buffer, a.buffer);
    assert.strictEqual(b.costUsd, 0, "a cached image costs nothing");

    await generateImage({ prompt: "a different lighthouse" }, { fetch: fetchFn });
    assert.strictEqual(calls, 2, "a different prompt is a different image");
  } finally {
    delete process.env.IMAGE_CACHE_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
