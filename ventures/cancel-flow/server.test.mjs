import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, mintToken, readToken, newState } from "./server.mjs";
import { signPayload } from "./stripe.mjs";

const NOW = Date.UTC(2026, 9, 15, 12);
const SUB = { id: "sub_1", customer: "cus_1", status: "active", cancelAtPeriodEnd: false, amount: 4900, currency: "usd", interval: "month", intervalCount: 1, periodEnd: Date.UTC(2026, 10, 1) };

async function boot(over = {}, sub = SUB) {
  const calls = [];
  const stripe = {
    getSubscription: async (id) => { if (id !== "sub_1") throw Object.assign(new Error("nope"), { status: 404 }); return { ...sub }; },
    ensureCoupon: async (o) => { calls.push(["coupon", o.percent]); return `c${o.percent}`; },
    applyDiscount: async (s, c, k) => calls.push(["discount", s, c, k]),
    pause: async (s, at, k) => calls.push(["pause", s, at, k]),
    cancelAtPeriodEnd: async (s, f, c, k) => calls.push(["cancel", s, f, c, k]),
  };
  const saves = [];
  const cfg = { state: newState(), save: () => saves.push(1), stripe, webhookSecret: "whsec", linkSecret: "ls", adminKey: "adm", publicUrl: "https://c.example", policy: {}, dryRun: false, company: "Acme", now: () => NOW, ...over };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = mintToken("ls", { sub: "sub_1", customer: "cus_1", now: NOW });
  const post = (step, body) => fetch(`${base}/c/${token}/${step}`, { method: "POST", body: JSON.stringify(body || {}) });
  return { cfg, base, calls, saves, token, post, close: () => server.close() };
}

test("tokens: tampered, expired and malformed are rejected", () => {
  const t = mintToken("ls", { sub: "sub_1", customer: "cus_1", now: NOW, ttlMs: 1000 });
  assert.equal(readToken("ls", t, NOW).s, "sub_1");
  assert.equal(readToken("other", t, NOW), null);
  assert.equal(readToken("ls", t, NOW + 2000), null);
  assert.equal(readToken("ls", t.slice(0, -2) + "xx", NOW), null);
  assert.equal(readToken("ls", "nonsense", NOW), null);
});

test("the cancel page renders with a strict CSP and no-store, and an expired link is 410", async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/c/${s.token}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.match(await r.text(), /Sorry to see you go/);
  assert.equal(Object.keys(s.cfg.state.sessions).length, 1);
  await fetch(`${s.base}/c/${s.token}`);
  assert.equal(Object.keys(s.cfg.state.sessions).length, 1, "reloading does not start a second session");
  assert.equal((await fetch(`${s.base}/c/bad.token`)).status, 410);
  s.close();
});

test("price objection → discount offer → accept applies the coupon once with an idempotency key", async () => {
  const s = await boot();
  await fetch(`${s.base}/c/${s.token}`);
  const a = await (await s.post("answer", { reason: "too_expensive", comment: "pricey" })).json();
  assert.equal(a.action, "offer"); assert.match(a.text, /30% off for 3 months/);
  const ok = await s.post("accept");
  assert.equal(ok.status, 200);
  assert.deepEqual(s.calls.map((c) => c[0]), ["coupon", "discount"]);
  assert.match(s.calls[1][3], /^cf-.*-accept$/);
  assert.equal((await s.post("accept")).status, 409, "a second accept is refused");
  assert.equal(s.calls.length, 2);
  const sum = await (await fetch(`${s.base}/v1/summary`, { headers: { authorization: "Bearer adm" } })).json();
  assert.equal(sum.saved, 1); assert.equal(sum.saveRate, 100);
  s.close();
});

test("declining the offer cancels at period end with Stripe's feedback code and the comment", async () => {
  const s = await boot();
  await fetch(`${s.base}/c/${s.token}`);
  await s.post("answer", { reason: "not_using", comment: "too busy" });
  const r = await (await s.post("cancel")).json();
  assert.match(r.text, /full access until 2026-11-01/);
  assert.deepEqual(s.calls[0], ["cancel", "sub_1", "unused", "too busy", `cf-${Object.keys(s.cfg.state.sessions)[0]}-cancel`]);
  s.close();
});

test("a reason with no offer goes straight to confirm; cancel before answering is refused", async () => {
  const s = await boot();
  await fetch(`${s.base}/c/${s.token}`);
  assert.equal((await s.post("cancel")).status, 409);
  const a = await (await s.post("answer", { reason: "missing_feature" })).json();
  assert.equal(a.action, "confirm");
  assert.equal((await s.post("cancel")).status, 200);
  s.close();
});

test("DRY_RUN records the whole flow and touches Stripe not at all", async () => {
  const s = await boot({ dryRun: true });
  await fetch(`${s.base}/c/${s.token}`);
  await s.post("answer", { reason: "too_expensive" });
  const r = await (await s.post("accept")).json();
  assert.equal(r.dryRun, true);
  assert.equal(s.calls.length, 0);
  assert.equal(Object.values(s.cfg.state.sessions)[0].outcome, "saved");
  assert.match(await (await fetch(`${s.base}/c/${s.token}`)).text(), /Test mode/);
  s.close();
});

test("a token for someone else's subscription is refused", async () => {
  const s = await boot({}, { ...SUB, customer: "cus_other" });
  await fetch(`${s.base}/c/${s.token}`);
  assert.equal((await s.post("answer", { reason: "other" })).status, 403);
  assert.equal(s.calls.length, 0);
  s.close();
});

test("second save inside the cooldown window falls through to confirm", async () => {
  const s = await boot();
  s.cfg.state.sessions.old = { id: "old", sub: "sub_1", customer: "cus_1", at: NOW - 86400000, outcome: "saved", offer: { type: "pause" } };
  await fetch(`${s.base}/c/${s.token}`);
  assert.equal((await (await s.post("answer", { reason: "too_expensive" })).json()).action, "confirm");
  s.close();
});

test("an already-canceling subscription cannot be offered or re-canceled", async () => {
  const s = await boot({}, { ...SUB, cancelAtPeriodEnd: true });
  await fetch(`${s.base}/c/${s.token}`);
  assert.equal((await s.post("answer", { reason: "too_expensive" })).status, 409);
  s.close();
});

test("admin: links need the key, mint a working URL, and refuse junk ids", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/v1/summary`)).status, 401);
  const post = (body) => fetch(`${s.base}/v1/links`, { method: "POST", headers: { authorization: "Bearer adm" }, body: JSON.stringify(body) });
  assert.equal((await post({ subscription: "../x" })).status, 400);
  const { url } = await (await post({ subscription: "sub_1" })).json();
  assert.match(url, /^https:\/\/c\.example\/c\//);
  const path = url.replace("https://c.example", "");
  assert.equal((await fetch(`${s.base}${path}`)).status, 200);
  s.close();
});

test("webhook: bad signature refused; subscription.deleted marks churn; replay ignored", async () => {
  const s = await boot();
  await fetch(`${s.base}/c/${s.token}`);
  const body = JSON.stringify({ id: "evt_1", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } });
  const h = { "stripe-signature": signPayload(body, "whsec", Math.floor(NOW / 1000)) };
  assert.equal((await fetch(`${s.base}/webhook/stripe`, { method: "POST", body, headers: { "stripe-signature": "t=1,v1=00" } })).status, 400);
  assert.deepEqual(await (await fetch(`${s.base}/webhook/stripe`, { method: "POST", body, headers: h })).json(), { received: "customer.subscription.deleted", marked: 1 });
  assert.deepEqual(await (await fetch(`${s.base}/webhook/stripe`, { method: "POST", body, headers: h })).json(), { ignored: "duplicate" });
  s.close();
});

test("/admin serves a keyless dashboard page; the data routes stay behind the admin key", async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/admin`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(r.headers.get("content-security-policy"), /connect-src 'self'/);
  const html = await r.text();
  assert.match(html, /Cancel flow results/);
  assert.doesNotMatch(html, /adm/, "the page must not contain the admin key");
  assert.doesNotMatch(html, /innerHTML/, "dynamic strings go through textContent");
  assert.equal((await fetch(`${s.base}/v1/summary`)).status, 401);
  assert.equal((await fetch(`${s.base}/v1/summary`, { headers: { authorization: "Bearer adm" } })).status, 200);
  s.close();
});
