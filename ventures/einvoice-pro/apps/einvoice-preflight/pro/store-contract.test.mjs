// One contract for every store: MemoryStore, FileStore, SqlStore on node:sqlite, and SqlStore
// through the D1 driver (a D1-shaped shim over node:sqlite: prepare/bind/all/run/batch with D1's
// result shapes; not a real D1, which is checked when the Worker port lands). Includes the
// cross-account tests: another account's ids behave exactly as if they did not exist.
// Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { createProHandler } from "./server.mjs";
import { d1Db, nodeSqliteDb, openSqliteStore, SqlStore } from "./sql-store.mjs";
import { FileStore, MemoryStore } from "./store.mjs";

const dir = mkdtempSync(join(tmpdir(), "einv-store-"));
after(() => rmSync(dir, { recursive: true, force: true }));

/** A clock that ticks one second per call, so createdAt values are distinct and ordered. */
function tickingClock(start = Date.parse("2026-11-24T10:00:00Z")) {
  let t = start;
  return () => new Date((t += 1000));
}

/** Minimal D1 shim: the binding's surface the driver uses, with D1's result shapes. */
async function fakeD1() {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    all: async () => ({ results: db.prepare(sql).all(...params), success: true, meta: {} }),
    run: async () => {
      const r = db.prepare(sql).run(...params);
      return { results: [], success: true, meta: { changes: Number(r.changes) } };
    },
    _exec: () => db.prepare(sql).run(...params),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      db.exec("BEGIN");
      try {
        for (const s of stmts) s._exec();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

let n = 0;
const BACKENDS = {
  MemoryStore: async (now) => new MemoryStore({ now }),
  FileStore: async (now) => new FileStore(join(dir, `f${n++}.json`), { now }),
  "SqlStore (node:sqlite)": async (now) => openSqliteStore(join(dir, `s${n++}.db`), { now }),
  "SqlStore (D1 driver)": async (now) => new SqlStore(d1Db(await fakeD1()), { now }).init(),
};

const emptyRun = (clientId, extra = {}) => ({
  clientId,
  lang: "de",
  profile: "",
  totals: { files: 1, passed: 0, failed: 1, fixable: 1 },
  files: [{ file: "a.xml", sha256: "ab".repeat(32), bytes: 10, status: "fail", rules: ["PRO-DATE-001"], blocking: 1, fixesApplied: ["date-format"], fixedSha256: "cd".repeat(32), fixedStatus: "pass" }],
  ...extra,
});

for (const [name, make] of Object.entries(BACKENDS)) {
  describe(name, () => {
    test("accounts and API keys: create, find by hash, list, revoke, scoped to the account", async () => {
      const s = await make(tickingClock());
      const a = await s.createAccount({ name: "Kanzlei A" });
      const b = await s.createAccount({ name: "Cabinet B", plan: "practice" });
      assert.equal(a.plan, "trial");
      assert.deepEqual(await s.getAccount(b.id), b);
      assert.equal(await s.getAccount("acct_missing"), null);

      const k = await s.createApiKey(a.id, { name: "default", prefix: "ep_abc", hash: "h-a" });
      assert.equal(k.lastUsedAt, null);
      const found = await s.findActiveApiKeyByHash("h-a");
      assert.equal(found.id, k.id);
      assert.equal(found.accountId, a.id);
      assert.ok(found.lastUsedAt, "lookup records last use");
      assert.equal(await s.findActiveApiKeyByHash("h-nope"), null);

      assert.deepEqual((await s.listApiKeys(a.id)).map((x) => x.id), [k.id]);
      assert.deepEqual(await s.listApiKeys(b.id), []);
      assert.equal(await s.revokeApiKey(b.id, k.id), false, "B cannot revoke A's key");
      assert.ok(await s.findActiveApiKeyByHash("h-a"));
      assert.equal(await s.revokeApiKey(a.id, k.id), true);
      assert.equal(await s.revokeApiKey(a.id, k.id), false, "already revoked");
      assert.equal(await s.findActiveApiKeyByHash("h-a"), null);
      assert.deepEqual(await s.listApiKeys(a.id), []);
    });

    test("sign-in email: one address per account, one-time tokens that expire, per-address counts", async () => {
      let t = Date.parse("2026-11-26T10:00:00Z");
      const now = () => new Date((t += 1000));
      const s = await make(now);
      const a = await s.createAccount({ name: "A" });
      const b = await s.createAccount({ name: "B" });
      assert.equal(a.email, null);
      assert.equal((await s.getAccount(a.id)).emailVerifiedAt, null);
      assert.equal(await s.findAccountByEmail("a@example.com"), null);

      assert.equal(await s.setAccountEmail(a.id, "a@example.com"), "ok");
      const got = await s.getAccount(a.id);
      assert.equal(got.email, "a@example.com");
      assert.ok(got.emailVerifiedAt);
      assert.equal((await s.findAccountByEmail("a@example.com")).id, a.id);
      assert.equal(await s.setAccountEmail(b.id, "a@example.com"), "taken", "one account per address");
      assert.equal((await s.getAccount(b.id)).email, null);
      assert.equal(await s.setAccountEmail("acct_missing", "x@example.com"), "not_found");

      const exp = (ms) => new Date(t + ms).toISOString();
      await s.createEmailToken(a.id, { kind: "signin", email: "a@example.com", hash: "tok-1", expiresAt: exp(60_000) });
      assert.equal(await s.consumeEmailToken("verify", "tok-1"), null, "kind must match");
      const used = await s.consumeEmailToken("signin", "tok-1");
      assert.equal(used.accountId, a.id);
      assert.equal(used.email, "a@example.com");
      assert.equal(await s.consumeEmailToken("signin", "tok-1"), null, "only once");
      await s.createEmailToken(a.id, { kind: "signin", email: "a@example.com", hash: "tok-2", expiresAt: exp(1500) });
      t += 5000;
      assert.equal(await s.consumeEmailToken("signin", "tok-2"), null, "expired");
      const since = new Date(t - 3_600_000).toISOString();
      assert.equal(await s.countEmailTokensSince("a@example.com", since), 2, "used and expired tokens still count");
      assert.equal(await s.countEmailTokensSince("b@example.com", since), 0);

      assert.equal(await s.setAccountEmail(a.id, null), "ok");
      assert.equal(await s.findAccountByEmail("a@example.com"), null);
      assert.equal(await s.setAccountEmail(b.id, "a@example.com"), "ok", "a removed address is free again");
    });

    test("clients and runs: CRUD, paging newest first, cross-account reads return nothing", async () => {
      const s = await make(tickingClock());
      const a = await s.createAccount({ name: "A" });
      const b = await s.createAccount({ name: "B" });
      const c1 = await s.createClient(a.id, { name: "Bäckerei Müller", country: "DE", vatId: "DE123456789" });
      const c2 = await s.createClient(a.id, { name: "Second" });
      assert.equal(c2.country, "");
      assert.deepEqual((await s.listClients(a.id)).map((c) => c.id), [c1.id, c2.id]);
      assert.equal(await s.countClients(a.id), 2);
      assert.equal(await s.countClients(b.id), 0);
      assert.deepEqual(await s.getClient(a.id, c1.id), c1);
      assert.equal(await s.getClient(b.id, c1.id), null);

      const runs = [];
      for (let i = 0; i < 5; i++) runs.push(await s.addRun(a.id, emptyRun(c1.id, { lang: i % 2 ? "fr" : "de" })));
      await s.addRun(a.id, emptyRun(c2.id));
      assert.deepEqual(await s.getRun(a.id, c1.id, runs[2].id), runs[2], "round-trips totals and files");
      assert.equal(await s.getRun(b.id, c1.id, runs[2].id), null);
      assert.equal(await s.getRun(a.id, c2.id, runs[2].id), null, "run must belong to the client named");

      const p1 = await s.listRuns(a.id, c1.id, { limit: 2 });
      assert.deepEqual(p1.items.map((r) => r.id), [runs[4].id, runs[3].id]);
      assert.equal(p1.nextCursor, runs[3].createdAt);
      const p2 = await s.listRuns(a.id, c1.id, { limit: 2, before: p1.nextCursor });
      assert.deepEqual(p2.items.map((r) => r.id), [runs[2].id, runs[1].id]);
      const p3 = await s.listRuns(a.id, c1.id, { limit: 2, before: p2.nextCursor });
      assert.deepEqual(p3.items.map((r) => r.id), [runs[0].id]);
      assert.equal(p3.nextCursor, null);
      assert.equal((await s.listRuns(a.id, c1.id, { limit: 1000 })).items.length, 5, "limit capped at 100, not below");
      assert.deepEqual((await s.listRuns(b.id, c1.id)).items, []);

      assert.equal(await s.deleteClient(b.id, c1.id), false, "B cannot delete A's client");
      assert.equal((await s.listRuns(a.id, c1.id)).items.length, 5);
      assert.equal(await s.deleteClient(a.id, c1.id), true);
      assert.equal(await s.getClient(a.id, c1.id), null);
      assert.deepEqual((await s.listRuns(a.id, c1.id)).items, [], "history goes with the client");
      assert.equal((await s.listRuns(a.id, c2.id)).items.length, 1, "other clients' history stays");
      assert.equal(await s.deleteClient(a.id, c1.id), false);
    });

    test("metering: an invoice counts once per account and month; explained once per invoice", async () => {
      const s = await make(tickingClock());
      const a = await s.createAccount({ name: "A" });
      const b = await s.createAccount({ name: "B" });
      const h = (c) => c.repeat(64);
      let r = await s.meterDocuments(a.id, "2026-11", [h("1"), h("2"), h("1")], 10);
      assert.deepEqual({ ...r, added: [...r.added].sort() }, { ok: true, used: 2, added: [h("1"), h("2")] });
      assert.deepEqual(await s.meterDocuments(a.id, "2026-11", [h("2")], 10), { ok: true, used: 2, added: [] }, "re-check is free");
      assert.deepEqual(await s.meterDocuments(a.id, "2026-11", [h("2")], 2), { ok: true, used: 2, added: [] }, "free even at the limit");
      assert.deepEqual(await s.meterDocuments(a.id, "2026-11", [h("2"), h("3")], 2), { ok: false, used: 2, added: [] }, "all or nothing");
      assert.deepEqual((await s.meterDocuments(a.id, "2026-11", [h("3")], 10)).added, [h("3")], "a refused hash was not kept");
      // Failed work gives its units back; only the hashes it added.
      await s.unmeterDocuments(a.id, "2026-11", [h("3")]);
      assert.equal((await s.getUsage(a.id, "2026-11")).documents, 2);
      assert.deepEqual((await s.meterDocuments(a.id, "2026-11", [h("3")], 10)).added, [h("3")]);
      // Per account and per month.
      assert.deepEqual((await s.meterDocuments(b.id, "2026-11", [h("1")], 10)).added, [h("1")]);
      assert.deepEqual((await s.meterDocuments(a.id, "2026-12", [h("1")], 10)).added, [h("1")]);
      assert.equal((await s.getUsage(a.id, "2026-11")).documents, 3);
      // Explained: the first model use for an invoice takes a unit, later ones are free.
      assert.deepEqual(await s.meterExplained(a.id, "2026-12", h("1"), 1), { ok: true, used: 1, charged: true });
      assert.deepEqual(await s.meterExplained(a.id, "2026-12", h("1"), 1), { ok: true, used: 1, charged: false });
      await s.meterDocuments(a.id, "2026-12", [h("2")], 10);
      assert.deepEqual(await s.meterExplained(a.id, "2026-12", h("2"), 1), { ok: false, used: 1, charged: false }, "budget spent");
      assert.deepEqual(await s.meterExplained(a.id, "2026-12", h("2"), 2), { ok: true, used: 2, charged: true }, "a refusal left it unexplained");
      assert.deepEqual(await s.meterExplained(a.id, "2026-12", h("9"), 5), { ok: true, used: 3, charged: true }, "never metered: pays per call");
      assert.deepEqual(await s.meterExplained(a.id, "2026-12", h("9"), 5), { ok: true, used: 4, charged: true });
      assert.equal((await s.getUsage(b.id, "2026-12")).llmExplanations, 0);
    });

    test("metered plan: invoices with errors count once a month, only if metered, per account", async () => {
      const s = await make(tickingClock());
      const a = await s.createAccount({ name: "A" });
      const b = await s.createAccount({ name: "B" });
      const h = (/** @type {string} */ c) => c.repeat(64);
      await s.meterDocuments(a.id, "2026-11", [h("1"), h("2"), h("3")], 100);
      await s.meterDocuments(b.id, "2026-11", [h("1")], 100);
      assert.equal(await s.markDocumentsWithErrors(a.id, "2026-11", [h("1"), h("2"), h("2")]), 2);
      assert.equal(await s.markDocumentsWithErrors(a.id, "2026-11", [h("1"), h("3")]), 1, "h1 already counted");
      assert.equal(await s.markDocumentsWithErrors(a.id, "2026-11", [h("9")]), 0, "never metered: not counted");
      assert.equal(await s.markDocumentsWithErrors(a.id, "2026-12", [h("1")]), 0, "metered in another month");
      assert.equal((await s.getUsage(a.id, "2026-11")).errorDocuments, 3);
      assert.equal((await s.getUsage(b.id, "2026-11")).errorDocuments, 0, "another account's same file");
      assert.equal((await s.getUsage(a.id, "2026-11")).documents, 3);
    });

    test("usage charges: one per account and month, claimed before the provider call", async () => {
      const s = await make(tickingClock());
      const a = await s.createAccount({ name: "A" });
      const b = await s.createAccount({ name: "B" });
      const input = { planKey: "api", amountMinor: 1234, currency: "EUR", status: /** @type {const} */ ("pending"), providerSubscriptionId: "sub_a" };
      assert.equal(await s.claimUsageCharge(a.id, "2026-10", input), true);
      assert.equal(await s.claimUsageCharge(a.id, "2026-10", { ...input, amountMinor: 1 }), false, "second claim refused");
      assert.equal(await s.claimUsageCharge(b.id, "2026-10", { ...input, status: "none" }), true, "per account");
      const pending = await s.getUsageCharge(a.id, "2026-10");
      assert.equal(pending?.status, "pending");
      assert.equal(pending?.amountMinor, 1234);
      assert.equal(pending?.finishedAt, null);
      assert.ok((await s.getUsageCharge(b.id, "2026-10"))?.finishedAt, "a non-pending claim is finished at once");
      await s.finishUsageCharge(a.id, "2026-10", { status: "charged", providerChargeId: "ch_1" });
      const done = await s.getUsageCharge(a.id, "2026-10");
      assert.equal(done?.status, "charged");
      assert.equal(done?.providerChargeId, "ch_1");
      assert.ok(done?.finishedAt);
      assert.equal(await s.getUsageCharge(a.id, "2026-09"), null);
      await s.upsertSubscription(a.id, { planKey: "api", status: "active", providerCustomerId: "c", providerSubscriptionId: "sub_a", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, providerUpdatedAt: null, pastDueSince: null });
      await s.upsertSubscription(b.id, { planKey: "starter", status: "active", providerCustomerId: "d", providerSubscriptionId: "sub_b", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, providerUpdatedAt: null, pastDueSince: null });
      assert.deepEqual((await s.listSubscriptionsByPlan("api")).map((x) => x.accountId), [a.id]);
    });

    test("usage: reserve within the limit, refuse past it, release, per account and period", async () => {
      const s = await make(tickingClock());
      const a = await s.createAccount({ name: "A" });
      const b = await s.createAccount({ name: "B" });
      assert.deepEqual(await s.getUsage(a.id, "2026-11"), { accountId: a.id, period: "2026-11", documents: 0, llmExplanations: 0, errorDocuments: 0 });
      assert.deepEqual(await s.tryConsume(a.id, "2026-11", "documents", 8, 10), { ok: true, used: 8 });
      assert.deepEqual(await s.tryConsume(a.id, "2026-11", "documents", 3, 10), { ok: false, used: 8 });
      assert.deepEqual(await s.tryConsume(a.id, "2026-11", "documents", 2, 10), { ok: true, used: 10 });
      assert.deepEqual(await s.tryConsume(a.id, "2026-11", "llmExplanations", 1, 1), { ok: true, used: 1 });
      await s.release(a.id, "2026-11", "documents", 4);
      assert.equal((await s.getUsage(a.id, "2026-11")).documents, 6);
      await s.release(a.id, "2026-11", "documents", 100);
      assert.equal((await s.getUsage(a.id, "2026-11")).documents, 0, "never below zero");
      assert.equal((await s.getUsage(a.id, "2026-12")).documents, 0, "periods are separate");
      assert.equal((await s.getUsage(b.id, "2026-11")).llmExplanations, 0, "accounts are separate");
      assert.deepEqual(await s.tryConsume(b.id, "2026-11", "documents", 11, 10), { ok: false, used: 0 });
    });

    test("billing: subscription per account, checkout tokens single-use, webhook events once", async () => {
      const s = await make(tickingClock());
      const a = await s.createAccount({ name: "A" });
      const b = await s.createAccount({ name: "B" });
      assert.equal(await s.getSubscription(a.id), null);
      const row = {
        planKey: "starter",
        status: "active",
        providerCustomerId: "ctm_a",
        providerSubscriptionId: "sub_a",
        currentPeriodStart: "2026-11-24T10:00:00.000Z",
        currentPeriodEnd: "2026-12-24T10:00:00.000Z",
        cancelAtPeriodEnd: false,
        providerUpdatedAt: "2026-11-24T10:00:00.000Z",
        pastDueSince: null,
      };
      const saved = await s.upsertSubscription(a.id, row);
      const unset = {
        priceAmountMinor: null,
        priceCurrency: null,
        billingInterval: null,
        billingFrequency: null,
        priceQuantity: null,
        priceDiscounted: null,
        trialStartedAt: null,
        firstPaidAt: null,
        canceledAt: null,
      };
      assert.deepEqual({ ...saved, updatedAt: undefined }, { ...row, ...unset, accountId: a.id, updatedAt: undefined });
      const updated = await s.upsertSubscription(a.id, { ...row, planKey: "plus", status: "past_due", cancelAtPeriodEnd: true, pastDueSince: "2026-11-25T10:00:00.000Z" });
      assert.equal(updated.planKey, "plus");
      assert.equal((await s.getSubscription(a.id)).cancelAtPeriodEnd, true);
      assert.equal((await s.getSubscription(a.id)).pastDueSince, "2026-11-25T10:00:00.000Z");
      assert.equal((await s.findSubscriptionByProviderId("sub_a")).accountId, a.id);
      assert.equal(await s.findSubscriptionByProviderId("sub_none"), null);
      assert.equal(await s.getSubscription(b.id), null, "another account's subscription is not visible");

      await s.createPendingCheckout(b.id, { id: "pco_bbbbbbbbbbbbbbbbbbbb", planKey: "standard", interval: "month", expiresAt: "2026-11-25T10:00:00.000Z" });
      const pending = await s.getPendingCheckout("pco_bbbbbbbbbbbbbbbbbbbb");
      assert.equal(pending.accountId, b.id);
      assert.equal(pending.consumedAt, null);
      assert.equal(await s.consumePendingCheckout("pco_bbbbbbbbbbbbbbbbbbbb", "sub_b"), true);
      assert.equal(await s.consumePendingCheckout("pco_bbbbbbbbbbbbbbbbbbbb", "sub_b"), true, "a retried delivery of the same subscription");
      assert.equal(await s.consumePendingCheckout("pco_bbbbbbbbbbbbbbbbbbbb", "sub_other"), false, "replay by another subscription");
      assert.equal((await s.getPendingCheckout("pco_bbbbbbbbbbbbbbbbbbbb")).providerSubscriptionId, "sub_b");
      assert.equal(await s.consumePendingCheckout("pco_none", "sub_b"), false);

      assert.equal(await s.claimWebhookEvent("paddle", "evt_1", "subscription.created"), true);
      assert.equal(await s.claimWebhookEvent("paddle", "evt_1", "subscription.created"), false);
      assert.equal(await s.claimWebhookEvent("fake", "evt_1", "subscription.created"), true, "event ids are per provider");
      await s.finishWebhookEvent("paddle", "evt_1", { outcome: "applied", reason: null, accountId: a.id });
      assert.equal(await s.claimWebhookEvent("paddle", "evt_2", "subscription.updated"), true);
      await s.releaseWebhookEvent("paddle", "evt_2");
      assert.equal(await s.claimWebhookEvent("paddle", "evt_2", "subscription.updated"), true, "a released claim is processed on retry");
    });

    test("admin: recorded price and stamps round-trip; admin-only cross-account reads; audit", async () => {
      const s = await make(tickingClock());
      const a = await s.createAccount({ name: "Kanzlei A" });
      const b = await s.createAccount({ name: "Kanzlei B" });
      const base = {
        planKey: "starter",
        status: "active",
        providerCustomerId: "ctm_a",
        providerSubscriptionId: "sub_a",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        providerUpdatedAt: null,
        pastDueSince: null,
      };
      const priced = {
        ...base,
        priceAmountMinor: 4900,
        priceCurrency: "EUR",
        billingInterval: "month",
        billingFrequency: 1,
        priceQuantity: 1,
        priceDiscounted: false,
        trialStartedAt: "2026-11-01T00:00:00.000Z",
        firstPaidAt: "2026-11-15T00:00:00.000Z",
        canceledAt: null,
      };
      await s.upsertSubscription(a.id, priced);
      const got = await s.getSubscription(a.id);
      for (const k of Object.keys(priced)) assert.deepEqual(got[k], priced[k], k);
      await s.upsertSubscription(b.id, { ...base, providerCustomerId: "ctm_b", providerSubscriptionId: "sub_b", status: "canceled", canceledAt: "2026-11-20T00:00:00.000Z" });

      const key = await s.createApiKey(a.id, { name: "k", prefix: "epk_x", hash: "h-admin-a" });
      await s.findActiveApiKeyByHash(key.hash);
      const snap = await s.adminSnapshot("2026-01-01T00:00:00.000Z");
      assert.equal(snap.accountCreatedAt.length, 2);
      assert.equal(snap.activeAccounts, 1);
      assert.equal(snap.subscriptions.length, 2);
      assert.equal(snap.subscriptions.find((x) => x.accountId === a.id).priceAmountMinor, 4900);

      const recent = await s.adminListAccounts("recent", 10, "2026-01-01T00:00:00.000Z");
      assert.deepEqual(recent.map((r) => r.account.name), ["Kanzlei B", "Kanzlei A"]);
      assert.equal(recent[1].subscription.priceCurrency, "EUR");
      assert.deepEqual((await s.adminListAccounts("churn", 10, "2026-01-01T00:00:00.000Z")).map((r) => r.account.id), [b.id]);
      assert.deepEqual((await s.adminListAccounts("trials", 10, "2026-01-01T00:00:00.000Z")).map((r) => r.account.id), [a.id]);
      assert.equal((await s.adminListAccounts("recent", 1, "2026-01-01T00:00:00.000Z")).length, 1);

      await s.adminAudit({ actorId: "admin-console", action: "admin.metrics_read", metadata: { days: 30 } });
      const [entry] = await s.adminListAudit(5);
      assert.equal(entry.action, "admin.metrics_read");
      assert.equal(entry.actorType, "service");
      assert.deepEqual(entry.metadata, { days: 30 });
    });
  });
}

test("SqlStore persists across reopen and two handles on one file share one quota", async () => {
  const file = join(dir, "shared.db");
  const s1 = await openSqliteStore(file);
  const acct = await s1.createAccount({ name: "Persist" });
  const cli = await s1.createClient(acct.id, { name: "P client" });
  await s1.addRun(acct.id, emptyRun(cli.id));
  const s2 = await openSqliteStore(file);
  assert.equal((await s2.getClient(acct.id, cli.id)).name, "P client");
  assert.equal((await s2.listRuns(acct.id, cli.id)).items.length, 1);
  // Both handles race for the last 5 units of a 10-unit plan, 5 tries each.
  await s1.tryConsume(acct.id, "2026-11", "documents", 5, 10);
  const tries = [];
  for (let i = 0; i < 5; i++) tries.push(s1.tryConsume(acct.id, "2026-11", "documents", 1, 10), s2.tryConsume(acct.id, "2026-11", "documents", 1, 10));
  const results = await Promise.all(tries);
  assert.equal(results.filter((r) => r.ok).length, 5);
  assert.equal((await s1.getUsage(acct.id, "2026-11")).documents, 10);
  s1.close();
  s2.close();
});

test("SqlStore refuses an unknown usage field instead of building SQL from it", async () => {
  const s = new SqlStore(await nodeSqliteDb(":memory:"));
  await s.init();
  await assert.rejects(() => s.tryConsume("a", "2026-11", /** @type {any} */ ("documents = 0; --"), 1, 10), /unknown usage field/);
});

test("the paid API runs end to end on SqlStore: account, batch, history, usage, isolation", async () => {
  const store = await openSqliteStore(":memory:");
  const now = () => new Date("2026-11-24T10:00:00Z");
  const server = createServer(createProHandler({ store, env: { ADMIN_TOKEN: "t" }, now }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { key, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json() };
  };
  try {
    const admin = { authorization: "Bearer t", "content-type": "application/json" };
    const mk = async (name) => (await (await fetch(`${base}/v1/admin/accounts`, { method: "POST", headers: admin, body: JSON.stringify({ name }) })).json());
    const a = await mk("Kanzlei A");
    const b = await mk("Cabinet B");
    const ubl = readFileSync(new URL("../examples/ubl-invoice.xml", import.meta.url), "utf8");
    const dotted = ubl.replace("<cbc:IssueDate>2026-08-24", "<cbc:IssueDate>24.08.2026");

    const c = (await call("POST", "/v1/clients", { key: a.apiKey, body: { name: "Müller GmbH", country: "DE" } })).json;
    const batch = await call("POST", `/v1/clients/${c.id}/batches?lang=de&fix=1`, {
      key: a.apiKey,
      body: { documents: [{ name: "ok.xml", content: ubl }, { name: "dotted.xml", content: dotted }] },
    });
    assert.equal(batch.status, 201);
    assert.equal(batch.json.run.totals.files, 2);
    const hist = await call("GET", `/v1/clients/${c.id}/history`, { key: a.apiKey });
    assert.equal(hist.json.items.length, 1);
    assert.equal(hist.json.items[0].id, batch.json.run.id);
    const acct = await call("GET", "/v1/account", { key: a.apiKey });
    assert.equal(acct.json.usage.documents, 2);

    // B sees none of A's data.
    assert.equal((await call("GET", `/v1/clients/${c.id}`, { key: b.apiKey })).status, 404);
    assert.equal((await call("GET", `/v1/clients/${c.id}/runs/${batch.json.run.id}`, { key: b.apiKey })).status, 404);
    assert.deepEqual((await call("GET", "/v1/clients", { key: b.apiKey })).json.items, []);

    // Invoice contents never reach the database: only names, hashes and rule ids.
    const rows = await store.db.all("SELECT files FROM runs");
    assert.ok(!rows.some((r) => r.files.includes("<cbc:") || r.files.includes("IssueDate")));
  } finally {
    server.close();
    store.close();
  }
});

test("SqlStore adds the admin-metrics columns to a database created before them", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const file = join(dir, "old.db");
  const old = new DatabaseSync(file);
  // Schema version 1's subscriptions table, as deployed before the price columns existed.
  old.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE subscriptions (account_id TEXT PRIMARY KEY REFERENCES accounts(id), plan_key TEXT NOT NULL, status TEXT NOT NULL,
      provider_customer_id TEXT, provider_subscription_id TEXT UNIQUE, current_period_start TEXT, current_period_end TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0, provider_updated_at TEXT, past_due_since TEXT, updated_at TEXT NOT NULL);
    INSERT INTO accounts VALUES ('acct_old', 'Old', 'trial', '2026-01-01T00:00:00.000Z');
    INSERT INTO subscriptions (account_id, plan_key, status, updated_at) VALUES ('acct_old', 'starter', 'active', '2026-01-01T00:00:00.000Z');`);
  old.close();
  const s = await openSqliteStore(file);
  const sub = await s.getSubscription("acct_old");
  assert.equal(sub.status, "active");
  assert.equal(sub.priceAmountMinor, null, "never back-filled");
  assert.equal((await s.getAccount("acct_old")).email, null, "sign-in email column added");
  assert.equal(await s.setAccountEmail("acct_old", "old@example.com"), "ok");
  await s.init(); // idempotent
  s.close();
});
