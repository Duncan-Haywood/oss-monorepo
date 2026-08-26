import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  compareWindow,
  formatBidSummary,
  travelHours,
  suggestedScopeKit,
  suggestedWindowKit,
  suggestedWellKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('retrofit-existing'),
    ...suggestedWindowKit('vinyl-hopper'),
    ...suggestedWellKit('plastic'),
    ...suggestedExtraKit(),
  };
  return {
    windowCount: 1,
    scope: 'retrofit-existing',
    window: 'vinyl-hopper',
    well: 'plastic',
    travelMiles: 8,
    includeCover: false,
    includeLadder: false,
    includeDrain: false,
    includeHaul: false,
    includeInteriorFinish: false,
    hourlyWage: 42,
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
    ...suggestedScopeKit('new-cut-poured'),
    ...suggestedWindowKit('vinyl-casement'),
    ...suggestedWellKit('stone'),
    ...suggestedExtraKit(),
  };
  return {
    windowCount: 1,
    scope: 'new-cut-poured',
    window: 'vinyl-casement',
    well: 'stone',
    travelMiles: 22,
    includeCover: true,
    includeLadder: true,
    includeDrain: true,
    includeHaul: true,
    includeInteriorFinish: true,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 220,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.4, 8, 0.035) - (1.4 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is a hopper retrofit, not a poured-wall cut', () => {
  const result = calculateBid(special());
  assert.equal(result.windowCount, 1);
  assert.equal(result.hoursCut, 0);
  assert.equal(result.hoursCover, 0);
  assert.equal(result.hoursLadder, 0);
  assert.equal(result.hoursDrain, 0);
  assert.equal(result.hoursHaul, 0);
  assert.equal(result.hoursFinish, 0);
  assert.equal(result.coverMaterial, 0);
  assert.ok(result.hoursWindow > 0);
  assert.ok(result.hoursWell > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.shares.sash + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerWindow > 800 && result.pricePerWindow < 4500);
});

test('a poured-wall stone-well job is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.windowCount, 1);
  assert.ok(heavy.hoursWindow > cheap.hoursWindow);
  assert.ok(heavy.hoursCut > 0);
  assert.ok(heavy.hoursWell > cheap.hoursWell);
  assert.ok(heavy.hoursCover > 0);
  assert.ok(heavy.hoursDrain > 0);
  assert.ok(heavy.hoursHaul > 0);
  assert.ok(heavy.hoursFinish > 0);
  assert.ok(heavy.wellMaterial > cheap.wellMaterial);
  assert.ok(heavy.coverMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerWindow * heavy.windowCount,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.windowCount > cheap.price / cheap.windowCount);
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

test('compareScope prices four cuts on the same opening', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const retrofit = rows.find((row) => row.scope === 'retrofit-existing');
  const wood = rows.find((row) => row.scope === 'new-cut-wood');
  const masonry = rows.find((row) => row.scope === 'new-cut-masonry');
  const poured = rows.find((row) => row.scope === 'new-cut-poured');
  assert.ok(wood.price > retrofit.price);
  assert.ok(masonry.price > wood.price);
  assert.ok(poured.price > masonry.price);
  assert.ok(poured.hoursCut > retrofit.hoursCut);
  assert.ok(poured.delta > 0);
});

test('compareWindow prices four sashes on the same opening', () => {
  const rows = compareWindow(special());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const hopper = rows.find((row) => row.window === 'vinyl-hopper');
  const slider = rows.find((row) => row.window === 'vinyl-slider');
  const casement = rows.find((row) => row.window === 'vinyl-casement');
  const fiber = rows.find((row) => row.window === 'fiberglass');
  assert.ok(hopper);
  assert.ok(slider.price > hopper.price);
  assert.ok(casement.price > hopper.price);
  assert.ok(fiber.price > hopper.price);
  assert.ok(slider.upgradeFromHopper > 0);
  assert.equal(hopper.upgradeFromHopper, 0);
});

test('unknown presets and a 100% margin are rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'nope' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), window: 'nope' }), /Unknown window/);
  assert.throws(() => calculateBid({ ...special(), well: 'nope' }), /Unknown well/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('nope'), /Unknown scope/);
  assert.throws(() => suggestedWindowKit('nope'), /Unknown window/);
  assert.throws(() => suggestedWellKit('nope'), /Unknown well/);
});

test('job presets cover the cheap special and the losing poured cut', () => {
  assert.ok(JOB_PRESETS.some((job) => job.scope === 'retrofit-existing' && job.window === 'vinyl-hopper'));
  assert.ok(JOB_PRESETS.some((job) => job.scope === 'new-cut-poured' && job.well === 'stone'));
  assert.ok(JOB_PRESETS.some((job) => job.windowCount === 2));
});

test('formatBidSummary is a customer-facing draft without wages', () => {
  const text = formatBidSummary(calculateBid(losingJob()), 'Losing poured cut');
  assert.match(text, /EGRESS WINDOW INSTALL BID/);
  assert.match(text, /Proposed installed price/);
  assert.match(text, /Losing poured cut/);
  assert.match(text, /casement/i);
  assert.match(text, /poured/i);
  assert.doesNotMatch(text, /hourly wage/i);
  assert.doesNotMatch(text, /\$42/);
});

test('flag helpers accept common form values', () => {
  const on = calculateBid({ ...special(), includeCover: '1' });
  const off = calculateBid({ ...special(), includeCover: '0' });
  assert.ok(on.hoursCover > 0);
  assert.equal(off.hoursCover, 0);
});
