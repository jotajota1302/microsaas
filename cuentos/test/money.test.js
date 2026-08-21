const { test } = require("node:test");
const assert = require("node:assert");
const M = require("../lib/money.js");

test("the Spanish story costs 11,99 EUR, is digital and pays book VAT", () => {
  const p = M.product("pdf");
  assert.strictEqual(p.priceCents, 1199);
  assert.strictEqual(p.kind, "digital");
  assert.strictEqual(p.vatRate, 0.04);
});

test("the English story costs 13,99 EUR", () => {
  assert.strictEqual(M.product("pdf_en").priceCents, 1399);
  assert.strictEqual(M.product("pdf_en").vatRate, 0.04);
});

test("storyProductFor picks the product by locale and defaults to Spanish", () => {
  assert.strictEqual(M.storyProductFor("en").id, "pdf_en");
  assert.strictEqual(M.storyProductFor("es").id, "pdf");
  assert.strictEqual(M.storyProductFor(undefined).id, "pdf");
});

test("colouring credits pay 21 %, not book VAT", () => {
  assert.strictEqual(M.product("credits").vatRate, 0.21);
  assert.strictEqual(M.product("credits").credits, 20);
});

test("every product is digital and carries the 103m consent", () => {
  for (const p of Object.values(M.PRODUCTS)) {
    assert.strictEqual(p.kind, "digital", `${p.id} is not digital`);
    assert.strictEqual(p.withdrawalArticle, "103m", `${p.id} lacks the 103m consent`);
  }
});

test("there is no physical product in the catalogue", () => {
  assert.ok(!("hardcover" in M.PRODUCTS));
  assert.ok(!("softcover" in M.PRODUCTS));
});

test("total equals price: nothing is shipped", () => {
  for (const p of Object.values(M.PRODUCTS)) {
    assert.strictEqual(M.totalCents(p.id), p.priceCents);
  }
});

test("VAT is extracted from the gross price, not added on top", () => {
  // 1199 gross at 4 % -> 1199 - 1199/1.04 = 46,1 -> 46 cents
  assert.strictEqual(M.vatCents("pdf"), 46);
  // 499 gross at 21 % -> 86,6 -> 87 cents
  assert.strictEqual(M.vatCents("credits"), 87);
});

test("an unknown product is rejected instead of priced at zero", () => {
  assert.throws(() => M.product("hardcover"), /unknown product/);
  assert.throws(() => M.totalCents("poster"), /unknown product/);
});

test("prices are frozen: nothing can change them at runtime", () => {
  assert.throws(() => {
    "use strict";
    M.PRODUCTS.pdf.priceCents = 1;
  }, TypeError);
});

test("the AI ceilings leave room under the story price", () => {
  assert.strictEqual(M.MAX_AI_COST_CENTS, 150);
  assert.strictEqual(M.PREVIEW_BUDGET_CENTS, 25);
  assert.ok(M.MAX_AI_COST_CENTS < M.product("pdf").priceCents / 4);
});

test("amounts are formatted in euros for both locales", () => {
  assert.match(M.formatEur(1199, "es"), /11,99/);
  assert.match(M.formatEur(1490, "en"), /14\.90/);
});

test("every product carries both labels for the bilingual landing", () => {
  for (const p of Object.values(M.PRODUCTS)) {
    assert.ok(p.es && p.en, `${p.id} is missing a label`);
  }
});
