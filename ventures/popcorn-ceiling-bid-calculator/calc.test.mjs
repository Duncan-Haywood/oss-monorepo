import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  formatBidSummary,
  ceilingAreaSqFt,
  travelHours,
  suggestedScopeKit,
  suggestedHeightKit,
  suggestedTextureKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('scrape-prime'),
    ...suggestedHeightKit('eight'),
    ...suggestedTextureKit('light'),
    ...suggestedExtraKit(),
  };
  return {
    lengthFt: 40,
    widthFt: 30,
    scope: 'scrape-prime',
    height: 'eight',
    texture: 'light',
    travelMiles: 10,
    closetCeilings: 0,
    stainRepairs: 0,
    asbestosTest: false,
    containment: false,
    furnitureMove: false,
    hourlyWage: 32,
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
    ...suggestedScopeKit('scrape-skim-paint'),
    ...suggestedHeightKit('two-story'),
    ...suggestedTextureKit('painted'),
    ...suggestedExtraKit(),
  };
  return {
    lengthFt: 36,
    widthFt: 28,
    scope: 'scrape-skim-paint',
    height: 'two-story',
    texture: 'painted',
    travelMiles: 22,
    closetCeilings: 6,
    stainRepairs: 4,
    asbestosTest: true,
    containment: true,
    furnitureMove: true,
    hourlyWage: 32,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 160,
    otherCost: 0,
    ...kit,
  };
}

test('ceiling area and travel hours stack in that order', () => {
  assert.equal(ceilingAreaSqFt(40, 30), 1200);
  assert.ok(Math.abs(travelHours(1.5, 10, 0.035) - (1.5 + 0.35)) < 1e-9);
  assert.throws(() => travelHours('x', 10, 0.035), /must be a number/);
});

test('the cheap special is an 8-ft light scrape-and-prime, not a Level 5 paint', () => {
  const result = calculateBid(special());
  assert.equal(result.ceilingSqFt, 1200);
  assert.equal(result.hoursSkim, 0);
  assert.equal(result.hoursPaint, 0);
  assert.equal(result.hoursAsbestos, 0);
  assert.equal(result.hoursContainment, 0);
  assert.equal(result.hoursFurniture, 0);
  assert.equal(result.hoursClosets, 0);
  assert.equal(result.asbestosMaterial, 0);
  assert.ok(result.hoursScrape > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.primerMaterial > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerSqFt > 1 && result.pricePerSqFt < 6);
});

test('a painted two-story Level 5 is a different job than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.ceilingSqFt, 1008);
  assert.ok(heavy.hoursSkim > cheap.hoursSkim);
  assert.ok(heavy.hoursPaint > cheap.hoursPaint);
  assert.ok(heavy.hoursAccess > cheap.hoursAccess);
  assert.ok(heavy.hoursTravel > cheap.hoursTravel);
  assert.ok(heavy.hoursTexture > cheap.hoursTexture);
  assert.ok(heavy.hoursAsbestos > 0);
  assert.ok(heavy.hoursContainment > 0);
  assert.ok(heavy.hoursFurniture > 0);
  assert.ok(heavy.hoursClosets > 0);
  assert.ok(heavy.asbestosMaterial > 0);
  assert.ok(heavy.scaffoldMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerSqFt * heavy.ceilingSqFt,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.ceilingSqFt > cheap.price / cheap.ceilingSqFt);
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

test('compareScope prices three scopes on the same ceiling', () => {
  const rows = compareScope(special());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const scrape = rows.find((row) => row.scope === 'scrape-prime');
  const skim = rows.find((row) => row.scope === 'scrape-skim');
  const paint = rows.find((row) => row.scope === 'scrape-skim-paint');
  assert.ok(skim.price > scrape.price);
  assert.ok(paint.price > skim.price);
  assert.ok(skim.hoursSkim > scrape.hoursSkim);
  assert.ok(paint.hoursPaint > skim.hoursPaint);
  assert.ok(paint.delta > 0);
});

test('travel miles add hours and invoice without changing the scrape', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursScrape, near.hoursScrape);
  assert.equal(far.ceilingSqFt, near.ceilingSqFt);
});

test('unknown scope, height, texture, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'hang-and-finish' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), height: 'helicopter' }), /Unknown height/);
  assert.throws(() => calculateBid({ ...special(), texture: 'orange-peel-only' }), /Unknown texture/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('hang-and-finish'), /Unknown scope/);
  assert.throws(() => suggestedHeightKit('helicopter'), /Unknown height/);
  assert.throws(() => suggestedTextureKit('orange-peel-only'), /Unknown texture/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedHeightKit(preset.height),
      ...suggestedTextureKit(preset.texture),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 32,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 75,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.ceilingSqFt > 0, preset.label);
  }
});

test('the customer summary names the ceiling and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Ranch ceiling');
  assert.match(text, /POPCORN CEILING REMOVAL BID/);
  assert.match(text, /Ranch ceiling/);
  assert.match(text, /Scrape and prime/i);
  assert.match(text, /8-foot/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a drywall specification/i);
});
