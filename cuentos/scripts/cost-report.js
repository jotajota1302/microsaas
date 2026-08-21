/*
 * Turns the cost log into the numbers a pricing decision needs.
 *
 *   COST_LOG=out/cost.jsonl node scripts/devserver.js     (produce the log)
 *   node scripts/cost-report.js out/cost.jsonl            (read it)
 *
 * The question it answers is not "what did we spend" but "what does each kind
 * of visitor cost": someone who reads the script and leaves, someone who gets
 * as far as the illustrated sample, and someone who buys.
 */

const fs = require("fs");
const path = require("path");

const USD_EUR = 0.92; // conservative, same rate lib/steps.js uses
const PRICE_EUR = 12.9;
const VAT = 0.04; // books
const ETSY_FEE = 0.18; // when the sale comes through Etsy

const file = process.argv[2] || path.join(__dirname, "..", "out", "cost.jsonl");
if (!fs.existsSync(file)) {
  console.error(`no cost log at ${file}\nRun the site with COST_LOG=${file} first.`);
  process.exit(1);
}

const entries = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);

if (!entries.length) {
  console.error("the cost log is empty");
  process.exit(1);
}

const eur = (usd) => usd * USD_EUR;
const fmt = (n, d = 4) => n.toFixed(d).replace(".", ",");
const line = (n = 74) => console.log("─".repeat(n));

// --- what happened -----------------------------------------------------------

const byLabel = new Map();
for (const e of entries) {
  const key = e.kind === "text" ? "texto" : (e.label || "imagen");
  const g = byLabel.get(key) || { calls: 0, usd: 0, ms: 0, cached: 0, models: new Set() };
  g.calls++; g.usd += e.usd; g.ms += e.ms; if (e.cached) g.cached++;
  if (e.model) g.models.add(e.model);
  byLabel.set(key, g);
}

const total = entries.reduce((a, e) => a + e.usd, 0);
const totalMs = entries.reduce((a, e) => a + e.ms, 0);
const cachedCalls = entries.filter((e) => e.cached).length;

console.log(`\nRegistro: ${path.relative(process.cwd(), file)}`);
console.log(`${entries.length} llamadas de pago${cachedCalls ? ` (${cachedCalls} servidas de caché, coste 0)` : ""}`);
console.log(`Desde ${entries[0].at.slice(0, 19).replace("T", " ")} hasta ${entries.at(-1).at.slice(0, 19).replace("T", " ")}\n`);

line();
console.log("PASO".padEnd(14) + "LLAM.".padStart(7) + "USD".padStart(11) + "EUR".padStart(11) + "SEG.".padStart(9) + "  MODELO");
line();
for (const [label, g] of [...byLabel.entries()].sort((a, b) => b[1].usd - a[1].usd)) {
  console.log(
    label.padEnd(14) +
    String(g.calls).padStart(7) +
    fmt(g.usd).padStart(11) +
    fmt(eur(g.usd)).padStart(11) +
    (g.ms / 1000).toFixed(1).replace(".", ",").padStart(9) +
    "  " + [...g.models].join(", ").slice(0, 34)
  );
}
line();
console.log("TOTAL".padEnd(14) + String(entries.length).padStart(7) + fmt(total).padStart(11) + fmt(eur(total)).padStart(11) + (totalMs / 1000).toFixed(1).replace(".", ",").padStart(9));
line();

// --- what each kind of visitor costs -----------------------------------------

const textUsd = entries.filter((e) => e.kind === "text").reduce((a, e) => a + e.usd, 0);
const imgUsd = total - textUsd;
const sheetUsd = entries.filter((e) => e.label === "sheet").reduce((a, e) => a + e.usd, 0);
const pageUsd = entries.filter((e) => /^page-/.test(e.label)).reduce((a, e) => a + e.usd, 0);
const pageCalls = entries.filter((e) => /^page-/.test(e.label)).length;
const perPage = pageCalls ? pageUsd / pageCalls : 0;
const lineUsd = entries.filter((e) => e.label === "lineart").reduce((a, e) => a + e.usd, 0);

console.log("\nQUÉ CUESTA CADA VISITANTE (con lo medido arriba)\n");
const rows = [
  ["Curioso que solo lee el guion", eur(textUsd)],
  ["Llega a la muestra ilustrada", eur(textUsd + sheetUsd + perPage * 2)],
  ["Compra el libro completo", eur(total)],
];
for (const [what, cost] of rows) {
  console.log(`  ${what.padEnd(34)} ${fmt(cost, 3).padStart(8)} €`);
}

// --- the margin --------------------------------------------------------------

const cost = eur(total);
const net = PRICE_EUR / (1 + VAT);
console.log("\nMARGEN DE UNA VENTA A 12,90 €\n");
console.log(`  Precio con IVA (libro, 4 %)        ${fmt(PRICE_EUR, 2).padStart(8)} €`);
console.log(`  Neto tras IVA                      ${fmt(net, 2).padStart(8)} €`);
console.log(`  Coste de IA                       -${fmt(cost, 2).padStart(8)} €`);
console.log(`  Margen por la web                  ${fmt(net - cost, 2).padStart(8)} €`);
console.log(`  Margen por Etsy (−18 % comisión)   ${fmt(net * (1 - ETSY_FEE) - cost, 2).padStart(8)} €`);

const free = eur(textUsd);
if (free > 0) {
  console.log(`\n  Guiones gratis que aguanta una venta: ${Math.floor((net - cost) / free)}`);
}
console.log("");
