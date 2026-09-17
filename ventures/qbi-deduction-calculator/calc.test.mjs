import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQbiDeduction, computeBusinessComponent, thresholdFor, estimateTaxSavings, money, THRESHOLDS,
} from './calc.mjs';

test('below threshold: unreduced 20% of QBI, no wage/UBIA limit applied', () => {
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 100000, qbi: 100000,
  });
  assert.equal(r.deduction, 20000);
  assert.equal(r.limitedByOverallCap, false);
});

test('fully above threshold, non-SSTB: capped at the greater of the two wage/UBIA tests', () => {
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 600000, qbi: 500000, w2Wages: 100000, ubia: 0,
  });
  // tentative 20% = 100000; wage limit = max(50000, 25000) = 50000
  assert.equal(r.deduction, 50000);
  assert.ok(r.findings.some((f) => /wages/i.test(f.title)));
});

test('fully above threshold, SSTB: $0 from that business', () => {
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 600000, qbi: 500000, isSstb: true, w2Wages: 500000,
  });
  assert.equal(r.deduction, 0);
  assert.ok(r.findings.some((f) => /fully phased out/i.test(f.title)));
});

test('SSTB fully below threshold behaves like a non-SSTB: unreduced 20%', () => {
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 100000, qbi: 100000, isSstb: true,
  });
  assert.equal(r.deduction, 20000);
});

test('non-SSTB inside the phase-in range: proportional blend between unlimited and wage-limited', () => {
  // single 2025: threshold 191950, range 50000. excess 25000 => ratio 0.5.
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 216950, qbi: 200000, w2Wages: 20000, ubia: 0,
  });
  // tentative 40000; wage limit max(10000, 5000) = 10000; overage 30000 * 0.5 = 15000
  assert.equal(r.deduction, 25000);
});

test('SSTB inside the phase-in range: QBI, wages, and UBIA all scaled by the applicable percentage first', () => {
  const r = computeBusinessComponent({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 216950, qbi: 200000, isSstb: true, w2Wages: 20000, ubia: 0,
  });
  // applicable percentage 50%: adjQbi 100000, adjWages 10000; wage limit 5000; 20% of adjQbi = 20000
  assert.equal(r.component, 5000);
});

test('negative QBI produces no deduction and a carryforward finding, not a negative number', () => {
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 100000, qbi: -5000,
  });
  assert.equal(r.deduction, 0);
  assert.ok(r.findings.some((f) => /carr(y|ies) forward/i.test(f.title)));
});

test('overall taxable-income cap binds even when the QBI-based amount is larger', () => {
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 1000, netCapitalGain: 900, qbi: 100000,
  });
  // 20% of QBI = 20000, but overall cap = 20% of (1000-900) = 20
  assert.equal(r.deduction, 20);
  assert.equal(r.limitedByOverallCap, true);
});

test('REIT dividends and PTP income are never wage-limited or SSTB-reduced', () => {
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 600000, qbi: 0, reitPtpIncome: 10000, isSstb: true, w2Wages: 0,
  });
  assert.equal(r.deduction, 2000);
});

test('2026 minimum deduction: $400 floor when QBI is at least $1,000, even if the formula alone gives less', () => {
  const r = computeQbiDeduction({
    taxYear: 2026, filingStatus: 'single', taxableIncome: 50000, qbi: 1500,
  });
  // unreduced 20% of 1500 = 300, below the $400 floor
  assert.equal(r.deduction, 400);
  assert.equal(r.appliedMinimum, true);
});

test('2026 minimum deduction does not apply below the $1,000 QBI floor', () => {
  const r = computeQbiDeduction({
    taxYear: 2026, filingStatus: 'single', taxableIncome: 50000, qbi: 500,
  });
  assert.equal(r.deduction, 100);
  assert.equal(r.appliedMinimum, false);
});

test('2025 has no minimum-deduction floor', () => {
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 50000, qbi: 1500,
  });
  assert.equal(r.deduction, 300);
  assert.equal(r.appliedMinimum, false);
});

test('2026 widened phase-in range and threshold are read from the table, not hardcoded 2025 figures', () => {
  assert.deepEqual(thresholdFor(2026, 'single'), { threshold: 201750, range: 75000 });
  assert.deepEqual(thresholdFor(2026, 'joint'), { threshold: 403500, range: 150000 });
  assert.deepEqual(thresholdFor(2025, 'single'), { threshold: 191950, range: 50000 });
  assert.deepEqual(thresholdFor(2025, 'joint'), { threshold: 383900, range: 100000 });
});

test('married filing separately uses the single/HoH threshold and range', () => {
  assert.deepEqual(thresholdFor(2025, 'mfs'), thresholdFor(2025, 'single'));
  assert.deepEqual(thresholdFor(2026, 'hoh'), thresholdFor(2026, 'single'));
});

test('estimateTaxSavings applies the marginal rate and never goes negative', () => {
  assert.equal(estimateTaxSavings(10000, 22), 2200);
  assert.equal(estimateTaxSavings(-500, 22), 0);
  assert.equal(estimateTaxSavings(10000, -5), 0);
});

test('money formats negative and zero correctly', () => {
  assert.equal(money(0), '$0');
  assert.equal(money(1234), '$1,234');
  assert.equal(money(-1234), '-$1,234');
});

test('an unknown tax year falls back to the latest table rather than throwing', () => {
  const years = Object.keys(THRESHOLDS).map(Number);
  const latest = Math.max(...years);
  assert.deepEqual(thresholdFor(2099, 'single'), thresholdFor(latest, 'single'));
});
