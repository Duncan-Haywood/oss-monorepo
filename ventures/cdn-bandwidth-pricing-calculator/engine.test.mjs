import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it overage applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.cloudfront, 1000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.cloudfront, 2000), 85);
  assert.equal(providerCost(DEFAULT_PROVIDERS.fastly, 100), 12);
});

test("minimums and included pools are respected", () => {
  // bunny: $1 minimum + $0.01/GB
  assert.equal(providerCost(DEFAULT_PROVIDERS.bunny, 100), 2);
  // keycdn: 100 GB included in the $4 minimum, then $0.04/GB
  assert.equal(providerCost(DEFAULT_PROVIDERS.keycdn, 100), 4);
  assert.equal(providerCost(DEFAULT_PROVIDERS.keycdn, 1100), 44);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(10000);
  assert.equal(rows[0].key, "bunny");
  assert.equal(rows[0].monthly, 101);
  assert.equal(rows.at(-1).key, "fastly");
  assert.equal(rows.at(-1).extraVsCheapest, 1099);
});

test("project compounds volume and totals each provider", () => {
  const p = project(100, 10, 3);
  assert.deepEqual(p.path, [100, 110, 121]);
  assert.ok(p.totals.some((t) => t.key === "cloudfront" && t.total === 0));
  const big = project(8000, 8, 12);
  assert.ok(big.endVolume > 18000);
  assert.ok(big.totals[0].total <= big.totals.at(-1).total);
});

test("cheapestSegments covers the range contiguously and starts at the free tier", () => {
  const segs = cheapestSegments();
  assert.equal(segs[0].from, 0);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
  assert.equal(segs[0].key, "cloudfront"); // its free first TB is the only $0 here
});

test("a custom provider table changes the winner", () => {
  const providers = {
    a: { label: "A", url: "", freeGb: 0, plans: [{ gb: 0, price: 0 }], overagePerGb: 1 },
    b: { label: "B", url: "", freeGb: 0, plans: [{ gb: 0, price: 50 }], overagePerGb: 0.1 },
  };
  const segs = cheapestSegments(providers, 1000);
  assert.equal(segs[0].key, "a");
  assert.equal(segs.at(-1).key, "b");
  assert.ok(segs[0].to >= 55 && segs[0].to <= 56); // v = 50 + 0.1*v
});

test("summarize gates on budget for the cheapest or a named provider", () => {
  const rows = compare(15000);
  assert.equal(summarize(rows, { budget: 100000 }).errors, 0);
  const s = summarize(rows, { budget: 20, provider: "cloudfront" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
