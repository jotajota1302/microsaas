/*
 * The price, the VAT and the product name, in one file so that no other file
 * in the codebase carries a number in it.
 *
 * Precio (2026-08-23): 9,99 EUR. SOLO EDICIÓN DIGITAL — no hay impreso, ni
 * como opción ni como promesa, y nada en el sitio debe insinuarlo.
 *
 * Bajado desde 14,99 por decisión de JJ. El argumento del precio alto era que
 * un regalo para un chaval de quince a 11,99 se lee como una tontería y a
 * 14,99 como un libro; el argumento de bajarlo es que este producto todavía no
 * ha vendido nada y un euro de menos en la barrera vale más que un euro de más
 * en el margen. Se puede subir cuando haya conversión medida; bajarlo después
 * de haber vendido es lo que no se puede hacer.
 *
 * Lo que NO cambia: el coste medido es 0,92 € por venta contando las veinte
 * vistas previas que hacen falta para una. A 9,99 eso es el 9,2 % del precio
 * en vez del 6,1 %. Sigue siendo un producto con margen; deja de serlo si la
 * conversión baja de 1 de cada 30.
 *
 * La cuenta, por venta, a 9,99:
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
  priceCents: 999,
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
    // Sin número: la extensión va por banda de edad (12, 14 o 16 páginas) y
    // prometer catorce a quien va a recibir doce es una reclamación servida.
    es: "Un cómic en estilo manga, protagonizado por quien tú digas. Entrega por email.",
    en: "A manga-style comic starring whoever you choose. Delivered by email.",
  },
});

/** "9,99 €" / "€9.99", para todo lo que lee el comprador. */
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
