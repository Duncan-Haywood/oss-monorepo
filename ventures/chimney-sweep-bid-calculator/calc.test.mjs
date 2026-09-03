import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  FLUE_PRESETS,
  STORY_MULTIPLIERS,
  ROOF_ACCESS_EXTRA,
  CREOSOTE_EXTRA_HOURS,
  WORK_TYPE_EXTRA_HOURS,
  ADD_ON_PRESETS,
  ANIMAL_HOURS_EACH,
} from './calc.mjs';

const typical = () => ({
  flues: [
    { name: 'Wood-burning fireplace', quantity: 1, hoursEach: 1.0 },
    { name: 'Wood stove / insert', quantity: 1, hoursEach: 1.25 },
  ],
  stories: 2,
  roofAccess: 'steep',
  creosote: 'moderate',
  workType: 'sweep',
  animalRemoval: false,
  addOns: [],
  hourlyWage: 28,
  burdenRate: 32,
  milesOneWay: 12,
  speedMph: 35,
  setupHours: 0.25,
  minOnSiteHours: 1,
  tripFee: 45,
  consumablesPerFlue: 8,
  chemicalPerGlazedFlue: 18,
  otherCost: 0,
  overheadRate: 18,
  targetMargin: 30,
});

test('height and flue type — not the house — set the labor', () => {
  const result = calculateBid(typical());
  // Base 1.0 + 1.25 = 2.25; two-story multiplier 1.35 → 3.0375 height hours
  assert.ok(Math.abs(result.baseHours - 2.25) < 1e-9);
  assert.equal(result.heightMultiplier, STORY_MULTIPLIERS[2]);
  assert.ok(Math.abs(result.heightHours - 2.25 * 1.35) < 1e-9);
  assert.equal(result.totalFlues, 2);
});

test('a wood stove consumes labor out of proportion to "one chimney"', () => {
  const result = calculateBid(typical());
  const stove = result.flues.find(flue => flue.name === 'Wood stove / insert');
  const fireplace = result.flues.find(flue => flue.name === 'Wood-burning fireplace');
  assert.ok(stove.hoursShare > fireplace.hoursShare);
  assert.ok(stove.hoursShare > 50);
  assert.equal(result.flues.length, 2);
});

test('a 3-story glazed two-flue wood job is a different stop than a 1-story gas fireplace', () => {
  const hard = calculateBid({
    ...typical(),
    stories: 3,
    roofAccess: 'snow',
    creosote: 'glazed',
    workType: 'camera',
    animalRemoval: true,
  });
  const easy = calculateBid({
    ...typical(),
    flues: [{ name: 'Gas fireplace', quantity: 1, hoursEach: 0.6 }],
    stories: 1,
    roofAccess: 'easy',
    creosote: 'light',
    workType: 'sweep',
    animalRemoval: false,
    milesOneWay: 4,
  });
  assert.ok(hard.totalHours > easy.totalHours * 3);
  assert.ok(hard.price > easy.price * 2.5);
  assert.ok(hard.chemical > 0);
  assert.equal(easy.chemical, 0);
});

test('price stacks burden, trip, overhead, then margin as a share of price', () => {
  const result = calculateBid(typical());
  assert.equal(result.loadedWage, 28 * 1.32);
  assert.ok(Math.abs(result.consumables - 16) < 1e-9);

  const onSiteBeforeMin =
    result.heightHours + result.creosoteHours + result.inspectionHours +
    result.animalHours + result.addOnHours + result.setupHours;
  const accessed = onSiteBeforeMin * (1 + ROOF_ACCESS_EXTRA.steep);
  assert.ok(Math.abs(result.rawOnSiteHours - onSiteBeforeMin) < 1e-9);
  assert.ok(Math.abs(result.onSiteHours - accessed) < 1e-9);
  assert.ok(Math.abs(result.travelHours - (24 / 35)) < 1e-9);

  const expectedLabor = result.totalHours * result.loadedWage;
  assert.ok(Math.abs(result.laborCost - expectedLabor) < 1e-9);
  const direct = result.laborCost + result.consumables + result.chemical + result.addOnParts + 45;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.18) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 30) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...typical(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(typical());
  const scored = calculateBid({ ...typical(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 30) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(typical());
  const scored = calculateBid({ ...typical(), proposedPrice: bid.totalCost - 40 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(typical()).proposed, null);
  assert.equal(calculateBid({ ...typical(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...typical(), proposedPrice: 0 }).proposed.price, 0);
});

test('minimum on-site hours pads a tiny gas job but not a full wood stop', () => {
  const tiny = calculateBid({
    ...typical(),
    flues: [{ name: 'Gas fireplace', quantity: 1, hoursEach: 0.4 }],
    stories: 1,
    roofAccess: 'easy',
    creosote: 'light',
    setupHours: 0,
    minOnSiteHours: 1,
    milesOneWay: 0,
  });
  assert.equal(tiny.minimumApplied, true);
  assert.equal(tiny.onSiteHours, 1);
  assert.equal(tiny.travelHours, 0);
  assert.equal(tiny.totalHours, 1);

  const full = calculateBid({ ...typical(), minOnSiteHours: 1 });
  assert.equal(full.minimumApplied, false);
  assert.ok(full.onSiteHours > 1);
});

test('travel is a round trip and never silently free at zero speed', () => {
  const result = calculateBid({ ...typical(), milesOneWay: 17.5, speedMph: 35 });
  assert.ok(Math.abs(result.travelHours - 1) < 1e-9);
  assert.throws(() => calculateBid({ ...typical(), speedMph: 0 }), /Travel speed must be greater than zero/);
});

test('add-ons contribute hours and parts; disabled ones are ignored', () => {
  const result = calculateBid({
    ...typical(),
    addOns: [
      { id: 'rainCap', label: 'Rain cap / spark arrestor', hours: 0.4, parts: 45, enabled: true },
      { id: 'damper', label: 'Damper repair / replacement', hours: 0.5, parts: 35, enabled: false },
    ],
  });
  assert.equal(result.addOns.length, 1);
  assert.ok(Math.abs(result.addOnHours - 0.4) < 1e-9);
  assert.equal(result.addOnParts, 45);
});

test('animal removal and glazed chemical scale with flue count', () => {
  const result = calculateBid({
    ...typical(),
    creosote: 'glazed',
    animalRemoval: true,
    chemicalPerGlazedFlue: 18,
  });
  assert.ok(Math.abs(result.animalHours - 2 * ANIMAL_HOURS_EACH) < 1e-9);
  assert.equal(result.chemical, 36);
  assert.ok(Math.abs(result.creosoteHours - 2 * CREOSOTE_EXTRA_HOURS.glazed) < 1e-9);
});

test('a nameless flue still reports under a stable label', () => {
  const result = calculateBid({
    ...typical(),
    flues: [{ quantity: 1, hoursEach: 1 }, { name: '   ', quantity: 1, hoursEach: 1 }],
  });
  assert.equal(result.flues[0].name, 'Flue 1');
  assert.equal(result.flues[1].name, 'Flue 2');
});

test('zero flues on site still reports ratios as n/a instead of dividing by zero', () => {
  const result = calculateBid({
    ...typical(),
    flues: [{ name: 'Empty', quantity: 0, hoursEach: 1 }],
    tripFee: 80,
    milesOneWay: 0,
  });
  assert.equal(result.totalFlues, 0);
  assert.equal(result.pricePerFlue, null);
  assert.equal(result.flues[0].hoursShare, 0);
  assert.ok(result.price > 80);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...typical(), flues: [] }), /at least one flue/);
  assert.throws(
    () => calculateBid({ ...typical(), flues: [{ name: 'Insert', quantity: -1, hoursEach: 1 }] }),
    /Insert: quantity must be at least 0/,
  );
  assert.throws(() => calculateBid({ ...typical(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...typical(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...typical(), roofAccess: 'ladder' }), /Roof access/);
  assert.throws(() => calculateBid({ ...typical(), stories: 0 }), /Stories must be at least 1/);
});

test('presets are usable positive numbers', () => {
  assert.ok(FLUE_PRESETS.length >= 5);
  for (const preset of FLUE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(Number.isFinite(preset.hoursEach) && preset.hoursEach > 0);
  }
  assert.ok(ADD_ON_PRESETS.length >= 3);
  assert.ok(WORK_TYPE_EXTRA_HOURS.camera > WORK_TYPE_EXTRA_HOURS.level2);
  assert.ok(CREOSOTE_EXTRA_HOURS.glazed > CREOSOTE_EXTRA_HOURS.moderate);
});
