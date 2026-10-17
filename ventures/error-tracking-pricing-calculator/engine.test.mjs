import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it the cheapest plan applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.sentry, 5000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.sentry, 5001), 26);
  assert.equal(providerCost(DEFAULT_PROVIDERS.glitchtip, 1000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.glitchtip, 1001), 15);
});

test("overage is priced per 1,000 and the buyer takes the cheaper of plan-plus-overage and the next plan", () => {
  // sentry 60k: 26 + 10*0.3 = 29 beats the 100k plan at 45
  assert.equal(providerCost(DEFAULT_PROVIDERS.sentry, 60000), 29);
  // sentry 100k: min(26 + 50*0.3 = 41, 45) = 41
  assert.equal(providerCost(DEFAULT_PROVIDERS.sentry, 100000), 41);
  // glitchtip 250k: min(15 + 150*0.15 = 37.5, 50) = 37.5
  assert.equal(providerCost(DEFAULT_PROVIDERS.glitchtip, 250000), 37.5);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(40000);
  assert.equal(rows[0].key, "glitchtip");
  assert.equal(rows[0].monthly, 15);
  assert.equal(rows.at(-1).extraVsCheapest, rows.at(-1).monthly - 15);
});

test("project compounds volume and totals each provider", () => {
  const p = project(1000, 10, 3);
  assert.deepEqual(p.path, [1000, 1100, 1210]);
  assert.ok(p.totals.some((t) => t.key === "sentry" && t.total === 0));
  const big = project(40000, 8, 12);
  assert.ok(big.endVolume > 90000);
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
  const rows = compare(150000);
  assert.equal(summarize(rows, { budget: 10000 }).errors, 0);
  const s = summarize(rows, { budget: 20, provider: "bugsnag" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
