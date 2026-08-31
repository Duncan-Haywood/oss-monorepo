import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  formatBidSummary,
  travelHours,
  suggestedScopeKit,
  suggestedSoilKit,
  suggestedTransformerKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('fixtures-only'),
    ...suggestedSoilKit('easy'),
    ...suggestedTransformerKit('existing'),
    ...suggestedExtraKit(),
  };
  return {
    pathLights: 6,
    uplights: 0,
    wellLights: 0,
    hardscapeLights: 0,
    trenchLf: 0,
    scope: 'fixtures-only',
    soil: 'easy',
    transformer: 'existing',
    travelMiles: 8,
    includePhotocell: false,
    includeSawCut: false,
    includeExtraXfmr: false,
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
    ...suggestedScopeKit('new-system'),
    ...suggestedSoilKit('irrigated'),
    ...suggestedTransformerKit('300w'),
    ...suggestedExtraKit(),
  };
  return {
    pathLights: 6,
    uplights: 8,
    wellLights: 4,
    hardscapeLights: 2,
    trenchLf: 180,
    scope: 'new-system',
    soil: 'irrigated',
    transformer: '300w',
    travelMiles: 18,
    includePhotocell: true,
    includeSawCut: true,
    includeExtraXfmr: false,
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
  assert.ok(Math.abs(travelHours(1.4, 8, 0.035) - (1.4 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is fixtures-only path lights, not a new trench', () => {
  const result = calculateBid(special());
  assert.equal(result.fixtureCount, 6);
  assert.equal(result.hoursTrench, 0);
  assert.equal(result.hoursSoil, 0);
  assert.equal(result.hoursTransformer, 0);
  assert.equal(result.hoursWell, 0);
  assert.equal(result.hoursHardscape, 0);
  assert.equal(result.hoursPhotocell, 0);
  assert.equal(result.hoursSawCut, 0);
  assert.equal(result.wireMaterial, 0);
  assert.equal(result.xfmrMaterial, 0);
  assert.ok(result.hoursPath > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerFixture > 80 && result.pricePerFixture < 280);
});

test('a new-system architectural job is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.fixtureCount, 20);
  assert.ok(heavy.hoursFixtures > cheap.hoursFixtures);
  assert.ok(heavy.hoursTrench > 0);
  assert.ok(heavy.hoursSoil > 0);
  assert.ok(heavy.hoursTransformer > 0);
  assert.ok(heavy.hoursWell > 0);
  assert.ok(heavy.hoursHardscape > 0);
  assert.ok(heavy.hoursPhotocell > 0);
  assert.ok(heavy.hoursSawCut > 0);
  assert.ok(heavy.wireMaterial > 0);
  assert.ok(heavy.xfmrMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerFixture * heavy.fixtureCount,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.fixtureCount > cheap.price / cheap.fixtureCount);
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

test('compareScope prices three scopes on the same yard', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const fixtures = rows.find((row) => row.scope === 'fixtures-only');
  const neu = rows.find((row) => row.scope === 'new-system');
  const addon = rows.find((row) => row.scope === 'existing-add-on');
  assert.ok(neu.price > fixtures.price);
  assert.ok(addon.price > fixtures.price);
  assert.ok(neu.hoursTrench > fixtures.hoursTrench);
  assert.ok(neu.wireMaterial > fixtures.wireMaterial);
  assert.ok(neu.delta > 0);
});

test('travel miles add hours and invoice without changing the fixtures', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursPath, near.hoursPath);
  assert.equal(far.fixtureCount, near.fixtureCount);
});

test('unknown scope, soil, transformer, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'holiday-lights' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), soil: 'swamp' }), /Unknown soil/);
  assert.throws(() => calculateBid({ ...special(), transformer: 'line-voltage' }), /Unknown transformer/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('holiday-lights'), /Unknown scope/);
  assert.throws(() => suggestedSoilKit('swamp'), /Unknown soil/);
  assert.throws(() => suggestedTransformerKit('line-voltage'), /Unknown transformer/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedSoilKit(preset.soil),
      ...suggestedTransformerKit(preset.transformer),
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
    assert.ok(result.fixtureCount > 0, preset.label);
  }
});

test('the customer summary names the fixtures and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Walkway path lights');
  assert.match(text, /LANDSCAPE LIGHTING BID/);
  assert.match(text, /Walkway path lights/);
  assert.match(text, /Fixtures only/i);
  assert.match(text, /path light/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not an electrical design/i);
});
