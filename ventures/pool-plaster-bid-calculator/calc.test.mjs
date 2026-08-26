import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  poolGeometry,
  suggestedFinishKit,
  suggestedChipoutKit,
  JOB_PRESETS,
  FINISH_PRESETS,
  CHIPOUT_PRESETS,
  SHAPE_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursPerPlasterSf: 0.045,
  hoursPerChipoutSf: 0,
  hoursPerSpa: 6,
  hoursPerStep: 1.5,
  hoursPerTileLf: 0.18,
  hoursPerCopingLf: 0.22,
  hoursDrainRefill: 3.5,
  hoursAcidWash: 2.5,
  siteHours: 2,
  finishPerSf: 1.85,
  tilePerLf: 18,
  copingPerLf: 22,
  dumpsterCost: 0,
  waterPerGallon: 0.012,
  acidWashChem: 85,
  permitFee: 125,
  hourlyWage: 36,
  burdenRate: 30,
  travelAndEquipment: 180,
  overheadRate: 15,
  targetMargin: 26,
  stepSfEach: 12,
});

const brochure = () => ({
  ...rates(),
  shape: 'rectangle',
  finish: 'white-plaster',
  chipout: 'none',
  lengthFt: 32,
  widthFt: 16,
  shallowFt: 3.5,
  deepFt: 8,
  spaSf: 0,
  stepBenches: 0,
  waterlineTileLf: 0,
  copingLf: 0,
  drainRefill: true,
  acidWash: false,
});

const pebbleLoss = () => ({
  ...rates(),
  ...suggestedFinishKit('pebble'),
  ...suggestedChipoutKit('full'),
  shape: 'freeform',
  finish: 'pebble',
  chipout: 'full',
  waterSurfaceSf: 620,
  freeformMultiplier: 1.85,
  shallowFt: 3.5,
  deepFt: 8.5,
  spaSf: 80,
  stepBenches: 4,
  waterlineTileLf: 90,
  copingLf: 90,
  drainRefill: true,
  acidWash: true,
});

test('a 16×32 rectangle has roughly twice the plaster of its water surface', () => {
  const geo = poolGeometry({
    shape: 'rectangle',
    lengthFt: 32,
    widthFt: 16,
    shallowFt: 3.5,
    deepFt: 8,
  });
  assert.equal(geo.floorSf, 512);
  assert.ok(Math.abs(geo.avgDepth - 5.75) < 1e-9);
  assert.ok(Math.abs(geo.wallSf - 2 * 48 * 5.75) < 1e-9);
  assert.ok(Math.abs(geo.plasterSf - 1064) < 1e-9);
  assert.ok(geo.plasterSf > geo.floorSf * 2 - 1);
});

test('brochure plaster hours come from floor plus walls, not from water surface', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.plasterSf - 1064) < 1e-9);
  assert.ok(Math.abs(result.plasterHours - 1064 * 0.045) < 1e-9);
  assert.equal(result.chipoutHours, 0);
  assert.equal(result.spaHours, 0);
  assert.equal(result.stepHours, 0);
  assert.equal(result.tileHours, 0);
  assert.equal(result.copingHours, 0);
  assert.equal(result.drainHours, 3.5);
  assert.equal(result.acidHours, 0);
  assert.ok(result.pricePerPlasterSf > 0);
  assert.ok(result.pricePerWaterSf > result.pricePerPlasterSf);
});

test('pebble extras do not scale with a blended water-surface rate', () => {
  const result = calculateBid(pebbleLoss());
  assert.ok(Math.abs(result.shellSf - 620 * 1.85) < 1e-9);
  assert.equal(result.spaSf, 80);
  assert.equal(result.stepSf, 48);
  assert.ok(Math.abs(result.plasterSf - (620 * 1.85 + 80 + 48)) < 1e-9);
  assert.equal(result.billedChipoutSf, result.plasterSf);
  assert.equal(result.spaHours, 6);
  assert.equal(result.stepHours, 6);
  assert.ok(Math.abs(result.tileHours - 16.2) < 1e-9);
  assert.ok(Math.abs(result.copingHours - 19.8) < 1e-9);
  assert.equal(result.drainHours, 3.5);
  assert.equal(result.acidHours, 2.5);
  assert.ok(result.extraHours > result.siteHours);
  assert.ok(result.chipoutHours > 0);
});

test('a pebble full chip-out prices well above the brochure white-plaster job', () => {
  const patch = calculateBid(brochure());
  const pebble = calculateBid(pebbleLoss());
  assert.ok(pebble.price > patch.price * 2.4, 'the pebble job is a different job');
  assert.ok(pebble.totalHours > patch.totalHours * 2);
  assert.ok(pebble.pricePerPlasterSf > patch.pricePerPlasterSf);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.equal(result.loadedWage, 36 * 1.3);
  const direct = result.laborCost + result.materialCost + 180;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 26) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a no-chip-out job does not bill dumpster or chip-out hours', () => {
  const result = calculateBid({ ...brochure(), hoursPerChipoutSf: 0.14, dumpsterCost: 650 });
  assert.equal(result.chipoutHours, 0);
  assert.equal(result.dumpsterMaterial, 0);
  assert.equal(result.billedChipoutSf, 0);
});

test('full chip-out bills the whole plaster takeoff, including spa and steps', () => {
  const result = calculateBid(pebbleLoss());
  assert.equal(result.billedChipoutSf, result.plasterSf);
  assert.ok(result.dumpsterMaterial > 0);
});

test('partial chip-out requires an area and does not bill the whole shell', () => {
  const result = calculateBid({
    ...brochure(),
    ...suggestedChipoutKit('partial'),
    chipout: 'partial',
    chipoutSf: 220,
  });
  assert.equal(result.billedChipoutSf, 220);
  assert.ok(Math.abs(result.chipoutHours - 220 * 0.08) < 1e-9);
  assert.equal(result.dumpsterMaterial, 280);
  assert.throws(
    () => calculateBid({ ...brochure(), chipout: 'partial', chipoutSf: 0 }),
    /partial chip-out/,
  );
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(pebbleLoss());
  const scored = calculateBid({ ...pebbleLoss(), proposedPrice: bid.totalCost - 400 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('a proposed price at the bid keeps the target margin', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 26) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
});

test('zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...brochure(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('target margin at or above 100% is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
});

test('unknown finish, chip-out, or shape is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), finish: 'epoxy' }), /Unknown pool finish/);
  assert.throws(() => calculateBid({ ...brochure(), chipout: 'sandblast' }), /Unknown chip-out/);
  assert.throws(() => calculateBid({ ...brochure(), shape: 'olympic' }), /Unknown pool shape/);
});

test('suggested kits follow the finish and the chip-out', () => {
  assert.equal(suggestedFinishKit('pebble').hoursPerPlasterSf, 0.075);
  assert.ok(suggestedFinishKit('glass').finishPerSf > suggestedFinishKit('white-plaster').finishPerSf);
  assert.equal(suggestedChipoutKit('none').dumpsterCost, 0);
  assert.equal(suggestedChipoutKit('full').hoursPerChipoutSf, 0.14);
  assert.throws(() => suggestedFinishKit('epoxy'), /Unknown/);
  assert.throws(() => suggestedChipoutKit('sandblast'), /Unknown/);
});

test('job presets cover the brochure special and the pebble loss', () => {
  assert.equal(JOB_PRESETS.length, 4);
  assert.ok(JOB_PRESETS[0].label.toLowerCase().includes('brochure'));
  assert.equal(JOB_PRESETS[2].finish, 'pebble');
  assert.equal(JOB_PRESETS[2].chipout, 'full');
  assert.equal(JOB_PRESETS[2].shape, 'freeform');
  assert.equal(FINISH_PRESETS.length, 4);
  assert.equal(CHIPOUT_PRESETS.length, 3);
  assert.equal(SHAPE_PRESETS.length, 2);
});

test('summary names the finish and omits wages', () => {
  const text = formatBidSummary(calculateBid(pebbleLoss()), JOB_PRESETS[2].label);
  assert.match(text, /POOL PLASTER \/ RESURFACING BID/);
  assert.match(text, /Pebble/);
  assert.match(text, /Freeform/);
  assert.match(text, /acid wash included/);
  assert.match(text, /not a pool specification/);
  assert.doesNotMatch(text, /36/);
  assert.doesNotMatch(text, /wage/i);
});

test('non-numeric inputs are rejected with the field name', () => {
  assert.throws(() => calculateBid({ ...brochure(), lengthFt: 'long' }), /Length/);
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: -1 }), /at least 0/);
});

test('skipping drain-and-refill zeros water and drain hours', () => {
  const result = calculateBid({ ...brochure(), drainRefill: false });
  assert.equal(result.drainHours, 0);
  assert.equal(result.waterMaterial, 0);
});
