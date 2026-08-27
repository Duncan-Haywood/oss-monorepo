import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedJobHours,
  JOB_PRESETS,
  JOB_TYPE_PRESETS,
} from './calc.mjs';

const rates = () => ({
  includedFeet: 120,
  includedStories: 1,
  includedMiters: 4,
  includedDownspouts: 3,
  hoursBaseSetup: 1.5,
  hoursPerExtraStory: 1.2,
  hoursPerExtra10Feet: 0.35,
  hoursPerExtraMiter: 0.15,
  hoursPerExtraDownspout: 0.25,
  hoursCleanFirstPer10Feet: 0.2,
  hoursFasciaPer10Feet: 0.8,
  hoursOccupied: 0.3,
  hoursSteepRoof: 0.9,
  siteHours: 0.5,
  materialPerFoot: 2.25,
  miterKit: 8,
  downspoutAdapter: 22,
  fasciaBoardPer10Feet: 45,
  cleanDisposal: 35,
  hourlyWage: 36,
  burdenRate: 32,
  travelAndEquipment: 45,
  overheadRate: 16,
  targetMargin: 28,
});

const ranch = () => ({
  ...rates(),
  jobType: 'screen',
  linealFeet: 140,
  stories: 1,
  miters: 4,
  extraDownspouts: 0,
  fasciaRepairFeet: 0,
  cleanFirst: false,
  occupied: false,
  steepRoof: false,
});

const colonial = () => ({
  ...rates(),
  jobType: 'mesh',
  linealFeet: 220,
  stories: 2,
  miters: 12,
  extraDownspouts: 2,
  fasciaRepairFeet: 16,
  cleanFirst: true,
  occupied: true,
  steepRoof: false,
  hoursBaseSetup: 2.4,
  materialPerFoot: 8.5,
});

const reverse = () => ({
  ...rates(),
  jobType: 'reverse',
  linealFeet: 180,
  stories: 2,
  miters: 8,
  extraDownspouts: 0,
  fasciaRepairFeet: 0,
  cleanFirst: false,
  occupied: true,
  steepRoof: true,
  hoursBaseSetup: 2.1,
  materialPerFoot: 6.25,
});

test('ranch-special hours come from the base setup plus the extra 20 feet, not from extras', () => {
  const result = calculateBid(ranch());
  assert.equal(result.extraStories, 0);
  assert.equal(result.extraFeet, 20);
  assert.equal(result.extraMiters, 0);
  assert.equal(result.setupHours, 1.5);
  assert.equal(result.storyHours, 0);
  assert.ok(Math.abs(result.feetHours - 0.7) < 1e-9);
  assert.equal(result.miterHours, 0);
  assert.equal(result.downspoutHours, 0);
  assert.equal(result.cleanHours, 0);
  assert.equal(result.fasciaHours, 0);
  assert.equal(result.occupiedHours, 0);
  assert.equal(result.steepHours, 0);
  assert.equal(result.siteHours, 0.5);
  assert.equal(result.cleanMaterial, 0);
});

test('colonial extras do not scale with the ranch screen special', () => {
  const result = calculateBid(colonial());
  assert.equal(result.stories, 2);
  assert.equal(result.extraStories, 1);
  assert.equal(result.extraFeet, 100);
  assert.equal(result.extraMiters, 8);
  assert.ok(Math.abs(result.storyHours - 1.2) < 1e-9);
  assert.ok(Math.abs(result.feetHours - 3.5) < 1e-9);
  assert.ok(Math.abs(result.miterHours - 1.2) < 1e-9);
  assert.ok(Math.abs(result.downspoutHours - 0.5) < 1e-9);
  assert.ok(Math.abs(result.cleanHours - 4.4) < 1e-9);
  assert.ok(Math.abs(result.fasciaHours - 1.28) < 1e-9);
  assert.equal(result.occupiedHours, 0.3);
  assert.equal(result.steepHours, 0);
  // Access + extras outrun the base setup itself — that is the
  // user-visible reason an $8/ft special fails even when the first
  // ranch looks ordinary.
  assert.ok(result.accessHours + result.serviceHours > result.setupHours);
});

test('a micromesh colonial prices well above the ranch special despite similar first-story gutters', () => {
  const screen = calculateBid(ranch());
  const job = calculateBid(colonial());
  assert.ok(job.price > screen.price * 4, 'the micromesh colonial is a different job');
  assert.ok(job.totalHours > screen.totalHours * 4);
  assert.ok(job.pricePerFoot > screen.pricePerFoot * 2);
});

test('price stacks burden, coil, overhead, then margin as a share of price', () => {
  const result = calculateBid(ranch());
  assert.ok(Math.abs(result.loadedWage - 36 * 1.32) < 1e-9);

  const expectedHours = 1.5 + 0.7 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 36 * 1.32) < 1e-9);

  const expectedMaterials = 140 * 2.25;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 45)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...ranch(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(ranch());
  const scored = calculateBid({ ...ranch(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('an $8/ft special looks fine on the ranch and loses money on the colonial', () => {
  const ranchBid = calculateBid(ranch());
  const ranchSpecial = calculateBid({ ...ranch(), proposedPrice: 8 * 140 });
  assert.equal(ranchSpecial.proposed.belowBreakEven, false);
  assert.ok(8 * 140 > ranchBid.breakEvenPrice);

  const colonialBid = calculateBid(colonial());
  const colonialSpecial = calculateBid({ ...colonial(), proposedPrice: 8 * 220 });
  assert.equal(colonialSpecial.proposed.belowBreakEven, true);
  assert.ok(colonialSpecial.proposed.profit < 0);
  assert.ok(8 * 220 < colonialBid.breakEvenPrice);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(ranch()).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off clean-first, occupied, and steep drops those hours and kits', () => {
  const full = calculateBid(colonial());
  const stripped = calculateBid({
    ...colonial(),
    cleanFirst: false,
    occupied: false,
    steepRoof: false,
    fasciaRepairFeet: 0,
    extraDownspouts: 0,
  });
  assert.equal(stripped.cleanHours, 0);
  assert.equal(stripped.occupiedHours, 0);
  assert.equal(stripped.steepHours, 0);
  assert.equal(stripped.fasciaHours, 0);
  assert.equal(stripped.downspoutHours, 0);
  assert.equal(stripped.cleanMaterial, 0);
  assert.equal(stripped.fasciaMaterial, 0);
  assert.equal(stripped.downspoutMaterial, 0);
  assert.ok(stripped.price < full.price);
  // Extra story, extra feet, and extra miters still fire because the house is unchanged.
  assert.ok(stripped.storyHours > 0);
  assert.ok(stripped.feetHours > 0);
  assert.ok(stripped.miterHours > 0);
});

test('a vacant ranch does not bill occupied or steep hours even if those hour fields are filled', () => {
  const result = calculateBid({ ...ranch(), hoursOccupied: 0.3, hoursSteepRoof: 0.9, occupied: false, steepRoof: false });
  assert.equal(result.occupiedHours, 0);
  assert.equal(result.steepHours, 0);
  assert.equal(result.occupied, false);
  assert.equal(result.steepRoof, false);
});

test('clean-first disposal and hours only bill when the gutters are packed', () => {
  const empty = calculateBid({ ...ranch(), cleanDisposal: 35, hoursCleanFirstPer10Feet: 0.2, cleanFirst: false });
  const packed = calculateBid({ ...ranch(), cleanDisposal: 35, hoursCleanFirstPer10Feet: 0.2, cleanFirst: true });
  assert.equal(empty.cleanMaterial, 0);
  assert.equal(empty.cleanHours, 0);
  assert.equal(packed.cleanMaterial, 35);
  assert.ok(Math.abs(packed.cleanHours - 2.8) < 1e-9);
});

test('coil material bills every lineal foot; miter kits bill only extras', () => {
  const result = calculateBid(colonial());
  assert.ok(Math.abs(result.coilMaterial - 220 * 8.5) < 1e-9);
  assert.ok(Math.abs(result.miterMaterial - 8 * 8) < 1e-9);
  assert.ok(Math.abs(result.downspoutMaterial - 2 * 22) < 1e-9);
  assert.ok(Math.abs(result.fasciaMaterial - 1.6 * 45) < 1e-9);
});

test('suggested job hours match the shipped presets', () => {
  assert.deepEqual(suggestedJobHours('screen'), { hoursBaseSetup: 1.5, materialPerFoot: 2.25 });
  assert.deepEqual(suggestedJobHours('foam'), { hoursBaseSetup: 1.7, materialPerFoot: 3.4 });
  assert.deepEqual(suggestedJobHours('reverse'), { hoursBaseSetup: 2.1, materialPerFoot: 6.25 });
  assert.deepEqual(suggestedJobHours('mesh'), { hoursBaseSetup: 2.4, materialPerFoot: 8.5 });
  assert.throws(() => suggestedJobHours('copper'), /Unknown job type/);
});

test('unknown job type is rejected', () => {
  assert.throws(() => calculateBid({ ...ranch(), jobType: 'copper' }), /Unknown job type/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...ranch(), stories: 0 }), /Stories must be greater than zero/);
  assert.throws(() => calculateBid({ ...ranch(), linealFeet: 0 }), /Lineal feet must be greater than zero/);
  assert.throws(() => calculateBid({ ...ranch(), includedFeet: 0 }), /Included feet must be greater than zero/);
  assert.throws(() => calculateBid({ ...ranch(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...ranch(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...ranch(), extraDownspouts: -1 }), /Extra downspouts must be at least 0/);
  assert.throws(() => calculateBid({ ...ranch(), linealFeet: -1 }), /Lineal feet must be at least 0/);
});

test('job presets are usable and the micromesh job is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const screen = JOB_PRESETS[0];
  const combo = JOB_PRESETS[3];
  assert.equal(screen.jobType, 'screen');
  assert.equal(screen.stories, 1);
  assert.equal(screen.cleanFirst, false);
  assert.equal(combo.jobType, 'mesh');
  assert.equal(combo.cleanFirst, true);
  assert.ok(combo.linealFeet > screen.linealFeet);
  assert.ok(combo.stories > screen.stories);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of JOB_TYPE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the access extras', () => {
  const result = calculateBid(colonial());
  const text = formatBidSummary(result, 'Micromesh colonial');
  assert.match(text, /GUTTER GUARD INSTALL BID/);
  assert.match(text, /2 stories/);
  assert.match(text, /220 lf/);
  assert.match(text, /clean-first of packed gutters included/);
  assert.match(text, /occupied-home access included/);
  assert.match(text, /16 ft of fascia repair included/);
  assert.doesNotMatch(text, /36/);
  assert.doesNotMatch(text, /wage/i);
});

test('reverse-curve steep-roof job bills steep access as its own hours', () => {
  const result = calculateBid(reverse());
  assert.equal(result.extraStories, 1);
  assert.equal(result.extraFeet, 60);
  assert.equal(result.extraMiters, 4);
  assert.equal(result.steepHours, 0.9);
  assert.equal(result.occupiedHours, 0.3);
  assert.equal(result.cleanHours, 0);
  assert.ok(result.accessHours > result.setupHours);
});
