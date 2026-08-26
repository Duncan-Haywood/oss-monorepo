import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  pieceEquivalent,
  gallonCount,
  suggestedLaborFactor,
  suggestedExtraCoats,
  FINISH_PRESETS,
  COLOR_PRESETS,
  JOB_PRESETS,
} from './calc.mjs';

const kitchen = (overrides = {}) => ({
  doors: 10,
  drawers: 8,
  openings: 9,
  hardwarePieces: 38,
  hoursPerDoor: 1.35,
  hoursPerDrawer: 0.75,
  hoursPerOpening: 0.65,
  hoursPerHardware: 0.09,
  finishLaborFactor: 1,
  extraCoats: 0,
  extraCoatHoursPerPiece: 0.22,
  degreaseHours: 4,
  primerCoverage: 22,
  finishCoverage: 18,
  primerCost: 48,
  finishCost: 68,
  supplies: 85,
  replaceHardware: false,
  hardwareCost: 8,
  hourlyWage: 38,
  burdenRate: 30,
  travelAndEquipment: 275,
  overheadRate: 15,
  targetMargin: 25,
  ...overrides,
});

test('piece equivalent counts doors and drawers fully and openings as a fraction', () => {
  assert.equal(pieceEquivalent(10, 8, 9), 10 + 8 + 9 * 0.6);
  assert.equal(pieceEquivalent(0, 0, 0), 0);
  assert.throws(() => pieceEquivalent(-1, 0, 0), /Doors must be at least 0/);
});

test('gallons round up so a leftover tenth of a gallon is still a gallon', () => {
  assert.equal(gallonCount(23.4, 22), 2);
  assert.equal(gallonCount(18, 18), 1);
  assert.equal(gallonCount(0, 18), 0);
  assert.throws(() => gallonCount(10, 0), /greater than zero/);
});

test('drawer fronts and face frames add hours that a per-door quote never sees', () => {
  const doorsOnly = calculateBid(kitchen({ drawers: 0, openings: 0, hardwarePieces: 20, degreaseHours: 0 }));
  const full = calculateBid(kitchen());
  assert.ok(full.totalHours > doorsOnly.totalHours);
  assert.ok(full.price > doorsOnly.price);
  assert.ok(Math.abs(doorsOnly.doorHours - 10 * 1.35) < 1e-12);
  assert.ok(Math.abs(full.drawerHours - 8 * 0.75) < 1e-12);
  assert.ok(Math.abs(full.openingHours - 9 * 0.65) < 1e-12);
});

test('finish-method factor scales painted pieces, not hardware or degrease', () => {
  const shop = calculateBid(kitchen());
  const brush = calculateBid(kitchen({ finishLaborFactor: 1.55 }));
  assert.ok(Math.abs(brush.doorHours - shop.doorHours * 1.55) < 1e-12);
  assert.ok(Math.abs(brush.drawerHours - shop.drawerHours * 1.55) < 1e-12);
  assert.ok(Math.abs(brush.openingHours - shop.openingHours * 1.55) < 1e-12);
  assert.equal(brush.hardwareHours, shop.hardwareHours);
  assert.equal(brush.degreaseHours, shop.degreaseHours);
  assert.ok(brush.price > shop.price);
});

test('a dark-to-light extra coat is labor on removable pieces only', () => {
  const same = calculateBid(kitchen());
  const dark = calculateBid(kitchen({ extraCoats: 1 }));
  assert.equal(same.extraCoatHours, 0);
  assert.ok(Math.abs(dark.extraCoatHours - 18 * 0.22) < 1e-12);
  assert.ok(dark.totalHours > same.totalHours);
  assert.ok(dark.price > same.price);
  assert.equal(dark.primerGallons, same.primerGallons);
});

test('new hardware is material, not invented hours', () => {
  const reused = calculateBid(kitchen());
  const replaced = calculateBid(kitchen({ replaceHardware: true }));
  assert.equal(reused.hardwareTotal, 0);
  assert.ok(Math.abs(replaced.hardwareTotal - 38 * 8) < 1e-12);
  assert.equal(replaced.hardwareHours, reused.hardwareHours);
  assert.ok(replaced.materialCost > reused.materialCost);
  assert.ok(replaced.price > reused.price);
});

test('price stacks burden, materials, travel, overhead, then margin as a share of price', () => {
  const result = calculateBid(kitchen());
  assert.equal(result.loadedWage, 38 * 1.3);
  assert.equal(result.primerGallons, 2);
  assert.equal(result.finishGallons, 2);
  assert.ok(Math.abs(result.primerTotal - 96) < 1e-12);
  assert.ok(Math.abs(result.finishTotal - 136) < 1e-12);
  assert.ok(Math.abs(result.materialCost - 317) < 1e-12);

  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-12);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-12);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-12);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid(kitchen({ targetMargin: 0 }));
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(kitchen());
  const scored = calculateBid(kitchen({ proposedPrice: bid.price }));
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(kitchen());
  const scored = calculateBid(kitchen({ proposedPrice: bid.totalCost - 200 }));
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(kitchen()).proposed, null);
  assert.equal(calculateBid(kitchen({ proposedPrice: '' })).proposed, null);
  assert.equal(calculateBid(kitchen({ proposedPrice: 0 })).proposed.price, 0);
});

test('helpers match the shipped presets', () => {
  assert.equal(suggestedLaborFactor('shop'), 1);
  assert.equal(suggestedLaborFactor('onsite_brush'), 1.55);
  assert.equal(suggestedExtraCoats('same'), 0);
  assert.equal(suggestedExtraCoats('dark_to_light'), 1);
  assert.throws(() => suggestedLaborFactor('dip'), /Unknown finish method/);
  assert.throws(() => suggestedExtraCoats('two_tone'), /Unknown color change/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid(kitchen({ doors: 0, drawers: 0, openings: 0 })), /at least one door/);
  assert.throws(() => calculateBid(kitchen({ hoursPerDoor: 0 })), /greater than zero/);
  assert.throws(() => calculateBid(kitchen({ finishLaborFactor: 0 })), /greater than zero/);
  assert.throws(() => calculateBid(kitchen({ hourlyWage: 'abc' })), /Hourly wage must be a number/);
  assert.throws(() => calculateBid(kitchen({ targetMargin: 100 })), /less than 100/);
  assert.throws(() => calculateBid(kitchen({ overheadRate: -1 })), /Overhead must be at least 0/);
});

test('presets are usable starting points', () => {
  assert.ok(FINISH_PRESETS.length >= 3);
  assert.ok(COLOR_PRESETS.length >= 3);
  assert.ok(JOB_PRESETS.length >= 4);
  for (const preset of JOB_PRESETS) {
    const finish = FINISH_PRESETS.find((item) => item.id === preset.finishId);
    const color = COLOR_PRESETS.find((item) => item.id === preset.colorId);
    const result = calculateBid(kitchen({
      doors: preset.doors,
      drawers: preset.drawers,
      openings: preset.openings,
      hardwarePieces: preset.hardwarePieces,
      finishLaborFactor: finish.laborFactor,
      extraCoats: color.extraCoats,
      replaceHardware: preset.replaceHardware,
      degreaseHours: preset.degreaseHours,
    }));
    assert.ok(result.price > 0);
    assert.ok(result.totalHours > 0);
  }
});

test('customer-facing summary omits wages and costs', () => {
  const result = calculateBid(kitchen());
  const text = formatBidSummary(result);
  assert.match(text, /CABINET REFINISHING/);
  assert.match(text, /10 doors, 8 drawer fronts, 9 face-frame openings/);
  assert.match(text, /Existing hardware reinstalled/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /\$38/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /overhead/i);
});

test('default 10-door galley lands in a range a contractor recognises', () => {
  const result = calculateBid(kitchen());
  assert.equal(result.price.toFixed(2), '3389.95');
  assert.equal(result.pricePerDoor.toFixed(2), '339.00');
  assert.equal(result.pricePerPiece.toFixed(2), '125.55');
  assert.equal(result.totalHours.toFixed(2), '32.77');
  assert.equal(result.breakEvenPrice.toFixed(2), '2542.46');
});
