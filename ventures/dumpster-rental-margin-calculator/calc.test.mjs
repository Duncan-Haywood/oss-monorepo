import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculateQuote() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.laborCost, 56);
  close(r.mileageCost, 20.1);
  close(r.nonDisposalDirectCost, 96.1);
  close(r.overhead, 9.61);
  close(r.disposalCostAtAllowance, 140);
  close(r.totalCostAtAllowance, 245.71);
  close(r.basePrice, 351.014286);
  close(r.baseProfit, 105.304286);
  assert.ok(r.baseProfit > 0, 'the base rental price should be profitable at the allowance');
});

test('baseMarginPct always equals the requested target margin', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.baseMarginPct, DEFAULTS.targetMargin, 1e-6);
});

test('the base price is a breakeven-plus-margin price for the allowance weight only, not the expected weight', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.breakEvenPrice, r.totalCostAtAllowance);
  assert.notEqual(r.disposalCostAtAllowance, r.expectedDisposalCost);
});

test('an overage rate above the tipping fee covers disposal, so overage tons only add profit', () => {
  const r = calculateQuote(DEFAULTS); // 75/ton overage vs 65/ton tipping
  assert.equal(r.overageRateCoversDisposal, true);
  assert.equal(r.maxOverageTonsBeforeLoss, null);
  close(r.profitPerOverageTon, 10);
  assert.equal(r.weightRiskTight, false);
});

test('an overage rate below the tipping fee loses money on every excess ton and is flagged tight', () => {
  const r = calculateQuote({ ...DEFAULTS, overageRatePerTon: 50 }); // 50 < 65 tipping fee
  assert.equal(r.overageRateCoversDisposal, false);
  close(r.profitPerOverageTon, -15);
  assert.ok(r.maxOverageTonsBeforeLoss > 0);
  close(r.maxOverageTonsBeforeLoss, r.baseProfit / 15);
  assert.equal(r.weightRiskTight, true, 'expectedWeightTons (3) exceeds the allowance (2), so this job is expected to hit the mispriced overage');
});

test('an overage rate below the tipping fee is not flagged tight if the job is not expected to go over the allowance', () => {
  const r = calculateQuote({ ...DEFAULTS, overageRatePerTon: 50, expectedWeightTons: 2 });
  assert.equal(r.overageRateCoversDisposal, false);
  assert.equal(r.expectedOverageTons, 0);
  assert.equal(r.weightRiskTight, false);
});

test('expected overage tons, revenue, and disposal cost scale with weight over the allowance', () => {
  const light = calculateQuote({ ...DEFAULTS, expectedWeightTons: 2.5 });
  const heavy = calculateQuote({ ...DEFAULTS, expectedWeightTons: 5 });
  close(light.expectedOverageTons, 0.5);
  close(heavy.expectedOverageTons, 3);
  assert.ok(heavy.expectedOverageRevenue > light.expectedOverageRevenue);
  assert.ok(heavy.expectedTotalRevenue > light.expectedTotalRevenue);
});

test('a job expected to stay within the allowance carries no expected overage', () => {
  const r = calculateQuote({ ...DEFAULTS, expectedWeightTons: 1.5 });
  assert.equal(r.expectedOverageTons, 0);
  assert.equal(r.expectedOverageRevenue, 0);
});

test('extra rental days add pure revenue with no added disposal cost', () => {
  const onTime = calculateQuote({ ...DEFAULTS, expectedRentalDays: 7 });
  const late = calculateQuote({ ...DEFAULTS, expectedRentalDays: 10 });
  close(late.expectedExtraDays, 3);
  close(late.expectedExtraDayRevenue, 30);
  close(late.expectedTotalRevenue - onTime.expectedTotalRevenue, 30);
  assert.equal(late.expectedTotalCost, onTime.expectedTotalCost, 'sitting longer adds no disposal or labor cost in this model');
});

test('driver hours and mileage scale the base price', () => {
  const near = calculateQuote({ ...DEFAULTS, roundTripMiles: 10, driverHours: 1 });
  const far = calculateQuote({ ...DEFAULTS, roundTripMiles: 60, driverHours: 4 });
  assert.ok(far.basePrice > near.basePrice);
});

test('no actual weight ticket means the actual field is null', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.actual, null);
});

test('an actual weight ticket within the allowance carries no overage and beats the expected-weight profit', () => {
  const r = calculateQuote({ ...DEFAULTS, actualWeightTons: 1 });
  assert.equal(r.actual.overageTons, 0);
  assert.equal(r.actual.overageRevenue, 0);
  assert.equal(r.actual.belowBreakEven, false);
  assert.ok(r.actual.profit > r.expectedProfit, 'a lighter-than-expected load should leave more profit than the estimate assumed');
});

test('an actual weight ticket over the allowance bills overage revenue and disposal cost correctly', () => {
  const r = calculateQuote({ ...DEFAULTS, actualWeightTons: 5 });
  close(r.actual.overageTons, 3);
  close(r.actual.overageRevenue, 225);
  close(r.actual.disposalCost, 5 * DEFAULTS.tippingFeePerTon + DEFAULTS.dumpFeeFlat);
  close(r.actual.totalRevenue, r.basePrice + 225);
  assert.equal(r.actual.belowBreakEven, false);
});

test('actualRentalDays defaults to expectedRentalDays when omitted, and can be overridden', () => {
  const r1 = calculateQuote({ ...DEFAULTS, actualWeightTons: 2 });
  assert.equal(r1.actual.extraDays, 0);
  const r2 = calculateQuote({ ...DEFAULTS, actualWeightTons: 2, actualRentalDays: 12 });
  close(r2.actual.extraDays, 5);
  close(r2.actual.extraDayRevenue, 50);
});

test('a badly underpriced actual job is flagged below breakeven', () => {
  const r = calculateQuote({ ...DEFAULTS, actualWeightTons: 20, overageRatePerTon: 10 });
  assert.equal(r.actual.belowBreakEven, true);
  assert.ok(r.actual.profit < 0);
});

test('rejects a target margin of 100 or more', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMargin: 100 }), /target margin/i);
});

test('rejects a zero dumpster size', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, dumpsterSizeYards: 0 }), /dumpster size/i);
});

test('rejects a zero included rental days', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, includedRentalDays: 0 }), /included rental days/i);
});

test('rejects a negative round-trip mileage', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, roundTripMiles: -5 }), /miles/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, driverHourlyRate: 'lots' }), /driver hourly rate/i);
});

test('rejects a non-numeric actual weight ticket', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, actualWeightTons: 'heavy' }), /actual weight ticket/i);
});
