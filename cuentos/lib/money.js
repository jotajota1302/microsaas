/*
 * Products, prices and VAT in one place, so nothing else in the codebase
 * carries a number in it.
 *
 * Pricing (revised 2026-08-21, second pass): 9,99 EUR in Spanish, 11,99 in
 * English. The first pass put the PDF in Etsy's mid tier at 12,90 because the
 * 5-7 $ tier there is "AI commodity". Two things moved it down:
 *
 *   - It is a DIGITAL-ONLY product now. Under ten euros is a decision a parent
 *     makes without thinking about it, and the whole funnel is built to be said
 *     yes to: the buyer has already read the story and seen their child drawn.
 *   - The printed book (20-25 EUR, pending a printer's quote) becomes where the
 *     margin lives. The PDF is the way in, not the profit.
 *
 * It costs margin, and the number to watch: about 0,57 EUR of AI per book sold,
 * roughly 2,10 EUR once the free scripts and samples that never convert are
 * spread over each sale, plus 5 % + 0,25 EUR of Stripe Managed Payments. That
 * leaves ~6,80 EUR a sale against ~9,40 at 12,90 — so this price has to convert
 * about 40 % better to be worth it. If it does not, the ceiling to test next is
 * 11,99, not 12,90.
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
    priceCents: 999,
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
    priceCents: 1199,
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
