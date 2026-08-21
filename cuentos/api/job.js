const { deps } = require("../lib/wiring.js");
const { jobHandler } = require("../lib/handlers.js");

let handler;
module.exports = (req, res) => {
  if (!handler) handler = jobHandler(deps());
  return handler(req, res);
};
