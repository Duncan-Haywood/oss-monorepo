import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedDisposal,
  suggestedAccessHours,
  JOB_PRESETS,
  ACCESS_PRESETS,
} from './calc.mjs';

const rates = () => ({
  includedGallons: 1000,
  includedHoseFeet: 50,
  hoursBasePump: 1,
  hoursPerExtra100Gal: 0.15,
  hoursBuriedLid: 1.25,
  hoursPerHoseFoot: 0.01,
  hoursPerExtraTank: 0.75,
  hoursBaffles: 0.75,
  hoursPerRiser: 0.6,
  hoursInspection: 0.5,
  hoursAfterHours: 0.5,
  siteHours: 0.75,
  dumpTripFee: 80,
  disposalPerGallon: 0.08,
  baffleKitCost: 85,
  riserCostEach: 145,
  afterHoursFee: 125,
  permitFee: 45,
  hourlyWage: 38,
  burdenRate: 32,
  travelAndEquipment: 55,
  overheadRate: 16,
  targetMargin: 28,
});

const brochure = () => ({
  ...rates(),
  tankGallons: 1000,
  extraTankGallons: 0,
  extraTankCount: 0,
  hoseFeet: 40,
  access: 'exposed',
  replaceBaffles: false,
  riserCount: 0,
  inspectionReport: false,
  afterHours: false,
});

const twoTank = () => ({
  ...rates(),
  tankGallons: 1250,
  extraTankGallons: 750,
  extraTankCount: 2,
  hoseFeet: 150,
  access: 'buried',
  replaceBaffles: true,
  riserCount: 2,
  inspectionReport: true,
  afterHours: false,
  dumpTripFee: 95,
  disposalPerGallon: 0.09,
  hoursBuriedLid: 1.25,
});

test('brochure pump hours come from the base stop, not from buried lids or extra tanks', () => {
  const result = calculateBid(brochure());
  assert.equal(result.buriedLid, false);
  assert.equal(result.extraGallons, 0);
  assert.equal(result.extraHoseFeet, 0);
  assert.equal(result.pumpHours, 1);
  assert.equal(result.gallonHours, 0);
  assert.equal(result.lidHours, 0);
  assert.equal(result.hoseHours, 0);
  assert.equal(result.extraTankHours, 0);
  assert.equal(result.baffleHours, 0);
  assert.equal(result.riserHours, 0);
  assert.equal(result.inspectionHours, 0);
  assert.equal(result.emergencyHours, 0);
  assert.equal(result.siteHours, 0.75);
});

test('two-tank buried extras do not scale with the brochure gallon count', () => {
  const result = calculateBid(twoTank());
  assert.equal(result.totalGallons, 2000);
  assert.equal(result.extraGallons, 1000);
  assert.equal(result.extraHoseFeet, 100);
  assert.equal(result.lidHours, 1.25);
  assert.ok(Math.abs(result.gallonHours - 1.5) < 1e-9);
  assert.ok(Math.abs(result.hoseHours - 1) < 1e-9);
  assert.ok(Math.abs(result.extraTankHours - 1.5) < 1e-9);
  assert.equal(result.baffleHours, 0.75);
  assert.ok(Math.abs(result.riserHours - 1.2) < 1e-9);
  assert.equal(result.inspectionHours, 0.5);
  // Access + extras outrun the base pump itself — that is the
  // user-visible reason a per-gallon quote fails even when the
  // primary tank looks ordinary.
  assert.ok(result.accessHours + result.serviceHours > result.pumpHours);
});

test('a two-tank buried job prices well above the brochure special despite a similar primary tank', () => {
  const special = calculateBid(brochure());
  const job = calculateBid(twoTank());
  assert.ok(job.tankGallons > special.tankGallons * 0.9);
  assert.ok(job.price > special.price * 3, 'the two-tank buried job is a different job');
  assert.ok(job.totalHours > special.totalHours * 3);
  assert.ok(job.pricePerGallon > special.pricePerGallon);
});

test('price stacks burden, disposal, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 38 * 1.32) < 1e-9);

  const expectedHours = 1 + 0.75;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 38 * 1.32) < 1e-9);

  const expectedMaterials = 80 + 1000 * 0.08;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 55)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
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
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.totalCost - 50 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off baffles, risers, and inspection drops those hours and kits', () => {
  const full = calculateBid(twoTank());
  const stripped = calculateBid({
    ...twoTank(),
    replaceBaffles: false,
    riserCount: 0,
    inspectionReport: false,
  });
  assert.equal(stripped.baffleHours, 0);
  assert.equal(stripped.riserHours, 0);
  assert.equal(stripped.inspectionHours, 0);
  assert.equal(stripped.baffleMaterial, 0);
  assert.equal(stripped.riserMaterial, 0);
  assert.equal(stripped.permitMaterial, 0);
  assert.ok(stripped.price < full.price);
  // Buried lid and extra tanks still fire because access is unchanged.
  assert.equal(stripped.lidHours, 1.25);
  assert.ok(stripped.extraTankHours > 0);
});

test('an exposed lid does not bill locate-and-dig hours', () => {
  const result = calculateBid(brochure());
  assert.equal(result.lidHours, 0);
  assert.equal(result.accessHours, 0);
});

test('suggested disposal and access hours match the shipped presets', () => {
  assert.deepEqual(suggestedDisposal(1000), { dumpTripFee: 80, disposalPerGallon: 0.08 });
  assert.deepEqual(suggestedDisposal(1250), { dumpTripFee: 95, disposalPerGallon: 0.09 });
  assert.deepEqual(suggestedDisposal(1500), { dumpTripFee: 110, disposalPerGallon: 0.1 });
  assert.deepEqual(suggestedAccessHours('exposed'), { hoursBuriedLid: 0 });
  assert.deepEqual(suggestedAccessHours('buried'), { hoursBuriedLid: 1.25 });
  assert.throws(() => suggestedDisposal(0), /greater than zero/);
  assert.throws(() => suggestedAccessHours('crane'), /Unknown access/);
});

test('unknown access is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), access: 'crane' }), /Unknown access/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), tankGallons: 0 }), /Tank gallons must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), includedGallons: 0 }), /Included gallons must be greater than zero/);
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), hoseFeet: -1 }), /Hose feet must be at least 0/);
  assert.throws(() => calculateBid({ ...brochure(), extraTankCount: -1 }), /Extra tank count must be at least 0/);
});

test('job presets are usable and the two-tank job is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const buried = JOB_PRESETS[2];
  assert.equal(special.access, 'exposed');
  assert.equal(special.extraTankCount, 0);
  assert.equal(buried.access, 'buried');
  assert.equal(buried.replaceBaffles, true);
  assert.ok(buried.hoseFeet > special.hoseFeet);
  assert.ok(buried.extraTankGallons > special.extraTankGallons);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of ACCESS_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the access extras', () => {
  const result = calculateBid(twoTank());
  const text = formatBidSummary(result, 'Two-tank buried pump');
  assert.match(text, /SEPTIC PUMPING \/ SERVICE BID/);
  assert.match(text, /2000 gallons/);
  assert.match(text, /Buried lid/);
  assert.match(text, /baffle replacement included/);
  assert.match(text, /2 risers included/);
  assert.match(text, /written inspection included/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
});
