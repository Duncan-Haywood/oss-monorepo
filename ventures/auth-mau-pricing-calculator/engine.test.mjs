import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it the paid plan base applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.clerk, 10000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.clerk, 10001), 25.02);
  assert.equal(providerCost(DEFAULT_PROVIDERS.cognito, 10000), 0);
});

test("tiers are marginal, not retroactive", () => {
  // clerk 150k: 25 + 90k*0.02 + 50k*0.018 = 2725
  assert.equal(providerCost(DEFAULT_PROVIDERS.clerk, 150000), 2725);
  // supabase 150k: 25 + 50k*0.00325 = 187.5
  assert.equal(providerCost(DEFAULT_PROVIDERS.supabase, 150000), 187.5);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(40000);
  assert.equal(rows[0].monthly, 0);
  assert.equal(rows.at(-1).key, "auth0");
  assert.equal(rows.at(-1).extraVsCheapest, rows.at(-1).monthly);
});

test("project compounds MAU and totals each provider", () => {
  const p = project(1000, 10, 3);
  assert.deepEqual(p.path, [1000, 1100, 1210]);
  assert.ok(p.totals.every((t) => t.total === 0));
  const big = project(40000, 8, 12);
  assert.ok(big.endMau > 90000);
  assert.ok(big.totals[0].total <= big.totals.at(-1).total);
});

test("cheapestSegments covers the range contiguously and names ties", () => {
  const segs = cheapestSegments();
  assert.equal(segs[0].from, 0);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
  assert.match(segs[0].label, /all \$0\.00/);
});

test("a custom provider table changes the winner", () => {
  const providers = { a: { label: "A", url: "", freeMau: 0, base: 0, includedMau: 0, tiers: [{ upTo: Infinity, rate: 0.01 }] }, b: { label: "B", url: "", freeMau: 0, base: 50, includedMau: 0, tiers: [{ upTo: Infinity, rate: 0.001 }] } };
  const segs = cheapestSegments(providers, 100000);
  assert.deepEqual(segs.map((s) => s.key), ["a", "b"]);
  assert.ok(segs[0].to >= 5555 && segs[0].to <= 5556); // 0.01m = 50 + 0.001m
});

test("summarize gates on budget for the cheapest or a named provider", () => {
  const rows = compare(150000);
  assert.equal(summarize(rows, { budget: 10000 }).errors, 0);
  const s = summarize(rows, { budget: 100, provider: "clerk" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
