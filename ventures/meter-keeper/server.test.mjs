import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, stripeSender } from "./server.mjs";
import { newState, setCustomer } from "./engine.mjs";

const KEY = "api-key-1234567890", ADMIN = "admin-key-1234567890";
const config = {
  meters: { api: { agg: "sum", stripeEvent: "api_calls" } },
  plans: { pro: { base: 1000, lines: [{ meter: "api", model: "flat", unit: 1, included: 10, limit: 100 }] } },
};
async function boot(over = {}) {
  const state = newState(); setCustomer(state, "acme", { plan: "pro", stripeCustomerId: "cus_1" });
  const sent = [];
  const cfg = { state, save() {}, config, apiKey: KEY, adminKey: ADMIN, dryRun: false, send: async (o) => sent.push(o), now: () => Date.UTC(2026, 9, 15, 12), ...over };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (method, path, body, key = KEY) => fetch(base + path, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body == null ? undefined : JSON.stringify(body) });
  return { srv, state, sent, call, base };
}

test("health check needs no key, everything else does", async () => {
  const { srv, base, call } = await boot();
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/v1/usage?customer=acme")).status, 401);
  assert.equal((await call("GET", "/v1/usage?customer=acme", null, ADMIN)).status, 401);
  assert.equal((await call("GET", "/v1/admin/outbox", null, KEY)).status, 401);
  srv.close();
});

test("batch ingest reports each event, and a retry is a duplicate", async () => {
  const { srv, call } = await boot();
  const ev = { id: "e1", customer: "acme", meter: "api", value: 30 };
  const r = await (await call("POST", "/v1/events", { events: [ev, { id: "e2", customer: "acme", meter: "ghost" }] })).json();
  assert.deepEqual(r.results.map((x) => x.status), ["accepted", "rejected"]);
  assert.match(r.results[1].error, /unknown meter/);
  const again = await (await call("POST", "/v1/events", ev)).json();
  assert.equal(again.results[0].status, "duplicate");
  const u = await (await call("GET", "/v1/usage?customer=acme")).json();
  assert.equal(u.usage.api, 30);
  srv.close();
});

test("an all-bad batch is a 400, and bad JSON never crashes the server", async () => {
  const { srv, call, base } = await boot();
  assert.equal((await call("POST", "/v1/events", { events: [{ id: "x", customer: "acme", meter: "ghost" }] })).status, 400);
  const raw = await fetch(base + "/v1/events", { method: "POST", headers: { authorization: `Bearer ${KEY}` }, body: "{nope" });
  assert.equal(raw.status, 400);
  assert.equal((await call("POST", "/v1/events", { events: [] })).status, 400);
  srv.close();
});

test("invoice preview, projection and entitlement check", async () => {
  const { srv, call } = await boot();
  await call("POST", "/v1/events", { id: "e1", customer: "acme", meter: "api", value: 40 });
  const inv = await (await call("GET", "/v1/invoice-preview?customer=acme")).json();
  assert.equal(inv.total, 1000 + 30); // 40 used, 10 included, 30 x 1 cent
  const chk = await (await call("GET", "/v1/check?customer=acme&meter=api&quantity=61")).json();
  assert.deepEqual([chk.allowed, chk.remaining], [false, 60]);
  assert.equal((await (await call("GET", "/v1/check?customer=acme&meter=api&quantity=60")).json()).allowed, true);
  assert.equal((await call("GET", "/v1/invoice-preview?customer=ghost")).status, 404);
  assert.ok((await (await call("GET", "/v1/projection?customer=acme")).json()).projectedTotal >= 1000);
  srv.close();
});

test("admin can register a customer, see the outbox and flush to Stripe", async () => {
  const { srv, call, sent } = await boot();
  assert.equal((await call("PUT", "/v1/admin/customers/beta", { plan: "nope" }, ADMIN)).status, 400);
  const c = await (await call("PUT", "/v1/admin/customers/beta", { plan: "pro", stripeCustomerId: "cus_2" }, ADMIN)).json();
  assert.equal(c.stripeCustomerId, "cus_2");
  await call("POST", "/v1/events", { id: "e9", customer: "beta", meter: "api", value: 2 });
  assert.equal((await (await call("GET", "/v1/admin/outbox", null, ADMIN)).json()).pending, 1);
  const f = await (await call("POST", "/v1/admin/flush", null, ADMIN)).json();
  assert.equal(f.sent, 1); assert.deepEqual([sent[0].event, sent[0].stripeCustomerId, sent[0].value], ["api_calls", "cus_2", 2]);
  const csv = await (await call("GET", "/v1/admin/export.csv", null, ADMIN)).text();
  assert.match(csv, /beta,api,sum,2026-10-01,2/);
  srv.close();
});

test("dry run keeps events local", async () => {
  const { srv, call, sent } = await boot({ dryRun: true });
  await call("POST", "/v1/events", { id: "e1", customer: "acme", meter: "api" });
  const f = await (await call("POST", "/v1/admin/flush", null, ADMIN)).json();
  assert.match(f.skipped, /dry run/); assert.equal(sent.length, 0);
  srv.close();
});

test("the Stripe sender uses meter events with the event id as the identifier", async () => {
  let seen;
  const send = stripeSender({ apiKey: "rk_test_1", fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true }; } });
  await send({ id: "e1", event: "api_calls", stripeCustomerId: "cus_1", value: 5, ts: 1_700_000_000_500 });
  assert.equal(seen.url, "https://api.stripe.com/v1/billing/meter_events");
  assert.equal(seen.init.headers.authorization, "Bearer rk_test_1");
  const p = new URLSearchParams(seen.init.body);
  assert.deepEqual([p.get("event_name"), p.get("identifier"), p.get("timestamp"), p.get("payload[stripe_customer_id]"), p.get("payload[value]")], ["api_calls", "e1", "1700000000", "cus_1", "5"]);
});

test("Stripe 5xx and 429 retry; other 4xx are permanent", async () => {
  const mk = (status) => stripeSender({ apiKey: "k", fetchImpl: async () => ({ ok: false, status, json: async () => ({ error: { message: "nope" } }) }) });
  for (const [status, retry] of [[500, true], [429, true], [400, false], [401, false]]) {
    await assert.rejects(mk(status)({ id: "a", event: "e", stripeCustomerId: "c", value: 1, ts: 1000 }), (e) => e.retry === retry && /nope/.test(e.message));
  }
});
