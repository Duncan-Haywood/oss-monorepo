import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  MATERIAL_PRESETS,
  STORY_MULTIPLIERS,
  ACCESSORY_PRESETS,
  ADD_ON_PRESETS,
  HOUSEWRAP_HOURS_PER_SQUARE,
  HOURS_PER_OPENING,
} from './calc.mjs';

const typical = () => ({
  walls: [
    { name: 'Front elevation', lengthFt: 40, heightFt: 18 },
    { name: 'Rear elevation', lengthFt: 40, heightFt: 10 },
    { name: 'Left gable', lengthFt: 28, heightFt: 14 },
    { name: 'Right gable', lengthFt: 28, heightFt: 14 },
  ],
  openingSqFt: 180,
  openingCount: 12,
  wastePercent: 10,
  hoursPerSquare: 4.5,
  materialPerSquare: 185,
  tearOffHoursPerSquare: 2.0,
  stories: 2,
  tearOff: true,
  housewrap: true,
  housewrapPerSqFt: 0.38,
  accessories: [
    { id: 'starter', label: 'Starter strip', linearFeet: 136, hoursPer100Lf: 0.4, materialPerLf: 1.15 },
    { id: 'outsideCorner', label: 'Outside corners', linearFeet: 72, hoursPer100Lf: 0.65, materialPerLf: 4.75 },
    { id: 'jChannel', label: 'J-channel / window wrap', linearFeet: 220, hoursPer100Lf: 0.5, materialPerLf: 1.45 },
  ],
  addOns: [],
  hourlyWage: 32,
  burdenRate: 34,
  milesOneWay: 14,
  speedMph: 35,
  setupHours: 0.75,
  minOnSiteHours: 4,
  tripFee: 85,
  dumpsterCost: 525,
  otherCost: 0,
  overheadRate: 18,
  targetMargin: 28,
});

test('net squares come from wall area minus openings, then waste', () => {
  const result = calculateBid(typical());
  // 40*18 + 40*10 + 28*14 + 28*14 = 720 + 400 + 392 + 392 = 1904
  assert.ok(Math.abs(result.grossWallSqFt - 1904) < 1e-9);
  assert.ok(Math.abs(result.netWallSqFt - 1724) < 1e-9);
  assert.ok(Math.abs(result.netSquares - 17.24) < 1e-9);
  assert.ok(Math.abs(result.billableSquares - 17.24 * 1.1) < 1e-9);
});

test('a gable consumes area out of proportion to "one wall"', () => {
  const result = calculateBid(typical());
  const front = result.walls.find(wall => wall.name === 'Front elevation');
  const rear = result.walls.find(wall => wall.name === 'Rear elevation');
  assert.ok(front.areaShare > rear.areaShare);
  assert.ok(front.grossSqFt > rear.grossSqFt);
  assert.equal(result.walls.length, 4);
});

test('two-story fiber-cement tear-off is a different job than one-story vinyl no-tear-off', () => {
  const vinyl = MATERIAL_PRESETS.find(preset => preset.id === 'vinyl');
  const fiber = MATERIAL_PRESETS.find(preset => preset.id === 'fiber-cement');
  const hard = calculateBid({
    ...typical(),
    wastePercent: fiber.wastePercent,
    hoursPerSquare: fiber.hoursPerSquare,
    materialPerSquare: fiber.materialPerSquare,
    tearOffHoursPerSquare: fiber.tearOffHoursPerSquare,
    stories: 2,
    tearOff: true,
    housewrap: true,
  });
  const easy = calculateBid({
    ...typical(),
    wastePercent: vinyl.wastePercent,
    hoursPerSquare: vinyl.hoursPerSquare,
    materialPerSquare: vinyl.materialPerSquare,
    tearOffHoursPerSquare: vinyl.tearOffHoursPerSquare,
    stories: 1,
    tearOff: false,
    housewrap: false,
    dumpsterCost: 525,
    milesOneWay: 4,
    accessories: [],
    openingCount: 4,
    openingSqFt: 80,
  });
  assert.ok(hard.totalHours > easy.totalHours * 1.4);
  assert.ok(hard.price > easy.price * 1.5);
  assert.ok(hard.dumpster > 0);
  assert.equal(easy.dumpster, 0);
  assert.ok(hard.tearOffHours > 0);
  assert.equal(easy.tearOffHours, 0);
});

test('price stacks burden, material, dumpster, overhead, then margin as a share of price', () => {
  const result = calculateBid(typical());
  assert.equal(result.loadedWage, 32 * 1.34);
  assert.equal(result.heightMultiplier, STORY_MULTIPLIERS[2]);

  const expectedInstall = result.billableSquares * 4.5 * 1.35;
  assert.ok(Math.abs(result.installHours - expectedInstall) < 1e-9);
  const expectedTearOff = result.billableSquares * 2.0;
  assert.ok(Math.abs(result.tearOffHours - expectedTearOff) < 1e-9);
  const expectedWrap = result.netSquares * HOUSEWRAP_HOURS_PER_SQUARE;
  assert.ok(Math.abs(result.wrapHours - expectedWrap) < 1e-9);
  assert.ok(Math.abs(result.openingHours - 12 * HOURS_PER_OPENING) < 1e-9);
  assert.ok(Math.abs(result.travelHours - (28 / 35)) < 1e-9);

  const expectedLabor = result.totalHours * result.loadedWage;
  assert.ok(Math.abs(result.laborCost - expectedLabor) < 1e-9);
  const expectedSiding = result.billableSquares * 185;
  assert.ok(Math.abs(result.sidingMaterial - expectedSiding) < 1e-9);
  const expectedWrapMat = result.netWallSqFt * 0.38;
  assert.ok(Math.abs(result.wrapMaterial - expectedWrapMat) < 1e-9);
  assert.equal(result.dumpster, 525);
  const direct = result.laborCost + result.sidingMaterial + result.wrapMaterial +
    result.accessoryMaterial + result.addOnParts + 525 + 85;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.18) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...typical(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(typical());
  const scored = calculateBid({ ...typical(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(typical());
  const scored = calculateBid({ ...typical(), proposedPrice: bid.totalCost - 400 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(typical()).proposed, null);
  assert.equal(calculateBid({ ...typical(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...typical(), proposedPrice: 0 }).proposed.price, 0);
});

test('minimum on-site hours pads a tiny patch but not a full re-side', () => {
  const tiny = calculateBid({
    ...typical(),
    walls: [{ name: 'Dormer cheek', lengthFt: 8, heightFt: 6 }],
    openingSqFt: 0,
    openingCount: 0,
    stories: 1,
    tearOff: false,
    housewrap: false,
    accessories: [],
    setupHours: 0,
    minOnSiteHours: 4,
    milesOneWay: 0,
    dumpsterCost: 0,
  });
  assert.equal(tiny.minimumApplied, true);
  assert.equal(tiny.onSiteHours, 4);
  assert.equal(tiny.travelHours, 0);
  assert.equal(tiny.totalHours, 4);

  const full = calculateBid({ ...typical(), minOnSiteHours: 4 });
  assert.equal(full.minimumApplied, false);
  assert.ok(full.onSiteHours > 4);
});

test('travel is a round trip and never silently free at zero speed', () => {
  const result = calculateBid({ ...typical(), milesOneWay: 17.5, speedMph: 35 });
  assert.ok(Math.abs(result.travelHours - 1) < 1e-9);
  assert.throws(() => calculateBid({ ...typical(), speedMph: 0 }), /Travel speed must be greater than zero/);
});

test('accessories contribute hours and material; add-ons can be disabled', () => {
  const result = calculateBid({
    ...typical(),
    accessories: [
      { id: 'starter', label: 'Starter strip', linearFeet: 100, hoursPer100Lf: 0.4, materialPerLf: 1.15 },
    ],
    addOns: [
      { id: 'scaffold', label: 'Scaffold / pump jacks', hours: 3, parts: 380, enabled: true },
      { id: 'soffitFascia', label: 'Soffit and fascia', hours: 6, parts: 420, enabled: false },
    ],
  });
  assert.ok(Math.abs(result.accessoryHours - 0.4) < 1e-9);
  assert.ok(Math.abs(result.accessoryMaterial - 115) < 1e-9);
  assert.equal(result.addOns.length, 1);
  assert.ok(Math.abs(result.addOnHours - 3) < 1e-9);
  assert.equal(result.addOnParts, 380);
});

test('dumpster and wrap only apply when those scopes are on', () => {
  const withBoth = calculateBid(typical());
  const without = calculateBid({ ...typical(), tearOff: false, housewrap: false });
  assert.equal(withBoth.dumpster, 525);
  assert.equal(without.dumpster, 0);
  assert.ok(withBoth.wrapMaterial > 0);
  assert.equal(without.wrapMaterial, 0);
  assert.ok(withBoth.wrapHours > 0);
  assert.equal(without.wrapHours, 0);
});

test('a nameless wall still reports under a stable label', () => {
  const result = calculateBid({
    ...typical(),
    walls: [{ lengthFt: 20, heightFt: 10 }, { name: '   ', lengthFt: 12, heightFt: 8 }],
    openingSqFt: 0,
  });
  assert.equal(result.walls[0].name, 'Wall 1');
  assert.equal(result.walls[1].name, 'Wall 2');
});

test('zero net area still reports ratios as n/a instead of dividing by zero', () => {
  const result = calculateBid({
    ...typical(),
    walls: [{ name: 'Empty', lengthFt: 0, heightFt: 10 }],
    openingSqFt: 0,
    openingCount: 0,
    tearOff: false,
    housewrap: false,
    accessories: [],
    tripFee: 80,
    milesOneWay: 0,
    dumpsterCost: 0,
  });
  assert.equal(result.netWallSqFt, 0);
  assert.equal(result.pricePerNetSqFt, null);
  assert.equal(result.pricePerSquare, null);
  assert.equal(result.walls[0].areaShare, 0);
  assert.ok(result.price > 80);
});

test('openings larger than the walls are rejected', () => {
  assert.throws(
    () => calculateBid({ ...typical(), openingSqFt: 5000 }),
    /cannot exceed the wall area/,
  );
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...typical(), walls: [] }), /at least one wall/);
  assert.throws(
    () => calculateBid({ ...typical(), walls: [{ name: 'Gable', lengthFt: -1, heightFt: 10 }] }),
    /Gable: length must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...typical(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...typical(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...typical(), stories: 0 }), /Stories must be at least 1/);
});

test('presets are usable positive numbers', () => {
  assert.ok(MATERIAL_PRESETS.length >= 4);
  for (const preset of MATERIAL_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.hoursPerSquare) && preset.hoursPerSquare > 0);
    assert.ok(preset.wastePercent > 0);
    assert.ok(preset.materialPerSquare > 0);
  }
  assert.ok(ACCESSORY_PRESETS.length >= 5);
  assert.ok(ADD_ON_PRESETS.length >= 2);
  const fiber = MATERIAL_PRESETS.find(preset => preset.id === 'fiber-cement');
  const vinyl = MATERIAL_PRESETS.find(preset => preset.id === 'vinyl');
  assert.ok(fiber.hoursPerSquare > vinyl.hoursPerSquare);
  assert.ok(fiber.materialPerSquare > vinyl.materialPerSquare);
});
