/*
 * All reads and writes to Supabase go through here, with the service role.
 * createDb(client) takes any supabase-js-shaped client so tests can pass a
 * fake; getDb() builds the real one once from the environment.
 *
 * Rule: nothing outside this file knows a table name.
 */

const crypto = require("crypto");
const { env, requireEnv } = require("./env.js");

const SCRIPT_TTL_DAYS = 7;
const FULL_TTL_DAYS = 30;
const LOCK_MINUTES = 5;

function newToken() {
  // 16 random bytes -> 22 url-safe characters, not enumerable
  return crypto.randomBytes(16).toString("base64url");
}

function daysFromNow(days, from = new Date()) {
  return new Date(from.getTime() + days * 86400000).toISOString();
}

function startOfTodayIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(`${env.IP_SALT || "cuentos"}:${ip || ""}`).digest("hex").slice(0, 32);
}

function unwrap({ data, error }) {
  if (error) {
    const e = new Error(`[cuentos] db: ${error.message || error}`);
    e.code = error.code;
    throw e;
  }
  return data;
}

function createDb(client) {
  const t = (name) => client.from(name);

  return {
    newToken,
    hashIp,

    // --- orders ---------------------------------------------------------------
    async createOrder(row) {
      return unwrap(await t("orders").insert(row).select().single());
    },
    async getOrder(id) {
      return unwrap(await t("orders").select("*").eq("id", id).maybeSingle());
    },
    async updateOrder(id, patch) {
      return unwrap(await t("orders").update(patch).eq("id", id).select().single());
    },
    async countOrdersToday({ email, ipHash } = {}) {
      let q = t("orders").select("id", { count: "exact", head: true }).gte("created_at", startOfTodayIso());
      if (email) q = q.eq("email", email);
      if (ipHash) q = q.eq("ip_hash", ipHash);
      const { count, error } = await q;
      if (error) throw new Error(`[cuentos] db: ${error.message}`);
      return count || 0;
    },

    // --- stories --------------------------------------------------------------
    async createStory({ orderId, story, peopleCount = 0 }) {
      const row = {
        order_id: orderId,
        token: newToken(),
        stage: "script",
        story,
        people_count: peopleCount,
        expires_at: daysFromNow(SCRIPT_TTL_DAYS),
      };
      return unwrap(await t("stories").insert(row).select().single());
    },
    async getStoryByToken(token) {
      return unwrap(await t("stories").select("*").eq("token", token).maybeSingle());
    },
    async getStoryByOrder(orderId) {
      return unwrap(await t("stories").select("*").eq("order_id", orderId).maybeSingle());
    },
    async updateStory(id, patch) {
      return unwrap(await t("stories").update(patch).eq("id", id).select().single());
    },
    /** Called on payment: the URL now lives 30 more days. */
    async markPaid(storyId) {
      return unwrap(await t("stories").update({ expires_at: daysFromNow(FULL_TTL_DAYS) }).eq("id", storyId).select().single());
    },
    async storiesExpiringSoon(limit = 50) {
      const inTwoDays = new Date(Date.now() + 2 * 86400000).toISOString();
      return unwrap(
        await t("stories").select("*")
          .is("reminder_sent_at", null)
          .neq("stage", "full")
          .lt("expires_at", inTwoDays)
          .gt("expires_at", new Date().toISOString())
          .limit(limit)
      );
    },
    /** Forgets the content but keeps the row: the token must not be reusable. */
    async purgeStory(id) {
      return unwrap(await t("stories").update({ story: {}, page_paths: {}, coloring_paths: [], sheet_path: null, pdf_path: null, instructions: [] }).eq("id", id).select().single());
    },
    async expiredStories(limit = 50) {
      return unwrap(await t("stories").select("*").lt("expires_at", new Date().toISOString()).limit(limit));
    },
    async countStagesToday(stage) {
      const { count, error } = await t("jobs")
        .select("id", { count: "exact", head: true })
        .eq("kind", stage)
        .gte("created_at", startOfTodayIso());
      if (error) throw new Error(`[cuentos] db: ${error.message}`);
      return count || 0;
    },

    // --- jobs -----------------------------------------------------------------
    async createJob({ orderId, storyId = null, kind, input = {} }) {
      return unwrap(await t("jobs").insert({ order_id: orderId, story_id: storyId, kind, input }).select().single());
    },
    async getJob(id) {
      return unwrap(await t("jobs").select("*").eq("id", id).maybeSingle());
    },
    /**
     * Claims a job for LOCK_MINUTES; returns null if someone else holds it.
     *
     * This goes through a database function on purpose. A filtered UPDATE from
     * here writes the row but comes back empty: PostgREST re-applies the
     * filters to the result, and the row it just wrote no longer satisfies
     * "locked_until is null or in the past". See migration 0002.
     */
    async claimJob(id) {
      const { data, error } = await client.rpc("claim_job", { p_id: id, p_minutes: LOCK_MINUTES });
      if (error) throw new Error(`[cuentos] db: ${error.message}`);
      return (Array.isArray(data) ? data[0] : data) || null;
    },
    async staleJobs(limit = 10) {
      return unwrap(
        await t("jobs")
          .select("*")
          .in("state", ["pending", "running"])
          .or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`)
          .order("created_at", { ascending: true })
          .limit(limit)
      );
    },
    async saveJob(id, patch) {
      return unwrap(await t("jobs").update(patch).eq("id", id).select().single());
    },
    /**
     * The admin dashboard reads the recent rows and works the funnel out in
     * one place. Two plain queries beat a dozen counting round trips at this
     * size, and they keep the arithmetic somewhere it can be tested.
     */
    async recentOrders(limit = 100) {
      return unwrap(await t("orders").select("*").order("created_at", { ascending: false }).limit(limit));
    },
    async recentJobs(limit = 200) {
      return unwrap(await t("jobs").select("id,order_id,kind,state,cost_cents,error,created_at").order("created_at", { ascending: false }).limit(limit));
    },
    async jobsNeedingReview(limit = 50) {
      return unwrap(await t("jobs").select("*").eq("state", "needs_review").order("created_at", { ascending: true }).limit(limit));
    },

    // --- money and signals ----------------------------------------------------
    async recordBilling(row) {
      return unwrap(await t("billing").upsert(row, { onConflict: "provider_id", ignoreDuplicates: true }).select().maybeSingle());
    },
    async addWaitlist(email, locale = "es", reason = "cap") {
      // Signing up twice is not an error, it is someone clicking again: the
      // unique index on (email, reason) makes the second one a no-op.
      return unwrap(await t("waitlist").upsert({ email, locale, reason }, { onConflict: "email,reason", ignoreDuplicates: true }));
    },
    async addPrintInterest(orderId, email) {
      return unwrap(await t("print_interest").insert({ order_id: orderId, email }).select().single());
    },
    async recordBlockedInput(reason, text) {
      const input_hash = crypto.createHash("sha256").update(String(text)).digest("hex");
      return unwrap(await t("blocked_inputs").insert({ reason, input_hash }).select().single());
    },

    // --- storage --------------------------------------------------------------
    async upload(bucket, path, buffer, contentType) {
      const { error } = await client.storage.from(bucket).upload(path, buffer, { contentType, upsert: true });
      if (error) throw new Error(`[cuentos] storage: ${error.message}`);
      return path;
    },
    async signedUrl(bucket, path, seconds = 3600) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, seconds);
      if (error) throw new Error(`[cuentos] storage: ${error.message}`);
      return data.signedUrl;
    },
    async download(bucket, path) {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error) throw new Error(`[cuentos] storage: ${error.message}`);
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(bucket, paths) {
      if (!paths.length) return;
      const { error } = await client.storage.from(bucket).remove(paths);
      if (error) throw new Error(`[cuentos] storage: ${error.message}`);
    },
  };
}

let singleton;
function getDb() {
  if (singleton) return singleton;
  requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "cuentos" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  singleton = createDb(client);
  return singleton;
}

module.exports = { createDb, getDb, newToken, daysFromNow, hashIp, SCRIPT_TTL_DAYS, FULL_TTL_DAYS, LOCK_MINUTES };
