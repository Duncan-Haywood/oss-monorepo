import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS_2026,
  SOCIAL_SECURITY_WAGE_BASE_2026,
  SE_NET_EARNINGS_FACTOR,
  SEP_EFFECTIVE_RATE,
  money,
  selfEmploymentTaxOutcome,
  netSelfEmploymentEarnings,
  solo401kComparison,
  sepIraContributionOutcome,
} from "./calc.mjs";

function close(actual, expected, epsilon = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test("constants are the documented 2026 figures", () => {
  assert.equal(LIMITS_2026.annualAdditions, 72_000);
  assert.equal(LIMITS_2026.compensationLimit, 360_000);
  assert.equal(SOCIAL_SECURITY_WAGE_BASE_2026, 184_500);
  assert.equal(SE_NET_EARNINGS_FACTOR, 0.9235);
  assert.equal(SEP_EFFECTIVE_RATE, 0.2);
});

test("self-employment tax: $100,000 profit", () => {
  const se = selfEmploymentTaxOutcome(100_000);
  close(se.taxableBase, 92_350);
  close(se.total, 92_350 * 0.153);
  close(se.deductibleHalf, 92_350 * 0.153 / 2);
});

test("self-employment tax: Social Security portion stops at the wage base", () => {
  const se = selfEmploymentTaxOutcome(400_000);
  close(se.socialSecurity, 184_500 * 0.124);
  close(se.medicare, 400_000 * 0.9235 * 0.029);
});

test("losses and junk input floor at zero", () => {
  assert.equal(selfEmploymentTaxOutcome(-5_000).total, 0);
  assert.equal(netSelfEmploymentEarnings("abc"), 0);
  assert.equal(sepIraContributionOutcome({ netProfit: -1 }).maxContribution, 0);
});

test("net earnings are capped at the $360,000 compensation limit", () => {
  assert.equal(netSelfEmploymentEarnings(1_000_000), 360_000);
});

test("$150,000 profit: 20% of net earnings", () => {
  const r = sepIraContributionOutcome({ netProfit: 150_000 });
  close(r.earnings, 139_402.84, 0.05);
  close(r.maxContribution, r.earnings * 0.2);
  close(r.contribution, r.maxContribution);
});

test("the $72,000 limit binds at the compensation cap", () => {
  const r = sepIraContributionOutcome({ netProfit: 1_000_000 });
  assert.equal(r.uncapped, 72_000);
  assert.equal(r.maxContribution, 72_000);
});

test("planned contribution above the max is trimmed and flagged", () => {
  const r = sepIraContributionOutcome({ netProfit: 100_000, plannedContribution: 50_000 });
  assert.ok(r.contribution < 50_000);
  assert.ok(r.findings.some((f) => /reduced to the limit/.test(f.title)));
});

test("planned contribution below the max is honoured", () => {
  const r = sepIraContributionOutcome({ netProfit: 100_000, plannedContribution: 5_000 });
  assert.equal(r.contribution, 5_000);
});

test("Solo 401(k) comparison exceeds the SEP on ordinary earnings", () => {
  const r = sepIraContributionOutcome({ netProfit: 100_000 });
  assert.ok(r.solo401kMax > r.maxContribution);
  assert.ok(r.findings.some((f) => /Solo 401\(k\) would allow more/.test(f.title)));
});

test("Solo 401(k) comparison never exceeds earnings or $72,000", () => {
  assert.equal(solo401kComparison(10_000), 10_000);
  assert.equal(solo401kComparison(360_000), 72_000);
});

test("no comparison finding at the cap, where both plans allow $72,000", () => {
  const r = sepIraContributionOutcome({ netProfit: 1_000_000 });
  assert.ok(!r.findings.some((f) => /Solo 401\(k\) would allow more/.test(f.title)));
});

test("zero earnings produces the high-severity finding", () => {
  const r = sepIraContributionOutcome({ netProfit: 0 });
  assert.equal(r.findings[0].severity, "high");
});

test("scope finding is always present", () => {
  const r = sepIraContributionOutcome({ netProfit: 80_000 });
  assert.ok(r.findings.some((f) => /Sole proprietor/.test(f.title)));
});

test("money formats and never prints negative zero", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-0.001), "$0.00");
});
