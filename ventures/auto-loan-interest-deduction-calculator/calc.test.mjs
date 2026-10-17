import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  phaseOutReduction,
  computeQualifiedVehicleInterestDeduction,
  unmetCriteria,
  estimateTaxSavings,
  QPVLI_CAP,
  ELIGIBILITY_CRITERIA,
} from './calc.mjs';

function allMet(overrides = {}) {
  const criteria = {};
  for (const c of ELIGIBILITY_CRITERIA) criteria[c.key] = true;
  return { ...criteria, ...overrides };
}

test('phaseOutReduction is zero at and below the threshold', () => {
  assert.equal(phaseOutReduction(100000, 'single'), 0);
  assert.equal(phaseOutReduction(200000, 'joint'), 0);
  assert.equal(phaseOutReduction(0, 'single'), 0);
});

test('phaseOutReduction rounds the excess up to the next $1,000 ("or fraction thereof")', () => {
  assert.equal(phaseOutReduction(100001, 'single'), 200);
  assert.equal(phaseOutReduction(100999, 'single'), 200);
  assert.equal(phaseOutReduction(101000, 'single'), 200);
  assert.equal(phaseOutReduction(101001, 'single'), 400);
});

test('phaseOutReduction: $15,000 over threshold reduces by $3,000', () => {
  assert.equal(phaseOutReduction(115000, 'single'), 3000);
});

// Sourced zero-crossing points (WebSearch-verified 2026-09-24 against RSM,
// H&R Block, Thomson Reuters Tax & Accounting, and the Federal Register's
// own proposed-regulations notice): $10,000 cap / $200 per $1,000 = $50,000
// of headroom above each threshold, so the deduction reaches exactly $0 at
// $150,000 MAGI single/HoH/MFS and $250,000 MAGI joint.

test('deduction reaches exactly $0 at $150,000 MAGI single, still positive just under it', () => {
  const atZero = computeQualifiedVehicleInterestDeduction({ interestPaid: 9000, filingStatus: 'single', magi: 150000, criteria: allMet() });
  assert.equal(atZero.deduction, 0);
  const justUnder = computeQualifiedVehicleInterestDeduction({ interestPaid: 9000, filingStatus: 'single', magi: 149000, criteria: allMet() });
  assert.equal(justUnder.deduction, 200);
});

test('deduction reaches $0 at $250,000 MAGI joint', () => {
  const result = computeQualifiedVehicleInterestDeduction({ interestPaid: 9000, filingStatus: 'joint', magi: 250000, criteria: allMet() });
  assert.equal(result.deduction, 0);
});

test('deduction reaches $0 at $150,000 MAGI for MFS too, using the single threshold', () => {
  const result = computeQualifiedVehicleInterestDeduction({ interestPaid: 9000, filingStatus: 'mfs', magi: 150000, criteria: allMet() });
  assert.equal(result.deduction, 0);
});

test('full amount deductible below the threshold and under the cap', () => {
  const result = computeQualifiedVehicleInterestDeduction({ interestPaid: 3200, filingStatus: 'single', magi: 60000, criteria: allMet() });
  assert.equal(result.deduction, 3200);
  assert.equal(result.cappedByPhaseOut, false);
});

test('interest capped at the statutory $10,000 maximum regardless of income, and does not double for joint', () => {
  const single = computeQualifiedVehicleInterestDeduction({ interestPaid: 15000, filingStatus: 'single', magi: 50000, criteria: allMet() });
  assert.equal(single.deduction, QPVLI_CAP);
  const joint = computeQualifiedVehicleInterestDeduction({ interestPaid: 15000, filingStatus: 'joint', magi: 50000, criteria: allMet() });
  assert.equal(joint.deduction, QPVLI_CAP);
});

test('married filing separately IS eligible, unlike the tips/overtime deduction, and gets an explanatory finding', () => {
  const result = computeQualifiedVehicleInterestDeduction({ interestPaid: 4000, filingStatus: 'mfs', magi: 60000, criteria: allMet() });
  assert.equal(result.deduction, 4000);
  assert.ok(result.findings.some((f) => /MFS is eligible here/.test(f.title)));
});

test('joint filing gets the shared-cap explanatory finding', () => {
  const result = computeQualifiedVehicleInterestDeduction({ interestPaid: 4000, filingStatus: 'joint', magi: 60000, criteria: allMet() });
  assert.ok(result.findings.some((f) => /One shared \$10,000 cap/.test(f.title)));
});

test('any single unmet eligibility criterion zeroes the deduction and names itself', () => {
  for (const c of ELIGIBILITY_CRITERIA) {
    const result = computeQualifiedVehicleInterestDeduction({
      interestPaid: 5000,
      filingStatus: 'single',
      magi: 50000,
      criteria: allMet({ [c.key]: false }),
    });
    assert.equal(result.deduction, 0, `expected $0 when ${c.key} is unmet`);
    assert.deepEqual(result.unmetCriteria, [c.key]);
  }
});

test('multiple unmet criteria are all named', () => {
  const result = computeQualifiedVehicleInterestDeduction({
    interestPaid: 5000,
    filingStatus: 'single',
    magi: 50000,
    criteria: allMet({ finalAssemblyUs: false, isLoanNotLease: false }),
  });
  assert.equal(result.deduction, 0);
  assert.deepEqual(result.unmetCriteria.sort(), ['finalAssemblyUs', 'isLoanNotLease'].sort());
  assert.equal(result.findings.length, 2);
});

test('a lease is explicitly disqualifying even if every other criterion is met', () => {
  const result = computeQualifiedVehicleInterestDeduction({
    interestPaid: 6000,
    filingStatus: 'single',
    magi: 50000,
    criteria: allMet({ isLoanNotLease: false }),
  });
  assert.equal(result.deduction, 0);
  assert.ok(result.findings[0].detail.includes('loan, not a lease'));
});

test('unmetCriteria helper mirrors what the compute function uses', () => {
  assert.deepEqual(unmetCriteria(allMet()), []);
  assert.equal(unmetCriteria({}).length, ELIGIBILITY_CRITERIA.length);
});

test('estimateTaxSavings applies the marginal rate and clamps to 0-100%', () => {
  assert.equal(estimateTaxSavings(10000, 22), 2200);
  assert.equal(estimateTaxSavings(10000, 150), 10000);
  assert.equal(estimateTaxSavings(10000, -5), 0);
});

test('estimatedSavings is included on a full compute pass', () => {
  const result = computeQualifiedVehicleInterestDeduction({
    interestPaid: 4000,
    filingStatus: 'single',
    magi: 50000,
    criteria: allMet(),
    marginalRatePercent: 22,
  });
  assert.equal(result.estimatedSavings, 880);
});

test('an ineligible vehicle reports zero estimated savings, not a stale number', () => {
  const result = computeQualifiedVehicleInterestDeduction({
    interestPaid: 4000,
    filingStatus: 'single',
    magi: 50000,
    criteria: allMet({ isNew: false }),
    marginalRatePercent: 22,
  });
  assert.equal(result.estimatedSavings, 0);
});
