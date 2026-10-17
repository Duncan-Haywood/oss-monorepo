import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  perPersonReduction,
  perPersonDeduction,
  computeSeniorDeduction,
  estimateTaxSavings,
  SENIOR_DEDUCTION_PER_PERSON,
  PHASEOUT_THRESHOLD_SINGLE,
  PHASEOUT_THRESHOLD_JOINT,
} from './calc.mjs';

test('perPersonReduction is zero at and below the threshold', () => {
  assert.equal(perPersonReduction(75000, 'single'), 0);
  assert.equal(perPersonReduction(150000, 'joint'), 0);
  assert.equal(perPersonReduction(0, 'single'), 0);
});

test('perPersonReduction is a continuous 6 cents per dollar of excess', () => {
  assert.equal(perPersonReduction(76000, 'single'), 60);
  assert.equal(perPersonReduction(85000, 'single'), 600);
  assert.equal(perPersonReduction(75001, 'single'), 0.06);
});

test('perPersonReduction clamps at the $6,000 it would reduce to zero', () => {
  assert.equal(perPersonReduction(500000, 'single'), SENIOR_DEDUCTION_PER_PERSON);
});

// Sourced zero-crossing points (WebSearch-verified 2026-09-24 against
// Kiplinger, H&R Block, Thomson Reuters Tax & Accounting, CNBC, and
// TurboTax): $6,000 / 6% = $100,000 of headroom above each threshold, so a
// single qualifying person's deduction reaches exactly $0 at $175,000 MAGI
// (single/HoH/QSS) or $250,000 MAGI (joint) -- the SAME joint zero-crossing
// point regardless of whether one or two spouses qualify, since each
// person's $6,000 phases out independently against the same MAGI excess.

test('perPersonDeduction reaches exactly $0 at $175,000 MAGI single, still positive just under it', () => {
  assert.equal(perPersonDeduction(175000, 'single'), 0);
  assert.ok(perPersonDeduction(174000, 'single') > 0);
});

test('perPersonDeduction reaches exactly $0 at $250,000 MAGI joint', () => {
  assert.equal(perPersonDeduction(250000, 'joint'), 0);
  assert.ok(perPersonDeduction(249000, 'joint') > 0);
});

test('married filing separately is never eligible, regardless of age, income, or the checkboxes passed', () => {
  const result = computeSeniorDeduction({
    filingStatus: 'mfs',
    magi: 10000,
    selfQualifies: true,
    spouseQualifies: true,
  });
  assert.equal(result.deduction, 0);
  assert.equal(result.qualifyingCount, 0);
  assert.ok(result.findings.some((f) => /Not eligible: married filing separately/.test(f.title)));
});

test('nobody marked as a qualifying senior yields $0 with an explanatory finding, not a silent zero', () => {
  const result = computeSeniorDeduction({ filingStatus: 'single', magi: 40000, selfQualifies: false });
  assert.equal(result.deduction, 0);
  assert.ok(result.findings.some((f) => /nobody on this return is a qualifying senior/.test(f.title)));
});

test('a single qualifying filer under the threshold gets the full $6,000', () => {
  const result = computeSeniorDeduction({ filingStatus: 'single', magi: 50000, selfQualifies: true });
  assert.equal(result.deduction, SENIOR_DEDUCTION_PER_PERSON);
  assert.equal(result.qualifyingCount, 1);
  assert.equal(result.cappedByPhaseOut, false);
});

test('head of household and qualifying surviving spouse use the same $75,000 threshold as single', () => {
  const hoh = computeSeniorDeduction({ filingStatus: 'hoh', magi: 76000, selfQualifies: true });
  const qss = computeSeniorDeduction({ filingStatus: 'qss', magi: 76000, selfQualifies: true });
  const single = computeSeniorDeduction({ filingStatus: 'single', magi: 76000, selfQualifies: true });
  assert.equal(hoh.deduction, single.deduction);
  assert.equal(qss.deduction, single.deduction);
});

test('a joint return with only one qualifying spouse gets $6,000, phased out on the $150,000 threshold', () => {
  const result = computeSeniorDeduction({ filingStatus: 'joint', magi: 140000, selfQualifies: true, spouseQualifies: false });
  assert.equal(result.deduction, SENIOR_DEDUCTION_PER_PERSON);
  assert.equal(result.qualifyingCount, 1);
});

test('a joint return with both spouses qualifying gets $12,000 below the threshold', () => {
  const result = computeSeniorDeduction({ filingStatus: 'joint', magi: 140000, selfQualifies: true, spouseQualifies: true });
  assert.equal(result.deduction, SENIOR_DEDUCTION_PER_PERSON * 2);
  assert.equal(result.qualifyingCount, 2);
  assert.ok(result.findings.some((f) => /Both spouses qualify/.test(f.title)));
});

test('one- and two-qualifying-spouse joint returns reach $0 at the SAME MAGI', () => {
  const magi = 250000;
  const one = computeSeniorDeduction({ filingStatus: 'joint', magi, selfQualifies: true, spouseQualifies: false });
  const two = computeSeniorDeduction({ filingStatus: 'joint', magi, selfQualifies: true, spouseQualifies: true });
  assert.equal(one.deduction, 0);
  assert.equal(two.deduction, 0);
  const justUnder = computeSeniorDeduction({ filingStatus: 'joint', magi: magi - 1000, selfQualifies: true, spouseQualifies: true });
  assert.ok(justUnder.deduction > 0);
});

test('spouseQualifies is ignored on a non-joint return', () => {
  const result = computeSeniorDeduction({ filingStatus: 'single', magi: 50000, selfQualifies: true, spouseQualifies: true });
  assert.equal(result.qualifyingCount, 1);
  assert.equal(result.deduction, SENIOR_DEDUCTION_PER_PERSON);
});

test('fully phased out at high income still reports the finding, not a silent zero', () => {
  const result = computeSeniorDeduction({ filingStatus: 'single', magi: 300000, selfQualifies: true });
  assert.equal(result.deduction, 0);
  assert.ok(result.findings.some((f) => /Fully phased out at this income/.test(f.title)));
});

test('every result mentions the deduction is temporary (2025-2028)', () => {
  const result = computeSeniorDeduction({ filingStatus: 'single', magi: 50000, selfQualifies: true });
  assert.ok(result.findings.some((f) => /2025.*2028|Temporary/i.test(f.title) || /2025.*2028/.test(f.detail)));
});

test('estimateTaxSavings applies the marginal rate and clamps to 0-100%', () => {
  assert.equal(estimateTaxSavings(6000, 22), 1320);
  assert.equal(estimateTaxSavings(6000, 150), 6000);
  assert.equal(estimateTaxSavings(6000, -5), 0);
});

test('estimatedSavings is included on a full compute pass', () => {
  const result = computeSeniorDeduction({ filingStatus: 'single', magi: 50000, selfQualifies: true, marginalRatePercent: 22 });
  assert.equal(result.estimatedSavings, 1320);
});

test('an ineligible return reports zero estimated savings, not a stale number', () => {
  const result = computeSeniorDeduction({ filingStatus: 'mfs', magi: 50000, selfQualifies: true, marginalRatePercent: 22 });
  assert.equal(result.estimatedSavings, 0);
});

test('threshold constants match the sourced figures', () => {
  assert.equal(PHASEOUT_THRESHOLD_SINGLE, 75000);
  assert.equal(PHASEOUT_THRESHOLD_JOINT, 150000);
  assert.equal(SENIOR_DEDUCTION_PER_PERSON, 6000);
});
