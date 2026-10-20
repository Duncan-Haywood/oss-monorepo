import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, sameOrigin, limiter } from "./server.mjs";
import { newState, program, addAffiliate } from "./engine.mjs";
import { signPayload, verifySignature } from "./stripe.mjs";

const SECRET = "whsec_test";
const ADMIN = "adminkey123";
const basic = "Basic " + Buffer.from(`admin:${ADMIN}`).toString("base64");

async function boot(over = {}) {
  const state = newState();
  let clock = Date.UTC(2026, 0, 1);
  const cfg = { state, save() {}, webhookSecret: SECRET, adminKey: ADMIN, program: program({ percent: 20, months: 12, holdDays: 30, minPayout: 1000 }), publicUrl: "http://localhost", siteUrl: "https://shop.example", now: () => clock, ...over };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, init = {}) => fetch(base + path, { redirect: "manual", ...init });
  const hook = (event, secret = SECRET) => {
    const body = JSON.stringify(event);
    return call("/webhook/stripe", { method: "POST", body, headers: { "stripe-signature": signPayload(body, secret, Math.floor(clock / 1000)) } });
  };
  return { state, cfg, call, hook, close: () => server.close(), tick: (ms) => { clock += ms; } };
}

const checkout = (code = "ref_ann") => ({ id: "evt_c", type: "checkout.session.completed", created: 1_767_225_600, data: { object: { id: "cs_1", mode: "subscription", customer: "cus_1", client_reference_id: code, customer_details: { email: "buyer@example.com" } } } });
const invoicePaid = (id = "in_1") => ({ id: `evt_${id}`, type: "invoice.paid", created: 1_767_225_600, data: { object: { id, customer: "cus_1", amount_paid: 10000, tax: 0, currency: "usd", payment_intent: `pi_${id}`, charge: `ch_${id}` } } });

test("signature helper accepts its own signature and rejects tampering and stale timestamps", () => {
  const sig = signPayload("{}", SECRET, 1000);
  assert.equal(verifySignature("{}", sig, SECRET, 1000), true);
  assert.equal(verifySignature("{ }", sig, SECRET, 1000), false);
  assert.equal(verifySignature("{}", sig, SECRET, 5000), false);
  assert.equal(verifySignature("{}", sig, "other", 1000), false);
  assert.equal(verifySignature("{}", "", SECRET, 1000), false);
});

test("webhook: bad signature is refused; good one earns a commission", async () => {
  const t = await boot();
  addAffiliate(t.state, { name: "Ann", email: "ann@example.com", code: "ann" }, 0);
  assert.equal((await t.hook(checkout(), "wrong")).status, 400);
  assert.equal((await t.hook(checkout())).status, 200);
  const r = await (await t.hook(invoicePaid())).json();
  assert.match(r.log[0], /commission 20\.00 USD/);
  assert.equal((await t.hook(invoicePaid())).status, 200); // replay is harmless
  assert.equal(Object.keys(t.state.commissions).length, 1);
  t.close();
});

test("admin needs the key, accepts Basic or Bearer, and creates an affiliate with a portal link", async () => {
  const t = await boot();
  assert.equal((await t.call("/admin")).status, 401);
  assert.equal((await t.call("/admin", { headers: { authorization: "Basic " + Buffer.from("x:wrong").toString("base64") } })).status, 401);
  assert.equal((await t.call("/admin", { headers: { authorization: basic } })).status, 200);
  const r = await t.call("/admin/affiliates", { method: "POST", headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify({ name: "Ann", email: "ann@example.com" }) });
  assert.equal(r.status, 201);
  const made = await r.json();
  assert.equal(made.code, "ann");
  const page = await (await t.call(made.portal.replace("http://localhost", ""))).text();
  assert.match(page, /shop\.example\/\?ref=ann/);
  assert.equal((await t.call("/a/not-a-real-token-1234")).status, 404);
  t.close();
});

test("cross-site form posts to the admin are refused", async () => {
  const t = await boot();
  const r = await t.call("/admin/affiliates", { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" }, body: "name=Eve&email=eve@example.com" });
  assert.equal(r.status, 403);
  assert.equal(Object.keys(t.state.affiliates).length, 0);
  assert.equal(sameOrigin({ headers: { host: "a.test", origin: "https://a.test".replace("https", "http") } }), true);
  assert.equal(sameOrigin({ headers: { "sec-fetch-site": "cross-site" } }), false);
  t.close();
});

test("payout flow end to end: due after hold, CSV is formula-safe, mark paid", async () => {
  const t = await boot();
  const a = addAffiliate(t.state, { name: "=cmd|' /C calc'!A0", email: "ann@example.com", code: "ann" }, 0);
  await t.hook(checkout()); await t.hook(invoicePaid());
  await t.call("/admin/payouts", { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: "" });
  assert.equal(Object.keys(t.state.payouts).length, 0); // inside the hold window
  t.tick(31 * 86_400_000);
  await t.call("/admin/payouts", { method: "POST", headers: { authorization: basic, "content-type": "application/json" }, body: "{}" });
  const [p] = Object.values(t.state.payouts);
  assert.equal(p.amount, 2000);
  const csv = await (await t.call("/admin/payouts.csv", { headers: { authorization: basic } })).text();
  assert.match(csv, /20\.00,USD/);
  assert.ok(!/^=/m.test(csv.split("\n")[1].split(",")[1] || ""), "name cell must not start with =");
  assert.match(csv, /'=cmd/);
  const paid = await t.call(`/admin/payouts/${p.id}/paid`, { method: "POST", headers: { authorization: basic, "content-type": "application/json" }, body: JSON.stringify({ reference: "wise-1" }) });
  assert.equal(paid.status, 200);
  assert.equal(t.state.payouts[p.id].status, "paid");
  const j = await (await t.call(`/a/${a.portal}.json`)).json();
  assert.equal(j.paid.usd, 2000);
  t.close();
});

test("portal and admin pages escape hostile names", async () => {
  const t = await boot();
  const a = addAffiliate(t.state, { name: '<img src=x onerror=alert(1)>', email: "ann@example.com", code: "ann" }, 0);
  const page = await (await t.call(`/a/${a.portal}`)).text();
  assert.ok(!page.includes("<img src=x"));
  const admin = await (await t.call("/admin", { headers: { authorization: basic } })).text();
  assert.ok(!admin.includes("<img src=x"));
  t.close();
});

test("tracker script: served, counts clicks for known codes only, sets no cookie itself", async () => {
  const t = await boot();
  addAffiliate(t.state, { name: "Ann", email: "ann@example.com", code: "ann" }, 0);
  const js = await t.call("/r.js");
  assert.match(js.headers.get("content-type"), /javascript/);
  assert.match(await js.text(), /client_reference_id/);
  assert.equal((await t.call("/v1/click?code=ann", { method: "POST" })).status, 204);
  assert.equal((await t.call("/v1/click?code=nobody")).status, 204);
  assert.equal(t.state.clicks.ann, 1);
  assert.equal(t.state.clicks.nobody, undefined);
  t.close();
});

test("public sign-up is off unless enabled, and new affiliates start pending", async () => {
  const off = await boot();
  assert.equal((await off.call("/join")).status, 404);
  off.close();
  const on = await boot({ openSignup: true });
  const r = await on.call("/join", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=Bob&email=bob%40example.com" });
  assert.equal(r.status, 201);
  assert.equal(Object.values(on.state.affiliates)[0].status, "pending");
  await on.hook(checkout("ref_bob"));
  assert.equal(Object.keys(on.state.customers).length, 0); // pending codes do not track
  assert.equal((await on.call("/join", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=Bob&email=bad" })).status, 400);
  on.close();
});

test("limiter allows `max` hits a window then refuses", () => {
  const l = limiter(2, 1000);
  assert.deepEqual([l("a", 0), l("a", 1), l("a", 2), l("b", 2), l("a", 1500)], [true, true, false, true, true]);
});
