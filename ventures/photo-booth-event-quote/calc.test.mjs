import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculateQuote() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.onSiteHours, 4.75);
  close(r.committedHoursPerAttendant, 5.416667);
  close(r.laborCost, 135.416667);
  close(r.mileageCost, 16.08);
  close(r.peakPremium, 22.7245);
  close(r.printCost, 52.5);
  close(r.directCost, 281.721167);
  close(r.overhead, 22.922117);
  close(r.totalCost, 304.643284);
  close(r.price, 468.681975);
  close(r.profit, 164.038691);
  assert.ok(r.profit > 0, 'the default booking should be profitable');
});

test('the resulting profit margin equals the requested target margin', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.profitMarginPct, DEFAULTS.targetMarginPct, 1e-6);
});

test('the effective cost per print equals the input cost per print', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.costPerPrintEffective, DEFAULTS.costPerPrint, 1e-9);
});

test('setup and teardown minutes add to committed time and labor cost, not to the booked price basis', () => {
  const shortPrep = calculateQuote({ ...DEFAULTS, setupMinutes: 15, teardownMinutes: 15 });
  const longPrep = calculateQuote({ ...DEFAULTS, setupMinutes: 90, teardownMinutes: 90 });
  assert.ok(longPrep.committedHoursPerAttendant > shortPrep.committedHoursPerAttendant);
  assert.ok(longPrep.laborCost > shortPrep.laborCost);
  assert.equal(longPrep.pricePerBookedHour, longPrep.price / DEFAULTS.eventHours);
});

test('a second attendant roughly doubles labor cost and raises total price', () => {
  const one = calculateQuote({ ...DEFAULTS, attendantCount: 1 });
  const two = calculateQuote({ ...DEFAULTS, attendantCount: 2 });
  close(two.laborCost, one.laborCost * 2);
  assert.ok(two.price > one.price);
});

test('an unattended booth (0 attendants) carries no labor cost', () => {
  const r = calculateQuote({ ...DEFAULTS, attendantCount: 0 });
  assert.equal(r.laborCost, 0);
  assert.equal(r.recommendedOvertimeRate, 0);
});

test('mileage cost scales linearly with round-trip miles and the mileage rate', () => {
  const near = calculateQuote({ ...DEFAULTS, milesRoundTrip: 10 });
  const far = calculateQuote({ ...DEFAULTS, milesRoundTrip: 100 });
  close(far.mileageCost - near.mileageCost, (100 - 10) * DEFAULTS.mileageRate);
});

test('the weekend/holiday premium is zero at 0% and grows with the percentage', () => {
  const weekday = calculateQuote({ ...DEFAULTS, weekendHolidayPremiumPct: 0 });
  const weekend = calculateQuote({ ...DEFAULTS, weekendHolidayPremiumPct: 25 });
  assert.equal(weekday.peakPremium, 0);
  assert.ok(weekend.peakPremium > 0);
  assert.ok(weekend.price > weekday.price);
});

test('more expected prints raise print cost, price, and the print line\'s share of the price', () => {
  const light = calculateQuote({ ...DEFAULTS, expectedPrints: 50 });
  const heavy = calculateQuote({ ...DEFAULTS, expectedPrints: 400 });
  assert.ok(heavy.printCost > light.printCost);
  assert.ok(heavy.price > light.price);
  assert.ok(heavy.printCostSharePct > light.printCostSharePct);
});

test('maxPrintsAtBreakeven is comfortably above the expected prints on the default inputs, and not tight', () => {
  const r = calculateQuote(DEFAULTS);
  assert.ok(r.maxPrintsAtBreakeven > DEFAULTS.expectedPrints);
  assert.equal(r.printBudgetRemaining, r.maxPrintsAtBreakeven - DEFAULTS.expectedPrints);
  assert.ok(r.printCostSharePct < 20);
  assert.equal(r.printBudgetTight, false);
});

test('printBudgetTight flags a quote where the print line alone is over a fifth of the price', () => {
  const r = calculateQuote({ ...DEFAULTS, expectedPrints: 700, costPerPrint: 0.35 });
  assert.ok(r.printCostSharePct > 20);
  assert.equal(r.printBudgetTight, true);
});

test('recommendedOvertimeRate scales with attendant count and stays consistent with the target margin', () => {
  const r = calculateQuote(DEFAULTS);
  const expectedExtraHourCost = DEFAULTS.attendantHourlyRate * DEFAULTS.attendantCount * (1 + DEFAULTS.overheadRate / 100);
  close(r.recommendedOvertimeRate, expectedExtraHourCost / (1 - DEFAULTS.targetMarginPct / 100));
});

test('a proposed price below breakeven is flagged', () => {
  const r = calculateQuote({ ...DEFAULTS, proposedPrice: 100 });
  assert.ok(r.proposed.belowBreakEven);
  assert.ok(r.proposed.profit < 0);
});

test('a proposed price above breakeven reports a positive profit and margin', () => {
  const r = calculateQuote({ ...DEFAULTS, proposedPrice: 600 });
  assert.equal(r.proposed.belowBreakEven, false);
  assert.ok(r.proposed.profit > 0);
  close(r.proposed.margin, ((600 - r.totalCost) / 600) * 100);
});

test('no proposed price means the proposed field is null', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.proposed, null);
});

test('rejects a target margin of 100 or more', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMarginPct: 100 }), /target margin/i);
});

test('rejects a zero event duration', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, eventHours: 0 }), /event hours/i);
});

test('rejects a negative round-trip mileage', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, milesRoundTrip: -5 }), /miles/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, attendantHourlyRate: 'lots' }), /attendant hourly rate/i);
});
