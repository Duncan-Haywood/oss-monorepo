import { test } from "node:test";
import assert from "node:assert/strict";
import { gamblingLossOutcome, money, LOSS_CAP_RATE } from "./calc.mjs";

test("LOSS_CAP_RATE is 90%", () => {
  assert.equal(LOSS_CAP_RATE, 0.90);
});

test("break-even gambler: losses equal winnings produces exactly 10% phantom income", () => {
  const r = gamblingLossOutcome({ winnings: 50_000, losses: 50_000, taxYear: 2026 });
  assert.equal(r.ninetyPercentCap, 45_000);
  assert.equal(r.deduction, 45_000);
  assert.equal(r.taxableGamblingIncome, 5_000);
  assert.equal(r.phantomIncome, 5_000);
  assert.equal(r.atCap, true);
});

test("net-losing gambler still hits the 90% cap, same phantom income as break-even", () => {
  const r = gamblingLossOutcome({ winnings: 7_500, losses: 10_000, taxYear: 2026 });
  assert.equal(r.ninetyPercentCap, 6_750);
  assert.equal(r.deduction, 6_750);
  assert.equal(r.taxableGamblingIncome, 750);
  assert.equal(r.phantomIncome, 750);
});

test("comfortable net winner: losses well below 90% of winnings, cap has no effect", () => {
  const r = gamblingLossOutcome({ winnings: 10_000, losses: 5_000, taxYear: 2026 });
  assert.equal(r.deduction, 5_000, "full losses deductible, cap not reached");
  assert.equal(r.taxableGamblingIncome, 5_000, "same as pre-OBBBA: winnings minus losses");
  assert.equal(r.phantomIncome, 0);
  assert.equal(r.atCap, false);
});

test("losses exactly at the 90% threshold: cap and pre-OBBBA rule agree, no extra phantom income beyond the cap amount", () => {
  const r = gamblingLossOutcome({ winnings: 10_000, losses: 9_000, taxYear: 2026 });
  assert.equal(r.deduction, 9_000);
  assert.equal(r.taxableGamblingIncome, 1_000);
});

test("no winnings: nothing to cap", () => {
  const r = gamblingLossOutcome({ winnings: 0, losses: 5_000, taxYear: 2026 });
  assert.equal(r.deduction, 0);
  assert.equal(r.taxableGamblingIncome, 0);
});

test("not itemizing: zero deduction regardless of losses, pre-existing rule unaffected by OBBBA", () => {
  const r = gamblingLossOutcome({ winnings: 10_000, losses: 10_000, itemizes: false, taxYear: 2026 });
  assert.equal(r.deduction, 0);
  assert.equal(r.taxableGamblingIncome, 10_000);
  assert.equal(r.phantomIncome, 0, "phantom-income framing is specific to the itemized 90% cap");
});

test("tax year before 2026 uses the pre-OBBBA rule: full losses deductible up to winnings", () => {
  const r = gamblingLossOutcome({ winnings: 7_500, losses: 10_000, taxYear: 2025 });
  assert.equal(r.capApplies, false);
  assert.equal(r.deduction, 7_500, "old rule: capped at winnings only, no 90% haircut");
  assert.equal(r.taxableGamblingIncome, 0);
  assert.equal(r.phantomIncome, 0);
});

test("professional flag is carried through without changing the arithmetic", () => {
  const r = gamblingLossOutcome({ winnings: 50_000, losses: 60_000, isProfessional: true, taxYear: 2026 });
  assert.equal(r.isProfessional, true);
  assert.equal(r.deduction, 45_000);
});

test("negative and non-numeric inputs are treated as zero, never negative", () => {
  const r = gamblingLossOutcome({ winnings: -100, losses: "not a number", taxYear: 2026 });
  assert.equal(r.winnings, 0);
  assert.equal(r.losses, 0);
  assert.equal(r.deduction, 0);
});

test("the disallowed-by-cap amount is the gap between the pre-OBBBA and post-OBBBA deduction", () => {
  const r = gamblingLossOutcome({ winnings: 100_000, losses: 100_000, taxYear: 2026 });
  assert.equal(r.preObbbaDeduction, 100_000);
  assert.equal(r.deduction, 90_000);
  assert.equal(r.disallowedByCap, 10_000);
});

test("money() formats whole dollars with thousands separators and no cents", () => {
  assert.equal(money(45000), "$45,000");
  assert.equal(money(0), "$0");
  assert.equal(money(750.4), "$750");
});
