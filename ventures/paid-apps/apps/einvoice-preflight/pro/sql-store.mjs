// @ts-check
// SQL store: the same methods as MemoryStore (store.mjs), on SQLite. Proprietary (see ../LICENSE, part 2).
//
// One class, two drivers behind a four-method port, so the same SQL runs on:
//   - node:sqlite (built into Node 22.13+, zero dependencies) for a single Node host, and
//   - Cloudflare D1 (`env.DB`) if the routes move to a Worker like the other apps.
//
// Tenant rule (as store.mjs): every tenant query has `account_id = ?` in its WHERE clause; a
// lookup by id that belongs to another account returns null. The cross-tenant reads are the
// API-key lookup by hash, because the hash is the credential, and the three lookups a verified
// billing webhook makes by provider subscription id or signed checkout id (billing.mjs).
//
// Quotas: tryConsume is a single conditional UPDATE ... RETURNING, so two processes (or two
// Worker isolates) sharing one database cannot both take the last unit, which the in-memory
// store can only promise inside one process.
//
// Invoice contents are never stored: a run keeps file names, hashes, rule ids and fix ids.
import { newId } from "./store.mjs";

/**
 * The port a driver implements. Parameters are positional (`?`).
 * @typedef {{
 *   exec: (sql: string) => Promise<void>,
 *   all: (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>,
 *   run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>,
 *   batch: (statements: { sql: string, params?: unknown[] }[]) => Promise<void>,
 * }} SqlDb
 */

/** Schema version 1. Idempotent: run on every start. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS api_keys_account ON api_keys(account_id);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  vat_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clients_account ON clients(account_id);
CREATE TABLE IF NOT EXISTS runs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  lang TEXT NOT NULL,
  profile TEXT NOT NULL,
  totals TEXT NOT NULL,
  files TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_client ON runs(account_id, client_id, created_at);
CREATE TABLE IF NOT EXISTS usage (
  account_id TEXT NOT NULL,
  period TEXT NOT NULL,
  documents INTEGER NOT NULL DEFAULT 0,
  llm_explanations INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, period)
);
CREATE TABLE IF NOT EXISTS metered_documents (
  account_id TEXT NOT NULL,
  period TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  explained INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, period, sha256)
);
CREATE TABLE IF NOT EXISTS subscriptions (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  plan_key TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT UNIQUE,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  provider_updated_at TEXT,
  past_due_since TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_checkouts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  plan_key TEXT NOT NULL,
  interval TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  provider_subscription_id TEXT
);
CREATE INDEX IF NOT EXISTS pending_checkouts_account ON pending_checkouts(account_id);
CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT,
  account_id TEXT,
  received_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_event_id)
);
`;

/** D1 binds at most 100 parameters per statement; three per metered row stays under it. */
const METER_CHUNK = 30;

/** @template T @param {T[]} xs @param {number} n @returns {T[][]} */
const chunks = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Usage fields to columns: the only identifiers ever interpolated into SQL. */
const USAGE_COLUMN = /** @type {const} */ ({ documents: "documents", llmExplanations: "llm_explanations" });

/** @param {"documents" | "llmExplanations"} field */
function usageColumn(field) {
  const col = USAGE_COLUMN[field];
  if (!col) throw new Error(`unknown usage field: ${field}`);
  return col;
}

/** @param {Record<string, any>} r @returns {import("./store.mjs").Account} */
const toAccount = (r) => ({ id: r.id, name: r.name, plan: r.plan, createdAt: r.created_at });
/** @param {Record<string, any>} r @returns {import("./store.mjs").ApiKey} */
const toKey = (r) => ({
  id: r.id,
  accountId: r.account_id,
  name: r.name,
  prefix: r.prefix,
  hash: r.hash,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at ?? null,
  revokedAt: r.revoked_at ?? null,
});
/** @param {Record<string, any>} r @returns {import("./store.mjs").Client} */
const toClient = (r) => ({
  id: r.id,
  accountId: r.account_id,
  name: r.name,
  country: r.country,
  vatId: r.vat_id,
  reference: r.reference,
  createdAt: r.created_at,
});
/** @param {Record<string, any>} r @returns {import("./store.mjs").Subscription} */
const toSubscription = (r) => ({
  accountId: r.account_id,
  planKey: r.plan_key,
  status: r.status,
  providerCustomerId: r.provider_customer_id ?? null,
  providerSubscriptionId: r.provider_subscription_id ?? null,
  currentPeriodStart: r.current_period_start ?? null,
  currentPeriodEnd: r.current_period_end ?? null,
  cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
  providerUpdatedAt: r.provider_updated_at ?? null,
  pastDueSince: r.past_due_since ?? null,
  updatedAt: r.updated_at,
});
/** @param {Record<string, any>} r @returns {import("./store.mjs").PendingCheckout} */
const toCheckout = (r) => ({
  id: r.id,
  accountId: r.account_id,
  planKey: r.plan_key,
  interval: r.interval,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  consumedAt: r.consumed_at ?? null,
  providerSubscriptionId: r.provider_subscription_id ?? null,
});
/** @param {Record<string, any>} r @returns {import("./store.mjs").Run} */
const toRun = (r) => ({
  id: r.id,
  accountId: r.account_id,
  clientId: r.client_id,
  createdAt: r.created_at,
  lang: r.lang,
  profile: r.profile,
  totals: JSON.parse(r.totals),
  files: JSON.parse(r.files),
});

export class SqlStore {
  /** @param {SqlDb} db @param {{ now?: () => Date }} [opts] */
  constructor(db, opts = {}) {
    this.db = db;
    this.now = opts.now ?? (() => new Date());
  }

  /** Create the tables if they do not exist. Call once before use. */
  async init() {
    await this.db.exec(SCHEMA);
    return this;
  }

  // --- accounts ---
  /** @param {{ name: string, plan?: string }} input */
  async createAccount(input) {
    const account = { id: newId("acct"), name: input.name, plan: input.plan ?? "trial", createdAt: this.now().toISOString() };
    await this.db.run("INSERT INTO accounts (id, name, plan, created_at) VALUES (?, ?, ?, ?)", [
      account.id,
      account.name,
      account.plan,
      account.createdAt,
    ]);
    return account;
  }

  /** @param {string} id */
  async getAccount(id) {
    const [r] = await this.db.all("SELECT * FROM accounts WHERE id = ?", [id]);
    return r ? toAccount(r) : null;
  }

  // --- API keys ---
  /** @param {string} accountId @param {{ name: string, prefix: string, hash: string }} input */
  async createApiKey(accountId, input) {
    const key = { id: newId("key"), accountId, ...input, createdAt: this.now().toISOString(), lastUsedAt: null, revokedAt: null };
    await this.db.run("INSERT INTO api_keys (id, account_id, name, prefix, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      key.id,
      accountId,
      key.name,
      key.prefix,
      key.hash,
      key.createdAt,
    ]);
    return key;
  }

  /** Authentication lookup: the hash is the credential, so this is the one cross-tenant read. @param {string} hash */
  async findActiveApiKeyByHash(hash) {
    const [r] = await this.db.all("UPDATE api_keys SET last_used_at = ? WHERE hash = ? AND revoked_at IS NULL RETURNING *", [
      this.now().toISOString(),
      hash,
    ]);
    return r ? toKey(r) : null;
  }

  /** @param {string} accountId */
  async listApiKeys(accountId) {
    const rows = await this.db.all("SELECT * FROM api_keys WHERE account_id = ? AND revoked_at IS NULL ORDER BY created_at, id", [accountId]);
    return rows.map(toKey);
  }

  /** @param {string} accountId @param {string} id */
  async revokeApiKey(accountId, id) {
    const r = await this.db.run("UPDATE api_keys SET revoked_at = ? WHERE account_id = ? AND id = ? AND revoked_at IS NULL", [
      this.now().toISOString(),
      accountId,
      id,
    ]);
    return r.changes > 0;
  }

  // --- clients ---
  /** @param {string} accountId @param {{ name: string, country?: string, vatId?: string, reference?: string }} input */
  async createClient(accountId, input) {
    const client = {
      id: newId("cli"),
      accountId,
      name: input.name,
      country: input.country ?? "",
      vatId: input.vatId ?? "",
      reference: input.reference ?? "",
      createdAt: this.now().toISOString(),
    };
    await this.db.run("INSERT INTO clients (id, account_id, name, country, vat_id, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      client.id,
      accountId,
      client.name,
      client.country,
      client.vatId,
      client.reference,
      client.createdAt,
    ]);
    return client;
  }

  /** @param {string} accountId */
  async listClients(accountId) {
    const rows = await this.db.all("SELECT * FROM clients WHERE account_id = ? ORDER BY created_at, rowid", [accountId]);
    return rows.map(toClient);
  }

  /** @param {string} accountId */
  async countClients(accountId) {
    const [r] = await this.db.all("SELECT COUNT(*) AS n FROM clients WHERE account_id = ?", [accountId]);
    return Number(r?.n ?? 0);
  }

  /** @param {string} accountId @param {string} id */
  async getClient(accountId, id) {
    const [r] = await this.db.all("SELECT * FROM clients WHERE account_id = ? AND id = ?", [accountId, id]);
    return r ? toClient(r) : null;
  }

  /** Deletes the client and its history, in one transaction. @param {string} accountId @param {string} id */
  async deleteClient(accountId, id) {
    if (!(await this.getClient(accountId, id))) return false;
    await this.db.batch([
      { sql: "DELETE FROM runs WHERE account_id = ? AND client_id = ?", params: [accountId, id] },
      { sql: "DELETE FROM clients WHERE account_id = ? AND id = ?", params: [accountId, id] },
    ]);
    return true;
  }

  // --- runs ---
  /** @param {string} accountId @param {Omit<import("./store.mjs").Run, "id" | "accountId" | "createdAt">} input */
  async addRun(accountId, input) {
    const run = { id: newId("run"), accountId, createdAt: this.now().toISOString(), ...input };
    await this.db.run(
      "INSERT INTO runs (id, account_id, client_id, created_at, lang, profile, totals, files) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [run.id, accountId, run.clientId, run.createdAt, run.lang, run.profile, JSON.stringify(run.totals), JSON.stringify(run.files)],
    );
    return run;
  }

  /** Newest first; same paging as MemoryStore. @param {string} accountId @param {string} clientId @param {{ limit?: number, before?: string }} [opts] */
  async listRuns(accountId, clientId, opts = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const params = /** @type {unknown[]} */ ([accountId, clientId]);
    let where = "account_id = ? AND client_id = ?";
    if (opts.before) {
      where += " AND created_at < ?";
      params.push(opts.before);
    }
    params.push(limit + 1);
    const rows = await this.db.all(`SELECT * FROM runs WHERE ${where} ORDER BY created_at DESC, seq ASC LIMIT ?`, params);
    const items = rows.slice(0, limit).map(toRun);
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].createdAt : null };
  }

  /** @param {string} accountId @param {string} clientId @param {string} id */
  async getRun(accountId, clientId, id) {
    const [r] = await this.db.all("SELECT * FROM runs WHERE account_id = ? AND client_id = ? AND id = ?", [accountId, clientId, id]);
    return r ? toRun(r) : null;
  }

  // --- billing (one subscription per account; see billing.mjs) ---
  /** @param {string} accountId */
  async getSubscription(accountId) {
    const [r] = await this.db.all("SELECT * FROM subscriptions WHERE account_id = ?", [accountId]);
    return r ? toSubscription(r) : null;
  }

  /** Webhook binding by the provider's subscription id: cross-tenant, after signature checks. @param {string} providerSubscriptionId */
  async findSubscriptionByProviderId(providerSubscriptionId) {
    const [r] = await this.db.all("SELECT * FROM subscriptions WHERE provider_subscription_id = ?", [providerSubscriptionId]);
    return r ? toSubscription(r) : null;
  }

  /** @param {string} accountId @param {Omit<import("./store.mjs").Subscription, "accountId" | "updatedAt">} input */
  async upsertSubscription(accountId, input) {
    const updatedAt = this.now().toISOString();
    const [r] = await this.db.all(
      `INSERT INTO subscriptions (account_id, plan_key, status, provider_customer_id, provider_subscription_id, current_period_start,
         current_period_end, cancel_at_period_end, provider_updated_at, past_due_since, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id) DO UPDATE SET plan_key = excluded.plan_key, status = excluded.status,
         provider_customer_id = excluded.provider_customer_id, provider_subscription_id = excluded.provider_subscription_id,
         current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end, provider_updated_at = excluded.provider_updated_at,
         past_due_since = excluded.past_due_since, updated_at = excluded.updated_at
       RETURNING *`,
      [
        accountId,
        input.planKey,
        input.status,
        input.providerCustomerId,
        input.providerSubscriptionId,
        input.currentPeriodStart,
        input.currentPeriodEnd,
        input.cancelAtPeriodEnd ? 1 : 0,
        input.providerUpdatedAt,
        input.pastDueSince,
        updatedAt,
      ],
    );
    return toSubscription(r);
  }

  /** @param {string} accountId @param {{ id: string, planKey: string, interval: "month" | "year", expiresAt: string }} input */
  async createPendingCheckout(accountId, input) {
    const createdAt = this.now().toISOString();
    const cutoff = new Date(this.now().getTime() - 7 * 86_400_000).toISOString();
    await this.db.batch([
      {
        sql: "INSERT INTO pending_checkouts (id, account_id, plan_key, interval, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: [input.id, accountId, input.planKey, input.interval, createdAt, input.expiresAt],
      },
      // Expired, never-used checkouts are kept a week for support questions, then dropped.
      { sql: "DELETE FROM pending_checkouts WHERE consumed_at IS NULL AND expires_at <= ?", params: [cutoff] },
    ]);
    return { ...input, accountId, createdAt, consumedAt: null, providerSubscriptionId: null };
  }

  /** The signed checkout token names the row: a cross-tenant read for the webhook only. @param {string} id */
  async getPendingCheckout(id) {
    const [r] = await this.db.all("SELECT * FROM pending_checkouts WHERE id = ?", [id]);
    return r ? toCheckout(r) : null;
  }

  /** One-time use, atomic: true when unconsumed or already consumed by this subscription. @param {string} id @param {string} providerSubscriptionId */
  async consumePendingCheckout(id, providerSubscriptionId) {
    const r = await this.db.run(
      `UPDATE pending_checkouts SET consumed_at = COALESCE(consumed_at, ?), provider_subscription_id = ?
       WHERE id = ? AND (consumed_at IS NULL OR provider_subscription_id = ?)`,
      [this.now().toISOString(), providerSubscriptionId, id, providerSubscriptionId],
    );
    return r.changes > 0;
  }

  /** Idempotency: true the first time an event id is seen. @param {string} provider @param {string} providerEventId @param {string} type */
  async claimWebhookEvent(provider, providerEventId, type) {
    const r = await this.db.run(
      `INSERT INTO webhook_events (provider, provider_event_id, type, outcome, received_at) VALUES (?, ?, ?, 'processing', ?)
       ON CONFLICT (provider, provider_event_id) DO NOTHING`,
      [provider, providerEventId, type, this.now().toISOString()],
    );
    return r.changes > 0;
  }

  /** @param {string} provider @param {string} providerEventId @param {{ outcome: string, reason: string | null, accountId: string | null }} result */
  async finishWebhookEvent(provider, providerEventId, result) {
    await this.db.run("UPDATE webhook_events SET outcome = ?, reason = ?, account_id = ? WHERE provider = ? AND provider_event_id = ?", [
      result.outcome,
      result.reason,
      result.accountId,
      provider,
      providerEventId,
    ]);
  }

  /** Processing failed: forget the claim so the provider's retry is processed. @param {string} provider @param {string} providerEventId */
  async releaseWebhookEvent(provider, providerEventId) {
    await this.db.run("DELETE FROM webhook_events WHERE provider = ? AND provider_event_id = ?", [provider, providerEventId]);
  }

  // --- usage metering ---
  /** @param {string} accountId @param {string} period */
  async getUsage(accountId, period) {
    const [r] = await this.db.all("SELECT documents, llm_explanations FROM usage WHERE account_id = ? AND period = ?", [accountId, period]);
    return { accountId, period, documents: Number(r?.documents ?? 0), llmExplanations: Number(r?.llm_explanations ?? 0) };
  }

  /**
   * Reserve `n` units of `field` if that keeps usage within `limit`: one conditional UPDATE,
   * so concurrent callers on the same database cannot overshoot the limit.
   * @param {string} accountId @param {string} period @param {"documents" | "llmExplanations"} field @param {number} n @param {number} limit
   */
  async tryConsume(accountId, period, field, n, limit) {
    const col = usageColumn(field);
    await this.db.run("INSERT INTO usage (account_id, period) VALUES (?, ?) ON CONFLICT (account_id, period) DO NOTHING", [accountId, period]);
    const [r] = await this.db.all(
      `UPDATE usage SET ${col} = ${col} + ? WHERE account_id = ? AND period = ? AND ${col} + ? <= ? RETURNING ${col} AS used`,
      [n, accountId, period, n, limit],
    );
    if (r) return { ok: true, used: Number(r.used) };
    return { ok: false, used: (await this.getUsage(accountId, period))[field] };
  }

  /**
   * An invoice counts once per account and month (store.mjs, meterDocuments). The rows go in
   * first with ON CONFLICT DO NOTHING RETURNING, so of two concurrent requests with the same new
   * invoice exactly one sees it as new; then one conditional UPDATE reserves the units, and if
   * that refuses, this call's rows come out again. Between those two steps a concurrent request
   * can see a row that is then removed and not count that invoice: the error is in the
   * customer's favour and needs two simultaneous uploads of one file at the quota edge.
   * @param {string} accountId @param {string} period @param {string[]} hashes @param {number} limit
   * @returns {Promise<import("./store.mjs").MeterResult>}
   */
  async meterDocuments(accountId, period, hashes, limit) {
    /** @type {string[]} */
    const added = [];
    for (const part of chunks([...new Set(hashes)], METER_CHUNK)) {
      const rows = await this.db.all(
        `INSERT INTO metered_documents (account_id, period, sha256) VALUES ${part.map(() => "(?, ?, ?)").join(", ")}
         ON CONFLICT (account_id, period, sha256) DO NOTHING RETURNING sha256`,
        part.flatMap((h) => [accountId, period, h]),
      );
      for (const r of rows) added.push(String(r.sha256));
    }
    if (!added.length) return { ok: true, used: (await this.getUsage(accountId, period)).documents, added };
    const r = await this.tryConsume(accountId, period, "documents", added.length, limit);
    if (!r.ok) {
      await this.deleteMetered(accountId, period, added);
      return { ok: false, used: r.used, added: [] };
    }
    await this.db.run("DELETE FROM metered_documents WHERE account_id = ? AND period < ?", [accountId, period]);
    return { ok: true, used: r.used, added };
  }

  /** @param {string} accountId @param {string} period @param {string[]} hashes @returns {Promise<number>} rows removed */
  async deleteMetered(accountId, period, hashes) {
    let removed = 0;
    for (const part of chunks([...new Set(hashes)], METER_CHUNK)) {
      const { changes } = await this.db.run(
        `DELETE FROM metered_documents WHERE account_id = ? AND period = ? AND sha256 IN (${part.map(() => "?").join(", ")})`,
        [accountId, period, ...part],
      );
      removed += changes;
    }
    return removed;
  }

  /** @param {string} accountId @param {string} period @param {string[]} hashes */
  async unmeterDocuments(accountId, period, hashes) {
    const removed = await this.deleteMetered(accountId, period, hashes);
    if (removed) await this.release(accountId, period, "documents", removed);
  }

  /**
   * "Explained" per invoice (store.mjs, meterExplained). The flag flips first, so a concurrent
   * call for the same invoice is free; if the budget then refuses, the flag flips back.
   * @param {string} accountId @param {string} period @param {string} sha256 @param {number} limit
   */
  async meterExplained(accountId, period, sha256, limit) {
    const key = [accountId, period, sha256];
    const { changes } = await this.db.run(
      "UPDATE metered_documents SET explained = 1 WHERE account_id = ? AND period = ? AND sha256 = ? AND explained = 0",
      key,
    );
    if (!changes) {
      const [doc] = await this.db.all("SELECT explained FROM metered_documents WHERE account_id = ? AND period = ? AND sha256 = ?", key);
      if (doc) return { ok: true, used: (await this.getUsage(accountId, period)).llmExplanations, charged: false };
    }
    const r = await this.tryConsume(accountId, period, "llmExplanations", 1, limit);
    if (!r.ok && changes) {
      await this.db.run("UPDATE metered_documents SET explained = 0 WHERE account_id = ? AND period = ? AND sha256 = ?", key);
    }
    return { ...r, charged: r.ok };
  }

  /** Give back units reserved for work that was refused before it ran. @param {string} accountId @param {string} period @param {"documents" | "llmExplanations"} field @param {number} n */
  async release(accountId, period, field, n) {
    const col = usageColumn(field);
    await this.db.run(`UPDATE usage SET ${col} = MAX(0, ${col} - ?) WHERE account_id = ? AND period = ?`, [n, accountId, period]);
  }
}

/**
 * Driver for node:sqlite (Node 22.13+; prints an ExperimentalWarning on Node 22). WAL mode and a
 * busy timeout so a second process on the same file waits rather than fails.
 * @param {string} file a path, or ":memory:"
 * @returns {Promise<SqlDb & { close: () => void }>}
 */
export async function nodeSqliteDb(file) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  /** @param {string} sql @param {unknown[]} params */
  const prep = (sql, params) => [db.prepare(sql), /** @type {any[]} */ (params)];
  return {
    exec: async (sql) => {
      db.exec(sql);
    },
    all: async (sql, params = []) => {
      const [st, p] = prep(sql, params);
      return /** @type {Record<string, any>[]} */ (/** @type {any} */ (st).all(...p));
    },
    run: async (sql, params = []) => {
      const [st, p] = prep(sql, params);
      return { changes: Number(/** @type {any} */ (st).run(...p).changes) };
    },
    batch: async (statements) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const s of statements) db.prepare(s.sql).run(.../** @type {any[]} */ (s.params ?? []));
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => db.close(),
  };
}

/**
 * Driver for a Cloudflare D1 binding (`env.DB`). D1's `batch` runs its statements as one
 * transaction. The schema is sent one statement at a time (D1's `exec` wants one per line).
 * @param {{ prepare: (sql: string) => any, batch: (stmts: any[]) => Promise<unknown> }} d1
 * @returns {SqlDb}
 */
export function d1Db(d1) {
  /** @param {string} sql @param {unknown[]} params */
  const bind = (sql, params) => d1.prepare(sql).bind(...params);
  return {
    exec: async (sql) => {
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of statements) await d1.prepare(s).run();
    },
    all: async (sql, params = []) => (await bind(sql, params).all()).results ?? [],
    run: async (sql, params = []) => ({ changes: Number((await bind(sql, params).run()).meta?.changes ?? 0) }),
    batch: async (statements) => {
      await d1.batch(statements.map((s) => bind(s.sql, s.params ?? [])));
    },
  };
}

/** Open (and create) a SQLite store at `file`. @param {string} file @param {{ now?: () => Date }} [opts] */
export async function openSqliteStore(file, opts = {}) {
  const db = await nodeSqliteDb(file);
  const store = await new SqlStore(db, opts).init();
  return Object.assign(store, { close: db.close });
}
