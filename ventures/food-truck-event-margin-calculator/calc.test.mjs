import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculateQuote() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.onSiteHours, 8);
  close(r.committedHoursPerStaff, 8.666667);
  close(r.laborCost, 381.333333);
  close(r.mileageCost, 20.1);
  close(r.peakPremium, 40.143333);
  close(r.foodCost, 450);
  close(r.directCost, 1011.576667);
  close(r.overhead, 44.926133);
  close(r.totalCost, 1056.5028);
  close(r.price, 1509.289714);
  close(r.profit, 452.786914);
  assert.ok(r.profit > 0, 'the default booking should be profitable');
});

test('the resulting profit margin equals the requested target margin', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.profitMarginPct, DEFAULTS.targetMarginPct, 1e-6);
});

test('the effective food cost per guest equals the input food cost per guest', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.foodCostPerGuestEffective, DEFAULTS.foodCostPerGuest, 1e-9);
});

test('prep, service, and breakdown hours add to committed time and labor cost', () => {
  const shortPrep = calculateQuote({ ...DEFAULTS, prepHours: 1, breakdownHours: 0.5 });
  const longPrep = calculateQuote({ ...DEFAULTS, prepHours: 5, breakdownHours: 2 });
  assert.ok(longPrep.committedHoursPerStaff > shortPrep.committedHoursPerStaff);
  assert.ok(longPrep.laborCost > shortPrep.laborCost);
  assert.equal(longPrep.pricePerGuest, longPrep.price / DEFAULTS.expectedGuests);
});

test('a second staff member roughly doubles labor cost and raises total price', () => {
  const one = calculateQuote({ ...DEFAULTS, staffCount: 1 });
  const two = calculateQuote({ ...DEFAULTS, staffCount: 2 });
  close(two.laborCost, one.laborCost * 2);
  assert.ok(two.price > one.price);
});

test('a solo-operator booking (0 staff) carries no labor cost', () => {
  const r = calculateQuote({ ...DEFAULTS, staffCount: 0 });
  assert.equal(r.laborCost, 0);
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

test('more expected guests raise food cost, price, and the food line\'s share of the price', () => {
  const light = calculateQuote({ ...DEFAULTS, expectedGuests: 40 });
  const heavy = calculateQuote({ ...DEFAULTS, expectedGuests: 300 });
  assert.ok(heavy.foodCost > light.foodCost);
  assert.ok(heavy.price > light.price);
  assert.ok(heavy.foodCostSharePct > light.foodCostSharePct);
});

test('maxGuestsAtBreakeven is comfortably above expected guests on the default inputs, and not tight', () => {
  const r = calculateQuote(DEFAULTS);
  assert.ok(r.maxGuestsAtBreakeven > DEFAULTS.expectedGuests);
  assert.equal(r.guestBudgetRemaining, r.maxGuestsAtBreakeven - DEFAULTS.expectedGuests);
  assert.ok(r.foodCostSharePct < 35);
  assert.equal(r.foodBudgetTight, false);
});

test('foodBudgetTight flags a quote where the food line alone is over 35% of the price', () => {
  const r = calculateQuote({ ...DEFAULTS, expectedGuests: 100, foodCostPerGuest: 12 });
  assert.ok(r.foodCostSharePct > 35);
  assert.equal(r.foodBudgetTight, true);
});

test('recommendedExtraGuestRate scales with food cost per guest and stays consistent with overhead and margin', () => {
  const r = calculateQuote(DEFAULTS);
  const expectedExtraGuestCost = DEFAULTS.foodCostPerGuest * (1 + DEFAULTS.overheadRate / 100);
  close(r.recommendedExtraGuestRate, expectedExtraGuestCost / (1 - DEFAULTS.targetMarginPct / 100));
});

test('a proposed price below breakeven is flagged', () => {
  const r = calculateQuote({ ...DEFAULTS, proposedPrice: 400 });
  assert.ok(r.proposed.belowBreakEven);
  assert.ok(r.proposed.profit < 0);
});

test('a proposed price above breakeven reports a positive profit and margin', () => {
  const r = calculateQuote({ ...DEFAULTS, proposedPrice: 1800 });
  assert.equal(r.proposed.belowBreakEven, false);
  assert.ok(r.proposed.profit > 0);
  close(r.proposed.margin, ((1800 - r.totalCost) / 1800) * 100);
});

test('no proposed price means the proposed field is null', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.proposed, null);
});

test('rejects a target margin of 100 or more', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMarginPct: 100 }), /target margin/i);
});

test('rejects a zero expected guest count', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, expectedGuests: 0 }), /expected guests/i);
});

test('rejects a negative round-trip mileage', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, milesRoundTrip: -5 }), /miles/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, staffHourlyRate: 'lots' }), /staff hourly rate/i);
});
