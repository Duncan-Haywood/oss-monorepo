import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedProfileKit,
  suggestedStoryKit,
  JOB_PRESETS,
  PROFILE_PRESETS,
  STORY_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursTrip: 1.25,
  hoursPerGutterFoot: 0.035,
  hoursPerStoryFoot: 0,
  hoursInsideMiter: 0.5,
  hoursOutsideMiter: 0.3,
  hoursPerExtraDownspout: 0.65,
  hoursPerExtraDownspoutFoot: 0.08,
  hoursPerFasciaFoot: 0.22,
  hoursPerTearOffFoot: 0.018,
  hoursPerSteepFoot: 0.012,
  siteHours: 0.75,
  gutterPerFoot: 3.4,
  profilePremiumPerFoot: 0,
  downspoutOutletCost: 38,
  downspoutPerFoot: 4.2,
  insideMiterCost: 18,
  outsideMiterCost: 12,
  fasciaPerFoot: 8.5,
  tearOffDumpPerFoot: 0.85,
  hangerPerFoot: 1.1,
  permitFee: 0,
  hourlyWage: 38,
  burdenRate: 32,
  travelAndEquipment: 95,
  overheadRate: 16,
  targetMargin: 32,
});

const brochure = () => ({
  ...rates(),
  profile: 'five-alum',
  stories: 'one',
  gutterFeet: 140,
  insideMiters: 0,
  outsideMiters: 4,
  downspouts: 2,
  downspoutFeet: 20,
  includedDownspouts: 2,
  includedDownspoutFeetPerDrop: 10,
  fasciaFeet: 0,
  tearOff: false,
  steepAccess: false,
  addHiddenHangers: false,
});

const moneyLoser = () => ({
  ...rates(),
  profile: 'six-alum',
  stories: 'two',
  gutterFeet: 220,
  insideMiters: 2,
  outsideMiters: 6,
  downspouts: 4,
  downspoutFeet: 48,
  includedDownspouts: 2,
  includedDownspoutFeetPerDrop: 10,
  fasciaFeet: 40,
  hoursPerGutterFoot: 0.04,
  hoursPerStoryFoot: 0.018,
  gutterPerFoot: 4.6,
  profilePremiumPerFoot: 1.2,
  tearOff: true,
  steepAccess: false,
  addHiddenHangers: true,
});

test('brochure ranch hours come from the trip, the hang, and four outside miters — not from stories or extras', () => {
  const result = calculateBid(brochure());
  assert.equal(result.tearOff, false);
  assert.equal(result.extraDownspouts, 0);
  assert.equal(result.extraDownspoutFeet, 0);
  assert.equal(result.tripHours, 1.25);
  assert.ok(Math.abs(result.hangHours - 140 * 0.035) < 1e-9);
  assert.equal(result.storyHours, 0);
  assert.ok(Math.abs(result.miterHours - 4 * 0.3) < 1e-9);
  assert.equal(result.dropHours, 0);
  assert.equal(result.fasciaHours, 0);
  assert.equal(result.tearOffHours, 0);
  assert.equal(result.dropMaterial, 0);
  assert.equal(result.fasciaMaterial, 0);
  assert.equal(result.hangerMaterial, 0);
  assert.ok(Math.abs(result.gutterMaterial - 140 * 3.4) < 1e-9);
  assert.ok(Math.abs(result.miterMaterial - 4 * 12) < 1e-9);
});

test('stories, extra drops, inside miters, fascia, tear-off, and hangers do not scale with the trip charge', () => {
  const result = calculateBid(moneyLoser());
  assert.equal(result.tearOff, true);
  assert.equal(result.extraDownspouts, 2);
  assert.equal(result.extraDownspoutFeet, 8);
  assert.ok(Math.abs(result.storyHours - 220 * 0.018) < 1e-9);
  assert.ok(Math.abs(result.miterHours - (2 * 0.5 + 6 * 0.3)) < 1e-9);
  assert.ok(Math.abs(result.dropHours - (2 * 0.65 + 8 * 0.08)) < 1e-9);
  assert.ok(Math.abs(result.fasciaHours - 40 * 0.22) < 1e-9);
  assert.ok(Math.abs(result.tearOffHours - 220 * 0.018) < 1e-9);
  assert.ok(Math.abs(result.gutterMaterial - 220 * (4.6 + 1.2)) < 1e-9);
  assert.ok(Math.abs(result.dropMaterial - (2 * 38 + 8 * 4.2)) < 1e-9);
  assert.ok(Math.abs(result.fasciaMaterial - 40 * 8.5) < 1e-9);
  assert.ok(Math.abs(result.hangerMaterial - 220 * 1.1) < 1e-9);
  assert.ok(result.accessHours + result.packageHours > result.tripHours);
});

test('a two-story fascia job prices well above the brochure special despite the same trip', () => {
  const special = calculateBid(brochure());
  const heavy = calculateBid(moneyLoser());
  assert.equal(special.tripHours, heavy.tripHours);
  assert.ok(heavy.price > special.price * 2, 'the two-story-and-fascia house is a different job');
  assert.ok(heavy.totalHours > special.totalHours * 1.8);
  assert.ok(heavy.pricePerGutterFoot > 0);
  assert.ok(heavy.materialCost > special.materialCost);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.loadedWage - 38 * 1.32) < 1e-9);

  const expectedHours = 1.25 + 140 * 0.035 + 4 * 0.3 + 0.75;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 38 * 1.32) < 1e-9);

  const expectedMaterials = 140 * 3.4 + 4 * 12;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 95)) < 1e-9);
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

test('turning off extras, stories, and six-inch premium drops those hours and kits', () => {
  const full = calculateBid(moneyLoser());
  const stripped = calculateBid({
    ...moneyLoser(),
    profile: 'five-alum',
    stories: 'one',
    hoursPerGutterFoot: 0.035,
    hoursPerStoryFoot: 0,
    gutterPerFoot: 3.4,
    profilePremiumPerFoot: 0,
    gutterFeet: 140,
    insideMiters: 0,
    outsideMiters: 4,
    downspouts: 2,
    downspoutFeet: 20,
    fasciaFeet: 0,
    tearOff: false,
    addHiddenHangers: false,
  });
  assert.equal(stripped.storyHours, 0);
  assert.equal(stripped.dropHours, 0);
  assert.equal(stripped.fasciaHours, 0);
  assert.equal(stripped.tearOffHours, 0);
  assert.equal(stripped.hangerMaterial, 0);
  assert.ok(stripped.price < full.price);
  assert.equal(full.extraDownspouts, 2);
  assert.ok(full.fasciaMaterial > 0);
});

test('a copper hang does not bill hidden hangers or extra drops when those flags are off', () => {
  const result = calculateBid({
    ...brochure(),
    profile: 'copper',
    hoursPerGutterFoot: 0.055,
    gutterPerFoot: 18,
    hoursPerExtraDownspout: 0.65,
    addHiddenHangers: false,
  });
  assert.equal(result.hangerMaterial, 0);
  assert.equal(result.dropHours, 0);
  assert.ok(Math.abs(result.hangHours - 140 * 0.055) < 1e-9);
  assert.ok(Math.abs(result.gutterMaterial - 140 * 18) < 1e-9);
});

test('a shorter downspout run than the included footage still prices — extra footage is zero', () => {
  const result = calculateBid({ ...brochure(), downspoutFeet: 12 });
  assert.equal(result.extraDownspoutFeet, 0);
  assert.equal(result.dropHours, 0);
});

test('suggested kits match the shipped presets', () => {
  assert.deepEqual(suggestedProfileKit('five-alum'), {
    gutterPerFoot: 3.4, hoursPerGutterFoot: 0.035, profilePremiumPerFoot: 0,
  });
  assert.deepEqual(suggestedProfileKit('six-alum'), {
    gutterPerFoot: 4.6, hoursPerGutterFoot: 0.04, profilePremiumPerFoot: 1.2,
  });
  assert.deepEqual(suggestedProfileKit('copper'), {
    gutterPerFoot: 18, hoursPerGutterFoot: 0.055, profilePremiumPerFoot: 0,
  });
  assert.deepEqual(suggestedStoryKit('one'), { hoursPerStoryFoot: 0 });
  assert.deepEqual(suggestedStoryKit('two'), { hoursPerStoryFoot: 0.018 });
  assert.deepEqual(suggestedStoryKit('three'), { hoursPerStoryFoot: 0.032 });
  assert.throws(() => suggestedProfileKit('steel'), /Unknown gutter profile/);
  assert.throws(() => suggestedStoryKit('four'), /Unknown story count/);
});

test('unknown profile or story count is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), profile: 'steel' }), /Unknown gutter profile/);
  assert.throws(() => calculateBid({ ...brochure(), stories: 'four' }), /Unknown story count/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...brochure(), gutterFeet: -1 }), /Gutter footage must be at least 0/);
});

test('job presets are usable and the two-story house is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const special = JOB_PRESETS[0];
  const heavy = JOB_PRESETS[2];
  assert.equal(special.profile, 'five-alum');
  assert.equal(special.stories, 'one');
  assert.equal(heavy.profile, 'six-alum');
  assert.equal(heavy.stories, 'two');
  assert.ok(heavy.gutterFeet > special.gutterFeet);
  assert.equal(heavy.tearOff, true);
  assert.ok(heavy.insideMiters > special.insideMiters);
  assert.ok(heavy.fasciaFeet > 0);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of [...PROFILE_PRESETS, ...STORY_PRESETS]) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the corners and extras', () => {
  const result = calculateBid(moneyLoser());
  const text = formatBidSummary(result, '2-story colonial fascia and tear-off');
  assert.match(text, /GUTTER INSTALL BID/);
  assert.match(text, /220 ft/);
  assert.match(text, /6" K-style aluminum/);
  assert.match(text, /Two stories/);
  assert.match(text, /inside miter/);
  assert.match(text, /tear-off of the old system included/);
  assert.match(text, /hidden hangers included/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
});
