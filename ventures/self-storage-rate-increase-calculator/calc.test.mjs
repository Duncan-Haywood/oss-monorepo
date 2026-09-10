// Behaviour tests for the rate-increase arithmetic.
//
// The properties worth protecting are the ones a user would act on: that a
// move-out is priced at the gap and not at the rent, that the break-even
// move-out rate falls out of the same numbers rather than being a second
// model, and that the tool refuses to answer rather than guessing when the
// inputs cannot be read.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_INPUT_IDS,
  DAYS_PER_MONTH,
  breakEvenInducedRate,
  calculateIncrease,
  cohortUnitValue,
  moveOutCost,
  reletValue,
  rentOnlyMoveOutCost,
} from './calc.mjs';

/** The facility the page opens on: a 42-unit 10x10 group, below street. */
const EXAMPLE = {
  unitCount: 42,
  currentRent: 118,
  increasePercent: 15,
  streetRate: 149,
  ancillaryPerMonth: 12,
  baselineMoveOutPercent: 22,
  inducedMoveOutPercent: 6,
  vacantDays: 45,
  turnoverCost: 45,
  concessionMonths: 1,
  horizonMonths: 12,
};

const near = (actual, expected, tolerance, what) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: expected ${expected} ± ${tolerance}, got ${actual}`,
  );

test('the worked example produces the figures the pages quote', () => {
  const result = calculateIncrease(EXAMPLE);
  assert.equal(result.ok, true);
  near(result.newRent, 135.7, 0.005, 'new rent');
  near(result.moveOutCost.total, 272.43, 0.02, 'cost of one induced move-out');
  near(result.breakEvenPercent, 60.8, 0.05, 'break-even induced move-out rate');
  near(result.cohortGain, 6272, 1, 'expected gain across the group');
  assert.equal(result.breakEvenUnreachable, false);
});

test('a move-out costs the gap, not the rent', () => {
  const result = calculateIncrease(EXAMPLE);
  const naive = rentOnlyMoveOutCost({
    newRent: result.newRent,
    ancillaryPerMonth: EXAMPLE.ancillaryPerMonth,
    horizonMonths: EXAMPLE.horizonMonths,
  });
  // The whole product in one assertion: the rent-only figure is more than six
  // times the real cost on a unit that re-lets above what the tenant paid.
  assert.ok(naive > result.moveOutCost.total * 6, `naive ${naive} vs real ${result.moveOutCost.total}`);
  // And the naive figure is exactly the value of keeping the tenant, which is
  // what makes it the wrong number to compare a move-out against.
  near(naive, result.keepValue, 1e-9, 'the naive cost is the keep value');
});

test('the itemised move-out cost sums to keep-value minus re-let value', () => {
  const result = calculateIncrease(EXAMPLE);
  const sum = result.moveOutCost.items.reduce((total, item) => total + item.amount, 0);
  near(sum, result.moveOutCost.total, 1e-9, 'items sum to the total');
  near(result.moveOutCost.total, result.keepValue - result.reletValue, 1e-9, 'total is the gap');
});

test('the re-rent term is negative when street is above the raised rent', () => {
  const result = calculateIncrease(EXAMPLE);
  const rateGap = result.moveOutCost.items.find((item) => item.key === 'rateGap');
  assert.ok(rateGap.amount < 0, 'street 149 against a raised 135.70 must credit the move-out');
  near(rateGap.amount, (135.7 - 149) * 12, 0.01, 'the re-rent credit');
});

test('a raise above street rate makes a move-out expensive again', () => {
  const below = calculateIncrease(EXAMPLE);
  const above = calculateIncrease({ ...EXAMPLE, increasePercent: 60 });
  assert.ok(above.newRent > EXAMPLE.streetRate, 'the 60% case is above street');
  assert.ok(
    above.moveOutCost.total > below.moveOutCost.total,
    'raising past street should raise, not lower, the cost of losing the tenant',
  );
  assert.ok(above.notes.some((note) => note.includes('above your street rate')));
});

test('when a move-out is worth as much as the tenant, no churn can lose money', () => {
  // Street far above the raised rent, no concession, quick turn: the unit
  // comes back at a higher rent than the person who left was paying.
  const result = calculateIncrease({
    ...EXAMPLE,
    currentRent: 90,
    increasePercent: 10,
    streetRate: 210,
    vacantDays: 5,
    concessionMonths: 0,
    turnoverCost: 40,
  });
  assert.ok(result.moveOutCost.total <= 0, `cost should be non-positive, was ${result.moveOutCost.total}`);
  assert.equal(result.breakEvenPercent, null);
  assert.ok(result.notes.some((note) => note.includes('No amount of induced churn')));
});

test('the break-even rate is capped at the share who are still there', () => {
  // A large increase on a group with heavy ordinary churn: the uncapped
  // break-even runs past the tenants who remain, which is not a number an
  // operator can act on.
  const result = calculateIncrease({
    ...EXAMPLE,
    currentRent: 90,
    increasePercent: 120,
    baselineMoveOutPercent: 55,
    streetRate: 210,
  });
  assert.ok(result.moveOutCost.total > 0, 'a move-out still costs something here');
  assert.equal(result.breakEvenUnreachable, true);
  near(result.breakEvenPercent, result.stayingSharePercent, 1e-9, 'capped at the staying share');
});

test('above the break-even rate the increase loses money, below it gains', () => {
  const at = calculateIncrease(EXAMPLE).breakEvenPercent;
  const under = calculateIncrease({ ...EXAMPLE, inducedMoveOutPercent: Math.floor(at) - 1 });
  const over = calculateIncrease({ ...EXAMPLE, inducedMoveOutPercent: Math.ceil(at) + 1 });
  assert.ok(under.cohortGain > 0, `below break-even should gain, got ${under.cohortGain}`);
  assert.ok(over.cohortGain < 0, `above break-even should lose, got ${over.cohortGain}`);
  assert.ok(over.notes.some((note) => note.includes('loses money over the horizon')));
  const exact = calculateIncrease({ ...EXAMPLE, inducedMoveOutPercent: at });
  near(exact.cohortGain, 0, 1e-6, 'at the break-even rate the gain is zero');
});

test('a longer vacancy raises the cost of a move-out and lowers the break-even', () => {
  const quick = calculateIncrease({ ...EXAMPLE, vacantDays: 15 });
  const slow = calculateIncrease({ ...EXAMPLE, vacantDays: 120 });
  assert.ok(slow.moveOutCost.total > quick.moveOutCost.total);
  assert.ok(slow.breakEvenPercent < quick.breakEvenPercent);
});

test('ordinary move-outs do not count against the increase', () => {
  // Baseline churn happens either way, so it scales the prize rather than
  // deciding it: raising it lowers the gain but leaves the break-even *rate*
  // it is measured against untouched in direction — the tenants who left were
  // never going to pay the new rent.
  const low = calculateIncrease({ ...EXAMPLE, baselineMoveOutPercent: 5 });
  const high = calculateIncrease({ ...EXAMPLE, baselineMoveOutPercent: 45 });
  assert.ok(low.cohortGain > high.cohortGain, 'fewer ordinary move-outs means more tenants to raise');
  assert.ok(low.breakEvenPercent > high.breakEvenPercent);
});

test('a zero increase changes nothing and breaks even at zero move-outs', () => {
  const result = calculateIncrease({ ...EXAMPLE, increasePercent: 0, inducedMoveOutPercent: 0 });
  near(result.newRent, EXAMPLE.currentRent, 1e-9, 'no increase');
  near(result.cohortGain, 0, 1e-9, 'no gain');
  near(result.breakEvenPercent, 0, 1e-9, 'nothing to spend on move-outs');
});

test('the gain scales linearly with the number of units', () => {
  const one = calculateIncrease({ ...EXAMPLE, unitCount: 1 });
  const many = calculateIncrease({ ...EXAMPLE, unitCount: 210 });
  near(many.cohortGain, one.cohortGain * 210, 1e-6, 'linear in units');
  near(many.expectedInducedMoveOuts, 210 * 0.06, 1e-9, 'expected induced move-outs');
  near(one.breakEvenPercent, many.breakEvenPercent, 1e-9, 'the rate does not depend on the count');
});

test('the ladder covers the increases operators send and marks the entered one', () => {
  const result = calculateIncrease(EXAMPLE);
  const percents = result.ladder.map((rung) => rung.increasePercent);
  assert.deepEqual(percents, [5, 8, 10, 12, 15, 20, 25]);
  const entered = result.ladder.filter((rung) => rung.isEntered);
  assert.equal(entered.length, 1);
  assert.equal(entered[0].increasePercent, 15);
  near(entered[0].newRent, result.newRent, 1e-9, 'the entered rung matches the headline');
  near(entered[0].gain, result.cohortGain, 1e-9, 'and so does its gain');
  // A bigger increase buys more from everyone who stays, so it can absorb more
  // move-outs. That is the table's whole argument and it must not invert.
  for (let i = 1; i < result.ladder.length; i += 1) {
    assert.ok(
      result.ladder[i].breakEvenPercent >= result.ladder[i - 1].breakEvenPercent,
      'break-even tolerance should rise with the size of the increase',
    );
  }
});

test('the ladder flags a rung that prices above street', () => {
  const result = calculateIncrease({ ...EXAMPLE, currentRent: 140, streetRate: 150 });
  const flagged = result.ladder.filter((rung) => rung.aboveStreet).map((rung) => rung.increasePercent);
  assert.deepEqual(flagged, [8, 10, 12, 15, 20, 25], '140 x 1.08 = 151.20 is the first above 150');
});

test('an entered increase off the standard rungs is added to the ladder', () => {
  const result = calculateIncrease({ ...EXAMPLE, increasePercent: 17 });
  const percents = result.ladder.map((rung) => rung.increasePercent);
  assert.deepEqual(percents, [5, 8, 10, 12, 15, 17, 20, 25]);
});

test('a vacancy longer than the horizon earns nothing and says so', () => {
  const result = calculateIncrease({ ...EXAMPLE, vacantDays: 365, horizonMonths: 6 });
  near(result.occupiedMonths, 0, 1e-9, 'no occupied months inside the horizon');
  near(result.reletValue, -EXAMPLE.turnoverCost, 1e-9, 'only the turnover cost lands');
  assert.ok(result.notes.some((note) => note.includes('as long as the whole horizon')));
});

test('the concession is capped at the months the unit is actually occupied', () => {
  const relet = reletValue({
    streetRate: 100,
    ancillaryPerMonth: 0,
    vacantDays: 30.4375 * 5,
    concessionMonths: 3,
    turnoverCost: 0,
    horizonMonths: 6,
  });
  near(relet.occupiedMonths, 1, 1e-9, 'one occupied month');
  near(relet.concession, 100, 1e-9, 'a 3-month concession cannot exceed 1 occupied month');
  near(relet.value, 0, 1e-9, 'so the unit returns nothing');
});

test('every field is validated and every problem is reported at once', () => {
  const broken = calculateIncrease({ ...EXAMPLE, currentRent: 'abc', vacantDays: -4, horizonMonths: 900 });
  assert.equal(broken.ok, false);
  assert.deepEqual(
    broken.errors.map((error) => error.field).sort(),
    ['currentRent', 'horizonMonths', 'vacantDays'],
    'all three problems, not just the first',
  );
  for (const error of broken.errors) assert.match(error.message, /\w/);
});

test('an empty form is an error rather than a zero', () => {
  const result = calculateIncrease({});
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, ALL_INPUT_IDS.length);
});

test('move-out shares that exceed the whole group are rejected', () => {
  const result = calculateIncrease({ ...EXAMPLE, baselineMoveOutPercent: 70, inducedMoveOutPercent: 45 });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, 'inducedMoveOutPercent');
  assert.match(result.errors[0].message, /cannot exceed 100%/);
});

test('string inputs from a form are read the same as numbers', () => {
  const asStrings = Object.fromEntries(Object.entries(EXAMPLE).map(([key, val]) => [key, String(val)]));
  assert.deepEqual(calculateIncrease(asStrings), calculateIncrease(EXAMPLE));
});

test('the exported pieces compose into the same answer as the whole', () => {
  const result = calculateIncrease(EXAMPLE);
  const relet = reletValue({
    streetRate: EXAMPLE.streetRate,
    ancillaryPerMonth: EXAMPLE.ancillaryPerMonth,
    vacantDays: EXAMPLE.vacantDays,
    concessionMonths: EXAMPLE.concessionMonths,
    turnoverCost: EXAMPLE.turnoverCost,
    horizonMonths: EXAMPLE.horizonMonths,
  });
  near(relet.value, result.reletValue, 1e-9, 'relet value');
  const cost = moveOutCost({
    newRent: result.newRent,
    streetRate: EXAMPLE.streetRate,
    ancillaryPerMonth: EXAMPLE.ancillaryPerMonth,
    vacantDays: EXAMPLE.vacantDays,
    concessionMonths: EXAMPLE.concessionMonths,
    turnoverCost: EXAMPLE.turnoverCost,
    horizonMonths: EXAMPLE.horizonMonths,
  });
  near(cost.total, result.moveOutCost.total, 1e-9, 'move-out cost');
  const rate = breakEvenInducedRate({
    stayingShare: 1 - EXAMPLE.baselineMoveOutPercent / 100,
    horizonMonths: EXAMPLE.horizonMonths,
    rentIncrease: result.rentIncrease,
    moveOutCostTotal: cost.total,
  });
  near(rate * 100, result.breakEvenPercent, 1e-9, 'break-even rate');
  const now = cohortUnitValue({
    rent: EXAMPLE.currentRent,
    ancillaryPerMonth: EXAMPLE.ancillaryPerMonth,
    horizonMonths: EXAMPLE.horizonMonths,
    moveOutShare: EXAMPLE.baselineMoveOutPercent / 100,
    reletValueTotal: relet.value,
  });
  near(now * EXAMPLE.unitCount, result.cohortValueNow, 1e-9, 'do-nothing value');
});

test('days convert to months on the calendar mean, not on 30', () => {
  assert.equal(DAYS_PER_MONTH, 30.4375);
  const relet = reletValue({
    streetRate: 100,
    ancillaryPerMonth: 0,
    vacantDays: 30.4375,
    concessionMonths: 0,
    turnoverCost: 0,
    horizonMonths: 12,
  });
  near(relet.vacantMonths, 1, 1e-12, 'one mean month');
});
