import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSubscription, createStripe } from "./stripe.mjs";

const price = (unit_amount, interval = "month", extra = {}) => ({ unit_amount, currency: "usd", recurring: { interval, interval_count: 1, ...extra } });

test("items are summed per month, quantity applied, metered lines skipped", () => {
  const s = normalizeSubscription({ id: "sub_1", customer: "cus_1", status: "active", created: 100, items: { data: [{ price: price(1000), quantity: 3 }, { price: price(12000, "year"), quantity: 1 }, { price: price(5, "month", { usage_type: "metered" }) }] } });
  assert.equal(s.mrr, 4000); assert.equal(s.created, 100000);
});

test("percent-off coupons are netted; paused subscriptions are not active", () => {
  const s = normalizeSubscription({ id: "s", customer: { id: "cus_2" }, status: "active", items: { data: [{ price: price(10000), quantity: 1 }] }, discount: { coupon: { percent_off: 25 } }, pause_collection: { behavior: "void" } });
  assert.equal(s.mrr, 7500); assert.equal(s.status, "paused"); assert.equal(s.customer, "cus_2");
});

test("listSubscriptions follows pagination with the read-only key and no writes", async () => {
  const calls = [];
  const pages = [{ data: [{ id: "sub_a", items: { data: [{ price: price(100) }] } }], has_more: true }, { data: [{ id: "sub_b", items: { data: [{ price: price(200) }] } }], has_more: false }];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => pages[calls.length - 1] }; };
  const out = await createStripe({ key: "rk_x", fetchImpl }).listSubscriptions();
  assert.deepEqual(out.map((s) => s.id), ["sub_a", "sub_b"]);
  assert.match(calls[1].url, /starting_after=sub_a/);
  assert.ok(calls.every((c) => !c.init.method && c.init.headers.authorization === "Bearer rk_x"));
});

test("a Stripe error surfaces with its message and status", async () => {
  const s = createStripe({ key: "k", fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Invalid API Key" } }) }) });
  await assert.rejects(s.listSubscriptions(), (e) => e.status === 401 && /Invalid API Key/.test(e.message));
});

test("runaway pagination is stopped", async () => {
  const s = createStripe({ key: "k", maxPages: 3, fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ id: "x", items: { data: [] } }], has_more: true }) }) });
  await assert.rejects(s.listSubscriptions(), /MAX_PAGES/);
});

test("plan lines sum to the discounted MRR and use nickname, then product", () => {
  const s = normalizeSubscription({ id: "s", customer: "c", status: "active", discount: { coupon: { percent_off: 10 } }, items: { data: [{ price: { ...price(3333), nickname: "Pro" }, quantity: 1 }, { price: { ...price(6667), product: "prod_seats" }, quantity: 1 }] } });
  assert.equal(s.mrr, 9000);
  assert.deepEqual(Object.keys(s.plans).sort(), ["Pro", "prod_seats"]);
  assert.equal(Object.values(s.plans).reduce((a, b) => a + b, 0), 9000);
});

test("trial_end is kept so rebuilt history skips the free weeks (red team 2026-11-18)", () => {
  const s = normalizeSubscription({ id: "s", customer: "c", status: "active", created: 100, trial_end: 200, items: { data: [{ price: price(1000) }] } });
  assert.equal(s.trialEnd, 200000);
  assert.equal(normalizeSubscription({ id: "t", status: "active", items: { data: [] } }).trialEnd, null);
});

test("a price nicknamed toString, constructor or __proto__ keeps its share (red team 2026-11-19)", () => {
  for (const nick of ["toString", "constructor", "__proto__"]) {
    const s = normalizeSubscription({ id: "s", status: "active", items: { data: [{ price: { ...price(1000), nickname: nick } }, { price: { ...price(500), nickname: "Pro" } }] } });
    assert.ok(Object.hasOwn(s.plans, nick), nick);
    assert.equal(s.plans[nick], 1000, nick); assert.equal(s.plans.Pro, 500, nick);
  }
});

test("each plan line gets its own share of a discount, not just the total (red team 2026-11-19)", () => {
  const s = normalizeSubscription({ id: "s", status: "active", discount: { coupon: { percent_off: 50 } }, items: { data: [{ price: { ...price(3000), nickname: "A" } }, { price: { ...price(1000), nickname: "A" } }, { price: { ...price(2000), nickname: "B" } }] } });
  assert.deepEqual({ ...s.plans }, { A: 2000, B: 1000 });
  assert.equal(s.mrr, 3000);
});

test("an active, unpaused subscription stays active", () => {
  assert.equal(normalizeSubscription({ id: "s", status: "active", items: { data: [{ price: price(100) }] } }).status, "active");
  assert.equal(normalizeSubscription({ id: "s", status: "past_due", pause_collection: { behavior: "void" }, items: { data: [] } }).status, "past_due");
});

test("an amount-off coupon is not counted as 1% off; percent-offs add up", () => {
  const s = normalizeSubscription({ id: "s", status: "active", discount: { coupon: { amount_off: 500 } }, items: { data: [{ price: price(10000) }] } });
  assert.equal(s.mrr, 10000);
  const t = normalizeSubscription({ id: "s", status: "active", discount: { coupon: { percent_off: 10 } }, discounts: [{ coupon: { percent_off: 15 } }, "di_unexpanded"], items: { data: [{ price: price(10000) }] } });
  assert.equal(t.mrr, 7500);
});

test("a quarterly price is divided by its interval_count; legacy plan-only items count", () => {
  assert.equal(normalizeSubscription({ id: "s", status: "active", items: { data: [{ price: { unit_amount: 3000, currency: "usd", recurring: { interval: "month", interval_count: 3 } } }] } }).mrr, 1000);
  assert.equal(normalizeSubscription({ id: "s", status: "active", items: { data: [{ plan: { amount: 2000, currency: "usd", interval: "month", interval_count: 1 }, quantity: 2 }] } }).mrr, 4000);
  assert.equal(normalizeSubscription({ id: "s", status: "active", plan: { amount: 1200, currency: "eur", interval: "year" }, quantity: 1 }).mrr, 100);
});

test("pagination stops at exactly maxPages requests", async () => {
  let n = 0;
  const s = createStripe({ key: "k", maxPages: 3, fetchImpl: async () => { n++; return { ok: true, json: async () => ({ data: [{ id: `x${n}`, items: { data: [] } }], has_more: true }) }; } });
  await assert.rejects(s.listSubscriptions(), /MAX_PAGES/);
  assert.equal(n, 3);
});

// Stripe deprecated subscription.discount in API version 2025-03-31.basil
// ("Use the discounts parameter and field instead", stripe.com/docs/upgrades),
// and the list endpoint returns `discounts` as unexpanded ids. An account on a
// newer API version had every percent-off coupon read as 0% off, so MRR read
// high (red team 2026-11-20).
test("the list asks Stripe to expand discounts, so coupons on new API versions are netted", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, json: async () => ({ data: [], has_more: false }) }; };
  await createStripe({ key: "k", fetchImpl }).listSubscriptions();
  assert.match(decodeURIComponent(calls[0]), /expand\[\]=data\.discounts/);
});

test("a discount in both `discount` and expanded `discounts` is counted once", () => {
  const d = { id: "di_1", coupon: { percent_off: 20 } };
  const s = normalizeSubscription({ id: "s", status: "active", discount: d, discounts: [d], items: { data: [{ price: price(10000) }] } });
  assert.equal(s.mrr, 8000);
  const only = normalizeSubscription({ id: "s", status: "active", discounts: [d], items: { data: [{ price: price(10000) }] } });
  assert.equal(only.mrr, 8000);
});


test("a key refused the discounts expansion (403) still lists, without it", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(decodeURIComponent(url));
    if (url.includes("expand")) return { ok: false, status: 403, json: async () => ({ error: { message: "no permission" } }) };
    return { ok: true, json: async () => ({ data: [{ id: "sub_a", items: { data: [{ price: price(100) }] } }], has_more: false }) };
  };
  const out = await createStripe({ key: "rk_x", fetchImpl }).listSubscriptions();
  assert.deepEqual(out.map((s) => s.id), ["sub_a"]);
  assert.equal(calls.length, 2);
  await assert.rejects(createStripe({ key: "k", fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) }).listSubscriptions(), (e) => e.status === 401);
});
