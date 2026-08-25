import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareScope,
  compareDoor,
  formatBidSummary,
  travelHours,
  suggestedScopeKit,
  suggestedDoorKit,
  suggestedSizeKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedScopeKit('hang-only'),
    ...suggestedDoorKit('hollow-slab'),
    ...suggestedSizeKit('80-single'),
    ...suggestedExtraKit(),
  };
  return {
    doorCount: 1,
    scope: 'hang-only',
    door: 'hollow-slab',
    size: '80-single',
    travelMiles: 6,
    includePaint: false,
    includeHaul: false,
    includeHardware: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 45,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedScopeKit('pocket-conversion'),
    ...suggestedDoorKit('french-or-barn'),
    ...suggestedSizeKit('96-single'),
    ...suggestedExtraKit(),
  };
  return {
    doorCount: 1,
    scope: 'pocket-conversion',
    door: 'french-or-barn',
    size: '96-single',
    travelMiles: 18,
    includePaint: true,
    includeHaul: true,
    includeHardware: true,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 85,
    otherCost: 0,
    ...kit,
  };
}

test('travel hours stack trip plus miles', () => {
  assert.ok(Math.abs(travelHours(0.8, 6, 0.035) - (0.8 + 0.21)) < 1e-9);
  assert.throws(() => travelHours('x', 6, 0.035), /must be a number/);
});

test('the cheap special is a hollow-slab 80-inch hang, not a pocket conversion', () => {
  const result = calculateBid(special());
  assert.equal(result.doorCount, 1);
  assert.equal(result.hoursFrame, 0);
  assert.equal(result.hoursSize, 0);
  assert.equal(result.hoursPaint, 0);
  assert.equal(result.hoursHaul, 0);
  assert.equal(result.hoursHardware, 0);
  assert.equal(result.frameMaterial, 0);
  assert.equal(result.extraLeafMaterial, 0);
  assert.equal(result.paintMaterial, 0);
  assert.equal(result.haulMaterial, 0);
  assert.equal(result.hardwareMaterial, 0);
  assert.ok(result.hoursHang > 0);
  assert.ok(result.hoursTravel > 0);
  assert.ok(result.shares.finish + result.shares.labor > result.shares.extra);
  assert.ok(result.pricePerDoor > 120 && result.pricePerDoor < 550);
});

test('a pocket-conversion French 8-foot is a different bid than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.doorCount, 1);
  assert.ok(heavy.hoursHang > 0);
  assert.ok(heavy.hoursFrame > 0);
  assert.ok(heavy.hoursSize > 0);
  assert.ok(heavy.hoursPaint > 0);
  assert.ok(heavy.hoursHaul > 0);
  assert.ok(heavy.hoursHardware > 0);
  assert.ok(heavy.hoursType > cheap.hoursType);
  assert.ok(heavy.frameMaterial > 0);
  assert.ok(heavy.extraLeafMaterial > 0);
  assert.ok(heavy.paintMaterial > 0);
  assert.ok(heavy.haulMaterial > 0);
  assert.ok(heavy.hardwareMaterial > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
  const matchedSpecial = calculateBid({
    ...losingJob(),
    proposedPrice: cheap.pricePerDoor * heavy.doorCount,
  });
  assert.equal(matchedSpecial.proposed.belowBreakEven, true);
  assert.ok(matchedSpecial.proposed.profit < 0);
  assert.ok(heavy.price / heavy.doorCount > cheap.price / cheap.doorCount);
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
  const scored = calculateBid({ ...special(), proposedPrice: bid.totalCost - 50 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
  assert.ok(scored.proposed.margin < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(special()).proposed, null);
  assert.equal(calculateBid({ ...special(), proposedPrice: '' }).proposed, null);
});

test('compareScope prices four scopes on the same opening', () => {
  const rows = compareScope(losingJob());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const hang = rows.find((row) => row.scope === 'hang-only');
  const swap = rows.find((row) => row.scope === 'prehung-swap');
  const framed = rows.find((row) => row.scope === 'new-opening');
  const pocket = rows.find((row) => row.scope === 'pocket-conversion');
  assert.ok(swap.price > hang.price);
  assert.ok(framed.price > hang.price);
  assert.ok(pocket.price > hang.price);
  assert.ok(pocket.hoursFrame > hang.hoursFrame);
  assert.ok(pocket.frameMaterial > hang.frameMaterial);
  assert.ok(swap.casingMaterial > hang.casingMaterial);
  assert.ok(pocket.delta > 0);
});

test('compareDoor prices four leaves on the same opening', () => {
  const rows = compareDoor(special());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const slab = rows.find((row) => row.door === 'hollow-slab');
  const prehung = rows.find((row) => row.door === 'hollow-prehung');
  const solid = rows.find((row) => row.door === 'solid-core');
  const french = rows.find((row) => row.door === 'french-or-barn');
  assert.ok(slab);
  assert.ok(prehung.price > slab.price);
  assert.ok(solid.price > slab.price);
  assert.ok(french.price > slab.price);
  assert.ok(solid.hoursType > slab.hoursType);
  assert.ok(french.leafMaterial > slab.leafMaterial);
  assert.ok(prehung.upgradeFromSlab > 0);
  assert.equal(slab.upgradeFromSlab, 0);
  assert.ok(slab.cheapest);
  assert.ok(prehung.delta > 0);
});

test('compareDoor keeps the current scope and does not reuse a typed door rate', () => {
  const pocketRows = compareDoor(losingJob());
  const cheapRows = compareDoor(special());
  const pocketSlab = pocketRows.find((row) => row.door === 'hollow-slab');
  const cheapSlab = cheapRows.find((row) => row.door === 'hollow-slab');
  assert.ok(pocketSlab.price > cheapSlab.price);
  const overridden = compareDoor({
    ...special(),
    hoursTypePerDoor: 9,
    doorInvoice: 4000,
  });
  const slab = overridden.find((row) => row.door === 'hollow-slab');
  const baseline = compareDoor(special()).find((row) => row.door === 'hollow-slab');
  assert.ok(Math.abs(slab.price - baseline.price) < 1e-9);
});

test('travel miles add hours and invoice without changing the opening', () => {
  const near = calculateBid({ ...special(), travelMiles: 6 });
  const far = calculateBid({ ...special(), travelMiles: 40 });
  assert.ok(far.hoursTravel > near.hoursTravel);
  assert.ok(far.travelInvoice > near.travelInvoice);
  assert.equal(far.hoursHang, near.hoursHang);
  assert.equal(far.doorCount, near.doorCount);
});

test('a second door on the same trip scales the opening, not the drive', () => {
  const one = calculateBid(special());
  const two = calculateBid({ ...special(), doorCount: 2 });
  assert.equal(two.hoursTravel, one.hoursTravel);
  assert.ok(Math.abs(two.hoursHang - one.hoursHang * 2) < 1e-9);
  assert.ok(Math.abs(two.leafMaterial - one.leafMaterial * 2) < 1e-9);
  assert.ok(two.price > one.price);
  assert.ok(two.price < one.price * 2);
});

test('paint, haul, and hardware stack instead of replacing the leaf', () => {
  const base = calculateBid(special());
  const extras = calculateBid({
    ...special(),
    includePaint: true,
    includeHaul: true,
    includeHardware: true,
  });
  assert.equal(base.paintMaterial, 0);
  assert.equal(base.haulMaterial, 0);
  assert.equal(base.hardwareMaterial, 0);
  assert.ok(extras.paintMaterial > 0);
  assert.ok(extras.haulMaterial > 0);
  assert.ok(extras.hardwareMaterial > 0);
  assert.ok(extras.hoursPaint > 0);
  assert.ok(extras.price > base.price);
  assert.equal(extras.leafMaterial, base.leafMaterial);
});

test('unknown scope, door, size, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), scope: 'entry-door' }), /Unknown scope/);
  assert.throws(() => calculateBid({ ...special(), door: 'steel-entry' }), /Unknown door/);
  assert.throws(() => calculateBid({ ...special(), size: 'garage-16' }), /Unknown size/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedScopeKit('entry-door'), /Unknown scope/);
  assert.throws(() => suggestedDoorKit('steel-entry'), /Unknown door/);
  assert.throws(() => suggestedSizeKit('garage-16'), /Unknown size/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedDoorKit(preset.door),
      ...suggestedSizeKit(preset.size),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 42,
      burdenRate: 30,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 45,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.doorCount > 0, preset.label);
  }
});

test('the customer summary names the opening and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Hall closet slab');
  assert.match(text, /INTERIOR DOOR REPLACEMENT BID/);
  assert.match(text, /Hall closet slab/);
  assert.match(text, /Hang only/i);
  assert.match(text, /hollow-core/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a building-code determination/i);
});
