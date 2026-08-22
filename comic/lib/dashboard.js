/*
 * What the operator needs to know at a glance: what is wired, how the funnel
 * is converting, what it cost, and the one short queue that actually needs a
 * human.
 *
 * Pure functions over rows and environment NAMES — no network, no store, no
 * markup. The arithmetic that answers "is this working" lives in one testable
 * place instead of being scattered through a page.
 *
 * Shape borrowed from cuentos/lib/dashboard.js. What is deliberately NOT
 * borrowed is an approval step: this panel does not gate delivery. A comic
 * that passes the validators is sent the moment it is finished, and the only
 * thing that ever waits for a person is `needs_attention` — a comic we already
 * know is broken. Watching is the job; approving is not.
 */

const { PRODUCT } = require("./money.js");

const DAY = 86400000;
const USD_EUR = 0.92;

/** What one image costs from the provider, measured. */
const IMAGE_USD = 0.0035;
/** Script, critique, rewrite, dialogue polish. Measured at about a cent. */
const SCRIPT_USD = 0.01;

/**
 * Integration status. Reports only whether a secret is PRESENT, never its
 * value: this ends up in a browser.
 *
 * `required` marks what the product cannot sell without.
 */
function health(env = {}) {
  const has = (k) => Boolean(env[k] && String(env[k]).trim());
  const testMode = String(env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");

  const items = [
    {
      id: "store", name: "Almacén", required: true,
      detail: env.STORE === "supabase" ? "Supabase · schema comic" : "ficheros en out/ (solo desarrollo)",
      ok: env.STORE !== "supabase" || (has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY")),
      hint: "STORE=supabase con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY",
    },
    {
      id: "text", name: "Guion", detail: env.MINIMAX_MODEL || "MiniMax M3", required: true,
      ok: has("MINIMAX_API_KEY"), hint: "MINIMAX_API_KEY",
    },
    {
      id: "critic", name: "Editor", required: false,
      detail: has("OPENROUTER_API_KEY") ? (env.CRITIC_MODEL || "GPT-5 mini vía OpenRouter") : "sin editor cruzado: el guionista se corrige a sí mismo",
      ok: has("OPENROUTER_API_KEY"), hint: "OPENROUTER_API_KEY",
    },
    {
      id: "image", name: "Dibujo", detail: env.IMAGE_PROVIDER || "MiniMax image-01", required: true,
      ok: has("MINIMAX_API_KEY"), hint: "MINIMAX_API_KEY",
    },
    {
      id: "email", name: "Correo", required: true,
      detail: has("RESEND_API_KEY") ? (env.EMAIL_FROM || "Resend") : "a la consola: NADIE recibe su cómic",
      ok: has("RESEND_API_KEY"), hint: "RESEND_API_KEY · sin esto nadie recibe nada",
    },
    {
      id: "pay", name: "Cobro", required: true,
      // Stripe without its webhook secret is the worst of the two failures:
      // it takes the money and never queues the comic.
      detail: !has("STRIPE_SECRET_KEY") ? "sin configurar"
        : !has("STRIPE_WEBHOOK_SECRET") ? "Stripe a medias: falta el secreto del webhook, cobraría y no entregaría"
        : testMode ? "Stripe en modo PRUEBA: no cobra dinero real"
        : env.STRIPE_MANAGED_PAYMENTS === "1" ? "Stripe Managed Payments (Stripe es el vendedor)" : "Stripe (el IVA es nuestro)",
      ok: has("STRIPE_SECRET_KEY") && has("STRIPE_WEBHOOK_SECRET"),
      hint: "STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET",
    },
    {
      id: "base", name: "Dirección pública", required: true,
      detail: env.PUBLIC_BASE_URL || "se deduce de la petición",
      ok: has("PUBLIC_BASE_URL"),
      hint: "PUBLIC_BASE_URL · sin esto los enlaces del correo del cron apuntan a cualquier sitio",
    },
    {
      id: "cron", name: "Reanudar trabajos", detail: "CRON_SECRET", required: false,
      ok: has("CRON_SECRET"),
      hint: "CRON_SECRET · sin él /api/cron es «gástame el presupuesto» para quien lo encuentre",
    },
    {
      id: "bots", name: "Filtro de bots", required: false,
      detail: has("TURNSTILE_SECRET_KEY") ? "Cloudflare Turnstile" : "SIN FILTRO: los topes diarios son la única defensa",
      ok: has("TURNSTILE_SECRET_KEY") && has("TURNSTILE_SITE_KEY"),
      hint: "TURNSTILE_SITE_KEY y TURNSTILE_SECRET_KEY",
    },
    {
      id: "admin", name: "Acceso a este panel", detail: "ADMIN_TOKEN", required: true,
      ok: has("ADMIN_TOKEN"), hint: "ADMIN_TOKEN",
    },
    {
      /*
       * Required, and not for tidiness: LSSI art. 10 obliges a Spanish site to
       * publish who is behind it — name or company, tax number, address and a
       * contact — findable without registering. Without it the legal pages
       * render "[pendiente de completar]" to customers, which is both a legal
       * exposure and the single most off-putting thing a buyer can find on a
       * page where they are about to type a card number.
       */
      id: "identity", name: "Identidad del titular", required: true,
      detail: has("LEGAL_NAME") && has("LEGAL_NIF") && has("LEGAL_ADDRESS")
        ? `${env.LEGAL_NAME} · ${env.LEGAL_NIF}`
        : "las páginas legales salen a medias: obligatorio por LSSI art. 10",
      ok: has("LEGAL_NAME") && has("LEGAL_NIF") && has("LEGAL_ADDRESS") && (has("LEGAL_EMAIL") || has("EMAIL_REPLY_TO")),
      hint: "LEGAL_NAME, LEGAL_NIF, LEGAL_ADDRESS y LEGAL_EMAIL",
    },
  ];

  const missing = items.filter((i) => !i.ok && i.required).map((i) => i.id);
  const warnings = items.filter((i) => !i.ok && !i.required).map((i) => i.id);
  return { items, missing, warnings, ready: missing.length === 0 };
}

/** Rows created within the last `ms`. */
function since(rows, ms, now = Date.now()) {
  const from = now - ms;
  return rows.filter((r) => Date.parse(r.created_at) >= from);
}

/**
 * The funnel, which is the only number that decides whether this product
 * lives: previews asked for, previews finished, comics paid for, comics
 * delivered.
 */
function funnel(rows) {
  const asked = rows.length;
  const ready = rows.filter((r) => r.status === "ready").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const paid = rows.filter((r) => r.paid_at).length;
  const delivered = rows.filter((r) => r.delivered_at).length;
  const revenueCents = rows
    .filter((r) => r.paid_at)
    .reduce((a, r) => a + ((r.payment && r.payment.amount_cents) || PRODUCT.priceCents), 0);

  return {
    asked, ready, failed, paid, delivered, revenueCents,
    // Of the people who got a preview worth looking at, how many bought.
    conversion: ready ? paid / ready : 0,
  };
}

/**
 * What it cost, in dollars.
 *
 * Counted from what each job actually recorded where possible, estimated only
 * where it is not: a preview is one cover plus the script; a paid comic adds
 * the sheets and every panel that was drawn.
 */
function spend(rows) {
  let previews = 0;
  let comics = 0;
  for (const r of rows) {
    if (r.cover_url) previews += IMAGE_USD;
    if (r.data && r.data.outline) previews += SCRIPT_USD;
    const drawn = (r.render && r.render.drawn) || 0;
    if (drawn) comics += (drawn + 3) * IMAGE_USD; // + the character sheets
  }
  const usd = previews + comics;
  return {
    previewsUsd: previews,
    comicsUsd: comics,
    usd,
    eur: usd * USD_EUR,
    // The one that decides whether the free half is affordable.
    perPaidEur: rows.filter((r) => r.paid_at).length
      ? (usd * USD_EUR) / rows.filter((r) => r.paid_at).length
      : null,
  };
}

/**
 * How often the image model betrayed the style, from what render-job recorded.
 * `drift` was repaired for free; `collapse` cost a redraw.
 */
function quality(rows) {
  let drift = 0;
  let collapse = 0;
  let holes = 0;
  let panels = 0;
  for (const r of rows) {
    const checks = (r.render && r.render.checks) || {};
    for (const verdict of Object.values(checks)) {
      if (String(verdict).startsWith("drift")) drift++;
      if (String(verdict).startsWith("collapse")) collapse++;
    }
    holes += ((r.render && r.render.holes) || []).length;
    panels += (r.render && r.render.drawn) || 0;
  }
  return { drift, collapse, holes, panels, driftRate: panels ? drift / panels : 0 };
}

/**
 * The short lists. `attention` is the only one that needs a person — and it is
 * an exception path, not a routine approval: everything else delivers itself.
 */
function queues(rows) {
  const brief = (r) => ({
    token: r.token,
    title: (r.data && r.data.story && r.data.story.title) || null,
    hero: (r.order && r.order.name) || null,
    lang: r.lang || "es",
    created_at: r.created_at,
    paid_at: r.paid_at || null,
    status: r.status,
    step: r.step,
    render_status: r.render_status || null,
    render_step: r.render_step || null,
    render_progress: r.render_progress || 0,
    drawn: (r.render && r.render.drawn) || 0,
    total: (r.render && r.render.total) || 0,
    holes: ((r.render && r.render.holes) || []).length,
    error: r.render_error || r.error || r.last_error || null,
    // A story our own editor failed. It is not sold, and that is worth seeing.
    review: Boolean(r.data && r.data.verdict && r.data.verdict.needsHumanReview),
  });

  const newest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

  return {
    attention: rows.filter((r) => r.render_status === "needs_attention").map(brief).sort(newest),
    drawing: rows.filter((r) => r.paid_at && r.render_status !== "done" && r.render_status !== "needs_attention").map(brief).sort(newest),
    failed: rows.filter((r) => r.status === "failed").map(brief).sort(newest),
    recent: [...rows].sort(newest).slice(0, 40).map(brief),
  };
}

/** Everything the panel shows, from one read of the rows. */
function report(rows, env = {}, now = Date.now()) {
  const today = since(rows, DAY, now);
  const week = since(rows, 7 * DAY, now);
  return {
    at: new Date(now).toISOString(),
    health: health(env),
    funnel: { today: funnel(today), week: funnel(week), all: funnel(rows) },
    spend: { today: spend(today), all: spend(rows) },
    quality: quality(rows),
    queues: queues(rows),
    caps: {
      perDay: Number(env.MAX_PREVIEWS_PER_DAY || 120),
      perIp: Number(env.MAX_PREVIEWS_PER_IP || 3),
      usedToday: today.length,
    },
    price: { cents: PRODUCT.priceCents, currency: PRODUCT.currency, vatRate: PRODUCT.vatRate },
  };
}

module.exports = { report, health, funnel, spend, quality, queues, since, IMAGE_USD, SCRIPT_USD, USD_EUR };
