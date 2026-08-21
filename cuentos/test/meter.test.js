const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { env } = require("../lib/env.js");
const meter = require("../lib/meter.js");

test("summary splits the spend by kind and by model", () => {
  meter.reset();
  meter.record("text", 0.0015, { model: "flash-lite", ms: 9000 });
  meter.record("image", 0.034, { model: "nano-lite", ms: 5000, label: "sheet" });
  meter.record("image", 0.034, { model: "nano-lite", ms: 5200, label: "page-1" });
  const s = meter.summary();
  assert.strictEqual(s.calls, 3);
  assert.ok(Math.abs(s.usd - 0.0695) < 1e-9);
  assert.strictEqual(s.byKind.image.calls, 2);
  assert.ok(Math.abs(s.byKind.image.usd - 0.068) < 1e-9);
  assert.strictEqual(s.byModel["flash-lite"].calls, 1);
});

test("a sub-cent call is kept, not rounded away", () => {
  meter.reset();
  meter.record("text", 0.0015, { model: "flash-lite" });
  assert.ok(meter.summary().usd > 0, "the story text must not vanish from the books");
});

test("COST_LOG appends one json line per call, and a broken path never throws", () => {
  meter.reset();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuentos-cost-"));
  const file = path.join(dir, "nested", "cost.jsonl");
  env.COST_LOG = file;
  try {
    meter.record("text", 0.002, { model: "m", ms: 10 });
    meter.record("image", 0.034, { model: "n", ms: 20 });
    const lines = fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[1].kind, "image");
    assert.strictEqual(lines[1].model, "n");

    env.COST_LOG = path.join(dir, "cost.jsonl", "impossible", "x.jsonl");
    assert.doesNotThrow(() => meter.record("text", 0.001, {}));
  } finally {
    delete env.COST_LOG;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("without COST_LOG nothing is written to disk", () => {
  meter.reset();
  delete env.COST_LOG;
  const before = meter.all().length;
  meter.record("text", 0.001, {});
  assert.strictEqual(meter.all().length, before + 1);
});
