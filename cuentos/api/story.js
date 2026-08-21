const { deps } = require("../lib/wiring.js");
const { storyHandler } = require("../lib/handlers.js");

let handler;
module.exports = (req, res) => {
  if (!handler) handler = storyHandler(deps());
  return handler(req, res);
};
