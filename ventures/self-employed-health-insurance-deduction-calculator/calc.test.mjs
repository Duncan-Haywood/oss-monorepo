import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOCIAL_SECURITY_WAGE_BASE_2026,
  SE_NET_EARNINGS_FACTOR,
  LTC_LIMITS_2026,
  ltcLimitFor,
  clampMonths,
  money,
  selfEmploymentTaxOutcome,
  ltcAllowed,
  healthInsuranceDeductionOutcome,
} from "./calc.mjs";

function close(actual, expected, epsilon = 0.01) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} within ${epsilon} of ${expected}`);
}

test("published 2026 constants", () => {
  assert.equal(SOCIAL_SECURITY_WAGE_BASE_2026, 184_500);
  assert.equal(SE_NET_EARNINGS_FACTOR, 0.9235);
  assert.deepEqual(LTC_LIMITS_2026.map((r) => r.limit), [500, 930, 1_860, 4_960, 6_200]);
});

test("ltcLimitFor picks the bracket by attained age", () => {
  assert.equal(ltcLimitFor(0), 0);
  assert.equal(ltcLimitFor(40), 500);
  assert.equal(ltcLimitFor(41), 930);
  assert.equal(ltcLimitFor(50), 930);
  assert.equal(ltcLimitFor(51), 1_860);
  assert.equal(ltcLimitFor(60), 1_860);
  assert.equal(ltcLimitFor(61), 4_960);
  assert.equal(ltcLimitFor(70), 4_960);
  assert.equal(ltcLimitFor(71), 6_200);
  assert.equal(ltcLimitFor(99), 6_200);
});

test("clampMonths bounds to 0-12", () => {
  assert.equal(clampMonths(-3), 0);
  assert.equal(clampMonths(5.9), 5);
  assert.equal(clampMonths(40), 12);
  assert.equal(clampMonths("x"), 0);
});

test("SE tax below the wage base: 15.3% of 92.35%", () => {
  const se = selfEmploymentTaxOutcome(100_000);
  close(se.taxableBase, 92_350);
  close(se.socialSecurity, 11_451.4);
  close(se.medicare, 2_678.15);
  close(se.total, 14_129.55);
  close(se.deductibleHalf, 7_064.775);
});

test("SE tax above the wage base caps Social Security only", () => {
  const se = selfEmploymentTaxOutcome(300_000);
  close(se.socialSecurity, 184_500 * 0.124);
  close(se.medicare, 300_000 * 0.9235 * 0.029);
});

test("W-2 Social Security wages use up wage-base room", () => {
  const se = selfEmploymentTaxOutcome(100_000, { w2SocialSecurityWages: 150_000 });
  close(se.socialSecurity, (184_500 - 150_000) * 0.124);
  const none = selfEmploymentTaxOutcome(100_000, { w2SocialSecurityWages: 200_000 });
  assert.equal(none.socialSecurity, 0);
  close(none.medicare, 92_350 * 0.029);
});

test("no SE tax when net earnings are under $400; losses floor at zero", () => {
  assert.equal(selfEmploymentTaxOutcome(430).total, 0); // 397.1 base
  assert.ok(selfEmploymentTaxOutcome(440).total > 0);
  assert.equal(selfEmploymentTaxOutcome(-5_000).total, 0);
});

test("ltcAllowed caps at the age limit and prorates eligibility months", () => {
  const capped = ltcAllowed({ premium: 3_000, age: 55 });
  assert.equal(capped.allowed, 1_860);
  assert.equal(capped.capped, true);
  const under = ltcAllowed({ premium: 400, age: 55 });
  assert.equal(under.allowed, 400);
  const half = ltcAllowed({ premium: 1_200, age: 55, monthsEligible: 6 });
  assert.equal(half.allowed, 600);
  assert.equal(ltcAllowed({ premium: 1_200, age: 55, monthsEligible: 12 }).allowed, 0);
});

test("worked example: $80,000 profit, $9,600 health, age-55 LTC of $2,500", () => {
  const r = healthInsuranceDeductionOutcome({
    netProfit: 80_000,
    healthPremiums: 9_600,
    ltc: [{ premium: 2_500, age: 55 }],
  });
  close(r.se.total, 11_303.64);
  close(r.earnedIncome, 80_000 - 5_651.82);
  close(r.qualifyingPremiums, 9_600 + 1_860);
  close(r.deduction, 11_460);
  close(r.notDeducted, 640);
});

test("earned-income cap binds and retirement contribution reduces it", () => {
  const r = healthInsuranceDeductionOutcome({ netProfit: 20_000, healthPremiums: 18_000, retirementContribution: 3_000 });
  const half = selfEmploymentTaxOutcome(20_000).deductibleHalf;
  close(r.earnedIncome, 20_000 - half - 3_000);
  close(r.deduction, r.earnedIncome);
  assert.ok(r.findings.some((f) => /earned-income cap/.test(f.title)));
  assert.ok(r.findings.some((f) => /retirement contribution is a number you supplied/.test(f.title)));
});

test("months eligible for an employer plan remove months/12 of health premiums", () => {
  const r = healthInsuranceDeductionOutcome({ netProfit: 100_000, healthPremiums: 12_000, healthMonthsEligible: 3 });
  close(r.healthQualifying, 9_000);
  close(r.deduction, 9_000);
  const all = healthInsuranceDeductionOutcome({ netProfit: 100_000, healthPremiums: 12_000, healthMonthsEligible: 12 });
  assert.equal(all.deduction, 0);
});

test("zero or negative profit gives zero deduction and a finding", () => {
  const r = healthInsuranceDeductionOutcome({ netProfit: -1_000, healthPremiums: 5_000 });
  assert.equal(r.deduction, 0);
  assert.equal(r.findings[0].severity, "high");
});

test("junk input never throws or yields NaN", () => {
  const r = healthInsuranceDeductionOutcome({ netProfit: "abc", healthPremiums: null, ltc: "nope" });
  assert.equal(r.deduction, 0);
  assert.ok(Number.isFinite(r.earnedIncome));
});

test("money formats and never prints -$0.00", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-0.001), "$0.00");
});
