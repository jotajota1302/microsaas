const { deps } = require("../lib/wiring.js");
const { adminHandler } = require("../lib/handlers.js");

let handler;
module.exports = (req, res) => {
  if (!handler) handler = adminHandler(deps());
  return handler(req, res);
};
