/*
 * Where jobs live, behind one interface with two implementations.
 *
 *   files    - a directory of JSON files. Development, and the reason the whole
 *              flow can be walked without touching shared infrastructure.
 *   supabase - the real one, schema `comic`. The migration is
 *              supabase/0001_comic_schema.sql and it IS applied (2026-08-22,
 *              authorised by JJ): schema, table, five indexes, RLS on with no
 *              policies, private storage bucket.
 *
 * Picking one is an env var, so nothing above this file knows which is running.
 *
 * Honest caveat, because the previous version of this comment claimed a file
 * that did not exist: the SQL is verified against the live database, but this
 * adapter has NOT been exercised from Node — that needs the service-role key,
 * which is not on this machine.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BACKEND = process.env.STORE || "files";
const DIR = process.env.STORE_DIR || path.join(__dirname, "..", "out", "jobs");

/** Opaque, unguessable, URL-safe. It is the only key to somebody's preview. */
function newToken() {
  return crypto.randomBytes(16).toString("base64url");
}

/*
 * An IP is personal data, so it is never stored raw: we keep a salted hash,
 * only to count requests per day. Same approach as cuentos.
 */
function hashIp(ip) {
  return crypto
    .createHash("sha256")
    .update(String(ip || "") + (process.env.IP_SALT || "dev-salt"))
    .digest("hex")
    .slice(0, 32);
}

const locks = new Map();

// --- files -------------------------------------------------------------------

const files = {
  async init() { fs.mkdirSync(DIR, { recursive: true }); },

  async create(job) {
    await files.init();
    fs.writeFileSync(path.join(DIR, `${job.token}.json`), JSON.stringify(job, null, 2));
    return job;
  },

  async get(token) {
    const f = path.join(DIR, `${String(token).replace(/[^\w-]/g, "")}.json`);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, "utf8"));
  },

  async update(token, patch) {
    const job = await files.get(token);
    if (!job) return null;
    const next = { ...job, ...patch, updated_at: new Date().toISOString() };
    fs.writeFileSync(path.join(DIR, `${token}.json`), JSON.stringify(next, null, 2));
    return next;
  },

  /**
   * Previews created today. With an ipHash, only that visitor's; without one,
   * everybody's — which is the site-wide spend ceiling, and the only thing
   * standing between a bored person with a VPN and our image bill.
   */
  async countToday(ipHash) {
    const today = new Date().toISOString().slice(0, 10);
    return (await files.all()).filter((j) =>
      String(j.created_at).slice(0, 10) === today && (!ipHash || j.ip_hash === ipHash)
    ).length;
  },

  /** All of them, parsed. Fine for a directory; the real store filters in SQL. */
  async all() {
    await files.init();
    return fs.readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return null; } })
      .filter(Boolean);
  },

  async remove(token) {
    // \w, not w. A mangled class here would strip most of the token and point
    // the unlink at a different file — on a delete path that is not a typo,
    // it is data loss.
    const clean = String(token).replace(/[^\w-]/g, "");
    if (!clean) return;
    const f = path.join(DIR, `${clean}.json`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    locks.delete(token);
  },

  /*
   * Orders past their retention. Two clocks, because the two cases are not the
   * same promise: an unpaid preview is data we were given and did not need,
   * a paid comic is a service somebody bought and expects to be able to open.
   */
  async expired({ unpaidDays, paidDays }, now = Date.now()) {
    const cut = (days) => now - days * 86400000;
    return (await files.all()).filter((j) => {
      const at = Date.parse(j.paid_at || j.created_at);
      if (!at) return false;
      return j.paid_at ? at < cut(paidDays) : at < cut(unpaidDays);
    });
  },

  /*
   * The same claim as the real store, kept in memory. Development runs one
   * process, so a file would add nothing — but the METHOD has to exist, or the
   * lock would only ever be exercised in production, which is the one place
   * nobody wants to discover it wrong.
   */
  async claim(token, seconds = 240) {
    const now = Date.now();
    const held = locks.get(token);
    if (held && held > now) return false;
    locks.set(token, now + seconds * 1000);
    return true;
  },

  async release(token) { locks.delete(token); },

  /** Free previews the cron should push along, oldest first. */
  async pending(limit = 5) {
    return (await files.all())
      .filter((j) => j.status === "pending")
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(0, limit);
  },

  /*
   * Paid renders that are not finished. These come FIRST in the cron, always:
   * somebody is waiting for something they have already been charged for, and
   * a free preview can wait five minutes longer than a paid comic can.
   */
  async pendingRenders(limit = 3) {
    return (await files.all())
      .filter((j) => j.paid_at && j.render_status !== "done" && j.render_status !== "needs_attention")
      .sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)))
      .slice(0, limit);
  },
};

// --- supabase ----------------------------------------------------------------
//
// The table is NOT one column per field. Real columns are the ones that get
// queried; the whole job lives in `job` jsonb and is the record. See
// supabase/0001_comic_schema.sql for why — in short, six fields were added to
// the job object in one afternoon and a mirrored table would have rejected
// every one of them until somebody remembered a migration.

function supabase() {
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "comic" },
    auth: { persistSession: false },
  });
  const table = () => db.from("previews");

  /** Job -> row. The mirrored columns exist only so the indexes can be used. */
  function toRow(job) {
    return {
      token: job.token,
      status: job.status || "pending",
      step: job.step || "outline",
      ip_hash: job.ip_hash || null,
      paid_at: job.paid_at || null,
      render_status: job.render_status || null,
      created_at: job.created_at || new Date().toISOString(),
      updated_at: job.updated_at || new Date().toISOString(),
      job,
    };
  }

  /** Row -> job. `job` is the record; the columns are a copy of part of it. */
  function fromRow(row) {
    if (!row) return null;
    return { ...(row.job || {}), token: row.token };
  }

  const supa = {
    async init() {},

    async create(job) {
      const { data, error } = await table().insert(toRow(job)).select().single();
      if (error) throw new Error(error.message);
      return fromRow(data);
    },

    async get(token) {
      const { data } = await table().select("*").eq("token", token).maybeSingle();
      return fromRow(data);
    },

    /*
     * Read, merge, write. The merge happens here rather than in SQL because
     * the callers patch nested objects (job.render, job.payment) and a jsonb
     * `||` is a shallow merge that would silently drop half of one.
     *
     * Two writers racing here would lose one patch. That is what claim() is
     * for: the viewer and the cron never advance the same job at once.
     */
    async update(token, patch) {
      const current = await supa.get(token);
      if (!current) return null;
      const next = { ...current, ...patch, updated_at: new Date().toISOString() };
      const { data, error } = await table()
        .update(toRow(next)).eq("token", token).select().single();
      if (error) throw new Error(error.message);
      return fromRow(data);
    },

    async countToday(ipHash) {
      const since = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
      let q = table().select("token", { count: "exact", head: true }).gte("created_at", since);
      if (ipHash) q = q.eq("ip_hash", ipHash);
      const { count } = await q;
      return count || 0;
    },

    /** The most recent N, for the admin panel. Never the whole table. */
    async all(limit = 400) {
      const { data } = await table().select("*")
        .order("created_at", { ascending: false }).limit(limit);
      return (data || []).map(fromRow);
    },

    async pending(limit = 5) {
      const { data } = await table().select("*").eq("status", "pending")
        .order("created_at", { ascending: true }).limit(limit);
      return (data || []).map(fromRow);
    },

    async pendingRenders(limit = 3) {
      const { data } = await table().select("*")
        .not("paid_at", "is", null)
        .not("render_status", "in", '("done","needs_attention")')
        .order("paid_at", { ascending: true }).limit(limit);
      return (data || []).map(fromRow);
    },

    /*
     * Claims the job for `seconds`, atomically. Returns false when somebody
     * else holds it.
     *
     * One UPDATE with the condition in the WHERE clause: read-then-write would
     * have exactly the race it is meant to prevent.
     */
    async remove(token) {
      const { error } = await table().delete().eq("token", token);
      if (error) throw new Error(error.message);
    },

    async expired({ unpaidDays, paidDays }, now = Date.now()) {
      const iso = (days) => new Date(now - days * 86400000).toISOString();
      const [unpaid, paid] = await Promise.all([
        table().select("*").is("paid_at", null).lt("created_at", iso(unpaidDays)).limit(200),
        table().select("*").not("paid_at", "is", null).lt("paid_at", iso(paidDays)).limit(200),
      ]);
      return [...(unpaid.data || []), ...(paid.data || [])].map(fromRow);
    },

    async claim(token, seconds = 240) {
      const now = new Date().toISOString();
      const until = new Date(Date.now() + seconds * 1000).toISOString();
      const { data, error } = await table()
        .update({ locked_until: until })
        .eq("token", token)
        .or(`locked_until.is.null,locked_until.lt.${now}`)
        .select("token");
      if (error) throw new Error(error.message);
      return Boolean(data && data.length);
    },

    async release(token) {
      await table().update({ locked_until: null }).eq("token", token);
    },
  };

  return supa;
}

const store = BACKEND === "supabase" ? supabase() : files;

module.exports = { store, newToken, hashIp, BACKEND };
