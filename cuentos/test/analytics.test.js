const { test } = require("node:test");
const assert = require("node:assert");
const A = require("../lib/analytics.js");

// --- what we refuse to keep ---------------------------------------------------

test("a story token never reaches the events table", () => {
  // /c/<token> IS the key to somebody's book. It must not sit in a statistics
  // table that a dashboard reads back.
  const row = A.toRow({ name: "view", path: "/c/abcdefghijklmnopqrstuv", visit: "v1" });
  assert.strictEqual(row.path, "/c");
});

test("the referrer is kept as a host, never as a URL", () => {
  // A full referrer carries the search that brought them: a query string is
  // free text somebody typed.
  assert.strictEqual(A.refHost("https://www.google.com/search?q=cuento+para+mi+hija"), "google.com");
  assert.strictEqual(A.refHost("nonsense"), "");
  assert.strictEqual(A.refHost(""), "");
});

test("only the three UTM fields survive, bounded", () => {
  const utm = A.utmOf({ source: "etsy", medium: "social", campaign: "x".repeat(200), content: "secreto", email: "a@b.c" });
  assert.deepStrictEqual(Object.keys(utm), ["source", "medium", "campaign"]);
  assert.strictEqual(utm.campaign.length, 60);
});

test("an event nobody asked for is dropped, not stored", () => {
  assert.strictEqual(A.toRow({ name: "keystroke", path: "/" }), null);
  assert.strictEqual(A.toRow({}), null);
  assert.strictEqual(A.toRow(null), null);
});

test("the device is a closed list and the locale only ever two", () => {
  assert.strictEqual(A.toRow({ name: "view", device: "reloj" }).device, null);
  assert.strictEqual(A.toRow({ name: "view", device: "movil" }).device, "movil");
  assert.strictEqual(A.toRow({ name: "view", locale: "fr" }).locale, "es");
});

// --- the funnel ----------------------------------------------------------------

const ev = (name, visit, extra = {}) => ({ id: Math.random(), name, visit, utm: {}, ...extra });

test("visits count people, not page views", () => {
  const events = [ev("view", "v1"), ev("view", "v1"), ev("view", "v1"), ev("view", "v2")];
  assert.strictEqual(A.funnel(events, []).steps[0].n, 2);
});

test("each step is a percentage of the one above it, and the last is of the first", () => {
  const events = [ev("view", "v1"), ev("view", "v2"), ev("view", "v3"), ev("view", "v4"), ev("cta", "v1"), ev("cta", "v2"), ev("form_start", "v1"), ev("checkout_click", "v1")];
  const orders = [{ status: "paid" }, { status: "script" }];
  const f = A.funnel(events, orders);
  const by = Object.fromEntries(f.steps.map((s) => [s.id, s]));
  assert.strictEqual(by.visits.n, 4);
  assert.strictEqual(by.cta.rate, 50, "2 of 4 visits pressed the button");
  assert.strictEqual(by.form_start.rate, 50, "1 of the 2 who pressed it started the form");
  assert.strictEqual(by.paid.n, 1);
  assert.strictEqual(f.visitToPaid, 25, "one book out of four visits");
});

test("the paid steps come from the orders, never from a click we hope was fired", () => {
  // A click can be blocked, an ad blocker can eat it, a beacon can be dropped.
  // A paid order cannot.
  const f = A.funnel([], [{ status: "delivered" }, { status: "needs_review" }, { status: "sample" }]);
  const by = Object.fromEntries(f.steps.map((s) => [s.id, s]));
  assert.strictEqual(by.sample.n, 3, "everyone who paid also saw the sample");
  assert.strictEqual(by.paid.n, 2);
});

test("no visits means no division by zero anywhere", () => {
  const f = A.funnel([], []);
  assert.strictEqual(f.visitToPaid, 0);
  for (const s of f.steps) assert.ok(s.rate === null || Number.isFinite(s.rate));
});

// --- where they came from --------------------------------------------------------

test("a utm source beats the referrer, and no referrer is 'directo'", () => {
  const events = [
    ev("view", "v1", { ref: "google.com" }),
    ev("view", "v2", { ref: "google.com", utm: { source: "etsy" } }),
    ev("view", "v3", { ref: "" }),
  ];
  assert.deepStrictEqual(A.sources(events), [
    { source: "google.com", visits: 1 },
    { source: "etsy", visits: 1 },
    { source: "directo", visits: 1 },
  ]);
});

test("a visit is counted once however many pages it reads", () => {
  const events = [ev("view", "v1", { ref: "etsy.com", path: "/" }), ev("view", "v1", { ref: "etsy.com", path: "/crear/" })];
  assert.deepStrictEqual(A.sources(events), [{ source: "etsy.com", visits: 1 }]);
  assert.deepStrictEqual(A.pages(events), [{ path: "/", views: 1 }, { path: "/crear/", views: 1 }]);
});
