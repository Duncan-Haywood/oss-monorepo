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
    ...suggestedScopeKit('wrap'),
    ...suggestedStoryKit('one'),
    ...suggestedTypeKit('vented'),
    ...suggestedExtraKit(),
  };
  return {
    eaveLf: 160,
    scope: 'wrap',
    stories: 'one',
    soffitType: 'vented',
    travelMiles: 10,
    rotLf: 0,
    porchBeams: 0,
    extraCorners: 0,
    gutterDetach: false,
    pestCleanup: false,
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
    ...suggestedScopeKit('wood-replace'),
    ...suggestedStoryKit('two'),
    ...suggestedTypeKit('vented'),
    ...suggestedExtraKit(),
  };
  return {
    eaveLf: 200,
    scope: 'wood-replace',
    stories: 'two',
    soffitType: 'vented',
    travelMiles: 22,
    rotLf: 48,
    porchBeams: 2,
    extraCorners: 8,
    gutterDetach: true,
    pestCleanup: true,
    hourlyWage: 32,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 160,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.4, 10, 0.035) - (1.4 + 0.35)) < 1e-9);
  assert.throws(() => travelHours('x', 10, 0.035), /must be a number/);
});

test('the cheap special is a 1-story vented wrap, not a wood replace', () => {
  const result = calculateBid(special());
  assert.equal(result.eaveLf, 160);
  assert.equal(result.hoursRot, 0);
  assert.equal(result.hoursBeams, 0);
  assert.equal(result.hoursCorners, 0);
  assert.equal(result.hoursGutter, 0);
  assert.equal(result.hoursPest, 0);
  assert.equal(result.woodMaterial, 0);
  assert.equal(result.gutterMaterial, 0);
  assert.equal(result.pestMaterial, 0);
  assert.ok(result.hoursWrap > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.wrapMaterial > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerLf > 8 && result.pricePerLf < 28);
});

test('a two-story wood-replace is a different job than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.eaveLf, 200);
  assert.ok(heavy.hoursWrap > cheap.hoursWrap);
  assert.ok(heavy.hoursAccess > cheap.hoursAccess);
  assert.ok(heavy.hoursTravel > cheap.hoursTravel);
  assert.ok(heavy.hoursRot > 0);
  assert.ok(heavy.hoursBeams > 0);
  assert.ok(heavy.hoursCorners > 0);
  assert.ok(heavy.hoursGutter > 0);
  assert.ok(heavy.hoursPest > 0);
  assert.ok(heavy.woodMaterial > 0);
  assert.ok(heavy.scaffoldMaterial > 0);
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

test('compareScope prices three scopes on the same eave', () => {
  const rows = compareScope(special());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const wrap = rows.find((row) => row.scope === 'wrap');
  const vinyl = rows.find((row) => row.scope === 'vinyl-replace');
  const wood = rows.find((row) => row.scope === 'wood-replace');
  assert.ok(vinyl.price > wrap.price);
  assert.ok(wood.price > vinyl.price);
  assert.ok(vinyl.hoursWrap > wrap.hoursWrap);
  assert.ok(wood.woodMaterial > vinyl.woodMaterial);
  assert.ok(wood.delta > 0);
});

test('travel miles add hours and invoice without changing the wrap', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursWrap, near.hoursWrap);
  assert.equal(far.eaveLf, near.eaveLf);
});

test('unknown scope, stories, soffit type, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'gutter-install' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), stories: 'helicopter' }), /Unknown stories/);
  assert.throws(() => calculateBid({ ...special(), soffitType: 'cedar-shake' }), /Unknown soffit type/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('gutter-install'), /Unknown scope/);
  assert.throws(() => suggestedStoryKit('helicopter'), /Unknown stories/);
  assert.throws(() => suggestedTypeKit('cedar-shake'), /Unknown soffit type/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedStoryKit(preset.stories),
      ...suggestedTypeKit(preset.soffitType),
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
    assert.ok(result.eaveLf > 0, preset.label);
  }
});

test('the customer summary names the eave and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Ranch eaves');
  assert.match(text, /SOFFIT AND FASCIA BID/);
  assert.match(text, /Ranch eaves/);
  assert.match(text, /Aluminum wrap/i);
  assert.match(text, /1-story/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a building-code determination/i);
});
