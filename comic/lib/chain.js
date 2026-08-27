/*
 * Que un pedido se empuje a sí mismo.
 *
 * EL FALLO QUE ESTO ARREGLA, medido en producción el 2026-08-27: un cómic
 * cobrado a las 08:04:48 se quedó parado en `panels`, con el cierre libre y
 * cero viñetas dibujadas, porque el comprador cerró la pestaña. En seis horas
 * de registro hay dos llamadas a /api/render y veinticuatro a /api/admin: el
 * cliente había pagado, se había ido a mirar el panel, y allí no hay nada que
 * empuje.
 *
 * La máquina era «quien mira, empuja», y eso pone de motor de un cómic de
 * 14,99 EUR una pestaña de navegador abierta veinticinco minutos. Nadie hace
 * eso. La red de seguridad era un cron de GitHub Actions que pide cada cinco
 * minutos y en la práctica corre cada TRES HORAS (comprobado: 03:20, 22:10,
 * 19:09, 16:54), porque Actions estrangula los crons de los repos pequeños.
 *
 * Lo que hace esto: cuando una invocación termina su paso, llama al siguiente.
 * El pedido deja de depender de que alguien mire y el cron pasa de ser el
 * motor a ser lo que siempre debió ser — el desfibrilador de una cadena rota.
 *
 * POR QUÉ SE PUEDE COLGAR LA ESPERA. La llamada se aborta a los dos segundos,
 * cuando la petición ya ha salido y la invocación hija ya está en marcha. Eso
 * NO la mata: en Vercel, que un cliente se desconecte solo cancela la función
 * si el proyecto declara `supportsCancellation`, que no es nuestro caso
 * (vercel.com/docs/functions/functions-api-reference). Sin esa espera corta la
 * petición podría no llegar a salir: una promesa suelta al final de un handler
 * no tiene garantizado terminar.
 *
 * POR QUÉ NO ES UN BUCLE INFINITO, que es el riesgo obvio de que una función
 * se llame a sí misma con dinero de por medio:
 *   - solo encadena quien SE HA LLEVADO EL CIERRE. Quien no lo consigue sabe
 *     que hay otra cadena viva y se calla, así que hay una sola en vuelo.
 *   - solo encadena si queda trabajo (`done` corta).
 *   - cada salto va numerado y en MAX_HOPS se planta y lo grita. Un cómic son
 *     unos doce pasos; sesenta es margen de sobra y a la vez un tope duro.
 *   - las máquinas de estados ya se rinden solas: cinco excepciones seguidas y
 *     el pedido acaba en `needs_attention`.
 */

const MAX_HOPS = Number(process.env.CHAIN_MAX_HOPS || 60);
/* Cuánto se espera a que la petición salga antes de colgar. No es el tiempo
 * que tarda el paso siguiente: es solo el apretón de manos. */
const KICK_MS = Number(process.env.CHAIN_KICK_MS || 2000);

/** El número de salto que traía la petición, si venía de la cadena. */
function hopOf(url) {
  const n = Number(new URL(url, "http://localhost").searchParams.get("hop") || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Llama al siguiente paso y no espera a que termine.
 *
 * @param {string} base   URL pública de este despliegue (lib/http.js baseUrlOf)
 * @param {string} path   "/api/render" o "/api/job"
 * @param {string} token  el pedido
 * @param {number} hop    el salto que acaba de terminar
 * @param {{max?: number}} opts  tope de saltos de ESTA máquina. La vista previa
 *   usa uno más corto que el render: son seis pasos y no doce, y su reintento
 *   de portada no lleva contador propio, así que el tope es lo único que lo
 *   acota.
 */
async function kick(base, path, token, hop = 0, { max = MAX_HOPS } = {}) {
  const next = hop + 1;
  if (next > max) {
    // Ruidoso a propósito: una cadena que no converge es un pedido que no se
    // entrega, y en silencio parece un pedido que va lento.
    console.error(`[comic] cadena agotada en ${path} tras ${hop} saltos · ${token.slice(0, 6)}`);
    return false;
  }

  const url = `${String(base).replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}&hop=${next}`;
  let early = null;
  try {
    early = await fetch(url, {
      method: "GET",
      headers: { "x-comic-chain": String(next) },
      signal: AbortSignal.timeout(KICK_MS),
      cache: "no-store",
    });
  } catch (e) {
    /*
     * Colgar a los dos segundos es el caso NORMAL, no un error: el paso
     * siguiente tarda minutos y no vamos a esperarlo. Solo se registra lo que
     * no es un plantón — un DNS que no resuelve, una URL base equivocada —
     * porque eso sí rompe la cadena y hay que verlo.
     */
    const timedOut = e.name === "TimeoutError" || e.name === "AbortError";
    if (!timedOut) {
      console.error(`[comic] no se ha podido encadenar ${path} · ${token.slice(0, 6)}: ${e.message}`);
      return false;
    }
  }

  /*
   * Una respuesta que llega ANTES del plantón es sospechosa: el paso siguiente
   * tarda minutos, así que si contesta en dos segundos es que no ha empezado.
   * Un 401 de la protección de despliegue o un 404 por una URL base mal puesta
   * rompen la cadena entera, y sin esto se registraban como un salto correcto:
   * el pedido se quedaba parado y el log decía que todo iba bien.
   */
  if (early && !early.ok) {
    console.error(`[comic] la cadena ${path} ha sido rechazada con ${early.status} · ${token.slice(0, 6)} · base=${base}`);
    return false;
  }
  console.log(`[comic] cadena ${path} salto ${next} · ${token.slice(0, 6)}`);
  return true;
}

module.exports = { kick, hopOf, MAX_HOPS };
