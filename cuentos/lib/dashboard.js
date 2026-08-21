/*
 * What the operator needs to know at a glance: which integrations are wired,
 * how the funnel is converting, and what it has cost.
 *
 * Pure functions over rows and environment names — no network, no database —
 * so the arithmetic that decides "is this business working" is testable and
 * lives in one place instead of being scattered through page markup.
 */

const money = require("./money.js");

const USD_EUR = 0.92;

/**
 * Integration status. Reports only whether a secret is PRESENT, never its
 * value: this ships to a browser.
 *
 * `required` marks what the product cannot sell without. `blocking` is what
 * stops it working at all today.
 */
function health(env = {}) {
  const has = (k) => Boolean(env[k] && String(env[k]).trim());
  const items = [
    { id: "supabase", name: "Base de datos", detail: "Supabase · schema cuentos", ok: has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"), required: true, hint: "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY" },
    { id: "text", name: "Texto", detail: env.TEXT_MODEL || "OpenRouter", ok: has("OPENROUTER_API_KEY"), required: true, hint: "OPENROUTER_API_KEY" },
    { id: "image", name: "Ilustración", detail: env.OPENROUTER_IMAGE_MODEL || "OpenRouter", ok: has("OPENROUTER_API_KEY"), required: true, hint: "OPENROUTER_API_KEY" },
    { id: "email", name: "Correo", detail: env.EMAIL_FROM || "Resend", ok: has("RESEND_API_KEY"), required: true, hint: "RESEND_API_KEY · sin esto nadie recibe su libro" },
    { id: "pay", name: "Cobro", detail: has("STRIPE_SECRET_KEY") ? "Stripe" : has("PAYMENT_URL") ? "enlace de pago" : has("ETSY_LISTING_URL") ? "Etsy" : "sin configurar", ok: has("STRIPE_SECRET_KEY") || has("PAYMENT_URL") || has("ETSY_LISTING_URL"), required: true, hint: "STRIPE_SECRET_KEY, PAYMENT_URL o ETSY_LISTING_URL" },
    { id: "admin", name: "Acceso al panel", detail: "ADMIN_TOKEN", ok: has("ADMIN_TOKEN"), required: true, hint: "ADMIN_TOKEN" },
    { id: "cron", name: "Reanudar trabajos", detail: "CRON_SECRET", ok: has("CRON_SECRET"), required: false, hint: "CRON_SECRET" },
  ];
  const missing = items.filter((i) => !i.ok && i.required).map((i) => i.id);
  return { items, missing, ready: missing.length === 0 };
}

const DAY = 86400000;

/** Orders created on or after `since`. */
function since(rows, ms, now = Date.now()) {
  const from = now - ms;
  return rows.filter((r) => new Date(r.created_at).getTime() >= from);
}

/**
 * The funnel, counted from order status. An order that reached a later stage
 * has passed through the earlier ones, so each step counts everything at or
 * beyond it — otherwise a sale would vanish from "read the script".
 */
const REACHED = {
  script: ["script", "sample", "paid", "needs_review", "delivered", "refunded"],
  sample: ["sample", "paid", "needs_review", "delivered", "refunded"],
  paid: ["paid", "needs_review", "delivered", "refunded"],
  delivered: ["delivered"],
};

function funnel(orders) {
  const n = (key) => orders.filter((o) => REACHED[key].includes(o.status)).length;
  const scripts = n("script"), samples = n("sample"), paid = n("paid");
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    scripts, samples, paid, delivered: n("delivered"),
    failed: orders.filter((o) => o.status === "failed").length,
    expired: orders.filter((o) => o.status === "expired").length,
    scriptToSample: pct(samples, scripts),
    sampleToPaid: pct(paid, samples),
    scriptToPaid: pct(paid, scripts),
  };
}

/** What has been spent, and what is left after the fee on what was sold. */
function economics(orders, jobs) {
  const costEur = jobs.reduce((a, j) => a + (j.cost_cents || 0), 0) / 100;
  const sold = orders.filter((o) => REACHED.paid.includes(o.status));
  const grossEur = sold.reduce((a, o) => a + (o.price_cents || 0), 0) / 100;
  const netOfVat = sold.reduce((a, o) => a + (o.price_cents || 0) / (1 + Number(o.vat_rate || 0)), 0) / 100;
  const feeEur = sold.reduce((a, o) => {
    const p = (o.price_cents || 0) / 100;
    // Etsy takes a share of the sale; a card charge is a fixed part plus a bit.
    return a + (o.channel === "etsy" ? p * 0.182 : p * 0.015 + 0.25);
  }, 0);
  return {
    costEur, grossEur, netOfVat, feeEur,
    marginEur: netOfVat - feeEur - costEur,
    sold: sold.length,
    costPerOrderEur: orders.length ? costEur / orders.length : 0,
  };
}

/** Everything the dashboard renders, from two lists of rows. */
function overview({ orders = [], jobs = [], env = {}, now = Date.now() } = {}) {
  const today = since(orders, DAY, now);
  const week = since(orders, 7 * DAY, now);
  const jobsWeek = since(jobs, 7 * DAY, now);
  return {
    health: health(env),
    today: { orders: today.length, funnel: funnel(today), economics: economics(today, since(jobs, DAY, now)) },
    week: { orders: week.length, funnel: funnel(week), economics: economics(week, jobsWeek) },
    caps: { scriptsPerDay: Number(env.MAX_SCRIPTS_PER_DAY || 200), samplesPerDay: Number(env.MAX_SAMPLES_PER_DAY || 40) },
    price: { pdfEur: money.PRODUCTS.pdf.priceCents / 100, currency: "EUR" },
    usdEur: USD_EUR,
  };
}

module.exports = { health, funnel, economics, overview, since, REACHED };
