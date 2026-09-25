import { test } from "node:test";
import assert from "node:assert/strict";
import { charitableDeductionOutcome, money, NON_ITEMIZER_CAP } from "./calc.mjs";

test("small giving: non-itemizer deduction is the full amount up to the cap", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 100_000, cashGiving: 500 });
  assert.equal(r.nonItemizerDeduction, 500);
  assert.equal(r.nonItemizerExcess, 0);
});

test("giving above the non-itemizer cap: deduction stays capped, excess flagged", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 100_000, cashGiving: 3_000 });
  assert.equal(r.nonItemizerDeduction, 1_000);
  assert.equal(r.nonItemizerExcess, 2_000);
});

test("married filing jointly gets the $2,000 cap; single/HOH/MFS get $1,000", () => {
  assert.equal(NON_ITEMIZER_CAP.mfj, 2_000);
  assert.equal(NON_ITEMIZER_CAP.single, 1_000);
  assert.equal(NON_ITEMIZER_CAP.hoh, 1_000);
  assert.equal(NON_ITEMIZER_CAP.mfs, 1_000);
});

test("the 0.5% AGI floor washes out the first slice of itemized giving", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 200_000, cashGiving: 1_000 });
  assert.equal(r.floor, 1_000); // 0.5% of 200,000
  assert.equal(r.washedOutByFloor, 1_000);
  assert.equal(r.itemizedDeduction, 0, "the whole $1,000 gift is washed out by the $1,000 floor");
});

test("giving above the floor: only the excess over the floor is itemized-deductible", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 200_000, cashGiving: 5_000 });
  assert.equal(r.floor, 1_000);
  assert.equal(r.itemizedDeduction, 4_000);
});

test("the 60%-of-AGI ceiling caps deductible cash gifts before the floor is applied", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 50_000, cashGiving: 40_000 });
  assert.equal(r.ceiling, 30_000); // 60% of 50,000
  assert.equal(r.cappedByCeiling, 30_000);
  assert.equal(r.disallowedByCeiling, 10_000);
  assert.equal(r.floor, 250); // 0.5% of 50,000
  assert.equal(r.itemizedDeduction, 30_000 - 250);
});

test("at low giving relative to AGI, the non-itemizer path usually wins", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 500_000, cashGiving: 1_000 });
  // floor = 0.5% of 500,000 = 2,500, which exceeds the $1,000 gift entirely
  assert.equal(r.itemizedDeduction, 0);
  assert.equal(r.nonItemizerDeduction, 1_000);
  assert.equal(r.betterPath, "non-itemizer");
});

test("at high giving relative to AGI, the itemized path usually wins", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 100_000, cashGiving: 20_000 });
  // floor = 500; itemized = 20,000 - 500 = 19,500, well above the $1,000 non-itemizer cap
  assert.equal(r.itemizedDeduction, 19_500);
  assert.equal(r.nonItemizerDeduction, 1_000);
  assert.equal(r.betterPath, "itemized");
  assert.equal(r.difference, 18_500);
});

test("an exact tie is reported as a tie, not arbitrarily one path", () => {
  // Choose AGI/giving so itemized (after floor) exactly equals the non-itemizer cap.
  // agi=100,000 -> floor=500. giving - 500 = 1000 -> giving = 1500.
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 100_000, cashGiving: 1_500 });
  assert.equal(r.itemizedDeduction, 1_000);
  assert.equal(r.nonItemizerDeduction, 1_000);
  assert.equal(r.betterPath, "tie");
  assert.equal(r.difference, 0);
});

test("zero giving produces zero deduction on both paths and an info finding", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 100_000, cashGiving: 0 });
  assert.equal(r.nonItemizerDeduction, 0);
  assert.equal(r.itemizedDeduction, 0);
  assert.match(r.findings[0].title, /Enter your cash giving/);
});

test("negative or missing inputs are treated as zero, never negative", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: -1000, cashGiving: -500 });
  assert.equal(r.agi, 0);
  assert.equal(r.giving, 0);
  assert.equal(r.itemizedDeduction, 0);
});

test("an unrecognized filing status falls back to the single/non-joint $1,000 cap", () => {
  const r = charitableDeductionOutcome({ filingStatus: "nonsense", agi: 100_000, cashGiving: 500 });
  assert.equal(r.nonItemizerCap, 1_000);
});

test("findings always flag the cash-only, public-charity-only scope", () => {
  const r = charitableDeductionOutcome({ filingStatus: "single", agi: 100_000, cashGiving: 500 });
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /Cash gifts to public charities only/);
});

test("money() formats negative values with a leading minus and no double sign", () => {
  assert.equal(money(1234), "$1,234");
  assert.equal(money(-1234), "-$1,234");
  assert.equal(money(0), "$0");
});
