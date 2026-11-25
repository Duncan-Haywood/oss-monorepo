import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it the cheapest plan applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.github, 2000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.github, 3000), 6); // 1,000 min x $0.006 (GitHub runner pricing reference, 2026-11-19)
  assert.equal(providerCost(DEFAULT_PROVIDERS.gitlab, 400), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.gitlab, 401), 29);
});

test("overage is priced per 1,000 on top of the plan fee", () => {
  // circleci 4k: 15 + 1*6 = 21
  assert.equal(providerCost(DEFAULT_PROVIDERS.circleci, 4000), 21);
  // gitlab 12k: 29 + 2*10 = 49
  assert.equal(providerCost(DEFAULT_PROVIDERS.gitlab, 12000), 49);
  // buildkite (pricing page 2026-11-25): Free covers 1,000 small-agent minutes (2,000 vCPU min);
  // above that Pro is $30 a user with 2,000 small minutes, then $0.008 a minute.
  // 10k = 30 + 8 * 8 = 94
  assert.equal(providerCost(DEFAULT_PROVIDERS.buildkite, 1000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.buildkite, 1001), 30);
  assert.equal(providerCost(DEFAULT_PROVIDERS.buildkite, 10000), 94);
  // bitbucket Standard is $3.65 a user with 2,500 minutes, then $10 per 1,000: 5k = 3.65 + 25 = 28.65
  assert.equal(providerCost(DEFAULT_PROVIDERS.bitbucket, 5000), 28.65);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(10000);
  assert.equal(rows[0].key, "gitlab");
  assert.equal(rows[0].monthly, 29);
  assert.equal(rows.at(-1).key, "buildkite");
  assert.equal(rows.at(-1).extraVsCheapest, 65); // 94 - 29
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

test("a free allowance above the plan's included minutes still applies (quality audit 2026-11-19)", () => {
  const p = { ...DEFAULT_PROVIDERS.github, freeMinutes: 3000 };
  assert.equal(providerCost(p, 3001), 0.01);
});

test("budget exactly equal to the cost is not over budget; annual is 12 x monthly", () => {
  const rows = compare(12000);
  const cheapest = rows[0];
  assert.equal(summarize(rows, { budget: cheapest.monthly }).overBudget, false);
  assert.equal(summarize(rows, { budget: cheapest.monthly - 0.01 }).overBudget, true);
  for (const r of rows) assert.equal(r.annual, Math.round(r.monthly * 12 * 100) / 100);
});
