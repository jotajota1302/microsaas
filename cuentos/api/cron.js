const { deps } = require("../lib/wiring.js");
const { cronHandler } = require("../lib/handlers.js");

let handler;
module.exports = (req, res) => {
  if (!handler) handler = cronHandler(deps());
  return handler(req, res);
};
