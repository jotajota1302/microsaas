const { test } = require("node:test");
const assert = require("node:assert");
const { createDb, newToken, daysFromNow, hashIp, SCRIPT_TTL_DAYS, FULL_TTL_DAYS } = require("../lib/db.js");

/**
 * A recording fake of the supabase-js query builder: every call is logged,
 * the chain is thenable, and resolves to whatever `result` says.
 */
function fakeClient(result = { data: { id: "row-1" }, error: null }) {
  const log = [];
  function builder(table) {
    const calls = [];
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === "then") {
          return (resolve) => { log.push({ table, calls }); resolve(result); };
        }
        return (...args) => { calls.push([prop, ...args]); return chain; };
      },
    });
    return chain;
  }
  const storageLog = [];
  const rpcLog = [];
  return {
    log,
    storageLog,
    rpcLog,
    from: (table) => builder(table),
    rpc: async (fn, args) => { rpcLog.push([fn, args]); return result; },
    storage: {
      from: (bucket) => ({
        upload: async (path, buffer, opts) => { storageLog.push(["upload", bucket, path, buffer.length, opts]); return { error: null }; },
        createSignedUrl: async (path, seconds) => { storageLog.push(["sign", bucket, path, seconds]); return { data: { signedUrl: `https://x/${path}?t=${seconds}` }, error: null }; },
        download: async (path) => ({ data: { arrayBuffer: async () => Buffer.from("pdf") }, error: null }),
        remove: async (paths) => { storageLog.push(["remove", bucket, paths]); return { error: null }; },
      }),
    },
  };
}

const ops = (client, i = 0) => client.log[i].calls.map((c) => c[0]);

test("tokens are 22 url-safe characters and do not repeat", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const tok = newToken();
    assert.match(tok, /^[A-Za-z0-9_-]{22}$/);
    seen.add(tok);
  }
  assert.strictEqual(seen.size, 200);
});

test("expiry arithmetic: 7 days for a script, 30 for a paid story", () => {
  const from = new Date("2026-08-21T10:00:00Z");
  assert.strictEqual(daysFromNow(SCRIPT_TTL_DAYS, from), "2026-08-28T10:00:00.000Z");
  assert.strictEqual(daysFromNow(FULL_TTL_DAYS, from), "2026-09-20T10:00:00.000Z");
});

test("ip hashes are stable, salted and never the raw address", () => {
  const a = hashIp("1.2.3.4");
  assert.strictEqual(a, hashIp("1.2.3.4"));
  assert.notStrictEqual(a, hashIp("1.2.3.5"));
  assert.ok(!a.includes("1.2.3.4"));
  assert.strictEqual(a.length, 32);
});

test("createStory writes a token, stage script and a 7-day expiry", async () => {
  const client = fakeClient();
  const db = createDb(client);
  await db.createStory({ orderId: "o1", story: { title: "x" }, peopleCount: 2 });
  const [insert] = client.log[0].calls;
  assert.strictEqual(client.log[0].table, "stories");
  assert.strictEqual(insert[0], "insert");
  const row = insert[1];
  assert.match(row.token, /^[A-Za-z0-9_-]{22}$/);
  assert.strictEqual(row.stage, "script");
  assert.strictEqual(row.people_count, 2);
  const days = (new Date(row.expires_at) - Date.now()) / 86400000;
  assert.ok(days > 6.9 && days < 7.1, `expiry ${days} days`);
});

test("markPaid extends the expiry to 30 days", async () => {
  const client = fakeClient();
  const db = createDb(client);
  await db.markPaid("s1");
  const [update] = client.log[0].calls;
  const days = (new Date(update[1].expires_at) - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days < 30.1);
});

// The claim goes through a database function, not a filtered UPDATE: PostgREST
// re-applies the filters to the returned row, and the row we just wrote no
// longer matches them, so the update landed but came back empty and no job ever
// ran. See migration 0002.
test("claimJob calls the claim_job function with the lock window", async () => {
  const client = fakeClient({ data: [{ id: "j1", state: "running" }], error: null });
  const db = createDb(client);
  const job = await db.claimJob("j1");
  assert.strictEqual(job.id, "j1");
  assert.strictEqual(client.log.length, 0, "the claim must not go through a table update");
  assert.deepStrictEqual(client.rpcLog, [["claim_job", { p_id: "j1", p_minutes: 5 }]]);
});

test("claimJob returns null when another worker holds the lock", async () => {
  assert.strictEqual(await createDb(fakeClient({ data: [], error: null })).claimJob("j1"), null);
  assert.strictEqual(await createDb(fakeClient({ data: null, error: null })).claimJob("j1"), null);
});

test("recordBilling upserts on provider_id and ignores duplicates", async () => {
  const client = fakeClient();
  const db = createDb(client);
  await db.recordBilling({ provider: "etsy", provider_id: "r-1", amount_cents: 1290, status: "paid" });
  const [upsert] = client.log[0].calls;
  assert.strictEqual(upsert[0], "upsert");
  assert.deepStrictEqual(upsert[2], { onConflict: "provider_id", ignoreDuplicates: true });
});

test("countOrdersToday filters by today, email and ip hash", async () => {
  const client = fakeClient({ count: 3, error: null });
  const db = createDb(client);
  const n = await db.countOrdersToday({ email: "a@b.c", ipHash: "h" });
  assert.strictEqual(n, 3);
  const names = ops(client);
  assert.deepStrictEqual(names, ["select", "gte", "eq", "eq"]);
});

test("recordBlockedInput stores a hash, never the text", async () => {
  const client = fakeClient();
  const db = createDb(client);
  await db.recordBlockedInput("blocked word", "texto ofensivo");
  const row = client.log[0].calls[0][1];
  assert.strictEqual(row.reason, "blocked word");
  assert.ok(!JSON.stringify(row).includes("ofensivo"));
  assert.match(row.input_hash, /^[a-f0-9]{64}$/);
});

test("a database error surfaces as a thrown error, never as undefined data", async () => {
  const db = createDb(fakeClient({ data: null, error: { message: "permission denied", code: "42501" } }));
  await assert.rejects(() => db.getOrder("x"), /permission denied/);
});

test("storage helpers hit the right bucket and return signed urls", async () => {
  const client = fakeClient();
  const db = createDb(client);
  await db.upload("stories", "t/p01.png", Buffer.from("img"), "image/png");
  const url = await db.signedUrl("stories", "t/libro.pdf", 60);
  await db.remove("stories", ["t/p01.png"]);
  await db.remove("stories", []);
  assert.match(url, /t\/libro\.pdf\?t=60/);
  assert.deepStrictEqual(client.storageLog.map((s) => s[0]), ["upload", "sign", "remove"]);
  assert.strictEqual(client.storageLog[0][4].contentType, "image/png");
});

test("recentOrders and recentJobs read the newest first, capped", async () => {
  const client = fakeClient({ data: [{ id: "o1" }], error: null });
  const db = createDb(client);
  await db.recentOrders(25);
  assert.deepStrictEqual(ops(client), ["select", "order", "limit"]);
  const order = client.log[0].calls.find((c) => c[0] === "order");
  assert.strictEqual(order[1], "created_at");
  assert.deepStrictEqual(order[2], { ascending: false });
  assert.strictEqual(client.log[0].calls.find((c) => c[0] === "limit")[1], 25);

  const c2 = fakeClient({ data: [], error: null });
  await createDb(c2).recentJobs(10);
  assert.strictEqual(c2.log[0].table, "jobs");
});

test("liveStoriesFor looks up a customer's stories by email, newest first", async () => {
  const client = fakeClient({ data: [{ id: "o1" }], error: null });
  const db = createDb(client);
  await db.liveStoriesFor("PADRE@Ejemplo.ES ");
  const names = ops(client);
  assert.ok(names.includes("eq"), "it must filter by email");
  const eq = client.log[0].calls.find((c) => c[0] === "eq");
  assert.strictEqual(eq[2], "padre@ejemplo.es", "the email is normalised, or nobody ever matches");
});
