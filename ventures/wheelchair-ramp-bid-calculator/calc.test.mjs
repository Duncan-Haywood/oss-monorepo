import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  intermediateLandingCount,
  switchbackExtraLandings,
  walkingSurface,
  suggestedHandrailLf,
  suggestedFootingCount,
  suggestedSurfaceKit,
  suggestedSlopeKit,
  JOB_PRESETS,
  SLOPE_PRESETS,
  SURFACE_PRESETS,
} from './calc.mjs';

const coupon = () => ({
  slope: 'ada_1_12',
  surface: 'wood',
  layout: 'straight',
  riseInches: 24,
  widthFeet: 4,
  landingSideFeet: 5,
  maxRiseBetweenLandings: 30,
  runPerRise: 12,
  hoursTrip: 1.5,
  hoursPer100Sf: 3.2,
  hoursPerHandrailLf: 0.12,
  hoursPerFooting: 0.35,
  hoursDemo: 2,
  hoursSite: 0.5,
  siteHours: 0.4,
  handrailLf: 24 * 2 + 2 * 5, // 58: both sides of 24 lf + one side of two landings
  footingCount: 4 + 2 * 2 + Math.ceil(24 / 8) * 2, // 4 + 4 + 6 = 14
  deckingPerSf: 4.5,
  framingPerSf: 6,
  handrailPerLf: 18,
  footingEach: 35,
  demoFee: 275,
  mobilizationFee: 150,
  permitFee: 225,
  hourlyWage: 28,
  burdenRate: 32,
  travelAndEquipment: 85,
  overheadRate: 15,
  targetMargin: 25,
  demoExistingStairs: false,
  includePermit: false,
});

test('a 24-inch rise at 1:12 needs no intermediate landing; 31 inches needs one', () => {
  assert.equal(intermediateLandingCount(24, 30), 0);
  assert.equal(intermediateLandingCount(30, 30), 0);
  assert.equal(intermediateLandingCount(31, 30), 1);
  assert.equal(intermediateLandingCount(60, 30), 1);
  assert.equal(intermediateLandingCount(61, 30), 2);
});

test('a switchback adds a turn landing only when the rise did not already rest', () => {
  assert.equal(switchbackExtraLandings('straight', 0), 0);
  assert.equal(switchbackExtraLandings('switchback', 0), 1);
  assert.equal(switchbackExtraLandings('switchback', 1), 0);
});

test('walking surface is the sloped run plus every landing, not lineal feet', () => {
  // 24 lf × 4 ft = 96 sf run; two 5×5 = 50 sf landings; 146 sf walking.
  const surface = walkingSurface(24, 4, 2, 5);
  assert.equal(surface.rampSf, 96);
  assert.equal(surface.landingSf, 50);
  assert.equal(surface.walkingSf, 146);
});

test('handrails start at zero at or below a 6-inch rise', () => {
  assert.equal(suggestedHandrailLf(6, 6, 2, 5), 0);
  assert.equal(suggestedHandrailLf(7, 7, 2, 5), 7 * 2 + 2 * 5);
});

test('the $85/lf coupon undercounts landings on the 24-inch platform special', () => {
  const result = calculateBid(coupon());
  assert.equal(result.runFeet, 24);
  assert.equal(result.landingCount, 2);
  assert.equal(result.intermediateLandings, 0);
  assert.equal(result.extraTurnLandings, 0);
  assert.equal(result.rampSf, 96);
  assert.equal(result.landingSf, 50);
  assert.equal(result.walkingSf, 146);
  assert.ok(result.landingShareOfWalking > 34, `landings are ${result.landingShareOfWalking.toFixed(1)}% of walking`);
  // A coupon written on 24 lf cannot see 50 sf of landing.
  assert.ok(result.pricePerRunLf > 85, `price per run lf is ${result.pricePerRunLf}`);
});

test('a 36-inch rise adds a rest landing the coupon still cannot see', () => {
  const result = calculateBid({ ...coupon(), riseInches: 36 });
  assert.equal(result.runFeet, 36);
  assert.equal(result.intermediateLandings, 1);
  assert.equal(result.landingCount, 3);
  assert.equal(result.landingSf, 75);
  assert.equal(result.walkingSf, 36 * 4 + 75);
  assert.ok(result.price > calculateBid(coupon()).price);
});

test('a 24-inch switchback adds a turn landing a straight run of the same rise does not', () => {
  const straight = calculateBid(coupon());
  const turned = calculateBid({ ...coupon(), layout: 'switchback' });
  assert.equal(straight.landingCount, 2);
  assert.equal(turned.extraTurnLandings, 1);
  assert.equal(turned.landingCount, 3);
  assert.ok(turned.walkingSf > straight.walkingSf);
  assert.ok(turned.price > straight.price);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(coupon());
  assert.equal(result.loadedWage, 28 * 1.32);

  const expectedSurfaceHours = 146 * 3.2 / 100;
  const expectedRailHours = 58 * 0.12;
  const expectedFootingHours = 14 * 0.35;
  const expectedHours = 1.5 + expectedSurfaceHours + expectedRailHours + expectedFootingHours + 0 + 0.5 + 0.4;
  assert.ok(Math.abs(result.totalHours - expectedHours) < 1e-9);

  const labor = expectedHours * 28 * 1.32;
  const material = 146 * 4.5 + 146 * 6 + 58 * 18 + 14 * 35;
  const soft = 85 + 150 + 0;
  const direct = labor + material + soft;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
  assert.equal(result.breakEvenPrice, result.totalCost);
});

test('demo and permit fees stay off until the flags are on', () => {
  const off = calculateBid(coupon());
  assert.equal(off.demoHours, 0);
  assert.equal(off.demoMaterial, 0);
  assert.equal(off.permitMaterial, 0);
  const on = calculateBid({ ...coupon(), demoExistingStairs: true, includePermit: true });
  assert.equal(on.demoHours, 2);
  assert.equal(on.demoMaterial, 275);
  assert.equal(on.permitMaterial, 225);
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

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(coupon());
  const scored = calculateBid({ ...coupon(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(coupon()).proposed, null);
  assert.equal(calculateBid({ ...coupon(), proposedPrice: '' }).proposed, null);
});

test('unknown slope, surface, or layout is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), slope: 'ada_1_20' }), /Unknown slope/);
  assert.throws(() => calculateBid({ ...coupon(), surface: 'vinyl' }), /Unknown surface/);
  assert.throws(() => calculateBid({ ...coupon(), layout: 'spiral' }), /Unknown layout/);
});

test('non-finite and zero-critical inputs are rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), riseInches: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), widthFeet: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ ...coupon(), riseInches: Number.NaN }), /must be a number/);
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 100 }), /less than 100/);
});

test('suggested kits match the shipped surface and slope lists', () => {
  assert.equal(suggestedSlopeKit('ada_1_12').runPerRise, 12);
  assert.equal(suggestedSurfaceKit('wood').hoursPer100Sf, 3.2);
  assert.equal(suggestedSurfaceKit('aluminum').framingPerSf, 0);
  assert.ok(suggestedFootingCount(24, 2) >= 10);
  for (const preset of SURFACE_PRESETS) {
    assert.ok(suggestedSurfaceKit(preset.id).hoursPer100Sf > 0);
  }
  for (const preset of SLOPE_PRESETS) {
    assert.equal(suggestedSlopeKit(preset.id).runPerRise, preset.runPerRise);
  }
});

test('job presets are loadable without changing the arithmetic', () => {
  assert.ok(JOB_PRESETS.length >= 4);
  const first = JOB_PRESETS[0];
  const result = calculateBid({
    ...coupon(),
    slope: first.slope,
    surface: first.surface,
    layout: first.layout,
    riseInches: first.riseInches,
    widthFeet: first.widthFeet,
  });
  assert.equal(result.riseInches, 24);
  assert.equal(result.landingCount, 2);
});

test('the customer-facing summary omits wages and names the landings', () => {
  const text = formatBidSummary(calculateBid(coupon()));
  assert.match(text, /WHEELCHAIR RAMP BID/);
  assert.match(text, /24" rise/);
  assert.match(text, /landing/);
  assert.match(text, /not a construction specification/);
  assert.doesNotMatch(text, /\$28/);
  assert.doesNotMatch(text, /burden/i);
  assert.doesNotMatch(text, /wage/i);
});
