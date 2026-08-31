import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  DOOR_SIZE_PRESETS,
  CONSTRUCTION_PRESETS,
  JOB_TYPES,
  OPENER_PRESETS,
  SPRING_KIT_COST,
  HIGH_CYCLE_SPRING_MULTIPLIER,
  DEFAULT_AVERAGE_MPH,
  doorClass,
  suggestedLaborHours,
  suggestedDoorCost,
  suggestedSpringCost,
} from './calc.mjs';

const springJob = (overrides = {}) => ({
  jobType: 'spring_only',
  widthFt: 16,
  heightFt: 7,
  doorCost: 0,
  springCost: 175,
  openerCost: 0,
  hardwareCost: 0,
  disposalCost: 0,
  permitCost: 0,
  laborHours: 1.25,
  hourlyWage: 28,
  burdenRate: 30,
  roundTripMiles: 0,
  costPerMile: 0.75,
  afterHoursMultiplier: 1,
  overheadRate: 15,
  targetMargin: 25,
  ...overrides,
});

const replacement = (overrides = {}) => ({
  jobType: 'replacement_with_opener',
  widthFt: 16,
  heightFt: 7,
  doorCost: 16 * 7 * 12.5,
  springCost: 175,
  openerCost: 380,
  hardwareCost: 85,
  disposalCost: 45,
  permitCost: 0,
  laborHours: 5.5,
  hourlyWage: 28,
  burdenRate: 30,
  roundTripMiles: 24,
  costPerMile: 0.75,
  afterHoursMultiplier: 1,
  overheadRate: 15,
  targetMargin: 25,
  ...overrides,
});

test('door class splits at ten feet, not at a marketing "double"', () => {
  assert.equal(doorClass(8), 'single');
  assert.equal(doorClass(10), 'single');
  assert.equal(doorClass(10.1), 'double');
  assert.equal(doorClass(16), 'double');
});

test('suggested parts scale with size and construction, not a lump sum', () => {
  assert.equal(suggestedDoorCost(8, 7, 'insulated_r9'), 8 * 7 * 12.5);
  assert.equal(suggestedSpringCost(8), SPRING_KIT_COST.single);
  assert.equal(suggestedSpringCost(16, true), SPRING_KIT_COST.double * HIGH_CYCLE_SPRING_MULTIPLIER);
  assert.equal(suggestedLaborHours('spring_only', 8), 1);
  assert.equal(suggestedLaborHours('replacement_with_opener', 16), 5.5);
});

test('a 16×7 is not two 8×7 replacements', () => {
  const single = calculateBid(replacement({
    widthFt: 8,
    heightFt: 7,
    doorCost: 8 * 7 * 12.5,
    springCost: SPRING_KIT_COST.single,
    laborHours: suggestedLaborHours('replacement_with_opener', 8),
    roundTripMiles: 24,
  }));
  const double = calculateBid(replacement({
    widthFt: 16,
    heightFt: 7,
    doorCost: 16 * 7 * 12.5,
    springCost: SPRING_KIT_COST.double,
    laborHours: suggestedLaborHours('replacement_with_opener', 16),
    roundTripMiles: 24,
  }));

  // Area (and therefore the slab) is 2×, but travel is the same trip and
  // labor is closer to 1.3× than 2×. Quoting "two singles" overstates it.
  assert.ok(Math.abs(double.doorCost / single.doorCost - 2) < 1e-9);
  assert.equal(double.travelCost, single.travelCost);
  assert.ok(double.laborHours / single.laborHours < 1.4);
  assert.ok(double.price < single.price * 2 * 0.92);
});

test('travel labor uses miles ÷ mph unless drive hours are stated', () => {
  const inferred = calculateBid(springJob({ roundTripMiles: 60, costPerMile: 0.8 }));
  assert.ok(Math.abs(inferred.driveHours - 60 / DEFAULT_AVERAGE_MPH) < 1e-9);
  const explicit = calculateBid(springJob({ roundTripMiles: 60, costPerMile: 0.8, driveHours: 3 }));
  assert.equal(explicit.driveHours, 3);
  assert.ok(explicit.travelLaborCost > inferred.travelLaborCost);
});

test('a $189 spring special forty minutes each way loses money', () => {
  // 40 minutes each way at 30 mph is 40 miles round trip.
  const result = calculateBid(springJob({
    widthFt: 16,
    springCost: 175,
    laborHours: 1.25,
    roundTripMiles: 40,
    costPerMile: 0.8,
    proposedPrice: 189,
  }));
  assert.equal(result.jobType, 'spring_only');
  assert.equal(result.travelEatsJob, true);
  assert.equal(result.proposed.belowBreakEven, true);
  assert.ok(result.proposed.profit < 0);
  // Against the advertised $189, travel is a third or more of what they
  // would collect. Against the correctly margined bid it is a smaller
  // share — that is why the special looks fine until you price the drive.
  assert.ok(result.travelCost / result.proposed.price * 100 >= 35);
  assert.ok(result.travelCost > result.shopLaborCost);
});

test('the same spring job in the shop neighborhood can still clear margin', () => {
  const result = calculateBid(springJob({
    roundTripMiles: 8,
    costPerMile: 0.8,
  }));
  assert.equal(result.travelEatsJob, false);
  assert.ok(result.profit > 0);
  assert.ok(result.travelShare < 35);
});

test('price stacks burden, after-hours, travel, overhead, then margin of price', () => {
  const result = calculateBid(springJob({
    hourlyWage: 20,
    burdenRate: 25,
    laborHours: 1,
    afterHoursMultiplier: 1.5,
    roundTripMiles: 30,
    costPerMile: 1,
    overheadRate: 10,
    targetMargin: 20,
  }));
  assert.equal(result.loadedWage, 25);
  assert.equal(result.shopLaborCost, 1 * 25 * 1.5);
  assert.equal(result.driveHours, 1);
  assert.equal(result.travelLaborCost, 25);
  assert.equal(result.travelVehicleCost, 30);
  const direct = result.partsCost + result.shopLaborCost + result.travelCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.1) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.1) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('after-hours premium applies to shop labor only, not parts or miles', () => {
  const day = calculateBid(springJob({ afterHoursMultiplier: 1, roundTripMiles: 20 }));
  const night = calculateBid(springJob({ afterHoursMultiplier: 1.5, roundTripMiles: 20 }));
  assert.equal(night.partsCost, day.partsCost);
  assert.equal(night.travelVehicleCost, day.travelVehicleCost);
  assert.ok(Math.abs(night.shopLaborCost / day.shopLaborCost - 1.5) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid(replacement({ targetMargin: 0 }));
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(replacement());
  const scored = calculateBid(replacement({ proposedPrice: bid.price }));
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(replacement()).proposed, null);
  assert.equal(calculateBid(replacement({ proposedPrice: '' })).proposed, null);
  assert.equal(calculateBid(replacement({ proposedPrice: null })).proposed, null);
  assert.equal(calculateBid(replacement({ proposedPrice: 0 })).proposed.price, 0);
});

test('spring-only tickets do not require a door or opener cost', () => {
  const result = calculateBid(springJob({ doorCost: '', openerCost: '' }));
  assert.equal(result.doorCost, 0);
  assert.equal(result.openerCost, 0);
  assert.equal(result.pricePerSqFt, null);
});

test('replacement tickets report a price per square foot of door', () => {
  const result = calculateBid(replacement());
  assert.equal(result.doorSqFt, 112);
  assert.ok(result.pricePerSqFt > 10);
  assert.ok(result.effectiveHourlyRate > 80);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid(springJob({ jobType: 'paint' })), /Job type must be/);
  assert.throws(() => calculateBid(springJob({ widthFt: 0 })), /Door width must be greater than zero/);
  assert.throws(() => calculateBid(springJob({ heightFt: -1 })), /Door height must be at least 0/);
  assert.throws(() => calculateBid(springJob({ hourlyWage: 'abc' })), /Hourly wage must be a number/);
  assert.throws(() => calculateBid(springJob({ targetMargin: 100 })), /less than 100/);
  assert.throws(() => calculateBid(springJob({ afterHoursMultiplier: 0.5 })), /After-hours multiplier must be at least 1/);
  assert.throws(() => calculateBid(springJob({ averageMph: 0 })), /Average mph must be greater than zero/);
});

test('presets are usable positive numbers with the labels the form shows', () => {
  assert.ok(DOOR_SIZE_PRESETS.length >= 5);
  assert.ok(CONSTRUCTION_PRESETS.length >= 4);
  assert.ok(JOB_TYPES.length === 4);
  assert.ok(OPENER_PRESETS.length >= 3);
  for (const preset of [...DOOR_SIZE_PRESETS, ...CONSTRUCTION_PRESETS, ...JOB_TYPES, ...OPENER_PRESETS]) {
    assert.ok(preset.id.length > 0);
    assert.ok(preset.label.length > 0);
  }
});
