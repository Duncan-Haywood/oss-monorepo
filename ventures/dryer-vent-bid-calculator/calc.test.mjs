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
  includedStories: 1,
  includedRunFeet: 8,
  includedDryers: 1,
  hoursBaseSetup: 0.75,
  hoursPerExtraStory: 0.45,
  hoursPerExtra10Feet: 0.25,
  hoursPerExtraDryer: 0.55,
  hoursCamera: 0.35,
  hoursFlex: 0.5,
  hoursNest: 0.75,
  hoursOccupied: 0.25,
  siteHours: 0.4,
  brushKit: 18,
  extraRodPer10Feet: 6,
  cameraFee: 45,
  flexKit: 38,
  nestDisposal: 22,
  roofSafetyKit: 55,
  hourlyWage: 38,
  burdenRate: 32,
  travelAndEquipment: 35,
  overheadRate: 16,
  targetMargin: 28,
});

const special = () => ({
  ...rates(),
  jobType: 'wall',
  stories: 1,
  runFeet: 8,
  extraDryers: 0,
  camera: false,
  flexReplace: false,
  nestBlockage: false,
  occupied: false,
});

const roof = () => ({
  ...rates(),
  jobType: 'roof',
  stories: 2,
  runFeet: 28,
  extraDryers: 0,
  camera: true,
  flexReplace: false,
  nestBlockage: false,
  occupied: true,
  hoursBaseSetup: 1.5,
});

const multi = () => ({
  ...rates(),
  jobType: 'multi',
  stories: 2,
  runFeet: 22,
  extraDryers: 2,
  camera: true,
  flexReplace: true,
  nestBlockage: true,
  occupied: true,
  hoursBaseSetup: 1.25,
});

test('wall-special hours come from the base setup, not from extra stories or extra dryers', () => {
  const result = calculateBid(special());
  assert.equal(result.extraStories, 0);
  assert.equal(result.extraFeet, 0);
  assert.equal(result.setupHours, 0.75);
  assert.equal(result.storyHours, 0);
  assert.equal(result.runHours, 0);
  assert.equal(result.dryerHours, 0);
  assert.equal(result.cameraHours, 0);
  assert.equal(result.flexHours, 0);
  assert.equal(result.nestHours, 0);
  assert.equal(result.occupiedHours, 0);
  assert.equal(result.siteHours, 0.4);
  assert.equal(result.roofMaterial, 0);
});

test('roof extras do not scale with the wall-cap special', () => {
  const result = calculateBid(roof());
  assert.equal(result.stories, 2);
  assert.equal(result.extraStories, 1);
  assert.equal(result.extraFeet, 20);
  assert.ok(Math.abs(result.storyHours - 0.45) < 1e-9);
  assert.ok(Math.abs(result.runHours - 0.5) < 1e-9);
  assert.equal(result.cameraHours, 0.35);
  assert.equal(result.occupiedHours, 0.25);
  assert.equal(result.roofMaterial, 55);
  // Access + extras outrun the base setup itself — that is the
  // user-visible reason a $99 special fails even when the first
  // wall cap looks ordinary.
  assert.ok(result.accessHours + result.serviceHours > result.setupHours);
});

test('a roof-cap job prices well above the wall special despite a similar first dryer', () => {
  const wall = calculateBid(special());
  const job = calculateBid(roof());
  assert.equal(wall.dryerCount, 1);
  assert.equal(job.dryerCount, 1);
  assert.ok(job.price > wall.price * 2.5, 'the roof cap is a different job');
  assert.ok(job.totalHours > wall.totalHours * 2);
});

test('price stacks burden, kits, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.ok(Math.abs(result.loadedWage - 38 * 1.32) < 1e-9);

  const expectedHours = 0.75 + 0.4;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);
  assert.ok(Math.abs(result.laborCost - expectedHours * 38 * 1.32) < 1e-9);

  const expectedMaterials = 18;
  assert.ok(Math.abs(result.materialCost - expectedMaterials) < 1e-9);
  assert.ok(Math.abs(result.directCost - (result.laborCost + result.materialCost + 35)) < 1e-9);
  assert.ok(Math.abs(result.overhead - result.directCost * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - result.directCost * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...special(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 20 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: null }).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: 0 }).proposed.price, 0);
});

test('turning off camera, flex, nest, and occupied drops those hours and kits', () => {
  const full = calculateBid(multi());
  const stripped = calculateBid({
    ...multi(),
    camera: false,
    flexReplace: false,
    nestBlockage: false,
    occupied: false,
  });
  assert.equal(stripped.cameraHours, 0);
  assert.equal(stripped.flexHours, 0);
  assert.equal(stripped.nestHours, 0);
  assert.equal(stripped.occupiedHours, 0);
  assert.equal(stripped.cameraMaterial, 0);
  assert.equal(stripped.flexMaterial, 0);
  assert.equal(stripped.nestMaterial, 0);
  assert.ok(stripped.price < full.price);
  // Extra story, extra feet, and extra dryers still fire because the house is unchanged.
  assert.ok(stripped.storyHours > 0);
  assert.ok(stripped.runHours > 0);
  assert.ok(stripped.dryerHours > 0);
});

test('a vacant wall cap does not bill occupied-home hours even if that hour field is filled', () => {
  const result = calculateBid({ ...special(), hoursOccupied: 0.25, occupied: false });
  assert.equal(result.occupiedHours, 0);
  assert.equal(result.occupied, false);
});

test('roof safety kit only bills on a roof-cap job', () => {
  const wall = calculateBid({ ...special(), roofSafetyKit: 55 });
  const job = calculateBid(roof());
  assert.equal(wall.roofMaterial, 0);
  assert.equal(job.roofMaterial, 55);
});

test('suggested job hours match the shipped presets', () => {
  assert.deepEqual(suggestedJobHours('wall'), { hoursBaseSetup: 0.75 });
  assert.deepEqual(suggestedJobHours('two-story'), { hoursBaseSetup: 1.1 });
  assert.deepEqual(suggestedJobHours('roof'), { hoursBaseSetup: 1.5 });
  assert.deepEqual(suggestedJobHours('multi'), { hoursBaseSetup: 1.25 });
  assert.throws(() => suggestedJobHours('attic'), /Unknown job type/);
});

test('unknown job type is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), jobType: 'attic' }), /Unknown job type/);
});

test('inputs that would silently produce a nonsense bid are rejected', () => {
  assert.throws(() => calculateBid({ ...special(), stories: 0 }), /Stories must be greater than zero/);
  assert.throws(() => calculateBid({ ...special(), runFeet: 0 }), /Run feet must be greater than zero/);
  assert.throws(() => calculateBid({ ...special(), includedStories: 0 }), /Included stories must be greater than zero/);
  assert.throws(() => calculateBid({ ...special(), hourlyWage: 'abc' }), /Hourly wage must be a number/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...special(), extraDryers: -1 }), /Extra dryers must be at least 0/);
  assert.throws(() => calculateBid({ ...special(), runFeet: -1 }), /Run feet must be at least 0/);
});

test('job presets are usable and the roof job is not a markup on the special', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const wall = JOB_PRESETS[0];
  const combo = JOB_PRESETS[2];
  assert.equal(wall.jobType, 'wall');
  assert.equal(wall.stories, 1);
  assert.equal(wall.camera, false);
  assert.equal(combo.jobType, 'roof');
  assert.equal(combo.camera, true);
  assert.ok(combo.runFeet > wall.runFeet);
  assert.ok(combo.stories > wall.stories);
});

test('preset catalogs are labeled positive options', () => {
  for (const preset of JOB_TYPE_PRESETS) {
    assert.ok(preset.label.length > 0);
    assert.ok(preset.id.length > 0);
  }
});

test('customer-facing summary omits wages and names the access extras', () => {
  const result = calculateBid(roof());
  const text = formatBidSummary(result, 'Roof-cap clean');
  assert.match(text, /DRYER VENT CLEANING BID/);
  assert.match(text, /2 stories/);
  assert.match(text, /28 ft run/);
  assert.match(text, /camera inspection included/);
  assert.match(text, /occupied-home access included/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
});

test('multi-dryer job bills extra dryers as their own hours', () => {
  const result = calculateBid(multi());
  assert.equal(result.extraDryers, 2);
  assert.equal(result.dryerCount, 3);
  assert.ok(Math.abs(result.dryerHours - 1.1) < 1e-9);
  assert.equal(result.flexHours, 0.5);
  assert.equal(result.nestHours, 0.75);
  assert.equal(result.roofMaterial, 0);
});
