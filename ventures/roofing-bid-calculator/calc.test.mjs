import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  pitchFactor,
  steepLaborMultiplier,
  MATERIAL_PRESETS,
  SECTION_PRESETS,
  SQUARE_SQ_FT,
} from './calc.mjs';

const ranch = () => ({
  sections: [
    { name: 'Main house', footprintSqFt: 1800, pitchRise: 6, tearOffLayers: 1 },
    { name: 'Attached garage', footprintSqFt: 400, pitchRise: 4, tearOffLayers: 1 },
  ],
  wastePercent: 10,
  materialPerSquare: 140,
  underlaymentPerSquare: 22,
  accessoriesFlat: 450,
  installHoursPerSquare: 1.8,
  tearOffHoursPerSquare: 1,
  hourlyWage: 35,
  burdenRate: 30,
  dumpPerSquare: 35,
  dumpsterFee: 450,
  permitFee: 250,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 20,
});

test('pitch factor is the hypotenuse of rise-over-12, not a guess', () => {
  assert.equal(pitchFactor(0), 1);
  assert.ok(Math.abs(pitchFactor(6) - Math.sqrt(1 + 0.5 ** 2)) < 1e-12);
  assert.ok(Math.abs(pitchFactor(12) - Math.SQRT2) < 1e-12);
});

test('steepness steps match the documented labor multipliers', () => {
  assert.equal(steepLaborMultiplier(4), 1);
  assert.equal(steepLaborMultiplier(6), 1);
  assert.equal(steepLaborMultiplier(7), 1.25);
  assert.equal(steepLaborMultiplier(9), 1.25);
  assert.equal(steepLaborMultiplier(10), 1.5);
  assert.equal(steepLaborMultiplier(12), 1.5);
  assert.equal(steepLaborMultiplier(14), 2);
});

test('squares come from pitched surface, not house square footage', () => {
  const result = calculateBid(ranch());
  const main = result.sections.find(s => s.name === 'Main house');
  const garage = result.sections.find(s => s.name === 'Attached garage');
  assert.ok(Math.abs(main.surfaceSqFt - 1800 * pitchFactor(6)) < 1e-9);
  assert.ok(Math.abs(garage.surfaceSqFt - 400 * pitchFactor(4)) < 1e-9);
  assert.ok(Math.abs(result.totalSquares - result.totalSurfaceSqFt / SQUARE_SQ_FT) < 1e-9);
  // The whole point: 2,200 sq ft of floor is not 22 squares of roof.
  assert.ok(result.totalSquares > 22);
  assert.ok(result.totalFootprintSqFt === 2200);
});

test('waste grows the covering buy, not the tear-off', () => {
  const result = calculateBid(ranch());
  assert.ok(Math.abs(result.totalMaterialSquares - result.totalSquares * 1.1) < 1e-9);
  assert.ok(Math.abs(result.totalTearOffSquares - result.totalSquares) < 1e-9);
  const noWaste = calculateBid({ ...ranch(), wastePercent: 0 });
  assert.ok(Math.abs(noWaste.totalMaterialSquares - noWaste.totalSquares) < 1e-9);
  assert.ok(Math.abs(noWaste.totalTearOffSquares - result.totalTearOffSquares) < 1e-9);
});

test('a second tear-off layer doubles dump and tear-off hours, not the new covering', () => {
  const one = calculateBid(ranch());
  const two = calculateBid({
    ...ranch(),
    sections: ranch().sections.map(s => ({ ...s, tearOffLayers: 2 })),
  });
  assert.ok(Math.abs(two.totalTearOffSquares - one.totalTearOffSquares * 2) < 1e-9);
  assert.ok(Math.abs(two.totalMaterialSquares - one.totalMaterialSquares) < 1e-9);
  const oneTearOffHours = one.sections.reduce((sum, s) => sum + s.tearOffHours, 0);
  const twoTearOffHours = two.sections.reduce((sum, s) => sum + s.tearOffHours, 0);
  assert.ok(Math.abs(twoTearOffHours - oneTearOffHours * 2) < 1e-9);
});

test('a steep section consumes labor out of proportion to its footprint', () => {
  const result = calculateBid({
    ...ranch(),
    sections: [
      { name: 'Main house', footprintSqFt: 1800, pitchRise: 4, tearOffLayers: 1 },
      { name: 'Steep garage', footprintSqFt: 400, pitchRise: 12, tearOffLayers: 1 },
    ],
  });
  const steep = result.sections.find(s => s.name === 'Steep garage');
  const footprintShare = steep.footprintSqFt / result.totalFootprintSqFt * 100;
  assert.ok(footprintShare < 20, `garage is ${footprintShare.toFixed(1)}% of the footprint`);
  assert.ok(steep.hoursShare > 25, `but only ${steep.hoursShare.toFixed(1)}% of the hours`);
  assert.equal(steep.steepLaborMultiplier, 1.5);
});

test('price stacks burden, material, dump, overhead, then margin as a share of price', () => {
  const result = calculateBid(ranch());
  assert.equal(result.loadedWage, 35 * 1.3);
  const material = result.coveringCost + result.underlaymentCost + 450;
  assert.ok(Math.abs(result.materialCost - material) < 1e-9);
  const dump = 35 * result.totalTearOffSquares + 450;
  assert.ok(Math.abs(result.dumpCost - dump) < 1e-9);
  const direct = result.laborCost + result.materialCost + result.dumpCost + 250;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.jobCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.jobProfit / result.jobPrice * 100 - 20) < 1e-9);
});

test('sanity ratios land in the range a contractor recognises', () => {
  const result = calculateBid(ranch());
  // Architectural asphalt reroofs commonly bid in the mid-hundreds per square.
  assert.ok(result.pricePerSquare > 400 && result.pricePerSquare < 800);
  assert.ok(result.effectiveHourlyRate > 50 && result.effectiveHourlyRate < 250);
  assert.equal(result.breakEvenPrice, result.jobCost);
  assert.ok(result.jobPrice > 10000 && result.jobPrice < 20000);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...ranch(), targetMargin: 0 });
  assert.ok(Math.abs(result.jobPrice - result.jobCost) < 1e-9);
  assert.ok(Math.abs(result.jobProfit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(ranch());
  const scored = calculateBid({ ...ranch(), proposedPrice: bid.jobPrice });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(ranch());
  const scored = calculateBid({ ...ranch(), proposedPrice: bid.jobCost - 500 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(ranch()).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: 0 }).proposed.price, 0);
});

test('a nameless section still reports under a stable label', () => {
  const result = calculateBid({
    ...ranch(),
    sections: [
      { footprintSqFt: 1000, pitchRise: 6, tearOffLayers: 1 },
      { name: '   ', footprintSqFt: 400, pitchRise: 6, tearOffLayers: 1 },
    ],
  });
  assert.equal(result.sections[0].name, 'Section 1');
  assert.equal(result.sections[1].name, 'Section 2');
});

test('a roof with no footprint reports no per-unit ratios instead of dividing by zero', () => {
  const result = calculateBid({
    ...ranch(),
    sections: [{ name: 'Empty', footprintSqFt: 0, pitchRise: 6, tearOffLayers: 1 }],
    dumpsterFee: 400,
    permitFee: 100,
  });
  assert.equal(result.laborHours, 0);
  assert.equal(result.pricePerSquare, null);
  assert.equal(result.pricePerFootprintSqFt, null);
  assert.equal(result.effectiveHourlyRate, null);
  assert.equal(result.sections[0].hoursShare, 0);
  assert.ok(result.jobPrice > 400);
});

test('new-construction (zero tear-off) skips dump-by-square and tear-off hours', () => {
  const result = calculateBid({
    ...ranch(),
    sections: ranch().sections.map(s => ({ ...s, tearOffLayers: 0 })),
  });
  assert.equal(result.totalTearOffSquares, 0);
  assert.equal(result.dumpCost, 450);
  assert.ok(result.laborHours > 0);
  assert.ok(result.sections.every(s => s.tearOffHours === 0));
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...ranch(), sections: [] }), /at least one roof section/);
  assert.throws(
    () => calculateBid({ ...ranch(), sections: [{ name: 'Main', footprintSqFt: -5, pitchRise: 6, tearOffLayers: 1 }] }),
    /Main: footprint square feet must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...ranch(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...ranch(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...ranch(), overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => pitchFactor(-1), /Pitch rise must be at least 0/);
});

test('material and section presets are usable starting points', () => {
  assert.ok(MATERIAL_PRESETS.length >= 4);
  for (const preset of MATERIAL_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.materialPerSquare > 0);
    assert.ok(preset.installHoursPerSquare > 0);
    assert.ok(preset.underlaymentPerSquare > 0);
  }
  assert.ok(SECTION_PRESETS.length >= 4);
  for (const preset of SECTION_PRESETS) {
    assert.ok(preset.label.length > 0);
  }
});
