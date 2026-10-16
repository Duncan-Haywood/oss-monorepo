import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";
import { handler, runAlerts, webhookSender } from "./server.mjs";
import * as E from "./engine.mjs";
import { createKeeper } from "./sdk.mjs";

const KEY = "api-key-1234567890", ADMIN = "admin-key-1234567890";
const NOW = Date.UTC(2026, 9, 15, 12);
async function boot(state = E.newState()) {
  const cfg = { state, save() {}, apiKey: KEY, adminKey: ADMIN, now: () => NOW, sdk: "// sdk" };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (method, path, body, key = KEY) => fetch(base + path, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body == null ? undefined : JSON.stringify(body) });
  return { srv, state, call, base };
}

test("health needs no key, API routes do, and admin is a separate key", async () => {
  const { srv, base, call } = await boot();
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/v1/pipeline")).status, 401);
  assert.equal((await call("GET", "/v1/pipeline", null, ADMIN)).status, 401);
  assert.equal((await call("POST", "/v1/admin/retrain", null, KEY)).status, 401);
  assert.equal((await call("POST", "/v1/admin/retrain", null, ADMIN)).status, 200);
  srv.close();
});

test("deals upsert in batches, a bad one is rejected without losing the good ones", async () => {
  const { srv, call, state } = await boot();
  const r = await call("POST", "/v1/deals", { deals: [{ id: "a", name: "Acme", amount: 900, stage: "qualified" }, { id: "b", stage: "nope" }] });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).results.map((x) => x.status), ["ok", "rejected"]);
  assert.equal(state.deals.a.amount, 900);
  assert.equal((await call("POST", "/v1/deals", { deals: [] })).status, 400);
  assert.equal((await call("POST", "/v1/deals", { id: "z", stage: "nope" })).status, 400);
  assert.equal((await call("POST", "/v1/deals", "not json")).status, 400);
  srv.close();
});

test("activity, lookup and delete work, and unknown deals are 404", async () => {
  const { srv, call, state } = await boot();
  await call("POST", "/v1/deals", { id: "a", amount: 10, createdAt: NOW - 30 * E.DAY, nextStep: "call" });
  assert.equal((await call("POST", "/v1/deals/a/activity", { at: NOW - E.DAY })).status, 200);
  assert.ok(state.deals.a.touches.includes(NOW - E.DAY));
  const one = await (await call("GET", "/v1/deals/a")).json();
  assert.equal(one.id, "a"); assert.ok(one.probability > 0);
  assert.equal((await call("POST", "/v1/deals/nope/activity", {})).status, 404);
  assert.equal((await call("GET", "/v1/deals/nope")).status, 404);
  assert.equal((await call("DELETE", "/v1/deals/a")).status, 200);
  assert.equal(state.deals.a, undefined);
  srv.close();
});

test("pipeline, forecast and model come back with ranges, reasons and an honest validation", async () => {
  const seeded = E.newState(); Object.assign(seeded, E.syntheticState(NOW));
  const { srv, call } = await boot(seeded);
  const p = await (await call("GET", "/v1/pipeline")).json();
  assert.ok(p.deals.length > 0 && p.fixFirst.length <= 10);
  assert.ok(p.deals.every((d) => d.probability >= 0 && d.probability <= 1 && Array.isArray(d.reasons)));
  const f = await (await call("GET", `/v1/forecast?to=${NOW + 200 * E.DAY}&target=100000`)).json();
  assert.ok(f.low <= f.weighted && f.weighted <= f.high); assert.ok("gap" in f && "coverage" in f);
  assert.equal((await call("GET", "/v1/forecast?from=garbage")).status, 400);
  assert.equal((await call("GET", "/v1/forecast?target=abc")).status, 400);
  const m = await (await call("GET", "/v1/model")).json();
  assert.equal(m.mode, "learned"); assert.ok(m.validation.skill > 0.1); assert.equal(m.stages.length, 4);
  srv.close();
});

test("alerts are signed, sent once per flag, and a failed send is retried next pass", async () => {
  const state = E.newState(); E.upsertDeal(state, { id: "x", stage: "lead", createdAt: NOW - 60 * E.DAY, amount: 5 }, NOW);
  const sent = [], send = webhookSender({ url: "https://hook.example/x", secret: "s3cret", fetchImpl: async (url, init) => { sent.push({ url, init }); return { ok: true }; } });
  const first = await runAlerts(state, send, NOW);
  assert.ok(first.includes("x|stale"));
  assert.equal(sent[0].init.headers["x-keeper-signature"], `sha256=${createHmac("sha256", "s3cret").update(sent[0].init.body).digest("hex")}`);
  assert.equal(JSON.parse(sent[0].init.body).type, "deal.stale");
  assert.deepEqual(await runAlerts(state, send, NOW + 1000), []);
  const s2 = E.newState(); E.upsertDeal(s2, { id: "x", stage: "lead", createdAt: NOW - 60 * E.DAY, amount: 5 }, NOW);
  assert.deepEqual(await runAlerts(s2, async () => { throw new Error("down"); }, NOW), []);
  assert.deepEqual(s2.alerted, {});
});

test("the SDK upserts, logs activity, reads the forecast and never throws", async () => {
  const { srv, base, state } = await boot();
  const errors = [], keeper = createKeeper({ url: base, key: KEY, onError: (e) => errors.push(e) });
  await keeper.upsert({ id: "s1", amount: 100, stage: "proposal" }); assert.ok(state.deals.s1);
  await keeper.activity("s1", NOW - 1000); assert.ok(state.deals.s1.touches.includes(NOW - 1000));
  assert.ok((await keeper.pipeline()).deals.length === 1);
  assert.ok("weighted" in (await keeper.forecast({ target: 5 })));
  await createKeeper({ url: base, key: "wrong-key-wrong-key", onError: (e) => errors.push(e) }).upsert({ id: "x" });
  assert.equal(errors.length, 1);
  await createKeeper({ url: "http://127.0.0.1:1", key: KEY, onError: (e) => errors.push(e) }).upsert({ id: "x" });
  assert.equal(errors.length, 2);
  srv.close();
});
