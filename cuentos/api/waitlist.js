const { deps } = require("../lib/wiring.js");
const { waitlistHandler } = require("../lib/handlers.js");

let handler;
module.exports = (req, res) => {
  if (!handler) handler = waitlistHandler(deps());
  return handler(req, res);
};
