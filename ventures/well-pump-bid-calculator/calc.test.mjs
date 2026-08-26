import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedHpKit,
  suggestedTypeKit,
  suggestedWorkKit,
  suggestedPitlessKit,
  JOB_PRESETS,
  TYPE_PRESETS,
  WORK_PRESETS,
  HP_PRESETS,
  PITLESS_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 0.75,
  hoursPumpBase: 2.5,
  hoursPerExtraFoot: 0.015,
  hoursTank: 1,
  hoursPitless: 2,
  hoursStuckPull: 1.5,
  hoursSwitch: 0.5,
  hoursPerExtraCableFoot: 0.004,
  hoursVfd: 1.25,
  siteHours: 0.5,
  includedCableFeet: 100,
  pumpCost: 280,
  tankCost: 280,
  pitlessCost: 185,
  cablePerFoot: 1.85,
  switchCost: 85,
  vfdCost: 650,
  hoistFee: 75,
  permitFee: 0,
  hourlyWage: 42,
  burdenRate: 32,
  travelAndEquipment: 85,
  overheadRate: 18,
  targetMargin: 35,
});

const brochure = () => ({
  ...rates(),
  type: 'submersible',
  work: 'pump',
  hp: '0.5',
  pitless: 'good',
  wellDepthFeet: 60,
  includedFootage: 100,
  cableFeet: 70,
  stuckPump: false,
  addVfd: false,
});

const moneyLoser = () => ({
  ...rates(),
  type: 'submersible',
  work: 'full',
  hp: '1.5',
  pitless: 'seized',
  wellDepthFeet: 280,
  includedFootage: 100,
  cableFeet: 300,
  pumpCost: 780,
  stuckPump: true,
  addVfd: true,
});

test('brochure pump hours come from the trip and the pull, not from a tank or seized pitless', () => {
  const result = calculateBid(brochure());
  assert.equal(result.replaceTank, false);
  assert.equal(result.replacePitless, false);
  assert.equal(result.replaceSwitch, false);
  assert.equal(result.extraFeet, 0);
  assert.equal(result.extraCableFeet, 0);
  assert.equal(result.tripHours, 0.75);
  assert.equal(result.pumpHours, 2.5);
  assert.equal(result.tankHours, 0);
  assert.equal(result.pitlessHours, 0);
  assert.equal(result.stuckHours, 0);
  assert.equal(result.vfdHours, 0);
  assert.equal(result.footageHours, 0);
  assert.equal(result.cableHours, 0);
  assert.equal(result.tankMaterial, 0);
  assert.equal(result.pitlessMaterial, 0);
  assert.equal(result.vfdMaterial, 0);
  assert.equal(result.hoistMaterial, 75);
});

test('depth, seized pitless, stuck pull, and VFD do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.replaceTank, true);
  assert.equal(result.replacePitless, true);
  assert.equal(result.replaceSwitch, true);
  assert.equal(result.extraFeet, 180);
  assert.equal(result.extraCableFeet, 200);
  assert.equal(result.tankHours, 1);
  assert.equal(result.switchHours, 0.5);
  assert.equal(result.pitlessHours, 2);
  assert.equal(result.stuckHours, 1.5);
  assert.equal(result.vfdHours, 1.25);
  assert.ok(Math.abs(result.footageHours - 180 * 0.015) < 1e-9);
  assert.ok(Math.abs(result.cableHours - 200 * 0.004) < 1e-9);
  assert.ok(Math.abs(result.cableMaterial - 200 * 1.85) < 1e-9);
  assert.equal(result.pumpMaterial, 780);
  assert.equal(result.tankMaterial, 280);
  assert.equal(result.pitlessMaterial, 185);
  assert.equal(result.vfdMaterial, 650);
  // Access + extra footage + package extras outrun the trip itself —
  // that is the user-visible reason a trip-charge special fails even
  // when the job still looks like "one pump."
  assert.ok(result.accessHours + result.runHours + result.packageHours > result.tripHours);
});

test('a 280 ft seized-pitless job prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const deep = calculateBid(moneyLoser());
  assert.equal(special.tripHours, deep.tripHours);
  assert.ok(deep.price > special.price * 2.4, 'the deep seized-pitless well is a different job');
  assert.ok(deep.totalHours > special.totalHours * 2);
  assert.equal(special.pricePerExtraFoot, null);
  assert.ok(deep.pricePerExtraFoot > special.pricePerFoot);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 42 * 1.32) < 1e-9);

  const expectedHours = 0.75 + 2.5 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 42 * 1.32) < 1e-9);

  const expectedMaterials = 280 + 75;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 85)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.18) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.18) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 35) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...brochure(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 35) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.totalCost - 40 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off tank, pitless, stuck pull, and VFD drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    work: 'pump',
    pitless: 'good',
    stuckPump: false,
    addVfd: false,
  });
  assert.equal(stripped.tankHours, 0);
  assert.equal(stripped.pitlessHours, 0);
  assert.equal(stripped.stuckHours, 0);
  assert.equal(stripped.switchHours, 0);
  assert.equal(stripped.vfdHours, 0);
  assert.equal(stripped.tankMaterial, 0);
  assert.equal(stripped.pitlessMaterial, 0);
  assert.equal(stripped.vfdMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.equal(full.pitlessHours, 2);
  assert.equal(full.pitlessMaterial, 185);
});

test('a jet-pump job does not bill a hoist and uses jet pull hours', () => {
  const result = calculateBid({
    ...brochure(),
    type: 'jet',
    work: 'pump-tank',
    pitless: 'none',
    hoursPumpBase: 1.5,
    hoistFee: 75,
  });
  assert.equal(result.hoistMaterial, 0);
  assert.equal(result.pumpHours, 1.5);
  assert.equal(result.replaceTank, true);
  assert.equal(result.replacePitless, false);
  assert.equal(result.tankMaterial, 280);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedHpKit('0.5', 'submersible'), { pumpCost: 280 });
  assert.deepEqual(suggestedHpKit('1.5', 'submersible'), { pumpCost: 780 });
  assert.deepEqual(suggestedHpKit('0.75', 'jet'), { pumpCost: 300 });
  assert.deepEqual(suggestedTypeKit('submersible'), { hoursPumpBase: 2.5, hoistFee: 75 });
  assert.deepEqual(suggestedTypeKit('jet'), { hoursPumpBase: 1.5, hoistFee: 0 });
  assert.deepEqual(suggestedWorkKit('pump'), {
    hoursTank: 0, tankCost: 0, hoursSwitch: 0, switchCost: 0,
  });
  assert.deepEqual(suggestedWorkKit('full'), {
    hoursTank: 1, tankCost: 280, hoursSwitch: 0.5, switchCost: 85,
  });
  assert.deepEqual(suggestedPitlessKit('good'), { hoursPitless: 0, pitlessCost: 0 });
  assert.deepEqual(suggestedPitlessKit('seized'), { hoursPitless: 2, pitlessCost: 185 });
  assert.throws(() => suggestedHpKit('3'), /Unknown horsepower/);
  assert.throws(() => suggestedTypeKit('solar'), /Unknown pump type/);
  assert.throws(() => suggestedWorkKit('rewire'), /Unknown work/);
  assert.throws(() => suggestedPitlessKit('rusted'), /Unknown pitless/);
});

test('unknown type, work, horsepower, or pitless is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), type: 'solar' }), /Unknown pump type/);
  assert.throws(() => calculateBid({ ...brochure(), work: 'rewire' }), /Unknown work/);
  assert.throws(() => calculateBid({ ...brochure(), hp: '3' }), /Unknown horsepower/);
  assert.throws(() => calculateBid({ ...brochure(), pitless: 'rusted' }), /Unknown pitless/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), wellDepthFeet: 0 }), /Well depth must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), cableFeet: -1 }), /Well-cable footage must be at least 0/);
});

test('job presets are usable and the deep seized well is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const deep = JOB_PRESETS[2];
  assert.equal(special.work, 'pump');
  assert.equal(special.pitless, 'good');
  assert.equal(deep.work, 'full');
  assert.equal(deep.pitless, 'seized');
  assert.ok(deep.wellDepthFeet > special.wellDepthFeet);
  assert.equal(deep.stuckPump, true);
  assert.equal(deep.addVfd, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...TYPE_PRESETS, ...WORK_PRESETS, ...HP_PRESETS, ...PITLESS_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the depth extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, '280 ft seized pitless');
  assert.match(text, /WELL PUMP \/ PRESSURE TANK BID/);
  assert.match(text, /280 ft of well/);
  assert.match(text, /Seized pitless/);
  assert.match(text, /new pressure tank included/);
  assert.match(text, /stuck-pump pull included/);
  assert.match(text, /constant-pressure drive included/);
  assert.doesNotMatch(text, /42/);
  assert.doesNotMatch(text, /wage/i);
});
