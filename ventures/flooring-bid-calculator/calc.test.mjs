import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, MATERIAL_PRESETS, TEAROUT_PRESETS } from './calc.mjs';

const house = () => ({
  rooms: [
    {
      name: 'Living room',
      squareFeet: 280,
      wastePct: 8,
      installSqFtPerHour: 80,
      tearoutHoursPer100: 0.4,
      disposalPerSqFt: 0.15,
    },
    {
      name: 'Kitchen',
      squareFeet: 180,
      wastePct: 8,
      installSqFtPerHour: 80,
      tearoutHoursPer100: 2.0,
      disposalPerSqFt: 0.55,
    },
    {
      name: 'Hallway',
      squareFeet: 64,
      wastePct: 8,
      installSqFtPerHour: 80,
      tearoutHoursPer100: 0.4,
      disposalPerSqFt: 0.15,
    },
  ],
  materialCostPerSqFt: 2.4,
  underlaymentCostPerSqFt: 0.35,
  stairTreads: 13,
  hoursPerTread: 0.4,
  stairMaterialEach: 18,
  transitionCount: 6,
  hoursPerTransition: 0.15,
  transitionMaterialEach: 12,
  furnitureRooms: 2,
  hoursPerFurnitureRoom: 0.75,
  levelingSqFt: 80,
  hoursPer100Leveling: 0.8,
  levelingMaterialPerSqFt: 0.9,
  baseboardLf: 140,
  hoursPer100Baseboard: 1.2,
  baseboardMaterialPerLf: 1.1,
  hourlyWage: 28,
  burdenRate: 30,
  dumpFee: 85,
  travelCost: 40,
  otherCost: 0,
  overheadRate: 12,
  targetMargin: 25,
});

test('purchased material is installed square footage plus waste, not the finished floor', () => {
  const result = calculateBid(house());
  assert.equal(result.installedSqFt, 524);
  assert.ok(Math.abs(result.purchasedSqFt - 524 * 1.08) < 1e-9);
  assert.ok(Math.abs(result.wasteSqFt - 524 * 0.08) < 1e-9);
  assert.ok(Math.abs(result.wasteMaterialCost - result.wasteSqFt * (2.4 + 0.35)) < 1e-9);
  assert.ok(result.wasteMaterialCost > 100, 'waste on a typical house is real money, not rounding');
});

test('install hours come from production rates, not from purchased material', () => {
  const result = calculateBid(house());
  // 280/80 + 180/80 + 64/80 = 3.5 + 2.25 + 0.8
  assert.ok(Math.abs(result.roomInstallHours - 6.55) < 1e-9);
});

test('tile tear-out in the kitchen consumes labor out of proportion to its floor area', () => {
  const result = calculateBid(house());
  const kitchen = result.rooms.find(room => room.name === 'Kitchen');
  assert.ok(kitchen.areaShare < 36, `kitchen is ${kitchen.areaShare.toFixed(1)}% of the floor`);
  // Kitchen tear-out alone: 180/100 * 2.0 = 3.6 hours, more than its install.
  assert.ok(Math.abs(kitchen.tearoutHours - 3.6) < 1e-9);
  assert.ok(kitchen.tearoutHours > kitchen.installHours);
  const kitchenOfRoomHours = kitchen.hours / result.roomHours * 100;
  assert.ok(
    kitchenOfRoomHours > kitchen.areaShare + 10,
    `kitchen is ${kitchen.areaShare.toFixed(1)}% of area but ${kitchenOfRoomHours.toFixed(1)}% of room hours`,
  );
});

test('stairs are a separate job priced per tread, not another room of square footage', () => {
  const withStairs = calculateBid(house());
  const noStairs = calculateBid({ ...house(), stairTreads: 0 });
  assert.ok(Math.abs(withStairs.extras.stairs.hours - 13 * 0.4) < 1e-9);
  assert.ok(Math.abs(withStairs.laborHours - noStairs.laborHours - 5.2) < 1e-9);
  assert.ok(withStairs.stairHoursShare > 15, 'thirteen treads are a real share of the day');
  assert.ok(withStairs.price > noStairs.price);
});

test('price stacks burden, materials, extras, overhead, then margin as a share of price', () => {
  const result = calculateBid(house());
  assert.equal(result.loadedWage, 28 * 1.3);

  const extrasMaterial = result.extraMaterial;
  const materials = result.rooms.reduce((sum, room) => sum + room.materialCost, 0)
    + extrasMaterial + 85 + 40;
  assert.ok(Math.abs(result.materials - materials) < 1e-9);

  const direct = result.laborCost + result.materials;
  assert.ok(Math.abs(result.overhead - direct * 0.12) < 1e-9);
  assert.ok(Math.abs(result.jobCost - direct * 1.12) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
});

test('sanity ratios land in the range an installer recognises', () => {
  const result = calculateBid(house());
  assert.ok(result.pricePerInstalledSqFt > 6 && result.pricePerInstalledSqFt < 18);
  // Effective hourly includes material pass-through, so it sits well above
  // the loaded wage. A band that looked like a cleaning-contract rate would
  // reject a real flooring bid.
  assert.ok(result.effectiveHourlyRate > result.loadedWage);
  assert.ok(result.effectiveHourlyRate > 80 && result.effectiveHourlyRate < 400);
  assert.equal(result.breakEvenPrice, result.jobCost);
  assert.ok(result.tearoutHoursShare > 10);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...house(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.jobCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(house());
  const scored = calculateBid({ ...house(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(house());
  const scored = calculateBid({ ...house(), proposedPrice: bid.jobCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(house()).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: 0 }).proposed.price, 0);
});

test('a nameless room still reports under a stable label', () => {
  const result = calculateBid({
    ...house(),
    rooms: [
      { squareFeet: 100, wastePct: 8, installSqFtPerHour: 80, tearoutHoursPer100: 0 },
      { name: '   ', squareFeet: 50, wastePct: 8, installSqFtPerHour: 80, tearoutHoursPer100: 0 },
    ],
  });
  assert.equal(result.rooms[0].name, 'Room 1');
  assert.equal(result.rooms[1].name, 'Room 2');
});

test('a job with no installed area still prices extras instead of dividing by zero', () => {
  const result = calculateBid({
    ...house(),
    rooms: [{ name: 'Empty', squareFeet: 0, wastePct: 8, installSqFtPerHour: 80, tearoutHoursPer100: 0 }],
    stairTreads: 0,
    transitionCount: 0,
    furnitureRooms: 0,
    levelingSqFt: 0,
    baseboardLf: 0,
    dumpFee: 0,
    travelCost: 150,
  });
  assert.equal(result.laborHours, 0);
  assert.equal(result.pricePerInstalledSqFt, null);
  assert.equal(result.effectiveHourlyRate, null);
  assert.equal(result.rooms[0].hoursShare, 0);
  assert.ok(result.price > 150);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...house(), rooms: [] }), /at least one room/);
  assert.throws(
    () => calculateBid({
      ...house(),
      rooms: [{ name: 'Den', squareFeet: 100, wastePct: 8, installSqFtPerHour: 0, tearoutHoursPer100: 0 }],
    }),
    /Den: install rate must be greater than zero/,
  );
  assert.throws(
    () => calculateBid({
      ...house(),
      rooms: [{ name: 'Den', squareFeet: -5, wastePct: 8, installSqFtPerHour: 80, tearoutHoursPer100: 0 }],
    }),
    /Den: square feet must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...house(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...house(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...house(), overheadRate: -1 }), /Overhead must be at least 0/);
});

test('material and tear-out presets are usable positive-or-zero numbers', () => {
  assert.ok(MATERIAL_PRESETS.length >= 8);
  for (const preset of MATERIAL_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.wastePct) && preset.wastePct > 0);
    assert.ok(Number.isFinite(preset.installSqFtPerHour) && preset.installSqFtPerHour > 0);
  }
  assert.ok(TEAROUT_PRESETS.length >= 5);
  assert.equal(TEAROUT_PRESETS[0].hoursPer100, 0);
  for (const preset of TEAROUT_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.hoursPer100) && preset.hoursPer100 >= 0);
    assert.ok(Number.isFinite(preset.disposalPerSqFt) && preset.disposalPerSqFt >= 0);
  }
});
