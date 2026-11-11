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
  // single 2025: threshold 197300, range 50000. excess 25000 => ratio 0.5.
  const r = computeQbiDeduction({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 222300, qbi: 200000, w2Wages: 20000, ubia: 0,
  });
  // tentative 40000; wage limit max(10000, 5000) = 10000; overage 30000 * 0.5 = 15000
  assert.equal(r.deduction, 25000);
});

test('SSTB inside the phase-in range: QBI, wages, and UBIA all scaled by the applicable percentage first', () => {
  const r = computeBusinessComponent({
    taxYear: 2025, filingStatus: 'single', taxableIncome: 222300, qbi: 200000, isSstb: true, w2Wages: 20000, ubia: 0,
  });
  // applicable percentage 50%: adjQbi 100000, adjWages 10000; wage limit 5000; 20% of adjQbi = 20000.
  // Treas. Reg. 1.199A-1(d)(2) applies its rules in order: (i) scales the SSTB's items, then
  // (iv)(B) phases in the wage limit like any business in range: 20000 - (20000 - 5000) * 0.5.
  assert.equal(r.component, 12500);
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
  assert.deepEqual(thresholdFor(2025, 'single'), { threshold: 197300, range: 50000 });
  assert.deepEqual(thresholdFor(2025, 'joint'), { threshold: 394600, range: 100000 });
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

test('SSTB inside the phase-in range with no wages still gets the phase-in reduction, not a $0 wage cap', () => {
  // A consultant with no employees, 2026 single, halfway through the range (ratio 0.5).
  const r = computeQbiDeduction({
    taxYear: 2026, filingStatus: 'single', taxableIncome: 239250, qbi: 100000, isSstb: true,
  });
  // adjQbi 50000 -> 10000 tentative; wage limit 0; reduction 10000 * 0.5 = 5000.
  assert.equal(r.businessComponent, 5000);
  assert.equal(r.deduction, 5000);
  assert.equal(r.appliedMinimum, false);
});

test('2026 minimum deduction is a floor on the final deduction, after the overall cap (199A(i)(1))', () => {
  const r = computeQbiDeduction({
    taxYear: 2026, filingStatus: 'single', taxableIncome: 1500, qbi: 1000,
  });
  // formula: min(200, 20% of 1500 = 300) = 200; the statute floors the subsection (a) deduction at 400.
  assert.equal(r.deduction, 400);
  assert.equal(r.appliedMinimum, true);
});

test('2026 minimum deduction does not apply to an SSTB above the phase-in range: none of its QBI counts', () => {
  const r = computeQbiDeduction({
    taxYear: 2026, filingStatus: 'single', taxableIncome: 400000, qbi: 5000, isSstb: true,
  });
  assert.equal(r.deduction, 0);
  assert.equal(r.appliedMinimum, false);
});

test('2026 minimum deduction counts only the applicable percentage of an SSTB\'s QBI inside the range', () => {
  // ratio 0.6 at 246750: applicable percentage 40%, so 2000 of QBI counts as 800 (< 1000).
  const below = computeQbiDeduction({
    taxYear: 2026, filingStatus: 'single', taxableIncome: 246750, qbi: 2000, isSstb: true, w2Wages: 100000,
  });
  assert.equal(below.appliedMinimum, false);
  const above = computeQbiDeduction({
    taxYear: 2026, filingStatus: 'single', taxableIncome: 246750, qbi: 2500, isSstb: true, w2Wages: 100000,
  });
  assert.equal(above.appliedMinimum, true);
  assert.equal(above.deduction, 400);
});

test('the "full 20%" finding only says below threshold when taxable income is below it', () => {
  const below = computeQbiDeduction({ taxYear: 2026, filingStatus: 'single', taxableIncome: 100000, qbi: 100000 });
  assert.ok(below.findings.some((f) => /Full 20%/.test(f.title) && /Below the taxable-income threshold/.test(f.detail)));
  const above = computeQbiDeduction({
    taxYear: 2026, filingStatus: 'single', taxableIncome: 400000, qbi: 100000, w2Wages: 100000,
  });
  assert.equal(above.deduction, 20000);
  const full = above.findings.find((f) => /Full 20%/.test(f.title));
  assert.ok(full, 'a non-SSTB above the range whose wage limit does not bind still gets the full-20% finding');
  assert.doesNotMatch(full.detail, /Below the taxable-income threshold/);
  assert.match(full.detail, /W-2 wage/);
});

test('a limited result carries no "full 20%" finding', () => {
  const r = computeQbiDeduction({ taxYear: 2025, filingStatus: 'single', taxableIncome: 600000, qbi: 100000, w2Wages: 10000 });
  assert.ok(!r.findings.some((f) => /Full 20%/.test(f.title)));
});

test('a QBI of $1 below threshold gives 20 cents, not $0', () => {
  const r = computeBusinessComponent({ taxYear: 2026, filingStatus: 'single', taxableIncome: 50000, qbi: 1 });
  assert.equal(r.component, 0.2);
});

test('money rounds a small positive amount without a minus sign', () => {
  assert.equal(money(0.6), '$1');
  assert.equal(money(-0.6), '-$1');
  assert.equal(money(-0.4), '$0');
});
