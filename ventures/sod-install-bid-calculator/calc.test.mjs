import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareGrass,
  formatBidSummary,
  lawnAreaSqFt,
  orderSqFt,
  palletCount,
  deliveryTrips,
  suggestedGrassKit,
  suggestedPrepKit,
  suggestedDeliveryKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedGrassKit('fescue'),
    ...suggestedPrepKit('none'),
    ...suggestedDeliveryKit('pickup'),
  };
  return {
    grass: 'fescue',
    lengthFt: 50,
    widthFt: 40,
    wastePercent: 5,
    palletCoverageSqFt: 450,
    prep: 'none',
    delivery: 'pickup',
    slope: false,
    fertilizer: true,
    roller: true,
    wateringVisits: 0,
    extraIrrigationHeads: 0,
    hourlyWage: 22,
    burdenRate: 28,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 45,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedGrassKit('zoysia'),
    ...suggestedPrepKit('strip-haul'),
    ...suggestedDeliveryKit('delivered'),
  };
  return {
    grass: 'zoysia',
    lengthFt: 100,
    widthFt: 80,
    wastePercent: 10,
    palletCoverageSqFt: 400,
    prep: 'strip-haul',
    delivery: 'delivered',
    slope: true,
    fertilizer: true,
    roller: true,
    wateringVisits: 3,
    extraIrrigationHeads: 4,
    hourlyWage: 22,
    burdenRate: 28,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 85,
    otherCost: 0,
    ...kit,
  };
}

test('pallets are sold whole and waste is applied to the lawn, not the pallet', () => {
  assert.equal(lawnAreaSqFt(50, 40), 2000);
  assert.equal(orderSqFt(2000, 5), 2100);
  // 2100 / 450 = 4.666… → 5 pallets, 2,250 sq ft paid
  assert.equal(palletCount(2100, 450), 5);
  assert.equal(palletCount(0, 450), 0);
  assert.throws(() => palletCount(100, 0), /greater than zero/);
});

test('delivery trips are zero on pickup and one truckload at a time on delivery', () => {
  assert.equal(deliveryTrips(5, 10, 'pickup'), 0);
  assert.equal(deliveryTrips(5, 10, 'delivered'), 1);
  assert.equal(deliveryTrips(11, 10, 'delivered'), 2);
  assert.equal(deliveryTrips(0, 10, 'delivered'), 0);
  assert.throws(() => deliveryTrips(5, 10, 'drone'), /Unknown delivery/);
});

test('the cheap special is mostly sod and install, not dirt work', () => {
  const result = calculateBid(special());
  assert.equal(result.areaSqFt, 2000);
  assert.equal(result.neededSqFt, 2100);
  assert.equal(result.pallets, 5);
  assert.equal(result.paidCoverageSqFt, 2250);
  assert.equal(result.leftoverSqFt, 150);
  assert.equal(result.trips, 0);
  assert.equal(result.hoursPrep, 0);
  assert.ok(result.hoursInstall > 4 && result.hoursInstall < 6);
  assert.ok(result.shares.sod > result.shares.extra);
  assert.ok(result.pricePerSqFt > 0.7 && result.pricePerSqFt < 1.6);
});

test('strip-and-haul zoysia on a slope is a different job than the special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.ok(heavy.areaSqFt === 8000);
  assert.ok(heavy.pallets > cheap.pallets);
  assert.ok(heavy.hoursPrep > 10, `prep hours were ${heavy.hoursPrep}`);
  assert.ok(heavy.trips >= 1);
  assert.ok(heavy.dumpMaterial > 0);
  assert.ok(heavy.wateringMaterial > 0);
  assert.ok(heavy.irrigationMaterial > 0);
  // Same per-foot special on the heavy job leaves the shop underwater.
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
  assert.equal(result.loadedWage, 22 * 1.28);
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

test('compareGrass prices fescue, bermuda, and zoysia on the same lawn', () => {
  const rows = compareGrass(special());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const fescue = rows.find((row) => row.grass === 'fescue');
  const zoysia = rows.find((row) => row.grass === 'zoysia');
  assert.ok(zoysia.price > fescue.price);
  assert.ok(zoysia.sodMaterial > fescue.sodMaterial);
  assert.ok(zoysia.delta > 0);
});

test('slope adds 20% only to prep and install hours', () => {
  const flat = calculateBid({ ...losingJob(), slope: false });
  const sloped = calculateBid({ ...losingJob(), slope: true });
  assert.ok(Math.abs(sloped.hoursPrep / flat.hoursPrep - 1.2) < 1e-9);
  assert.ok(Math.abs(sloped.hoursInstall / flat.hoursInstall - 1.2) < 1e-9);
  assert.equal(sloped.hoursTrip, flat.hoursTrip);
  assert.equal(sloped.hoursWatering, flat.hoursWatering);
});

test('unknown grass, prep, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), grass: 'astroturf' }), /Unknown grass/);
  assert.throws(() => calculateBid({ ...special(), prep: 'nuke' }), /Unknown prep/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedGrassKit('astroturf'), /Unknown grass/);
  assert.throws(() => suggestedPrepKit('nuke'), /Unknown prep/);
  assert.throws(() => suggestedDeliveryKit('drone'), /Unknown delivery/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedGrassKit(preset.grass),
      ...suggestedPrepKit(preset.prep),
      ...suggestedDeliveryKit(preset.delivery),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 22,
      burdenRate: 28,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 45,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.pallets >= 1, preset.label);
  }
});

test('the customer summary names the lawn and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Front yard');
  assert.match(text, /SOD INSTALLATION BID/);
  assert.match(text, /Front yard/);
  assert.match(text, /Tall fescue/);
  assert.match(text, /5/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a landscape specification/i);
});
