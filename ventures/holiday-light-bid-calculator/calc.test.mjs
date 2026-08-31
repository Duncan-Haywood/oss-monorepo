import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  formatBidSummary,
  travelHours,
  suggestedScopeKit,
  suggestedStoryKit,
  suggestedTypeKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('hang-only'),
    ...suggestedStoryKit('one'),
    ...suggestedTypeKit('c9'),
    ...suggestedExtraKit(),
  };
  return {
    eaveLf: 140,
    scope: 'hang-only',
    stories: 'one',
    lightType: 'c9',
    travelMiles: 8,
    peaks: 0,
    trees: 0,
    bushes: 0,
    columns: 0,
    includeTimer: false,
    steepPitch: false,
    hourlyWage: 32,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 55,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedScopeKit('hang-and-takedown'),
    ...suggestedStoryKit('two'),
    ...suggestedTypeKit('c9'),
    ...suggestedExtraKit(),
  };
  return {
    eaveLf: 180,
    scope: 'hang-and-takedown',
    stories: 'two',
    lightType: 'c9',
    travelMiles: 18,
    peaks: 3,
    trees: 2,
    bushes: 6,
    columns: 2,
    includeTimer: true,
    steepPitch: false,
    hourlyWage: 32,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 140,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.2, 8, 0.035) - (1.2 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is a 1-story C9 hang-only, not a take-down', () => {
  const result = calculateBid(special());
  assert.equal(result.eaveLf, 140);
  assert.equal(result.hoursTakedown, 0);
  assert.equal(result.hoursPeaks, 0);
  assert.equal(result.hoursTrees, 0);
  assert.equal(result.hoursBushes, 0);
  assert.equal(result.hoursColumns, 0);
  assert.equal(result.hoursTimer, 0);
  assert.equal(result.hoursSteep, 0);
  assert.equal(result.productMaterial, 0);
  assert.equal(result.storageMaterial, 0);
  assert.equal(result.liftMaterial, 0);
  assert.ok(result.hoursHang > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerLf > 2 && result.pricePerLf < 12);
});

test('take-down is a second crew trip, not a share of the first drive', () => {
  // The README and the scope-kit comment both say take-down is "a second
  // crew day" / "a second trip in January" — so the round-trip drive
  // (hoursTravel, travelInvoice) has to happen twice on any scope that
  // has a take-down, not just once no matter the scope.
  const hangOnly = calculateBid(special());
  assert.equal(hangOnly.hoursTakedownTravel, 0);
  assert.equal(hangOnly.takedownTravelInvoice, 0);

  const withTakedown = calculateBid(losingJob());
  assert.ok(withTakedown.hoursTakedownTravel > 0);
  assert.ok(Math.abs(withTakedown.hoursTakedownTravel - withTakedown.hoursTravel) < 1e-9);
  assert.ok(withTakedown.takedownTravelInvoice > 0);
  assert.ok(Math.abs(withTakedown.takedownTravelInvoice - withTakedown.travelInvoice) < 1e-9);

  const manualTotalHours = withTakedown.hoursTravel + withTakedown.hoursTakedownTravel
    + withTakedown.hoursHang + withTakedown.hoursType + withTakedown.hoursAccess
    + withTakedown.hoursAccessPremium + withTakedown.hoursPeaks + withTakedown.hoursTrees
    + withTakedown.hoursBushes + withTakedown.hoursColumns + withTakedown.hoursSteep
    + withTakedown.hoursTimer + withTakedown.hoursTakedown + withTakedown.siteHours;
  assert.ok(Math.abs(withTakedown.totalHours - manualTotalHours) < 1e-9);

  const fullService = calculateBid({
    ...losingJob(),
    scope: 'full-service',
    ...suggestedScopeKit('full-service'),
  });
  assert.ok(fullService.hoursTakedownTravel > 0);
  assert.ok(fullService.takedownTravelInvoice > 0);
});

test('a two-story hang-and-takedown is a different job than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.eaveLf, 180);
  assert.ok(heavy.hoursHang > cheap.hoursHang);
  assert.ok(heavy.hoursAccess > cheap.hoursAccess);
  assert.ok(heavy.hoursTravel > cheap.hoursTravel);
  assert.ok(heavy.hoursTakedown > 0);
  assert.ok(heavy.hoursPeaks > 0);
  assert.ok(heavy.hoursTrees > 0);
  assert.ok(heavy.hoursBushes > 0);
  assert.ok(heavy.hoursColumns > 0);
  assert.ok(heavy.hoursTimer > 0);
  assert.ok(heavy.liftMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerLf * heavy.eaveLf,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.eaveLf > cheap.price / cheap.eaveLf);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 32 * 1.3);
  const direct = result.laborCost + result.materialCost + result.softCost;
  assert.ok(Math.abs(result.directCost - direct) < 1e-9);
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 20) < 1e-9);
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
  assert.ok(Math.abs(scored.proposed.margin - 20) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(special());
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareScope prices three scopes on the same house', () => {
  const rows = compareScope(special());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const hang = rows.find((row) => row.scope === 'hang-only');
  const both = rows.find((row) => row.scope === 'hang-and-takedown');
  const full = rows.find((row) => row.scope === 'full-service');
  assert.ok(both.price > hang.price);
  assert.ok(full.price > both.price);
  assert.ok(both.hoursTakedown > hang.hoursTakedown);
  assert.ok(full.productMaterial > both.productMaterial);
  assert.ok(full.storageMaterial > hang.storageMaterial);
  assert.ok(full.delta > 0);
});

test('travel miles add hours and invoice without changing the hang', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursHang, near.hoursHang);
  assert.equal(far.eaveLf, near.eaveLf);
});

test('unknown scope, stories, light type, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'landscape-lighting' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), stories: 'helicopter' }), /Unknown stories/);
  assert.throws(() => calculateBid({ ...special(), lightType: 'rope-light' }), /Unknown light type/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('landscape-lighting'), /Unknown scope/);
  assert.throws(() => suggestedStoryKit('helicopter'), /Unknown stories/);
  assert.throws(() => suggestedTypeKit('rope-light'), /Unknown light type/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedStoryKit(preset.stories),
      ...suggestedTypeKit(preset.lightType),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 32,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 55,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.eaveLf > 0, preset.label);
  }
});

test('the customer summary names the eave and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Ranch eaves');
  assert.match(text, /HOLIDAY LIGHT BID/);
  assert.match(text, /Ranch eaves/);
  assert.match(text, /Hang only/i);
  assert.match(text, /1-story/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not an electrical design/i);
});
