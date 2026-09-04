import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  compareStairs,
  formatBidSummary,
  travelHours,
  floorYardsFromSqft,
  suggestedScopeKit,
  suggestedPatternKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('stretch-in'),
    ...suggestedPatternKit('solid'),
    ...suggestedExtraKit(),
  };
  return {
    floorSqft: 400,
    stairCount: 0,
    transitionCount: 2,
    scope: 'stretch-in',
    pattern: 'solid',
    travelMiles: 8,
    includeTearOut: false,
    includeFurniture: false,
    includeHaul: false,
    hourlyWage: 38,
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
    ...suggestedScopeKit('glue-down'),
    ...suggestedPatternKit('patterned'),
    ...suggestedExtraKit(),
  };
  return {
    floorSqft: 400,
    stairCount: 14,
    transitionCount: 4,
    scope: 'glue-down',
    pattern: 'patterned',
    travelMiles: 18,
    includeTearOut: true,
    includeFurniture: true,
    includeHaul: true,
    hourlyWage: 38,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 85,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(0.9, 8, 0.035) - (0.9 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('nine square feet is one square yard', () => {
  assert.equal(floorYardsFromSqft(450), 50);
  assert.equal(floorYardsFromSqft(0), 0);
  assert.throws(() => floorYardsFromSqft('room'), /must be a number/);
});

test('the cheap special is a flat stretch-in living room, not a stair house', () => {
  const result = calculateBid(special());
  assert.equal(result.floorSqft, 400);
  assert.equal(result.stairCount, 0);
  assert.equal(result.hoursStairs, 0);
  assert.equal(result.hoursTearOut, 0);
  assert.equal(result.hoursFurniture, 0);
  assert.equal(result.hoursHaul, 0);
  assert.equal(result.stairMaterial, 0);
  assert.equal(result.tearOutMaterial, 0);
  assert.equal(result.haulMaterial, 0);
  assert.ok(result.hoursFloor > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.netYards > 0);
  assert.ok(result.wasteYards > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerYard > 15 && result.pricePerYard < 80);
});

test('a patterned glue-down with fourteen stairs is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.floorSqft, 400);
  assert.ok(heavy.hoursFloor > 0);
  assert.ok(heavy.hoursStairs > 0);
  assert.ok(heavy.hoursPattern > cheap.hoursPattern);
  assert.ok(heavy.hoursTearOut > 0);
  assert.ok(heavy.hoursFurniture > 0);
  assert.ok(heavy.hoursHaul > 0);
  assert.ok(heavy.wastePercent > cheap.wastePercent);
  assert.ok(heavy.stairMaterial > 0);
  assert.ok(heavy.adhesiveMaterial > cheap.adhesiveMaterial);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerYard * heavy.billYards,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price > cheap.price);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 38 * 1.3);
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
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 50 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareScope prices four scopes on the same floor', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const stretch = rows.find((row) => row.scope === 'stretch-in');
  const glue = rows.find((row) => row.scope === 'glue-down');
  const doubleStick = rows.find((row) => row.scope === 'double-stick');
  const tile = rows.find((row) => row.scope === 'carpet-tile');
  assert.ok(glue.price > stretch.price);
  assert.ok(doubleStick.price > stretch.price);
  assert.ok(tile.price > 0);
  assert.ok(glue.adhesiveMaterial > stretch.adhesiveMaterial);
  assert.ok(stretch.padMaterial > glue.padMaterial);
  assert.ok(glue.delta > 0);
});

test('compareStairs prices four stair counts on the same floor', () => {
  const rows = compareStairs(special());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const none = rows.find((row) => row.stairCount === 0);
  const seven = rows.find((row) => row.stairCount === 7);
  const thirteen = rows.find((row) => row.stairCount === 13);
  const twentyOne = rows.find((row) => row.stairCount === 21);
  assert.ok(none);
  assert.ok(seven.price > none.price);
  assert.ok(thirteen.price > seven.price);
  assert.ok(twentyOne.price > thirteen.price);
  assert.ok(thirteen.hoursStairs > none.hoursStairs);
  assert.ok(thirteen.stairMaterial > none.stairMaterial);
  assert.ok(seven.upgradeFromFlat > 0);
  assert.equal(none.upgradeFromFlat, 0);
  assert.ok(none.cheapest);
});

test('compareStairs keeps the current scope and does not reuse a typed stair rate', () => {
  const glueRows = compareStairs(losingJob());
  const cheapRows = compareStairs(special());
  const glueNone = glueRows.find((row) => row.stairCount === 0);
  const cheapNone = cheapRows.find((row) => row.stairCount === 0);
  assert.ok(glueNone.price > cheapNone.price);
  const overridden = compareStairs({
    ...special(),
    hoursPerStair: 9,
    stairWrapEach: 4000,
  });
  const none = overridden.find((row) => row.stairCount === 0);
  const baseline = compareStairs(special()).find((row) => row.stairCount === 0);
  assert.ok(Math.abs(none.price - baseline.price) < 1e-9);
});

test('travel miles add hours and invoice without changing the floor', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursFloor, near.hoursFloor);
  assert.equal(far.floorSqft, near.floorSqft);
});

test('a larger floor on the same trip scales the yards, not the drive', () => {
  const small = calculateBid(special());
  const large = calculateBid({ ...special(), floorSqft: 800 });
  assert.equal(large.hoursTravel, small.hoursTravel);
  assert.ok(Math.abs(large.hoursFloor - small.hoursFloor * 2) < 1e-9);
  assert.ok(Math.abs(large.carpetMaterial / large.billYards - small.carpetMaterial / small.billYards) < 1e-9);
  assert.ok(large.price > small.price);
  assert.ok(large.price < small.price * 2);
});

test('stairs add yards and hours that floor measure alone cannot see', () => {
  const flat = calculateBid(special());
  const stairs = calculateBid({ ...special(), stairCount: 14 });
  assert.ok(stairs.billYards > flat.billYards);
  assert.ok(stairs.hoursStairs > 0);
  assert.equal(flat.hoursStairs, 0);
  assert.ok(stairs.stairMaterial > 0);
  assert.equal(stairs.hoursFloor, flat.hoursFloor);
});

test('tear-out and haul are extras, not part of the $2-a-yard dump', () => {
  const clean = calculateBid(special());
  const tear = calculateBid({ ...special(), includeTearOut: true, includeHaul: true });
  assert.equal(clean.hoursTearOut, 0);
  assert.equal(clean.haulMaterial, 0);
  assert.ok(tear.hoursTearOut > 0);
  assert.ok(tear.hoursHaul > 0);
  assert.ok(tear.tearOutMaterial > 0);
  assert.ok(tear.haulMaterial > 0);
  assert.ok(tear.price > clean.price);
});

test('unknown scope, pattern, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'lvp-click' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), pattern: 'herringbone-hardwood' }), /Unknown pattern/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('lvp-click'), /Unknown scope/);
  assert.throws(() => suggestedPatternKit('herringbone-hardwood'), /Unknown pattern/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedPatternKit(preset.pattern),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 38,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 55,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.floorSqft > 0, preset.label);
  }
});

test('the customer summary names the floor and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Living room stretch');
  assert.match(text, /CARPET INSTALLATION BID/);
  assert.match(text, /Living room stretch/);
  assert.match(text, /Stretch-in/i);
  assert.match(text, /solid/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a flooring-spec determination/i);
});
