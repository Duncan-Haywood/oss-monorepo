import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedConfigKit,
  suggestedMaterialKit,
  suggestedHangStyleKit,
  suggestedStoryKit,
  JOB_PRESETS,
  CONFIG_PRESETS,
  MATERIAL_PRESETS,
  HANG_PRESETS,
  STORY_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1,
  hoursHang: 2.5,
  hoursHangPremium: 0,
  hangHourFactor: 1,
  hoursStory: 0,
  hoursOutOfSquare: 1.5,
  hoursPerRotFoot: 0.45,
  hoursTransom: 1.25,
  hoursBrickmold: 1.2,
  hoursStormDoor: 1.5,
  hoursSmartLock: 0.6,
  hoursPaint: 2,
  hoursTearOut: 1,
  siteHours: 0.5,
  unitCost: 420,
  unitCostMultiplier: 1,
  unitCostFactor: 1,
  transomCost: 220,
  brickmoldCost: 85,
  stormDoorCost: 280,
  lockCost: 95,
  paintMaterial: 48,
  rotPerFoot: 14,
  dumpFee: 45,
  permitFee: 0,
  hourlyWage: 42,
  burdenRate: 32,
  travelAndEquipment: 85,
  overheadRate: 16,
  targetMargin: 32,
});

const brochure = () => ({
  ...rates(),
  config: 'single-36',
  material: 'steel',
  hangStyle: 'prehung',
  stories: 'one',
  rotFeet: 0,
  outOfSquare: false,
  addTransom: false,
  addBrickmold: false,
  addStormDoor: false,
  addSmartLock: false,
  addPaint: false,
  tearOut: true,
});

const moneyLoser = () => ({
  ...rates(),
  config: 'sidelite-two',
  material: 'fiberglass',
  hangStyle: 'prehung',
  stories: 'two',
  hoursHang: 4.6,
  hoursHangPremium: 0.3,
  hoursStory: 0.9,
  hoursPaint: 3.4,
  unitCost: 980,
  unitCostMultiplier: 2.15,
  rotFeet: 8,
  outOfSquare: true,
  addTransom: true,
  addBrickmold: true,
  addStormDoor: true,
  addSmartLock: true,
  addPaint: true,
  tearOut: true,
});

test('brochure steel hang hours come from the trip, the hang, and tear-out — not from sidelights or rot', () => {
  const result = calculateBid(brochure());
  assert.equal(result.tearOut, true);
  assert.equal(result.addTransom, false);
  assert.equal(result.tripHours, 1);
  assert.ok(Math.abs(result.hangHours - 2.5) < 1e-9);
  assert.equal(result.storyHours, 0);
  assert.equal(result.openingHours, 0);
  assert.ok(Math.abs(result.packageHours - 1) < 1e-9);
  assert.ok(Math.abs(result.doorMaterial - 420) < 1e-9);
  assert.equal(result.transomMaterial, 0);
  assert.equal(result.stormMaterial, 0);
  assert.equal(result.rotMaterial, 0);
  assert.ok(Math.abs(result.dumpMaterial - 45) < 1e-9);
});

test('sidelights, transom, rot, brickmold, storm, and a second story do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.outOfSquare, true);
  assert.equal(result.addTransom, true);
  assert.ok(Math.abs(result.hangHours - (4.6 + 0.3)) < 1e-9);
  assert.ok(Math.abs(result.storyHours - 0.9) < 1e-9);
  assert.ok(Math.abs(result.openingHours - (1.5 + 8 * 0.45)) < 1e-9);
  assert.ok(Math.abs(result.packageHours - (1.25 + 1.2 + 1.5 + 0.6 + 3.4 + 1)) < 1e-9);
  assert.ok(Math.abs(result.doorMaterial - 980 * 2.15) < 1e-9);
  assert.ok(Math.abs(result.transomMaterial - 220) < 1e-9);
  assert.ok(Math.abs(result.stormMaterial - 280) < 1e-9);
  assert.ok(Math.abs(result.rotMaterial - 8 * 14) < 1e-9);
  assert.ok(result.openingHours + result.packageHours + result.storyHours > result.tripHours);
});

test('a sidelight-and-rot job prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 3, 'the sidelight-and-rot house is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 2.5);
  assert.ok(heavy.materialCost > special.materialCost);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 42 * 1.32) < 1e-9);

  const expectedHours = 1 + 2.5 + 1 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 42 * 1.32) < 1e-9);

  const expectedMaterials = 420 + 45;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 85)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 32) < 1e-9);
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
  assert.ok(Math.abs(scored.proposed.margin - 32) < 1e-9);
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

test('turning off extras, sidelights, and fiberglass drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    config: 'single-36',
    material: 'steel',
    stories: 'one',
    hoursHang: 2.5,
    hoursHangPremium: 0,
    hoursStory: 0,
    hoursPaint: 2,
    unitCost: 420,
    unitCostMultiplier: 1,
    rotFeet: 0,
    outOfSquare: false,
    addTransom: false,
    addBrickmold: false,
    addStormDoor: false,
    addSmartLock: false,
    addPaint: false,
  });
  assert.equal(stripped.storyHours, 0);
  assert.equal(stripped.openingHours, 0);
  assert.equal(stripped.transomMaterial, 0);
  assert.equal(stripped.stormMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.ok(full.rotMaterial > 0);
});

test('a slab-only hang does not bill a full prehung unit or full hang hours', () => {
  const result = calculateBid({
    ...brochure(),
    hangStyle: 'slab',
    hangHourFactor: 0.48,
    unitCostFactor: 0.42,
  });
  assert.ok(Math.abs(result.hangHours - 2.5 * 0.48) < 1e-9);
  assert.ok(Math.abs(result.doorMaterial - 420 * 0.42) < 1e-9);
  assert.ok(result.price < calculateBid(brochure()).price);
});

test('a wood hang without paint or a storm door does not bill those kits', () => {
  const result = calculateBid({
    ...brochure(),
    material: 'wood',
    hoursHangPremium: 0.55,
    unitCost: 1680,
    addPaint: false,
    addStormDoor: false,
  });
  assert.equal(result.paintMat, 0);
  assert.equal(result.stormMaterial, 0);
  assert.ok(Math.abs(result.hangHours - (2.5 + 0.55)) < 1e-9);
  assert.ok(Math.abs(result.doorMaterial - 1680) < 1e-9);
});

test('zero rot footage still prices — rot hours are zero, not an error', () => {
  const result = calculateBid({ ...brochure(), rotFeet: 0, outOfSquare: false });
  assert.equal(result.openingHours, 0);
  assert.equal(result.rotMaterial, 0);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedConfigKit('single-36'), {
    hoursHang: 2.5, hoursPaint: 2.0, unitCostMultiplier: 1,
  });
  assert.deepEqual(suggestedConfigKit('sidelite-two'), {
    hoursHang: 4.6, hoursPaint: 3.4, unitCostMultiplier: 2.15,
  });
  assert.deepEqual(suggestedMaterialKit('steel'), { unitCost: 420, hoursHangPremium: 0 });
  assert.deepEqual(suggestedMaterialKit('fiberglass'), { unitCost: 980, hoursHangPremium: 0.3 });
  assert.deepEqual(suggestedMaterialKit('wood'), { unitCost: 1680, hoursHangPremium: 0.55 });
  assert.deepEqual(suggestedHangStyleKit('prehung'), { hangHourFactor: 1, unitCostFactor: 1 });
  assert.deepEqual(suggestedHangStyleKit('slab'), { hangHourFactor: 0.48, unitCostFactor: 0.42 });
  assert.deepEqual(suggestedStoryKit('one'), { hoursStory: 0 });
  assert.deepEqual(suggestedStoryKit('two'), { hoursStory: 0.9 });
  assert.throws(() => suggestedConfigKit('french'), /Unknown door configuration/);
  assert.throws(() => suggestedMaterialKit('aluminum'), /Unknown door material/);
  assert.throws(() => suggestedHangStyleKit('pocket'), /Unknown hang style/);
  assert.throws(() => suggestedStoryKit('three'), /Unknown story count/);
});

test('unknown config, material, hang style, or story count is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), config: 'french' }), /Unknown door configuration/);
  assert.throws(() => calculateBid({ ...brochure(), material: 'aluminum' }), /Unknown door material/);
  assert.throws(() => calculateBid({ ...brochure(), hangStyle: 'pocket' }), /Unknown hang style/);
  assert.throws(() => calculateBid({ ...brochure(), stories: 'three' }), /Unknown story count/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), rotFeet: -1 }), /Rot footage must be at least 0/);
});

test('job presets are usable and the sidelight house is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.config, 'single-36');
  assert.equal(special.material, 'steel');
  assert.equal(heavy.config, 'sidelite-two');
  assert.equal(heavy.material, 'fiberglass');
  assert.equal(heavy.addTransom, true);
  assert.ok(heavy.rotFeet > special.rotFeet);
  assert.equal(heavy.outOfSquare, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...CONFIG_PRESETS, ...MATERIAL_PRESETS, ...HANG_PRESETS, ...STORY_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the opening and extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, 'Fiberglass sidelights, rot, and storm door');
  assert.match(text, /ENTRY DOOR REPLACEMENT BID/);
  assert.match(text, /36" \+ two sidelights/);
  assert.match(text, /Fiberglass/);
  assert.match(text, /Second-story/);
  assert.match(text, /8 ft of jamb \/ sill rot repair/);
  assert.match(text, /storm door included/);
  assert.match(text, /transom included/);
  assert.doesNotMatch(text, /42/);
  assert.doesNotMatch(text, /wage/i);
});
