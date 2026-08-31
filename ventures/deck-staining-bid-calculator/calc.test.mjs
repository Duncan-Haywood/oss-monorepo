import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedPrepKit,
  suggestedFinishKit,
  suggestedAccessKit,
  stainableSurface,
  JOB_PRESETS,
  PREP_PRESETS,
  FINISH_PRESETS,
  ACCESS_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1.1,
  hoursPer100SfPrep: 0.55,
  hoursPer100SfCoat: 0.65,
  coats: 1,
  hoursAccess: 0,
  hoursFurniture: 1.4,
  siteHours: 0.3,
  prepMaterialPer100Sf: 3.5,
  stainPerGallon: 46,
  coverageSfPerGallon: 225,
  railSfPerLf: 9,
  stairSf: 40,
  furnitureFee: 45,
  mobilizationFee: 85,
  permitFee: 0,
  hourlyWage: 38,
  burdenRate: 30,
  travelAndEquipment: 75,
  overheadRate: 15,
  targetMargin: 28,
});

const platform = () => ({
  ...rates(),
  prep: 'wash',
  finish: 'water',
  access: 'ground',
  deckSqFt: 200,
  railLinealFeet: 0,
  stairRuns: 0,
  moveFurniture: false,
});

const picketJob = () => ({
  ...rates(),
  prep: 'wash',
  finish: 'oil',
  access: 'ground',
  hoursPer100SfCoat: 0.8,
  coats: 2,
  stainPerGallon: 58,
  coverageSfPerGallon: 150,
  deckSqFt: 192,
  railLinealFeet: 40,
  stairRuns: 1,
  moveFurniture: false,
});

test('platform special hours come from the trip, the 200-sf wash, one water coat, and site — not from rails, stairs, or furniture', () => {
  const result = calculateBid(platform());
  assert.equal(result.moveFurniture, false);
  assert.equal(result.railLinealFeet, 0);
  assert.equal(result.stairRuns, 0);
  assert.equal(result.coats, 1);
  assert.equal(result.tripHours, 1.1);
  assert.ok(Math.abs(result.prepHours - (200 / 100) * 0.55) < 1e-9);
  assert.ok(Math.abs(result.coatHours - (200 / 100) * 0.65 * 1) < 1e-9);
  assert.equal(result.accessHours, 0);
  assert.equal(result.furnitureHours, 0);
  assert.equal(result.railHours, 0);
  assert.equal(result.stairHours, 0);
  assert.equal(result.stainableSf, 200);
  assert.ok(Math.abs(result.stainGallons - (200 / 225)) < 1e-9);
  assert.equal(result.furnitureMaterial, 0);
  assert.ok(Math.abs(result.mobilizationMaterial - 85) < 1e-9);
});

test('stainable surface is walking feet plus rail plus stairs — the number a per-square-foot special cannot see', () => {
  assert.equal(stainableSurface(200, 0, 9, 0, 40), 200);
  assert.equal(stainableSurface(192, 40, 9, 1, 40), 192 + 360 + 40);
  assert.equal(stainableSurface(400, 80, 9, 2, 40), 400 + 720 + 80);
  assert.throws(() => stainableSurface(-1, 0, 9, 0, 40), /Deck square feet must be at least 0/);
});

test('picket rails and a stair do not scale with the trip charge', () => {
  const result = calculateBid(picketJob());
  assert.equal(result.stainableSf, 592);
  assert.equal(result.railSf, 360);
  assert.equal(result.stairSfTotal, 40);
  assert.ok(Math.abs(result.prepHours - (592 / 100) * 0.55) < 1e-9);
  assert.ok(Math.abs(result.coatHours - (592 / 100) * 0.8 * 2) < 1e-9);
  assert.ok(result.railHours > result.deckSurfaceHours, '40 lf of pickets outwork the 192-sf walking surface');
  assert.ok(result.stairHours > 0);
  assert.equal(result.tripHours, 1.1);
  assert.ok(result.prepHours + result.coatHours > result.tripHours);
});

test('a 12x16 picket-rail oil job prices well above the platform special despite almost the same walking feet', () => {
  const special = calculateBid(platform());
  const heavy = calculateBid(picketJob());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.stainableSf > special.stainableSf * 2.5);
  assert.ok(heavy.price > special.price * 3, 'the picket-rail oil job is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 3);
  assert.ok(heavy.materialCost > special.materialCost);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(platform());
  assert.ok(Math.abs(result.loadedWage - 38 * 1.3) < 1e-9);

  const expectedHours = 1.1 + (200 / 100) * 0.55 + (200 / 100) * 0.65 + 0.3;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 38 * 1.3) < 1e-9);

  const expectedMaterials = (200 / 225) * 46 + (200 / 100) * 3.5 + 85;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 75)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
  assert.ok(Math.abs(result.pricePerWalkingSf - result.price / 200) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...platform(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(platform());
  const scored = calculateBid({ ...platform(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(platform());
  const scored = calculateBid({ ...platform(), proposedPrice: bid.totalCost - 40 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(platform()).proposed, null);
  assert.equal(calculateBid({ ...platform(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...platform(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...platform(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off rails, stairs, strip, oil, second-story, and furniture drops those hours and kits', () => {
  const full = calculateBid({
    ...picketJob(),
    prep: 'strip',
    hoursPer100SfPrep: 2.7,
    prepMaterialPer100Sf: 24,
    access: 'second',
    hoursAccess: 1.6,
    moveFurniture: true,
    deckSqFt: 400,
    railLinealFeet: 80,
    stairRuns: 2,
  });
  const stripped = calculateBid(platform());
  assert.equal(stripped.accessHours, 0);
  assert.equal(stripped.furnitureHours, 0);
  assert.equal(stripped.furnitureMaterial, 0);
  assert.equal(stripped.railHours, 0);
  assert.ok(stripped.price < full.price);
  assert.ok(full.furnitureMaterial > 0);
  assert.ok(full.accessHours > 0);
});

test('a zero-area call still prices — stain hours are the surface, not an error', () => {
  const result = calculateBid({
    ...platform(),
    deckSqFt: 0,
  });
  assert.equal(result.stainableSf, 0);
  assert.equal(result.prepHours, 0);
  assert.equal(result.coatHours, 0);
  assert.equal(result.stainGallons, 0);
  assert.ok(result.price > 0);
});

test('a ground-level wash job does not also bill furniture or second-story staging', () => {
  const result = calculateBid({
    ...platform(),
    access: 'ground',
    hoursFurniture: 1.4,
    furnitureFee: 45,
    hoursAccess: 1.6,
  });
  assert.equal(result.furnitureHours, 0);
  assert.equal(result.furnitureMaterial, 0);
  assert.equal(result.accessHours, 1.6);
});

test('a second-story strip-and-oil job bills furniture and staging as their own hours', () => {
  const result = calculateBid({
    ...picketJob(),
    prep: 'strip',
    hoursPer100SfPrep: 2.7,
    prepMaterialPer100Sf: 24,
    access: 'second',
    hoursAccess: 1.6,
    moveFurniture: true,
    deckSqFt: 400,
    railLinealFeet: 80,
    stairRuns: 2,
  });
  assert.equal(result.stainableSf, 1200);
  assert.ok(Math.abs(result.furnitureHours - 1.4) < 1e-9);
  assert.ok(Math.abs(result.furnitureMaterial - 45) < 1e-9);
  assert.ok(Math.abs(result.accessHours - 1.6) < 1e-9);
  assert.ok(result.railHours > result.deckSurfaceHours);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedPrepKit('wash'), { hoursPer100SfPrep: 0.55, prepMaterialPer100Sf: 3.5 });
  assert.deepEqual(suggestedPrepKit('sand'), { hoursPer100SfPrep: 1.35, prepMaterialPer100Sf: 6 });
  assert.deepEqual(suggestedPrepKit('strip'), { hoursPer100SfPrep: 2.7, prepMaterialPer100Sf: 24 });
  assert.deepEqual(suggestedFinishKit('water'), {
    coats: 1, hoursPer100SfCoat: 0.65, stainPerGallon: 46, coverageSfPerGallon: 225,
  });
  assert.deepEqual(suggestedFinishKit('oil'), {
    coats: 2, hoursPer100SfCoat: 0.8, stainPerGallon: 58, coverageSfPerGallon: 150,
  });
  assert.deepEqual(suggestedFinishKit('composite'), {
    coats: 1, hoursPer100SfCoat: 0.5, stainPerGallon: 52, coverageSfPerGallon: 275,
  });
  assert.deepEqual(suggestedAccessKit('ground'), { hoursAccess: 0 });
  assert.deepEqual(suggestedAccessKit('second'), { hoursAccess: 1.6 });
  assert.throws(() => suggestedPrepKit('pressure-only'), /Unknown prep method/);
  assert.throws(() => suggestedFinishKit('paint'), /Unknown finish/);
  assert.throws(() => suggestedAccessKit('crane'), /Unknown access path/);
});

test('unknown prep, finish, or access is rejected', () => {
  assert.throws(() => calculateBid({ ...platform(), prep: 'pressure-only' }), /Unknown prep method/);
  assert.throws(() => calculateBid({ ...platform(), finish: 'paint' }), /Unknown finish/);
  assert.throws(() => calculateBid({ ...platform(), access: 'crane' }), /Unknown access path/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...platform(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...platform(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...platform(), deckSqFt: -1 }), /Deck square feet must be at least 0/);
  assert.throws(() => calculateBid({ ...platform(), railLinealFeet: -1 }), /Rail lineal feet must be at least 0/);
});

test('job presets are usable and the picket-rail oil job is not a markup on the platform special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[1];
  const strip = JOB_PRESETS[2];
  assert.equal(special.prep, 'wash');
  assert.equal(special.finish, 'water');
  assert.equal(special.railLinealFeet, 0);
  assert.equal(heavy.finish, 'oil');
  assert.equal(heavy.railLinealFeet, 40);
  assert.ok(heavy.railLinealFeet > special.railLinealFeet);
  assert.equal(strip.prep, 'strip');
  assert.equal(strip.access, 'second');
  assert.equal(strip.moveFurniture, true);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...PREP_PRESETS, ...FINISH_PRESETS, ...ACCESS_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the stainable surface, rails, and extras', () => {
  const result = calculateBid(picketJob());
  const text = formatBidSummary(result, '12x16 192 sf, 40 lf picket rail, 1 stair');
  assert.match(text, /DECK STAINING BID/);
  assert.match(text, /Oil-based stain/);
  assert.match(text, /592 sf of stainable surface/);
  assert.match(text, /40 lf of rail/);
  assert.match(text, /1 stair run/);
  assert.match(text, /2 coats/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
});
