import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, newState, dashToken, readDashToken, landingTarget } from "./server.mjs";
import { signPayload } from "./stripe.mjs";

const NOW = Date.UTC(2026, 9, 15, 12);
const DAY = 86400000;
let evn = 0;

async function boot(over = {}) {
  const saves = [];
  const cfg = { state: newState(), save: () => saves.push(1), stripe: null, webhookSecret: "whsec", linkSecret: "ls", adminKey: "adm", publicUrl: "https://p.example", landingUrl: "https://example.com/pricing", landingHosts: ["app.example.com"], policy: { rate: 0.2, months: 12, holdDays: 30, minPayoutCents: 1000 }, openSignup: true, company: "Acme", now: () => NOW, ...over };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = (path, body, method) => fetch(base + path, { method: method || (body ? "POST" : "GET"), headers: { authorization: "Bearer adm" }, body: body ? JSON.stringify(body) : undefined });
  const hook = (type, object, t = Math.floor(NOW / 1000)) => {
    const raw = JSON.stringify({ id: `evt_${++evn}`, type, data: { object } });
    return fetch(`${base}/webhook/stripe`, { method: "POST", headers: { "stripe-signature": signPayload(raw, "whsec", t) }, body: raw });
  };
  return { cfg, base, saves, admin, hook, close: () => { server.close(); server.closeAllConnections?.(); } };
}
const paid = (id, over = {}) => ({ id, customer: "cus_1", amount_paid: 10000, total: 10000, tax: 0, currency: "usd", created: Math.floor(NOW / 1000), charge: `ch_${id}`, ...over });

test("dashboard tokens are tamper-proof", () => {
  const t = dashToken("s", "ada");
  assert.equal(readDashToken("s", t), "ada");
  assert.equal(readDashToken("other", t), null);
  assert.equal(readDashToken("s", "bob." + t.split(".")[1]), null);
  assert.equal(readDashToken("s", "nonsense"), null);
});

test("redirect targets: landing site and listed hosts only, never an open redirect", () => {
  const cfg = { landingUrl: "https://example.com/pricing", landingHosts: ["app.example.com"] };
  assert.equal(landingTarget(cfg, null, "ada"), "https://example.com/pricing?ref=ada");
  assert.equal(landingTarget(cfg, "/blog/x", "ada"), "https://example.com/blog/x?ref=ada");
  assert.equal(landingTarget(cfg, "https://app.example.com/signup?x=1", "ada"), "https://app.example.com/signup?x=1&ref=ada");
  for (const bad of ["https://evil.com/", "//evil.com", "/\\evil.com", "http://example.com/", "javascript:alert(1)", "https://example.com.evil.com/"]) assert.equal(landingTarget(cfg, bad, "ada"), null, bad);
  assert.equal(landingTarget(cfg, null, null), "https://example.com/pricing");
});

test("webhooks need a valid, fresh signature and are de-duplicated", async () => {
  const s = await boot();
  const raw = JSON.stringify({ id: "evt_x", type: "customer.created", data: { object: { id: "cus_1" } } });
  assert.equal((await fetch(`${s.base}/webhook/stripe`, { method: "POST", headers: { "stripe-signature": "t=1,v1=00" }, body: raw })).status, 400);
  const old = await s.hook("customer.created", { id: "cus_1" }, Math.floor(NOW / 1000) - 3600);
  assert.equal(old.status, 400);
  const sig = signPayload(raw, "whsec", Math.floor(NOW / 1000));
  assert.equal((await fetch(`${s.base}/webhook/stripe`, { method: "POST", headers: { "stripe-signature": sig }, body: raw })).status, 200);
  const again = await (await fetch(`${s.base}/webhook/stripe`, { method: "POST", headers: { "stripe-signature": sig }, body: raw })).json();
  assert.equal(again.ignored, "duplicate");
  s.close();
});

test("end to end: signup link → click → checkout → invoice → refund → payout", async () => {
  const s = await boot();
  const created = await (await s.admin("/v1/affiliates", { name: "Ada", email: "ada@example.com", code: "ada" })).json();
  assert.equal(created.link, "https://p.example/r/ada");

  const click = await fetch(`${s.base}/r/ada?to=/blog`, { redirect: "manual" });
  assert.equal(click.status, 302); assert.equal(click.headers.get("location"), "https://example.com/blog?ref=ada");
  assert.equal(s.cfg.state.clicks.ada.total, 1);
  assert.equal((await fetch(`${s.base}/r/ada?to=https://evil.com`, { redirect: "manual" })).status, 400);
  const ghost = await fetch(`${s.base}/r/nobody`, { redirect: "manual" });
  assert.equal(ghost.headers.get("location"), "https://example.com/pricing", "unknown codes get the plain landing page, no ref");

  const co = await (await s.hook("checkout.session.completed", { id: "cs_1", mode: "subscription", customer: "cus_1", client_reference_id: "rk_ada", customer_details: { email: "buyer@x.com" } })).json();
  assert.equal(co.attributed, true);
  const inv = await (await s.hook("invoice.paid", paid("in_1"))).json();
  assert.equal(inv.ok, true); assert.equal(inv.cents, 2000);

  const sum = await (await s.admin("/v1/summary")).json();
  assert.equal(sum.payingCustomers, 1); assert.equal(sum.commission.usd.pending, 2000);

  await s.hook("charge.refunded", { id: "ch_in_1", amount: 10000, amount_refunded: 5000 });
  assert.equal(s.cfg.state.entries[0].cents, 1000);

  s.cfg.now = () => NOW + 31 * DAY;
  // handler captured cfg.now at creation, so rebuild a handler over the same state for the later clock.
  s.close();
  const later = await boot({ state: s.cfg.state, now: () => NOW + 31 * DAY });
  const due = await (await later.admin("/v1/payouts")).json();
  assert.deepEqual(due.due.map((d) => [d.code, d.cents]), [["ada", 1000]]);
  const csv = await (await later.admin("/v1/payouts.csv")).text();
  assert.match(csv, /ada,Ada,ada@example.com,USD,10.00,1000,1/);
  const po = await later.admin("/v1/payouts", { code: "ada", currency: "usd", method: "paypal", reference: "PAYID-1" });
  assert.equal(po.status, 201);
  assert.equal((await later.admin("/v1/payouts", { code: "ada", currency: "usd" })).status, 409);
  later.close();
});

test("invoice.paid that arrives before checkout.session.completed is not lost", async () => {
  const s = await boot();
  await s.admin("/v1/affiliates", { name: "Ada", email: "ada@example.com", code: "ada" });
  const first = await (await s.hook("invoice.paid", paid("in_early"))).json();
  assert.equal(first.why, "not_referred");
  assert.equal(s.cfg.state.entries.length, 0);
  await s.hook("checkout.session.completed", { id: "cs_1", mode: "subscription", customer: "cus_1", client_reference_id: "rk_ada" });
  assert.equal(s.cfg.state.entries.length, 1);
  assert.equal(s.cfg.state.entries[0].cents, 2000);
  s.close();
});

test("a customer who was never referred creates no ledger noise beyond a short-lived orphan note", async () => {
  const s = await boot();
  await s.hook("invoice.paid", paid("in_1", { customer: "cus_stranger" }));
  assert.equal(s.cfg.state.entries.length, 0);
  s.close();
});

test("one-time Checkout payments (no invoice) earn commission too", async () => {
  const s = await boot();
  await s.admin("/v1/affiliates", { name: "Ada", email: "ada@example.com", code: "ada" });
  const r = await (await s.hook("checkout.session.completed", { id: "cs_2", mode: "payment", payment_status: "paid", customer: "cus_9", client_reference_id: "rk_ada", amount_total: 12000, total_details: { amount_tax: 2000 }, currency: "usd", payment_intent: "pi_9", created: Math.floor(NOW / 1000) })).json();
  assert.equal(r.accrued, true);
  assert.equal(s.cfg.state.entries[0].cents, 2000);
  await s.hook("charge.dispute.created", { charge: "ch_x", payment_intent: "pi_9" });
  assert.equal(s.cfg.state.entries[0].cents, 0, "a dispute removes the commission");
  s.close();
});

test("missing invoice charge ids are looked up so refunds can still be matched", async () => {
  const stripe = { invoicePaymentRefs: async (id) => (id === "in_1" ? ["ch_late", "pi_late"] : []) };
  const s = await boot({ stripe });
  await s.admin("/v1/affiliates", { name: "Ada", email: "ada@example.com", code: "ada" });
  await s.hook("customer.created", { id: "cus_1", metadata: { referral: "ada" }, email: "b@x.com" });
  await s.hook("invoice.paid", paid("in_1", { charge: undefined }));
  assert.equal(s.cfg.state.entries[0].charge, "ch_late");
  await s.hook("charge.refunded", { id: "ch_late", payment_intent: "pi_late", amount: 10000, amount_refunded: 10000 });
  assert.equal(s.cfg.state.entries[0].cents, 0);
  s.close();
});

test("admin routes need the key; bad JSON is a 400, not a crash", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/v1/summary`)).status, 401);
  assert.equal((await fetch(`${s.base}/v1/summary`, { headers: { authorization: "Bearer nope" } })).status, 401);
  const bad = await fetch(`${s.base}/v1/affiliates`, { method: "POST", headers: { authorization: "Bearer adm" }, body: "{oops" });
  assert.equal(bad.status, 400);
  assert.equal((await s.admin("/v1/affiliates", { name: "A", email: "bad" })).status, 400);
  s.close();
});

test("suspending an affiliate stops new commission and the public link", async () => {
  const s = await boot();
  await s.admin("/v1/affiliates", { name: "Ada", email: "ada@example.com", code: "ada" });
  assert.equal((await s.admin("/v1/affiliates/ada/status", { status: "suspended" })).status, 200);
  const click = await fetch(`${s.base}/r/ada`, { redirect: "manual" });
  assert.equal(click.headers.get("location"), "https://example.com/pricing");
  assert.equal(s.cfg.state.clicks.ada, undefined);
  s.close();
});

test("open sign-up: join page, dashboard link is the login, bad dashboards are 404", async () => {
  const s = await boot();
  const page = await fetch(`${s.base}/join`);
  assert.equal(page.status, 200); assert.match(await page.text(), /Acme partner program/);
  assert.match(page.headers.get("content-security-policy"), /form-action 'self'/);
  const r = await fetch(`${s.base}/join`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=Grace&email=grace%40example.com" });
  assert.equal(r.status, 303);
  const dash = await fetch(s.base + r.headers.get("location"));
  assert.equal(dash.status, 200);
  const text = await dash.text();
  assert.match(text, /Grace/); assert.match(text, /\/r\/grace/);
  assert.equal((await fetch(`${s.base}/a/grace.forged`)).status, 404);
  const bad = await fetch(`${s.base}/join`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=&email=x" });
  assert.equal(bad.status, 400);
  s.close();
});

test("sign-up is 404 unless switched on, and names in pages are escaped", async () => {
  const closed = await boot({ openSignup: false });
  assert.equal((await fetch(`${closed.base}/join`)).status, 404);
  closed.close();
  const s = await boot();
  const c = await (await s.admin("/v1/affiliates", { name: "<script>alert(1)</script>", email: "x@x.co", code: "xss" })).json();
  const html = await (await fetch(s.base + new URL(c.dashboard).pathname)).text();
  assert.ok(!html.includes("<script>alert(1)"));
  assert.match(html, /&lt;script&gt;/);
  s.close();
});

test("the snippet is served cross-origin with the configured cookie lifetime", async () => {
  const s = await boot({ policy: { cookieDays: 90 } });
  const r = await fetch(`${s.base}/rk.js`);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.match(await r.text(), /DAYS = 90/);
  s.close();
});
