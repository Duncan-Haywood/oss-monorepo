import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedSystemKit,
  suggestedAccessKit,
  JOB_PRESETS,
  SYSTEM_PRESETS,
  STORY_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursPerCrackLf: 0.12,
  hoursPerDelamSf: 0.18,
  hoursPerTearoffSf: 0.32,
  hoursScaffold: 4,
  hoursExtraStory: 3,
  hoursPerWindowFlash: 1.5,
  hoursColorMatch: 2.5,
  hoursMoisture: 3,
  hoursPerCaulkLf: 0.04,
  siteHours: 2,
  stuccoMixPerSf: 2.8,
  mixPerCrackLf: 1.1,
  meshPerSf: 0.65,
  flashKitEach: 45,
  colorTintCost: 85,
  scaffoldRental: 280,
  moistureKit: 40,
  caulkPerLf: 1.2,
  dumpsterCost: 175,
  permitFee: 75,
  hourlyWage: 38,
  burdenRate: 32,
  travelAndEquipment: 95,
  overheadRate: 16,
  targetMargin: 28,
});

const brochure = () => ({
  ...rates(),
  system: 'hard-coat',
  stories: '1',
  crackLf: 40,
  delamSf: 0,
  tearoffSf: 0,
  windowFlashes: 0,
  caulkLf: 20,
  colorMatch: false,
  moistureInvestigation: false,
});

const eifsSecondStory = () => ({
  ...rates(),
  ...suggestedSystemKit('eifs'),
  ...suggestedAccessKit('2'),
  system: 'eifs',
  stories: '2',
  crackLf: 20,
  delamSf: 40,
  tearoffSf: 180,
  windowFlashes: 4,
  caulkLf: 60,
  colorMatch: true,
  moistureInvestigation: true,
});

test('brochure crack hours come from linear feet, not from a blended square-foot rate', () => {
  const result = calculateBid(brochure());
  assert.ok(Math.abs(result.crackHours - 40 * 0.12) < 1e-9);
  assert.equal(result.delamHours, 0);
  assert.equal(result.tearoffHours, 0);
  assert.equal(result.scaffoldHours, 0);
  assert.equal(result.extraStoryHours, 0);
  assert.equal(result.accessHours, 0);
  assert.equal(result.colorHours, 0);
  assert.equal(result.moistureHours, 0);
  assert.equal(result.flashHours, 0);
  assert.ok(Math.abs(result.caulkHours - 20 * 0.04) < 1e-9);
  assert.equal(result.repairSf, 0);
  assert.equal(result.pricePerRepairSf, null);
  assert.ok(result.pricePerCrackLf > 0);
});

test('second-story EIFS extras do not scale with a blended repair square footage', () => {
  const result = calculateBid(eifsSecondStory());
  assert.ok(Math.abs(result.crackHours - 20 * 0.12) < 1e-9);
  assert.ok(Math.abs(result.delamHours - 40 * 0.18) < 1e-9);
  assert.ok(Math.abs(result.tearoffHours - 180 * 0.42) < 1e-9);
  assert.equal(result.scaffoldHours, 4);
  assert.equal(result.extraStoryHours, 0);
  assert.equal(result.accessHours, 4);
  assert.ok(Math.abs(result.flashHours - 6) < 1e-9);
  assert.equal(result.colorHours, 2.5);
  assert.equal(result.moistureHours, 3);
  assert.equal(result.repairSf, 220);
  // Access + extras outrun a first-story crack patch — that is the
  // user-visible reason a per-square-foot quote fails even when the
  // wall area looks ordinary.
  assert.ok(result.accessHours + result.extraHours > result.siteHours);
  assert.ok(result.tearoffHours > result.delamHours);
});

test('a second-story EIFS tear-off prices well above the brochure crack patch', () => {
  const patch = calculateBid(brochure());
  const tearoff = calculateBid(eifsSecondStory());
  assert.ok(tearoff.price > patch.price * 6, 'the EIFS job is a different job');
  assert.ok(tearoff.totalHours > patch.totalHours * 6);
  assert.ok(tearoff.pricePerRepairSf > 0);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochure());
  assert.equal(result.loadedWage, 38 * 1.32);
  const direct = result.laborCost + result.materialCost + 95;
  assert.ok(Math.abs(result.overhead - direct * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('a first-story job does not bill scaffold hours or rental', () => {
  const result = calculateBid({ ...brochure(), hoursScaffold: 4, scaffoldRental: 280 });
  assert.equal(result.scaffoldHours, 0);
  assert.equal(result.scaffoldMaterial, 0);
});

test('a third-story gable adds extra-story hours on top of scaffold', () => {
  const result = calculateBid({
    ...rates(),
    ...suggestedSystemKit('hard-coat'),
    ...suggestedAccessKit('3'),
    system: 'hard-coat',
    stories: '3',
    tearoffSf: 400,
    windowFlashes: 2,
    caulkLf: 80,
    colorMatch: true,
  });
  assert.equal(result.scaffoldHours, 6);
  assert.equal(result.extraStoryHours, 3);
  assert.equal(result.accessHours, 9);
  assert.equal(result.scaffoldMaterial, 420);
  assert.equal(result.dumpsterMaterial, 175);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(eifsSecondStory());
  const scored = calculateBid({ ...eifsSecondStory(), proposedPrice: bid.totalCost - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('a proposed price at the bid keeps the target margin', () => {
  const bid = calculateBid(brochure());
  const scored = calculateBid({ ...brochure(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochure()).proposed, null);
  assert.equal(calculateBid({ ...brochure(), proposedPrice: '' }).proposed, null);
});

test('zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...brochure(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('target margin at or above 100% is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), targetMargin: 100 }), /less than 100/);
});

test('an empty takeoff is rejected rather than priced as free', () => {
  assert.throws(
    () => calculateBid({ ...rates(), system: 'hard-coat', stories: '1' }),
    /Add crack feet/,
  );
});

test('unknown system or story count is rejected', () => {
  assert.throws(() => calculateBid({ ...brochure(), system: 'adobe' }), /Unknown stucco system/);
  assert.throws(() => calculateBid({ ...brochure(), stories: '4' }), /Unknown story count/);
});

test('suggested kits follow the wall system and the stories', () => {
  assert.equal(suggestedSystemKit('eifs').hoursPerTearoffSf, 0.42);
  assert.ok(suggestedSystemKit('eifs').stuccoMixPerSf > suggestedSystemKit('hard-coat').stuccoMixPerSf);
  assert.equal(suggestedAccessKit('1').hoursScaffold, 0);
  assert.equal(suggestedAccessKit('2').scaffoldRental, 280);
  assert.equal(suggestedAccessKit('3').hoursExtraStory, 3);
  assert.throws(() => suggestedSystemKit('adobe'), /Unknown/);
  assert.throws(() => suggestedAccessKit('4'), /Unknown/);
});

test('job presets cover the brochure special and the second-story EIFS loss', () => {
  assert.equal(JOB_PRESETS.length, 4);
  assert.ok(JOB_PRESETS[0].label.toLowerCase().includes('brochure'));
  assert.equal(JOB_PRESETS[2].system, 'eifs');
  assert.equal(JOB_PRESETS[2].stories, '2');
  assert.equal(JOB_PRESETS[2].moistureInvestigation, true);
  assert.equal(SYSTEM_PRESETS.length, 3);
  assert.equal(STORY_PRESETS.length, 3);
});

test('summary names the system and omits wages', () => {
  const text = formatBidSummary(calculateBid(eifsSecondStory()), JOB_PRESETS[2].label);
  assert.match(text, /STUCCO \/ EIFS REPAIR BID/);
  assert.match(text, /EIFS/);
  assert.match(text, /Two stories/);
  assert.match(text, /moisture investigation included/);
  assert.match(text, /not a stucco specification/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
});

test('non-numeric inputs are rejected with the field name', () => {
  assert.throws(() => calculateBid({ ...brochure(), crackLf: 'wide' }), /Crack linear feet/);
  assert.throws(() => calculateBid({ ...brochure(), hourlyWage: -1 }), /at least 0/);
});
