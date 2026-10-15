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
