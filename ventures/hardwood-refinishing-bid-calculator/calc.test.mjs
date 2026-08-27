import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  stairMaterialSqFt,
  gallonCount,
  suggestedHoursPer100,
  suggestedBaseCoats,
  suggestedStain,
  METHOD_PRESETS,
  STAIN_PRESETS,
  JOB_PRESETS,
  STAIR_SQ_FT_PER_TREAD,
} from './calc.mjs';

const firstFloor = (overrides = {}) => ({
  floorSqFt: 800,
  treads: 12,
  closets: 2,
  hoursPer100: 8,
  hoursPerTread: 0.4,
  hoursPerCloset: 1,
  methodLaborFactor: 1,
  staining: false,
  stainHoursPer100: 1.8,
  extraCoats: 0,
  extraCoatHoursPer100: 1.2,
  furnitureHours: 3,
  repairHours: 1.5,
  baseCoats: 3,
  finishCoverage: 450,
  stainCoverage: 500,
  finishCost: 85,
  stainCost: 45,
  suppliesPer100: 18,
  hourlyWage: 42,
  burdenRate: 30,
  travelAndEquipment: 185,
  overheadRate: 15,
  targetMargin: 25,
  ...overrides,
});

test('stair material area is treads times a fixed tread-and-riser allowance', () => {
  assert.equal(stairMaterialSqFt(12), 48);
  assert.equal(stairMaterialSqFt(0), 0);
  assert.throws(() => stairMaterialSqFt(-1), /Stair treads must be at least 0/);
});

test('gallons round up so a leftover tenth of a gallon is still a gallon', () => {
  assert.equal(gallonCount(848, 3, 450), 6);
  assert.equal(gallonCount(450, 1, 450), 1);
  assert.equal(gallonCount(0, 3, 450), 0);
  assert.throws(() => gallonCount(800, 3, 0), /greater than zero/);
});

test('stairs and closets add hours that a per-square-foot quote never sees', () => {
  const fieldOnly = calculateBid(firstFloor({ treads: 0, closets: 0, furnitureHours: 0, repairHours: 0 }));
  const full = calculateBid(firstFloor());
  assert.ok(full.totalHours > fieldOnly.totalHours);
  assert.ok(full.price > fieldOnly.price);
  assert.ok(Math.abs(fieldOnly.floorHours - 64) < 1e-12);
  assert.ok(Math.abs(full.stairHours - 4.8) < 1e-12);
  assert.ok(Math.abs(full.closetHours - 2) < 1e-12);
});

test('method labor factor scales the field only, not stairs or furniture', () => {
  const sand = calculateBid(firstFloor());
  const dustless = calculateBid(firstFloor({ methodLaborFactor: 1.2 }));
  assert.ok(Math.abs(dustless.floorHours - sand.floorHours * 1.2) < 1e-12);
  assert.equal(dustless.stairHours, sand.stairHours);
  assert.equal(dustless.closetHours, sand.closetHours);
  assert.equal(dustless.furnitureHours, sand.furnitureHours);
  assert.ok(dustless.price > sand.price);
});

test('stain and a color-change extra coat follow finish area, including stairs', () => {
  const poly = calculateBid(firstFloor());
  const stained = calculateBid(firstFloor({ staining: true }));
  const colorChange = calculateBid(firstFloor({ staining: true, extraCoats: 1 }));
  assert.equal(poly.stainHours, 0);
  assert.equal(poly.stainGallons, 0);
  assert.ok(Math.abs(stained.stainHours - 8.48 * 1.8) < 1e-12);
  assert.equal(stained.stainGallons, 2);
  assert.ok(stained.price > poly.price);
  assert.ok(Math.abs(colorChange.extraCoatHours - 8.48 * 1.2) < 1e-12);
  assert.ok(colorChange.finishGallons > stained.finishGallons);
  assert.ok(colorChange.price > stained.price);
});

test('a 14-tread hallway is a different job from the same square footage of field', () => {
  const hallway = calculateBid(firstFloor({
    floorSqFt: 250,
    treads: 14,
    closets: 0,
    furnitureHours: 1,
    repairHours: 1,
    staining: true,
  }));
  const field = calculateBid(firstFloor({
    floorSqFt: 250,
    treads: 0,
    closets: 0,
    furnitureHours: 1,
    repairHours: 1,
    staining: true,
  }));
  assert.ok(hallway.stairHours > 5);
  assert.ok(hallway.totalHours > field.totalHours);
  assert.ok(hallway.price > field.price);
  assert.ok(hallway.pricePerSqFt > field.pricePerSqFt);
  assert.ok(hallway.hourShares.stairs > 15, `stairs are only ${hallway.hourShares.stairs.toFixed(1)}% of hours`);
});

test('price stacks burden, materials, travel, overhead, then margin as a share of price', () => {
  const result = calculateBid(firstFloor());
  assert.equal(result.loadedWage, 42 * 1.3);
  assert.equal(result.finishGallons, 6);
  assert.equal(result.stainGallons, 0);
  assert.ok(Math.abs(result.finishTotal - 510) < 1e-12);
  assert.ok(Math.abs(result.supplies - 8.48 * 18) < 1e-12);

  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-12);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-12);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-12);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid(firstFloor({ targetMargin: 0 }));
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(firstFloor());
  const scored = calculateBid(firstFloor({ proposedPrice: bid.price }));
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(firstFloor());
  const scored = calculateBid(firstFloor({ proposedPrice: bid.totalCost - 200 }));
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(firstFloor()).proposed, null);
  assert.equal(calculateBid(firstFloor({ proposedPrice: '' })).proposed, null);
  assert.equal(calculateBid(firstFloor({ proposedPrice: 0 })).proposed.price, 0);
});

test('helpers match the shipped presets', () => {
  assert.equal(suggestedHoursPer100('screen'), 3.5);
  assert.equal(suggestedHoursPer100('full_sand'), 8);
  assert.equal(suggestedBaseCoats('screen'), 2);
  assert.equal(suggestedBaseCoats('full_sand'), 3);
  assert.deepEqual(suggestedStain('poly_only'), { staining: false, extraCoats: 0 });
  assert.deepEqual(suggestedStain('color_change'), { staining: true, extraCoats: 1 });
  assert.throws(() => suggestedHoursPer100('buff'), /Unknown refinish method/);
  assert.throws(() => suggestedStain('gel'), /Unknown stain choice/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid(firstFloor({ floorSqFt: 0, treads: 0 })), /floor square footage or at least one stair/);
  assert.throws(() => calculateBid(firstFloor({ hoursPer100: 0 })), /greater than zero/);
  assert.throws(() => calculateBid(firstFloor({ methodLaborFactor: 0 })), /greater than zero/);
  assert.throws(() => calculateBid(firstFloor({ baseCoats: 0 })), /greater than zero/);
  assert.throws(() => calculateBid(firstFloor({ hourlyWage: 'abc' })), /Hourly wage must be a number/);
  assert.throws(() => calculateBid(firstFloor({ targetMargin: 100 })), /less than 100/);
  assert.throws(() => calculateBid(firstFloor({ overheadRate: -1 })), /Overhead must be at least 0/);
});

test('presets are usable starting points', () => {
  assert.ok(METHOD_PRESETS.length >= 2);
  assert.ok(STAIN_PRESETS.length >= 3);
  assert.ok(JOB_PRESETS.length >= 4);
  for (const preset of JOB_PRESETS) {
    const method = METHOD_PRESETS.find((item) => item.id === preset.methodId);
    const stain = STAIN_PRESETS.find((item) => item.id === preset.stainId);
    const result = calculateBid(firstFloor({
      floorSqFt: preset.floorSqFt,
      treads: preset.treads,
      closets: preset.closets,
      hoursPer100: method.hoursPer100,
      baseCoats: method.baseCoats,
      staining: stain.staining,
      extraCoats: stain.extraCoats,
      furnitureHours: preset.furnitureHours,
      repairHours: preset.repairHours,
    }));
    assert.ok(result.price > 0);
    assert.ok(result.totalHours > 0);
  }
});

test('customer-facing summary omits wages and costs', () => {
  const result = calculateBid(firstFloor());
  const text = formatBidSummary(result);
  assert.match(text, /HARDWOOD FLOOR REFINISHING/);
  assert.match(text, /800 sq ft of field, 12 stair treads, 2 closets/);
  assert.match(text, /No stain/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /\$42/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /overhead/i);
});

test('default 800 sq ft first floor lands in a range a contractor recognises', () => {
  const result = calculateBid(firstFloor());
  assert.equal(result.price.toFixed(2), '7603.83');
  assert.equal(result.pricePerSqFt.toFixed(2), '9.50');
  assert.equal(result.totalHours.toFixed(2), '75.30');
  assert.equal(result.breakEvenPrice.toFixed(2), '5702.87');
  assert.equal(STAIR_SQ_FT_PER_TREAD, 4);
});
