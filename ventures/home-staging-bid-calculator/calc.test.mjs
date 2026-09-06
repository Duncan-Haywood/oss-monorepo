import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculateQuote() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.laborCost, 180);
  close(r.mileageCost, 16.75);
  close(r.nonFurnitureDirectCost, 236.75);
  close(r.overhead, 23.675);
  close(r.furnitureCostAtIncludedTerm, 440);
  close(r.totalCostAtIncludedTerm, 700.425);
  close(r.basePrice, 1150.607143);
  close(r.baseProfit, 450.182143);
  assert.ok(r.baseProfit > 0, 'the included-term price should be profitable');
});

test('baseMarginPct always equals the requested target margin', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.baseMarginPct, DEFAULTS.targetMargin, 1e-6);
});

test('the base price is a breakeven-plus-margin price for the included term only, not the expected term', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.breakEvenPrice, r.totalCostAtIncludedTerm);
  assert.notEqual(r.furnitureCostAtIncludedTerm, r.expectedFurnitureCost);
});

test('the consult fee is pure added profit with no cost of its own', () => {
  const withFee = calculateQuote(DEFAULTS);
  const withoutFee = calculateQuote({ ...DEFAULTS, consultFlatFee: 0 });
  close(withFee.basePrice - withoutFee.basePrice, DEFAULTS.consultFlatFee);
  close(withFee.baseProfit - withoutFee.baseProfit, DEFAULTS.consultFlatFee);
  close(withFee.baseMarginPct, withoutFee.baseMarginPct, 1e-6);
});

test('an extension fee above the furniture carrying cost covers it, so extension months only add profit', () => {
  const r = calculateQuote(DEFAULTS); // 250/month extension vs 220/month carrying cost
  assert.equal(r.extensionFeeCoversCarryingCost, true);
  assert.equal(r.maxExtensionMonthsBeforeLoss, null);
  close(r.profitPerExtensionMonth, 30);
  assert.equal(r.termRiskTight, false);
});

test('an extension fee below the furniture carrying cost loses money on every extra month and is flagged tight', () => {
  const r = calculateQuote({ ...DEFAULTS, extensionFeePerMonth: 150 }); // 150 < 220 carrying cost
  assert.equal(r.extensionFeeCoversCarryingCost, false);
  close(r.profitPerExtensionMonth, -70);
  assert.ok(r.maxExtensionMonthsBeforeLoss > 0);
  close(r.maxExtensionMonthsBeforeLoss, (r.basePrice - r.consultFlatFee - r.totalCostAtIncludedTerm) / 70);
  assert.equal(r.termRiskTight, true, 'expectedTermMonths (3) exceeds the included term (2), so this listing is expected to hit the mispriced extension');
});

test('an extension fee below the carrying cost is not flagged tight if the listing is not expected to run long', () => {
  const r = calculateQuote({ ...DEFAULTS, extensionFeePerMonth: 150, expectedTermMonths: 2 });
  assert.equal(r.extensionFeeCoversCarryingCost, false);
  assert.equal(r.expectedExtensionMonths, 0);
  assert.equal(r.termRiskTight, false);
});

test('expected extension months, revenue, and carrying cost scale with the term over the included months', () => {
  const short = calculateQuote({ ...DEFAULTS, expectedTermMonths: 2.5 });
  const long = calculateQuote({ ...DEFAULTS, expectedTermMonths: 5 });
  close(short.expectedExtensionMonths, 0.5);
  close(long.expectedExtensionMonths, 3);
  assert.ok(long.expectedExtensionRevenue > short.expectedExtensionRevenue);
  assert.ok(long.expectedTotalRevenue > short.expectedTotalRevenue);
});

test('a listing expected to sell within the included term carries no expected extension', () => {
  const r = calculateQuote({ ...DEFAULTS, expectedTermMonths: 1.5 });
  assert.equal(r.expectedExtensionMonths, 0);
  assert.equal(r.expectedExtensionRevenue, 0);
});

test('crew hours and mileage scale the base price', () => {
  const near = calculateQuote({ ...DEFAULTS, roundTripMiles: 5, crewHours: 2 });
  const far = calculateQuote({ ...DEFAULTS, roundTripMiles: 60, crewHours: 10 });
  assert.ok(far.basePrice > near.basePrice);
});

test('no actual term means the actual field is null', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.actual, null);
});

test('an actual term within the included months carries no extension and beats the expected-term profit', () => {
  const r = calculateQuote({ ...DEFAULTS, actualTermMonths: 1 });
  assert.equal(r.actual.extensionMonths, 0);
  assert.equal(r.actual.extensionRevenue, 0);
  assert.equal(r.actual.belowBreakEven, false);
  assert.ok(r.actual.profit > r.expectedProfit, 'a listing that sold faster than expected should leave more profit than the estimate assumed');
});

test('an actual term over the included months bills extension revenue and carrying cost correctly', () => {
  const r = calculateQuote({ ...DEFAULTS, actualTermMonths: 5 });
  close(r.actual.extensionMonths, 3);
  close(r.actual.extensionRevenue, 750);
  close(r.actual.furnitureCost, 5 * DEFAULTS.furnitureCarryingCostPerMonth);
  close(r.actual.totalRevenue, r.basePrice + 750);
  assert.equal(r.actual.belowBreakEven, false);
});

test('a badly underpriced actual job is flagged below breakeven', () => {
  const r = calculateQuote({ ...DEFAULTS, actualTermMonths: 20, extensionFeePerMonth: 10 });
  assert.equal(r.actual.belowBreakEven, true);
  assert.ok(r.actual.profit < 0);
});

test('rejects a target margin of 100 or more', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMargin: 100 }), /target margin/i);
});

test('rejects a zero rooms staged', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, roomsStaged: 0 }), /rooms staged/i);
});

test('rejects a zero included term', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, includedTermMonths: 0 }), /included term months/i);
});

test('rejects a negative round-trip mileage', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, roundTripMiles: -5 }), /miles/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, crewHourlyRate: 'lots' }), /crew hourly rate/i);
});

test('rejects a non-numeric actual term', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, actualTermMonths: 'a while' }), /actual term months/i);
});
