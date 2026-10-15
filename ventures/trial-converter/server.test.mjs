import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, linkToken, customerFromToken } from "./server.mjs";
import { signPayload } from "./stripe.mjs";
import { newState } from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 13, 12);
async function boot(over = {}) {
  const saves = [];
  const cfg = {
    state: newState(), save: () => saves.push(1), webhookSecret: "whsec_t", linkSecret: "link-secret", adminKey: "adm", publicUrl: "https://t.example",
    policy: {}, dryRun: true, now: () => NOW,
    stripe: { hasCardFor: async () => false, portalUrl: async (c, r) => `https://billing.stripe.com/${c}?r=${encodeURIComponent(r)}` },
    ...over,
  };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { cfg, base: `http://127.0.0.1:${server.address().port}`, saves, close: () => server.close() };
}
const evt = JSON.stringify({ id: "evt_1", type: "customer.subscription.created", data: { object: { id: "sub_1", customer: "cus_1", status: "trialing", trial_start: NOW / 1000, trial_end: (NOW + 14 * 86400000) / 1000, items: { data: [{ price: { unit_amount: 1900, currency: "usd", recurring: { interval: "month" } } }] } } } });
const signed = (body = evt) => ({ "stripe-signature": signPayload(body, "whsec_t", Math.floor(NOW / 1000)) });

test("healthz is open; unknown paths 404", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/healthz`)).status, 200);
  assert.equal((await fetch(`${s.base}/nope`)).status, 404);
  s.close();
});

test("webhook: bad signature changes nothing; good signature opens a no-card case once", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: evt, headers: { "stripe-signature": "t=1,v1=00" } })).status, 400);
  assert.equal(Object.keys(s.cfg.state.cases).length, 0);
  const ok = await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: evt, headers: signed() });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).mode, "nocard");
  assert.deepEqual(await (await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: evt, headers: signed() })).json(), { ignored: "duplicate" });
  assert.equal(s.saves.length, 2);
  s.close();
});

test("a failing card lookup falls back to the event's own payment method", async () => {
  const s = await boot({ stripe: { hasCardFor: async () => { throw new Error("stripe down"); } } });
  const body = evt.replace('"status":"trialing"', '"status":"trialing","default_payment_method":"pm_1"');
  const r = await fetch(`${s.base}/webhook/stripe`, { method: "POST", body, headers: signed(body) });
  assert.equal((await r.json()).mode, "card");
  s.close();
});

test("admin endpoints need the bearer key and never list customer emails", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/v1/summary`)).status, 401);
  assert.equal((await fetch(`${s.base}/v1/summary`, { headers: { authorization: "Bearer wrong" } })).status, 401);
  await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: evt, headers: signed() });
  s.cfg.state.cases.sub_1.email = "secret@example.com";
  const h = { authorization: "Bearer adm" };
  assert.equal((await (await fetch(`${s.base}/v1/summary`, { headers: h })).json()).open, 1);
  const cases = await (await fetch(`${s.base}/v1/cases`, { headers: h })).text();
  assert.doesNotMatch(cases, /secret@example\.com/);
  const page = await fetch(`${s.base}/admin`);
  assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
  s.close();
});

test("manage links verify, redirect to a fresh portal session, and reject tampering", async () => {
  const s = await boot();
  const tok = linkToken("link-secret", "cus_9");
  assert.equal(customerFromToken("link-secret", tok), "cus_9");
  assert.equal(customerFromToken("other", tok), null);
  const r = await fetch(`${s.base}/manage/${tok}`, { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.match(r.headers.get("location"), /billing\.stripe\.com\/cus_9/);
  assert.equal((await fetch(`${s.base}/manage/${tok}x`, { redirect: "manual" })).status, 404);
  s.close();
});
