import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCertifiedPayroll } from './calc.mjs';

const week = () => ({
  requiredBaseRate: 28,
  requiredFringeRate: 10.5,
  actualBaseRate: 28,
  bonaFideFringePerHour: 8.5,
  cashFringePerHour: 2,
  straightHours: 40,
  overtimeHours: 6,
});

function close(actual, expected, digits = 9) {
  assert.ok(
    Math.abs(actual - expected) < 10 ** -digits,
    `expected ${expected}, got ${actual}`,
  );
}

test('required and actual total rates combine base and every form of fringe', () => {
  const result = calculateCertifiedPayroll(week());
  close(result.requiredTotalRate, 28 + 10.5);
  close(result.actualTotalRate, 28 + 8.5 + 2);
});

test('paying at least the combined prevailing rate reports no shortfall', () => {
  const result = calculateCertifiedPayroll(week());
  assert.equal(result.shortfallPerHour, 0);
  assert.equal(result.compliant, true);
});

test('paying under the combined prevailing rate reports the per-hour gap', () => {
  const result = calculateCertifiedPayroll({ ...week(), actualBaseRate: 24 });
  close(result.shortfallPerHour, (28 + 10.5) - (24 + 8.5 + 2));
  assert.equal(result.compliant, false);
});

test('overtime premium applies to cash base plus cash-in-lieu-of-fringe, never a bona fide plan contribution', () => {
  const result = calculateCertifiedPayroll(week());
  const expectedStraightRate = 28 + 2;
  close(result.straightRatePerHour, expectedStraightRate);
  close(result.otRatePerHour, expectedStraightRate * 1.5);
});

test('total cash wages paid matches straight and overtime hours at the correct rates', () => {
  const result = calculateCertifiedPayroll(week());
  close(result.totalCashWagesPaid, 40 * 30 + 6 * 30 * 1.5);
});

test('bona fide fringe is paid at straight time across every hour, never at a premium', () => {
  const result = calculateCertifiedPayroll(week());
  close(result.totalBonaFideFringeDue, 46 * 8.5);
});

test('total compensation is cash wages plus the bona fide plan contribution', () => {
  const result = calculateCertifiedPayroll(week());
  close(result.totalCompensationPaid, result.totalCashWagesPaid + result.totalBonaFideFringeDue);
});

test('zero cash-in-lieu-of-fringe means the common-mistake comparison finds no difference', () => {
  const result = calculateCertifiedPayroll({ ...week(), cashFringePerHour: 0 });
  assert.equal(result.otUnderpaymentIfCashFringeExcluded, 0);
});

test('paying cash fringe at straight time during overtime undercounts by the fringe half-premium', () => {
  const result = calculateCertifiedPayroll(week());
  // The mistake pays 2 * overtimeHours less than correct at the 0.5 premium on cash fringe.
  close(result.otUnderpaymentIfCashFringeExcluded, 2 * 0.5 * 6);
  assert.ok(result.otUnderpaymentIfCashFringeExcluded > 0);
});

test('a fully compliant week reports zero total underpayment', () => {
  const result = calculateCertifiedPayroll(week());
  assert.equal(result.underpaymentTotal, 0);
});

test('an underpaid week reports the total dollar gap against paying the prevailing wage throughout', () => {
  const result = calculateCertifiedPayroll({ ...week(), actualBaseRate: 20, cashFringePerHour: 0, bonaFideFringePerHour: 0 });
  close(result.requiredGrossAtPrevailingWage, 28 * 40 + 28 * 1.5 * 6 + 10.5 * 46);
  close(result.totalCompensationPaid, 20 * 40 + 20 * 1.5 * 6);
  close(result.underpaymentTotal, result.requiredGrossAtPrevailingWage - result.totalCompensationPaid);
  assert.ok(result.underpaymentTotal > 0);
});

test('no ratio inputs means no ratio check is returned', () => {
  assert.equal(calculateCertifiedPayroll(week()).ratio, null);
  assert.equal(calculateCertifiedPayroll({ ...week(), journeymenOnSite: 4 }).ratio, null);
});

test('apprentices within the approved ratio report no excess', () => {
  const result = calculateCertifiedPayroll({
    ...week(),
    approvedRatioApprentices: 1,
    approvedRatioJourneymen: 3,
    journeymenOnSite: 6,
    apprenticesOnSite: 2,
  });
  assert.equal(result.ratio.allowed, 2);
  assert.equal(result.ratio.excess, 0);
  assert.equal(result.ratio.exceeded, false);
});

test('apprentices beyond the approved ratio are flagged with a count, not a rate override', () => {
  const result = calculateCertifiedPayroll({
    ...week(),
    approvedRatioApprentices: 1,
    approvedRatioJourneymen: 3,
    journeymenOnSite: 3,
    apprenticesOnSite: 3,
  });
  assert.equal(result.ratio.allowed, 1);
  assert.equal(result.ratio.excess, 2);
  assert.equal(result.ratio.exceeded, true);
  assert.equal(result.ratio.shortfallPerHour, null);
  assert.equal(result.ratio.shortfallTotal, null);
});

test('pricing the excess-apprentice shortfall needs the full journeyman rate and their hours', () => {
  const result = calculateCertifiedPayroll({
    ...week(),
    approvedRatioApprentices: 1,
    approvedRatioJourneymen: 3,
    journeymenOnSite: 3,
    apprenticesOnSite: 3,
    fullJourneymanRate: 38.5,
    excessApprenticeHours: 80,
  });
  close(result.ratio.shortfallPerHour, 38.5 - result.actualTotalRate);
  close(result.ratio.shortfallTotal, result.ratio.shortfallPerHour * 80);
});

test('a zero approved-ratio denominator is refused rather than dividing by zero', () => {
  assert.throws(
    () => calculateCertifiedPayroll({
      ...week(),
      approvedRatioApprentices: 1,
      approvedRatioJourneymen: 0,
      journeymenOnSite: 3,
      apprenticesOnSite: 1,
    }),
    /greater than 0/,
  );
});

test('inputs that would silently produce a nonsense week are rejected', () => {
  assert.throws(() => calculateCertifiedPayroll({ ...week(), straightHours: -1 }), /at least 0/);
  assert.throws(() => calculateCertifiedPayroll({ ...week(), actualBaseRate: 'abc' }), /must be a number/);
  assert.throws(() => calculateCertifiedPayroll({ ...week(), overtimeHours: -5 }), /at least 0/);
});
