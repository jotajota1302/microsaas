const { deps } = require("../lib/wiring.js");
const { printInterestHandler } = require("../lib/handlers.js");

let handler;
module.exports = (req, res) => {
  if (!handler) handler = printInterestHandler(deps());
  return handler(req, res);
};
