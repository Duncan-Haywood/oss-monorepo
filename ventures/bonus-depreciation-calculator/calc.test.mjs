import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  usableDeduction,
  section179Outcome,
  compareDepreciationPaths,
  money,
  SECTION_179_RULES,
  FIRST_YEAR_MACRS_RATE,
} from './calc.mjs';

// -- usableDeduction (shared cap-at-income helper) --------------------------

test('usableDeduction: a deduction under available income is fully usable, no NOL', () => {
  const r = usableDeduction(10000, 50000);
  assert.equal(r.usable, 10000);
  assert.equal(r.excess, 0);
  assert.equal(r.createsOrIncreasesNol, false);
});

test('usableDeduction: a deduction larger than income is capped, excess flagged', () => {
  const r = usableDeduction(50000, 10000);
  assert.equal(r.usable, 10000);
  assert.equal(r.excess, 40000);
  assert.equal(r.createsOrIncreasesNol, true);
});

test('usableDeduction: zero or negative income makes the whole deduction NOL-creating', () => {
  const zero = usableDeduction(20000, 0);
  assert.equal(zero.usable, 0);
  assert.equal(zero.createsOrIncreasesNol, true);
  const negative = usableDeduction(20000, -5000);
  assert.equal(negative.usable, 0);
  assert.equal(negative.createsOrIncreasesNol, true);
});

// -- section179Outcome -------------------------------------------------------

test('section179Outcome: well under the limit and phase-out, fully elected and usable', () => {
  const r = section179Outcome({ eligibleBasis: 100000, otherQualifyingPurchases: 0, incomeBeforeDeduction: 500000, taxYear: 2025 });
  assert.equal(r.elected, 100000);
  assert.equal(r.usable, 100000);
  assert.equal(r.carryforward, 0);
  assert.equal(r.incomeLimited, false);
  assert.equal(r.phasedOutToZero, false);
});

test('section179Outcome: 2025 limit and phase-out threshold match the OBBBA figures', () => {
  assert.equal(SECTION_179_RULES[2025].limit, 2_500_000);
  assert.equal(SECTION_179_RULES[2025].phaseoutThreshold, 4_000_000);
  assert.equal(SECTION_179_RULES[2026].limit, 2_560_000);
  assert.equal(SECTION_179_RULES[2026].phaseoutThreshold, 4_090_000);
});

test('section179Outcome: total qualifying purchases above the phase-out threshold reduce the limit dollar-for-dollar', () => {
  // 2025: threshold 4,000,000, limit 2,500,000. Total purchases 4,500,000 =>
  // reduction of 500,000 => limit falls to 2,000,000.
  const r = section179Outcome({ eligibleBasis: 4_500_000, otherQualifyingPurchases: 0, incomeBeforeDeduction: 10_000_000, taxYear: 2025 });
  assert.equal(r.totalQualifyingPurchases, 4_500_000);
  assert.equal(r.limitAfterPhaseout, 2_000_000);
  assert.equal(r.elected, 2_000_000);
});

test('section179Outcome: other purchases this year count toward the phase-out even though only this asset is being elected', () => {
  const r = section179Outcome({ eligibleBasis: 100_000, otherQualifyingPurchases: 4_100_000, incomeBeforeDeduction: 10_000_000, taxYear: 2025 });
  // total purchases 4,200,000 => reduction 200,000 => limit 2,300,000, but
  // this asset's own basis is only 100,000, so the full 100,000 is elected.
  assert.equal(r.totalQualifyingPurchases, 4_200_000);
  assert.equal(r.limitAfterPhaseout, 2_300_000);
  assert.equal(r.elected, 100_000);
});

test('section179Outcome: purchases far enough above the threshold phase the limit out to zero', () => {
  const r = section179Outcome({ eligibleBasis: 6_600_000, otherQualifyingPurchases: 0, incomeBeforeDeduction: 10_000_000, taxYear: 2025 });
  assert.equal(r.limitAfterPhaseout, 0);
  assert.equal(r.phasedOutToZero, true);
  assert.equal(r.elected, 0);
});

test('section179Outcome: elected amount above taxable income carries forward, not as an NOL', () => {
  const r = section179Outcome({ eligibleBasis: 100_000, otherQualifyingPurchases: 0, incomeBeforeDeduction: 30_000, taxYear: 2025 });
  assert.equal(r.elected, 100_000);
  assert.equal(r.usable, 30_000);
  assert.equal(r.carryforward, 70_000);
  assert.equal(r.incomeLimited, true);
});

test('section179Outcome: zero or negative income makes nothing usable, entire election carries forward', () => {
  const r = section179Outcome({ eligibleBasis: 50_000, incomeBeforeDeduction: -10_000, taxYear: 2025 });
  assert.equal(r.usable, 0);
  assert.equal(r.carryforward, 50_000);
});

test('section179Outcome: an unknown tax year falls back to the 2025 rules', () => {
  const r = section179Outcome({ eligibleBasis: 100_000, incomeBeforeDeduction: 500_000, taxYear: 2031 });
  assert.equal(r.limit, SECTION_179_RULES[2025].limit);
});

// -- compareDepreciationPaths -------------------------------------------------

test('zero asset cost: all three paths produce zero deduction and an info finding', () => {
  const r = compareDepreciationPaths({ assetCost: 0, taxableIncomeBeforeDeduction: 500000, ratePercent: 21 });
  assert.equal(r.bonus.deduction, 0);
  assert.equal(r.section179.elected, 0);
  assert.equal(r.macrs.year1Deduction, 0);
  assert.ok(r.findings.some((f) => /Enter an asset cost/i.test(f.title)));
});

test('bonus depreciation always deducts the full eligible basis, unlike Section 179', () => {
  const r = compareDepreciationPaths({
    assetCost: 3_000_000,
    businessUsePercent: 100,
    taxableIncomeBeforeDeduction: 10_000_000,
    ratePercent: 21,
    taxYear: 2025,
  });
  assert.equal(r.eligibleBasis, 3_000_000);
  assert.equal(r.bonus.deduction, 3_000_000);
  // 2025 limit 2,500,000, no phase-out at this size => elected capped at limit.
  assert.equal(r.section179.elected, 2_500_000);
  assert.ok(r.bonus.deduction > r.section179.elected);
});

test('business use percentage reduces the eligible basis proportionally for all three paths', () => {
  const r = compareDepreciationPaths({ assetCost: 100000, businessUsePercent: 60, taxableIncomeBeforeDeduction: 500000, ratePercent: 21 });
  assert.equal(r.eligibleBasis, 60000);
  assert.equal(r.bonus.deduction, 60000);
  assert.equal(r.section179.elected, 60000);
});

test('50% or less business use is flagged as disqualifying, and the boundary is inclusive', () => {
  const at50 = compareDepreciationPaths({ assetCost: 100000, businessUsePercent: 50, taxableIncomeBeforeDeduction: 500000, ratePercent: 21 });
  assert.equal(at50.belowHalfBusinessUse, true);
  assert.ok(at50.findings.some((f) => /50%/.test(f.title)));

  const above50 = compareDepreciationPaths({ assetCost: 100000, businessUsePercent: 51, taxableIncomeBeforeDeduction: 500000, ratePercent: 21 });
  assert.equal(above50.belowHalfBusinessUse, false);
});

test('MACRS year-1 deduction uses the correct first-year percentage per recovery period', () => {
  const five = compareDepreciationPaths({ assetCost: 100000, recoveryYears: 5, taxableIncomeBeforeDeduction: 500000, ratePercent: 21 });
  assert.ok(Math.abs(five.macrs.year1Deduction - 100000 * FIRST_YEAR_MACRS_RATE[5]) < 1e-9);

  const seven = compareDepreciationPaths({ assetCost: 100000, recoveryYears: 7, taxableIncomeBeforeDeduction: 500000, ratePercent: 21 });
  assert.ok(Math.abs(seven.macrs.year1Deduction - 100000 * FIRST_YEAR_MACRS_RATE[7]) < 1e-9);
});

test('an unknown recovery period falls back to 5-year property rather than throwing', () => {
  const r = compareDepreciationPaths({ assetCost: 100000, recoveryYears: 4, taxableIncomeBeforeDeduction: 500000, ratePercent: 21 });
  assert.equal(r.recoveryYears, 5);
  assert.ok(Math.abs(r.macrs.year1Deduction - 100000 * FIRST_YEAR_MACRS_RATE[5]) < 1e-9);
});

test('MACRS leaves a remaining basis to depreciate in future years; bonus and full 179 do not', () => {
  const r = compareDepreciationPaths({ assetCost: 100000, recoveryYears: 5, taxableIncomeBeforeDeduction: 500000, ratePercent: 21 });
  assert.ok(Math.abs(r.macrs.remainingBasis - (100000 - 100000 * FIRST_YEAR_MACRS_RATE[5])) < 1e-9);
  assert.ok(r.macrs.remainingBasis > 0);
});

test('cash savings equal the usable deduction times the rate, for each path', () => {
  const r = compareDepreciationPaths({ assetCost: 100000, taxableIncomeBeforeDeduction: 500000, ratePercent: 25 });
  assert.ok(Math.abs(r.bonus.cashSavings - r.bonus.usable * 0.25) < 1e-9);
  assert.ok(Math.abs(r.section179.cashSavings - r.section179.usable * 0.25) < 1e-9);
  assert.ok(Math.abs(r.macrs.cashSavings - r.macrs.usable * 0.25) < 1e-9);
});

test('a deduction bigger than income creates an NOL flag for bonus and MACRS, but a carryforward flag for Section 179', () => {
  const r = compareDepreciationPaths({ assetCost: 200000, taxableIncomeBeforeDeduction: 50000, ratePercent: 21, recoveryYears: 5 });
  assert.equal(r.bonus.createsOrIncreasesNol, true);
  assert.ok(r.findings.some((f) => /Bonus depreciation exceeds/i.test(f.title) && /NOL/.test(f.detail)));
  assert.ok(r.findings.some((f) => /Section 179 elected amount exceeds/i.test(f.title) && /CARRYFORWARD/.test(f.detail)));
});

test('phase-out findings only appear when purchases actually exceed the threshold', () => {
  const untouched = compareDepreciationPaths({ assetCost: 50000, taxableIncomeBeforeDeduction: 500000, ratePercent: 21, taxYear: 2025 });
  assert.ok(!untouched.findings.some((f) => /phase-out/i.test(f.title)));

  const reduced = compareDepreciationPaths({ assetCost: 4_500_000, taxableIncomeBeforeDeduction: 10_000_000, ratePercent: 21, taxYear: 2025 });
  assert.ok(reduced.findings.some((f) => /reduced by the phase-out/i.test(f.title)));
});

test('every result carries the federal-only / state-conformity informational finding', () => {
  const r = compareDepreciationPaths({ assetCost: 10000, taxableIncomeBeforeDeduction: 50000, ratePercent: 21 });
  assert.ok(r.findings.some((f) => /state conformity/i.test(f.detail) || /state conformity/i.test(f.title)));
});

test('negative asset cost is treated as zero, not thrown', () => {
  const r = compareDepreciationPaths({ assetCost: -5000, taxableIncomeBeforeDeduction: 50000, ratePercent: 21 });
  assert.equal(r.eligibleBasis, 0);
});

// -- money() ------------------------------------------------------------------

test('money() formats whole dollars with a thousands separator and no cents', () => {
  assert.equal(money(1000), '$1,000');
  assert.equal(money(0), '$0');
  assert.equal(money(2500000), '$2,500,000');
});
