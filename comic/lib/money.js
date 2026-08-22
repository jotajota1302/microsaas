/*
 * The price, the VAT and the product name, in one file so that no other file
 * in the codebase carries a number in it.
 *
 * Price (2026-08-22): 14,99 EUR, digital only.
 *
 * Why more than the 11,99 of `cuentos` when the pipeline is the same: this
 * product has to clear TWO filters instead of one. The adult has to think it
 * is a good present, and the teenager has to not be embarrassed by it. A
 * present for a 15-year-old at 11,99 reads as a novelty; the same thing at
 * 14,99 reads as a book. And the buyer here is not the reader, so the price
 * is not weighed against "what I get" but against "what I turn up with".
 *
 * The arithmetic, per sale, at 14,99:
 *   - Stripe Managed Payments, when it is available to us: 5 % + 0,25 = 1,00
 *   - plain Stripe card EEE, when it is not: 1,5 % + 0,25 = 0,47
 *   - VAT inside the price at 4 %: 0,58
 *   - AI actually spent on ONE finished comic: 0,22 (78 panels + cover + script)
 *   - AI given away to people who never buy: the free preview is 0,01, so a
 *     conversion of 1 in 20 adds ~0,20 of previews per sale.
 * Margin around 12,99 with the MoR, 13,52 without. The cost of the product is
 * not what threatens this margin — the cost of the previews is, and that is
 * what MAX_PREVIEWS_PER_DAY exists to cap.
 *
 * VAT (Spain), same reading as `cuentos` and for the same reasons: e-books pay
 * 4 % since RDL 15/2020, confirmed by DGT V3388-20, and a comic in PDF is a
 * book for VAT purposes. The binding ruling on a *personalised* book is still
 * pending; if it comes back at 21 %, this file is the only thing that changes.
 *
 * Amounts are integer cents, always. Never floats for money.
 */

const PRODUCT = Object.freeze({
  id: "comic_pdf",
  kind: "digital",
  priceCents: 1499,
  currency: "eur",
  vatRate: 0.04,
  taxCode: "txcd_10302000", // Stripe: Digital Books
  // Spanish consumer law: a digital download loses the 14-day withdrawal right
  // only if the buyer consented to immediate delivery AND acknowledged the
  // loss. That consent is collected by the Checkout page, not by our form.
  withdrawalArticle: "103m",
  name: {
    es: "Cómic personalizado en PDF",
    en: "Personalised comic as a PDF",
  },
  description: {
    es: "14 páginas en estilo manga, protagonizadas por quien tú digas. Entrega por email.",
    en: "14 manga-style pages starring whoever you choose. Delivered by email.",
  },
});

/** "14,99 €" / "€14.99", for anything the buyer reads. */
function format(cents, lang) {
  return new Intl.NumberFormat(lang === "en" ? "en-IE" : "es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** The VAT already contained in a gross amount. For the invoice, not the price. */
function vatOf(cents, rate = PRODUCT.vatRate) {
  return Math.round(cents - cents / (1 + rate));
}

module.exports = { PRODUCT, format, vatOf };
