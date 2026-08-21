/*
 * Copies the variables production needs from .env into the Vercel project.
 *
 *   vercel login                      (once, interactive — it opens a browser)
 *   node scripts/push-env.js          → shows what it would set, changes nothing
 *   node scripts/push-env.js --apply  → sets them in production
 *
 * Only the names below travel. Everything else in .env stays local: the file
 * also holds keys for other things, and a secret that does not need to be in a
 * cloud is a secret that cannot leak from one. Values are never printed —
 * only the name and how it was resolved.
 *
 * PUBLIC_BASE_URL is deliberately NOT taken from .env: locally it points at
 * localhost, and a production link to localhost is an email nobody can open.
 */

const { execFileSync } = require("child_process");
const path = require("path");

process.chdir(path.join(__dirname, ".."));
const { env } = require("../lib/env.js");

const NEEDED = [
  "OPENROUTER_API_KEY",
  "TEXT_PROVIDER",
  "TEXT_MODEL",
  "IMAGE_PROVIDER",
  "OPENROUTER_IMAGE_MODEL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "ADMIN_TOKEN",
  "CRON_SECRET",
  "IP_SALT",
  "MAX_SCRIPTS_PER_DAY",
  "MAX_SAMPLES_PER_DAY",
  "MAX_SCRIPTS_PER_IP",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "ETSY_LISTING_URL",
];

// Missing these means the shop cannot trade at all; the rest only limit it.
const REQUIRED = ["OPENROUTER_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TEXT_MODEL", "OPENROUTER_IMAGE_MODEL"];

const BASE_URL = process.env.BASE_URL || "https://cuentos-jose-juan-jimenezs-projects.vercel.app";
const TARGET = "production";
const apply = process.argv.includes("--apply");

const vercel = (args, input) =>
  execFileSync(process.platform === "win32" ? "vercel.cmd" : "vercel", args, {
    input: input === undefined ? "" : input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

function set(name, value) {
  if (!apply) return "would set";
  try {
    vercel(["env", "rm", name, TARGET, "--yes"]);
  } catch (e) {
    /* not there yet: that is the normal case the first time */
  }
  vercel(["env", "add", name, TARGET], value);
  return "set";
}

const values = { ...Object.fromEntries(NEEDED.map((k) => [k, env[k]])), PUBLIC_BASE_URL: BASE_URL };

const missing = REQUIRED.filter((k) => !values[k]);
if (missing.length) {
  console.error(`\n  Falta en .env: ${missing.join(", ")}\n`);
  process.exit(1);
}

console.log(`\n  ${apply ? "Subiendo" : "Simulacro (usa --apply para subir)"} → proyecto Vercel, entorno ${TARGET}\n`);
let done = 0;
for (const [name, value] of Object.entries(values)) {
  if (value === undefined || value === "") {
    console.log(`  ·  ${name.padEnd(26)} vacía en .env, se omite`);
    continue;
  }
  const what = set(name, String(value));
  done++;
  console.log(`  ✓  ${name.padEnd(26)} ${what}${name === "PUBLIC_BASE_URL" ? ` (${BASE_URL})` : ""}`);
}
console.log(`\n  ${done} variables.${apply ? " Redespliega para que las cojan: vercel --prod" : ""}\n`);
