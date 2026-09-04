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
  includedElevationSf: 1600,
  includedStories: 1,
  includedTrimFeet: 80,
  hoursBaseSetup: 6,
  hoursPer100Sf: 2.4,
  hoursPerExtraStory: 6,
  hoursScrapePer100: 1.8,
  hoursPrimePer100: 0.8,
  hoursTrimPer10Feet: 0.7,
  hoursPerShutter: 0.2,
  hoursOccupied: 2,
  hoursHardAccess: 5,
  siteHours: 1,
  finishCoats: 2,
  paintCoverage: 350,
  paintCostPerGallon: 48,
  primerCostPerGallon: 38,
  caulkPer10TrimFeet: 3.5,
  hourlyWage: 36,
  burdenRate: 32,
  travelAndEquipment: 85,
  overheadRate: 16,
  targetMargin: 28,
});

const ranch = () => ({
  ...rates(),
  jobType: 'repaint',
  elevationSf: 1800,
  stories: 1,
  trimFeet: 90,
  shutters: 0,
  scrape: false,
  prime: false,
  occupied: false,
  hardAccess: false,
});

const colonial = () => ({
  ...rates(),
  jobType: 'repaint',
  elevationSf: 2800,
  stories: 2,
  trimFeet: 240,
  shutters: 12,
  scrape: false,
  prime: false,
  occupied: true,
  hardAccess: true,
});

const peeling = () => ({
  ...rates(),
  jobType: 'elastomeric',
  elevationSf: 3400,
  stories: 2,
  trimFeet: 200,
  shutters: 8,
  scrape: true,
  prime: true,
  occupied: true,
  hardAccess: true,
  hoursBaseSetup: 7.5,
  paintCostPerGallon: 72,
});

test('ranch-special hours come from the base setup plus the extra 200 sf, not from extras', () => {
  const result = calculateBid(ranch());
  assert.equal(result.extraStories, 0);
  assert.equal(result.extraSf, 200);
  assert.equal(result.extraTrim, 10);
  assert.equal(result.setupHours, 6);
  assert.equal(result.storyHours, 0);
  assert.ok(Math.abs(result.bodyHours - 4.8) < 1e-9);
  assert.ok(Math.abs(result.trimHours - 0.7) < 1e-9);
  assert.equal(result.scrapeHours, 0);
  assert.equal(result.primeHours, 0);
  assert.equal(result.shutterHours, 0);
  assert.equal(result.occupiedHours, 0);
  assert.equal(result.hardAccessHours, 0);
  assert.equal(result.siteHours, 1);
  assert.equal(result.primerGallons, 0);
});

test('colonial extras do not scale with the ranch house special', () => {
  const result = calculateBid(colonial());
  assert.equal(result.stories, 2);
  assert.equal(result.extraStories, 1);
  assert.equal(result.extraSf, 1200);
  assert.equal(result.extraTrim, 160);
  assert.ok(Math.abs(result.storyHours - 6) < 1e-9);
  assert.ok(Math.abs(result.bodyHours - 28.8) < 1e-9);
  assert.ok(Math.abs(result.trimHours - 11.2) < 1e-9);
  assert.ok(Math.abs(result.shutterHours - 2.4) < 1e-9);
  assert.equal(result.occupiedHours, 2);
  assert.equal(result.hardAccessHours, 5);
  assert.equal(result.scrapeHours, 0);
  // Access + extras outrun the base setup itself — that is the
  // user-visible reason a $3,999 special fails even when the first
  // ranch looks ordinary.
  assert.ok(result.accessHours + result.serviceHours > result.setupHours);
});

test('a two-story colonial prices well above the ranch special despite similar first-story paint', () => {
  const screen = calculateBid(ranch());
  const job = calculateBid(colonial());
  assert.ok(job.price > screen.price * 2.2, 'the colonial is a different job');
  assert.ok(job.totalHours > screen.totalHours * 3);
  assert.ok(job.pricePerSf > screen.pricePerSf * 1.4);
});

test('price stacks burden, paint, overhead, then margin as a share of price', () => {
  const result = calculateBid(ranch());
  assert.ok(Math.abs(result.loadedWage - 36 * 1.32) < 1e-9);

  const expectedHours = 6 + 4.8 + 0.7 + 1;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 36 * 1.32) < 1e-9);

  const expectedFinish = 1800 * 2 / 350 * 48;
  const expectedCaulk = 9 * 3.5;
  assert.ok(Math.abs(result.finishPaint - expectedFinish) < 1e-9);
  assert.ok(Math.abs(result.caulkMaterial - expectedCaulk) < 1e-9);
  assert.ok(Math.abs(result.materialCost - (expectedFinish + expectedCaulk)) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 85)) < 1e-9);
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

test('a $3,999 special looks fine on the ranch and loses money on the colonial', () => {
  const ranchBid = calculateBid(ranch());
  const ranchSpecial = calculateBid({ ...ranch(), proposedPrice: 3999 });
  assert.equal(ranchSpecial.proposed.belowBreakEven, false);
  assert.ok(3999 > ranchBid.breakEvenPrice);

  const colonialBid = calculateBid(colonial());
  const colonialSpecial = calculateBid({ ...colonial(), proposedPrice: 3999 });
  assert.equal(colonialSpecial.proposed.belowBreakEven, true);
  assert.ok(colonialSpecial.proposed.profit < 0);
  assert.ok(3999 < colonialBid.breakEvenPrice);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(ranch()).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...ranch(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off scrape, prime, occupied, and hard access drops those hours and primer', () => {
  const full = calculateBid(peeling());
  const stripped = calculateBid({
    ...peeling(),
    scrape: false,
    prime: false,
    occupied: false,
    hardAccess: false,
    shutters: 0,
  });
  assert.equal(stripped.scrapeHours, 0);
  assert.equal(stripped.primeHours, 0);
  assert.equal(stripped.occupiedHours, 0);
  assert.equal(stripped.hardAccessHours, 0);
  assert.equal(stripped.shutterHours, 0);
  assert.equal(stripped.primerGallons, 0);
  assert.equal(stripped.primerPaint, 0);
  assert.ok(stripped.price < full.price);
  // Extra story and extra elevation still fire because the house is unchanged.
  assert.ok(stripped.storyHours > 0);
  assert.ok(stripped.bodyHours > 0);
});

test('a vacant ranch does not bill occupied or hard-access hours even if those hour fields are filled', () => {
  const result = calculateBid({
    ...ranch(),
    hoursOccupied: 2,
    hoursHardAccess: 5,
    occupied: false,
    hardAccess: false,
  });
  assert.equal(result.occupiedHours, 0);
  assert.equal(result.hardAccessHours, 0);
  assert.equal(result.occupied, false);
  assert.equal(result.hardAccess, false);
});

test('scrape and primer hours and gallons only bill when those flags are on', () => {
  const sound = calculateBid({
    ...ranch(),
    hoursScrapePer100: 1.8,
    hoursPrimePer100: 0.8,
    scrape: false,
    prime: false,
  });
  const failing = calculateBid({
    ...ranch(),
    hoursScrapePer100: 1.8,
    hoursPrimePer100: 0.8,
    scrape: true,
    prime: true,
  });
  assert.equal(sound.scrapeHours, 0);
  assert.equal(sound.primeHours, 0);
  assert.equal(sound.primerGallons, 0);
  assert.ok(Math.abs(failing.scrapeHours - 32.4) < 1e-9);
  assert.ok(Math.abs(failing.primeHours - 14.4) < 1e-9);
  assert.ok(Math.abs(failing.primerGallons - 1800 / 350) < 1e-9);
});

test('finish paint bills every elevation square foot; extra-trim hours bill only extras', () => {
  const result = calculateBid(colonial());
  assert.ok(Math.abs(result.finishPaint - 2800 * 2 / 350 * 48) < 1e-9);
  assert.ok(Math.abs(result.trimHours - 16 * 0.7) < 1e-9);
  assert.ok(Math.abs(result.caulkMaterial - 24 * 3.5) < 1e-9);
});

test('suggested job hours match the shipped presets', () => {
  assert.deepEqual(suggestedJobHours('repaint'), {
    hoursBaseSetup: 6, paintCostPerGallon: 48, finishCoats: 2,
  });
  assert.deepEqual(suggestedJobHours('scrape'), {
    hoursBaseSetup: 7.5, paintCostPerGallon: 48, finishCoats: 2,
  });
  assert.deepEqual(suggestedJobHours('bare'), {
    hoursBaseSetup: 8, paintCostPerGallon: 52, finishCoats: 2,
  });
  assert.deepEqual(suggestedJobHours('elastomeric'), {
    hoursBaseSetup: 7.5, paintCostPerGallon: 72, finishCoats: 2,
  });
  assert.throws(() => suggestedJobHours('cabinet'), /Unknown job type/);
});

test('unknown job type is rejected', () => {
  assert.throws(() => calculateBid({ ...ranch(), jobType: 'cabinet' }), /Unknown job type/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...ranch(), stories: 0 }), /Stories must be greater than zero/);
  assert.throws(() => calculateBid({ ...ranch(), elevationSf: 0 }), /Elevation square feet must be greater than zero/);
  assert.throws(() => calculateBid({ ...ranch(), includedElevationSf: 0 }), /Included elevation must be greater than zero/);
  assert.throws(() => calculateBid({ ...ranch(), finishCoats: 0 }), /Finish coats must be greater than zero/);
  assert.throws(() => calculateBid({ ...ranch(), paintCoverage: 0 }), /Paint coverage must be greater than zero/);
  assert.throws(() => calculateBid({ ...ranch(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...ranch(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...ranch(), shutters: -1 }), /Shutters must be at least 0/);
  assert.throws(() => calculateBid({ ...ranch(), elevationSf: -1 }), /Elevation square feet must be at least 0/);
});

test('job presets are usable and the peeling masonry job is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const combo = JOB_PRESETS[3];
  assert.equal(special.jobType, 'repaint');
  assert.equal(special.stories, 1);
  assert.equal(special.scrape, false);
  assert.equal(combo.jobType, 'elastomeric');
  assert.equal(combo.scrape, true);
  assert.ok(combo.elevationSf > special.elevationSf);
  assert.ok(combo.stories > special.stories);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of JOB_TYPE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the access extras', () => {
  const result = calculateBid(colonial());
  const text = formatBidSummary(result, 'Two-story colonial');
  assert.match(text, /EXTERIOR PAINT BID/);
  assert.match(text, /2 stories/);
  assert.match(text, /2800 sf elevation/);
  assert.match(text, /occupied-home protection included/);
  assert.match(text, /hard second-story \/ steep access included/);
  assert.match(text, /12 shutters included/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /36 \/ h/);
});

test('peeling elastomeric job bills scrape, primer, and hard access as their own hours', () => {
  const result = calculateBid(peeling());
  assert.equal(result.extraStories, 1);
  assert.equal(result.extraSf, 1800);
  assert.equal(result.hardAccessHours, 5);
  assert.equal(result.occupiedHours, 2);
  assert.ok(result.scrapeHours > 0);
  assert.ok(result.primeHours > 0);
  assert.ok(result.primerGallons > 0);
  assert.ok(result.accessHours > result.setupHours);
});
