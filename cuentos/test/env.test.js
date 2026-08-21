const { test } = require("node:test");
const assert = require("node:assert");
const { requireEnv } = require("../lib/env.js");

test("requireEnv throws listing every missing variable", () => {
  delete process.env.__CUENTOS_A;
  delete process.env.__CUENTOS_B;
  assert.throws(() => requireEnv(["__CUENTOS_A", "__CUENTOS_B"]), /__CUENTOS_A.*__CUENTOS_B/s);
});

test("requireEnv passes when all are present", () => {
  process.env.__CUENTOS_A = "x";
  process.env.__CUENTOS_B = "y";
  assert.doesNotThrow(() => requireEnv(["__CUENTOS_A", "__CUENTOS_B"]));
});

test("requireEnv does not leak values in the error message", () => {
  process.env.__CUENTOS_SECRET = "";
  try {
    requireEnv(["__CUENTOS_SECRET"]);
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(!e.message.includes("super-secret"));
  }
});
