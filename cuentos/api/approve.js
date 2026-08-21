const { deps } = require("../lib/wiring.js");
const { approveHandler } = require("../lib/handlers.js");

let handler;
module.exports = (req, res) => {
  if (!handler) handler = approveHandler(deps());
  return handler(req, res);
};
