/*
 * Audience measurement: what to keep, and the arithmetic of the funnel.
 *
 * Two rules decide everything here.
 *
 * FIRST PARTY AND COOKIELESS. No identifier survives the visit, no raw IP is
 * stored, the referrer is kept as a host and never as a URL, and nothing a
 * person typed is recorded. That is what lets the site run with no cookie
 * banner, which is a decision taken in ../CLAUDE.md, not a preference.
 *
 * THE DATABASE ALREADY KNOWS THE SECOND HALF. Orders and stories say who
 * approved a script, who saw the sample and who paid. Events only cover what
 * happens before an order exists — a visit, a click on the button, a form
 * opened — plus the press on "pay", which is the only way to tell "saw the
 * price and left" from "left at the payment page".
 */

const NAMES = ["view", "cta", "form_start", "checkout_click"];
const DEVICES = ["movil", "tableta", "escritorio"];
const MAX = { path: 120, ref: 80, utm: 60, visit: 40 };

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** The host of a referrer, or "" — a full URL can carry a search query. */
function refHost(referrer) {
  const raw = clip(referrer, 300);
  if (!raw) return "";
  try {
    return new URL(raw).host.replace(/^www\./, "").slice(0, MAX.ref);
  } catch (e) {
    return "";
  }
}

/** Keeps only the three UTM fields, bounded. Anything else is dropped. */
function utmOf(input) {
  const out = {};
  for (const key of ["source", "medium", "campaign"]) {
    const v = clip(input && input[key], MAX.utm);
    if (v) out[key] = v;
  }
  return out;
}

/**
 * Turns whatever the browser sent into a row, or null if it is not an event we
 * asked for. The browser is not trusted: every field is bounded, closed lists
 * are enforced, and nothing unknown survives.
 */
function toRow(body, { ipHash = null, now = new Date() } = {}) {
  const b = body || {};
  const name = clip(b.name, 24);
  if (!NAMES.includes(name)) return null;

  const path = clip(b.path, MAX.path);
  const device = DEVICES.includes(b.device) ? b.device : null;
  const locale = b.locale === "en" ? "en" : "es";

  return {
    at: now.toISOString(),
    name,
    // A path is ours, but a story token is a key: /c/<token> becomes /c.
    path: path.startsWith("/c/") ? "/c" : path || "/",
    ref: refHost(b.ref),
    utm: utmOf(b.utm),
    locale,
    device,
    visit: clip(b.visit, MAX.visit) || null,
    ip_hash: ipHash,
  };
}

const count = (rows, name) => new Set(rows.filter((r) => r.name === name).map((r) => r.visit || r.id)).size;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/**
 * The whole funnel, from a stranger to a book, in one shape. The first three
 * steps come from events, the rest from orders: a story that reached the
 * sample is a fact in the database, not a click we hope was fired.
 */
function funnel(events = [], orders = []) {
  const visits = count(events, "view");
  const cta = count(events, "cta");
  const formStart = count(events, "form_start");
  const started = orders.length;
  const sample = orders.filter((o) => ["sample", "paid", "needs_review", "delivered"].includes(o.status)).length;
  const checkout = count(events, "checkout_click");
  const paid = orders.filter((o) => ["paid", "needs_review", "delivered"].includes(o.status)).length;

  const steps = [
    { id: "visits", label: "Visitas", n: visits, of: null },
    { id: "cta", label: "Pulsan «crear»", n: cta, of: visits },
    { id: "form_start", label: "Empiezan el formulario", n: formStart, of: cta },
    { id: "started", label: "Piden el guion", n: started, of: formStart },
    { id: "sample", label: "Aprueban el guion", n: sample, of: started },
    { id: "checkout", label: "Pulsan pagar", n: checkout, of: sample },
    { id: "paid", label: "Pagan", n: paid, of: checkout },
  ];
  for (const s of steps) s.rate = s.of === null ? null : pct(s.n, s.of);

  return {
    steps,
    // The number that decides whether the shop works at all.
    visitToPaid: pct(paid, visits),
  };
}

/** Where they came from, biggest first. Unknown referrers are "directo". */
function sources(events = []) {
  const byVisit = new Map();
  for (const e of events) {
    if (e.name !== "view") continue;
    const key = e.visit || `row-${e.id}`;
    if (byVisit.has(key)) continue;
    const utm = e.utm || {};
    byVisit.set(key, utm.source || e.ref || "directo");
  }
  const tally = new Map();
  for (const src of byVisit.values()) tally.set(src, (tally.get(src) || 0) + 1);
  return [...tally.entries()]
    .map(([source, visits]) => ({ source, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 12);
}

/** Phone, tablet or desktop — the only device fact worth keeping. */
function devices(events = []) {
  const byVisit = new Map();
  for (const e of events) {
    if (e.name !== "view" || !e.device) continue;
    const key = e.visit || `row-${e.id}`;
    if (!byVisit.has(key)) byVisit.set(key, e.device);
  }
  const tally = { movil: 0, tableta: 0, escritorio: 0 };
  for (const d of byVisit.values()) if (tally[d] !== undefined) tally[d]++;
  return tally;
}

/** Which pages are read, so a landing that nobody scrolls can be found. */
function pages(events = []) {
  const tally = new Map();
  for (const e of events) {
    if (e.name !== "view") continue;
    tally.set(e.path, (tally.get(e.path) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);
}

module.exports = { NAMES, DEVICES, toRow, refHost, utmOf, funnel, sources, devices, pages };
