import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

const IN = { revenue: 5000, avgPrice: 50, intlShare: 0, selfTaxMonthly: 100 };

test("percentage plus per-sale fixed fee", () => {
  // paddle: 5% of 5000 = 250 + 100 sales * 0.50 = 300, no filing cost (merchant of record)
  const c = providerCost(DEFAULT_PROVIDERS.paddle, IN);
  assert.equal(c.fees, 300);
  assert.equal(c.taxCost, 0);
  assert.equal(c.total, 300);
  assert.equal(c.net, 4700);
  assert.equal(c.effectivePct, 6);
});

test("non-MoR providers carry the seller's own tax filing cost", () => {
  // stripe: 2.9% of 5000 = 145 + 100 * 0.30 = 175 fees, + 100 filing
  const c = providerCost(DEFAULT_PROVIDERS.stripe, IN);
  assert.equal(c.fees, 175);
  assert.equal(c.total, 275);
  assert.equal(providerCost(DEFAULT_PROVIDERS.stripe, { ...IN, revenue: 0 }).total, 0);
});

test("international share only raises providers that surcharge it", () => {
  const intl = { ...IN, intlShare: 100 };
  assert.equal(providerCost(DEFAULT_PROVIDERS.paddle, intl).fees, 300);
  assert.equal(providerCost(DEFAULT_PROVIDERS.lemonsqueezy, intl).fees, 375);
  assert.equal(providerCost(DEFAULT_PROVIDERS.stripetax, { ...IN }).fees, 200);
});

test("small tickets punish fixed fees", () => {
  const cheap = { revenue: 1000, avgPrice: 5, intlShare: 0, selfTaxMonthly: 0 };
  const big = { revenue: 1000, avgPrice: 500, intlShare: 0, selfTaxMonthly: 0 };
  assert.ok(providerCost(DEFAULT_PROVIDERS.paddle, cheap).effectivePct > providerCost(DEFAULT_PROVIDERS.paddle, big).effectivePct + 5);
});

test("compare sorts lowest total first and reports the gap", () => {
  const rows = compare(IN);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].total >= rows[i - 1].total);
  assert.equal(rows[0].extraVsBest, 0);
  assert.equal(rows.at(-1).extraVsBest, Math.round((rows.at(-1).total - rows[0].total) * 100) / 100);
});

test("project compounds revenue and totals each provider", () => {
  const p = project({ ...IN, revenue: 1000 }, 10, 3);
  assert.deepEqual(p.path, [1000, 1100, 1210]);
  assert.equal(p.totals.length, Object.keys(DEFAULT_PROVIDERS).length);
  assert.ok(p.totals[0].totalCost <= p.totals.at(-1).totalCost);
});

test("with a filing cost, merchant of record wins small and Stripe wins large", () => {
  const segs = cheapestSegments({ avgPrice: 29, intlShare: 50, selfTaxMonthly: 150 });
  assert.equal(segs[0].from, 0);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
  assert.ok(DEFAULT_PROVIDERS[segs[0].key].mor);
  assert.equal(segs.at(-1).key, "stripe");
});

test("with no filing cost Stripe is cheapest from the start", () => {
  const segs = cheapestSegments({ avgPrice: 29, intlShare: 0, selfTaxMonthly: 0 });
  assert.equal(segs.length, 1);
  assert.equal(segs[0].key, "stripe");
});

test("summarize gates on effective fee percent for the cheapest or a named provider", () => {
  const rows = compare(IN);
  assert.equal(summarize(rows, { maxPct: 50 }).errors, 0);
  const s = summarize(rows, { maxPct: 3, provider: "lemonsqueezy" });
  assert.equal(s.overLimit, true);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
