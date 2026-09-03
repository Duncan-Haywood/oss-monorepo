import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  heightFactor,
  SURFACE_PRESETS,
  DEFAULT_EXTRA_COAT_FACTOR,
} from './calc.mjs';

const house = () => ({
  surfaces: [
    { type: 'walls', quantity: 2400, productionRate: 200, coats: 2 },
    { type: 'ceilings', quantity: 1200, productionRate: 175, coats: 2 },
    { type: 'trim', quantity: 320, productionRate: 50, coats: 2 },
    { type: 'doors', quantity: 8, productionRate: 1.25, coats: 2 },
    { type: 'windows', quantity: 10, productionRate: 2.5, coats: 1 },
  ],
  hourlyWage: 25,
  burdenRate: 25,
  prepHours: 6,
  setupHours: 2,
  paintPrice: 45,
  paintCoverage: 350,
  wastePercent: 10,
  travelCost: 40,
  otherCost: 35,
  overheadRate: 15,
  targetMargin: 25,
  extraCoatFactor: DEFAULT_EXTRA_COAT_FACTOR,
  ceilingHeightFeet: 8,
  floorSquareFeet: 1200,
  commonFloorBid: 2,
});

test('labor hours come from production rates and extra coats, not floor area', () => {
  const result = calculateBid(house());
  // walls: 2400/200 = 12 first + 12*0.65 = 19.8
  // ceilings: 1200/175 ≈ 6.857 + 4.457 = 11.314
  // trim: 320/50 = 6.4 + 4.16 = 10.56
  // doors: 8/1.25 = 6.4 + 4.16 = 10.56
  // windows: 10/2.5 = 4 (one coat)
  const expectedSurface = 19.8 + (1200 / 175) * (1 + 0.65) + 10.56 + 10.56 + 4;
  assert.ok(Math.abs(result.surfaceHours - expectedSurface) < 1e-9);
  assert.ok(Math.abs(result.laborHours - (expectedSurface + 6 + 2)) < 1e-9);
  assert.equal(result.wallHeightFactor, 1);
});

test('trim and doors consume labor out of proportion to floor area', () => {
  const result = calculateBid(house());
  const trim = result.surfaces.find((s) => s.type === 'trim');
  const doors = result.surfaces.find((s) => s.type === 'doors');
  const walls = result.surfaces.find((s) => s.type === 'walls');
  // Floor area never sees trim or doors, but they take a real share of the day.
  assert.ok(trim.hoursShare > 15, `trim is only ${trim.hoursShare.toFixed(1)}% of hours`);
  assert.ok(doors.hoursShare > 15, `doors are only ${doors.hoursShare.toFixed(1)}% of hours`);
  assert.ok(
    trim.hoursShare + doors.hoursShare > walls.hoursShare * 0.9,
    'trim+doors should rival wall hours on a typical 3-bed',
  );
});

test('price stacks burden, paint, overhead, then margin as a share of price', () => {
  const result = calculateBid(house());
  assert.equal(result.loadedWage, 25 * 1.25);

  const direct = result.laborCost + result.paintCost + 40 + 35;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.jobCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
});

test('paint gallons follow paintable area, coats, waste, and coverage', () => {
  const result = calculateBid(house());
  // walls 2400*2, ceilings 1200*2, trim 320*0.5*2, doors 8*40*2, windows 10*12*1
  const paintable = 2400 + 1200 + 160 + 320 + 120;
  assert.ok(Math.abs(result.paintableSqFt - paintable) < 1e-9);
  const gallons = (2400 * 2 + 1200 * 2 + 160 * 2 + 320 * 2 + 120) * 1.1 / 350;
  assert.ok(Math.abs(result.paintGallons - gallons) < 1e-9);
  assert.ok(Math.abs(result.paintCost - gallons * 45) < 1e-9);
});

test('a $2/sq ft floor bid on this house is under water', () => {
  const result = calculateBid(house());
  assert.equal(result.commonBid.price, 2400);
  assert.equal(result.commonBid.belowBreakEven, true);
  assert.ok(result.commonBid.profit < 0);
  assert.ok(result.price > 2400);
  assert.ok(result.pricePerFloorSqFt > 2);
  assert.ok(result.breakEvenPrice > 2400);
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
  const scored = calculateBid({ ...house(), proposedPrice: bid.jobCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(house()).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...house(), proposedPrice: 0 }).proposed.price, 0);
});

test('taller walls slow wall hours and leave trim hours alone', () => {
  const standard = calculateBid(house());
  const tall = calculateBid({ ...house(), ceilingHeightFeet: 11 });
  const standardWalls = standard.surfaces.find((s) => s.type === 'walls');
  const tallWalls = tall.surfaces.find((s) => s.type === 'walls');
  const standardTrim = standard.surfaces.find((s) => s.type === 'trim');
  const tallTrim = tall.surfaces.find((s) => s.type === 'trim');
  assert.ok(Math.abs(tall.wallHeightFactor - 1.3) < 1e-12);
  assert.ok(Math.abs(tallWalls.laborHours - standardWalls.laborHours * 1.3) < 1e-9);
  assert.equal(tallTrim.laborHours, standardTrim.laborHours);
});

test('height factor steps at 9, 10, and 12 feet', () => {
  assert.equal(heightFactor(8), 1);
  assert.equal(heightFactor(9), 1);
  assert.equal(heightFactor(9.5), 1.12);
  assert.equal(heightFactor(10), 1.12);
  assert.equal(heightFactor(11), 1.3);
  assert.equal(heightFactor(12), 1.3);
  assert.equal(heightFactor(14), 1.55);
});

test('a zero-quantity surface costs nothing and is left out of the split', () => {
  const input = house();
  input.surfaces.push({ type: 'cabinets', quantity: 0, productionRate: 1.5, coats: 2 });
  const result = calculateBid(input);
  const cabinets = result.surfaces.find((s) => s.type === 'cabinets');
  assert.equal(cabinets.laborHours, 0);
  assert.equal(cabinets.gallons, 0);
  assert.equal(cabinets.hoursShare, 0);
});

test('a nameless other surface still reports under a stable label', () => {
  const result = calculateBid({
    ...house(),
    surfaces: [{ quantity: 10, productionRate: 5, coats: 1 }, { name: '   ', quantity: 4, productionRate: 2, coats: 1 }],
  });
  assert.equal(result.surfaces[0].name, 'Surface 1');
  assert.equal(result.surfaces[1].name, 'Surface 2');
});

test('a job with no paintable area reports no per-unit ratios instead of dividing by zero', () => {
  const result = calculateBid({
    ...house(),
    surfaces: [{ type: 'walls', quantity: 0, productionRate: 200, coats: 2 }],
    floorSquareFeet: 0,
    prepHours: 3,
    setupHours: 0,
    travelCost: 50,
  });
  assert.equal(result.surfaceHours, 0);
  assert.equal(result.pricePerPaintableSqFt, null);
  assert.equal(result.pricePerFloorSqFt, null);
  assert.ok(result.price > 50);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...house(), surfaces: [] }), /at least one surface/);
  assert.throws(
    () => calculateBid({
      ...house(),
      surfaces: [{ type: 'walls', quantity: 100, productionRate: 0, coats: 2 }],
    }),
    /production rate must be greater than zero/,
  );
  assert.throws(() => calculateBid({ ...house(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...house(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...house(), extraCoatFactor: 0 }), /Extra-coat factor/);
  assert.throws(() => calculateBid({ ...house(), paintCoverage: 0 }), /Paint coverage must be greater than zero/);
  assert.throws(
    () => calculateBid({
      ...house(),
      surfaces: [{ type: 'walls', quantity: 100, productionRate: 200, coats: 1.5 }],
    }),
    /coats must be a whole number/,
  );
});

test('production-rate presets are usable positive numbers', () => {
  assert.ok(SURFACE_PRESETS.length >= 5);
  for (const preset of SURFACE_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(Number.isFinite(preset.defaultRate) && preset.defaultRate > 0);
    assert.ok(Number.isFinite(preset.areaPerUnit) && preset.areaPerUnit > 0);
  }
});
