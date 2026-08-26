import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  ACCESS_VOLUME_BASIS_CU_FT,
  ACCESS_DEFAULTS,
  INVENTORY_PRESETS,
} from './calc.mjs';

const threeBed = () => ({
  inventory: [
    { name: '3 bedroom house', cubicFeet: 1100, clockHours: 5 },
  ],
  originFlights: 0,
  destFlights: 0,
  carryFeet: 20,
  elevatorWaitMinutes: 0,
  minutesPerFlightPer200CuFt: ACCESS_DEFAULTS.minutesPerFlightPer200CuFt,
  minutesPer50ftCarryPer200CuFt: ACCESS_DEFAULTS.minutesPer50ftCarryPer200CuFt,
  packingHours: 0,
  driveHours: 1,
  crewSize: 3,
  hourlyWage: 22,
  burdenRate: 25,
  truckCost: 150,
  fuelTolls: 40,
  materials: 35,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 20,
});

test('clock hours start from inventory plus drive, then add access', () => {
  const result = calculateBid(threeBed());
  assert.equal(result.inventoryHours, 5);
  assert.equal(result.driveHours, 1);
  assert.equal(result.totalCubicFeet, 1100);
  // 20 ft carry on 1100 cu ft: (20/50) * (6/60) * (1100/200) = 0.4 * 0.1 * 5.5
  assert.ok(Math.abs(result.carryHours - 0.22) < 1e-9);
  assert.ok(Math.abs(result.clockHours - (5 + 0.22 + 1)) < 1e-9);
});

test('a third-floor walk-up is a different job than the same furniture on the first floor', () => {
  const firstFloor = calculateBid(threeBed());
  const walkUp = calculateBid({ ...threeBed(), originFlights: 3 });
  assert.ok(walkUp.stairHours > 1.5, `stairs added only ${walkUp.stairHours} h`);
  assert.ok(walkUp.clockHours > firstFloor.clockHours + 1.5);
  assert.ok(walkUp.price > firstFloor.price);
  assert.ok(walkUp.accessHoursShare > 20, `access is only ${walkUp.accessHoursShare.toFixed(1)}% of the day`);
  // 3 flights * (8/60) * (1100/200) = 3 * 0.1333... * 5.5 = 2.2 h
  assert.ok(Math.abs(walkUp.stairHours - 2.2) < 1e-9);
});

test('long carry scales with cubic feet, not a flat surcharge', () => {
  const studio = calculateBid({
    ...threeBed(),
    inventory: [{ name: 'Studio / 1 bedroom', cubicFeet: 400, clockHours: 2.5 }],
    carryFeet: 100,
    driveHours: 0,
  });
  const house = calculateBid({
    ...threeBed(),
    carryFeet: 100,
    driveHours: 0,
  });
  // Same 100 ft carry must cost more hours on the larger inventory.
  assert.ok(house.carryHours > studio.carryHours * 2);
  assert.ok(Math.abs(house.carryHours / studio.carryHours - 1100 / 400) < 1e-9);
});

test('price stacks burden, truck, overhead, then margin as a share of price', () => {
  const result = calculateBid(threeBed());
  assert.equal(result.loadedWage, 22 * 1.25);
  assert.ok(Math.abs(result.personHours - result.clockHours * 3) < 1e-9);
  assert.ok(Math.abs(result.laborCost - result.personHours * result.loadedWage) < 1e-9);

  const direct = result.laborCost + 150 + 40 + 35;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...threeBed(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed bedroom-count quote is scored against the same cost base', () => {
  const bid = calculateBid(threeBed());
  const scored = calculateBid({ ...threeBed(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyPerMover - bid.effectiveHourlyPerMover) < 1e-9);
});

test('a cheap bedroom-count quote under cost is flagged as a losing bid', () => {
  const bid = calculateBid(threeBed());
  const scored = calculateBid({ ...threeBed(), proposedPrice: bid.totalCost - 150 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(threeBed()).proposed, null);
  assert.equal(calculateBid({ ...threeBed(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...threeBed(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...threeBed(), proposedPrice: 0 }).proposed.price, 0);
});

test('elevator wait is flat clock time; stairs and carry are not', () => {
  const empty = calculateBid({
    ...threeBed(),
    inventory: [{ name: 'Empty truck', cubicFeet: 0, clockHours: 0 }],
    originFlights: 4,
    carryFeet: 200,
    elevatorWaitMinutes: 20,
    driveHours: 0,
  });
  assert.equal(empty.stairHours, 0);
  assert.equal(empty.carryHours, 0);
  assert.ok(Math.abs(empty.elevatorHours - 20 / 60) < 1e-9);
  assert.ok(Math.abs(empty.clockHours - 20 / 60) < 1e-9);
});

test('a nameless line still reports under a stable label', () => {
  const result = calculateBid({
    ...threeBed(),
    inventory: [
      { cubicFeet: 100, clockHours: 0.4 },
      { name: '   ', cubicFeet: 50, clockHours: 0.2 },
    ],
  });
  assert.equal(result.inventory[0].name, 'Item 1');
  assert.equal(result.inventory[1].name, 'Item 2');
});

test('zero inventory volume reports no per-cube ratio instead of dividing by zero', () => {
  const result = calculateBid({
    ...threeBed(),
    inventory: [{ name: 'Empty', cubicFeet: 0, clockHours: 0 }],
    driveHours: 0,
    truckCost: 100,
  });
  assert.equal(result.pricePerCuFt, null);
  assert.ok(result.price > 100);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...threeBed(), inventory: [] }), /at least one room or item/);
  assert.throws(() => calculateBid({ ...threeBed(), crewSize: 0 }), /Crew size must be greater than zero/);
  assert.throws(
    () => calculateBid({ ...threeBed(), inventory: [{ name: 'Piano', cubicFeet: -5, clockHours: 1 }] }),
    /Piano: cubic feet must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...threeBed(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...threeBed(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...threeBed(), overheadRate: -1 }), /Overhead must be at least 0/);
});

test('inventory presets are usable positive numbers', () => {
  assert.ok(INVENTORY_PRESETS.length >= 8);
  for (const preset of INVENTORY_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.cubicFeet) && preset.cubicFeet > 0);
    assert.ok(Number.isFinite(preset.clockHours) && preset.clockHours > 0);
  }
});

test('access volume basis is the documented 200 cu ft van-load', () => {
  assert.equal(ACCESS_VOLUME_BASIS_CU_FT, 200);
  assert.ok(ACCESS_DEFAULTS.minutesPerFlightPer200CuFt > 0);
  assert.ok(ACCESS_DEFAULTS.minutesPer50ftCarryPer200CuFt > 0);
});

test('labor split names the parts of the day a bedroom-count quote hides', () => {
  const result = calculateBid({ ...threeBed(), originFlights: 3, packingHours: 2 });
  const names = result.split.map((row) => row.name);
  assert.ok(names.includes('Load & unload'));
  assert.ok(names.includes('Stairs'));
  assert.ok(names.includes('Packing'));
  assert.ok(names.includes('Drive time'));
  const shares = result.split.reduce((sum, row) => sum + row.share, 0);
  assert.ok(Math.abs(shares - 100) < 1e-6);
});
