const { test } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { env } = require("../lib/env.js");
const S = require("../lib/stripe.js");

const STORY = { token: "abcdefghijklmnopqrstuv" };
const ORDER = { id: "o1", email: "padre@ejemplo.es", locale: "es", product: "pdf" };

const withKeys = async (fn) => {
  const before = { s: env.STRIPE_SECRET_KEY, w: env.STRIPE_WEBHOOK_SECRET };
  env.STRIPE_SECRET_KEY = "sk_test_x";
  env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  try { return await fn(); } finally {
    if (before.s === undefined) delete env.STRIPE_SECRET_KEY; else env.STRIPE_SECRET_KEY = before.s;
    if (before.w === undefined) delete env.STRIPE_WEBHOOK_SECRET; else env.STRIPE_WEBHOOK_SECRET = before.w;
  }
};

// The single most valuable test here: a price taken from the request would let
// anyone edit a form field and buy the book for a cent.
test("the amount comes from the server's product table, never from the caller", async () => {
  await withKeys(async () => {
    let body = null;
    const fetchFn = async (_url, opts) => {
      body = new URLSearchParams(opts.body);
      return { ok: true, json: async () => ({ id: "cs_1", url: "https://checkout" }) };
    };
    await S.createCheckout({ story: STORY, order: { ...ORDER, priceCents: 1, price_cents: 1 }, baseUrl: "https://x.dev" }, { fetch: fetchFn });
    assert.strictEqual(body.get("line_items[0][price_data][unit_amount]"), "1199");
    assert.strictEqual(body.get("line_items[0][price_data][currency]"), "eur");
  });
});

test("the english product is the dearer one", async () => {
  await withKeys(async () => {
    let body = null;
    const fetchFn = async (_url, opts) => {
      body = new URLSearchParams(opts.body);
      return { ok: true, json: async () => ({ id: "cs_1", url: "https://checkout" }) };
    };
    await S.createCheckout({ story: STORY, order: { ...ORDER, locale: "en", product: "pdf_en" }, baseUrl: "https://x.dev" }, { fetch: fetchFn });
    assert.strictEqual(body.get("line_items[0][price_data][unit_amount]"), "1399");
    assert.strictEqual(body.get("locale"), "en");
  });
});

test("the story is identified by a reference we set, and the customer comes back to it", async () => {
  await withKeys(async () => {
    let body = null;
    const fetchFn = async (_url, opts) => {
      body = new URLSearchParams(opts.body);
      return { ok: true, json: async () => ({ id: "cs_1", url: "https://checkout" }) };
    };
    await S.createCheckout({ story: STORY, order: ORDER, baseUrl: "https://x.dev/" }, { fetch: fetchFn });
    assert.strictEqual(body.get("client_reference_id"), STORY.token);
    assert.strictEqual(body.get("metadata[token]"), STORY.token);
    assert.strictEqual(body.get("success_url"), `https://x.dev/c/${STORY.token}?pagado=1`);
    assert.strictEqual(body.get("cancel_url"), `https://x.dev/c/${STORY.token}`);
    assert.strictEqual(body.get("customer_email"), ORDER.email);
  });
});

test("a stripe error surfaces instead of being swallowed", async () => {
  await withKeys(async () => {
    const fetchFn = async () => ({ ok: false, json: async () => ({ error: { message: "No such price" } }) });
    await assert.rejects(
      () => S.createCheckout({ story: STORY, order: ORDER }, { fetch: fetchFn }),
      (e) => e.name === "StripeError" && /No such price/.test(e.message)
    );
  });
});

// --- the webhook: this signature IS the security of the payment path --------

const sign = (body, secret, t) => {
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
};

test("a correctly signed event is read back", async () => {
  await withKeys(() => {
    const now = Date.now();
    const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: "tok" } } });
    const event = S.readEvent(body, sign(body, "whsec_test", Math.floor(now / 1000)), { now });
    assert.strictEqual(event.type, "checkout.session.completed");
    assert.strictEqual(event.data.object.client_reference_id, "tok");
  });
});

test("an unsigned, wrongly signed or tampered event is refused", async () => {
  await withKeys(() => {
    const now = Date.now();
    const t = Math.floor(now / 1000);
    const body = JSON.stringify({ type: "checkout.session.completed" });

    assert.throws(() => S.readEvent(body, null, { now }), /missing signature/);
    assert.throws(() => S.readEvent(body, "garbage", { now }), /malformed signature/);
    assert.throws(() => S.readEvent(body, sign(body, "whsec_wrong", t), { now }), /signature mismatch/);
    // the body changed after signing: the whole point of the check
    assert.throws(() => S.readEvent(body + " ", sign(body, "whsec_test", t), { now }), /signature mismatch/);
  });
});

test("a replayed old event is refused, so it cannot deliver a second book", async () => {
  await withKeys(() => {
    const now = Date.now();
    const old = Math.floor(now / 1000) - 3600;
    const body = JSON.stringify({ type: "checkout.session.completed" });
    assert.throws(() => S.readEvent(body, sign(body, "whsec_test", old), { now }), /out of tolerance/);
  });
});

test("without an endpoint secret nothing is believed", () => {
  delete env.STRIPE_WEBHOOK_SECRET;
  assert.throws(() => S.readEvent("{}", "t=1,v1=x"), /no STRIPE_WEBHOOK_SECRET/);
});
