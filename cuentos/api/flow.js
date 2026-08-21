/*
 * The funnel's actions, in one function: change the script, approve it, pay,
 * and ask for the next batch of work. See lib/wiring.js for why several
 * endpoints share a file; /api/revise, /api/approve, /api/checkout and
 * /api/resume keep working as they always did.
 */
const { mountRouter } = require("../lib/wiring.js");

module.exports = mountRouter({
  revise: "reviseHandler",
  approve: "approveHandler",
  checkout: "checkoutHandler",
  resume: "resumeHandler",
});
