// @ts-check
// Accounts, API keys, clients, run history and usage. FSL-1.1-MIT (see ../LICENSE, part 2).
//
// Tenant rule: every method that touches tenant data takes `accountId` first and filters by it;
// a lookup by id that belongs to another account returns null, exactly as if it did not exist.
// Invoice contents are never stored: a run keeps file names, SHA-256 hashes, rule ids and fix
// ids, enough for an accountant's per-client history and audit trail.
//
// Billing rows (subscription, pending checkouts, webhook events) follow the same rule, apart from
// the three lookups a verified webhook makes by provider id or checkout id (marked below).
//
// MemoryStore is the reference implementation; FileStore persists the same data as one JSON
// file (atomic rename) for a single-process deployment. A D1/SQLite adapter implements the same
// methods.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {{ id: string, name: string, plan: string, createdAt: string }} Account
 * @typedef {{ id: string, accountId: string, name: string, prefix: string, hash: string, createdAt: string, lastUsedAt: string | null, revokedAt: string | null }} ApiKey
 * @typedef {{ id: string, accountId: string, name: string, country: string, vatId: string, reference: string, createdAt: string }} Client
 * @typedef {{ file: string, sha256: string, bytes: number, status: string, rules: string[], blocking: number,
 *   fixesApplied: string[], fixedSha256: string | null, fixedStatus: string | null }} RunFile
 * @typedef {{ id: string, accountId: string, clientId: string, createdAt: string, lang: string, profile: string,
 *   totals: { files: number, passed: number, failed: number, fixable: number }, files: RunFile[] }} Run
 * @typedef {{ accountId: string, period: string, documents: number, llmExplanations: number }} Usage
 * @typedef {{ accountId: string, period: string, sha256: string, explained: boolean }} MeteredDocument
 * @typedef {{ ok: boolean, used: number, added: string[] }} MeterResult
 * @typedef {{ accountId: string, planKey: string, status: import("../../../packages/billing/src/index.ts").SubscriptionStatus,
 *   providerCustomerId: string | null, providerSubscriptionId: string | null, currentPeriodStart: string | null,
 *   currentPeriodEnd: string | null, cancelAtPeriodEnd: boolean, providerUpdatedAt: string | null,
 *   pastDueSince: string | null, updatedAt: string }} Subscription
 * @typedef {{ id: string, accountId: string, planKey: string, interval: "month" | "year", createdAt: string,
 *   expiresAt: string, consumedAt: string | null, providerSubscriptionId: string | null }} PendingCheckout
 * @typedef {{ provider: string, providerEventId: string, type: string, outcome: string, reason: string | null,
 *   accountId: string | null, receivedAt: string }} WebhookEvent
 * @typedef {{ accounts: Account[], apiKeys: ApiKey[], clients: Client[], runs: Run[], usage: Usage[],
 *   subscriptions: Subscription[], pendingCheckouts: PendingCheckout[], webhookEvents: WebhookEvent[],
 *   meteredDocuments: MeteredDocument[] }} Data
 */

/** @param {string} prefix */
export const newId = (prefix) => `${prefix}_${randomBytes(10).toString("base64url")}`;

/** @returns {Data} */
const emptyData = () => ({
  accounts: [],
  apiKeys: [],
  clients: [],
  runs: [],
  usage: [],
  subscriptions: [],
  pendingCheckouts: [],
  webhookEvents: [],
  meteredDocuments: [],
});

export class MemoryStore {
  /** @param {{ now?: () => Date, data?: Data }} [opts] */
  constructor(opts = {}) {
    this.now = opts.now ?? (() => new Date());
    /** @type {Data} */
    this.data = opts.data ?? emptyData();
  }

  /** Called after every mutation; FileStore persists here. */
  persist() {}

  // --- accounts ---
  /** @param {{ name: string, plan?: string }} input @returns {Promise<Account>} */
  async createAccount(input) {
    const account = { id: newId("acct"), name: input.name, plan: input.plan ?? "trial", createdAt: this.now().toISOString() };
    this.data.accounts.push(account);
    this.persist();
    return account;
  }

  /** @param {string} id */
  async getAccount(id) {
    return this.data.accounts.find((a) => a.id === id) ?? null;
  }

  // --- API keys ---
  /** @param {string} accountId @param {{ name: string, prefix: string, hash: string }} input @returns {Promise<ApiKey>} */
  async createApiKey(accountId, input) {
    const key = { id: newId("key"), accountId, ...input, createdAt: this.now().toISOString(), lastUsedAt: null, revokedAt: null };
    this.data.apiKeys.push(key);
    this.persist();
    return key;
  }

  /** Authentication lookup: the hash is the credential, so this is the one cross-tenant read. @param {string} hash */
  async findActiveApiKeyByHash(hash) {
    const key = this.data.apiKeys.find((k) => k.hash === hash && !k.revokedAt) ?? null;
    if (key) {
      key.lastUsedAt = this.now().toISOString();
      this.persist();
    }
    return key;
  }

  /** @param {string} accountId */
  async listApiKeys(accountId) {
    return this.data.apiKeys.filter((k) => k.accountId === accountId && !k.revokedAt);
  }

  /** @param {string} accountId @param {string} id */
  async revokeApiKey(accountId, id) {
    const key = this.data.apiKeys.find((k) => k.accountId === accountId && k.id === id && !k.revokedAt);
    if (!key) return false;
    key.revokedAt = this.now().toISOString();
    this.persist();
    return true;
  }

  // --- clients (the accountant's customers) ---
  /** @param {string} accountId @param {{ name: string, country?: string, vatId?: string, reference?: string }} input @returns {Promise<Client>} */
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
    this.data.clients.push(client);
    this.persist();
    return client;
  }

  /** @param {string} accountId */
  async listClients(accountId) {
    return this.data.clients.filter((c) => c.accountId === accountId);
  }

  /** @param {string} accountId */
  async countClients(accountId) {
    return this.data.clients.filter((c) => c.accountId === accountId).length;
  }

  /** @param {string} accountId @param {string} id */
  async getClient(accountId, id) {
    return this.data.clients.find((c) => c.accountId === accountId && c.id === id) ?? null;
  }

  /** Deletes the client and its history. @param {string} accountId @param {string} id */
  async deleteClient(accountId, id) {
    const before = this.data.clients.length;
    this.data.clients = this.data.clients.filter((c) => !(c.accountId === accountId && c.id === id));
    if (this.data.clients.length === before) return false;
    this.data.runs = this.data.runs.filter((r) => !(r.accountId === accountId && r.clientId === id));
    this.persist();
    return true;
  }

  // --- runs (batch uploads) ---
  /** @param {string} accountId @param {Omit<Run, "id" | "accountId" | "createdAt">} input @returns {Promise<Run>} */
  async addRun(accountId, input) {
    const run = { id: newId("run"), accountId, createdAt: this.now().toISOString(), ...input };
    this.data.runs.push(run);
    this.persist();
    return run;
  }

  /** Newest first. @param {string} accountId @param {string} clientId @param {{ limit?: number, before?: string }} [opts] */
  async listRuns(accountId, clientId, opts = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const all = this.data.runs
      .filter((r) => r.accountId === accountId && r.clientId === clientId && (!opts.before || r.createdAt < opts.before))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const items = all.slice(0, limit);
    return { items, nextCursor: all.length > limit ? items[items.length - 1].createdAt : null };
  }

  /** @param {string} accountId @param {string} clientId @param {string} id */
  async getRun(accountId, clientId, id) {
    return this.data.runs.find((r) => r.accountId === accountId && r.clientId === clientId && r.id === id) ?? null;
  }

  // --- billing (one subscription per account; see billing.mjs) ---
  /** @param {string} accountId @returns {Promise<Subscription | null>} */
  async getSubscription(accountId) {
    const row = this.data.subscriptions.find((s) => s.accountId === accountId);
    return row ? { ...row } : null;
  }

  /**
   * Webhook binding: the provider's subscription id names the row, so this is a cross-tenant read
   * (like findActiveApiKeyByHash). Only billing.mjs calls it, after the signature is verified.
   * @param {string} providerSubscriptionId
   */
  async findSubscriptionByProviderId(providerSubscriptionId) {
    const row = this.data.subscriptions.find((s) => s.providerSubscriptionId === providerSubscriptionId);
    return row ? { ...row } : null;
  }

  /** @param {string} accountId @param {Omit<Subscription, "accountId" | "updatedAt">} input @returns {Promise<Subscription>} */
  async upsertSubscription(accountId, input) {
    const row = { ...input, accountId, updatedAt: this.now().toISOString() };
    const i = this.data.subscriptions.findIndex((s) => s.accountId === accountId);
    if (i >= 0) this.data.subscriptions[i] = row;
    else this.data.subscriptions.push(row);
    this.persist();
    return { ...row };
  }

  /** @param {string} accountId @param {{ id: string, planKey: string, interval: "month" | "year", expiresAt: string }} input */
  async createPendingCheckout(accountId, input) {
    /** @type {PendingCheckout} */
    const row = { ...input, accountId, createdAt: this.now().toISOString(), consumedAt: null, providerSubscriptionId: null };
    this.data.pendingCheckouts.push(row);
    // Expired, never-used checkouts are kept a week for support questions, then dropped.
    const cutoff = new Date(this.now().getTime() - 7 * 86_400_000).toISOString();
    this.data.pendingCheckouts = this.data.pendingCheckouts.filter((c) => c.consumedAt || c.expiresAt > cutoff);
    this.persist();
    return { ...row };
  }

  /** The signed checkout token names the row: a cross-tenant read for the webhook only. @param {string} id */
  async getPendingCheckout(id) {
    const row = this.data.pendingCheckouts.find((c) => c.id === id);
    return row ? { ...row } : null;
  }

  /**
   * One-time use: marks the checkout consumed by this subscription. True when it was unconsumed or
   * already consumed by the same subscription (a retried delivery); false is a replay.
   * @param {string} id @param {string} providerSubscriptionId
   */
  async consumePendingCheckout(id, providerSubscriptionId) {
    const row = this.data.pendingCheckouts.find((c) => c.id === id);
    if (!row) return false;
    if (row.consumedAt) return row.providerSubscriptionId === providerSubscriptionId;
    row.consumedAt = this.now().toISOString();
    row.providerSubscriptionId = providerSubscriptionId;
    this.persist();
    return true;
  }

  /** Idempotency: true the first time an event id is seen, false for a redelivery. @param {string} provider @param {string} providerEventId @param {string} type */
  async claimWebhookEvent(provider, providerEventId, type) {
    if (this.data.webhookEvents.some((e) => e.provider === provider && e.providerEventId === providerEventId)) return false;
    this.data.webhookEvents.push({ provider, providerEventId, type, outcome: "processing", reason: null, accountId: null, receivedAt: this.now().toISOString() });
    this.persist();
    return true;
  }

  /** @param {string} provider @param {string} providerEventId @param {{ outcome: string, reason: string | null, accountId: string | null }} result */
  async finishWebhookEvent(provider, providerEventId, result) {
    const row = this.data.webhookEvents.find((e) => e.provider === provider && e.providerEventId === providerEventId);
    if (!row) return;
    Object.assign(row, result);
    this.persist();
  }

  /** Processing failed: forget the claim so the provider's retry is processed. @param {string} provider @param {string} providerEventId */
  async releaseWebhookEvent(provider, providerEventId) {
    this.data.webhookEvents = this.data.webhookEvents.filter((e) => !(e.provider === provider && e.providerEventId === providerEventId));
    this.persist();
  }

  // --- usage metering ---
  /** @param {string} accountId @param {string} period @returns {Usage} */
  usageRow(accountId, period) {
    let row = this.data.usage.find((u) => u.accountId === accountId && u.period === period);
    if (!row) {
      row = { accountId, period, documents: 0, llmExplanations: 0 };
      this.data.usage.push(row);
    }
    return row;
  }

  /** @param {string} accountId @param {string} period */
  async getUsage(accountId, period) {
    const row = this.data.usage.find((u) => u.accountId === accountId && u.period === period);
    return row ? { ...row } : { accountId, period, documents: 0, llmExplanations: 0 };
  }

  /**
   * Atomically reserve `n` units of `field` if that keeps usage within `limit`.
   * @param {string} accountId @param {string} period @param {"documents" | "llmExplanations"} field @param {number} n @param {number} limit
   */
  async tryConsume(accountId, period, field, n, limit) {
    const row = this.usageRow(accountId, period);
    if (row[field] + n > limit) return { ok: false, used: row[field] };
    row[field] += n;
    this.persist();
    return { ok: true, used: row[field] };
  }

  /**
   * Meter invoices as the pricing page promises: an invoice (by SHA-256 of its bytes) counts once
   * per account and month, however often it is re-checked. Reserves one `documents` unit for each
   * hash not yet metered this period, all or nothing, within `limit`. `added` lists the hashes this
   * call metered, for unmeterDocuments if the work then fails. Rows from earlier months are
   * dropped: they only ever answer "already counted this month?".
   * @param {string} accountId @param {string} period @param {string[]} hashes @param {number} limit
   * @returns {Promise<MeterResult>}
   */
  async meterDocuments(accountId, period, hashes, limit) {
    const row = this.usageRow(accountId, period);
    const seen = new Set(this.data.meteredDocuments.filter((d) => d.accountId === accountId && d.period === period).map((d) => d.sha256));
    const added = [...new Set(hashes)].filter((h) => !seen.has(h));
    if (row.documents + added.length > limit) return { ok: false, used: row.documents, added: [] };
    this.data.meteredDocuments = this.data.meteredDocuments.filter((d) => d.accountId !== accountId || d.period >= period);
    for (const sha256 of added) this.data.meteredDocuments.push({ accountId, period, sha256, explained: false });
    row.documents += added.length;
    if (added.length) this.persist();
    return { ok: true, used: row.documents, added };
  }

  /** Undo meterDocuments for work that failed before producing a result. @param {string} accountId @param {string} period @param {string[]} hashes */
  async unmeterDocuments(accountId, period, hashes) {
    const drop = new Set(hashes);
    const before = this.data.meteredDocuments.length;
    this.data.meteredDocuments = this.data.meteredDocuments.filter((d) => !(d.accountId === accountId && d.period === period && drop.has(d.sha256)));
    const removed = before - this.data.meteredDocuments.length;
    if (removed) await this.release(accountId, period, "documents", removed);
  }

  /**
   * "Explained" counts per invoice: the first model call for an invoice this month reserves one
   * `llmExplanations` unit within `limit`; later calls for the same invoice (more long-tail rules,
   * a re-check) are free. An invoice that was never metered pays per call.
   * @param {string} accountId @param {string} period @param {string} sha256 @param {number} limit
   * @returns {Promise<{ ok: boolean, used: number, charged: boolean }>}
   */
  async meterExplained(accountId, period, sha256, limit) {
    const doc = this.data.meteredDocuments.find((d) => d.accountId === accountId && d.period === period && d.sha256 === sha256);
    if (doc?.explained) return { ok: true, used: this.usageRow(accountId, period).llmExplanations, charged: false };
    const r = await this.tryConsume(accountId, period, "llmExplanations", 1, limit);
    if (r.ok && doc) {
      doc.explained = true;
      this.persist();
    }
    return { ...r, charged: r.ok };
  }

  /** Give back units reserved for work that was refused before it ran. @param {string} accountId @param {string} period @param {"documents" | "llmExplanations"} field @param {number} n */
  async release(accountId, period, field, n) {
    const row = this.usageRow(accountId, period);
    row[field] = Math.max(0, row[field] - n);
    this.persist();
  }
}

export class FileStore extends MemoryStore {
  /** @param {string} file @param {{ now?: () => Date }} [opts] */
  constructor(file, opts = {}) {
    const data = fs.existsSync(file) ? /** @type {Data} */ ({ ...emptyData(), ...JSON.parse(fs.readFileSync(file, "utf8")) }) : emptyData();
    super({ ...opts, data });
    this.file = file;
  }

  persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
