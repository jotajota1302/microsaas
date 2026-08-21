/*
 * Phase 0 spike — what does a 20x20 cm, 32-page hardcover really cost to
 * produce and ship to Spain, and how long does it take?
 *
 * Needs a free Gelato account (GELATO_API_KEY in .env). Without it the script
 * prints exactly what to do instead of failing silently.
 *
 * Usage: node scripts/spike-pod.js [--postcode 28001] [--country ES]
 */

const { env } = require("../lib/env.js");

const POSTCODE = argOf("postcode", "28001");
const COUNTRY = argOf("country", "ES");

// Gelato product uids for photo books. The catalogue is queried first so we
// never hard-code a uid that has been renamed.
const CATALOGUE_URL = "https://product.gelatoapis.com/v3/catalogs/photo-books";
const PRICE_URL = "https://product.gelatoapis.com/v3/products";
const QUOTE_URL = "https://order.gelatoapis.com/v4/orders:quote";
const PAGE_COUNT = 32;

function argOf(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function gelato(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "X-API-KEY": env.GELATO_API_KEY, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return data;
}

(async () => {
  if (!env.GELATO_API_KEY) {
    console.log(`
[cuentos] GELATO_API_KEY is not set.

To run this spike:
  1. Create a free account at https://dashboard.gelato.com (no card needed).
  2. Copy the API key from Developers > API keys.
  3. Put GELATO_API_KEY=... in cuentos/.env
  4. Run: node scripts/spike-pod.js

What we need to learn, and the decision rule for each:
  - Production cost of a 20x20 cm hardcover photo book with ${PAGE_COUNT} interior pages.
  - Shipping cost and delivery time to ${COUNTRY} ${POSTCODE}.
  - Which country actually prints it (we promise 7 days in Spain).
  - Cover dimensions returned for ${PAGE_COUNT} pages (spine width for the print PDF).

  DECISION: if production + shipping > 18 EUR, or delivery > 7 days, re-run the
  same quote against Peecho at 24 pages, or raise the price to 39,90 EUR.
`);
    process.exit(0);
  }

  console.log(`[cuentos] querying Gelato photo-book catalogue...`);
  const catalogue = await gelato(CATALOGUE_URL);
  console.log(JSON.stringify(catalogue, null, 2).slice(0, 2000));

  // The catalogue response tells us the attribute names; search it for a
  // 200x200 mm hardcover and print every candidate so we can pick by hand.
  const flat = JSON.stringify(catalogue);
  const looksSquare = /200x200|20x20|8x8/i.test(flat);
  console.log(`\n[cuentos] catalogue mentions a square 20x20 format: ${looksSquare}`);

  const uid = argOf("uid");
  if (!uid) {
    console.log(`
[cuentos] Next step: pick the product uid for "hardcover photo book, 200x200 mm,
${PAGE_COUNT} pages" from the catalogue above and re-run:

  node scripts/spike-pod.js --uid <product-uid>

That call will fetch cover dimensions and a real quote to ${COUNTRY} ${POSTCODE}.`);
    process.exit(0);
  }

  console.log(`\n[cuentos] cover dimensions for ${PAGE_COUNT} pages...`);
  const cover = await gelato(
    `${PRICE_URL}/${encodeURIComponent(uid)}/cover-dimensions?pageCount=${PAGE_COUNT}`
  );
  console.log(JSON.stringify(cover, null, 2));

  console.log(`\n[cuentos] quoting one unit to ${COUNTRY} ${POSTCODE}...`);
  const quote = await gelato(QUOTE_URL, {
    method: "POST",
    body: JSON.stringify({
      orderReferenceId: "spike-" + PAGE_COUNT,
      customerReferenceId: "spike",
      currency: "EUR",
      recipient: {
        countryIsoCode: COUNTRY,
        postCode: POSTCODE,
        city: "Madrid",
        addressLine1: "Calle de prueba 1",
        firstName: "Spike",
        lastName: "Test",
        email: "spike@example.com",
      },
      products: [
        {
          itemReferenceId: "book-1",
          productUid: uid,
          pageCount: PAGE_COUNT,
          quantity: 1,
        },
      ],
    }),
  });

  console.log(JSON.stringify(quote, null, 2));

  const quotes = (quote.quotes || []).flatMap((q) => q.shipmentMethods || []);
  if (quotes.length) {
    console.log("\n=== shipping options ===");
    for (const s of quotes) {
      console.log(
        `${s.name || s.shipmentMethodUid}: ${s.price} ${s.currency}, ` +
        `${s.minDeliveryDays}-${s.maxDeliveryDays} days, from ${s.countryOfProduction || "?"}`
      );
    }
  }

  console.log(`
=== decision rule ===
production + shipping <= 18 EUR and delivery <= 7 days  -> keep 34,90 EUR and Gelato
otherwise                                               -> try Peecho at 24 pages,
                                                           or raise the price to 39,90 EUR
Write the numbers into docs/fase-0-resultados.md.`);
})().catch((e) => {
  console.error("[cuentos] spike-pod failed:", e.message);
  process.exit(1);
});
