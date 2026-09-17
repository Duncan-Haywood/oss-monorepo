import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  phaseOutReduction,
  computeQualifiedTipDeduction,
  computeQualifiedOvertimeDeduction,
  computeOvertimePremiumRow,
  sumOvertimePremiumRows,
  estimateTaxSavings,
  computeCombinedEstimate,
  TIP_DEDUCTION_CAP,
  OVERTIME_CAP_SINGLE,
  OVERTIME_CAP_JOINT,
} from './calc.mjs';

test('phaseOutReduction is zero at and below the threshold', () => {
  assert.equal(phaseOutReduction(150000, 'single'), 0);
  assert.equal(phaseOutReduction(300000, 'joint'), 0);
  assert.equal(phaseOutReduction(0, 'single'), 0);
});

test('phaseOutReduction rounds the excess up to the next $1,000 ("or fraction thereof")', () => {
  // $1 over the threshold still costs a full $100 -- the statute's
  // "$1,000 or fraction of $1,000" wording, not a linear ramp.
  assert.equal(phaseOutReduction(150001, 'single'), 100);
  assert.equal(phaseOutReduction(150999, 'single'), 100);
  assert.equal(phaseOutReduction(151000, 'single'), 100);
  assert.equal(phaseOutReduction(151001, 'single'), 200);
});

test('phaseOutReduction: $15,000 over threshold reduces by $1,500', () => {
  assert.equal(phaseOutReduction(165000, 'single'), 1500);
});

// Sourced zero-crossing points, independently reported the same way across
// every source checked during graduation (IRS FAQ summaries, Fidelity,
// TurboTax, TaxAct, USAPaycheck): tips zero out at $400k single / $550k
// joint; overtime zero out at $275k single / $550k joint. These fix the
// $100-per-$1,000 rate against real published figures rather than trusting
// one secondary source's worked example (one search summary during
// research computed a $165k-MAGI example inconsistently with its own
// stated formula; these fixtures are the formula's self-consistent
// zero-crossing points instead, cross-checked across multiple sources).

test('tip deduction reaches exactly $0 at $400,000 MAGI single, still positive just under it', () => {
  const atZero = computeQualifiedTipDeduction({ qualifiedTips: 30000, filingStatus: 'single', magi: 400000 });
  assert.equal(atZero.deduction, 0);
  const justUnder = computeQualifiedTipDeduction({ qualifiedTips: 30000, filingStatus: 'single', magi: 399000 });
  assert.equal(justUnder.deduction, 100);
});

test('tip deduction reaches $0 at $550,000 MAGI joint', () => {
  const result = computeQualifiedTipDeduction({ qualifiedTips: 30000, filingStatus: 'joint', magi: 550000 });
  assert.equal(result.deduction, 0);
});

test('overtime deduction (single/HoH, $12,500 cap) reaches $0 at $275,000 MAGI', () => {
  const result = computeQualifiedOvertimeDeduction({ overtimePremium: 15000, filingStatus: 'single', magi: 275000 });
  assert.equal(result.deduction, 0);
  const hoh = computeQualifiedOvertimeDeduction({ overtimePremium: 15000, filingStatus: 'hoh', magi: 275000 });
  assert.equal(hoh.deduction, 0);
});

test('overtime deduction (joint, $25,000 cap) reaches $0 at $550,000 MAGI', () => {
  const result = computeQualifiedOvertimeDeduction({ overtimePremium: 30000, filingStatus: 'joint', magi: 550000 });
  assert.equal(result.deduction, 0);
});

test('full deduction below threshold and under the cap', () => {
  const tips = computeQualifiedTipDeduction({ qualifiedTips: 8000, filingStatus: 'single', magi: 60000 });
  assert.equal(tips.deduction, 8000);
  assert.equal(tips.cappedByPhaseOut, false);

  const ot = computeQualifiedOvertimeDeduction({ overtimePremium: 3000, filingStatus: 'single', magi: 60000 });
  assert.equal(ot.deduction, 3000);
});

test('tips capped at the statutory $25,000 maximum regardless of income', () => {
  const result = computeQualifiedTipDeduction({ qualifiedTips: 60000, filingStatus: 'single', magi: 50000 });
  assert.equal(result.deduction, TIP_DEDUCTION_CAP);
});

test('overtime capped at $12,500 single, $25,000 joint', () => {
  const single = computeQualifiedOvertimeDeduction({ overtimePremium: 20000, filingStatus: 'single', magi: 50000 });
  assert.equal(single.deduction, OVERTIME_CAP_SINGLE);
  const joint = computeQualifiedOvertimeDeduction({ overtimePremium: 40000, filingStatus: 'joint', magi: 50000 });
  assert.equal(joint.deduction, OVERTIME_CAP_JOINT);
});

test('married filing separately is not eligible for either deduction', () => {
  const tips = computeQualifiedTipDeduction({ qualifiedTips: 10000, filingStatus: 'mfs', magi: 60000 });
  assert.equal(tips.deduction, 0);
  assert.match(tips.findings[0].title, /does not qualify/);

  const ot = computeQualifiedOvertimeDeduction({ overtimePremium: 10000, filingStatus: 'mfs', magi: 60000 });
  assert.equal(ot.deduction, 0);
});

test('self-employed tip deduction cannot exceed net profit from the tipped work', () => {
  const result = computeQualifiedTipDeduction({
    qualifiedTips: 12000,
    filingStatus: 'single',
    magi: 40000,
    isSelfEmployed: true,
    netProfitFromTippedWork: 5000,
  });
  assert.equal(result.deduction, 5000);
  assert.equal(result.cappedByNetProfit, true);
});

test('self-employed net profit above qualified tips does not raise the deduction', () => {
  const result = computeQualifiedTipDeduction({
    qualifiedTips: 4000,
    filingStatus: 'single',
    magi: 40000,
    isSelfEmployed: true,
    netProfitFromTippedWork: 50000,
  });
  assert.equal(result.deduction, 4000);
  assert.equal(result.cappedByNetProfit, false);
});

test('computeOvertimePremiumRow is half the rate times overtime hours times weeks', () => {
  // $20/hr, 5 OT hours/week, 10 weeks -> 20 * 0.5 * 5 * 10 = $500
  assert.equal(computeOvertimePremiumRow({ hourlyRate: 20, overtimeHours: 5, weeks: 10 }), 500);
});

test('computeOvertimePremiumRow: the classic wrong answer is double this', () => {
  // The common by-hand mistake is the FULL 1.5x rate on overtime hours,
  // not the half-time premium. Confirm this function returns the smaller,
  // correct figure, not the naive 1.5x one.
  const correct = computeOvertimePremiumRow({ hourlyRate: 20, overtimeHours: 5, weeks: 1 });
  const naiveFullRate = 20 * 1.5 * 5;
  assert.equal(correct, 50);
  assert.ok(correct < naiveFullRate);
});

test('sumOvertimePremiumRows adds multiple weeks/rates', () => {
  const total = sumOvertimePremiumRows([
    { hourlyRate: 20, overtimeHours: 5, weeks: 10 },
    { hourlyRate: 25, overtimeHours: 2, weeks: 8 },
  ]);
  assert.equal(total, 500 + 200);
});

test('estimateTaxSavings applies the marginal rate and clamps to 0-100%', () => {
  assert.equal(estimateTaxSavings(10000, 22), 2200);
  assert.equal(estimateTaxSavings(10000, 150), 10000);
  assert.equal(estimateTaxSavings(10000, -5), 0);
});

test('computeCombinedEstimate sums both deductions and estimates savings', () => {
  const result = computeCombinedEstimate({
    filingStatus: 'single',
    magi: 60000,
    qualifiedTips: 8000,
    overtimePremium: 2000,
    marginalRatePercent: 22,
  });
  assert.equal(result.totalDeduction, 10000);
  assert.equal(result.estimatedSavings, 2200);
  assert.ok(result.findings.some((f) => /Payroll and state tax/.test(f.title)));
});

test('computeCombinedEstimate zeroes the tip deduction when occupation eligibility is declined', () => {
  const result = computeCombinedEstimate({
    filingStatus: 'single',
    magi: 40000,
    qualifiedTips: 8000,
    overtimePremium: 0,
    marginalRatePercent: 22,
    occupationEligible: false,
  });
  assert.equal(result.tipDeduction, 0);
  assert.ok(result.findings.some((f) => /Occupation eligibility/.test(f.title)));
});

test('computeCombinedEstimate: MFS zeroes out both deductions with an explicit finding', () => {
  const result = computeCombinedEstimate({
    filingStatus: 'mfs',
    magi: 60000,
    qualifiedTips: 8000,
    overtimePremium: 2000,
    marginalRatePercent: 22,
  });
  assert.equal(result.totalDeduction, 0);
  assert.equal(result.findings.filter((f) => /does not qualify/.test(f.title)).length, 2);
});
