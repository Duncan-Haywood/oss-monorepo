import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS_2026,
  SOCIAL_SECURITY_WAGE_BASE_2026,
  SE_NET_EARNINGS_FACTOR,
  EMPLOYER_CONTRIBUTION_RATE,
  money,
  catchUpFor,
  selfEmploymentTaxOutcome,
  netSelfEmploymentEarnings,
  solo401kContributionOutcome,
} from "./calc.mjs";

function close(actual, expected, epsilon = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test("LIMITS_2026 and the fixed rates are the documented 2026 figures", () => {
  assert.equal(LIMITS_2026.employeeDeferral, 24_500);
  assert.equal(LIMITS_2026.catchUp50, 8_000);
  assert.equal(LIMITS_2026.catchUp60to63, 11_250);
  assert.equal(LIMITS_2026.annualAdditions, 72_000);
  assert.equal(LIMITS_2026.compensationLimit, 360_000);
  assert.equal(SOCIAL_SECURITY_WAGE_BASE_2026, 184_500);
  assert.equal(SE_NET_EARNINGS_FACTOR, 0.9235);
  assert.equal(EMPLOYER_CONTRIBUTION_RATE, 0.2);
});

test("catchUpFor returns the enhanced 60-63 catch-up, not the stacked total", () => {
  assert.equal(catchUpFor(59), 8_000);
  assert.equal(catchUpFor(60), 11_250);
  assert.equal(catchUpFor(63), 11_250);
  assert.equal(catchUpFor(64), 8_000);
  assert.equal(catchUpFor(49), 0);
  assert.equal(catchUpFor(30), 0);
});

test("selfEmploymentTaxOutcome applies the 92.35% base and splits the wage-base cap", () => {
  const result = selfEmploymentTaxOutcome(100_000);
  close(result.taxableBase, 92_350);
  close(result.socialSecurity, 92_350 * 0.124);
  close(result.medicare, 92_350 * 0.029);
  close(result.deductibleHalf, result.total / 2);
});

test("selfEmploymentTaxOutcome caps Social Security at the 2026 wage base but not Medicare", () => {
  const result = selfEmploymentTaxOutcome(300_000);
  const taxableBase = 300_000 * SE_NET_EARNINGS_FACTOR;
  close(result.socialSecurity, SOCIAL_SECURITY_WAGE_BASE_2026 * 0.124);
  close(result.medicare, taxableBase * 0.029);
});

test("selfEmploymentTaxOutcome floors at zero for a loss-making business", () => {
  const result = selfEmploymentTaxOutcome(-10_000);
  assert.equal(result.total, 0);
  assert.equal(result.deductibleHalf, 0);
});

test("netSelfEmploymentEarnings subtracts half of self-employment tax from net profit", () => {
  const earnings = netSelfEmploymentEarnings(100_000);
  const se = selfEmploymentTaxOutcome(100_000);
  close(earnings, 100_000 - se.deductibleHalf);
});

test("netSelfEmploymentEarnings caps at the 2026 $360,000 compensation limit", () => {
  const earnings = netSelfEmploymentEarnings(500_000);
  assert.equal(earnings, LIMITS_2026.compensationLimit);
});

test("a $100,000 net profit, age 45, gets the default max deferral and 20% employer contribution", () => {
  const result = solo401kContributionOutcome({ netProfit: 100_000, age: 45 });
  close(result.earnings, 92_935.23, 0.05);
  assert.equal(result.catchUp, 0);
  assert.equal(result.deferral, LIMITS_2026.employeeDeferral);
  close(result.employerContribution, result.earnings * 0.2, 0.05);
  close(result.totalContribution, result.deferral + result.employerContribution);
});

test("age 60-63 gets the enhanced catch-up on both the deferral limit and the overall limit", () => {
  const result = solo401kContributionOutcome({ netProfit: 250_000, age: 62 });
  assert.equal(result.catchUp, LIMITS_2026.catchUp60to63);
  assert.equal(result.statutoryDeferralLimit, LIMITS_2026.employeeDeferral + 11_250);
  assert.equal(result.overallLimit, LIMITS_2026.annualAdditions + 11_250);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /enhanced catch-up, not a stacked one/i);
});

test("a low net profit trims the employer contribution once the overall (earned-income) cap binds", () => {
  const result = solo401kContributionOutcome({ netProfit: 20_000, age: 30 });
  close(result.combinedCap, result.earnings);
  assert.equal(result.deferral, result.earnings < LIMITS_2026.employeeDeferral ? result.earnings : LIMITS_2026.employeeDeferral);
  close(result.totalContribution, result.combinedCap, 0.05);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /trimmed by the overall combined limit/i);
});

test("deferral already used at a W-2 job's plan reduces the remaining Solo 401(k) deferral room", () => {
  const result = solo401kContributionOutcome({ netProfit: 100_000, age: 45, deferralUsedElsewhere: 20_000 });
  assert.equal(result.remainingDeferralRoom, LIMITS_2026.employeeDeferral - 20_000);
  assert.equal(result.deferral, LIMITS_2026.employeeDeferral - 20_000);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /shared across every 401\(k\)/i);
});

test("a requested elective deferral above the available room is reduced, with a finding explaining why", () => {
  const result = solo401kContributionOutcome({ netProfit: 100_000, age: 45, electiveDeferral: 24_500, deferralUsedElsewhere: 20_000 });
  assert.equal(result.deferral, 4_500);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /reduced to the available room/i);
});

test("a requested elective deferral within the room is honoured exactly", () => {
  const result = solo401kContributionOutcome({ netProfit: 100_000, age: 45, electiveDeferral: 10_000 });
  assert.equal(result.deferral, 10_000);
});

test("zero or negative net profit yields zero contribution and a high-severity finding", () => {
  const result = solo401kContributionOutcome({ netProfit: 0, age: 40 });
  assert.equal(result.earnings, 0);
  assert.equal(result.totalContribution, 0);
  const severities = result.findings.map((f) => f.severity);
  assert.ok(severities.includes("high"));
});

test("every outcome includes the sole-proprietor-only scope caveat", () => {
  const result = solo401kContributionOutcome({ netProfit: 100_000, age: 45 });
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /sole proprietor.*single-member llc only/i);
});

test("money() formats cents and negative sign correctly", () => {
  assert.equal(money(24500), "$24,500.00");
  assert.equal(money(0), "$0.00");
});
