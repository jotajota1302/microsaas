const H = require("../lib/handlers.js");
const { getDb } = require("../lib/db.js");
const moderation = require("../lib/moderation.js");
const { runJob } = require("../lib/steps.js");
const { generateStory } = require("../lib/prompt-story.js");
const { buildSheet, renderPages } = require("../lib/character.js");
const { toLineArt } = require("../lib/lineart.js");
const { renderPdf } = require("../lib/pdf.js");
const { sendEmail } = require("../lib/email.js");

function deps() {
  const db = getDb();
  const jobDeps = { db, generateStory, reviewStory: moderation.reviewStory, buildSheet, renderPages, toLineArt, renderPdf, sendEmail };
  return { db, moderation, sendEmail, runJob: (id) => runJob(id, jobDeps) };
}
module.exports = { deps };
