import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrice, DEFAULTS } from './calc.mjs';

test('default inputs produce the expected cost breakdown', () => {
  const r = calculatePrice(DEFAULTS);
  assert.ok(Math.abs(r.materialCost - 0.99) < 1e-9);
  assert.ok(Math.abs(r.electricityCost - 0.0576) < 1e-9);
  assert.ok(Math.abs(r.depreciationCost - 0.25) < 1e-9);
  assert.ok(Math.abs(r.laborCost - (10 / 60) * 20) < 1e-9);
});

test('the failure-rate buffer inflates only material, electricity, and depreciation', () => {
  const r = calculatePrice(DEFAULTS);
  const expectedMultiplier = 1 / (1 - DEFAULTS.failureRatePercent / 100);
  assert.ok(Math.abs(r.failureMultiplier - expectedMultiplier) < 1e-9);
  assert.ok(Math.abs(r.adjustedPerAttemptCost - r.perAttemptCost * expectedMultiplier) < 1e-9);
  // Labor and packaging only ever touch the one successful part, so raising
  // the failure rate must not move them.
  const zeroFailure = calculatePrice({ ...DEFAULTS, failureRatePercent: 0 });
  assert.equal(zeroFailure.laborCost, r.laborCost);
  assert.equal(zeroFailure.packagingCost, r.packagingCost);
  assert.ok(zeroFailure.adjustedPerAttemptCost < r.adjustedPerAttemptCost);
});

test('a higher failure rate raises the suggested price', () => {
  const low = calculatePrice({ ...DEFAULTS, failureRatePercent: 5 });
  const high = calculatePrice({ ...DEFAULTS, failureRatePercent: 50 });
  assert.ok(high.suggestedPrice > low.suggestedPrice);
});

test('the suggested price clears the marketplace fee and lands on the target margin', () => {
  const r = calculatePrice(DEFAULTS);
  const netRevenue = r.suggestedPrice - r.suggestedFeeAmount;
  const profit = netRevenue - r.totalCost;
  assert.ok(Math.abs(profit - r.suggestedProfit) < 1e-9);
  const marginPct = (r.suggestedProfit / r.suggestedPrice) * 100;
  assert.ok(Math.abs(marginPct - DEFAULTS.targetMarginPercent) < 1e-6);
});

test('the break-even price covers cost after the marketplace fee with zero profit', () => {
  const r = calculatePrice(DEFAULTS);
  const netRevenueAtBreakEven = r.breakEvenPrice * (1 - DEFAULTS.marketplaceFeePercent / 100);
  assert.ok(Math.abs(netRevenueAtBreakEven - r.totalCost) < 1e-9);
});

test('fee plus margin at or above 100% is rejected rather than producing a negative or infinite price', () => {
  assert.throws(() => calculatePrice({ ...DEFAULTS, marketplaceFeePercent: 70, targetMarginPercent: 30 }));
  assert.throws(() => calculatePrice({ ...DEFAULTS, marketplaceFeePercent: 60, targetMarginPercent: 45 }));
});

test('a failure rate of 100% or more is rejected', () => {
  assert.throws(() => calculatePrice({ ...DEFAULTS, failureRatePercent: 100 }));
  assert.throws(() => calculatePrice({ ...DEFAULTS, failureRatePercent: 150 }));
});

test('checking an actual selling price below the break-even reports a loss', () => {
  const r = calculatePrice({ ...DEFAULTS, actualSellingPrice: 4 });
  assert.ok(r.actual.belowBreakEven);
  assert.ok(r.actual.profit < 0);
});

test('checking an actual selling price at the suggested price agrees with the suggested profit', () => {
  const suggested = calculatePrice(DEFAULTS);
  const r = calculatePrice({ ...DEFAULTS, actualSellingPrice: suggested.suggestedPrice });
  assert.ok(Math.abs(r.actual.profit - suggested.suggestedProfit) < 1e-6);
  assert.ok(Math.abs(r.actual.marginPct - DEFAULTS.targetMarginPercent) < 1e-6);
});

test('omitting an actual selling price leaves actual as null', () => {
  const r = calculatePrice(DEFAULTS);
  assert.equal(r.actual, null);
});

test('non-numeric or negative inputs are rejected with a field-specific message', () => {
  assert.throws(() => calculatePrice({ ...DEFAULTS, filamentUsedGrams: 'abc' }), /Filament used must be a number/);
  assert.throws(() => calculatePrice({ ...DEFAULTS, printTimeHours: 0 }), /Print time must be greater than zero/);
  assert.throws(() => calculatePrice({ ...DEFAULTS, printerCost: -1 }), /Printer cost must be at least 0/);
});
