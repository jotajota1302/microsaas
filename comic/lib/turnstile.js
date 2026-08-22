/*
 * Cloudflare Turnstile: the only layer here that tells a person from a script.
 *
 * The other defences do not do this job, and it matters more in this product
 * than in its sibling: our form does not just create a row, it spends money.
 * One submission buys a cover and a script. The daily caps bound the bill but
 * let a bot eat the whole day's quota, so real customers meet "come back
 * tomorrow" — the damage is lost sales rather than a surprise invoice. The
 * per-IP cap falls to a VPN and the per-email cap to a throwaway address.
 *
 * Not configured means not enforced. The site must never stop selling because
 * a captcha key is missing — and the admin panel shows the gap so it cannot be
 * forgotten quietly.
 *
 * Copied in substance from cuentos/lib/turnstile.js.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The public key the widget needs, or null when Turnstile is not set up. */
function siteKey() {
  return process.env.TURNSTILE_SITE_KEY || null;
}

function isConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY);
}

/**
 * @returns {Promise<boolean>} true when the request may proceed.
 *
 * A MISSING token is refused whenever Turnstile is configured — otherwise the
 * check is skipped by simply not sending one, which is the first thing any
 * script would try.
 *
 * A NETWORK failure against Cloudflare lets the order through. Losing real
 * sales to somebody else's outage is worse than the handful of bots that slip
 * past during it, and the daily caps still bound what those can spend.
 */
async function verify(token, ip, deps = {}) {
  if (!isConfigured()) return true;
  if (!token || typeof token !== "string") return false;

  const fetchFn = deps.fetch || fetch;
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetchFn(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await res.json();
    if (!data.success) {
      console.warn(`[comic] turnstile rechazó: ${(data["error-codes"] || []).join(", ")}`);
    }
    return Boolean(data.success);
  } catch (e) {
    console.warn(`[comic] turnstile no responde, dejo pasar: ${e.message}`);
    return true;
  }
}

module.exports = { verify, siteKey, isConfigured, VERIFY_URL };
