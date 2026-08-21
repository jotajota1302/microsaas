/*
 * Loads .env in local development (Vercel injects env vars itself) and
 * validates that the variables a given entry point needs are present.
 *
 * Never log the values: this file is imported by everything.
 */

const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");

if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    // The project's .env wins over whatever the shell inherited. On Vercel
    // there is no .env file, so platform env vars are untouched there. This
    // matters: a stale key in the user's global Windows environment silently
    // shadowed the project key once (2026-08-21).
    if (process.env[key] && process.env[key] !== value) {
      console.warn(`[cuentos] .env overrides inherited ${key}`);
    }
    process.env[key] = value;
  }
}

function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(`[cuentos] missing env vars: ${missing.join(", ")}`);
  }
}

module.exports = { env: process.env, requireEnv };
