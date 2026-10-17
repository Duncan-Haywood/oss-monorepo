import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

const IN = { revenue: 5000, avgPrice: 50, intlShare: 0, selfTaxMonthly: 100 };

test("store commission is a flat percentage with no filing cost (the store is the seller)", () => {
  const c = providerCost(DEFAULT_PROVIDERS.apple30, IN);
  assert.equal(c.fees, 1500);
  assert.equal(c.taxCost, 0);
  assert.equal(c.net, 3500);
  assert.equal(c.effectivePct, 30);
  assert.equal(providerCost(DEFAULT_PROVIDERS.apple15, IN).net, 4250);
  assert.equal(providerCost(DEFAULT_PROVIDERS.google15, IN).total, 750);
});

test("web checkout through Stripe carries the seller's own tax filing cost", () => {
  // 2.9% of 5000 = 145 + 100 sales * 0.30 = 175 fees, + 100 filing
  const c = providerCost(DEFAULT_PROVIDERS.stripe, IN);
  assert.equal(c.fees, 175);
  assert.equal(c.total, 275);
  assert.equal(providerCost(DEFAULT_PROVIDERS.stripe, { ...IN, revenue: 0 }).total, 0);
});

test("international share only raises channels that surcharge it", () => {
  const intl = { ...IN, intlShare: 100 };
  assert.equal(providerCost(DEFAULT_PROVIDERS.apple30, intl).fees, 1500);
  assert.equal(providerCost(DEFAULT_PROVIDERS.stripe, intl).fees, 250);
  assert.equal(providerCost(DEFAULT_PROVIDERS.stripetax, IN).fees, 200);
});

test("cheap in-app prices punish web checkout's fixed per-sale fee", () => {
  const cheap = { revenue: 1000, avgPrice: 0.99, intlShare: 0, selfTaxMonthly: 0 };
  const big = { revenue: 1000, avgPrice: 49.99, intlShare: 0, selfTaxMonthly: 0 };
  assert.ok(providerCost(DEFAULT_PROVIDERS.stripe, cheap).effectivePct > providerCost(DEFAULT_PROVIDERS.stripe, big).effectivePct + 20);
  // at 99 cents the fixed fee makes the 15% store tier cheaper than Stripe
  assert.ok(providerCost(DEFAULT_PROVIDERS.apple15, cheap).total < providerCost(DEFAULT_PROVIDERS.stripe, cheap).total);
});

test("compare sorts lowest total first and reports the gap", () => {
  const rows = compare(IN);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].total >= rows[i - 1].total);
  assert.equal(rows[0].extraVsBest, 0);
  assert.equal(rows.at(-1).extraVsBest, Math.round((rows.at(-1).total - rows[0].total) * 100) / 100);
});

test("project compounds revenue and totals each channel", () => {
  const p = project({ ...IN, revenue: 1000 }, 10, 3);
  assert.deepEqual(p.path, [1000, 1100, 1210]);
  assert.equal(p.totals.length, Object.keys(DEFAULT_PROVIDERS).length);
  assert.ok(p.totals[0].totalCost <= p.totals.at(-1).totalCost);
});

test("with a filing cost, a store tier wins small and web checkout wins large", () => {
  const segs = cheapestSegments({ avgPrice: 9.99, intlShare: 50, selfTaxMonthly: 150 }, undefined, 500000);
  assert.equal(segs[0].from, 0);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
  assert.ok(segs.length >= 2);
  assert.ok(!["stripe", "stripetax"].includes(segs[0].key));
  assert.ok(["stripe", "stripetax"].includes(segs.at(-1).key));
});

test("with no filing cost web checkout is cheapest from the start at a normal price", () => {
  const segs = cheapestSegments({ avgPrice: 29, intlShare: 0, selfTaxMonthly: 0 });
  assert.equal(segs.length, 1);
  assert.equal(segs[0].key, "stripe");
});

test("summarize gates on effective fee percent for the cheapest or a named channel", () => {
  const rows = compare(IN);
  assert.equal(summarize(rows, { maxPct: 50 }).errors, 0);
  const s = summarize(rows, { maxPct: 20, provider: "apple30" });
  assert.equal(s.overLimit, true);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
