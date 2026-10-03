import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it the cheapest plan applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.github, 2000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.github, 3000), 8);
  assert.equal(providerCost(DEFAULT_PROVIDERS.gitlab, 400), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.gitlab, 401), 29);
});

test("overage is priced per 1,000 on top of the plan fee", () => {
  // circleci 4k: 15 + 1*6 = 21
  assert.equal(providerCost(DEFAULT_PROVIDERS.circleci, 4000), 21);
  // gitlab 12k: 29 + 2*10 = 49
  assert.equal(providerCost(DEFAULT_PROVIDERS.gitlab, 12000), 49);
  // buildkite is pure pay-as-you-go: 10k = 130
  assert.equal(providerCost(DEFAULT_PROVIDERS.buildkite, 10000), 130);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(10000);
  assert.equal(rows[0].key, "gitlab");
  assert.equal(rows[0].monthly, 29);
  assert.equal(rows.at(-1).key, "buildkite");
  assert.equal(rows.at(-1).extraVsCheapest, 101);
});

test("project compounds volume and totals each provider", () => {
  const p = project(1000, 10, 3);
  assert.deepEqual(p.path, [1000, 1100, 1210]);
  assert.ok(p.totals.some((t) => t.key === "github" && t.total === 0));
  const big = project(8000, 8, 12);
  assert.ok(big.endVolume > 15000);
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
    a: { label: "A", url: "", freeMinutes: 0, plans: [{ minutes: 0, price: 0 }], overagePer1k: 1 },
    b: { label: "B", url: "", freeMinutes: 0, plans: [{ minutes: 0, price: 50 }], overagePer1k: 0.1 },
  };
  const segs = cheapestSegments(providers, 100000);
  assert.equal(segs[0].key, "a");
  assert.equal(segs.at(-1).key, "b");
  assert.ok(segs[0].to >= 55000 && segs[0].to <= 56000); // v/1000 = 50 + 0.1*v/1000
});

test("summarize gates on budget for the cheapest or a named provider", () => {
  const rows = compare(150000);
  assert.equal(summarize(rows, { budget: 100000 }).errors, 0);
  const s = summarize(rows, { budget: 20, provider: "github" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
