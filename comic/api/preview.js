/*
 * POST /api/preview — the only door into the product.
 *
 * Takes what the form sent, refuses anything the catalogue does not know, and
 * creates a job. It does NOT generate: generating takes minutes, and a request
 * that holds a connection for minutes is a request that dies on a phone. The
 * caller gets a token immediately and the work happens in steps behind it.
 *
 * Spend ceilings live here, from the outside in, the way cuentos does it:
 * a daily cap for the whole site and a per-IP cap per day. When a ceiling is
 * hit the answer is a waiting list, never an error page — the site never goes
 * dark, it just stops spending.
 */

const { parseOrder, pipelineOrder } = require("../lib/order.js");
const { store, newToken, hashIp } = require("../lib/store.js");
const { clientIp, baseUrlOf } = require("../lib/http.js");
const { verify: verifyHuman } = require("../lib/turnstile.js");

const MAX_PER_DAY = Number(process.env.MAX_PREVIEWS_PER_DAY || 120);
const MAX_PER_IP = Number(process.env.MAX_PREVIEWS_PER_IP || 3);

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body; // Vercel parses it
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw new Error("cuerpo demasiado grande");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "usa POST" }));
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "no hemos podido leer el formulario" }));
  }

  const { ok, errors, order } = parseOrder(body);
  if (!ok) {
    res.statusCode = 400;
    // One message, the first one: a list of everything wrong is a debugging
    // tool for us and a wall of text for whoever is filling the form.
    return res.end(JSON.stringify({ error: errors[0], errors }));
  }

  const ip = clientIp(req);

  /*
   * Before anything is counted or stored: is there a person here?
   *
   * This runs after parseOrder so a malformed body is refused without a round
   * trip to Cloudflare, and before the counters so a bot does not consume a
   * visitor's daily allowance on its way to being rejected.
   *
   * When Turnstile is not configured this returns true and the site sells as
   * before — the gap shows in the admin panel instead of stopping business.
   */
  if (!(await verifyHuman(body.turnstile, ip))) {
    res.statusCode = 403;
    return res.end(JSON.stringify({
      error: "No hemos podido comprobar que no eres un robot. Recarga la página y prueba otra vez.",
    }));
  }

  const ipHash = hashIp(ip);
  try {
    /*
     * Two ceilings, and BOTH are enforced. The per-IP one stops one bored
     * person; the site-wide one stops the day the landing gets shared
     * somewhere busy, which is the case that empties the image budget.
     *
     * The site-wide one used to be declared here, exported, described in a
     * comment as "the real brake" — and never checked. A spend ceiling nobody
     * reads is not a ceiling, it is a note.
     *
     * Counted in that order because the global count is the more expensive
     * query and most requests are stopped by neither.
     */
    const mine = await store.countToday(ipHash);
    if (mine >= MAX_PER_IP) {
      res.statusCode = 429;
      return res.end(JSON.stringify({
        error: `Ya has pedido ${MAX_PER_IP} vistas previas hoy. Mañana puedes pedir más.`,
        waitlist: true,
      }));
    }

    const everyone = await store.countToday();
    if (everyone >= MAX_PER_DAY) {
      // Not an error page. The site does not go dark when it hits its budget,
      // it stops spending and takes an address instead.
      res.statusCode = 429;
      return res.end(JSON.stringify({
        error: "Hoy ya hemos hecho todas las que podíamos hacer. Vuelve mañana y te la hacemos la primera.",
        waitlist: true,
        soldOut: true,
      }));
    }
  } catch (e) {
    // Fail open on infrastructure: never lose an order because the counter is
    // down. Loud, though — this is the path where the brakes are missing.
    console.warn(`[comic] no se han podido contar las vistas previas de hoy: ${e.message}`);
  }

  const token = newToken();
  /*
   * The order is stored ALREADY MASKED and the real names go in a separate
   * field. Nothing downstream builds a prompt from `names`, so a name cannot
   * reach a provider even if somebody writes a new prompt tomorrow. See
   * lib/names.js.
   */
  const { order: masked, names } = pipelineOrder(order);
  const job = {
    token,
    status: "pending",
    step: "outline",
    progress: 0,
    attempts: 0,
    order: masked,
    names,
    email: order._email,
    utm: order._utm,
    ip_hash: ipHash,
    lang: order.lang,
    // Captured now, because the steps that send email run from a cron where
    // there is no request to ask, and a preview link that points at localhost
    // is a preview link nobody opens.
    base_url: baseUrlOf(req),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data: {},
  };

  try {
    await store.create(job);
  } catch (e) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: "no hemos podido guardar tu pedido, prueba en un momento" }));
  }

  res.statusCode = 202;
  res.end(JSON.stringify({
    token,
    url: `/c/${token}`,
    // The viewer polls this; the cron pushes the ones nobody is watching.
    poll: `/api/job?token=${token}`,
  }));
};

module.exports.config = { MAX_PER_DAY, MAX_PER_IP };
