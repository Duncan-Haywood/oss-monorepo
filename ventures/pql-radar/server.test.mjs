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
  assert.equal((await fetch(base + "/v1/hot-leads")).status, 401);
  assert.equal((await call("GET", "/v1/hot-leads", null, ADMIN)).status, 401);
  assert.equal((await call("POST", "/v1/admin/retrain", null, KEY)).status, 401);
  assert.equal((await call("POST", "/v1/admin/retrain", null, ADMIN)).status, 200);
  srv.close();
});

test("events are idempotent and a bad one is rejected without losing the good ones", async () => {
  const { srv, call, state } = await boot();
  const r = await call("POST", "/v1/events", { events: [{ id: "e1", account: "a", type: "login", timestamp: NOW - E.DAY }, { id: "e2", account: "!!" }] });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).results.map((x) => x.status), ["accepted", "rejected"]);
  assert.equal((await (await call("POST", "/v1/events", { id: "e1", account: "a", timestamp: NOW - E.DAY })).json()).results[0].status, "duplicate");
  assert.equal(state.accounts.a.events.length, 1);
  assert.equal((await call("POST", "/v1/events", { events: [] })).status, 400);
  assert.equal((await call("POST", "/v1/events", { id: "z", account: "!!" })).status, 400);
  srv.close();
});

test("hot leads come back ranked, with reasons, and the model endpoint reports validation", async () => {
  const { srv, call } = await boot(seeded());
  const hot = await (await call("GET", "/v1/hot-leads?limit=5")).json();
  assert.equal(hot.mode, "model"); assert.ok(hot.leads.length > 0 && hot.leads.length <= 5);
  for (let i = 1; i < hot.leads.length; i++) assert.ok(hot.leads[i - 1].score >= hot.leads[i].score);
  assert.ok(hot.leads.every((l) => l.score >= hot.threshold));
  const model = await (await call("GET", "/v1/model")).json();
  assert.ok(model.validation.auc > 0.7); assert.ok("logEvents" in model.weights);
  const one = await (await call("GET", `/v1/leads/${hot.leads[0].id}`)).json();
  assert.equal(one.id, hot.leads[0].id);
  assert.equal((await call("GET", "/v1/leads/nobody")).status, 404);
  srv.close();
});

test("conversions can be recorded and undone, and a converted lead stops being listed", async () => {
  const { srv, call, state } = await boot(seeded());
  const top = (await (await call("GET", "/v1/hot-leads?limit=1")).json()).leads[0].id;
  assert.equal((await call("POST", "/v1/conversions", { account: top, convertedAt: NOW })).status, 200);
  assert.ok(state.accounts[top].convertedAt);
  assert.equal((await (await call("GET", `/v1/leads/${top}`)).json()).converted, true);
  await call("POST", "/v1/conversions", { account: top, converted: false });
  assert.equal(state.accounts[top].convertedAt, null);
  assert.equal((await call("POST", "/v1/conversions", { account: "bad id" })).status, 400);
  srv.close();
});

test("the Stripe webhook records a paid subscription for a known signup and nothing else", async () => {
  const s = E.newState(); E.ingest(s, { id: "e1", account: "acme", timestamp: NOW - 9 * E.DAY }, NOW);
  const { srv, base, state } = await boot(s);
  const post = (body, secret = WH, t = Math.floor(NOW / 1000)) => { const raw = JSON.stringify(body); return fetch(base + "/stripe/webhook", { method: "POST", headers: { "stripe-signature": signPayload(raw, secret, t) }, body: raw }); };
  const sub = (o) => ({ type: "customer.subscription.created", data: { object: { metadata: { account_id: "acme" }, created: Math.floor(NOW / 1000) - 3600, ...o } } });
  assert.equal((await post(sub({}), "wrong")).status, 400);
  assert.equal((await post(sub({ status: "trialing" }))).status, 200);
  assert.equal(state.accounts.acme.convertedAt, null); // an uncharged trial is not a conversion
  assert.equal((await post({ ...sub({ status: "active", metadata: { account_id: "stranger" } }) })).status, 200);
  assert.equal(state.accounts.stranger, undefined);
  assert.equal((await post(sub({ status: "active" }))).status, 200);
  assert.equal(state.accounts.acme.convertedAt, (Math.floor(NOW / 1000) - 3600) * 1000);
  srv.close();
});

test("alerts are signed, sent once per lead, and a failed send is retried next pass", async () => {
  const state = seeded(), sent = [];
  const send = webhookSender({ url: "https://hook.example/x", secret: "s3cret", fetchImpl: async (url, init) => { sent.push({ url, init }); return { ok: true }; } });
  const first = await runAlerts(state, send, NOW);
  assert.ok(first.length > 0);
  const { createHmac } = await import("node:crypto");
  assert.equal(sent[0].init.headers["x-radar-signature"], `sha256=${createHmac("sha256", "s3cret").update(sent[0].init.body).digest("hex")}`);
  assert.equal(JSON.parse(sent[0].init.body).type, "lead.hot");
  assert.deepEqual(await runAlerts(state, send, NOW + 1000), []);
  const s2 = seeded(), flaky = async () => { throw new Error("down"); };
  assert.deepEqual(await runAlerts(s2, flaky, NOW), []);
  assert.deepEqual(s2.alerted, {});
});

test("the SDK tracks, never throws, and reads hot leads", async () => {
  const { srv, base, state } = await boot(seeded());
  const errors = [], radar = createRadar({ url: base, key: KEY, onError: (e) => errors.push(e) });
  await radar.track("fresh", "login"); assert.ok(state.accounts.fresh);
  assert.ok((await radar.hotLeads(3)).leads.length <= 3);
  await radar.converted("fresh", NOW); assert.equal(state.accounts.fresh.convertedAt, NOW);
  await createRadar({ url: base, key: "wrong-key-wrong-key", onError: (e) => errors.push(e) }).track("x", "y");
  assert.equal(errors.length, 1);
  await createRadar({ url: "http://127.0.0.1:1", key: KEY, onError: (e) => errors.push(e) }).track("x", "y");
  assert.equal(errors.length, 2);
  srv.close();
});
