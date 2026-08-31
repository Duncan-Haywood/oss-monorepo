import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedPitchMultiplier,
  suggestedPlanSf,
  suggestedRoofSf,
  suggestedSquares,
  suggestedHipValleyWastePct,
  suggestedPanelSquares,
  suggestedTearOffSquares,
  suggestedPanelKit,
  suggestedTearOffKit,
  suggestedStoryKit,
  JOB_PRESETS,
  PANEL_PRESETS,
  PITCH_PRESETS,
  TEAROFF_PRESETS,
  STORY_PRESETS,
} from './calc.mjs';

const coupon = () => ({
  panel: 'exposed',
  pitch: '4',
  tearoff: 'overlay',
  stories: '1',
  lengthFeet: 40,
  widthFeet: 30,
  pitchMultiplier: 1.054,
  roofSf: 1264.8,
  squares: 12.648,
  wastePct: 8,
  hipValleyWastePct: 0,
  panelSquares: 13.65984,
  tearOffSquares: 0,
  ridgeLf: 40,
  hipLf: 0,
  valleyLf: 0,
  rakeLf: 60,
  eaveLf: 80,
  snowGuardCount: 0,
  bootCount: 4,
  hoursTrip: 3,
  hoursPerSquare: 1.6,
  extraHoursPerSquare: 0,
  hoursTearoffPerSquare: 0,
  hoursPerTrimLf: 0.08,
  hoursPerSnowGuard: 0.12,
  hoursPerBoot: 0.35,
  seamerHours: 5,
  hoursIceAndWater: 2.5,
  siteHours: 0.8,
  panelPerSquare: 195,
  underlayPerSquare: 38,
  iceAndWaterPerSquare: 55,
  ridgePerLf: 9,
  hipPerLf: 11,
  valleyPerLf: 14,
  rakePerLf: 7,
  eavePerLf: 6,
  snowGuardEach: 18,
  bootEach: 42,
  fastenerLump: 185,
  dumpsterPerSquare: 22,
  seamerFee: 375,
  mobilizationFee: 350,
  permitFee: 425,
  hourlyWage: 36,
  burdenRate: 32,
  travelAndEquipment: 160,
  overheadRate: 15,
  targetMargin: 25,
  includeIceAndWater: false,
  includePermit: false,
});

test('pitch turns plan square feet into roof square feet the coupon already used', () => {
  assert.equal(suggestedPitchMultiplier('4'), 1.054);
  assert.equal(suggestedPitchMultiplier('6'), 1.118);
  assert.equal(suggestedPitchMultiplier('8'), 1.202);
  assert.equal(suggestedPitchMultiplier('10'), 1.302);
  assert.equal(suggestedPitchMultiplier('12'), 1.414);
  assert.equal(suggestedPlanSf(40, 30), 1200);
  assert.equal(suggestedRoofSf(40, 30, '4'), 1264.8);
  assert.ok(Math.abs(suggestedSquares(40, 30, '4') - 12.648) < 1e-9);
});

test('a 50×40 at 10/12 is 26.04 squares, not the 20 the plan counted', () => {
  assert.equal(suggestedPlanSf(50, 40), 2000);
  assert.equal(suggestedRoofSf(50, 40, '10'), 2604);
  assert.ok(Math.abs(suggestedSquares(50, 40, '10') - 26.04) < 1e-9);
});

test('hips and valleys add waste the square special cannot see', () => {
  assert.equal(suggestedHipValleyWastePct(0, 0), 0);
  assert.equal(suggestedHipValleyWastePct(20, 0), 2);
  assert.equal(suggestedHipValleyWastePct(48, 36), 8.4);
  assert.equal(suggestedHipValleyWastePct(200, 200), 12);
});

test('panel squares include kit waste; overlay tear-off is zero', () => {
  assert.ok(Math.abs(suggestedPanelSquares(12.648, 8, 0) - 13.65984) < 1e-9);
  assert.equal(suggestedTearOffSquares(12.648, 'overlay'), 0);
  assert.equal(suggestedTearOffSquares(12.648, 'tear-off'), 12.648);
  assert.equal(suggestedTearOffSquares(26.04, 'tear-off'), 26.04);
});

test('the $950/square coupon still clears the ranch overlay, and fails on the 10/12 tear-off', () => {
  const ranch = calculateBid(coupon());
  assert.equal(ranch.planSf, 1200);
  assert.equal(ranch.squares, 12.648);
  assert.equal(ranch.tearOffSquares, 0);
  assert.equal(ranch.seamerLaborHours, 0);
  assert.ok(ranch.pricePerSquare > 400 && ranch.pricePerSquare < 950, `ranch is ${ranch.pricePerSquare}/sq`);
  assert.ok(ranch.price < 950 * ranch.squares, 'the $950/square coupon still clears the ranch overlay');

  const steep = calculateBid({
    ...coupon(),
    panel: 'mechanical-lock',
    pitch: '10',
    tearoff: 'tear-off',
    stories: '2',
    lengthFeet: 50,
    widthFeet: 40,
    pitchMultiplier: 1.302,
    roofSf: 2604,
    squares: 26.04,
    wastePct: 12,
    hipValleyWastePct: 8.4,
    panelSquares: 26.04 * 1.204,
    tearOffSquares: 26.04,
    ridgeLf: 30,
    hipLf: 48,
    valleyLf: 36,
    rakeLf: 80,
    eaveLf: 100,
    snowGuardCount: 48,
    bootCount: 8,
    hoursPerSquare: 3.2,
    extraHoursPerSquare: 0.4,
    hoursTearoffPerSquare: 0.85,
    seamerHours: 5,
    panelPerSquare: 445,
    includeIceAndWater: true,
    includePermit: true,
  });
  assert.equal(steep.planSf, 2000);
  assert.equal(steep.squares, 26.04);
  assert.equal(steep.tearOffSquares, 26.04);
  assert.equal(steep.seamerLaborHours, 5);
  assert.ok(steep.price > ranch.price);
  const couponPrice = 950 * 26.04;
  assert.ok(steep.price > couponPrice, `mechanical-lock tear-off ${steep.price} should beat a $950/sq coupon of ${couponPrice}`);
});

test('standing seam on the same ranch is a different job than 5V', () => {
  const exposed = calculateBid(coupon());
  const snap = calculateBid({
    ...coupon(),
    panel: 'snap-lock',
    wastePct: 10,
    panelSquares: 12.648 * 1.10,
    hoursPerSquare: 2.4,
    panelPerSquare: 355,
  });
  const mechanical = calculateBid({
    ...coupon(),
    panel: 'mechanical-lock',
    wastePct: 12,
    panelSquares: 12.648 * 1.12,
    hoursPerSquare: 3.2,
    panelPerSquare: 445,
    seamerHours: 5,
  });
  assert.ok(snap.panelHours > exposed.panelHours);
  assert.ok(snap.panelMaterial > exposed.panelMaterial);
  assert.ok(snap.price > exposed.price);
  assert.ok(mechanical.seamerLaborHours > 0);
  assert.ok(mechanical.seamerMaterial > 0);
  assert.equal(exposed.seamerLaborHours, 0);
  assert.equal(exposed.seamerMaterial, 0);
  assert.ok(mechanical.price > snap.price);
  assert.ok(mechanical.panelShareOfDirect > 20, `panels are ${mechanical.panelShareOfDirect.toFixed(1)}% of direct`);
});

test('tear-off and two-story hours never appear in the overlay coupon', () => {
  const overlay = calculateBid(coupon());
  const torn = calculateBid({
    ...coupon(),
    tearoff: 'tear-off',
    tearOffSquares: 12.648,
    hoursTearoffPerSquare: 0.85,
  });
  const twoStory = calculateBid({
    ...coupon(),
    stories: '2',
    extraHoursPerSquare: 0.4,
  });
  assert.equal(overlay.tearOffHours, 0);
  assert.ok(torn.tearOffHours > 0);
  assert.ok(torn.dumpsterMaterial > 0);
  assert.ok(torn.price > overlay.price);
  assert.ok(twoStory.storyHours > overlay.storyHours);
  assert.ok(twoStory.price > overlay.price);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(coupon());
  assert.equal(result.loadedWage, 36 * 1.32);

  const trimLf = 40 + 0 + 0 + 60 + 80;
  const expectedHours = 3 + 13.65984 * 1.6 + 0 + 0 + trimLf * 0.08 + 0 + 4 * 0.35 + 0 + 0 + 0.8;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);

  const labor = expectedHours * 36 * 1.32;
  const material = 13.65984 * 195 + 12.648 * 38 + 40 * 9 + 60 * 7 + 80 * 6 + 4 * 42 + 185;
  const soft = 160 + 350 + 0 + 0;
  const direct = labor + material + soft;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('ice-and-water, permit, and seamer stay off until the flags and panel require them', () => {
  const off = calculateBid(coupon());
  assert.equal(off.iceHours, 0);
  assert.equal(off.iceMaterial, 0);
  assert.equal(off.permitMaterial, 0);
  assert.equal(off.seamerLaborHours, 0);
  assert.equal(off.seamerMaterial, 0);

  const on = calculateBid({
    ...coupon(),
    includeIceAndWater: true,
    includePermit: true,
    panel: 'mechanical-lock',
    hoursPerSquare: 3.2,
    panelPerSquare: 445,
  });
  assert.equal(on.iceHours, 2.5);
  assert.ok(on.iceMaterial > 0);
  assert.equal(on.permitMaterial, 425);
  assert.equal(on.seamerLaborHours, 5);
  assert.equal(on.seamerMaterial, 375);
  assert.ok(on.price > off.price);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...coupon(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(coupon());
  const scored = calculateBid({ ...coupon(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed $950/square coupon on the ranch is scored, and a lowball is flagged', () => {
  const bid = calculateBid(coupon());
  const couponBid = calculateBid({ ...coupon(), proposedPrice: 950 * 12.648 });
  assert.equal(couponBid.proposed.belowBreakEven, false);
  assert.ok(couponBid.proposed.price > bid.breakEvenPrice);

  const scored = calculateBid({ ...coupon(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(coupon()).proposed, null);
  assert.equal(calculateBid({ ...coupon(), proposedPrice: '' }).proposed, null);
});

test('unknown panel, pitch, tear-off, or stories is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), panel: 'tile' }), /Unknown panel/);
  assert.throws(() => calculateBid({ ...coupon(), pitch: '3' }), /Unknown pitch/);
  assert.throws(() => calculateBid({ ...coupon(), tearoff: 'partial' }), /Unknown tear-off/);
  assert.throws(() => calculateBid({ ...coupon(), stories: '4' }), /Unknown stories/);
});

test('non-finite and zero-critical inputs are rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), lengthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), lengthFeet: Number.NaN }), /must be a number/);
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 100 }), /less than 100/);
});

test('suggested kits match the shipped panel, tear-off, and story lists', () => {
  assert.equal(suggestedPanelKit('exposed').panelPerSquare, 195);
  assert.equal(suggestedPanelKit('snap-lock').hoursPerSquare, 2.4);
  assert.equal(suggestedPanelKit('mechanical-lock').seamerHours, 5);
  assert.equal(suggestedTearOffKit('overlay').dumpsterPerSquare, 0);
  assert.equal(suggestedTearOffKit('tear-off').hoursPerSquare, 0.85);
  assert.equal(suggestedStoryKit('1').extraHoursPerSquare, 0);
  assert.equal(suggestedStoryKit('2').extraHoursPerSquare, 0.4);
  assert.equal(suggestedStoryKit('3').extraHoursPerSquare, 0.85);
  for (const preset of PANEL_PRESETS) {
    assert.ok(Number.isFinite(suggestedPanelKit(preset.id).hoursPerSquare));
  }
  for (const preset of TEAROFF_PRESETS) {
    assert.ok(Number.isFinite(suggestedTearOffKit(preset.id).hoursPerSquare));
  }
  for (const preset of STORY_PRESETS) {
    assert.ok(Number.isFinite(suggestedStoryKit(preset.id).extraHoursPerSquare));
  }
  for (const preset of PITCH_PRESETS) {
    assert.ok(suggestedPitchMultiplier(preset.id) > 1);
  }
});

test('job presets are loadable without changing the arithmetic', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const first = JOB_PRESETS[0];
  const result = calculateBid({
    ...coupon(),
    panel: first.panel,
    pitch: first.pitch,
    tearoff: first.tearoff,
    stories: first.stories,
    lengthFeet: first.lengthFeet,
    widthFeet: first.widthFeet,
  });
  assert.equal(result.planSf, 1200);
  assert.equal(result.squares, 12.648);
});

test('the customer-facing summary omits wages and names the panels and squares', () => {
  const text = formatBidSummary(calculateBid(coupon()));
  assert.match(text, /METAL ROOF \/ STANDING SEAM BID/);
  assert.match(text, /40×30/);
  assert.match(text, /panel/i);
  assert.match(text, /not a construction specification/);
  assert.doesNotMatch(text, /\$36/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /wage/i);
});
