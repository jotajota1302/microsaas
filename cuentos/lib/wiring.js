/*
 * Builds the real dependency set for the API handlers. If the environment is
 * incomplete (no Supabase yet, no key), deps() returns null and the handler
 * answers 503 "not_configured" instead of crashing with a 500.
 */

const H = require("./handlers.js");
const { getDb } = require("./db.js");
const moderation = require("./moderation.js");
const { runJob } = require("./steps.js");
const { generateStory } = require("./prompt-story.js");
const { buildSheet, renderPages } = require("./character.js");
const { toLineArt } = require("./lineart.js");
const { renderPdf } = require("./pdf.js");
const { sendEmail } = require("./email.js");
const { send } = require("./http.js");

let cached;
function deps() {
  if (cached !== undefined) return cached;
  try {
    const db = getDb();
    const jobDeps = { db, generateStory, reviewStory: moderation.reviewStory, buildSheet, renderPages, toLineArt, renderPdf, sendEmail };
    cached = { db, moderation, sendEmail, runJob: (id) => runJob(id, jobDeps) };
  } catch (e) {
    console.error(`[cuentos] not configured: ${e.message}`);
    cached = null;
  }
  return cached;
}

/** Wraps a handler factory from lib/handlers.js into a Vercel function. */
function mount(factoryName) {
  let handler;
  return async (req, res) => {
    const d = deps();
    if (!d) return send(res, 503, { error: "not_configured" });
    if (!handler) handler = H[factoryName](d);
    try {
      return await handler(req, res);
    } catch (e) {
      console.error(`[cuentos] ${factoryName} failed: ${e.stack || e.message}`);
      return send(res, 500, { error: "internal" });
    }
  };
}

module.exports = { deps, mount };
