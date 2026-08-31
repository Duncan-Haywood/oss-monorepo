import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedGeogridLayers,
  suggestedHeightFactor,
  WALL_TYPE_PRESETS,
  HEIGHT_PRESETS,
  ENGINEER_PRESETS,
  WALL_PRESETS,
} from './calc.mjs';

const gardenForty = () => ({
  lengthFeet: 40,
  exposedHeightFeet: 3,
  embedmentFeet: 0.67,
  blockCostPerSf: 12,
  capCostPerFoot: 8,
  stoneCostPerCuYd: 55,
  stoneDepthFeet: 1,
  drainPipeCostPerFoot: 4,
  geogridLayers: 0,
  geogridDepthFeet: 6,
  geogridCostPerSqYd: 4,
  wallTypeFactor: 1.0,
  heightFactor: 1.0,
  hoursPerFaceSqFt: 0.1,
  corners: 0,
  hoursPerCorner: 1.5,
  excavationHours: 4,
  drainHours: 2,
  hourlyWage: 38,
  burdenRate: 30,
  engineerAndPermitFee: 0,
  travelAndEquipment: 150,
  overheadRate: 15,
  targetMargin: 22,
});

test('face area is length times total height, not exposed height alone', () => {
  const result = calculateBid(gardenForty());
  assert.ok(Math.abs(result.totalHeightFeet - 3.67) < 1e-9);
  assert.ok(Math.abs(result.faceAreaSqFt - 40 * 3.67) < 1e-9);
});

test('suggested geogrid layers step at 4 ft, then every 2 ft', () => {
  assert.equal(suggestedGeogridLayers(3), 0);
  assert.equal(suggestedGeogridLayers(3.9), 0);
  assert.equal(suggestedGeogridLayers(4), 1);
  assert.equal(suggestedGeogridLayers(5.5), 1);
  assert.equal(suggestedGeogridLayers(6), 2);
  assert.equal(suggestedGeogridLayers(8), 3);
});

test('suggested height factor climbs with exposed height', () => {
  assert.equal(suggestedHeightFactor(2.5), 1.0);
  assert.equal(suggestedHeightFactor(3.5), 1.1);
  assert.equal(suggestedHeightFactor(5), 1.25);
  assert.equal(suggestedHeightFactor(7), 1.45);
});

test('face labor scales with face area, then wall type, then height', () => {
  const easy = calculateBid(gardenForty());
  const poured = calculateBid({ ...gardenForty(), wallTypeFactor: 1.4 });
  const tall = calculateBid({ ...gardenForty(), wallTypeFactor: 1.4, heightFactor: 1.25 });
  assert.ok(Math.abs(easy.faceHours - easy.faceAreaSqFt * 0.1) < 1e-9);
  assert.ok(Math.abs(poured.faceHours - easy.faceHours * 1.4) < 1e-9);
  assert.ok(Math.abs(tall.faceHours - easy.faceHours * 1.4 * 1.25) < 1e-9);
  assert.equal(easy.excavationHours, poured.excavationHours);
  assert.ok(tall.price > poured.price);
  assert.ok(poured.price > easy.price);
});

test('corners and engineer fees do not scale with length', () => {
  const short = calculateBid({
    ...gardenForty(),
    lengthFeet: 30,
    corners: 2,
    hoursPerCorner: 1.5,
    engineerAndPermitFee: 1800,
  });
  const long = calculateBid({
    ...gardenForty(),
    lengthFeet: 80,
    corners: 2,
    hoursPerCorner: 1.5,
    engineerAndPermitFee: 1800,
  });
  assert.equal(short.cornerHours, long.cornerHours);
  assert.equal(short.engineerAndPermitFee, long.engineerAndPermitFee);
  assert.ok(short.shares.soft > long.shares.soft);
});

test('the same 40 ft wall at 6 ft is not a 3 ft garden-wall price', () => {
  const garden = calculateBid(gardenForty());
  const engineered = calculateBid({
    ...gardenForty(),
    exposedHeightFeet: 6,
    embedmentFeet: 0.75,
    geogridLayers: 2,
    heightFactor: 1.45,
    excavationHours: 14,
    engineerAndPermitFee: 1800,
    travelAndEquipment: 250,
  });
  assert.ok(engineered.faceAreaSqFt > garden.faceAreaSqFt * 1.6);
  assert.ok(engineered.geogridLayers === 2);
  assert.ok(engineered.geogridCost > 0);
  assert.ok(engineered.stoneCuYd > garden.stoneCuYd);
  assert.ok(engineered.pricePerFoot > garden.pricePerFoot * 1.8, `engineered only ${engineered.pricePerFoot.toFixed(0)}/ft vs garden ${garden.pricePerFoot.toFixed(0)}/ft`);
  assert.ok(engineered.totalHours > garden.totalHours * 1.8);
});

test('drain stone is length × total height × depth, in cubic yards', () => {
  const result = calculateBid(gardenForty());
  assert.ok(Math.abs(result.stoneCuYd - (40 * 3.67 * 1) / 27) < 1e-9);
  assert.ok(Math.abs(result.stoneCost - result.stoneCuYd * 55) < 1e-9);
});

test('geogrid is length × depth × layers, in square yards', () => {
  const none = calculateBid(gardenForty());
  assert.equal(none.geogridSqYd, 0);
  assert.equal(none.geogridCost, 0);
  const layered = calculateBid({ ...gardenForty(), geogridLayers: 2, geogridDepthFeet: 6 });
  assert.ok(Math.abs(layered.geogridSqYd - (40 * 6 * 2) / 9) < 1e-9);
  assert.ok(Math.abs(layered.geogridCost - layered.geogridSqYd * 4) < 1e-9);
});

test('price stacks burden, material, extras, overhead, then margin as a share of price', () => {
  const result = calculateBid(gardenForty());
  assert.equal(result.loadedWage, 38 * 1.3);
  assert.ok(Math.abs(result.capCost - 320) < 1e-9);
  assert.ok(Math.abs(result.drainPipeCost - 160) < 1e-9);

  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 22) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...gardenForty(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(gardenForty());
  const scored = calculateBid({ ...gardenForty(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 22) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.perFoot - bid.pricePerFoot) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(gardenForty());
  const scored = calculateBid({ ...gardenForty(), proposedPrice: bid.totalCost - 250 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(gardenForty()).proposed, null);
  assert.equal(calculateBid({ ...gardenForty(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...gardenForty(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...gardenForty(), proposedPrice: 0 }).proposed.price, 0);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...gardenForty(), lengthFeet: 0 }), /Wall length must be greater than zero/);
  assert.throws(() => calculateBid({ ...gardenForty(), exposedHeightFeet: 0 }), /Exposed height must be greater than zero/);
  assert.throws(() => calculateBid({ ...gardenForty(), hoursPerFaceSqFt: 0 }), /Hours per face sq ft must be greater than zero/);
  assert.throws(() => calculateBid({ ...gardenForty(), wallTypeFactor: 0 }), /Wall-type factor must be greater than zero/);
  assert.throws(() => calculateBid({ ...gardenForty(), heightFactor: 0 }), /Height factor must be greater than zero/);
  assert.throws(() => calculateBid({ ...gardenForty(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...gardenForty(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...gardenForty(), overheadRate: -1 }), /Overhead must be at least 0/);
  assert.throws(() => calculateBid({ ...gardenForty(), lengthFeet: -2 }), /Wall length must be at least 0/);
});

test('presets are usable positive numbers', () => {
  for (const preset of WALL_TYPE_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(Number.isFinite(preset.factor) && preset.factor > 0);
    assert.ok(preset.blockCostPerSf > 0);
  }
  for (const preset of HEIGHT_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(Number.isFinite(preset.factor) && preset.factor > 0);
  }
  for (const preset of ENGINEER_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(preset.fee >= 0);
  }
  assert.ok(WALL_PRESETS.length >= 3);
  for (const preset of WALL_PRESETS) {
    assert.ok(preset.lengthFeet > 0 && preset.exposedHeightFeet > 0);
  }
});

test('bid summary is customer-facing and omits wages and costs', () => {
  const result = calculateBid(gardenForty());
  const text = formatBidSummary(result);
  assert.match(text, /40\.0 ft long/);
  assert.match(text, /3\.0 ft exposed/);
  assert.match(text, /Proposed install price/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /overhead/i);
});

test('geogrid and engineer lines appear in the summary only when priced', () => {
  const none = formatBidSummary(calculateBid(gardenForty()));
  const withGrid = formatBidSummary(calculateBid({
    ...gardenForty(),
    geogridLayers: 2,
    engineerAndPermitFee: 1800,
    corners: 2,
  }));
  assert.doesNotMatch(none, /Geogrid/);
  assert.doesNotMatch(none, /Engineer/);
  assert.doesNotMatch(none, /Corners/);
  assert.match(withGrid, /Geogrid: 2 layers/);
  assert.match(withGrid, /Engineer \/ permit/);
  assert.match(withGrid, /Corners: 2/);
});
