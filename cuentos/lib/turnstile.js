/*
 * Cloudflare Turnstile: the only layer that tells a person from a script.
 *
 * The other three defences do not do this job. The daily caps bound the spend
 * but let a bot burn the day's quota, so real customers meet "no more stories
 * today" — the damage is lost sales, not a bill. The per-IP cap falls to a VPN
 * and the per-email cap to a disposable address. OpenRouter's guardrail is the
 * last resort and understands only money.
 *
 * Not configured means not enforced: the site must never stop selling because
 * a captcha key is missing. That is a deliberate trade, and lib/dashboard.js
 * shows it as a gap in the panel so it cannot be forgotten silently.
 */

const { env } = require("./env.js");

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The public key the widget needs, or null when Turnstile is not set up. */
function siteKey() {
  return env.TURNSTILE_SITE_KEY || null;
}

function isConfigured() {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

/**
 * @returns true when the request may proceed.
 *
 * A missing token is refused whenever Turnstile IS configured — otherwise the
 * check would be trivially skipped by not sending one. A network failure
 * against Cloudflare lets the order through: losing a sale to their outage
 * would be worse than the handful of bots that slip past in those minutes,
 * and the caps still bound what those bots can spend.
 */
async function verify(token, ip, deps = {}) {
  if (!isConfigured()) return true;
  if (!token || typeof token !== "string") return false;

  const fetchFn = deps.fetch || fetch;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetchFn(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await res.json();
    if (!data.success) {
      console.warn(`[cuentos] turnstile rejected: ${(data["error-codes"] || []).join(", ")}`);
    }
    return Boolean(data.success);
  } catch (e) {
    console.warn(`[cuentos] turnstile unreachable, letting it through: ${e.message}`);
    return true;
  }
}

module.exports = { verify, siteKey, isConfigured, VERIFY_URL };
