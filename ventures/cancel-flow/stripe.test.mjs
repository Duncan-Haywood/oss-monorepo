import { test } from "node:test";
import assert from "node:assert/strict";
import { verifySignature, signPayload, createStripe, normalizeSubscription } from "./stripe.mjs";

test("webhook signatures: valid, tampered, stale, malformed", () => {
  const sig = signPayload("{}", "whsec", 1000);
  assert.ok(verifySignature("{}", sig, "whsec", 1000));
  assert.ok(!verifySignature("{ }", sig, "whsec", 1000));
  assert.ok(!verifySignature("{}", sig, "whsec", 5000));
  assert.ok(!verifySignature("{}", "garbage", "whsec", 1000));
  assert.ok(!verifySignature("{}", sig, "", 1000));
});

test("normalizeSubscription reads both the new and old Stripe shapes", () => {
  const neu = normalizeSubscription({ id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ quantity: 2, current_period_end: 100, price: { unit_amount: 500, currency: "eur", recurring: { interval: "year", interval_count: 1 } } }] } });
  assert.deepEqual([neu.amount, neu.currency, neu.interval, neu.periodEnd], [1000, "eur", "year", 100000]);
  const old = normalizeSubscription({ id: "sub_2", customer: { id: "cus_2" }, status: "trialing", cancel_at_period_end: true, current_period_end: 5, plan: { amount: 900, interval: "month" } });
  assert.deepEqual([old.customer, old.amount, old.cancelAtPeriodEnd, old.periodEnd], ["cus_2", 900, true, 5000]);
});

function fake(responses = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://api.stripe.com", "");
    calls.push({ method: init.method, path, body: init.body, headers: init.headers });
    const r = responses[`${init.method} ${path}`] ?? { status: 200, json: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.json };
  };
  return { calls, stripe: createStripe({ key: "rk_test", fetchImpl }) };
}

test("ensureCoupon reuses an existing coupon and creates a missing one once", async () => {
  const a = fake({ "GET /v1/coupons/cancelflow-30-3m": { status: 200, json: { id: "x" } } });
  assert.equal(await a.stripe.ensureCoupon({ percent: 30, months: 3, duration: "repeating" }), "cancelflow-30-3m");
  assert.equal(a.calls.length, 1);
  const b = fake({ "GET /v1/coupons/cancelflow-30-3m": { status: 404, json: { error: {} } } });
  await b.stripe.ensureCoupon({ percent: 30, months: 3, duration: "repeating" });
  assert.equal(b.calls[1].method, "POST");
  assert.match(b.calls[1].body, /percent_off=30/); assert.match(b.calls[1].body, /duration_in_months=3/);
  const c = fake({ "GET /v1/coupons/cancelflow-20-once": { status: 404, json: { error: {} } } });
  await c.stripe.ensureCoupon({ percent: 20, duration: "once" });
  assert.doesNotMatch(c.calls[1].body, /duration_in_months/);
});

test("a lost race creating the coupon is not an error", async () => {
  const f = fake({ "GET /v1/coupons/cancelflow-30-3m": { status: 404, json: { error: {} } }, "POST /v1/coupons": { status: 400, json: { error: { code: "resource_already_exists", message: "dup" } } } });
  assert.equal(await f.stripe.ensureCoupon({ percent: 30, months: 3, duration: "repeating" }), "cancelflow-30-3m");
});

test("mutations carry idempotency keys and the right parameters", async () => {
  const f = fake();
  await f.stripe.applyDiscount("sub_1", "cancelflow-30-3m", "k1");
  await f.stripe.pause("sub_1", 1_800_000_000_000, "k2");
  await f.stripe.cancelAtPeriodEnd("sub_1", "unused", "too busy", "k3");
  assert.match(f.calls[0].body, /discounts%5B0%5D%5Bcoupon%5D=cancelflow-30-3m/);
  assert.equal(f.calls[0].headers["idempotency-key"], "k1");
  assert.match(f.calls[1].body, /pause_collection%5Bresumes_at%5D=1800000000/);
  assert.match(f.calls[2].body, /cancel_at_period_end=true/);
  assert.match(f.calls[2].body, /cancellation_details%5Bfeedback%5D=unused/);
});

test("Stripe errors surface with status and code", async () => {
  const f = fake({ "GET /v1/subscriptions/sub_x": { status: 404, json: { error: { message: "No such subscription", code: "resource_missing" } } } });
  await assert.rejects(f.stripe.getSubscription("sub_x"), (e) => e.status === 404 && e.code === "resource_missing");
});
