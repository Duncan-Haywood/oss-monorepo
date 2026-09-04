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
  includedSystems: 1,
  includedVents: 10,
  includedReturns: 1,
  includedStories: 1,
  hoursBaseSetup: 2.5,
  hoursPerExtraSystem: 1.6,
  hoursPerExtraVent: 0.12,
  hoursPerExtraReturn: 0.3,
  hoursPerExtraStory: 0.8,
  hoursCrawl: 0.8,
  hoursOccupied: 0.35,
  hoursCoil: 0.85,
  hoursSanitizer: 0.3,
  hoursHeavyDebris: 0.7,
  siteHours: 0.4,
  filterCost: 22,
  consumables: 12,
  sanitizerCost: 18,
  hourlyWage: 32,
  burdenRate: 28,
  travelAndEquipment: 48,
  overheadRate: 16,
  targetMargin: 28,
});

const ranch = () => ({
  ...rates(),
  jobType: 'residential',
  systems: 1,
  vents: 10,
  returns: 1,
  stories: 1,
  crawl: false,
  occupied: false,
  coil: false,
  sanitizer: false,
  heavyDebris: false,
});

const colonial = () => ({
  ...rates(),
  jobType: 'two_system',
  systems: 2,
  vents: 18,
  returns: 3,
  stories: 2,
  crawl: true,
  occupied: true,
  coil: true,
  sanitizer: true,
  heavyDebris: false,
  hoursBaseSetup: 3,
});

const heavy = () => ({
  ...rates(),
  jobType: 'heavy',
  systems: 2,
  vents: 22,
  returns: 3,
  stories: 2,
  crawl: true,
  occupied: true,
  coil: true,
  sanitizer: true,
  heavyDebris: true,
  hoursBaseSetup: 3.2,
  filterCost: 28,
});

test('ranch-special hours come from the base setup, not from extras', () => {
  const result = calculateBid(ranch());
  assert.equal(result.extraSystems, 0);
  assert.equal(result.extraVents, 0);
  assert.equal(result.extraReturns, 0);
  assert.equal(result.extraStories, 0);
  assert.equal(result.setupHours, 2.5);
  assert.equal(result.systemHours, 0);
  assert.equal(result.ventHours, 0);
  assert.equal(result.returnHours, 0);
  assert.equal(result.storyHours, 0);
  assert.equal(result.crawlHours, 0);
  assert.equal(result.coilHours, 0);
  assert.equal(result.sanitizerHours, 0);
  assert.equal(result.heavyHours, 0);
  assert.equal(result.siteHours, 0.4);
  assert.equal(result.sanitizerMaterial, 0);
  assert.equal(result.filterMaterial, 22);
});

test('colonial extras do not scale with the ranch house special', () => {
  const result = calculateBid(colonial());
  assert.equal(result.systems, 2);
  assert.equal(result.extraSystems, 1);
  assert.equal(result.extraVents, 8);
  assert.equal(result.extraReturns, 2);
  assert.equal(result.extraStories, 1);
  assert.ok(Math.abs(result.systemHours - 1.6) < 1e-9);
  assert.ok(Math.abs(result.ventHours - 0.96) < 1e-9);
  assert.ok(Math.abs(result.returnHours - 0.6) < 1e-9);
  assert.ok(Math.abs(result.storyHours - 0.8) < 1e-9);
  assert.equal(result.crawlHours, 0.8);
  assert.equal(result.occupiedHours, 0.35);
  assert.equal(result.coilHours, 0.85);
  assert.equal(result.sanitizerHours, 0.3);
  assert.equal(result.heavyHours, 0);
  // Access + extras outrun the base setup itself — that is the
  // user-visible reason a $299 special fails even when the first
  // ranch looks ordinary.
  assert.ok(result.accessHours + result.serviceHours > result.setupHours);
});

test('a two-system colonial prices well above the ranch special', () => {
  const screen = calculateBid(ranch());
  const job = calculateBid(colonial());
  assert.ok(job.price > screen.price * 2.2, 'the colonial is a different job');
  assert.ok(job.totalHours > screen.totalHours * 2.5);
  assert.ok(job.pricePerVent > screen.pricePerVent);
});

test('price stacks burden, filters, overhead, then margin as a share of price', () => {
  const result = calculateBid(ranch());
  assert.ok(Math.abs(result.loadedWage - 32 * 1.28) < 1e-9);

  const expectedHours = 2.5 + 0.4;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 32 * 1.28) < 1e-9);
  assert.ok(Math.abs(result.materialCost - 34) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 48)) < 1e-9);
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

test('a $299 special looks fine on the ranch and loses money on the colonial', () => {
  const ranchBid = calculateBid(ranch());
  const ranchSpecial = calculateBid({ ...ranch(), proposedPrice: 299 });
  assert.equal(ranchSpecial.proposed.belowBreakEven, false);
  assert.ok(299 > ranchBid.breakEvenPrice);

  const colonialBid = calculateBid(colonial());
  const colonialSpecial = calculateBid({ ...colonial(), proposedPrice: 299 });
  assert.equal(colonialSpecial.proposed.belowBreakEven, true);
  assert.ok(colonialSpecial.proposed.profit < 0);
  assert.ok(299 < colonialBid.breakEvenPrice);
});

test('a $99 lead-gen coupon loses money even on the ranch', () => {
  const ranchSpecial = calculateBid({ ...ranch(), proposedPrice: 99 });
  assert.equal(ranchSpecial.proposed.belowBreakEven, true);
  assert.ok(ranchSpecial.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(ranch()).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off crawl, occupied, coil, sanitizer, and heavy debris drops those hours', () => {
  const full = calculateBid(heavy());
  const stripped = calculateBid({
    ...heavy(),
    crawl: false,
    occupied: false,
    coil: false,
    sanitizer: false,
    heavyDebris: false,
  });
  assert.ok(full.totalHours > stripped.totalHours);
  assert.equal(stripped.crawlHours, 0);
  assert.equal(stripped.coilHours, 0);
  assert.equal(stripped.sanitizerHours, 0);
  assert.equal(stripped.heavyHours, 0);
  assert.equal(stripped.sanitizerMaterial, 0);
  assert.ok(full.sanitizerMaterial > 0);
});

test('filters bill every system; sanitizer bills only when the flag is on', () => {
  const one = calculateBid(ranch());
  const two = calculateBid({ ...ranch(), systems: 2 });
  assert.equal(one.filterMaterial, 22);
  assert.equal(two.filterMaterial, 44);
  assert.equal(one.sanitizerMaterial, 0);
  const fogged = calculateBid({ ...ranch(), sanitizer: true });
  assert.equal(fogged.sanitizerMaterial, 18);
  assert.equal(fogged.sanitizerHours, 0.3);
});

test('rejects unknown job types and non-numeric inputs', () => {
  assert.throws(() => calculateBid({ ...ranch(), jobType: 'furnace_tuneup' }), /Unknown job type/);
  assert.throws(() => calculateBid({ ...ranch(), systems: 0 }), /Systems/);
  assert.throws(() => calculateBid({ ...ranch(), vents: 'nope' }), /Supply vents/);
  assert.throws(() => calculateBid({ ...ranch(), targetMargin: 100 }), /less than 100/);
});

test('suggested hours change with job type', () => {
  assert.deepEqual(suggestedJobHours('residential'), { hoursBaseSetup: 2.5, filterCost: 22 });
  assert.deepEqual(suggestedJobHours('two_system'), { hoursBaseSetup: 3, filterCost: 22 });
  assert.deepEqual(suggestedJobHours('heavy'), { hoursBaseSetup: 3.2, filterCost: 28 });
  assert.deepEqual(suggestedJobHours('commercial'), { hoursBaseSetup: 3.5, filterCost: 32 });
  assert.throws(() => suggestedJobHours('dryer_vent'), /Unknown job type/);
});

test('presets cover the four jobs the landing page starts from', () => {
  assert.equal(JOB_PRESETS.length, 4);
  assert.equal(JOB_TYPE_PRESETS.length, 4);
  assert.equal(JOB_PRESETS[0].systems, 1);
  assert.equal(JOB_PRESETS[2].systems, 2);
  assert.equal(JOB_PRESETS[2].crawl, true);
});

test('summary names systems, vents, stories, and extras, and omits wages', () => {
  const text = formatBidSummary(calculateBid(colonial()), JOB_PRESETS[2].label);
  assert.match(text, /AIR DUCT CLEANING BID/);
  assert.match(text, /2 systems/);
  assert.match(text, /18 supply vents/);
  assert.match(text, /extra system/);
  assert.match(text, /crawl/);
  assert.match(text, /coil/);
  assert.match(text, /sanitizer/);
  assert.doesNotMatch(text, /32/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
});

test('boolean flags accept the string and numeric forms a form posts', () => {
  const checked = calculateBid({ ...ranch(), crawl: 'true', coil: 1, sanitizer: '1' });
  assert.equal(checked.crawl, true);
  assert.equal(checked.coil, true);
  assert.equal(checked.sanitizer, true);
  const off = calculateBid({ ...ranch(), crawl: 'false', coil: 0, sanitizer: '' });
  assert.equal(off.crawl, false);
  assert.equal(off.coil, false);
  assert.equal(off.sanitizer, false);
});
