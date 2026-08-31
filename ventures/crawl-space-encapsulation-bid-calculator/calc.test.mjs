import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  formatBidSummary,
  floorAreaSqFt,
  wallAreaSqFt,
  travelHours,
  suggestedScopeKit,
  suggestedAccessKit,
  suggestedInsulationKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('liner'),
    ...suggestedAccessKit('hatch'),
    ...suggestedInsulationKit('none'),
    ...suggestedExtraKit(),
  };
  return {
    lengthFt: 40,
    widthFt: 28,
    wallHeightIn: 24,
    scope: 'liner',
    access: 'hatch',
    insulation: 'none',
    travelMiles: 10,
    cleanoutYards: 0,
    supportPiers: 0,
    dedicatedCircuit: false,
    exteriorGrade: false,
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
    ...suggestedScopeKit('encapsulate-dehu'),
    ...suggestedAccessKit('wet'),
    ...suggestedInsulationKit('closed-cell'),
    ...suggestedExtraKit(),
  };
  return {
    lengthFt: 36,
    widthFt: 24,
    wallHeightIn: 18,
    scope: 'encapsulate-dehu',
    access: 'wet',
    insulation: 'closed-cell',
    travelMiles: 22,
    cleanoutYards: 4,
    supportPiers: 6,
    dedicatedCircuit: true,
    exteriorGrade: true,
    hourlyWage: 32,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 180,
    otherCost: 0,
    ...kit,
  };
}

test('floor area, stem-wall area, and travel hours stack in that order', () => {
  assert.equal(floorAreaSqFt(40, 28), 1120);
  assert.equal(wallAreaSqFt(40, 28, 24), 2 * (40 + 28) * 2);
  assert.ok(Math.abs(travelHours(1.5, 10, 0.035) - (1.5 + 0.35)) < 1e-9);
  assert.throws(() => travelHours('x', 10, 0.035), /must be a number/);
});

test('the cheap special is a dry hatch liner-only, not a sealed encapsulate', () => {
  const result = calculateBid(special());
  assert.equal(result.floorSqFt, 1120);
  assert.equal(result.hoursWall, 0);
  assert.equal(result.hoursDehu, 0);
  assert.equal(result.hoursPump, 0);
  assert.equal(result.hoursInsulation, 0);
  assert.equal(result.hoursCleanout, 0);
  assert.equal(result.dehuInvoice, 0);
  assert.ok(result.hoursFloor > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.floorLinerMaterial > 0);
  assert.ok(result.shares.liner + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerSqFt > 1 && result.pricePerSqFt < 12);
});

test('a wet encapsulate with dehumidifier is a different job than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.floorSqFt, 864);
  assert.ok(heavy.wallsSqFt > 0);
  assert.ok(heavy.linerSqFt > heavy.floorSqFt);
  assert.ok(heavy.hoursWall > cheap.hoursWall);
  assert.ok(heavy.hoursAccess > cheap.hoursAccess);
  assert.ok(heavy.hoursTravel > cheap.hoursTravel);
  assert.ok(heavy.hoursDehu > 0);
  assert.ok(heavy.hoursPump > 0);
  assert.ok(heavy.hoursCleanout > 0);
  assert.ok(heavy.hoursPiers > 0);
  assert.ok(heavy.hoursCircuit > 0);
  assert.ok(heavy.dehuInvoice > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerSqFt * heavy.floorSqFt,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.floorSqFt > cheap.price / cheap.floorSqFt);
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

test('compareScope prices three scopes on the same floor', () => {
  const rows = compareScope(special());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const liner = rows.find((row) => row.scope === 'liner');
  const encapsulate = rows.find((row) => row.scope === 'encapsulate');
  const dehu = rows.find((row) => row.scope === 'encapsulate-dehu');
  assert.ok(encapsulate.price > liner.price);
  assert.ok(dehu.price > encapsulate.price);
  assert.ok(encapsulate.hoursWall > liner.hoursWall);
  assert.ok(dehu.dehuInvoice > encapsulate.dehuInvoice);
  assert.ok(dehu.delta > 0);
});

test('travel miles add hours and invoice without changing the floor liner', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursFloor, near.hoursFloor);
  assert.equal(far.floorSqFt, near.floorSqFt);
});

test('unknown scope, access, insulation, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'french-drain' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), access: 'helicopter' }), /Unknown access/);
  assert.throws(() => calculateBid({ ...special(), insulation: 'attic-blown' }), /Unknown insulation/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('french-drain'), /Unknown scope/);
  assert.throws(() => suggestedAccessKit('helicopter'), /Unknown access/);
  assert.throws(() => suggestedInsulationKit('attic-blown'), /Unknown insulation/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedAccessKit(preset.access),
      ...suggestedInsulationKit(preset.insulation),
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
    assert.ok(result.floorSqFt > 0, preset.label);
  }
});

test('the customer summary names the floor and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Ranch crawl');
  assert.match(text, /CRAWL SPACE ENCAPSULATION BID/);
  assert.match(text, /Ranch crawl/);
  assert.match(text, /Liner-only/i);
  assert.match(text, /Hatch/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a waterproofing specification/i);
});
