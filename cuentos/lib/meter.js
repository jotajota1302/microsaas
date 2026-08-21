/*
 * Cost meter: every paid call to a model reports here.
 *
 * Why not just read jobs.cost_cents: that column rounds each step to whole
 * euro cents, so a 0,0015 $ story records as 0 and disappears from the books.
 * This keeps the real USD figure per call, plus which model and how long it
 * took, which is what answers "what does a browser who never buys cost me?".
 *
 * In memory always (a few objects), on disk only when COST_LOG names a file,
 * so nothing is written in production unless someone asks for it.
 */

const fs = require("fs");
const path = require("path");
const { env } = require("./env.js");

const calls = [];

/**
 * @param kind  "text" | "image" | "vision"
 * @param usd   what the provider charged, or our measured estimate
 * @param meta  { model, ms, label, cached }
 */
function record(kind, usd, meta = {}) {
  const entry = {
    at: new Date().toISOString(),
    kind,
    usd: Number(usd) || 0,
    model: meta.model || "",
    ms: meta.ms || 0,
    label: meta.label || "",
    cached: !!meta.cached,
  };
  calls.push(entry);

  const file = env.COST_LOG;
  if (file) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.appendFileSync(file, JSON.stringify(entry) + "\n");
    } catch (e) {
      // Metering must never take a paying job down with it.
      console.warn(`[cuentos] cost log failed: ${e.message}`);
    }
  }
  return entry;
}

/** Everything recorded since the process started, or since reset(). */
function all() {
  return calls.slice();
}

function reset() {
  calls.length = 0;
}

/** Totals, and the split by kind — the two numbers a price decision needs. */
function summary(entries = calls) {
  const out = { calls: entries.length, usd: 0, ms: 0, byKind: {}, byModel: {} };
  for (const e of entries) {
    out.usd += e.usd;
    out.ms += e.ms;
    const k = (out.byKind[e.kind] = out.byKind[e.kind] || { calls: 0, usd: 0, ms: 0 });
    k.calls++; k.usd += e.usd; k.ms += e.ms;
    const m = (out.byModel[e.model] = out.byModel[e.model] || { calls: 0, usd: 0 });
    m.calls++; m.usd += e.usd;
  }
  return out;
}

module.exports = { record, all, reset, summary };
