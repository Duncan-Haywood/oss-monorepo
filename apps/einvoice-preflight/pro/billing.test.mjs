// Paid plans end to end on a real socket with the signed fake provider: checkout, webhook binding,
// idempotency, replay and forgery, ordering, grace, cancel, portal. Proprietary (see ../LICENSE).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { FAKE_SIGNATURE_HEADER, signFakeWebhook } from "../../../packages/billing/src/index.ts";
import { createBilling } from "./billing.mjs";
import { createProHandler } from "./server.mjs";
import { FileStore, MemoryStore } from "./store.mjs";

const ADMIN = "admin-test-token";
let clock = new Date("2026-11-26T10:00:00Z");
const now = () => clock;
const ENV = { ADMIN_TOKEN: ADMIN, APP_ENV: "test", APP_URL: "http://localhost:8790" };

let server;
let base;
let store;
let events = 0;

before(async () => {
  store = new MemoryStore({ now });
  server = createServer(createProHandler({ store, env: ENV, now }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { key, body, raw, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

async function newAccount(name) {
  const r = await call("POST", "/v1/admin/accounts", { key: ADMIN, body: { name } });
  assert.equal(r.status, 201);
  return { id: r.json.account.id, key: r.json.apiKey };
}

/** Starts a checkout and returns the token the provider would carry back in custom_data. */
async function startCheckout(a, body = { plan: "starter", email: "buchhaltung@example.com" }) {
  const r = await call("POST", "/v1/billing/checkout", { key: a.key, body });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const pending = store.data.pendingCheckouts.filter((c) => c.accountId === a.id).at(-1);
  // Rebuild the token exactly as billing.mjs signs it (the fake provider does not echo it back).
  const { signCheckoutToken } = await import("../../../packages/billing/src/index.ts");
  return { url: r.json.url, pending, token: await signCheckoutToken("einvoice-demo-checkout-secret-not-for-production", pending.id, a.id) };
}

async function webhook(body, { sign = true } = {}) {
  const raw = JSON.stringify({ providerEventId: `evt_${++events}`, type: "subscription.updated", occurredAt: clock.toISOString(), ...body });
  return call("POST", "/v1/billing/webhook", {
    raw,
    headers: { "content-type": "application/json", ...(sign ? { [FAKE_SIGNATURE_HEADER]: await signFakeWebhook(raw) } : {}) },
  });
}

const sub = (id, over = {}) => ({
  planKey: "starter",
  status: "active",
  providerCustomerId: `ctm_${id}`,
  providerSubscriptionId: `sub_${id}`,
  currentPeriodStart: clock.toISOString(),
  currentPeriodEnd: new Date(clock.getTime() + 30 * 86_400_000).toISOString(),
  ...over,
});

const limitOf = async (a) => (await call("GET", "/v1/account", { key: a.key })).json.plan.documentsPerMonth;

test("the pricing table is public and lists prices and limits", async () => {
  const r = await call("GET", "/v1/billing/plans");
  assert.equal(r.status, 200);
  assert.equal(r.json.available, true, "the fake provider is configured in tests");
  const starter = r.json.items.find((p) => p.key === "starter");
  assert.equal(starter.priceCents, 1900);
  assert.equal(starter.currency, "EUR");
  assert.equal(starter.limits.documentsPerMonth, 500);
  assert.equal(starter.limits.clients, 10);
  assert.equal(r.json.items.find((p) => p.key === "trial").purchasable, false);
});

test("checkout validates its input", async () => {
  const a = await newAccount("Kanzlei Eingabe");
  const bad = async (body) => (await call("POST", "/v1/billing/checkout", { key: a.key, body })).json.error.code;
  assert.equal(await bad({ plan: "trial", email: "x@example.com" }), "invalid", "trial is not sold");
  assert.equal(await bad({ plan: "comp", email: "x@example.com" }), "invalid");
  assert.equal(await bad({ plan: "starter" }), "invalid", "billing email required");
  assert.equal(await bad({ plan: "starter", email: "x@example.com", interval: "week" }), "invalid");
  assert.equal(await bad({ plan: "starter", email: "x@example.com", interval: "year" }), "invalid", "monthly only, as the site says");
  assert.equal(await bad({ plan: "starter", email: "x@example.com", promoCode: "NOPE" }), "invalid_promo_code");
  assert.equal((await call("POST", "/v1/billing/checkout", { body: { plan: "starter" } })).status, 401, "needs an API key");
});

test("checkout puts only an opaque token in the provider request; the webhook binds the account and sets the plan", async () => {
  const a = await newAccount("Kanzlei Müller");
  assert.equal(await limitOf(a), 100);
  const { url, pending, token } = await startCheckout(a, { plan: "standard", email: "buchhaltung@example.com" });
  assert.match(url, /^http:\/\/localhost:8790\/billing\/success\?fake_checkout=standard$/);
  assert.equal(pending.planKey, "standard");
  assert.equal(pending.interval, "month");
  assert.ok(!token.includes(a.id), "the token never names the account");

  const r = await webhook({ customData: { checkoutToken: token }, subscription: sub("mueller", { planKey: "standard" }) });
  assert.deepEqual(r.json, { result: "applied" });
  assert.equal(await limitOf(a), 1500);
  const acct = (await call("GET", "/v1/account", { key: a.key })).json;
  assert.equal(acct.subscription.plan, "standard");
  assert.equal(acct.subscription.status, "active");
  assert.equal(acct.subscription.providerCustomerId, undefined, "provider ids are not shown");

  const again = await call("POST", "/v1/billing/checkout", { key: a.key, body: { plan: "plus", email: "x@example.com" } });
  assert.equal(again.status, 409, "a second subscription is refused; change plans in the portal");
  const portal = await call("POST", "/v1/billing/portal", { key: a.key });
  assert.equal(portal.status, 200);
  assert.match(portal.json.url, /fake_portal=1/);
});

test("webhook: a bad or missing signature is 401 and changes nothing", async () => {
  const a = await newAccount("Kanzlei Signatur");
  const { token } = await startCheckout(a);
  const raw = JSON.stringify({ providerEventId: "evt_forged", customData: { checkoutToken: token }, subscription: sub("forged") });
  const forged = await call("POST", "/v1/billing/webhook", { raw, headers: { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: "0".repeat(64) } });
  assert.equal(forged.status, 401);
  assert.equal((await webhook({ customData: { checkoutToken: token }, subscription: sub("unsigned") }, { sign: false })).status, 401);
  assert.equal(await limitOf(a), 100);
});

test("webhook: a redelivered event is a duplicate; an event without a token or with a forged one is ignored", async () => {
  const a = await newAccount("Kanzlei Doppelt");
  const { token } = await startCheckout(a);
  const raw = JSON.stringify({ providerEventId: "evt_dup", occurredAt: clock.toISOString(), customData: { checkoutToken: token }, subscription: sub("dup") });
  const headers = { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: await signFakeWebhook(raw) };
  assert.equal((await call("POST", "/v1/billing/webhook", { raw, headers })).json.result, "applied");
  assert.deepEqual((await call("POST", "/v1/billing/webhook", { raw, headers })).json, { result: "duplicate" });

  assert.deepEqual((await webhook({ subscription: sub("orphan") })).json, { result: "ignored", reason: "no checkout token" });
  const b = await newAccount("Kanzlei Fremd");
  const forged = token.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  assert.deepEqual((await webhook({ customData: { checkoutToken: forged }, subscription: sub("forged2") })).json, {
    result: "ignored",
    reason: "invalid checkout token",
  });
  // custom_data naming another account is never read: only the token binds.
  const crafted = await webhook({ customData: { orgId: b.id, accountId: b.id }, subscription: sub("crafted") });
  assert.equal(crafted.json.result, "ignored");
  assert.equal(await limitOf(b), 100);
});

test("webhook: a checkout token is single-use; a second subscription cannot reuse it", async () => {
  const a = await newAccount("Kanzlei Einmal");
  const { token } = await startCheckout(a);
  assert.equal((await webhook({ customData: { checkoutToken: token }, subscription: sub("first") })).json.result, "applied");
  const replay = await webhook({ customData: { checkoutToken: token }, subscription: sub("second", { providerCustomerId: "ctm_attacker" }) });
  assert.equal(replay.json.result, "ignored");
  assert.equal(store.data.subscriptions.find((s) => s.accountId === a.id).providerSubscriptionId, "sub_first");
});

test("webhook: an expired checkout token is ignored", async () => {
  const a = await newAccount("Kanzlei Spät");
  const { token } = await startCheckout(a);
  clock = new Date(clock.getTime() + 25 * 3_600_000);
  try {
    assert.deepEqual((await webhook({ customData: { checkoutToken: token }, subscription: sub("late") })).json, {
      result: "ignored",
      reason: "expired checkout token",
    });
  } finally {
    clock = new Date("2026-11-26T10:00:00Z");
  }
});

test("webhook: a price that maps to no sold plan is ignored", async () => {
  const a = await newAccount("Kanzlei Gratis");
  const { token } = await startCheckout(a);
  assert.deepEqual((await webhook({ customData: { checkoutToken: token }, subscription: sub("trialplan", { planKey: "trial" }) })).json, {
    result: "ignored",
    reason: "unknown plan",
  });
});

test("webhook: plan changes, out-of-order events, past_due grace and cancellation", async () => {
  const a = await newAccount("Kanzlei Verlauf");
  const { token } = await startCheckout(a);
  const t0 = clock;
  assert.equal((await webhook({ customData: { checkoutToken: token }, subscription: sub("life") })).json.result, "applied");

  // Upgrade later: bound by the stored subscription id, no token needed.
  clock = new Date(t0.getTime() + 3_600_000);
  assert.equal((await webhook({ subscription: sub("life", { planKey: "plus" }) })).json.result, "applied");
  assert.equal(await limitOf(a), 4000);

  // A delivery older than the last applied one changes nothing.
  const late = await webhook({ occurredAt: t0.toISOString(), subscription: sub("life", { planKey: "starter" }) });
  assert.deepEqual(late.json, { result: "ignored", reason: "out-of-order event" });
  assert.equal(await limitOf(a), 4000);

  // Another provider customer cannot take the subscription over.
  clock = new Date(t0.getTime() + 2 * 3_600_000);
  assert.equal((await webhook({ subscription: sub("life", { providerCustomerId: "ctm_other" }) })).json.reason, "customer mismatch");

  // past_due keeps the plan for 7 days, then falls back to the account's own plan.
  clock = new Date(t0.getTime() + 3 * 3_600_000);
  assert.equal((await webhook({ subscription: sub("life", { planKey: "plus", status: "past_due" }) })).json.result, "applied");
  const inGrace = (await call("GET", "/v1/account", { key: a.key })).json;
  assert.equal(inGrace.plan.key, "plus");
  assert.ok(inGrace.graceUntil, "a grace end is shown while past_due");
  clock = new Date(t0.getTime() + 8 * 86_400_000);
  assert.equal(await limitOf(a), 100);

  // Paid again, then canceled: back to trial; a new checkout is allowed after a cancel.
  clock = new Date(t0.getTime() + 8 * 86_400_000 + 1000);
  assert.equal((await webhook({ subscription: sub("life", { planKey: "plus" }) })).json.result, "applied");
  assert.equal(await limitOf(a), 4000);
  clock = new Date(t0.getTime() + 9 * 86_400_000);
  assert.equal((await webhook({ subscription: sub("life", { planKey: "plus", status: "canceled" }) })).json.result, "applied");
  assert.equal(await limitOf(a), 100);
  const resub = await call("POST", "/v1/billing/checkout", { key: a.key, body: { plan: "starter", email: "x@example.com" } });
  assert.equal(resub.status, 201);
  clock = new Date("2026-11-26T10:00:00Z");
});

test("the plan from a subscription meters the API: a Firm S account gets 500 documents", async () => {
  const a = await newAccount("Kanzlei Zähler");
  const { token } = await startCheckout(a);
  await webhook({ customData: { checkoutToken: token }, subscription: sub("meter") });
  store.usageRow(a.id, "2026-11").documents = 150;
  const r = await call("POST", "/v1/check?lang=de", { key: a.key, raw: "<Invoice/>", headers: { "content-type": "application/xml" } });
  assert.equal(r.status, 200, "past the trial's 100 but inside Firm S's 500");
  assert.equal(r.headers.get("x-usage-documents-limit"), "500");
});

test("portal: an account with no subscription gets 404", async () => {
  const a = await newAccount("Kanzlei Ohne");
  assert.equal((await call("POST", "/v1/billing/portal", { key: a.key })).status, 404);
});

test("dark by default: no provider, no checkout secret or no https APP_URL means not on sale", () => {
  const s = new MemoryStore();
  assert.equal(createBilling({ env: {}, store: s, now }).available, false);
  const paddle = { BILLING_PROVIDER: "paddle", BILLING_API_KEY: "pdl_sdbx_x", BILLING_WEBHOOK_SECRET: "whsec" };
  assert.equal(createBilling({ env: { ...paddle, APP_URL: "https://app.example" }, store: s, now }).available, false, "no CHECKOUT_SECRET");
  assert.equal(createBilling({ env: { ...paddle, CHECKOUT_SECRET: "x".repeat(16), APP_URL: "https://app.example" }, store: s, now }).available, false, "short secret");
  assert.equal(createBilling({ env: { ...paddle, CHECKOUT_SECRET: "x".repeat(32), APP_URL: "http://app.example" }, store: s, now }).available, false, "plain http");
  assert.equal(createBilling({ env: { ...paddle, CHECKOUT_SECRET: "x".repeat(32), APP_URL: "https://app.example" }, store: s, now }).available, true);
});

test("FileStore keeps subscriptions, checkouts and webhook events across restarts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "einv-bill-"));
  try {
    const file = join(dir, "data.json");
    const s1 = new FileStore(file, { now });
    const acct = await s1.createAccount({ name: "Persist" });
    await s1.createPendingCheckout(acct.id, { id: "pco_aaaaaaaaaaaaaaaaaaaa", planKey: "starter", interval: "month", expiresAt: "2026-11-27T10:00:00.000Z" });
    assert.equal(await s1.claimWebhookEvent("fake", "evt_1", "subscription.created"), true);
    await s1.upsertSubscription(acct.id, {
      planKey: "starter",
      status: "active",
      providerCustomerId: "ctm_1",
      providerSubscriptionId: "sub_1",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      providerUpdatedAt: null,
      pastDueSince: null,
    });
    const s2 = new FileStore(file, { now });
    assert.equal((await s2.getSubscription(acct.id)).planKey, "starter");
    assert.equal((await s2.findSubscriptionByProviderId("sub_1")).accountId, acct.id);
    assert.equal(await s2.consumePendingCheckout("pco_aaaaaaaaaaaaaaaaaaaa", "sub_1"), true);
    assert.equal(await s2.consumePendingCheckout("pco_aaaaaaaaaaaaaaaaaaaa", "sub_2"), false, "replay by another subscription");
    assert.equal(await s2.claimWebhookEvent("fake", "evt_1", "subscription.created"), false);
    assert.equal(await s2.getSubscription("acct_other"), null, "scoped by account");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the purchase flow runs the same on the production SQLite store", async () => {
  const { openSqliteStore } = await import("./sql-store.mjs");
  const sql = await openSqliteStore(":memory:", { now });
  const srv = createServer(createProHandler({ store: sql, env: ENV, now }));
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    const post = async (path, body, headers = {}) => {
      const res = await fetch(url + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
      return { status: res.status, json: await res.json() };
    };
    const created = await post("/v1/admin/accounts", JSON.stringify({ name: "SQL Kanzlei" }), { authorization: `Bearer ${ADMIN}` });
    const { account, apiKey } = created.json;
    assert.equal((await post("/v1/billing/checkout", JSON.stringify({ plan: "plus", email: "a@example.com" }), { authorization: `Bearer ${apiKey}` })).status, 201);
    const pending = (await sql.db.all("SELECT id FROM pending_checkouts WHERE account_id = ?", [account.id]))[0];
    const { signCheckoutToken } = await import("../../../packages/billing/src/index.ts");
    const token = await signCheckoutToken("einvoice-demo-checkout-secret-not-for-production", pending.id, account.id);
    const raw = JSON.stringify({ providerEventId: "evt_sql", occurredAt: clock.toISOString(), customData: { checkoutToken: token }, subscription: sub("sql", { planKey: "plus" }) });
    const hook = await post("/v1/billing/webhook", raw, { [FAKE_SIGNATURE_HEADER]: await signFakeWebhook(raw) });
    assert.deepEqual(hook.json, { result: "applied" });
    assert.deepEqual((await post("/v1/billing/webhook", raw, { [FAKE_SIGNATURE_HEADER]: await signFakeWebhook(raw) })).json, { result: "duplicate" });
    const acct = await fetch(`${url}/v1/account`, { headers: { authorization: `Bearer ${apiKey}` } }).then((r) => r.json());
    assert.equal(acct.plan.key, "plus");
    assert.equal(acct.subscription.status, "active");
  } finally {
    srv.close();
  }
});
