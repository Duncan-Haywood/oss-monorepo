import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, limiter } from "./server.mjs";
import { newState } from "./store.mjs";
import { generateKeyPair, verifyLicense } from "./token.mjs";
import { signPayload } from "./stripe.mjs";

async function boot(o = {}) {
  const state = newState(); state.keys = await generateKeyPair();
  let t = Date.UTC(2026, 0, 1); const sent = [];
  const cfg = {
    state, save() {}, adminKey: "adm", webhookSecret: "whsec", plans: { price_pro: { product: "app", plan: "pro", machines: 1, days: null } },
    stripe: { lineItems: async () => [{ priceId: "price_pro", quantity: 1 }], subscription: async () => ({}) },
    sendEmail: async (m) => sent.push(m), dryRun: false, now: () => t, ...o,
  };
  const srv = http.createServer(handler(cfg)); await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, { method = "POST", body, headers = {} } = {}) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; } return { status: r.status, json };
  };
  return { cfg, call, sent, tick: (ms) => { t += ms; }, close: () => srv.close() };
}
const adm = { authorization: "Bearer adm" };

test("admin issues a license; the app activates, validates, hits the limit, deactivates", async () => {
  const s = await boot();
  const made = await s.call("/v1/licenses", { body: { product: "app", email: "a@b.co", machines: 1 }, headers: adm });
  assert.equal(made.status, 201);
  const tok = made.json.token;
  const pub = (await s.call("/v1/pubkey", { method: "GET" })).json.publicKey;
  assert.equal((await verifyLicense(pub, tok, { now: s.cfg.now() })).valid, true);
  const a = await s.call("/v1/activate", { body: { license: tok, fingerprint: "machine-aaaa", name: "Mac" } });
  assert.equal(a.json.ok, true);
  assert.equal((await s.call("/v1/validate", { body: { license: tok, fingerprint: "machine-aaaa" } })).json.ok, true);
  assert.equal((await s.call("/v1/validate", { body: { license: tok, fingerprint: "machine-bbbb" } })).json.reason, "not-activated");
  assert.equal((await s.call("/v1/activate", { body: { license: tok, fingerprint: "machine-bbbb" } })).json.reason, "machine-limit");
  assert.equal((await s.call("/v1/deactivate", { body: { license: tok, fingerprint: "machine-aaaa" } })).json.ok, true);
  assert.equal((await s.call("/v1/activate", { body: { license: tok, fingerprint: "machine-bbbb" } })).json.ok, true);
  s.close();
});

test("revoking blocks the next validation; forged tokens and bad JSON are refused", async () => {
  const s = await boot();
  const { json } = await s.call("/v1/licenses", { body: { product: "app", email: "a@b.co" }, headers: adm });
  await s.call("/v1/activate", { body: { license: json.token, fingerprint: "machine-aaaa" } });
  assert.equal((await s.call(`/v1/licenses/${json.id}/revoke`, { headers: adm })).json.ok, true);
  assert.equal((await s.call("/v1/validate", { body: { license: json.token, fingerprint: "machine-aaaa" } })).json.reason, "revoked");
  const other = await generateKeyPair();
  const forged = (await import("./token.mjs")).signLicense(other.privateKey, { id: json.id, product: "app" });
  assert.equal((await s.call("/v1/activate", { body: { license: await forged, fingerprint: "machine-aaaa" } })).status, 400);
  assert.equal((await s.call("/v1/activate", { body: "{not json" })).status, 400);
  s.close();
});

test("an expired token can be refreshed while the subscription is paid, then carries the new expiry", async () => {
  const s = await boot();
  const t0 = s.cfg.now();
  const { json } = await s.call("/v1/licenses", { body: { product: "app", email: "a@b.co", expiresAt: t0 + 1000 }, headers: adm });
  await s.call("/v1/activate", { body: { license: json.token, fingerprint: "machine-aaaa" } });
  s.cfg.state.licenses[json.id].exp += 86400 * 30;       // a renewal extended it server-side
  s.tick(5000);                                            // the cached token has now expired
  const r = await s.call("/v1/validate", { body: { license: json.token, fingerprint: "machine-aaaa" } });
  assert.equal(r.json.ok, true);
  const pub = s.cfg.state.keys.publicKey;
  assert.equal((await verifyLicense(pub, r.json.token, { now: s.cfg.now() })).valid, true);
  s.close();
});

test("admin routes need the key; webhook needs a valid Stripe signature", async () => {
  const s = await boot();
  assert.equal((await s.call("/v1/licenses", { method: "GET" })).status, 401);
  assert.equal((await s.call("/v1/summary", { method: "GET", headers: { authorization: "Bearer wrong" } })).status, 401);
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", mode: "payment", payment_status: "paid", customer_details: { email: "z@y.co" }, payment_intent: "pi_1" } } });
  assert.equal((await s.call("/webhook/stripe", { body, headers: { "stripe-signature": "t=1,v1=00" } })).status, 400);
  const sig = signPayload(body, "whsec", Math.floor(s.cfg.now() / 1000));
  const ok = await s.call("/webhook/stripe", { body, headers: { "stripe-signature": sig } });
  assert.equal(ok.status, 200); assert.equal(s.sent.length, 1);
  assert.equal((await s.call("/v1/summary", { method: "GET", headers: adm })).json.licenses, 1);
  s.close();
});

test("the public endpoints are rate limited per address", async () => {
  const l = limiter(2, 1000);
  assert.deepEqual([l("a", 0), l("a", 1), l("a", 2), l("b", 3), l("a", 1500)], [true, true, false, true, true]);
});
