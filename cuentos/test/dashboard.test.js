const { test } = require("node:test");
const assert = require("node:assert");
const D = require("../lib/dashboard.js");

const NOW = new Date("2026-08-21T12:00:00Z").getTime();
const ago = (h) => new Date(NOW - h * 3600000).toISOString();

test("health never leaks a secret's value, only whether it is there", () => {
  // A distinctive value, not the word "secret": that appears legitimately in
  // the variable NAME STRIPE_SECRET_KEY, which the hints are allowed to show.
  const value = "eyJhbGciOi.zzTOPzz.value";
  const h = D.health({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: value, STRIPE_SECRET_KEY: value, RESEND_API_KEY: value });
  const json = JSON.stringify(h);
  assert.ok(!json.includes("zzTOPzz"), "the panel is served to a browser; no value may travel");
  assert.strictEqual(h.items.find((i) => i.id === "supabase").ok, true);
});

test("health lists what is missing and refuses to call itself ready", () => {
  const h = D.health({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", OPENROUTER_API_KEY: "o", ADMIN_TOKEN: "a" });
  assert.strictEqual(h.ready, false);
  assert.deepStrictEqual(h.missing.sort(), ["email", "pay"]);
  const ready = D.health({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", OPENROUTER_API_KEY: "o", ADMIN_TOKEN: "a", RESEND_API_KEY: "r", STRIPE_SECRET_KEY: "s" });
  assert.strictEqual(ready.ready, true);
});

test("any of the three payment routes counts as cobro configured", () => {
  for (const k of ["STRIPE_SECRET_KEY", "PAYMENT_URL", "ETSY_LISTING_URL"]) {
    const h = D.health({ [k]: "x" });
    assert.strictEqual(h.items.find((i) => i.id === "pay").ok, true, k);
  }
  assert.strictEqual(D.health({}).items.find((i) => i.id === "pay").detail, "sin configurar");
});

// A sale must still count as having read the script, or the conversion rate
// climbs as customers advance and the funnel reads backwards.
test("the funnel counts each step cumulatively", () => {
  const orders = [
    { status: "script" }, { status: "script" }, { status: "sample" },
    { status: "paid" }, { status: "delivered" }, { status: "expired" }, { status: "failed" },
  ];
  const f = D.funnel(orders);
  assert.strictEqual(f.scripts, 5, "expired and failed never reached the script gate");
  assert.strictEqual(f.samples, 3);
  assert.strictEqual(f.paid, 2);
  assert.strictEqual(f.delivered, 1);
  assert.strictEqual(f.scriptToSample, 60);
  assert.strictEqual(f.sampleToPaid, 66.7);
  assert.strictEqual(f.expired, 1);
  assert.strictEqual(f.failed, 1);
});

test("an empty funnel divides by zero without exploding", () => {
  const f = D.funnel([]);
  assert.strictEqual(f.scriptToSample, 0);
  assert.strictEqual(f.sampleToPaid, 0);
});

test("economics charges Etsy its share and a card its fixed part", () => {
  const orders = [
    { status: "delivered", price_cents: 1290, vat_rate: 0.04, channel: "etsy" },
    { status: "paid", price_cents: 1290, vat_rate: 0.04, channel: "web" },
    { status: "script", price_cents: 1290, vat_rate: 0.04, channel: "web" },
  ];
  const jobs = [{ cost_cents: 53 }, { cost_cents: 53 }, { cost_cents: 0 }];
  const e = D.economics(orders, jobs);
  assert.strictEqual(e.sold, 2);
  assert.ok(Math.abs(e.costEur - 1.06) < 1e-9);
  assert.ok(Math.abs(e.feeEur - (12.9 * 0.182 + 12.9 * 0.015 + 0.25)) < 1e-9);
  assert.ok(e.marginEur > 0 && e.marginEur < e.netOfVat, "margin sits under the net of VAT");
  assert.ok(Math.abs(e.costPerOrderEur - 1.06 / 3) < 1e-9);
});

test("overview splits today from the week", () => {
  const orders = [
    { status: "paid", price_cents: 1290, vat_rate: 0.04, channel: "web", created_at: ago(2) },
    { status: "script", price_cents: 1290, vat_rate: 0.04, channel: "web", created_at: ago(50) },
    { status: "script", price_cents: 1290, vat_rate: 0.04, channel: "web", created_at: ago(400) },
  ];
  const jobs = [{ cost_cents: 53, created_at: ago(2) }, { cost_cents: 1, created_at: ago(50) }];
  const o = D.overview({ orders, jobs, env: {}, now: NOW });
  assert.strictEqual(o.today.orders, 1);
  assert.strictEqual(o.week.orders, 2, "400 hours ago is outside the week");
  assert.ok(Math.abs(o.today.economics.costEur - 0.53) < 1e-9);
  assert.ok(Math.abs(o.week.economics.costEur - 0.54) < 1e-9);
  assert.strictEqual(o.price.pdfEur, 12.9);
  assert.strictEqual(o.caps.scriptsPerDay, 200);
});
