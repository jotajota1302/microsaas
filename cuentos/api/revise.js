const { deps } = require("../lib/wiring.js");
const { reviseHandler } = require("../lib/handlers.js");

let handler;
module.exports = (req, res) => {
  if (!handler) handler = reviseHandler(deps());
  return handler(req, res);
};
