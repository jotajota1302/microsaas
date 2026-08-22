/*
 * Lo que cuesta cada llamada a un proveedor, medido y no estimado.
 *
 * El panel calcula el gasto multiplicando imágenes por 0,0035 $, que para las
 * imágenes es exacto (es una tarifa plana por imagen) pero para el texto es una
 * suposición: depende de cuántos tokens entren y salgan, y eso varía con la
 * longitud del guion. Con un medidor de verdad la pregunta «¿cuánto cuesta un
 * cómic?» tiene una respuesta y no un cálculo de servilleta.
 *
 * En memoria siempre — son unas cien entradas por cómic — y en disco solo si
 * COST_LOG nombra un fichero, para que en producción no se escriba nada salvo
 * que alguien lo pida. Misma forma que cuentos/lib/meter.js.
 *
 * Nunca tira hacia arriba: medir no puede tumbar un pedido que alguien ha
 * pagado.
 */

const fs = require("fs");
const path = require("path");

const calls = [];

/*
 * Tarifas por millón de tokens, en dólares. Están aquí y no en cada llamada
 * porque el proveedor no te dice lo que cobra: te dice cuántos tokens has
 * gastado, y el precio lo pones tú.
 *
 * Si una tarifa cambia y nadie actualiza esto, el número que sale es una
 * mentira con dos decimales — así que `rate()` devuelve null para un modelo que
 * no conoce, y el informe cuenta esas llamadas aparte en vez de valorarlas a
 * cero.
 */
const RATES = {
  /*
   * M3 estándar, comprobado el 2026-08-22 en la documentación de MiniMax:
   * 0,30 / 1,20 $ por millón hasta 512K tokens de entrada. Ojo con dos cosas:
   * es un precio promocional (la tarifa de lista es 0,60/2,40 con un «50 %
   * permanente» aplicado encima), y por encima de 512K de entrada se dobla.
   * Nuestros prompts andan por los 2-4K, así que el tramo alto no nos toca.
   *
   * Que JJ pague con una suscripción no lo hace gratis: se descuenta del saldo
   * a esta misma tarifa. Lo que cambia es cuándo se paga, no cuánto.
   */
  "minimax-m3": { in: 0.30, out: 1.20 },
  // Del catálogo de OpenRouter; las de referencia de ../CLAUDE.md.
  "openai/gpt-5-mini": { in: 0.25, out: 2.00 },
  "google/gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
  "deepseek/deepseek-v4-flash": { in: 0.068, out: 0.168 },
};

function rate(model) {
  const key = String(model || "").toLowerCase();
  return RATES[key] || null;
}

/**
 * @param kind  "image" | "text"
 * @param meta  imagen: { model, ms, usd, label }
 *              texto:  { model, ms, inTokens, outTokens, label }
 */
function record(kind, meta = {}) {
  const entry = {
    at: new Date().toISOString(),
    kind,
    model: meta.model || "",
    ms: meta.ms || 0,
    label: meta.label || "",
    inTokens: meta.inTokens || 0,
    outTokens: meta.outTokens || 0,
    usd: 0,
    priced: true,
  };

  if (kind === "image") {
    entry.usd = Number(meta.usd) || 0;
  } else {
    const r = rate(meta.model);
    if (r) {
      entry.usd = (entry.inTokens / 1e6) * r.in + (entry.outTokens / 1e6) * r.out;
    } else {
      entry.priced = false; // contado, no valorado
    }
  }

  calls.push(entry);

  const file = process.env.COST_LOG;
  if (file) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.appendFileSync(file, JSON.stringify(entry) + "\n");
    } catch (e) {
      console.warn(`[comic] no he podido escribir el registro de coste: ${e.message}`);
    }
  }
  return entry;
}

/** Todo lo registrado, agrupado. `unpriced` es lo que no se sabe valorar. */
function summary() {
  const by = {};
  let usd = 0;
  let unpriced = 0;
  for (const c of calls) {
    const k = `${c.kind}:${c.model || "?"}`;
    by[k] = by[k] || { calls: 0, ms: 0, inTokens: 0, outTokens: 0, usd: 0, unpriced: 0 };
    by[k].calls++;
    by[k].ms += c.ms;
    by[k].inTokens += c.inTokens;
    by[k].outTokens += c.outTokens;
    by[k].usd += c.usd;
    if (!c.priced) { by[k].unpriced++; unpriced++; }
    usd += c.usd;
  }
  return { calls: calls.length, usd, unpriced, by };
}

function reset() { calls.length = 0; }
function all() { return calls.slice(); }

module.exports = { record, summary, reset, all, rate, RATES };
