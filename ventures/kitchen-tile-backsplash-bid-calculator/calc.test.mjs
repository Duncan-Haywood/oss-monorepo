import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  formatBidSummary,
  travelHours,
  suggestedScopeKit,
  suggestedPatternKit,
  suggestedWallKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('tile-only'),
    ...suggestedPatternKit('subway-running'),
    ...suggestedWallKit('painted-drywall'),
    ...suggestedExtraKit(),
  };
  return {
    wallSf: 30,
    edgeLf: 12,
    outlets: 2,
    scope: 'tile-only',
    pattern: 'subway-running',
    wall: 'painted-drywall',
    travelMiles: 8,
    includeCooktop: false,
    includeSchluter: false,
    includeAccent: false,
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
    ...suggestedScopeKit('demo-and-replace'),
    ...suggestedPatternKit('herringbone'),
    ...suggestedWallKit('existing-tile'),
    ...suggestedExtraKit(),
  };
  return {
    wallSf: 42,
    edgeLf: 18,
    outlets: 6,
    scope: 'demo-and-replace',
    pattern: 'herringbone',
    wall: 'existing-tile',
    travelMiles: 16,
    includeCooktop: true,
    includeSchluter: true,
    includeAccent: false,
    hourlyWage: 38,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 95,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.2, 8, 0.035) - (1.2 + 0.28)) < 1e-9);
  assert.throws(() => travelHours('x', 8, 0.035), /must be a number/);
});

test('the cheap special is subway tile-only, not a herringbone demo', () => {
  const result = calculateBid(special());
  assert.equal(result.wallSf, 30);
  assert.equal(result.hoursPrep, 0);
  assert.equal(result.hoursDemo, 0);
  assert.equal(result.hoursCooktop, 0);
  assert.equal(result.hoursSchluter, 0);
  assert.equal(result.hoursAccent, 0);
  assert.equal(result.boardMaterial, 0);
  assert.equal(result.cooktopMaterial, 0);
  assert.ok(result.hoursTile > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.hoursOutlets > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerSf > 18 && result.pricePerSf < 90);
});

test('a herringbone demo job is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.wallSf, 42);
  assert.ok(heavy.hoursTile > cheap.hoursTile);
  assert.ok(heavy.hoursPrep > 0);
  assert.ok(heavy.hoursDemo > 0);
  assert.ok(heavy.hoursCooktop > 0);
  assert.ok(heavy.hoursSchluter > 0);
  assert.ok(heavy.boardMaterial > 0);
  assert.ok(heavy.cooktopMaterial > 0);
  assert.ok(heavy.schluterMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerSf * heavy.wallSf,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.wallSf > cheap.price / cheap.wallSf);
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
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareScope prices three scopes on the same wall', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const tileOnly = rows.find((row) => row.scope === 'tile-only');
  const prep = rows.find((row) => row.scope === 'new-prep');
  const demo = rows.find((row) => row.scope === 'demo-and-replace');
  assert.ok(prep.price > tileOnly.price);
  assert.ok(demo.price > tileOnly.price);
  assert.ok(demo.hoursDemo > tileOnly.hoursDemo);
  assert.ok(prep.boardMaterial > tileOnly.boardMaterial);
  assert.ok(demo.delta > 0);
});

test('travel miles add hours and invoice without changing the wall', () => {
  const near = calculateBid({ ...special(), travelMiles: 8 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursTile, near.hoursTile);
  assert.equal(far.wallSf, near.wallSf);
});

test('pattern waste buys more tile than the measured wall', () => {
  const subway = calculateBid(special());
  const herringbone = calculateBid({
    ...special(),
    pattern: 'herringbone',
    ...suggestedPatternKit('herringbone'),
  });
  assert.ok(subway.buySf > subway.wallSf);
  assert.ok(herringbone.buySf > subway.buySf);
  assert.ok(herringbone.tileMaterial > subway.tileMaterial);
  assert.ok(herringbone.hoursTile > subway.hoursTile);
});

test('unknown scope, pattern, wall, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'walk-in-shower' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), pattern: 'pebble-tec' }), /Unknown pattern/);
  assert.throws(() => calculateBid({ ...special(), wall: 'slab' }), /Unknown wall/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('walk-in-shower'), /Unknown scope/);
  assert.throws(() => suggestedPatternKit('pebble-tec'), /Unknown pattern/);
  assert.throws(() => suggestedWallKit('slab'), /Unknown wall/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedPatternKit(preset.pattern),
      ...suggestedWallKit(preset.wall),
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
    assert.ok(result.wallSf > 0, preset.label);
  }
});

test('the customer summary names the wall and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Subway kitchen splash');
  assert.match(text, /KITCHEN TILE BACKSPLASH BID/);
  assert.match(text, /Subway kitchen splash/);
  assert.match(text, /Tile only/i);
  assert.match(text, /subway/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a tile specification/i);
});
