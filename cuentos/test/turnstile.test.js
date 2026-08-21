const { test } = require("node:test");
const assert = require("node:assert");
const { env } = require("../lib/env.js");
const ts = require("../lib/turnstile.js");

const withSecret = async (fn) => {
  const before = env.TURNSTILE_SECRET_KEY;
  env.TURNSTILE_SECRET_KEY = "0x-secret";
  try { return await fn(); } finally {
    if (before === undefined) delete env.TURNSTILE_SECRET_KEY;
    else env.TURNSTILE_SECRET_KEY = before;
  }
};

test("without a secret nothing is enforced: a missing key must not stop the shop", async () => {
  delete env.TURNSTILE_SECRET_KEY;
  const never = async () => { throw new Error("must not call Cloudflare"); };
  assert.strictEqual(await ts.verify(undefined, "1.2.3.4", { fetch: never }), true);
  assert.strictEqual(ts.isConfigured(), false);
});

test("once configured, a missing token is refused", async () => {
  await withSecret(async () => {
    const never = async () => { throw new Error("must not call Cloudflare"); };
    // Otherwise the check is skipped simply by not sending a token.
    assert.strictEqual(await ts.verify(undefined, "1.2.3.4", { fetch: never }), false);
    assert.strictEqual(await ts.verify("", "1.2.3.4", { fetch: never }), false);
  });
});

test("the token, the secret and the ip are what Cloudflare is asked about", async () => {
  await withSecret(async () => {
    let seen = null;
    const fetchFn = async (url, opts) => {
      seen = { url, body: new URLSearchParams(opts.body) };
      return { json: async () => ({ success: true }) };
    };
    assert.strictEqual(await ts.verify("tok-123", "9.9.9.9", { fetch: fetchFn }), true);
    assert.strictEqual(seen.url, ts.VERIFY_URL);
    assert.strictEqual(seen.body.get("response"), "tok-123");
    assert.strictEqual(seen.body.get("secret"), "0x-secret");
    assert.strictEqual(seen.body.get("remoteip"), "9.9.9.9");
  });
});

test("a verdict of false is refused", async () => {
  await withSecret(async () => {
    const fetchFn = async () => ({ json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) });
    assert.strictEqual(await ts.verify("tok", "1.1.1.1", { fetch: fetchFn }), false);
  });
});

// Cloudflare being down must not close the shop: the daily caps still bound
// what anything slipping through can spend.
test("an unreachable Cloudflare lets the order through", async () => {
  await withSecret(async () => {
    const fetchFn = async () => { throw new Error("network down"); };
    assert.strictEqual(await ts.verify("tok", "1.1.1.1", { fetch: fetchFn }), true);
  });
});

test("siteKey is the public half and is null when unset", () => {
  delete env.TURNSTILE_SITE_KEY;
  assert.strictEqual(ts.siteKey(), null);
  env.TURNSTILE_SITE_KEY = "0x4AAA";
  assert.strictEqual(ts.siteKey(), "0x4AAA");
  delete env.TURNSTILE_SITE_KEY;
});
