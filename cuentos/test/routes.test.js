/*
 * The routing table, checked against reality.
 *
 * Several endpoints share one function file because Vercel's Hobby plan allows
 * twelve of them and we had thirteen — the deployment failed outright, which
 * is a silly way to have a shop closed. The mapping now lives in vercel.json,
 * so these tests make sure it points at files that exist and endpoints that
 * are actually carried, and that the count stays under the limit.
 */

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const apiFiles = fs.readdirSync(path.join(ROOT, "api")).filter((f) => f.endsWith(".js"));

test("the deployment stays under the twelve-function limit", () => {
  assert.ok(apiFiles.length <= 12, `${apiFiles.length} functions: over the Hobby limit, the deployment would fail`);
});

test("every api rewrite lands on a file that carries that endpoint", () => {
  const apiRewrites = vercel.rewrites.filter((r) => r.source.startsWith("/api/"));
  assert.ok(apiRewrites.length >= 9, "the small endpoints are reached through rewrites");

  for (const r of apiRewrites) {
    const [dest, search] = r.destination.split("?");
    const file = path.join(ROOT, dest + ".js");
    assert.ok(fs.existsSync(file), `${r.source} → ${dest}: no such function file`);

    const fn = new URLSearchParams(search).get("fn");
    assert.ok(fn, `${r.source} → ${r.destination}: no fn to dispatch on`);
    const handler = require(file);
    assert.ok(Array.isArray(handler.routes), `${dest} is not a router`);
    assert.ok(handler.routes.includes(fn), `${dest} does not carry "${fn}" (it has ${handler.routes.join(", ")})`);
  }
});

test("every endpoint the front calls is reachable", () => {
  // The paths the browser and the emails use. A file was deleted in the
  // consolidation and nothing else would notice until a customer clicked.
  const used = ["/api/order", "/api/story", "/api/revise", "/api/approve", "/api/checkout", "/api/resume", "/api/config", "/api/waitlist", "/api/print-interest", "/api/recover", "/api/admin"];
  for (const p of used) {
    const direct = fs.existsSync(path.join(ROOT, p.slice(1) + ".js"));
    const rewritten = vercel.rewrites.some((r) => r.source === p);
    assert.ok(direct || rewritten, `${p} is neither a function nor a rewrite`);
  }
});

test("the functions listed for a duration budget all exist", () => {
  for (const f of Object.keys(vercel.functions || {})) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is configured but does not exist`);
  }
});

test("an unknown fn is a 404, not a crash", async () => {
  const handler = require(path.join(ROOT, "api", "flow.js"));
  let status = null;
  const res = { setHeader() {}, end() {}, get statusCode() { return status; }, set statusCode(v) { status = v; } };
  await handler({ method: "POST", url: "/api/flow?fn=nonsense", headers: {}, query: { fn: "nonsense" } }, res);
  assert.strictEqual(status, 404);
});
