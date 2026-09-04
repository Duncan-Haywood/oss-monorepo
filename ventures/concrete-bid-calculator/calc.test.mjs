import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_PRESETS,
  BAG_80LB_CU_FT,
  CU_FT_PER_CU_YD,
  FINISH_PRESETS,
  ORDER_INCREMENT_YD,
  REINFORCEMENT_PRESETS,
  bagsForVolume,
  calculateBid,
  orderYards,
  slabArea,
  slabPerimeter,
  slabVolumeCuYd,
} from './calc.mjs';

const driveway = () => ({
  slabs: [
    {
      name: 'Driveway',
      lengthFt: 20,
      widthFt: 40,
      thicknessIn: 4,
      hoursPer100: 0.85,
    },
    {
      name: 'Walk',
      lengthFt: 3,
      widthFt: 20,
      thicknessIn: 4,
      hoursPer100: 0.85,
    },
  ],
  wastePct: 8,
  concretePerYd: 175,
  formPerLf: 3.5,
  formHours: 6,
  reinforcementPerSqFt: 0.35,
  accessHoursPer100: 0,
  pumpFee: 0,
  shortLoadThresholdYd: 5,
  shortLoadFee: 80,
  demoSqFt: 0,
  demoThicknessIn: 4,
  haulPerYd: 45,
  demoHours: 0,
  prepHours: 4,
  hourlyWage: 28,
  burdenRate: 30,
  otherCost: 150,
  overheadRate: 12,
  targetMargin: 20,
});

test('length × width wins over a leftover square-footage field', () => {
  assert.equal(slabArea({ lengthFt: 20, widthFt: 40, squareFeet: 9999 }), 800);
  assert.equal(slabArea({ squareFeet: 250 }), 250);
  assert.equal(slabArea({ lengthFt: 0, widthFt: 40, squareFeet: 250 }), 250);
});

test('perimeter comes from the tape-measure sides, not from leftover edge footage', () => {
  assert.equal(slabPerimeter({ lengthFt: 20, widthFt: 40, perimeterFt: 999 }), 120);
  assert.equal(slabPerimeter({ perimeterFt: 48 }), 48);
});

test('volume is area × thickness, sold in cubic yards', () => {
  // 800 sq ft × 4 in = 266.666… cu ft = 9.876… yd
  const yards = slabVolumeCuYd({ squareFeet: 800, thicknessIn: 4 });
  assert.ok(Math.abs(yards - 800 * 4 / 12 / 27) < 1e-12);
});

test('a 6-inch RV pad is 50% more concrete than the same 4-inch driveway', () => {
  const four = slabVolumeCuYd({ squareFeet: 800, thicknessIn: 4 });
  const six = slabVolumeCuYd({ squareFeet: 800, thicknessIn: 6 });
  assert.ok(Math.abs(six / four - 1.5) < 1e-12);
});

test('waste is applied before the plant rounds up to a quarter yard', () => {
  const { withWaste, ordered } = orderYards(9.876543209876543, 8);
  assert.ok(Math.abs(withWaste - 9.876543209876543 * 1.08) < 1e-12);
  assert.equal(ordered % ORDER_INCREMENT_YD, 0);
  assert.ok(ordered >= withWaste);
  assert.ok(ordered - withWaste < ORDER_INCREMENT_YD);
});

test('bags are an 80-lb comparison, rounded up, not a ready-mix substitute', () => {
  assert.equal(bagsForVolume(0), 0);
  assert.equal(bagsForVolume(BAG_80LB_CU_FT), 1);
  assert.equal(bagsForVolume(BAG_80LB_CU_FT * 2.1), 3);
});

test('driveway plus walk: yards come from thickness, forms come from edge', () => {
  const result = calculateBid(driveway());
  // 800 + 60 = 860 sq ft at 4" = 860 * 4 / 12 / 27 raw yards
  const expectedRaw = 860 * 4 / 12 / 27;
  assert.ok(Math.abs(result.rawYards - expectedRaw) < 1e-9);
  assert.equal(result.totalSquareFeet, 860);
  // 2*(20+40) + 2*(3+20) = 120 + 46
  assert.equal(result.totalPerimeterFt, 166);
  const drive = result.slabs.find(s => s.name === 'Driveway');
  const walk = result.slabs.find(s => s.name === 'Walk');
  const areaShare = walk.squareFeet / result.totalSquareFeet * 100;
  assert.ok(areaShare < 8, `walk is ${areaShare.toFixed(1)}% of the floor`);
  assert.ok(drive.yardsShare > 90, `driveway should dominate yards, got ${drive.yardsShare}`);
});

test('price stacks material, labor burden, overhead, then margin as a share of price', () => {
  const result = calculateBid(driveway());
  assert.equal(result.loadedWage, 28 * 1.3);
  assert.ok(Math.abs(result.concreteCost - result.orderedYards * 175) < 1e-9);
  assert.ok(Math.abs(result.formMaterialCost - 166 * 3.5) < 1e-9);
  assert.ok(Math.abs(result.reinforcementCost - 860 * 0.35) < 1e-9);

  const expectedDirect =
    result.concreteCost +
    result.formMaterialCost +
    result.reinforcementCost +
    result.pumpFee +
    result.shortLoadFee +
    result.demoHaulCost +
    result.laborCost +
    result.otherCost;
  assert.ok(Math.abs(result.directCost - expectedDirect) < 1e-9);
  assert.ok(Math.abs(result.overhead - expectedDirect * 0.12) < 1e-9);
  assert.ok(Math.abs(result.totalCost - expectedDirect * 1.12) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
});

test('a pour under the short-load threshold pays the plant fee; a bigger one does not', () => {
  const small = calculateBid({
    ...driveway(),
    slabs: [{ name: 'Stoop', lengthFt: 5, widthFt: 5, thicknessIn: 6, hoursPer100: 1.25 }],
  });
  assert.ok(small.orderedYards < 5);
  assert.equal(small.shortLoadFee, 80);

  const large = calculateBid(driveway());
  assert.ok(large.orderedYards >= 5);
  assert.equal(large.shortLoadFee, 0);
});

test('wheelbarrow access adds labor; a pump adds a flat fee instead', () => {
  const chute = calculateBid(driveway());
  const buggy = calculateBid({ ...driveway(), accessHoursPer100: 0.45 });
  const pump = calculateBid({ ...driveway(), pumpFee: 650, accessHoursPer100: 0.1 });
  assert.ok(buggy.laborHours > chute.laborHours);
  assert.ok(buggy.price > chute.price);
  assert.equal(pump.pumpFee, 650);
  assert.ok(pump.price > chute.price);
});

test('demo haul is priced in yards of old slab, not in the new pour', () => {
  const result = calculateBid({
    ...driveway(),
    demoSqFt: 800,
    demoThicknessIn: 4,
    haulPerYd: 45,
    demoHours: 8,
  });
  assert.ok(Math.abs(result.demoYards - 800 * 4 / 12 / 27) < 1e-12);
  assert.ok(Math.abs(result.demoHaulCost - result.demoYards * 45) < 1e-9);
  assert.ok(result.laborHours > calculateBid(driveway()).laborHours);
});

test('stamped finish labor is several times a broom of the same pad', () => {
  const broom = calculateBid(driveway());
  const stamped = calculateBid({
    ...driveway(),
    slabs: driveway().slabs.map(s => ({ ...s, hoursPer100: 2.5 })),
  });
  assert.ok(stamped.finishHours / broom.finishHours > 2.5);
  assert.ok(stamped.price > broom.price);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...driveway(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(driveway());
  const scored = calculateBid({ ...driveway(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(driveway());
  const scored = calculateBid({ ...driveway(), proposedPrice: bid.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(driveway()).proposed, null);
  assert.equal(calculateBid({ ...driveway(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...driveway(), proposedPrice: 0 }).proposed.price, 0);
});

test('a nameless slab still reports under a stable label', () => {
  const result = calculateBid({
    ...driveway(),
    slabs: [
      { squareFeet: 100, thicknessIn: 4, hoursPer100: 0.85 },
      { name: '   ', squareFeet: 50, thicknessIn: 4, hoursPer100: 0.85 },
    ],
  });
  assert.equal(result.slabs[0].name, 'Slab 1');
  assert.equal(result.slabs[1].name, 'Slab 2');
});

test('a job with no pour area reports no per-unit ratios instead of dividing by zero', () => {
  const result = calculateBid({
    ...driveway(),
    slabs: [{ name: 'Empty', squareFeet: 0, thicknessIn: 4, hoursPer100: 0.85 }],
    otherCost: 100,
    formHours: 0,
    prepHours: 0,
  });
  assert.equal(result.rawYards, 0);
  assert.equal(result.pricePerSqFt, null);
  assert.equal(result.pricePerYard, null);
  assert.equal(result.slabs[0].yardsShare, 0);
  assert.ok(result.price > 100);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...driveway(), slabs: [] }), /at least one slab/);
  assert.throws(
    () => calculateBid({
      ...driveway(),
      slabs: [{ name: 'Pad', squareFeet: 100, thicknessIn: 0, hoursPer100: 0.85 }],
    }),
    /Pad: thickness must be greater than zero/,
  );
  assert.throws(() => calculateBid({ ...driveway(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...driveway(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...driveway(), overheadRate: -1 }), /Overhead must be at least 0/);
});

test('presets are usable positive numbers', () => {
  assert.ok(FINISH_PRESETS.length >= 4);
  for (const preset of FINISH_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.hoursPer100) && preset.hoursPer100 > 0);
  }
  for (const preset of REINFORCEMENT_PRESETS) {
    assert.ok(preset.costPerSqFt >= 0);
  }
  for (const preset of ACCESS_PRESETS) {
    assert.ok(preset.extraHoursPer100 >= 0);
    assert.ok(preset.pumpFee >= 0);
  }
  assert.equal(CU_FT_PER_CU_YD, 27);
});
