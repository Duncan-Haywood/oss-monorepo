import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, runAlerts, webhookSender } from "./server.mjs";
import { signPayload } from "./stripe.mjs";
import * as E from "./engine.mjs";
import { createRadar } from "./sdk.mjs";

const KEY = "api-key-1234567890", ADMIN = "admin-key-1234567890", WH = "whsec_test";
const NOW = Date.UTC(2026, 9, 15, 12);
async function boot(state = E.newState()) {
  const cfg = { state, save() {}, apiKey: KEY, adminKey: ADMIN, stripeSecret: WH, now: () => NOW, sdk: "// sdk" };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (method, path, body, key = KEY) => fetch(base + path, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body == null ? undefined : JSON.stringify(body) });
  return { srv, state, call, base };
}
const seeded = () => { const s = E.newState(); s.accounts = E.syntheticAccounts(NOW); return s; };

test("health needs no key, API routes do, and admin is a separate key", async () => {
  const { srv, base, call } = await boot();
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/v1/at-risk")).status, 401);
  assert.equal((await call("GET", "/v1/at-risk", null, ADMIN)).status, 401);
  assert.equal((await call("POST", "/v1/admin/retrain", null, KEY)).status, 401);
  assert.equal((await call("POST", "/v1/admin/retrain", null, ADMIN)).status, 200);
  srv.close();
});

test("events are idempotent and a bad one is rejected without losing the good ones", async () => {
  const { srv, call, state } = await boot();
  const body = { events: [{ id: "e1", account: "a", type: "login", timestamp: NOW - E.DAY }, { id: "e2", account: "!!" }] };
  const r = await call("POST", "/v1/events", body); assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).results.map((x) => x.status), ["accepted", "rejected"]);
  const again = await call("POST", "/v1/events", { id: "e1", account: "a", timestamp: NOW - E.DAY });
  assert.equal((await again.json()).results[0].status, "duplicate");
  assert.equal(state.accounts.a.events.length, 1);
  assert.equal((await call("POST", "/v1/events", { events: [] })).status, 400);
  assert.equal((await call("POST", "/v1/events", { id: "z", account: "!!" })).status, 400);
  srv.close();
});

test("at-risk, per-account and model endpoints answer from the trained model", async () => {
  const { srv, call } = await boot(seeded());
  const risk = await (await call("GET", "/v1/at-risk?limit=5")).json();
  assert.equal(risk.mode, "model"); assert.ok(risk.accounts.length > 0 && risk.accounts.length <= 5);
  assert.ok(risk.accounts[0].risk >= risk.accounts[risk.accounts.length - 1].risk);
  const one = await (await call("GET", `/v1/accounts/${risk.accounts[0].id}`)).json();
  assert.equal(one.id, risk.accounts[0].id); assert.ok(Array.isArray(one.reasons));
  assert.equal((await call("GET", "/v1/accounts/nobody")).status, 404);
  const model = await (await call("GET", "/v1/model")).json();
  assert.ok(model.validation.auc > 0.6); assert.ok("daysSilent" in model.weights);
  srv.close();
});

test("a Stripe subscription.deleted webhook marks the account churned; bad signatures are refused", async () => {
  const { srv, base, state } = await boot();
  E.ingest(state, { id: "e1", account: "cus_9", timestamp: NOW - 20 * E.DAY }, NOW);
  const payload = JSON.stringify({ type: "customer.subscription.deleted", data: { object: { customer: "cus_9", ended_at: Math.floor(NOW / 1000) - 3600 } } });
  const post = (sig) => fetch(base + "/stripe/webhook", { method: "POST", headers: { "stripe-signature": sig }, body: payload });
  assert.equal((await post("t=1,v1=00")).status, 400);
  assert.equal(state.accounts.cus_9.churnedAt, null);
  assert.equal((await post(signPayload(payload, WH, Math.floor(NOW / 1000)))).status, 200);
  assert.equal(state.accounts.cus_9.churnedAt, NOW - 3_600_000);
  const reborn = JSON.stringify({ type: "customer.subscription.created", data: { object: { customer: "cus_9", metadata: {} } } });
  await fetch(base + "/stripe/webhook", { method: "POST", headers: { "stripe-signature": signPayload(reborn, WH, Math.floor(NOW / 1000)) }, body: reborn });
  assert.equal(state.accounts.cus_9.churnedAt, null);
  srv.close();
});

test("alerts fire once per account, sign the body, and retry after a failure", async () => {
  const state = seeded(), seen = [];
  const first = await runAlerts(state, async (a) => { seen.push(a); }, NOW);
  assert.ok(first.length > 0 && seen[0].type === "account.at_risk");
  assert.deepEqual(await runAlerts(state, async () => { throw new Error("down"); }, NOW), []); // already alerted
  const s2 = seeded(); let n = 0;
  assert.deepEqual(await runAlerts(s2, async () => { n++; throw new Error("down"); }, NOW), []);
  assert.equal(n, 1); assert.deepEqual(s2.alerted, {}); // not marked, so the next pass retries
  let hdr; const send = webhookSender({ url: "http://x", secret: "s", fetchImpl: async (u, o) => { hdr = o.headers; return { ok: true }; } });
  await send({ a: 1 }); assert.match(hdr["x-radar-signature"], /^sha256=[0-9a-f]{64}$/);
});

test("the sdk posts events with a bearer key, never throws, and reports failures", async () => {
  const calls = [], errors = [];
  const radar = createRadar({ url: "http://r/", key: "k", onError: (e) => errors.push(e), fetchImpl: async (u, o) => { calls.push([u, o]); return { ok: false, status: 500 }; } });
  await radar.track("acct_1", "export");
  assert.equal(calls[0][0], "http://r/v1/events"); assert.equal(calls[0][1].headers.authorization, "Bearer k");
  assert.equal(JSON.parse(calls[0][1].body).account, "acct_1"); assert.equal(errors.length, 1);
  const boom = createRadar({ url: "http://r", key: "k", fetchImpl: async () => { throw new Error("net"); } });
  await boom.track("a", "b"); // must not reject
});
