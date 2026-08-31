import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  patioAreaSqFt,
  patioPerimeterLf,
  cubicYardsFromArea,
  polymericBagCount,
  suggestedWastePct,
  suggestedPatternLaborFactor,
  suggestedBaseDepthIn,
  suggestedExcavationHours,
  PATTERN_PRESETS,
  USE_PRESETS,
  JOB_PRESETS,
} from './calc.mjs';

const patio = (overrides = {}) => ({
  lengthFeet: 12,
  widthFeet: 16,
  wastePct: 7,
  patternLaborFactor: 1,
  hoursPerFinishedSf: 0.08,
  hoursPerEdgeLf: 0.05,
  excavateYdPerHour: 2,
  haulAway: true,
  baseDepthIn: 6,
  beddingIn: 1,
  paverThicknessIn: 2.375,
  paverCostPerSf: 4.5,
  gravelCostPerCuYd: 48,
  sandCostPerCuYd: 52,
  polymericCoverageSf: 80,
  polymericBagCost: 28,
  edgeCostPerLf: 3.75,
  haulCostPerCuYd: 55,
  hourlyWage: 32,
  burdenRate: 30,
  travelAndEquipment: 375,
  overheadRate: 15,
  targetMargin: 22,
  ...overrides,
});

test('area and perimeter come from length × width, not a guessed square', () => {
  assert.equal(patioAreaSqFt(12, 16), 192);
  assert.equal(patioPerimeterLf(12, 16), 56);
  assert.throws(() => patioAreaSqFt(12, 0), /Width must be greater than zero/);
});

test('cubic yards grow with base depth on the same face', () => {
  const patioYards = cubicYardsFromArea(192, 6);
  const drivewayYards = cubicYardsFromArea(192, 10);
  assert.ok(Math.abs(patioYards - 192 * 6 / 12 / 27) < 1e-12);
  assert.ok(drivewayYards > patioYards * 1.6);
});

test('polymeric bags round up so a leftover tenth of a bag is still a bag', () => {
  assert.equal(polymericBagCount(192, 80), 3);
  assert.equal(polymericBagCount(80, 80), 1);
  assert.equal(polymericBagCount(0, 80), 0);
  assert.throws(() => polymericBagCount(100, 0), /greater than zero/);
});

test('pattern waste buys extra pavers but does not invent extra install hours', () => {
  const running = calculateBid(patio());
  const herringbone = calculateBid(patio({ wastePct: 15, patternLaborFactor: 1.25 }));
  assert.ok(Math.abs(running.areaSqFt - 192) < 1e-12);
  assert.ok(Math.abs(running.paverSqFt - 192 * 1.07) < 1e-12);
  assert.ok(herringbone.paverSqFt > running.paverSqFt);
  assert.ok(herringbone.paverCost > running.paverCost);
  assert.ok(Math.abs(running.installHours - 192 * 0.08) < 1e-12);
  assert.ok(Math.abs(herringbone.installHours - 192 * 0.08 * 1.25) < 1e-12);
  assert.equal(running.excavationCuYd, herringbone.excavationCuYd);
});

test('a driveway base on the same face excavates and hauls more than a patio', () => {
  const sitting = calculateBid(patio());
  const pad = calculateBid(patio({ baseDepthIn: 10 }));
  assert.ok(pad.excavationCuYd > sitting.excavationCuYd);
  assert.ok(pad.baseCost > sitting.baseCost);
  assert.ok(pad.haulCost > sitting.haulCost);
  assert.ok(pad.price > sitting.price);
  assert.ok(pad.pricePerSqFt > sitting.pricePerSqFt);
});

test('leaving spoils on site drops haul-away but not the excavation hours', () => {
  const hauled = calculateBid(patio());
  const dumped = calculateBid(patio({ haulAway: false }));
  assert.equal(dumped.haulCost, 0);
  assert.equal(dumped.excavationHours, hauled.excavationHours);
  assert.ok(dumped.price < hauled.price);
});

test('price stacks burden, materials, haul, overhead, then margin as a share of price', () => {
  const result = calculateBid(patio());
  assert.equal(result.loadedWage, 32 * 1.3);
  assert.equal(result.edgeLf, 56);
  assert.equal(result.polymericBags, 3);
  assert.ok(Math.abs(result.polymericCost - 84) < 1e-12);
  assert.ok(Math.abs(result.edgeCost - 56 * 3.75) < 1e-12);

  const material = result.paverCost + result.baseCost + result.beddingCost + result.polymericCost + result.edgeCost;
  assert.ok(Math.abs(result.materialCost - material) < 1e-12);
  const soft = result.haulCost + 375;
  assert.ok(Math.abs(result.softCost - soft) < 1e-12);
  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-12);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-12);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-12);
  assert.ok(Math.abs(result.profit / result.price * 100 - 22) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid(patio({ targetMargin: 0 }));
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(patio());
  const scored = calculateBid(patio({ proposedPrice: bid.price }));
  assert.ok(Math.abs(scored.proposed.margin - 22) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(patio());
  const scored = calculateBid(patio({ proposedPrice: bid.totalCost - 200 }));
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(patio()).proposed, null);
  assert.equal(calculateBid(patio({ proposedPrice: '' })).proposed, null);
  assert.equal(calculateBid(patio({ proposedPrice: 0 })).proposed.price, 0);
});

test('area-only input still prices when edge restraint is stated', () => {
  const fromSides = calculateBid(patio());
  const fromArea = calculateBid(patio({
    lengthFeet: undefined,
    widthFeet: undefined,
    areaSqFt: 192,
    edgeLf: 56,
  }));
  assert.equal(fromArea.lengthFeet, null);
  assert.equal(fromArea.areaSqFt, 192);
  assert.ok(Math.abs(fromArea.price - fromSides.price) < 1e-9);
});

test('an explicit edge length overrides the computed perimeter', () => {
  const result = calculateBid(patio({ edgeLf: 80 }));
  assert.equal(result.edgeLf, 80);
  assert.ok(Math.abs(result.edgeCost - 80 * 3.75) < 1e-12);
});

test('excavation hours can be overridden when the machine day is already known', () => {
  const computed = calculateBid(patio());
  const overridden = calculateBid(patio({ excavationHours: 8 }));
  assert.ok(computed.excavationHours < 8);
  assert.equal(overridden.excavationHours, 8);
  assert.ok(overridden.totalHours > computed.totalHours);
});

test('helpers match the shipped presets', () => {
  assert.equal(suggestedWastePct('running'), 7);
  assert.equal(suggestedWastePct('herringbone45'), 15);
  assert.equal(suggestedPatternLaborFactor('circular'), 1.35);
  assert.equal(suggestedBaseDepthIn('patio'), 6);
  assert.equal(suggestedBaseDepthIn('driveway'), 10);
  assert.ok(Math.abs(suggestedExcavationHours(6, 2) - 3) < 1e-12);
  assert.throws(() => suggestedWastePct('basketweave'), /Unknown paver pattern/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid(patio({ lengthFeet: 0 })), /Length must be greater than zero/);
  assert.throws(() => calculateBid(patio({ hoursPerFinishedSf: 0 })), /greater than zero/);
  assert.throws(() => calculateBid(patio({ baseDepthIn: 0 })), /Base depth must be greater than zero/);
  assert.throws(() => calculateBid(patio({ hourlyWage: 'abc' })), /Hourly wage must be a number/);
  assert.throws(() => calculateBid(patio({ targetMargin: 100 })), /less than 100/);
  assert.throws(() => calculateBid(patio({ overheadRate: -1 })), /Overhead must be at least 0/);
  assert.throws(() => calculateBid({
    ...patio(),
    lengthFeet: undefined,
    widthFeet: undefined,
    areaSqFt: 0,
    edgeLf: 40,
  }), /Patio area must be greater than zero/);
});

test('presets are usable starting points', () => {
  assert.ok(PATTERN_PRESETS.length >= 4);
  assert.ok(USE_PRESETS.length >= 3);
  assert.ok(JOB_PRESETS.length >= 4);
  for (const preset of PATTERN_PRESETS) {
    assert.ok(preset.wastePct > 0);
    assert.ok(preset.laborFactor >= 1);
  }
  for (const preset of JOB_PRESETS) {
    const pattern = PATTERN_PRESETS.find((item) => item.id === preset.patternId);
    const use = USE_PRESETS.find((item) => item.id === preset.useId);
    const result = calculateBid(patio({
      lengthFeet: preset.lengthFeet,
      widthFeet: preset.widthFeet,
      wastePct: pattern.wastePct,
      patternLaborFactor: pattern.laborFactor,
      baseDepthIn: use.baseDepthIn,
      haulAway: preset.haulAway,
    }));
    assert.ok(result.price > 0);
    assert.ok(result.totalHours > 0);
  }
});

test('customer-facing summary omits wages and costs', () => {
  const result = calculateBid(patio());
  const text = formatBidSummary(result);
  assert.match(text, /PAVER PATIO/);
  assert.match(text, /12\.0 × 16\.0 ft/);
  assert.match(text, /Spoil haul-away included/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /\$32/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /overhead/i);
});

test('default 12 × 16 patio lands in a range a contractor recognises', () => {
  const result = calculateBid(patio());
  assert.equal(result.price.toFixed(2), '4381.10');
  assert.equal(result.pricePerSqFt.toFixed(2), '22.82');
  assert.equal(result.totalHours.toFixed(1), '20.9');
  assert.equal(result.breakEvenPrice.toFixed(2), '3417.26');
});
