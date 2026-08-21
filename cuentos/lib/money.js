/*
 * Products, prices and VAT in one place, so nothing else in the codebase
 * carries a number in it.
 *
 * Pricing (2026-08-21): 11,99 EUR in Spanish, 13,99 in English.
 *
 * It started at 12,90, from Etsy's mid tier (the 5-7 $ tier there is "AI
 * commodity"). Two things argued for less: the product is DIGITAL-ONLY, and it
 * is bought at the end of a funnel designed to be said yes to — the buyer has
 * already read the story and seen their child drawn. And the printed book
 * (20-25 EUR, pending a printer's quote) is where the margin will live, which
 * makes the PDF the way in rather than the profit.
 *
 * 9,99 was considered and rejected: it gives up 2,64 EUR a sale and would have
 * to convert 40 % better to break even. 11,99 sits under the same psychological
 * line and gives up only 0,82, so it needs about 10 %.
 *
 * The arithmetic, per sale: 5 % + 0,25 EUR of Stripe Managed Payments, 4 % VAT
 * inside the price, and ~2,10 EUR of AI — 0,57 is what a book costs to make,
 * the rest is the scripts and samples given to people who never buy. Margin
 * ~8,58 EUR against ~9,40 at 12,90.
 *
 * VAT (Spain): children's books are "libro" for VAT purposes and pay 4 %,
 * and so does the PDF (e-books at 4 % since RDL 15/2020, DGT V3388-20).
 * Loose colouring sheets are not a book: 21 %, the conservative reading.
 * A binding ruling from the DGT on the *personalised* book is still pending;
 * if it comes back at 21 %, change only this file.
 *
 * Amounts are integer cents, always. Never floats for money.
 */

const PRODUCTS = Object.freeze({
  pdf: Object.freeze({
    id: "pdf",
    kind: "digital",
    locale: "es",
    es: "Cuento personalizado en PDF",
    en: "Personalised story (Spanish)",
    priceCents: 1199,
    vatRate: 0.04,
    taxCode: "txcd_10302000", // Stripe: Digital Books
    withdrawalArticle: "103m", // needs the explicit consent checkbox
  }),
  pdf_en: Object.freeze({
    id: "pdf_en",
    kind: "digital",
    locale: "en",
    es: "Cuento personalizado en PDF (inglés)",
    en: "Personalised story as a PDF",
    priceCents: 1399,
    vatRate: 0.04,
    taxCode: "txcd_10302000",
    withdrawalArticle: "103m",
  }),
  credits: Object.freeze({
    id: "credits",
    kind: "digital",
    locale: "any",
    es: "20 créditos para colorear",
    en: "20 colouring credits",
    priceCents: 499,
    vatRate: 0.21,
    taxCode: "txcd_10000000", // general digital services
    withdrawalArticle: "103m",
    credits: 20,
  }),
});

/** Hard ceiling per generated story, preview + full together. */
const MAX_AI_COST_CENTS = 150;

/** What a free preview may cost us: text + sheet + 3 illustrations. */
const PREVIEW_BUDGET_CENTS = 25;

function product(id) {
  const found = PRODUCTS[id];
  if (!found) throw new Error(`[cuentos] unknown product "${id}"`);
  return found;
}

/** The story product for a given locale. */
function storyProductFor(locale) {
  return locale === "en" ? PRODUCTS.pdf_en : PRODUCTS.pdf;
}

/** What the customer pays. No shipping: everything is digital. */
function totalCents(id) {
  return product(id).priceCents;
}

/** The VAT contained in a gross amount (Spanish prices are VAT-inclusive). */
function vatCents(id, grossCents = totalCents(id)) {
  const p = product(id);
  return Math.round(grossCents - grossCents / (1 + p.vatRate));
}

function formatEur(cents, locale = "es") {
  return new Intl.NumberFormat(locale === "en" ? "en-IE" : "es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

module.exports = {
  PRODUCTS,
  MAX_AI_COST_CENTS,
  PREVIEW_BUDGET_CENTS,
  product,
  storyProductFor,
  totalCents,
  vatCents,
  formatEur,
};
