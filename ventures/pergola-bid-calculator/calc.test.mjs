import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  postsAlong,
  suggestedPostCount,
  suggestedRafterCount,
  suggestedBeamLf,
  suggestedLedgerLf,
  suggestedKneeBraceCount,
  suggestedShadeKit,
  suggestedHeightKit,
  JOB_PRESETS,
  SHADE_PRESETS,
  HEIGHT_PRESETS,
  ATTACHMENT_PRESETS,
} from './calc.mjs';

const coupon = () => ({
  attachment: 'freestanding',
  shade: 'open',
  height: '8',
  widthFeet: 10,
  depthFeet: 10,
  postSpacingFeet: 8,
  rafterSpacingInches: 24,
  postCount: 4,
  rafterCount: 6,
  beamLf: 20,
  ledgerLf: 0,
  kneeBraceCount: 0,
  footingCount: 4,
  hoursTrip: 2.5,
  hoursPerPost: 1.6,
  hoursPer100SfShade: 0,
  hoursPerRafter: 0.25,
  hoursPerBeamLf: 0.12,
  hoursLedger: 1.5,
  hoursKneeBrace: 0.25,
  hoursFan: 1.2,
  hoursDemo: 3,
  hoursSite: 0.6,
  siteHours: 0.5,
  extraHoursPerPost: 0,
  postEach: 85,
  beamPerLf: 22,
  rafterEach: 28,
  shadePerSf: 0,
  footingEach: 55,
  ledgerPerLf: 16,
  hardwareLump: 350,
  kneeBraceEach: 22,
  fanCircuitFee: 275,
  demoFee: 350,
  mobilizationFee: 225,
  permitFee: 250,
  hourlyWage: 32,
  burdenRate: 30,
  travelAndEquipment: 125,
  overheadRate: 15,
  targetMargin: 25,
  includeKneeBraces: false,
  includeFanCircuit: false,
  includePermit: false,
  demoExisting: false,
});

test('posts along a side use floor-plus-one, not a third post on a 12-foot span', () => {
  assert.equal(postsAlong(10, 8), 2);
  assert.equal(postsAlong(12, 8), 2);
  assert.equal(postsAlong(16, 8), 3);
  assert.equal(postsAlong(20, 8), 3);
  assert.equal(postsAlong(24, 8), 4);
});

test('a 10×10 freestanding frame is four posts; a 12×16 is six', () => {
  assert.equal(suggestedPostCount(10, 10, 8, 'freestanding'), 4);
  assert.equal(suggestedPostCount(16, 12, 8, 'freestanding'), 6);
  // Attached 16×12 drops the house-side row: 3 along the house × 1 remaining row.
  assert.equal(suggestedPostCount(16, 12, 8, 'attached'), 3);
});

test('rafters are spaced along the width, not guessed from square feet', () => {
  assert.equal(suggestedRafterCount(10, 24), 6);
  assert.equal(suggestedRafterCount(16, 24), 9);
  assert.equal(suggestedRafterCount(16, 16), 13);
});

test('beam and ledger lineal feet follow attachment, not footprint', () => {
  assert.equal(suggestedBeamLf(10, 10, 8, 'freestanding'), 20);
  assert.equal(suggestedBeamLf(16, 12, 8, 'freestanding'), 32);
  assert.equal(suggestedBeamLf(16, 12, 8, 'attached'), 16);
  assert.equal(suggestedLedgerLf(16, 'attached'), 16);
  assert.equal(suggestedLedgerLf(16, 'freestanding'), 0);
});

test('knee braces start at two per post when the flag is on', () => {
  assert.equal(suggestedKneeBraceCount(4, false), 0);
  assert.equal(suggestedKneeBraceCount(4, true), 8);
  assert.equal(suggestedKneeBraceCount(6, true), 12);
});

test('the $45/sf coupon undercounts posts when the 10×10 special is applied to 12×16', () => {
  const small = calculateBid(coupon());
  assert.equal(small.footprintSf, 100);
  assert.equal(small.postCount, 4);
  assert.equal(small.shadeSf, 0);
  assert.ok(small.pricePerSf > 30 && small.pricePerSf < 45, `open 10×10 is ${small.pricePerSf}/sf`);

  const larger = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    postCount: 6,
    rafterCount: 9,
    beamLf: 32,
    footingCount: 6,
  });
  assert.equal(larger.footprintSf, 192);
  assert.equal(larger.postCount, 6);
  // Same open shade, more posts and more sticks — the coupon still says "$45 × 192".
  assert.ok(larger.price > small.price);
  assert.ok(larger.postCount > small.postCount);
});

test('slat shade on a 12×16 is a real share of direct cost the coupon cannot see', () => {
  const open = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    postCount: 3,
    rafterCount: 9,
    beamLf: 16,
    ledgerLf: 16,
    footingCount: 3,
    attachment: 'attached',
  });
  const slatted = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    postCount: 3,
    rafterCount: 9,
    beamLf: 16,
    ledgerLf: 16,
    footingCount: 3,
    attachment: 'attached',
    shade: 'slats',
    hoursPer100SfShade: 1.8,
    shadePerSf: 5.5,
  });
  assert.equal(open.shadeSf, 0);
  assert.equal(slatted.shadeSf, 192);
  assert.ok(slatted.shadeHours > 3);
  assert.ok(slatted.shadeShareOfDirect > 15, `shade is ${slatted.shadeShareOfDirect.toFixed(1)}% of direct`);
  assert.ok(slatted.price > open.price);
});

test('louvered shade on the same 12×16 is a different job than the open coupon', () => {
  const open = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    postCount: 3,
    rafterCount: 9,
    beamLf: 16,
    ledgerLf: 16,
    footingCount: 3,
    attachment: 'attached',
  });
  const louvered = calculateBid({
    ...coupon(),
    widthFeet: 16,
    depthFeet: 12,
    postCount: 3,
    rafterCount: 9,
    beamLf: 16,
    ledgerLf: 16,
    footingCount: 3,
    attachment: 'attached',
    shade: 'louvered',
    hoursPer100SfShade: 3.2,
    shadePerSf: 18,
  });
  const couponPrice = 45 * 192;
  assert.ok(louvered.price > couponPrice, `louvered ${louvered.price} should beat a $45/sf coupon of ${couponPrice}`);
  assert.ok(louvered.price - open.price > 3000);
});

test('10-foot posts add hours and material the 8-foot special never priced', () => {
  const eight = calculateBid(coupon());
  const ten = calculateBid({
    ...coupon(),
    height: '10',
    extraHoursPerPost: 0.15,
    postEach: 110,
  });
  assert.ok(ten.postHours > eight.postHours);
  assert.ok(ten.postMaterial > eight.postMaterial);
  assert.ok(ten.price > eight.price);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(coupon());
  assert.equal(result.loadedWage, 32 * 1.3);

  const expectedHours = 2.5 + 4 * 1.6 + 0 + 6 * 0.25 + 20 * 0.12 + 0 + 0 + 0 + 0 + 0.6 + 0.5;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);

  const labor = expectedHours * 32 * 1.3;
  const material = 4 * 85 + 20 * 22 + 6 * 28 + 4 * 55 + 350;
  const soft = 125 + 225 + 0;
  const direct = labor + material + soft;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('fan, demo, permit, and ledger stay off until the flags are on', () => {
  const off = calculateBid(coupon());
  assert.equal(off.fanHours, 0);
  assert.equal(off.fanMaterial, 0);
  assert.equal(off.demoHours, 0);
  assert.equal(off.demoMaterial, 0);
  assert.equal(off.permitMaterial, 0);
  assert.equal(off.ledgerHours, 0);
  assert.equal(off.ledgerMaterial, 0);

  const on = calculateBid({
    ...coupon(),
    attachment: 'attached',
    ledgerLf: 10,
    includeFanCircuit: true,
    includePermit: true,
    demoExisting: true,
  });
  assert.equal(on.fanHours, 1.2);
  assert.equal(on.fanMaterial, 275);
  assert.equal(on.demoHours, 3);
  assert.equal(on.demoMaterial, 350);
  assert.equal(on.permitMaterial, 250);
  assert.equal(on.ledgerHours, 1.5);
  assert.equal(on.ledgerMaterial, 160);
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

test('a proposed $45/sf coupon on the open 10×10 is scored, and a lowball is flagged', () => {
  const bid = calculateBid(coupon());
  const couponBid = calculateBid({ ...coupon(), proposedPrice: 45 * 100 });
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

test('unknown attachment, shade, or height is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), attachment: 'gazebo' }), /Unknown attachment/);
  assert.throws(() => calculateBid({ ...coupon(), shade: 'sail' }), /Unknown shade/);
  assert.throws(() => calculateBid({ ...coupon(), height: '14' }), /Unknown height/);
});

test('non-finite and zero-critical inputs are rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), depthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: Number.NaN }), /must be a number/);
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 100 }), /less than 100/);
});

test('suggested kits match the shipped shade and height lists', () => {
  assert.equal(suggestedShadeKit('open').hoursPer100Sf, 0);
  assert.equal(suggestedShadeKit('louvered').shadePerSf, 18);
  assert.equal(suggestedHeightKit('8').postEach, 85);
  assert.equal(suggestedHeightKit('12').extraHoursPerPost, 0.35);
  for (const preset of SHADE_PRESETS) {
    assert.ok(Number.isFinite(suggestedShadeKit(preset.id).hoursPer100Sf));
  }
  for (const preset of HEIGHT_PRESETS) {
    assert.ok(suggestedHeightKit(preset.id).postEach > 0);
  }
  for (const preset of ATTACHMENT_PRESETS) {
    assert.ok(preset.id.length > 0);
  }
});

test('job presets are loadable without changing the arithmetic', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const first = JOB_PRESETS[0];
  const result = calculateBid({
    ...coupon(),
    attachment: first.attachment,
    shade: first.shade,
    height: first.height,
    widthFeet: first.widthFeet,
    depthFeet: first.depthFeet,
  });
  assert.equal(result.footprintSf, 100);
  assert.equal(result.postCount, 4);
});

test('the customer-facing summary omits wages and names the posts and shade', () => {
  const text = formatBidSummary(calculateBid(coupon()));
  assert.match(text, /PERGOLA \/ PATIO COVER BID/);
  assert.match(text, /10×10/);
  assert.match(text, /post/i);
  assert.match(text, /not a construction specification/);
  assert.doesNotMatch(text, /\$32/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /wage/i);
});
