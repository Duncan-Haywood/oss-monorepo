// The metered API plan for invoicing software vendors, end to end on a real socket with the signed
// fake provider: buy the `api` plan, check invoices (errors counted once a month), read the
// statement, settle a closed month once. Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { FAKE_SIGNATURE_HEADER, signCheckoutToken, signFakeWebhook } from "../../../packages/billing/src/index.ts";
import { createProHandler } from "./server.mjs";
import { MemoryStore } from "./store.mjs";

const UBL = readFileSync(new URL("../examples/ubl-invoice.xml", import.meta.url), "utf8");
const DEFECTS = readFileSync(new URL("../examples/ubl-invoice-with-defects.xml", import.meta.url), "utf8");
const ADMIN = "admin-test-token";
let clock = new Date("2026-11-20T10:00:00Z");
const now = () => clock;

let server;
let base;
let store;
let events = 0;

before(async () => {
  store = new MemoryStore({ now });
  server = createServer(createProHandler({ store, env: { ADMIN_TOKEN: ADMIN, APP_ENV: "test", APP_URL: "http://localhost:8790" }, now }));
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

/** Buy `plan` through the fake checkout and bind it with a signed webhook. */
async function subscribe(a, plan, status = "active") {
  const r = await call("POST", "/v1/billing/checkout", { key: a.key, body: { plan, email: "billing@vendor.example" } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const pending = store.data.pendingCheckouts.filter((c) => c.accountId === a.id).at(-1);
  const token = await signCheckoutToken("einvoice-demo-checkout-secret-not-for-production", pending.id, a.id);
  const raw = JSON.stringify({
    providerEventId: `evt_${++events}`,
    type: "subscription.created",
    occurredAt: clock.toISOString(),
    customData: { checkoutToken: token },
    subscription: {
      planKey: plan,
      status,
      providerCustomerId: `ctm_${a.id}`,
      providerSubscriptionId: `sub_${a.id}`,
      currentPeriodStart: clock.toISOString(),
      currentPeriodEnd: new Date(clock.getTime() + 30 * 86_400_000).toISOString(),
    },
  });
  const w = await call("POST", "/v1/billing/webhook", { raw, headers: { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: await signFakeWebhook(raw) } });
  assert.equal(w.json.result, "applied", JSON.stringify(w.json));
}

/** Seed a month's usage directly: `docs` invoices, the first `errors` of them with errors. */
async function seedUsage(a, period, docs, errors) {
  const hashes = Array.from({ length: docs }, (_, i) => `${a.id}-${period}-${i}`);
  await store.meterDocuments(a.id, period, hashes, Number.MAX_SAFE_INTEGER);
  await store.markDocumentsWithErrors(a.id, period, hashes.slice(0, errors));
}

test("the api plan is on sale with its rates; the account shows a running statement", async () => {
  const plans = (await call("GET", "/v1/billing/plans")).json.items;
  const api = plans.find((p) => p.key === "api");
  assert.equal(api.priceCents, 1900);
  assert.deepEqual(api.metered, { validationCents: 0.14, explainedCents: 4, minimumCents: 1900 });

  const a = await newAccount("Vendor A");
  await subscribe(a, "api");
  const ok = await call("POST", "/v1/check?lang=en", { key: a.key, raw: UBL });
  assert.equal(ok.json.status, "pass");
  const bad = await call("POST", "/v1/check?lang=de", { key: a.key, raw: DEFECTS });
  assert.equal(bad.json.status, "fail");
  assert.equal(bad.headers.get("x-usage-amount-cents"), "5", "0.14 + 4 = 4.14 -> 5 cents so far");
  const again = await call("POST", "/v1/check?lang=fr", { key: a.key, raw: DEFECTS });
  assert.equal(again.headers.get("x-usage-documents-charged"), "0", "re-check in the month is free");
  assert.equal(again.headers.get("x-usage-amount-cents"), "5", "and the error is counted once");

  const acct = (await call("GET", "/v1/account", { key: a.key })).json;
  assert.equal(acct.plan.key, "api");
  assert.equal(acct.usage.errorDocuments, 1);
  assert.deepEqual(
    { v: acct.meter.validations, e: acct.meter.explained, usage: acct.meter.usageCents, over: acct.meter.overageCents, total: acct.meter.totalCents, settlement: acct.meter.settlement },
    { v: 1, e: 1, usage: 5, over: 0, total: 1900, settlement: null },
  );
});

test("a firm plan counts errors too but shows no meter or amount header", async () => {
  const f = await newAccount("Kanzlei F");
  await subscribe(f, "starter");
  const r = await call("POST", "/v1/check", { key: f.key, raw: DEFECTS });
  assert.equal(r.headers.get("x-usage-amount-cents"), null);
  const acct = (await call("GET", "/v1/account", { key: f.key })).json;
  assert.equal(acct.meter, undefined);
  assert.equal(acct.usage.errorDocuments, 1);
  const st = (await call("GET", "/v1/billing/usage", { key: f.key })).json;
  assert.equal(st.metered, false);
  assert.equal((await call("GET", "/v1/billing/usage?period=2026-13", { key: f.key })).status, 400);
});

test("explain=0 is plain validation: the same verdict, billed as a validation unit even with errors", async () => {
  const v = await newAccount("Vendor Plain");
  await subscribe(v, "api");
  const refused = await call("POST", "/v1/check?explain=0&fix=1", { key: v.key, raw: DEFECTS });
  assert.equal(refused.status, 400, "fixes are part of the explained unit");
  assert.equal((await call("GET", "/v1/account", { key: v.key })).json.usage.documents, 0, "a refused request meters nothing");

  const plain = await call("POST", "/v1/check?explain=0&lang=de", { key: v.key, raw: DEFECTS });
  assert.equal(plain.status, 200, JSON.stringify(plain.json));
  assert.equal(plain.json.status, "fail");
  assert.equal(plain.json.explained, false);
  assert.equal(plain.json.lang, "en", "the checker's own English text");
  assert.equal(plain.json.fixes, undefined);
  assert.ok(plain.json.findings.length > 0);
  for (const f of plain.json.findings) assert.deepEqual(f.explanation, { lang: "en", source: "checker", title: f.message, action: f.fix ?? "" });
  assert.equal(plain.headers.get("x-usage-amount-cents"), "1", "0.14 cents, not 4");
  let acct = (await call("GET", "/v1/account", { key: v.key })).json;
  assert.deepEqual([acct.usage.documents, acct.usage.errorDocuments, acct.meter.explained], [1, 0, 0]);

  const explained = await call("POST", "/v1/check?lang=de", { key: v.key, raw: DEFECTS });
  assert.equal(explained.json.explained, undefined);
  assert.deepEqual(
    plain.json.findings.map((f) => [f.rule, f.message]),
    explained.json.findings.map((f) => [f.rule, f.message]),
    "explain=0 never changes the verdict or the findings",
  );
  assert.equal(explained.headers.get("x-usage-documents-charged"), "0", "the file was already counted this month");
  assert.equal(explained.headers.get("x-usage-amount-cents"), "4", "explaining it later makes it the explained unit (which includes its validation), once");
  const replain = await call("POST", "/v1/check?explain=0", { key: v.key, raw: DEFECTS });
  assert.equal(replain.headers.get("x-usage-amount-cents"), "4", "a later plain check does not undo it");

  const c = (await call("POST", "/v1/clients", { key: v.key, body: { name: "Client P" } })).json;
  const batchRefused = await call("POST", `/v1/clients/${c.id}/batches?explain=0&fix=1`, { key: v.key, body: { documents: [{ name: "a.xml", content: UBL }] } });
  assert.equal(batchRefused.status, 400);
  const other = DEFECTS.replace("<cbc:Note>", "<cbc:Note>plain batch ");
  assert.notEqual(other, DEFECTS, "the fixture has a note to vary");
  const batch = await call("POST", `/v1/clients/${c.id}/batches?explain=0`, { key: v.key, body: { documents: [{ name: "ok.xml", content: UBL }, { name: "bad.xml", content: other }] } });
  assert.equal(batch.status, 201, JSON.stringify(batch.json));
  assert.deepEqual(batch.json.results.map((r) => [r.status, r.explained]), [["pass", false], ["fail", false]]);
  acct = (await call("GET", "/v1/account", { key: v.key })).json;
  assert.deepEqual([acct.usage.documents, acct.usage.errorDocuments], [3, 1], "the plain batch's failing file is not an explained unit");
});

test("settling a closed month charges the usage above the minimum once, and only on live api subscriptions", async () => {
  const big = await newAccount("Vendor Big");
  await subscribe(big, "api");
  await seedUsage(big, "2026-11", 10000, 300); // 9,700 x 0.14 + 300 x 4 = 2,558 cents; 658 above the minimum
  const small = await newAccount("Vendor Small");
  await subscribe(small, "api");
  await seedUsage(small, "2026-11", 500, 10); // 69 + 40 = 109 cents: inside the minimum
  const late = await newAccount("Vendor Late");
  await subscribe(late, "api", "past_due");
  await seedUsage(late, "2026-11", 1000, 1000); // 4,000 cents, but Paddle refuses charges on past_due
  const firm = await newAccount("Kanzlei Big");
  await subscribe(firm, "plus");
  await seedUsage(firm, "2026-11", 4000, 4000);

  assert.equal((await call("POST", "/v1/admin/usage/settle", { body: { period: "2026-11" } })).status, 401);
  assert.equal((await call("POST", "/v1/admin/usage/settle", { key: big.key, body: { period: "2026-11" } })).status, 401, "a tenant key is not the admin token");
  const open = await call("POST", "/v1/admin/usage/settle", { key: ADMIN, body: { period: "2026-11" } });
  assert.equal(open.status, 400, "November has not ended");
  assert.equal((await call("POST", "/v1/admin/usage/settle", { key: ADMIN, body: { period: "Nov" } })).status, 400);

  clock = new Date("2026-12-01T00:05:00Z");
  const r = await call("POST", "/v1/admin/usage/settle", { key: ADMIN, body: { period: "2026-11" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const by = Object.fromEntries(r.json.results.map((x) => [x.accountId, x]));
  assert.deepEqual([by[big.id].status, by[big.id].amountMinor], ["charged", 658]);
  assert.deepEqual([by[small.id].status, by[small.id].amountMinor], ["none", 0]);
  assert.deepEqual([by[late.id].status, by[late.id].reason], ["skipped", "subscription is past_due"]);
  assert.equal(by[firm.id], undefined, "firm plans are never metered");

  const again = await call("POST", "/v1/admin/usage/settle", { key: ADMIN, body: { period: "2026-11" } });
  const by2 = Object.fromEntries(again.json.results.map((x) => [x.accountId, x]));
  assert.deepEqual([by2[big.id].status, by2[big.id].reason], ["already", "settled earlier: charged"], "never charged twice");

  const st = (await call("GET", "/v1/billing/usage?period=2026-11", { key: big.key })).json;
  assert.equal(st.metered, true);
  assert.deepEqual([st.usageCents, st.overageCents, st.settlement.status, st.settlement.amountCents], [2558, 658, "charged", 658]);
  const other = (await call("GET", "/v1/billing/usage?period=2026-11", { key: small.key })).json;
  assert.equal(other.usageCents, 109, "each account reads only its own statement");
});
