import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, UNIT_PRESETS } from './calc.mjs';

const BASE_UNIT = { name: 'Standard bounce house', quantity: 2, dailyRate: 150, replacementValue: 1800, wet: false };

function baseInput(overrides = {}) {
  return {
    units: [{ ...BASE_UNIT }],
    eventDays: 1,
    setupMinutesPerUnit: 25,
    teardownMinutesPerUnit: 15,
    crewSize: 2,
    laborRate: 20,
    deliveryFee: 20,
    pickupFee: 20,
    milesOneWay: 10,
    ratePerMile: 2,
    generatorNeeded: false,
    generatorFee: 0,
    attendantHours: 0,
    attendantRate: 0,
    insuranceRatePct: 1,
    consumablesPerUnit: 5,
    otherCost: 0,
    overheadRate: 10,
    targetMargin: 20,
    proposedPrice: null,
    ...overrides,
  };
}

test('rejects an empty fleet', () => {
  assert.throws(() => calculateQuote(baseInput({ units: [] })), /Add at least one unit/);
});

test('rejects a target margin at or above 100%', () => {
  assert.throws(() => calculateQuote(baseInput({ targetMargin: 100 })), /less than 100/);
  assert.throws(() => calculateQuote(baseInput({ targetMargin: 150 })), /less than 100/);
});

test('rejects a non-numeric or negative field', () => {
  assert.throws(() => calculateQuote(baseInput({ eventDays: 'abc' })), /must be a number/);
  assert.throws(() => calculateQuote(baseInput({ milesOneWay: -5 })), /at least 0/);
});

test('rejects zero event days (a booking has to be for at least one day)', () => {
  assert.throws(() => calculateQuote(baseInput({ eventDays: 0 })), /greater than zero/);
});

test('rental cost scales with quantity and event days', () => {
  const result = calculateQuote(baseInput({ eventDays: 3 }));
  // 2 units x $150/day x 3 days
  assert.equal(result.rentalCost, 900);
});

test('mileage is charged as two round trips (4x one-way miles)', () => {
  const result = calculateQuote(baseInput({ milesOneWay: 15, ratePerMile: 3, deliveryFee: 0, pickupFee: 0 }));
  assert.equal(result.mileageCost, 4 * 15 * 3);
  assert.equal(result.haulCost, result.mileageCost);
});

test('haul cost adds the flat delivery and pickup fees to mileage', () => {
  const result = calculateQuote(baseInput({ milesOneWay: 10, ratePerMile: 2, deliveryFee: 25, pickupFee: 30 }));
  assert.equal(result.haulCost, 25 + 30 + 4 * 10 * 2);
});

test('labor cost is crew size times total setup+teardown minutes, converted to hours', () => {
  const result = calculateQuote(baseInput({
    units: [{ ...BASE_UNIT, quantity: 2 }],
    setupMinutesPerUnit: 30,
    teardownMinutesPerUnit: 20,
    crewSize: 3,
    laborRate: 25,
  }));
  const minutes = 2 * (30 + 20);
  const hours = 3 * minutes / 60;
  assert.equal(result.laborHours, hours);
  assert.equal(result.laborCost, hours * 25);
});

test('generator fee is charged only when generatorNeeded is true', () => {
  const withGen = calculateQuote(baseInput({ generatorNeeded: true, generatorFee: 75 }));
  const withoutGen = calculateQuote(baseInput({ generatorNeeded: false, generatorFee: 75 }));
  assert.equal(withGen.generatorCost, 75);
  assert.equal(withoutGen.generatorCost, 0);
});

test('attendant cost is charged per wet unit, not per dry unit', () => {
  const result = calculateQuote(baseInput({
    units: [
      { name: 'Water slide', quantity: 1, dailyRate: 275, replacementValue: 3800, wet: true },
      { name: 'Standard bounce house', quantity: 3, dailyRate: 150, replacementValue: 1800, wet: false },
    ],
    attendantHours: 6,
    attendantRate: 18,
  }));
  // Only the 1 wet unit is billed attendant time, not the 3 dry ones.
  assert.equal(result.attendantCost, 1 * 6 * 18);
  assert.equal(result.wetUnits, 1);
});

test('flags a wet unit quoted with no attendant time budgeted', () => {
  const flagged = calculateQuote(baseInput({
    units: [{ name: 'Dunk tank', quantity: 1, dailyRate: 180, replacementValue: 2400, wet: true }],
    attendantHours: 0,
    attendantRate: 0,
  }));
  assert.equal(flagged.wetUnitsMissingAttendant, true);

  const covered = calculateQuote(baseInput({
    units: [{ name: 'Dunk tank', quantity: 1, dailyRate: 180, replacementValue: 2400, wet: true }],
    attendantHours: 4,
    attendantRate: 15,
  }));
  assert.equal(covered.wetUnitsMissingAttendant, false);

  const dryOnly = calculateQuote(baseInput({ attendantHours: 0, attendantRate: 0 }));
  assert.equal(dryOnly.wetUnitsMissingAttendant, false, 'no wet units means nothing to flag');
});

test('insurance cost scales with the fleet total replacement value, not the price', () => {
  const result = calculateQuote(baseInput({
    units: [{ ...BASE_UNIT, quantity: 2, replacementValue: 1800 }],
    insuranceRatePct: 2,
  }));
  assert.equal(result.totalReplacementValue, 3600);
  assert.equal(result.insuranceCost, 3600 * 0.02);
});

test('price applies overhead then divides by (1 - margin), not a markup on cost', () => {
  const result = calculateQuote(baseInput({ overheadRate: 10, targetMargin: 25 }));
  const expectedTotalCost = result.directCost * 1.10;
  assert.ok(Math.abs(result.totalCost - expectedTotalCost) < 1e-9);
  const expectedPrice = expectedTotalCost / 0.75;
  assert.ok(Math.abs(result.price - expectedPrice) < 1e-9);
  assert.ok(Math.abs(result.profit - (result.price - result.totalCost)) < 1e-9);
});

test('a target margin of zero prices exactly at total cost', () => {
  const result = calculateQuote(baseInput({ targetMargin: 0 }));
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('pricePerUnit divides the final price by total quantity', () => {
  const result = calculateQuote(baseInput({ units: [{ ...BASE_UNIT, quantity: 4 }] }));
  assert.ok(Math.abs(result.pricePerUnit - result.price / 4) < 1e-9);
});

test('a proposed price below the walk-away price is flagged as a loss', () => {
  const result = calculateQuote(baseInput({ proposedPrice: 1 }));
  assert.equal(result.proposed.belowBreakEven, true);
  assert.ok(result.proposed.profit < 0);
});

test('a proposed price above cost reports a positive margin', () => {
  const result = calculateQuote(baseInput());
  const proposed = calculateQuote(baseInput({ proposedPrice: result.price + 100 }));
  assert.equal(proposed.proposed.belowBreakEven, false);
  assert.ok(proposed.proposed.margin > 0);
});

test('an absent proposed price is reported as null, not zero', () => {
  const result = calculateQuote(baseInput({ proposedPrice: null }));
  assert.equal(result.proposed, null);
  const blank = calculateQuote(baseInput({ proposedPrice: '' }));
  assert.equal(blank.proposed, null);
});

test('each unit reports its own share of direct cost, summing to <= 100%', () => {
  const result = calculateQuote(baseInput({
    units: [
      { ...BASE_UNIT, quantity: 2 },
      { name: 'Obstacle course', quantity: 1, dailyRate: 350, replacementValue: 5200, wet: false },
    ],
  }));
  const totalShare = result.units.reduce((sum, unit) => sum + unit.costShare, 0);
  assert.ok(totalShare > 0 && totalShare <= 100.0001);
});

test('every preset has a positive daily rate and replacement value', () => {
  assert.ok(UNIT_PRESETS.length > 0);
  for (const preset of UNIT_PRESETS) {
    assert.ok(preset.dailyRate > 0, preset.id);
    assert.ok(preset.replacementValue > 0, preset.id);
    assert.equal(typeof preset.wet, 'boolean', preset.id);
  }
});

test('a named unit label is preserved; an unnamed one gets a positional default', () => {
  const result = calculateQuote(baseInput({
    units: [
      { ...BASE_UNIT, name: '  Custom slide  ' },
      { quantity: 1, dailyRate: 100, replacementValue: 900 },
    ],
  }));
  assert.equal(result.units[0].name, 'Custom slide');
  assert.equal(result.units[1].name, 'Unit 2');
});
