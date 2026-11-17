import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it the paid plan base applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.clerk, 50000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.clerk, 50001), 25.02);
  assert.equal(providerCost(DEFAULT_PROVIDERS.cognito, 10000), 0);
});

test("tiers are marginal, not retroactive", () => {
  // clerk 150k: 25 + 50k*0.02 + 50k*0.018 = 1925
  assert.equal(providerCost(DEFAULT_PROVIDERS.clerk, 150000), 1925);
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

// Recomputed by hand from the vendors' pages (read 2026-11-08, quality audit
// portfolio/quality/audits/2026-11-08-auth-mau-pricing-calculator.json), not
// from this engine. A stale rate card fails here.
test("rate cards match the vendors' published examples", () => {
  const c = (k, m) => providerCost(DEFAULT_PROVIDERS[k], m);
  assert.equal(c("clerk", 40000), 0); // 50,000 MRUs free per app
  assert.equal(c("clerk", 60000), 225); // Clerk's own explainer: 25 + 10,000 x 0.02
  assert.equal(c("clerk", 20000000), 25 + 50000 * 0.02 + 900000 * 0.018 + 9000000 * 0.015 + 10000000 * 0.012);
  assert.equal(c("cognito", 950000), 14100); // Essentials: 940,000 x 0.015, the page's example
  assert.equal(c("cognito", 150000), 2100);
  assert.equal(c("supabase", 150000), 187.5);
  assert.equal(c("workos", 5000000), 10000);
  assert.equal(c("firebase", 150000), 505);
});

test("every default provider says when it was checked", () => {
  for (const [k, p] of Object.entries(DEFAULT_PROVIDERS)) assert.match(p.checked ?? "", /^\d{4}-\d{2}-\d{2}$/, k);
});

test("summarize names every provider tied for cheapest", () => {
  const t = summarize(compare(40000)).text;
  assert.match(t, /tied at about \$0\.00 per month: Clerk, Firebase \/ Identity Platform, Supabase Auth, WorkOS AuthKit\./);
  assert.match(summarize(compare(2000000)).text, /^Cheapest at this user count: /);
});
