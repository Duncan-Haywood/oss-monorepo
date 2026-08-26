import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  baseTons,
  calculateBid,
  compareTurfTypes,
  formatBidSummary,
  JOB_PRESETS,
  sodTons,
  suggestedTurfKit,
  turfBuySqFt,
  TURF_PRESETS,
} from './calc.mjs';

const COSTS = {
  hoursTrip: 1.5,
  siteHours: 0.75,
  permitFee: 0,
  hourlyWage: 32,
  burdenRate: 30,
  travelAndEquipment: 275,
  overheadRate: 15,
  targetMargin: 30,
};

function bid(overrides = {}) {
  const turfType = overrides.turfType ?? 'landscape';
  return calculateBid({
    ...COSTS,
    ...suggestedTurfKit(turfType),
    turfType,
    lawnSqFt: 600,
    wastePercent: 10,
    baseDepthIn: 3,
    sodDemo: true,
    geotextile: true,
    perimeterLf: 100,
    seamLf: 40,
    treeWells: 0,
    ...overrides,
  });
}

test('turf you buy is the lawn plus the waste from 15-foot rolls, not the lawn itself', () => {
  assert.equal(turfBuySqFt(600, 10), 660);
  const result = bid();
  assert.equal(result.buySqFt, 660);
  assert.equal(result.wasteSqFt, 60);
  assert.ok(result.turfMaterial > 600 * 2.15);
});

test('base tons come from area × depth × 100 lb/ft³, not a flat per-foot special', () => {
  assert.ok(Math.abs(baseTons(600, 3) - 600 * (3 / 12) * 100 / 2000) < 1e-9);
  const three = bid({ baseDepthIn: 3 });
  const four = bid({ baseDepthIn: 4 });
  assert.ok(Math.abs(three.crushedTons - baseTons(600, 3)) < 1e-9);
  assert.ok(four.crushedTons > three.crushedTons);
  assert.ok(four.baseMaterial > three.baseMaterial);
  assert.ok(four.price > three.price);
});

test('sod demo is dump tons and hours the landscape special never sees', () => {
  const pad = bid({ sodDemo: false });
  const sod = bid({ sodDemo: true });
  assert.equal(pad.demoTons, 0);
  assert.equal(pad.hoursDemo, 0);
  assert.ok(Math.abs(sod.demoTons - sodTons(600, 2)) < 1e-9);
  assert.ok(sod.hoursDemo > 0);
  assert.ok(sod.sodDump > 0);
  assert.ok(sod.price > pad.price + 80);
});

test('pet turf is not a landscape special: drainage, zeolite, and a thicker base', () => {
  const landscape = bid({ turfType: 'landscape', lawnSqFt: 800, wastePercent: 12, baseDepthIn: 3 });
  const pet = bid({
    turfType: 'pet',
    lawnSqFt: 800,
    wastePercent: 12,
    baseDepthIn: 4,
    treeWells: 2,
    seamLf: 55,
    perimeterLf: 120,
    ...suggestedTurfKit('pet'),
  });
  assert.ok(pet.turfMaterial > landscape.turfMaterial);
  assert.ok(pet.infillMaterial > landscape.infillMaterial);
  assert.ok(pet.drainMaterial > 0);
  assert.equal(landscape.drainMaterial, 0);
  assert.ok(pet.hoursDrain > 0);
  assert.ok(pet.hoursWells > 0);
  assert.ok(pet.price > landscape.price + 1500);
});

test('price stacks burden, turf, base, infill, overhead, then margin as a share of price', () => {
  const result = bid();
  assert.equal(result.loadedWage, 32 * 1.3);
  const direct = result.laborCost + result.materialCost + result.travelAndEquipment;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = bid({ targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const priced = bid();
  const scored = bid({ proposedPrice: priced.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(bid().proposed, null);
  assert.equal(bid({ proposedPrice: '' }).proposed, null);
  assert.equal(bid({ proposedPrice: null }).proposed, null);
  assert.equal(bid({ proposedPrice: 0 }).proposed.price, 0);
});

test('a proposed price at the bid is scored against the same cost base', () => {
  const priced = bid();
  const scored = bid({ proposedPrice: priced.price });
  assert.ok(Math.abs(scored.proposed.margin - 30) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('putting green buys more waste and more seams than landscape on the same pad', () => {
  const landscape = bid({
    turfType: 'landscape',
    lawnSqFt: 400,
    wastePercent: 10,
    sodDemo: false,
    seamLf: 40,
    ...suggestedTurfKit('landscape'),
  });
  const putting = bid({
    turfType: 'putting',
    lawnSqFt: 400,
    wastePercent: 15,
    baseDepthIn: 4.5,
    sodDemo: false,
    seamLf: 80,
    ...suggestedTurfKit('putting'),
  });
  assert.ok(putting.buySqFt > landscape.buySqFt);
  assert.ok(putting.hoursSeam > landscape.hoursSeam);
  assert.ok(putting.turfMaterial > landscape.turfMaterial);
  assert.ok(putting.price > landscape.price);
});

test('compareTurfTypes still prices pet and putting when the current job is landscape', () => {
  const rows = compareTurfTypes({
    ...COSTS,
    lawnSqFt: 600,
    wastePercent: 10,
    baseDepthIn: 3,
    sodDemo: true,
    geotextile: true,
    perimeterLf: 100,
    seamLf: 40,
    treeWells: 0,
    turfType: 'landscape',
  });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.price > 0));
  const landscape = rows.find((row) => row.turfType === 'landscape');
  const pet = rows.find((row) => row.turfType === 'pet');
  assert.ok(landscape.price < pet.price);
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  assert.equal(rows[0].delta, 0);
});

test('compareTurfTypes shows pet extra cost jumping when tree wells and drainage appear', () => {
  const plain = compareTurfTypes({
    ...COSTS,
    lawnSqFt: 800,
    wastePercent: 12,
    baseDepthIn: 4,
    sodDemo: true,
    geotextile: true,
    perimeterLf: 120,
    seamLf: 55,
    treeWells: 0,
    turfType: 'pet',
  });
  const wells = compareTurfTypes({
    ...COSTS,
    lawnSqFt: 800,
    wastePercent: 12,
    baseDepthIn: 4,
    sodDemo: true,
    geotextile: true,
    perimeterLf: 120,
    seamLf: 55,
    treeWells: 2,
    turfType: 'pet',
  });
  const plainPet = plain.find((row) => row.turfType === 'pet');
  const wellPet = wells.find((row) => row.turfType === 'pet');
  assert.ok(wellPet.extraCost > plainPet.extraCost);
  assert.ok(wellPet.price > plainPet.price);
});

test('formatBidSummary is customer-facing and omits wages', () => {
  const text = formatBidSummary(bid(), '600 sq ft landscape, 3 in base');
  assert.match(text, /ARTIFICIAL TURF BID/);
  assert.match(text, /600 sq ft lawn/);
  assert.doesNotMatch(text, /32/);
  assert.doesNotMatch(text, /wage/i);
  assert.match(text, /not a landscaping specification/);
});

test('job presets cover the three turf types and the pet-yard contrast', () => {
  assert.equal(JOB_PRESETS.length, 4);
  const types = new Set(JOB_PRESETS.map((job) => job.turfType));
  assert.deepEqual([...types].sort(), ['landscape', 'pet', 'putting']);
  assert.ok(JOB_PRESETS.some((job) => job.turfType === 'pet' && job.treeWells > 0 && job.sodDemo));
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => bid({ lawnSqFt: 0 }), /Lawn square feet must be greater than zero/);
  assert.throws(() => bid({ turfType: 'astroturf' }), /Unknown turf type/);
  assert.throws(() => bid({ baseDepthIn: 0 }), /Base depth must be greater than zero/);
  assert.throws(() => bid({ hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => bid({ targetMargin: 100 }), /less than 100/);
  assert.throws(() => bid({ overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => suggestedTurfKit('astroturf'), /Unknown turf type/);
});

test('presets are usable positive figures', () => {
  assert.ok(TURF_PRESETS.length === 3);
  for (const type of TURF_PRESETS) {
    const kit = suggestedTurfKit(type.id);
    for (const value of Object.values(kit)) {
      assert.ok(Number.isFinite(value) && value >= 0);
    }
  }
});

test('geotextile is billed only when the shop turns it on', () => {
  const without = bid({ geotextile: false, lawnSqFt: 1200 });
  const withFabric = bid({ geotextile: true, lawnSqFt: 1200 });
  assert.equal(without.fabricMaterial, 0);
  assert.ok(withFabric.fabricMaterial > 0);
  assert.ok(withFabric.price > without.price);
});

test('infill bags are whole bags from pounds, not a blended adder', () => {
  const result = bid();
  assert.ok(result.infillLbs > 0);
  assert.equal(result.infillBags, Math.ceil(result.infillLbs / 50));
});
