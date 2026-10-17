import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it overage applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.grafana, 50), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.grafana, 100), 25);
  assert.equal(providerCost(DEFAULT_PROVIDERS.axiom, 500), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.axiom, 501), 25);
});

test("overage is priced per GB on top of the plan fee", () => {
  // axiom 1,500 GB: 25 + 500*0.15 = 100
  assert.equal(providerCost(DEFAULT_PROVIDERS.axiom, 1500), 100);
  // datadog is pure pay-as-you-go: 100 GB = 180
  assert.equal(providerCost(DEFAULT_PROVIDERS.datadog, 100), 180);
  // papertrail picks the cheaper of its two plans: 10 GB -> 16 GB plan 75 vs 7 + 9*5 = 52
  assert.equal(providerCost(DEFAULT_PROVIDERS.papertrail, 10), 52);
  assert.equal(providerCost(DEFAULT_PROVIDERS.papertrail, 16), 75);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(100);
  assert.equal(rows[0].key, "axiom");
  assert.equal(rows[0].monthly, 0);
  assert.equal(rows.at(-1).key, "papertrail");
  assert.equal(rows.at(-1).extraVsCheapest, 495);
});

test("project compounds volume and totals each provider", () => {
  const p = project(100, 10, 3);
  assert.deepEqual(p.path, [100, 110, 121]);
  assert.ok(p.totals.some((t) => t.key === "axiom" && t.total === 0));
  const big = project(800, 8, 12);
  assert.ok(big.endVolume > 1800);
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
    a: { label: "A", url: "", freeGb: 0, plans: [{ gb: 0, price: 0 }], overagePerGb: 1 },
    b: { label: "B", url: "", freeGb: 0, plans: [{ gb: 0, price: 50 }], overagePerGb: 0.1 },
  };
  const segs = cheapestSegments(providers, 1000);
  assert.equal(segs[0].key, "a");
  assert.equal(segs.at(-1).key, "b");
  assert.ok(segs[0].to >= 55 && segs[0].to <= 56); // v = 50 + 0.1*v
});

test("summarize gates on budget for the cheapest or a named provider", () => {
  const rows = compare(1500);
  assert.equal(summarize(rows, { budget: 100000 }).errors, 0);
  const s = summarize(rows, { budget: 20, provider: "grafana" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
