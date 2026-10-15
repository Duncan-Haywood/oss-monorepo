import { test } from "node:test";
import assert from "node:assert/strict";
import {
  saltCapOutcome,
  magiAtFloor,
  money,
  SALT_CAP_RULES,
  SALT_FLOOR,
  SALT_FLOOR_MFS,
  standardDeductionFor,
  itemizeVsStandardBenefit,
  STANDARD_DEDUCTION,
} from "./calc.mjs";

test("below the threshold, the cap is unreduced", () => {
  const r = saltCapOutcome({ filingStatus: "single", magi: 300_000, stateLocalTaxesPaid: 25_000, taxYear: 2025 });
  assert.equal(r.effectiveCap, 40_000);
  assert.equal(r.deduction, 25_000);
  assert.equal(r.nonDeductible, 0);
  assert.equal(r.atFloor, false);
});

test("at exactly the threshold, the cap is still unreduced", () => {
  const r = saltCapOutcome({ filingStatus: "single", magi: 500_000, stateLocalTaxesPaid: 40_000, taxYear: 2025 });
  assert.equal(r.excessMagi, 0);
  assert.equal(r.effectiveCap, 40_000);
});

test("2025 single/HOH/MFJ: 30 cents per dollar of excess MAGI reduces the cap", () => {
  const r = saltCapOutcome({ filingStatus: "single", magi: 520_000, stateLocalTaxesPaid: 50_000, taxYear: 2025 });
  assert.equal(r.excessMagi, 20_000);
  assert.equal(r.reduction, 6_000);
  assert.equal(r.effectiveCap, 34_000);
  assert.equal(r.deduction, 34_000);
  assert.equal(r.nonDeductible, 16_000);
});

test("2025: the cap floors at $10,000 once MAGI reaches $600,000, never lower", () => {
  const atFloor = saltCapOutcome({ filingStatus: "single", magi: 600_000, stateLocalTaxesPaid: 40_000, taxYear: 2025 });
  assert.equal(atFloor.effectiveCap, 10_000);
  assert.equal(atFloor.atFloor, true);

  const wellPastFloor = saltCapOutcome({ filingStatus: "single", magi: 5_000_000, stateLocalTaxesPaid: 40_000, taxYear: 2025 });
  assert.equal(wellPastFloor.effectiveCap, 10_000, "the cap never drops below the permanent-law floor");
});

test("magiAtFloor matches the point saltCapOutcome actually reaches the floor", () => {
  const rules = SALT_CAP_RULES[2025];
  const expected = magiAtFloor({ threshold: rules.threshold, cap: rules.cap, floor: SALT_FLOOR });
  assert.equal(expected, 600_000);

  const justBelow = saltCapOutcome({ filingStatus: "single", magi: expected - 1, stateLocalTaxesPaid: 40_000, taxYear: 2025 });
  assert.ok(justBelow.effectiveCap > SALT_FLOOR, "just below the floor point, the cap should still be above the floor");
  const atOrAbove = saltCapOutcome({ filingStatus: "single", magi: expected, stateLocalTaxesPaid: 40_000, taxYear: 2025 });
  assert.equal(atOrAbove.effectiveCap, SALT_FLOOR);
});

test("married filing separately uses a halved cap, threshold, and floor -- not a per-person share", () => {
  const mfs = saltCapOutcome({ filingStatus: "mfs", magi: 260_000, stateLocalTaxesPaid: 25_000, taxYear: 2025 });
  assert.equal(mfs.cap, 20_000);
  assert.equal(mfs.threshold, 250_000);
  assert.equal(mfs.floor, SALT_FLOOR_MFS);
  assert.equal(mfs.excessMagi, 10_000);
  assert.equal(mfs.reduction, 3_000);
  assert.equal(mfs.effectiveCap, 17_000);
});

test("mfs floors at $5,000 once MAGI reaches $300,000", () => {
  const r = saltCapOutcome({ filingStatus: "mfs", magi: 300_000, stateLocalTaxesPaid: 10_000, taxYear: 2025 });
  assert.equal(r.effectiveCap, SALT_FLOOR_MFS);
  assert.equal(r.atFloor, true);
});

test("head of household and married filing jointly use the SAME cap and threshold as single -- not doubled for a joint return", () => {
  const single = saltCapOutcome({ filingStatus: "single", magi: 520_000, stateLocalTaxesPaid: 50_000, taxYear: 2025 });
  const hoh = saltCapOutcome({ filingStatus: "hoh", magi: 520_000, stateLocalTaxesPaid: 50_000, taxYear: 2025 });
  const mfj = saltCapOutcome({ filingStatus: "mfj", magi: 520_000, stateLocalTaxesPaid: 50_000, taxYear: 2025 });
  assert.equal(single.effectiveCap, hoh.effectiveCap);
  assert.equal(single.effectiveCap, mfj.effectiveCap);
  assert.equal(mfj.cap, 40_000, "a joint return does not get double the single cap");
});

test("2026 figures are the published, higher, inflation-adjusted amounts", () => {
  const r = saltCapOutcome({ filingStatus: "single", magi: 505_000, stateLocalTaxesPaid: 40_400, taxYear: 2026 });
  assert.equal(r.cap, 40_400);
  assert.equal(r.threshold, 505_000);
  assert.equal(r.excessMagi, 0);
  assert.equal(r.effectiveCap, 40_400);

  const mfs2026 = saltCapOutcome({ filingStatus: "mfs", magi: 252_500, stateLocalTaxesPaid: 20_200, taxYear: 2026 });
  assert.equal(mfs2026.cap, 20_200);
  assert.equal(mfs2026.threshold, 252_500);
});

test("deduction never exceeds taxes actually paid, even when the cap is high", () => {
  const r = saltCapOutcome({ filingStatus: "single", magi: 200_000, stateLocalTaxesPaid: 8_000, taxYear: 2025 });
  assert.equal(r.deduction, 8_000);
  assert.equal(r.nonDeductible, 0);
});

test("an unrecognized tax year falls back to the 2025 rules", () => {
  const r = saltCapOutcome({ filingStatus: "single", magi: 300_000, stateLocalTaxesPaid: 30_000, taxYear: 2099 });
  assert.equal(r.cap, 40_000);
});

test("negative or missing inputs are treated as zero, never negative", () => {
  const r = saltCapOutcome({ filingStatus: "single", magi: -50_000, stateLocalTaxesPaid: -100 });
  assert.equal(r.magi, 0);
  assert.equal(r.taxesPaid, 0);
  assert.equal(r.deduction, 0);
});

test("findings flag the PTET caveat and the MFS halving, always", () => {
  const r = saltCapOutcome({ filingStatus: "mfs", magi: 260_000, stateLocalTaxesPaid: 25_000, taxYear: 2025 });
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /pass-through entity tax/i);
  assert.match(titles, /halved cap/i);
});

test("money() formats negative values with a leading minus and no double sign", () => {
  assert.equal(money(1234), "$1,234");
  assert.equal(money(-1234), "-$1,234");
  assert.equal(money(0), "$0");
});

test("standardDeductionFor returns the right figure per filing status and year", () => {
  assert.equal(standardDeductionFor({ filingStatus: "single", taxYear: 2025 }), 15_750);
  assert.equal(standardDeductionFor({ filingStatus: "mfs", taxYear: 2025 }), 15_750);
  assert.equal(standardDeductionFor({ filingStatus: "hoh", taxYear: 2025 }), 23_625);
  assert.equal(standardDeductionFor({ filingStatus: "mfj", taxYear: 2025 }), 31_500);
  assert.equal(standardDeductionFor({ filingStatus: "mfj", taxYear: 2026 }), 32_200);
});

test("an unrecognized tax year or filing status falls back to 2025 single", () => {
  assert.equal(standardDeductionFor({ filingStatus: "single", taxYear: 2099 }), 15_750);
  assert.equal(standardDeductionFor({ filingStatus: "nonsense", taxYear: 2025 }), 15_750);
});

test("itemizeVsStandardBenefit: SALT is fully additive once other itemized deductions alone clear the standard deduction", () => {
  const salt = saltCapOutcome({ filingStatus: "mfj", magi: 200_000, stateLocalTaxesPaid: 12_000, taxYear: 2025 });
  assert.equal(salt.deduction, 12_000);
  const r = itemizeVsStandardBenefit({
    filingStatus: "mfj",
    taxYear: 2025,
    saltDeduction: salt.deduction,
    otherItemizedDeductions: 35_000,
  });
  assert.equal(r.standardDeduction, 31_500);
  assert.equal(r.totalItemized, 47_000);
  assert.equal(r.marginalBenefit, 12_000);
  assert.equal(r.fullyAdditive, true);
  assert.equal(r.whollyAbsorbed, false);
});

test("itemizeVsStandardBenefit: SALT is only partly additive when other itemized deductions alone fall short", () => {
  const salt = saltCapOutcome({ filingStatus: "mfj", magi: 200_000, stateLocalTaxesPaid: 12_000, taxYear: 2025 });
  const r = itemizeVsStandardBenefit({
    filingStatus: "mfj",
    taxYear: 2025,
    saltDeduction: salt.deduction,
    otherItemizedDeductions: 20_000,
  });
  assert.equal(r.totalItemized, 32_000);
  // $20,000 other + $12,000 SALT = $32,000, only $500 above the $31,500
  // standard deduction -- $11,500 of the $12,000 SALT deduction just
  // matches ground the standard deduction already covered.
  assert.equal(r.marginalBenefit, 500);
  assert.equal(r.fullyAdditive, false);
  assert.equal(r.whollyAbsorbed, false);
});

test("itemizeVsStandardBenefit: SALT is wholly absorbed by the standard deduction when total itemized still falls short", () => {
  const salt = saltCapOutcome({ filingStatus: "single", magi: 100_000, stateLocalTaxesPaid: 8_000, taxYear: 2025 });
  const r = itemizeVsStandardBenefit({
    filingStatus: "single",
    taxYear: 2025,
    saltDeduction: salt.deduction,
    otherItemizedDeductions: 3_000,
  });
  assert.equal(r.totalItemized, 11_000);
  assert.equal(r.standardDeduction, 15_750);
  assert.equal(r.itemizes, false);
  assert.equal(r.marginalBenefit, 0);
  assert.equal(r.whollyAbsorbed, true);
});

test("itemizeVsStandardBenefit: with no SALT deduction at all, marginalBenefit and whollyAbsorbed are both zero/false", () => {
  const r = itemizeVsStandardBenefit({ filingStatus: "single", taxYear: 2025, saltDeduction: 0, otherItemizedDeductions: 20_000 });
  assert.equal(r.marginalBenefit, 0);
  assert.equal(r.whollyAbsorbed, false, "no SALT deduction to absorb -- this is a different case from wholly-absorbed");
});

test("STANDARD_DEDUCTION table has both tax years the venture supports, for every filing status", () => {
  for (const year of [2025, 2026]) {
    for (const status of ["single", "mfs", "hoh", "mfj"]) {
      assert.equal(typeof STANDARD_DEDUCTION[year][status], "number");
    }
  }
});

test("a $1 tax bill is a real figure, so no 'enter your taxes' prompt", () => {
  const prompt = (r) => r.findings.some((f) => /Enter your state and local taxes/.test(f.title));
  assert.equal(prompt(saltCapOutcome({ magi: 100_000, stateLocalTaxesPaid: 0 })), true);
  assert.equal(prompt(saltCapOutcome({ magi: 100_000, stateLocalTaxesPaid: 1 })), false);
});
