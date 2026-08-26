import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareType,
  formatBidSummary,
  travelHours,
  suggestedTypeKit,
  suggestedScopeKit,
  suggestedRoofKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedTypeKit('tubular'),
    ...suggestedScopeKit('replace-existing'),
    ...suggestedRoofKit('asphalt'),
    ...suggestedExtraKit(),
  };
  return {
    units: 1,
    shafts: 0,
    stories: 1,
    type: 'tubular',
    scope: 'replace-existing',
    roof: 'asphalt',
    travelMiles: 8,
    includeIceWater: false,
    includeLaminated: false,
    includePaint: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 75,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedTypeKit('venting-solar'),
    ...suggestedScopeKit('new-cut-in'),
    ...suggestedRoofKit('tile-or-metal'),
    ...suggestedExtraKit(),
  };
  return {
    units: 3,
    shafts: 3,
    stories: 2,
    type: 'venting-solar',
    scope: 'new-cut-in',
    roof: 'tile-or-metal',
    travelMiles: 22,
    includeIceWater: true,
    includeLaminated: true,
    includePaint: true,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 140,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.4, 8, 0.035) - (1.4 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is one tubular replace, not a venting tile cut-in', () => {
  const result = calculateBid(special());
  assert.equal(result.units, 1);
  assert.equal(result.hoursShafts, 0);
  assert.equal(result.hoursIceWater, 0);
  assert.equal(result.hoursLaminated, 0);
  assert.equal(result.hoursPaint, 0);
  assert.equal(result.hoursStories, 0);
  assert.equal(result.laminatedMaterial, 0);
  assert.ok(result.hoursUnits > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursPull > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerUnit > 400 && result.pricePerUnit < 2200);
});

test('a venting tile cut-in is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.units, 3);
  assert.ok(heavy.hoursUnits > cheap.hoursUnits);
  assert.ok(heavy.hoursCut > cheap.hoursCut);
  assert.ok(heavy.hoursFraming > cheap.hoursFraming);
  assert.ok(heavy.hoursRoof > cheap.hoursRoof);
  assert.ok(heavy.hoursShafts > 0);
  assert.ok(heavy.hoursIceWater > 0);
  assert.ok(heavy.hoursLaminated > 0);
  assert.ok(heavy.hoursPaint > 0);
  assert.ok(heavy.hoursStories > 0);
  assert.ok(heavy.roofFlashMaterial > 0);
  assert.ok(heavy.laminatedMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerUnit * heavy.units,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.units > cheap.price / cheap.units);
});

test('price stacks burden, material, overhead, then margin as a share of price', () => {
  const result = calculateBid(special());
  assert.equal(result.loadedWage, 42 * 1.3);
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

test('compareType prices three unit types on the same openings', () => {
  const rows = compareType(losingJob());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const tubular = rows.find((row) => row.type === 'tubular');
  const fixed = rows.find((row) => row.type === 'fixed');
  const venting = rows.find((row) => row.type === 'venting-solar');
  assert.ok(fixed.price > tubular.price);
  assert.ok(venting.price > tubular.price);
  assert.ok(venting.unitMaterial > tubular.unitMaterial);
  assert.ok(venting.hoursUnits > tubular.hoursUnits);
  assert.ok(venting.delta > 0);
});

test('travel miles add hours and invoice without changing the unit count', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursUnits, near.hoursUnits);
  assert.equal(far.units, near.units);
});

test('a second story and shafts add hours the $800 special cannot see', () => {
  const oneStory = calculateBid(special());
  const twoStory = calculateBid({ ...special(), stories: 2, shafts: 1, includePaint: true });
  assert.ok(twoStory.hoursStories > oneStory.hoursStories);
  assert.ok(twoStory.hoursShafts > 0);
  assert.ok(twoStory.hoursPaint > 0);
  assert.ok(twoStory.price > oneStory.price);
});

test('unknown type, scope, roof, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), type: 'casement-window' }), /Unknown type/);
  assert.throws(() => calculateBid({ ...special(), scope: 'reroof' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), roof: 'standing-seam-house' }), /Unknown roof/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedTypeKit('casement-window'), /Unknown type/);
  assert.throws(() => suggestedScopeKit('reroof'), /Unknown scope/);
  assert.throws(() => suggestedRoofKit('standing-seam-house'), /Unknown roof/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedTypeKit(preset.type),
      ...suggestedScopeKit(preset.scope),
      ...suggestedRoofKit(preset.roof),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 42,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 75,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.units > 0, preset.label);
  }
});

test('the customer summary names the units and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Tubular sun tunnel');
  assert.match(text, /SKYLIGHT INSTALL BID/);
  assert.match(text, /Tubular sun tunnel/);
  assert.match(text, /Replace existing/i);
  assert.match(text, /tubular/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a roofing specification/i);
});
