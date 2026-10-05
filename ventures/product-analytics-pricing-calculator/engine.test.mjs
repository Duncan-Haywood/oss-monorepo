import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it the cheapest plan applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.posthog, 1000000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.posthog, 1000001), 0.0); // 1 event over at $0.05/1k rounds to $0.00
  assert.equal(providerCost(DEFAULT_PROVIDERS.umami, 100000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.umami, 100001), 20);
  assert.equal(providerCost(DEFAULT_PROVIDERS.plausible, 5000), 9);
});

test("overage is priced per 1,000 and the buyer takes the cheaper of plan-plus-overage and the next plan", () => {
  // posthog 3M: 2M over the free million at 0.05 per 1k = 100
  assert.equal(providerCost(DEFAULT_PROVIDERS.posthog, 3000000), 100);
  // mixpanel 3M: 2000 * 0.28 = 560
  assert.equal(providerCost(DEFAULT_PROVIDERS.mixpanel, 3000000), 560);
  // plausible 150k: tiered, no overage on lower plans, so the 200k plan at 29
  assert.equal(providerCost(DEFAULT_PROVIDERS.plausible, 150000), 29);
  // beyond its top plan the provider-level rate applies: 69 + 1000*0.03 = 99
  assert.equal(providerCost(DEFAULT_PROVIDERS.plausible, 2000000), 99);
  // umami 5M: 20 + 4000*0.02 = 100
  assert.equal(providerCost(DEFAULT_PROVIDERS.umami, 5000000), 100);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(3000000);
  assert.equal(rows[0].key, "umami");
  assert.equal(rows[0].monthly, 60);
  assert.equal(rows.at(-1).key, "mixpanel");
  assert.equal(rows.at(-1).extraVsCheapest, rows.at(-1).monthly - 60);
});

test("project compounds volume and totals each provider", () => {
  const p = project(1000, 10, 3);
  assert.deepEqual(p.path, [1000, 1100, 1210]);
  assert.ok(p.totals.some((t) => t.key === "posthog" && t.total === 0));
  const big = project(400000, 8, 12);
  assert.ok(big.endVolume > 900000);
  assert.ok(big.totals[0].total <= big.totals.at(-1).total);
});

test("cheapestSegments covers the range contiguously and names ties", () => {
  const segs = cheapestSegments();
  assert.equal(segs[0].from, 0);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
  assert.match(segs[0].label, /all \$0\.00/);
});

test("a custom provider table changes the winner", () => {
  const providers = {
    a: { label: "A", url: "", freeEvents: 0, plans: [{ events: 0, price: 0 }], overagePer1k: 1 },
    b: { label: "B", url: "", freeEvents: 0, plans: [{ events: 0, price: 50 }], overagePer1k: 0.1 },
  };
  const segs = cheapestSegments(providers, 100000);
  assert.equal(segs[0].key, "a");
  assert.equal(segs.at(-1).key, "b");
  assert.ok(segs[0].to >= 55000 && segs[0].to <= 56000); // v/1000 = 50 + 0.1*v/1000
});

test("summarize gates on budget for the cheapest or a named provider", () => {
  const rows = compare(3000000);
  assert.equal(summarize(rows, { budget: 10000 }).errors, 0);
  const s = summarize(rows, { budget: 20, provider: "mixpanel" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
