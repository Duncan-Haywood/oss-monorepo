import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  saltCapParameters,
  phaseDownReduction,
  allowedSaltCap,
  computeSaltCapDeduction,
  marginalItemizedBenefit,
  estimateTaxSavings,
  money,
  FIRST_YEAR,
  LAST_PHASEDOWN_YEAR,
  REVERT_YEAR,
} from './calc.mjs';

// Sourced figures (WebSearch-verified 2026-09-25 against Kiplinger, Venable
// LLP, Thomson Reuters, Bipartisan Policy Center, and the IRS's own
// tax-year-2026 inflation-adjustment release).

test('2025 confirmed parameters: $40,000 cap, $500,000 threshold, $10,000 floor', () => {
  const p = saltCapParameters(2025, 'single');
  assert.equal(p.cap, 40000);
  assert.equal(p.threshold, 500000);
  assert.equal(p.floor, 10000);
  assert.equal(p.confirmed, true);
  assert.equal(p.phaseDownApplies, true);
});

test('2025 confirmed MFS parameters are exactly half', () => {
  const p = saltCapParameters(2025, 'mfs');
  assert.equal(p.cap, 20000);
  assert.equal(p.threshold, 250000);
  assert.equal(p.floor, 5000);
});

test('2026 confirmed parameters match the IRS\'s own published figures', () => {
  const joint = saltCapParameters(2026, 'joint');
  assert.equal(joint.cap, 40400);
  assert.equal(joint.threshold, 505000);
  assert.equal(joint.confirmed, true);

  const mfs = saltCapParameters(2026, 'mfs');
  assert.equal(mfs.cap, 20200);
  assert.equal(mfs.threshold, 252500);
});

test('filing statuses other than mfs (single, hoh, joint) all use the same full table', () => {
  for (const status of ['single', 'hoh', 'joint']) {
    const p = saltCapParameters(2025, status);
    assert.equal(p.cap, 40000);
    assert.equal(p.threshold, 500000);
  }
});

test('2027-2029 are projected by compounding 1%/year from the confirmed 2026 base, and marked unconfirmed', () => {
  const y2027 = saltCapParameters(2027, 'joint');
  assert.equal(y2027.cap, 40804); // 40400 * 1.01
  assert.equal(y2027.threshold, 510050); // 505000 * 1.01
  assert.equal(y2027.confirmed, false);

  const y2028 = saltCapParameters(2028, 'joint');
  assert.equal(y2028.cap, Math.round(40804 * 1.01));
  assert.equal(y2028.confirmed, false);

  const y2029 = saltCapParameters(2029, 'joint');
  assert.equal(y2029.confirmed, false);
  assert.ok(y2029.cap > y2028.cap, 'each projected year should compound higher than the last');
});

test('tax year 2030 and later reverts to a flat $10,000 ($5,000 MFS) cap with no phase-down at all', () => {
  const joint2030 = saltCapParameters(2030, 'joint');
  assert.equal(joint2030.cap, 10000);
  assert.equal(joint2030.phaseDownApplies, false);
  assert.equal(joint2030.threshold, null);

  const mfs2031 = saltCapParameters(2031, 'mfs');
  assert.equal(mfs2031.cap, 5000);
  assert.equal(mfs2031.phaseDownApplies, false);
});

test('phaseDownReduction is zero at and below the threshold', () => {
  assert.equal(phaseDownReduction(500000, 2025, 'single'), 0);
  assert.equal(phaseDownReduction(0, 2025, 'single'), 0);
  assert.equal(phaseDownReduction(499999, 2025, 'joint'), 0);
});

test('phaseDownReduction is 30% of the excess over the threshold', () => {
  assert.equal(phaseDownReduction(550000, 2025, 'single'), 15000);
  assert.equal(phaseDownReduction(600000, 2025, 'joint'), 30000);
});

// Sourced worked example (Bipartisan Policy Center et al.): "A couple with
// $550,000 of AGI in 2025 ... $15,000 of the deduction would be disallowed
// ... taxpayers would still be eligible to deduct $25,000 in SALT."
test('worked example: $550,000 MAGI in 2025 leaves a $25,000 cap', () => {
  assert.equal(allowedSaltCap(550000, 2025, 'joint'), 25000);
});

// Sourced zero-benefit crossing point: "$600,000 or more (or $300,000 for
// married filing separately) see no benefit and remain limited to a
// $10,000 deduction." $40,000 - $10,000 = $30,000 of headroom to remove;
// at 30%/dollar that is $100,000 of excess MAGI above the $500,000
// threshold, landing exactly on $600,000 (and $250,000 + $50,000/0.3 * ...
// for MFS: $20,000 - $5,000 = $15,000 to remove / 30% = $50,000 of excess
// above the $250,000 MFS threshold = $300,000).
test('the cap is fully phased down to the $10,000 floor at exactly $600,000 MAGI in 2025, and stays there above it', () => {
  assert.equal(allowedSaltCap(600000, 2025, 'joint'), 10000);
  assert.equal(allowedSaltCap(600000, 2025, 'single'), 10000);
  assert.equal(allowedSaltCap(750000, 2025, 'single'), 10000); // never goes below the floor
});

test('the MFS cap is fully phased down to its $5,000 floor at exactly $300,000 MAGI in 2025', () => {
  assert.equal(allowedSaltCap(300000, 2025, 'mfs'), 5000);
  assert.equal(allowedSaltCap(400000, 2025, 'mfs'), 5000);
});

test('2026: $555,000 MAGI (joint) leaves a $25,400 cap, using the IRS\'s own 2026 figures', () => {
  // excess = 555000 - 505000 = 50000; reduction = 15000; cap = 40400 - 15000
  assert.equal(allowedSaltCap(555000, 2026, 'joint'), 25400);
});

test('below the threshold, the full cap is available regardless of income', () => {
  assert.equal(allowedSaltCap(90000, 2025, 'single'), 40000);
  assert.equal(allowedSaltCap(0, 2025, 'joint'), 40000);
});

test('computeSaltCapDeduction caps the deduction at the allowed cap and reports what was disallowed', () => {
  const result = computeSaltCapDeduction({ saltPaid: 32000, magi: 550000, year: 2025, filingStatus: 'joint' });
  assert.equal(result.cap, 25000);
  assert.equal(result.deduction, 25000);
  assert.equal(result.disallowed, 7000);
  assert.ok(result.findings.some((f) => /not deductible/i.test(f.title)));
});

test('computeSaltCapDeduction: SALT paid under the cap is fully deductible with no disallowed amount', () => {
  const result = computeSaltCapDeduction({ saltPaid: 18000, magi: 200000, year: 2025, filingStatus: 'single' });
  assert.equal(result.deduction, 18000);
  assert.equal(result.disallowed, 0);
  assert.ok(result.findings.some((f) => /all of your salt paid is deductible/i.test(f.title)));
});

test('computeSaltCapDeduction flags a reverted year distinctly from a phased-down year', () => {
  const reverted = computeSaltCapDeduction({ saltPaid: 30000, magi: 100000, year: 2030, filingStatus: 'joint' });
  assert.equal(reverted.reverted, true);
  assert.equal(reverted.cap, 10000);
  assert.ok(reverted.findings.some((f) => /reverted/i.test(f.title)));

  const notReverted = computeSaltCapDeduction({ saltPaid: 30000, magi: 100000, year: 2026, filingStatus: 'joint' });
  assert.equal(notReverted.reverted, false);
});

test('computeSaltCapDeduction flags a projected (unconfirmed) year', () => {
  const result = computeSaltCapDeduction({ saltPaid: 20000, magi: 100000, year: 2028, filingStatus: 'single' });
  assert.equal(result.confirmed, false);
  assert.ok(result.findings.some((f) => /projected, not yet IRS-published/i.test(f.title)));
});

test('computeSaltCapDeduction with zero SALT paid reports zero deduction and no disallowed/fully-deductible finding', () => {
  const result = computeSaltCapDeduction({ saltPaid: 0, magi: 100000, year: 2025, filingStatus: 'single' });
  assert.equal(result.deduction, 0);
  assert.equal(result.disallowed, 0);
});

test('marginalItemizedBenefit: SALT is the ONLY thing pushing past the standard deduction -- only the excess is marginal', () => {
  const result = marginalItemizedBenefit({
    saltDeduction: 40000,
    otherItemizedDeductions: 0,
    standardDeduction: 31500,
    marginalRatePercent: 24,
  });
  assert.equal(result.totalItemized, 40000);
  assert.equal(result.recommendItemize, true);
  assert.equal(result.marginalSalt, 8500); // 40000 - (31500 - 0)
  assert.equal(result.marginalBenefit, 8500 * 0.24);
});

test('marginalItemizedBenefit: other itemized deductions alone already clear the standard deduction -- ALL of SALT is marginal', () => {
  const result = marginalItemizedBenefit({
    saltDeduction: 25000,
    otherItemizedDeductions: 40000,
    standardDeduction: 31500,
    marginalRatePercent: 24,
  });
  assert.equal(result.marginalSalt, 25000);
  assert.equal(result.marginalBenefit, 25000 * 0.24);
});

test('marginalItemizedBenefit: total itemized still below the standard deduction -- nothing is marginal, and itemizing is not recommended', () => {
  const result = marginalItemizedBenefit({
    saltDeduction: 8000,
    otherItemizedDeductions: 5000,
    standardDeduction: 31500,
    marginalRatePercent: 24,
  });
  assert.equal(result.recommendItemize, false);
  assert.equal(result.marginalSalt, 0);
  assert.equal(result.marginalBenefit, 0);
});

test('estimateTaxSavings applies the marginal rate and clamps to 0-100%', () => {
  assert.equal(estimateTaxSavings(10000, 24), 2400);
  assert.equal(estimateTaxSavings(10000, 150), 10000);
  assert.equal(estimateTaxSavings(10000, -5), 0);
});

test('money formats whole dollars with a thousands separator', () => {
  assert.equal(money(40000), '$40,000');
  assert.equal(money(0), '$0');
});

test('exported year constants match the statute\'s own windows', () => {
  assert.equal(FIRST_YEAR, 2025);
  assert.equal(LAST_PHASEDOWN_YEAR, 2029);
  assert.equal(REVERT_YEAR, 2030);
});
