const { test } = require("node:test");
const assert = require("node:assert");
const H = require("../lib/handlers.js");
const { validateOrderInput } = require("../lib/order-input.js");
const { render } = require("../lib/email.js");
const valid = require("./fixtures/story-valid.json");

// --- fakes ---------------------------------------------------------------------

function req({ method = "POST", body = {}, query = {}, headers = {} } = {}) {
  return { method, body, query, headers: { "x-forwarded-for": "9.9.9.9", ...headers }, url: "/" };
}
function res() {
  const r = { statusCode: 0, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (s) => { r.body = JSON.parse(s); };
  return r;
}

const GOOD = {
  email: "Padre@Ejemplo.es",
  locale: "es",
  personalization: {
    name: "Ana", gender: "nina", ageBand: "6-8", hairColor: "castano", hairType: "rizado", skin: "clara", glasses: true,
    pet: "gato", hobby: "dibujar", theme: "mar", moment: "hermanito", tone: "dormir",
    people: [{ name: "Carmen", relation: "abuela" }], dedication: "Para Ana, de la abuela.",
  },
};

function fakeDb(over = {}) {
  const story = { id: "s1", order_id: "o1", token: "abcdefghijklmnopqrstuv", stage: "script", story: valid, revisions: 0, instructions: [], page_paths: {}, coloring_paths: [], expires_at: new Date(Date.now() + 86400000).toISOString() };
  const order = { id: "o1", email: "a@b.c", locale: "es", status: "script", price_cents: 1290, vat_rate: 0.04, personalization: GOOD.personalization };
  const calls = [];
  const db = {
    calls, story, order,
    hashIp: () => "iphash",
    countStagesToday: async () => 0,
    countOrdersToday: async () => 0,
    recordBlockedInput: async (...a) => calls.push(["blocked", ...a]),
    createOrder: async (row) => { calls.push(["createOrder", row]); return { ...order, ...row }; },
    createJob: async (row) => { calls.push(["createJob", row]); return { id: "j1", ...row }; },
    getStoryByOrder: async () => story,
    getStoryByToken: async (t) => (t === story.token ? story : null),
    getOrder: async () => order,
    updateOrder: async (_, p) => { calls.push(["updateOrder", p]); Object.assign(order, p); return order; },
    updateStory: async (_, p) => { calls.push(["updateStory", p]); Object.assign(story, p); return story; },
    signedUrl: async (_, path) => `https://signed/${path}`,
    addWaitlist: async (...a) => calls.push(["waitlist", ...a]),
    addPrintInterest: async (...a) => calls.push(["printInterest", ...a]),
    staleJobs: async () => [],
    storiesExpiringSoon: async () => [],
    expiredStories: async () => [],
    remove: async (...a) => calls.push(["remove", ...a]),
    purgeStory: async (...a) => calls.push(["purge", ...a]),
    jobsNeedingReview: async () => [],
    getJob: async () => null,
    saveJob: async (...a) => calls.push(["saveJob", ...a]),
    recordBilling: async (...a) => calls.push(["billing", ...a]),
    markPaid: async (...a) => calls.push(["markPaid", ...a]),
    ...over,
  };
  return db;
}
const okMod = { checkInput: async () => ({ ok: true, needsReview: false }) };
const runDone = async () => ({ state: "done" });

// --- order input ----------------------------------------------------------------

test("validateOrderInput accepts a complete form and normalises the email", () => {
  const v = validateOrderInput(GOOD);
  assert.deepStrictEqual(v.errors, []);
  assert.strictEqual(v.email, "padre@ejemplo.es");
  assert.strictEqual(v.personalization.people[0].relation, "abuela");
});

test("validateOrderInput rejects values outside the closed lists, one error per field", () => {
  const v = validateOrderInput({ ...GOOD, personalization: { ...GOOD.personalization, theme: "no-existe", tone: "triste", people: [{ name: "X", relation: "vecino" }] } });
  assert.ok(v.errors.some((e) => e.startsWith("theme")));
  assert.ok(v.errors.some((e) => e.startsWith("tone")));
  assert.ok(v.errors.some((e) => e.includes("people[0].relation")));
});

test("validateOrderInput requires a name and a valid email, caps people at two", () => {
  const v = validateOrderInput({ email: "nope", personalization: { ...GOOD.personalization, name: " ", people: [{ name: "a", relation: "abuela" }, { name: "b", relation: "abuelo" }, { name: "c", relation: "primo" }] } });
  assert.ok(v.errors.includes("email: invalid"));
  assert.ok(v.errors.includes("name: required"));
  assert.ok(v.errors.some((e) => e.startsWith("people: at most")));
});

// --- order handler --------------------------------------------------------------

test("order: happy path creates the order and the script job, runs it, returns the token", async () => {
  const db = fakeDb();
  const r = res();
  await H.orderHandler({ db, moderation: okMod, runJob: runDone })(req({ body: GOOD }), r);
  assert.strictEqual(r.statusCode, 201);
  assert.strictEqual(r.body.token, db.story.token);
  const created = db.calls.find((c) => c[0] === "createOrder")[1];
  assert.strictEqual(created.price_cents, 1290);
  assert.strictEqual(created.status, "script");
  assert.strictEqual(created.ip_hash, "iphash");
  assert.strictEqual(db.calls.find((c) => c[0] === "createJob")[1].kind, "script");
});

test("order: english locale picks the 14,90 product", async () => {
  const db = fakeDb();
  await H.orderHandler({ db, moderation: okMod, runJob: runDone })(req({ body: { ...GOOD, locale: "en" } }), res());
  assert.strictEqual(db.calls.find((c) => c[0] === "createOrder")[1].price_cents, 1490);
});

test("order: a blocked input is refused before anything is created, and only a hash is kept", async () => {
  const db = fakeDb();
  const r = res();
  await H.orderHandler({ db, moderation: { checkInput: async () => ({ ok: false, reason: "blocked word" }) }, runJob: runDone })(req({ body: GOOD }), r);
  assert.strictEqual(r.statusCode, 422);
  assert.ok(!db.calls.some((c) => c[0] === "createOrder"));
  assert.ok(db.calls.some((c) => c[0] === "blocked"));
});

test("order: the daily cap answers sold_out; one script per email; three per ip", async () => {
  let r = res();
  await H.orderHandler({ db: fakeDb({ countStagesToday: async () => 200 }), moderation: okMod, runJob: runDone })(req({ body: GOOD }), r);
  assert.strictEqual(r.statusCode, 503);
  r = res();
  await H.orderHandler({ db: fakeDb({ countOrdersToday: async ({ email }) => (email ? 1 : 0) }), moderation: okMod, runJob: runDone })(req({ body: GOOD }), r);
  assert.strictEqual(r.body.error, "email_limit");
  r = res();
  await H.orderHandler({ db: fakeDb({ countOrdersToday: async ({ ipHash }) => (ipHash ? 3 : 0) }), moderation: okMod, runJob: runDone })(req({ body: GOOD }), r);
  assert.strictEqual(r.body.error, "ip_limit");
});

test("order: invalid form → 400 with the field list; wrong method → 405", async () => {
  let r = res();
  await H.orderHandler({ db: fakeDb(), moderation: okMod, runJob: runDone })(req({ body: { email: "x" } }), r);
  assert.strictEqual(r.statusCode, 400);
  assert.ok(Array.isArray(r.body.details));
  r = res();
  await H.orderHandler({ db: fakeDb(), moderation: okMod, runJob: runDone })(req({ method: "GET" }), r);
  assert.strictEqual(r.statusCode, 405);
});

test("order: a job that did not finish inline answers 202 so the front waits for the email", async () => {
  const r = res();
  await H.orderHandler({ db: fakeDb(), moderation: okMod, runJob: async () => ({ state: "pending" }) })(req({ body: GOOD }), r);
  assert.strictEqual(r.statusCode, 202);
});

// --- story handler --------------------------------------------------------------

test("story: returns the text with real names and hides what is not illustrated yet", async () => {
  const db = fakeDb();
  const r = res();
  await H.storyHandler({ db })(req({ method: "GET", query: { token: db.story.token } }), r);
  assert.strictEqual(r.statusCode, 200);
  assert.ok(r.body.pages[0].text.includes("Ana"));
  assert.ok(!JSON.stringify(r.body).includes("{{"));
  assert.strictEqual(r.body.pages[0].illustratedLater, true);
  assert.strictEqual(r.body.pdf, null);
  assert.strictEqual(r.body.revisionsLeft, 2);
  assert.ok(!("email" in r.body), "the viewer never leaks the email");
});

test("story: in sample stage only the two sample pages carry images", async () => {
  const db = fakeDb();
  db.story.stage = "sample";
  db.story.page_paths = { 0: "t/p01.png", 5: "t/p06.png" };
  db.story.sheet_path = "t/sheet.png";
  const r = res();
  await H.storyHandler({ db })(req({ method: "GET", query: { token: db.story.token } }), r);
  assert.match(r.body.pages[0].image, /signed/);
  assert.strictEqual(r.body.pages[1].image, null);
  assert.match(r.body.sheet, /sheet/);
  assert.strictEqual(r.body.pdf, null);
});

test("story: in full stage everything is visible, including the PDF", async () => {
  const db = fakeDb();
  db.story.stage = "full";
  db.story.page_paths = Object.fromEntries([...Array(12).keys()].map((i) => [i, `t/p${i}.png`]));
  db.story.coloring_paths = ["t/c1.png"];
  db.story.pdf_path = "t/libro.pdf";
  const r = res();
  await H.storyHandler({ db })(req({ method: "GET", query: { token: db.story.token } }), r);
  assert.ok(r.body.pages.every((p) => p.image));
  assert.match(r.body.pdf, /libro\.pdf/);
  assert.strictEqual(r.body.coloring.length, 1);
});

test("story: unknown token → 404, expired → 410, malformed → 400", async () => {
  const db = fakeDb();
  let r = res();
  await H.storyHandler({ db })(req({ method: "GET", query: { token: "zzzzzzzzzzzzzzzzzzzzzz" } }), r);
  assert.strictEqual(r.statusCode, 404);
  db.story.expires_at = new Date(Date.now() - 1000).toISOString();
  r = res();
  await H.storyHandler({ db })(req({ method: "GET", query: { token: db.story.token } }), r);
  assert.strictEqual(r.statusCode, 410);
  r = res();
  await H.storyHandler({ db })(req({ method: "GET", query: { token: "short" } }), r);
  assert.strictEqual(r.statusCode, 400);
});

// --- revise ---------------------------------------------------------------------

test("revise: two rounds allowed, the third is refused", async () => {
  const db = fakeDb();
  const deps = { db, moderation: okMod, runJob: runDone };
  let r = res();
  await H.reviseHandler(deps)(req({ body: { token: db.story.token, instruction: "que la abuela tenga más protagonismo" } }), r);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.revisionsLeft, 1);
  r = res();
  await H.reviseHandler(deps)(req({ body: { token: db.story.token, instruction: "menos miedo en la página 6" } }), r);
  assert.strictEqual(r.body.revisionsLeft, 0);
  r = res();
  await H.reviseHandler(deps)(req({ body: { token: db.story.token, instruction: "otra cosa más" } }), r);
  assert.strictEqual(r.statusCode, 409);
  assert.strictEqual(r.body.error, "no_revisions_left");
  const job = db.calls.filter((c) => c[0] === "createJob").pop()[1];
  assert.deepStrictEqual(job.input, { revision: true });
});

test("revise: the instruction is moderated and bounded, and refused on a finished book", async () => {
  const db = fakeDb();
  let r = res();
  await H.reviseHandler({ db, moderation: { checkInput: async () => ({ ok: false, reason: "contact details" }) }, runJob: runDone })(req({ body: { token: db.story.token, instruction: "llama al 600123456" } }), r);
  assert.strictEqual(r.statusCode, 422);
  r = res();
  await H.reviseHandler({ db, moderation: okMod, runJob: runDone })(req({ body: { token: db.story.token, instruction: "x".repeat(201) } }), r);
  assert.strictEqual(r.statusCode, 400);
  // sample is allowed now (see the dead-end tests below); a paid book is not
  db.story.stage = "full";
  r = res();
  await H.reviseHandler({ db, moderation: okMod, runJob: runDone })(req({ body: { token: db.story.token, instruction: "algo razonable" } }), r);
  assert.strictEqual(r.statusCode, 409);
});

// --- approve ---------------------------------------------------------------------

test("approve: creates a sample job from the script stage; refuses otherwise; honours the daily cap", async () => {
  const db = fakeDb();
  let r = res();
  await H.approveHandler({ db, runJob: runDone })(req({ body: { token: db.story.token } }), r);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(db.calls.find((c) => c[0] === "createJob")[1].kind, "sample");
  db.story.stage = "sample";
  r = res();
  await H.approveHandler({ db, runJob: runDone })(req({ body: { token: db.story.token } }), r);
  assert.strictEqual(r.statusCode, 409);
  const capped = fakeDb({ countStagesToday: async () => 40 });
  r = res();
  await H.approveHandler({ db: capped, runJob: runDone })(req({ body: { token: capped.story.token } }), r);
  assert.strictEqual(r.statusCode, 503);
});

// --- cron -----------------------------------------------------------------------

test("cron: purges expired stories (files + personal data), sends reminders, resumes stale jobs", async () => {
  const expired = { id: "s9", order_id: "o1", token: "t", sheet_path: "t/sheet.png", pdf_path: "t/libro.pdf", page_paths: { 0: "t/p0.png" }, coloring_paths: ["t/c0.png"] };
  const soon = { id: "s8", order_id: "o1", token: "u" };
  const sent = [];
  const db = fakeDb({
    expiredStories: async () => [expired],
    storiesExpiringSoon: async () => [soon],
    staleJobs: async () => [{ id: "j5" }],
  });
  const ran = [];
  const r = res();
  process.env.CRON_SECRET = "s3cret";
  await H.cronHandler({ db, runJob: async (id) => ran.push(id), sendEmail: async (m) => sent.push(m.kind) })(req({ method: "GET", headers: { authorization: "Bearer s3cret" } }), r);
  delete process.env.CRON_SECRET;
  assert.deepStrictEqual(r.body, { resumed: 1, reminded: 1, purged: 1 });
  assert.deepStrictEqual(ran, ["j5"]);
  const removed = db.calls.find((c) => c[0] === "remove")[2];
  assert.strictEqual(removed.length, 4);
  assert.ok(db.calls.some((c) => c[0] === "purge"));
  assert.ok(db.calls.some((c) => c[0] === "updateOrder" && c[1].personalization === null && c[1].status === "expired"));
  assert.deepStrictEqual(sent.sort(), ["expired", "expiring"]);
});

test("cron and job endpoints fail CLOSED: 503 without a secret configured, 401 with a wrong one", async () => {
  delete process.env.CRON_SECRET;
  let r = res();
  await H.cronHandler({ db: fakeDb(), runJob: runDone })(req({ method: "GET" }), r);
  assert.strictEqual(r.statusCode, 503);
  r = res();
  await H.jobHandler({ runJob: runDone })(req({ body: { id: "j1" } }), r);
  assert.strictEqual(r.statusCode, 503);
  process.env.CRON_SECRET = "s3cret";
  r = res();
  await H.cronHandler({ db: fakeDb(), runJob: runDone })(req({ method: "GET", headers: { authorization: "Bearer nope" } }), r);
  assert.strictEqual(r.statusCode, 401);
  r = res();
  await H.jobHandler({ runJob: runDone })(req({ body: { id: "j1" }, headers: { authorization: "Bearer s3cret" } }), r);
  assert.strictEqual(r.statusCode, 200);
  delete process.env.CRON_SECRET;
});

// --- admin -----------------------------------------------------------------------

test("admin: requires the token; mark_paid records billing, extends expiry and starts the full job", async () => {
  process.env.ADMIN_TOKEN = "adm";
  const db = fakeDb();
  let r = res();
  await H.adminHandler({ db, runJob: runDone })(req({ method: "GET" }), r);
  assert.strictEqual(r.statusCode, 401);
  r = res();
  await H.adminHandler({ db, runJob: runDone })(req({ body: { action: "mark_paid", token: db.story.token, provider: "etsy", reference: "etsy-123" }, headers: { authorization: "Bearer adm" } }), r);
  assert.strictEqual(r.statusCode, 200);
  assert.ok(db.calls.some((c) => c[0] === "billing" && c[1].provider_id === "etsy-123" && c[1].amount_cents === 1290));
  assert.ok(db.calls.some((c) => c[0] === "markPaid"));
  assert.strictEqual(db.calls.find((c) => c[0] === "createJob")[1].kind, "full");
  delete process.env.ADMIN_TOKEN;
});

test("admin: approve makes the story full, the order delivered, and emails the customer", async () => {
  process.env.ADMIN_TOKEN = "adm";
  const db = fakeDb({ getJob: async () => ({ id: "j3", kind: "full", order_id: "o1" }) });
  const sent = [];
  const r = res();
  await H.adminHandler({ db, runJob: runDone, sendEmail: async (m) => sent.push(m.kind) })(req({ body: { action: "approve", jobId: "j3" }, headers: { authorization: "Bearer adm" } }), r);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(db.story.stage, "full");
  assert.strictEqual(db.order.status, "delivered");
  assert.deepStrictEqual(sent, ["book_ready"]);
  delete process.env.ADMIN_TOKEN;
});

test("admin: retouch is allowed once, on a full story, for up to 3 pages", async () => {
  process.env.ADMIN_TOKEN = "adm";
  const db = fakeDb();
  db.story.stage = "full";
  let r = res();
  await H.adminHandler({ db, runJob: runDone })(req({ body: { action: "retouch", token: db.story.token, pages: [1, 4, 7, 9] }, headers: { authorization: "Bearer adm" } }), r);
  assert.strictEqual(r.statusCode, 200);
  const job = db.calls.find((c) => c[0] === "createJob")[1];
  assert.strictEqual(job.kind, "retouch");
  assert.deepStrictEqual(job.input.pages, [1, 4, 7]);
  r = res();
  await H.adminHandler({ db, runJob: runDone })(req({ body: { action: "retouch", token: db.story.token, pages: [2] }, headers: { authorization: "Bearer adm" } }), r);
  assert.strictEqual(r.statusCode, 409);
  delete process.env.ADMIN_TOKEN;
});

// --- emails ---------------------------------------------------------------------

test("emails: every kind renders in both languages with the story link and no name in the subject", () => {
  for (const locale of ["es", "en"]) {
    for (const kind of ["script_ready", "sample_ready", "book_ready", "expiring", "expired", "review_needed"]) {
      const { subject, text } = render({ kind, locale, token: "abcdefghijklmnopqrstuv" });
      assert.ok(subject.length > 10, `${locale}/${kind} subject`);
      if (!["expired", "review_needed"].includes(kind)) assert.match(text, /\/c\/abcdefghijklmnopqrstuv/, `${locale}/${kind} link`);
      assert.ok(!/\{\{/.test(text));
    }
  }
});

test("emails: book_ready repeats the withdrawal waiver", () => {
  assert.match(render({ kind: "book_ready", locale: "es", token: "abcdefghijklmnopqrstuv" }).text, /103 m/);
});

test("emails: an unknown kind throws instead of sending something empty", () => {
  assert.throws(() => render({ kind: "party", locale: "es" }), /unknown email kind/);
});

test("admin fails closed without ADMIN_TOKEN configured", async () => {
  delete process.env.ADMIN_TOKEN;
  const r = res();
  await H.adminHandler({ db: fakeDb(), runJob: runDone })(req({ method: "GET", headers: { authorization: "Bearer anything" } }), r);
  assert.strictEqual(r.statusCode, 503);
});

test("clientIp prefers the platform's x-real-ip and never the first forwarded hop", () => {
  const { clientIp } = require("../lib/http.js");
  assert.strictEqual(clientIp({ headers: { "x-real-ip": "5.5.5.5", "x-forwarded-for": "1.1.1.1, 5.5.5.5" } }), "5.5.5.5");
  assert.strictEqual(clientIp({ headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2, 5.5.5.5" } }), "5.5.5.5");
  assert.strictEqual(clientIp({ headers: {}, socket: { remoteAddress: "7.7.7.7" } }), "7.7.7.7");
});

test("secretsMatch is exact and tolerates different lengths without throwing", () => {
  const { secretsMatch } = require("../lib/http.js");
  assert.strictEqual(secretsMatch("abc", "abc"), true);
  assert.strictEqual(secretsMatch("abc", "abd"), false);
  assert.strictEqual(secretsMatch("", "abc"), false);
  assert.strictEqual(secretsMatch("a-very-long-token-indeed", "abc"), false);
});

test("waitlist accepts the gallery reason and rejects a bad email", async () => {
  const db = fakeDb();
  const r1 = res();
  await H.waitlistHandler({ db })(req({ body: { email: " Lector@Ejemplo.ES ", locale: "en", reason: "gallery" } }), r1);
  assert.strictEqual(r1.statusCode, 201);
  assert.deepStrictEqual(db.calls.at(-1), ["waitlist", "lector@ejemplo.es", "en", "gallery"]);

  const r2 = res();
  await H.waitlistHandler({ db })(req({ body: { email: "nope", reason: "gallery" } }), r2);
  assert.strictEqual(r2.statusCode, 400);
});

test("waitlist falls back to the daily-cap reason when it is not one we know", async () => {
  const db = fakeDb();
  const r = res();
  await H.waitlistHandler({ db })(req({ body: { email: "a@b.co", reason: "whatever" } }), r);
  assert.deepStrictEqual(db.calls.at(-1), ["waitlist", "a@b.co", "es", "cap"]);
});

// Step 2 was a dead end: once the sample was drawn there was no way back, no
// matter how many free rewrites were still on the table. The way out is the one
// that is already capped — a revision — and it must throw the drawn pages away,
// because they no longer match the text.
test("revise works from the sample stage while rewrites remain, and clears the drawings", async () => {
  const db = fakeDb();
  db.story.stage = "sample";
  db.story.revisions = 0;
  db.story.sheet_path = "tok/sheet.png";
  db.story.page_paths = { 0: "tok/p01.png", 5: "tok/p06.png" };
  const r = res();
  await H.reviseHandler({ db, moderation: { checkInput: async () => ({ ok: true }) }, runJob: runDone })(
    req({ body: { token: db.story.token, instruction: "que la abuela salga mas" } }), r
  );
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(db.story.stage, "script", "it must go back to the script gate");
  assert.strictEqual(db.story.sheet_path, null);
  assert.deepStrictEqual(db.story.page_paths, {});
  const removed = db.calls.find((c) => c[0] === "remove");
  assert.ok(removed, "the orphaned images must be deleted from storage");
  assert.deepStrictEqual(removed[2].sort(), ["tok/p01.png", "tok/p06.png", "tok/sheet.png"]);
});

test("revise from the sample stage is refused once the rewrites are used up", async () => {
  const db = fakeDb();
  db.story.stage = "sample";
  db.story.revisions = 2;
  const r = res();
  await H.reviseHandler({ db, moderation: { checkInput: async () => ({ ok: true }) }, runJob: runDone })(
    req({ body: { token: db.story.token, instruction: "otro cambio" } }), r
  );
  assert.strictEqual(r.statusCode, 409);
  assert.strictEqual(r.body.error, "no_revisions_left");
});

test("revise is still refused on a finished book", async () => {
  const db = fakeDb();
  db.story.stage = "full";
  const r = res();
  await H.reviseHandler({ db, moderation: { checkInput: async () => ({ ok: true }) }, runJob: runDone })(
    req({ body: { token: db.story.token, instruction: "un cambio" } }), r
  );
  assert.strictEqual(r.statusCode, 409);
  assert.strictEqual(r.body.error, "wrong_stage");
});

// A father with an age band of "6 to 8" is the form contradicting itself.
test("validateOrderInput takes an age only for companions who are children", () => {
  const withPeople = (people) => validateOrderInput({ ...GOOD, personalization: { ...GOOD.personalization, people } });

  const child = withPeople([{ name: "Leo", relation: "hermano", ageBand: "3-5" }]);
  assert.deepStrictEqual(child.errors, []);
  assert.strictEqual(child.personalization.people[0].ageBand, "3-5");

  const teen = withPeople([{ name: "Sara", relation: "prima", ageBand: "adolescente" }]);
  assert.deepStrictEqual(teen.errors, []);

  const adult = withPeople([{ name: "Papá", relation: "padre", ageBand: "6-8" }]);
  assert.ok(adult.errors.some((e) => e.includes("people[0].ageBand")), "an adult cannot be 6 to 8");

  // an adult with no age is the normal case and must pass untouched
  const fine = withPeople([{ name: "Papá", relation: "padre" }]);
  assert.deepStrictEqual(fine.errors, []);
  assert.strictEqual(fine.personalization.people[0].ageBand, null);
});

test("validateOrderInput carries a bounded free-text note", () => {
  const withNote = (notes) => validateOrderInput({ ...GOOD, personalization: { ...GOOD.personalization, notes } });
  assert.strictEqual(withNote("Le encanta el color rojo").personalization.notes, "Le encanta el color rojo");
  assert.strictEqual(withNote("   ").personalization.notes, "");
  assert.strictEqual(withNote(undefined).personalization.notes, "");
  assert.ok(withNote("x".repeat(301)).errors.some((e) => e.startsWith("notes")), "a note must not be a novel");
});

test("order sends the free note to moderation, not just the dedication", async () => {
  let seen = null;
  const db = fakeDb();
  await H.orderHandler({
    db,
    moderation: { checkInput: async (a) => { seen = a; return { ok: true }; } },
    runJob: runDone,
  })(req({ body: { ...GOOD, personalization: { ...GOOD.personalization, notes: "le da miedo el ascensor" } } }), res());
  assert.strictEqual(seen.notes, "le da miedo el ascensor");
});
