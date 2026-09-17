import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculateQuote() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.effectiveVinylSqFt, 300);
  close(r.vinylCost, 825);
  close(r.laminateCost, 225);
  close(r.materialCost, 1050);
  close(r.installHours, 26.041667, 0.001);
  close(r.installLaborCost, 911.458333, 0.01);
  close(r.directCost, 2111.458333, 0.01);
  close(r.overhead, 253.375, 0.01);
  close(r.totalCost, 2364.833333, 0.01);
  close(r.price, 3638.205128, 0.01);
  close(r.profit, 1273.371795, 0.01);
  assert.ok(r.profit > 0, 'the base price should be profitable');
});

test('marginPct always equals the requested target margin', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.marginPct, DEFAULTS.targetMargin, 1e-6);
});

test('the waste-blind price undercuts the real, waste-inclusive cost', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.materialCostNaive, 875);
  close(r.priceIfWasteIgnored, 3336.666667, 0.01);
  close(r.wasteBlindLossPerJob, 196, 0.01);
  assert.equal(r.wasteRiskTight, true);
  assert.ok(r.priceIfWasteIgnored < r.price, 'ignoring waste always quotes below the real material cost');
});

test('zero waste factor means the naive and real prices are identical, and there is no waste risk', () => {
  const r = calculateQuote({ ...DEFAULTS, wasteFactorPct: 0 });
  close(r.effectiveVinylSqFt, DEFAULTS.vehicleSurfaceAreaSqFt);
  close(r.price, r.priceIfWasteIgnored, 0.01);
  close(r.wasteBlindLossPerJob, 0, 0.01);
  assert.equal(r.wasteRiskTight, false);
});

test('a higher waste factor increases material cost and the waste-blind loss', () => {
  const low = calculateQuote({ ...DEFAULTS, wasteFactorPct: 10 });
  const high = calculateQuote({ ...DEFAULTS, wasteFactorPct: 30 });
  assert.ok(high.materialCost > low.materialCost);
  assert.ok(high.wasteBlindLossPerJob > low.wasteBlindLossPerJob);
});

test('a higher complexity multiplier increases install hours and labor cost only', () => {
  const flat = calculateQuote({ ...DEFAULTS, complexityMultiplier: 1 });
  const curvy = calculateQuote({ ...DEFAULTS, complexityMultiplier: 1.6 });
  assert.ok(curvy.installHours > flat.installHours);
  assert.ok(curvy.installLaborCost > flat.installLaborCost);
  close(curvy.materialCost, flat.materialCost, 0.001);
});

test('removal hours add labor cost with no material cost', () => {
  const noRemoval = calculateQuote(DEFAULTS);
  const withRemoval = calculateQuote({ ...DEFAULTS, removalHours: 2 });
  close(withRemoval.removalLaborCost, 2 * DEFAULTS.installerHourlyRate);
  close(withRemoval.materialCost, noRemoval.materialCost, 0.001);
  assert.ok(withRemoval.price > noRemoval.price);
});

test('a rush fee surcharges the base price without changing the underlying cost', () => {
  const r = calculateQuote({ ...DEFAULTS, rushFeePct: 15 });
  close(r.rushSurcharge, r.price * 0.15);
  close(r.priceWithRush, r.price * 1.15);
});

test('no actual usage means the actual field is null', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.actual, null);
});

test('actual vinyl usage at or below the estimate beats the estimated profit', () => {
  const r = calculateQuote({ ...DEFAULTS, actualVinylSqFtUsed: 280 });
  assert.equal(r.actual.belowBreakEven, false);
  assert.ok(r.actual.profit > r.profit, 'using less material than the waste-inclusive estimate should leave more profit');
});

test('actual vinyl usage well above the estimate can flip the job below breakeven', () => {
  const r = calculateQuote({ ...DEFAULTS, actualVinylSqFtUsed: 900 });
  assert.equal(r.actual.belowBreakEven, true);
  assert.ok(r.actual.profit < 0);
});

test('actualInstallHours defaults to the estimated install hours when omitted, and can be overridden', () => {
  const r1 = calculateQuote({ ...DEFAULTS, actualVinylSqFtUsed: 300 });
  close(r1.actual.installLaborCost, r1.installLaborCost, 0.01);
  const r2 = calculateQuote({ ...DEFAULTS, actualVinylSqFtUsed: 300, actualInstallHours: 30 });
  close(r2.actual.installLaborCost, 30 * DEFAULTS.installerHourlyRate);
});

test('rejects a target margin of 100 or more', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMargin: 100 }), /target margin/i);
});

test('rejects a zero vehicle surface area', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, vehicleSurfaceAreaSqFt: 0 }), /vehicle surface area/i);
});

test('rejects a zero install rate', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, installRateSqFtPerHour: 0 }), /install rate/i);
});

test('rejects a negative removal hours', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, removalHours: -1 }), /removal hours/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, installerHourlyRate: 'lots' }), /installer hourly rate/i);
});

test('rejects a non-numeric actual vinyl usage', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, actualVinylSqFtUsed: 'a lot' }), /actual vinyl used/i);
});
