const { deps } = require("../lib/wiring.js");
const { orderHandler } = require("../lib/handlers.js");

let handler;
module.exports = (req, res) => {
  if (!handler) handler = orderHandler(deps());
  return handler(req, res);
};
