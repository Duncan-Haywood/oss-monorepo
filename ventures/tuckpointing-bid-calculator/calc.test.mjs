import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareMethod,
  formatBidSummary,
  wallAreaSqFt,
  jointLinealFeet,
  travelHours,
  suggestedMethodKit,
  suggestedAccessKit,
  suggestedMortarKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedMethodKit('smear'),
    ...suggestedAccessKit('ground'),
    ...suggestedMortarKit('type-n'),
    ...suggestedExtraKit(),
  };
  return {
    wallLengthFt: 40,
    wallHeightFt: 8,
    method: 'smear',
    access: 'ground',
    mortar: 'type-n',
    travelMiles: 12,
    replacementBricks: 0,
    lintels: 0,
    caulkLf: 0,
    powerWash: false,
    hourlyWage: 32,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 95,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedMethodKit('grind'),
    ...suggestedAccessKit('swing'),
    ...suggestedMortarKit('lime'),
    ...suggestedExtraKit(),
  };
  return {
    wallLengthFt: 36,
    wallHeightFt: 28,
    method: 'grind',
    access: 'swing',
    mortar: 'lime',
    travelMiles: 28,
    replacementBricks: 80,
    lintels: 3,
    caulkLf: 40,
    powerWash: true,
    hourlyWage: 32,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 180,
    otherCost: 0,
    ...kit,
  };
}

test('area, joint feet, and travel hours stack in that order', () => {
  assert.equal(wallAreaSqFt(40, 8), 320);
  assert.equal(jointLinealFeet(320, 6.5), 2080);
  assert.ok(Math.abs(travelHours(1.6, 12, 0.035) - (1.6 + 0.42)) < 1e-9);
  assert.throws(() => travelHours('x', 12, 0.035), /must be a number/);
});

test('the cheap special is a ground-level smear, not a grind plus scaffold', () => {
  const result = calculateBid(special());
  assert.equal(result.areaSqFt, 320);
  assert.equal(result.hoursGrind, 0);
  assert.equal(result.hoursRebuild, 0);
  assert.equal(result.hoursBricks, 0);
  assert.equal(result.hoursLintels, 0);
  assert.equal(result.hoursWash, 0);
  assert.ok(result.hoursPoint > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.mortarMaterial > 0);
  assert.ok(result.shares.mortar + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerSqFt > 4 && result.pricePerSqFt < 25);
});

test('a historic grind with swing access is a different job than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.areaSqFt, 1008);
  assert.ok(heavy.jointLf > cheap.jointLf);
  assert.ok(heavy.hoursGrind > cheap.hoursGrind);
  assert.ok(heavy.hoursPoint > cheap.hoursPoint);
  assert.ok(heavy.hoursAccess > cheap.hoursAccess);
  assert.ok(heavy.hoursTravel > cheap.hoursTravel);
  assert.ok(heavy.hoursBricks > 0);
  assert.ok(heavy.hoursLintels > 0);
  assert.ok(heavy.hoursWash > 0);
  assert.ok(heavy.accessEquipment > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerSqFt * heavy.areaSqFt,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.areaSqFt > cheap.price / cheap.areaSqFt);
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

test('compareMethod prices three methods on the same wall', () => {
  const rows = compareMethod(special());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const smear = rows.find((row) => row.method === 'smear');
  const grind = rows.find((row) => row.method === 'grind');
  const rebuild = rows.find((row) => row.method === 'rebuild');
  assert.ok(grind.price > smear.price);
  assert.ok(rebuild.price > grind.price);
  assert.ok(grind.hoursGrind > smear.hoursGrind);
  assert.ok(rebuild.delta > 0);
});

test('travel miles add hours and invoice without changing the grind', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursGrind, near.hoursGrind);
  assert.equal(far.areaSqFt, near.areaSqFt);
});

test('unknown method, access, mortar, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), method: 'stucco' }), /Unknown method/);
  assert.throws(() => calculateBid({ ...special(), access: 'helicopter' }), /Unknown access/);
  assert.throws(() => calculateBid({ ...special(), mortar: 'epoxy' }), /Unknown mortar/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedMethodKit('stucco'), /Unknown method/);
  assert.throws(() => suggestedAccessKit('helicopter'), /Unknown access/);
  assert.throws(() => suggestedMortarKit('epoxy'), /Unknown mortar/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedMethodKit(preset.method),
      ...suggestedAccessKit(preset.access),
      ...suggestedMortarKit(preset.mortar),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 32,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 95,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.areaSqFt > 0, preset.label);
  }
});

test('the customer summary names the wall and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Ranch veneer');
  assert.match(text, /TUCKPOINTING \/ BRICK POINTING BID/);
  assert.match(text, /Ranch veneer/);
  assert.match(text, /smear/i);
  assert.match(text, /Ground/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a structural specification/i);
});
