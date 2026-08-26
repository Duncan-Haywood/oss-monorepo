import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  formatBidSummary,
  travelHours,
  heightFactor,
  suggestedScopeKit,
  suggestedCeilingKit,
  suggestedFloorKit,
  suggestedBathKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('rec-room'),
    ...suggestedCeilingKit('drop-ceiling'),
    ...suggestedFloorKit('carpet'),
    ...suggestedBathKit('none'),
    ...suggestedExtraKit(),
  };
  return {
    finishedSf: 800,
    ceilingHeightFt: 8,
    egressWindows: 0,
    bedrooms: 0,
    scope: 'rec-room',
    ceiling: 'drop-ceiling',
    floor: 'carpet',
    bath: 'none',
    travelMiles: 12,
    includeStairsRebuild: false,
    includeWetBar: false,
    includeHvacExtend: false,
    includePermit: false,
    hourlyWage: 38,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 180,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedScopeKit('legal-living'),
    ...suggestedCeilingKit('drywall-ceiling'),
    ...suggestedFloorKit('lvp'),
    ...suggestedBathKit('full'),
    ...suggestedExtraKit(),
  };
  return {
    finishedSf: 1000,
    ceilingHeightFt: 8,
    egressWindows: 2,
    bedrooms: 2,
    scope: 'legal-living',
    ceiling: 'drywall-ceiling',
    floor: 'lvp',
    bath: 'full',
    travelMiles: 20,
    includeStairsRebuild: false,
    includeWetBar: false,
    includeHvacExtend: true,
    includePermit: true,
    hourlyWage: 38,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 320,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(1.4, 12, 0.035) - (1.4 + 0.42)) < 1e-9);
  assert.throws(() => travelHours('x', 12, 0.035), /must be a number/);
});

test('height factor is ceiling height over eight feet', () => {
  assert.equal(heightFactor(8), 1);
  assert.equal(heightFactor(9), 1.125);
  assert.equal(heightFactor(7), 0.875);
});

test('the cheap special is a rec-room, not a legal-living suite', () => {
  const result = calculateBid(special());
  assert.equal(result.finishedSf, 800);
  assert.equal(result.hoursBath, 0);
  assert.equal(result.hoursEgress, 0);
  assert.equal(result.hoursBedrooms, 0);
  assert.equal(result.hoursStairs, 0);
  assert.equal(result.hoursWetBar, 0);
  assert.equal(result.hoursHvac, 0);
  assert.equal(result.hoursPermit, 0);
  assert.equal(result.frameMaterial, 0);
  assert.equal(result.bathMaterial, 0);
  assert.ok(result.hoursShell > 0);
  assert.ok(result.hoursCeiling > 0);
  assert.ok(result.hoursFloor > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerSf > 18 && result.pricePerSf < 55);
});

test('a legal-living suite is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.finishedSf, 1000);
  assert.ok(heavy.hoursShell > cheap.hoursShell);
  assert.ok(heavy.hoursCeiling > cheap.hoursCeiling);
  assert.ok(heavy.hoursFloor > cheap.hoursFloor);
  assert.ok(heavy.hoursBath > 0);
  assert.ok(heavy.hoursEgress > 0);
  assert.ok(heavy.hoursBedrooms > 0);
  assert.ok(heavy.hoursHvac > 0);
  assert.ok(heavy.hoursPermit > 0);
  assert.ok(heavy.frameMaterial > 0);
  assert.ok(heavy.bathMaterial > 0);
  assert.ok(heavy.hvacMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerSf * heavy.finishedSf,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.finishedSf > cheap.price / cheap.finishedSf);
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

test('compareScope prices three scopes on the same basement', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const rec = rows.find((row) => row.scope === 'rec-room');
  const framed = rows.find((row) => row.scope === 'framed-finish');
  const legal = rows.find((row) => row.scope === 'legal-living');
  assert.ok(framed.price > rec.price);
  assert.ok(legal.price > rec.price);
  assert.ok(legal.hoursShell > rec.hoursShell);
  assert.ok(framed.frameMaterial > rec.frameMaterial);
  assert.ok(legal.delta > 0);
});

test('travel miles add hours and invoice without changing the finished SF', () => {
  const near = calculateBid({ ...special(), travelMiles: 12 });
  const far = calculateBid({ ...special(), travelMiles: 48 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursShell, near.hoursShell);
  assert.equal(far.finishedSf, near.finishedSf);
});

test('a taller ceiling buys more shell and ceiling hours', () => {
  const eight = calculateBid(special());
  const nine = calculateBid({ ...special(), ceilingHeightFt: 9 });
  assert.ok(nine.hoursShell > eight.hoursShell);
  assert.ok(nine.hoursCeiling > eight.hoursCeiling);
  assert.equal(nine.hoursFloor, eight.hoursFloor);
  assert.ok(Math.abs(nine.heightFactor - 1.125) < 1e-9);
});

test('floor waste buys more covering than the measured finished SF', () => {
  const carpet = calculateBid(special());
  const lvp = calculateBid({
    ...special(),
    floor: 'lvp',
    ...suggestedFloorKit('lvp'),
  });
  assert.ok(carpet.buySf > carpet.finishedSf);
  assert.ok(lvp.buySf > carpet.buySf);
  assert.ok(lvp.floorMaterial > carpet.floorMaterial);
  assert.ok(lvp.hoursFloor > carpet.hoursFloor);
});

test('unknown scope, ceiling, floor, bath, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'waterproofing' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), ceiling: 'coffered' }), /Unknown ceiling/);
  assert.throws(() => calculateBid({ ...special(), floor: 'tile' }), /Unknown floor/);
  assert.throws(() => calculateBid({ ...special(), bath: 'walk-in-shower' }), /Unknown bath/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('waterproofing'), /Unknown scope/);
  assert.throws(() => suggestedCeilingKit('coffered'), /Unknown ceiling/);
  assert.throws(() => suggestedFloorKit('tile'), /Unknown floor/);
  assert.throws(() => suggestedBathKit('walk-in-shower'), /Unknown bath/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedCeilingKit(preset.ceiling),
      ...suggestedFloorKit(preset.floor),
      ...suggestedBathKit(preset.bath),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 38,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 180,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.finishedSf > 0, preset.label);
  }
});

test('the customer summary names the basement and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Rec-room finish');
  assert.match(text, /BASEMENT FINISHING BID/);
  assert.match(text, /Rec-room finish/);
  assert.match(text, /Rec room/i);
  assert.match(text, /drop ceiling/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a building-code determination/i);
});
