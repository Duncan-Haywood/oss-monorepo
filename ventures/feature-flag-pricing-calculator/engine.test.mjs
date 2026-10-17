import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it overage applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.posthog, 1000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.posthog, 2000), 100);
  assert.equal(providerCost(DEFAULT_PROVIDERS.flagsmith, 50), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.flagsmith, 51), 45);
});

test("overage is priced per thousand requests on top of the plan fee", () => {
  // flagsmith 2,000K: 45 + 1000*0.045 = 90 beats the 200 plan
  assert.equal(providerCost(DEFAULT_PROVIDERS.flagsmith, 2000), 90);
  // flagsmith 5,000K: the 200 plan (200) beats 45 + 4000*0.045 = 225
  assert.equal(providerCost(DEFAULT_PROVIDERS.flagsmith, 5000), 200);
  // configcat: flat plan up to 5,000K, then overage: 6,000K = 110 + 1000*0.02 = 130
  assert.equal(providerCost(DEFAULT_PROVIDERS.configcat, 6000), 130);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(100000);
  assert.equal(rows[0].key, "configcat");
  assert.equal(rows.at(-1).key, "posthog");
  assert.equal(rows.at(-1).extraVsCheapest, rows.at(-1).monthly - rows[0].monthly);
  const small = compare(500);
  assert.equal(small[0].monthly, 0);
});

test("project compounds volume and totals each provider", () => {
  const p = project(1000, 10, 3);
  assert.deepEqual(p.path, [1000, 1100, 1210]);
  assert.ok(p.totals.some((t) => t.key === "posthog" && t.total === 31));
  const big = project(8000, 8, 12);
  assert.ok(big.endVolume > 18000);
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
    a: { label: "A", url: "", freeK: 0, plans: [{ k: 0, price: 0 }], overagePerK: 1 },
    b: { label: "B", url: "", freeK: 0, plans: [{ k: 0, price: 50 }], overagePerK: 0.1 },
  };
  const segs = cheapestSegments(providers, 1000);
  assert.equal(segs[0].key, "a");
  assert.equal(segs.at(-1).key, "b");
  assert.ok(segs[0].to >= 55 && segs[0].to <= 56); // v = 50 + 0.1*v
});

test("summarize gates on budget for the cheapest or a named provider", () => {
  const rows = compare(15000);
  assert.equal(summarize(rows, { budget: 100000 }).errors, 0);
  const s = summarize(rows, { budget: 20, provider: "posthog" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
