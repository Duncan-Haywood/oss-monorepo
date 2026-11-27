// Platform admin API (/v1/admin/metrics, /v1/admin/accounts, also /api/admin/*) on a real socket:
// the service-token gate, the audit trail, cross-account reads, and metrics built only from what the
// Paddle webhook recorded. FSL-1.1-MIT (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { FAKE_SIGNATURE_HEADER, signCheckoutToken, signFakeWebhook } from "../../../packages/billing/src/index.ts";
import { createProHandler } from "./server.mjs";
import { openSqliteStore } from "./sql-store.mjs";
import { MemoryStore } from "./store.mjs";

const ADMIN = "admin-create-token";
const SERVICE = "test-admin-service-token-0123456789abcdef";
const METRICS = "test-admin-metrics-token-0123456789abcdef";
const now = () => new Date("2026-11-26T10:00:00Z");
const ENV = { ADMIN_TOKEN: ADMIN, ADMIN_SERVICE_TOKEN: SERVICE, ADMIN_METRICS_TOKEN: METRICS, APP_ENV: "test", APP_URL: "http://localhost:8790" };
const DEMO_SECRET = "einvoice-demo-checkout-secret-not-for-production";

/** @type {{ name: string, base: string, store: any, close: () => void }[]} */
const servers = [];
async function start(name, store, env = ENV) {
  const server = createServer(createProHandler({ store, env, now }));
  await new Promise((r) => server.listen(0, r));
  const s = { name, base: `http://127.0.0.1:${server.address().port}`, store, close: () => server.close() };
  servers.push(s);
  return s;
}
before(async () => {
  await start("MemoryStore", new MemoryStore({ now }));
  await start("SqlStore", await openSqliteStore(":memory:", { now }));
});
after(() => servers.forEach((s) => s.close()));

async function call(srv, method, path, { key, body, raw, headers } = {}) {
  const res = await fetch(srv.base + path, {
    method,
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function newAccount(srv, name) {
  const r = await call(srv, "POST", "/v1/admin/accounts", { key: ADMIN, body: { name } });
  assert.equal(r.status, 201);
  return { id: r.json.account.id, key: r.json.apiKey };
}

let events = 0;
async function webhook(srv, body) {
  const raw = JSON.stringify({ providerEventId: `evt_adm_${++events}`, type: "subscription.updated", occurredAt: now().toISOString(), ...body });
  const r = await call(srv, "POST", "/v1/billing/webhook", { raw, headers: { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: await signFakeWebhook(raw) } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json;
}

/** Checkout + first webhook for `a`, with a recorded price. */
async function subscribe(srv, a, subId, status, price = {}) {
  const r = await call(srv, "POST", "/v1/billing/checkout", { key: a.key, body: { plan: "starter", email: "buchhaltung@example.com" } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  // Rebuild the token exactly as billing.mjs signs it (the fake provider does not echo it back).
  const token = await signCheckoutToken(DEMO_SECRET, await pendingId(srv, a.id), a.id);
  return webhook(srv, { customData: { checkoutToken: token }, subscription: subOf(subId, status, price) });
}
async function pendingId(srv, accountId) {
  if (srv.store.data) return srv.store.data.pendingCheckouts.filter((c) => c.accountId === accountId).at(-1).id;
  const [row] = await srv.store.db.all("SELECT id FROM pending_checkouts WHERE account_id = ? ORDER BY created_at DESC LIMIT 1", [accountId]);
  return row.id;
}
const subOf = (id, status, price = {}) => ({
  planKey: "starter",
  status,
  providerCustomerId: `ctm_${id}`,
  providerSubscriptionId: `sub_${id}`,
  price: { unitAmountMinor: 4900, currency: "EUR", interval: "month", frequency: 1, quantity: 1, discounted: false, ...price },
});

for (const name of ["MemoryStore", "SqlStore"]) {
  const srv = () => servers.find((s) => s.name === name);

  test(`${name}: the gate: no token 401; a wrong token, ADMIN_TOKEN or a customer's API key 403`, async () => {
    const a = await newAccount(srv(), "Kanzlei Gate");
    assert.equal((await call(srv(), "GET", "/v1/admin/metrics")).status, 401);
    assert.equal((await call(srv(), "GET", "/v1/admin/metrics", { key: "wrong-token" })).status, 403);
    assert.equal((await call(srv(), "GET", "/v1/admin/metrics", { key: ADMIN })).status, 403);
    assert.equal((await call(srv(), "GET", "/v1/admin/accounts", { key: a.key })).status, 403);
    assert.equal((await call(srv(), "GET", "/api/admin/accounts", { key: a.key })).status, 403);
    assert.equal((await call(srv(), "GET", "/v1/admin/metrics", { key: SERVICE })).status, 200);
    assert.equal((await call(srv(), "GET", "/v1/admin/metrics?days=0", { key: SERVICE })).status, 400);
    assert.equal((await call(srv(), "GET", "/v1/admin/accounts?list=all", { key: SERVICE })).status, 400);
    // POST account creation is unchanged: ADMIN_TOKEN only, the service token cannot create accounts.
    assert.equal((await call(srv(), "POST", "/v1/admin/accounts", { key: SERVICE, body: { name: "x" } })).status, 401);
  });

  test(`${name}: the read-only metrics token reads metrics, never the account list`, async () => {
    const m = await call(srv(), "GET", "/v1/admin/metrics", { key: METRICS });
    assert.equal(m.status, 200);
    const audit = await srv().store.adminListAudit(1);
    assert.equal(audit[0].action, "admin.metrics_read");
    assert.equal(audit[0].actorId, "metrics-agent");
    for (const path of ["/v1/admin/accounts", "/api/admin/accounts?list=churn"]) {
      assert.equal((await call(srv(), "GET", path, { key: METRICS })).status, 403);
    }
    assert.equal((await srv().store.adminListAudit(1))[0].action, "admin.metrics_read");
  });

  test(`${name}: cross-account reads only through the service token, and every read is audited`, async () => {
    const a = await newAccount(srv(), "Kanzlei Alpha");
    const b = await newAccount(srv(), "Kanzlei Bravo");
    const client = await call(srv(), "POST", "/v1/clients", { key: b.key, body: { name: "Mandant B" } });
    assert.equal((await call(srv(), "GET", `/v1/clients/${client.json.id}`, { key: a.key })).status, 404);

    const page = await call(srv(), "GET", "/api/admin/accounts?list=recent&limit=200", { key: SERVICE });
    assert.equal(page.status, 200);
    assert.equal(page.json.kind, "app");
    const names = page.json.items.map((i) => i.orgName);
    assert.ok(names.includes("Kanzlei Alpha") && names.includes("Kanzlei Bravo"));
    // Metadata only: no clients, runs or keys in the answer.
    assert.doesNotMatch(JSON.stringify(page.json), /Mandant B|epk_/);
    assert.equal(page.json.items.find((i) => i.orgId === a.id).owner, null);

    const audit = await srv().store.adminListAudit(5);
    assert.equal(audit[0].action, "admin.accounts_read");
    assert.equal(audit[0].actorId, "admin-console");
    assert.deepEqual(audit[0].metadata, { list: "recent", limit: 200, returned: page.json.items.length });
  });

  test(`${name}: MRR, trials, cancellations and failed payments come only from recorded webhooks`, async () => {
    const m = async () => (await call(srv(), "GET", "/v1/admin/metrics?days=30", { key: SERVICE })).json;
    const eur = (x) => x.mrr.byCurrency.find((c) => c.currency === "EUR")?.amountMinor ?? 0;
    const before = await m();
    assert.equal(before.signups.verified, null);
    assert.equal(before.llmSpend, null);
    assert.equal(before.failedPayments.inWindow, null, "no transaction events yet: unmeasured, not zero");

    const t = await newAccount(srv(), "Kanzlei Trial");
    await subscribe(srv(), t, `${name}_t`, "trialing");
    assert.equal(eur(await m()), eur(before), "trialing is not revenue");
    await webhook(srv(), { subscription: subOf(`${name}_t`, "active") });

    const y = await newAccount(srv(), "Kanzlei Annual");
    await subscribe(srv(), y, `${name}_y`, "active", { interval: "year", unitAmountMinor: 49_000 });
    const d = await newAccount(srv(), "Kanzlei Discount");
    await subscribe(srv(), d, `${name}_d`, "active", { discounted: true });
    const c = await newAccount(srv(), "Kanzlei Cancel");
    await subscribe(srv(), c, `${name}_c`, "trialing");
    await webhook(srv(), { subscription: subOf(`${name}_c`, "canceled") });
    await webhook(srv(), { type: "transaction.payment_failed", providerSubscriptionId: `sub_${name}_y` });

    const after = await m();
    assert.equal(eur(after) - eur(before), 4900 + 4083);
    assert.equal(after.mrr.subscriptionsCounted - before.mrr.subscriptionsCounted, 2);
    assert.equal(after.mrr.subscriptionsUnpriced - before.mrr.subscriptionsUnpriced, 1);
    assert.equal(after.trials.startedInWindow - before.trials.startedInWindow, 2);
    assert.equal(after.trials.converted - before.trials.converted, 1);
    assert.equal(after.trials.expired - before.trials.expired, 1);
    assert.equal(after.cancellations.inWindow - before.cancellations.inWindow, 1);
    assert.equal(after.failedPayments.inWindow, 1);
    assert.equal(after.signups.total - before.signups.total, 4);
    assert.equal(after.signups.byDay.at(-1).total - before.signups.byDay.at(-1).total, 4);
    assert.equal(after.orgs.total, after.signups.total);

    const churn = await call(srv(), "GET", "/v1/admin/accounts?list=churn", { key: SERVICE });
    assert.deepEqual(churn.json.items.map((i) => i.orgId), [c.id]);
    const trials = await call(srv(), "GET", "/v1/admin/accounts?list=trials", { key: SERVICE });
    assert.deepEqual(new Set(trials.json.items.map((i) => i.orgId)), new Set([t.id, c.id]));
    const recent = (await call(srv(), "GET", "/v1/admin/accounts?list=recent&limit=200", { key: SERVICE })).json.items;
    assert.deepEqual(recent.find((i) => i.orgId === y.id).mrr, { currency: "EUR", amountMinor: 4083 });
    assert.equal(recent.find((i) => i.orgId === d.id).mrr, null);
    assert.equal(recent.find((i) => i.orgId === t.id).firstPaidAt, now().toISOString());
  });
}

test("the admin read API is closed when ADMIN_SERVICE_TOKEN is unset or too short", async () => {
  for (const token of [undefined, "short-token"]) {
    const s = await start(`closed-${token}`, new MemoryStore({ now }), { ...ENV, ADMIN_SERVICE_TOKEN: token });
    assert.equal((await call(s, "GET", "/v1/admin/metrics", { key: token ?? SERVICE })).status, 403);
  }
});
