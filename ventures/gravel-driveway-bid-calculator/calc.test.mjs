import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  compareStone,
  formatBidSummary,
  drivewayAreaSqFt,
  looseCubicYards,
  orderedCubicYards,
  orderedTons,
  truckLoads,
  fabricSqYd,
  suggestedStoneKit,
  suggestedPrepKit,
  suggestedDeliveryKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedStoneKit('crusher-run'),
    ...suggestedPrepKit('none'),
    ...suggestedDeliveryKit('pickup'),
  };
  return {
    stone: 'crusher-run',
    lengthFt: 50,
    widthFt: 12,
    depthIn: 4,
    compactionPercent: 25,
    prep: 'none',
    delivery: 'pickup',
    slope: false,
    fabric: false,
    apron: false,
    culvert: false,
    hourlyWage: 24,
    burdenRate: 28,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 55,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedStoneKit('recycled'),
    ...suggestedPrepKit('excavate-haul'),
    ...suggestedDeliveryKit('delivered'),
  };
  return {
    stone: 'recycled',
    lengthFt: 80,
    widthFt: 14,
    depthIn: 8,
    compactionPercent: 30,
    prep: 'excavate-haul',
    delivery: 'delivered',
    slope: true,
    fabric: true,
    apron: true,
    culvert: true,
    hourlyWage: 24,
    burdenRate: 28,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 95,
    otherCost: 0,
    ...kit,
  };
}

test('area, loose yards, compaction, and tons stack in that order', () => {
  assert.equal(drivewayAreaSqFt(50, 12), 600);
  // 600 sq ft × 4 in / 12 / 27 = 7.407… cy
  assert.ok(Math.abs(looseCubicYards(600, 4) - 600 * (4 / 12) / 27) < 1e-9);
  assert.equal(orderedCubicYards(8, 25), 10);
  assert.equal(orderedTons(10, 1.5), 15);
  assert.throws(() => orderedTons(10, 0), /greater than zero/);
});

test('truck loads are zero on pickup and one load at a time on delivery', () => {
  assert.equal(truckLoads(15, 16, 'pickup'), 0);
  assert.equal(truckLoads(15, 16, 'delivered'), 1);
  assert.equal(truckLoads(17, 16, 'delivered'), 2);
  assert.equal(truckLoads(0, 16, 'delivered'), 0);
  assert.throws(() => truckLoads(15, 16, 'drone'), /Unknown delivery/);
});

test('fabric yards apply overlap to the drive, not a second roll size', () => {
  assert.ok(Math.abs(fabricSqYd(900, 10) - 110) < 1e-9);
  assert.equal(fabricSqYd(0, 10), 0);
});

test('the cheap special is mostly stone and spread, not dirt work', () => {
  const result = calculateBid(special());
  assert.equal(result.areaSqFt, 600);
  assert.ok(Math.abs(result.looseCy - 600 * (4 / 12) / 27) < 1e-9);
  assert.ok(Math.abs(result.orderedCy - result.looseCy * 1.25) < 1e-9);
  assert.ok(result.neededTons > 10 && result.neededTons < 15);
  assert.equal(result.loads, 0);
  assert.equal(result.hoursGrade, 0);
  assert.equal(result.leftoverTons, 0);
  assert.ok(result.hoursSpread > 1 && result.hoursSpread < 2);
  assert.ok(result.shares.stone > result.shares.extra);
  assert.ok(result.pricePerSqFt > 0.8 && result.pricePerSqFt < 4);
});

test('excavate-and-haul recycled on a slope is a different job than the special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.areaSqFt, 1120);
  assert.ok(heavy.paidTons > cheap.paidTons);
  assert.ok(heavy.hoursGrade > 2, `grade hours were ${heavy.hoursGrade}`);
  assert.ok(heavy.loads >= 2);
  assert.ok(heavy.leftoverTons > 0);
  assert.ok(heavy.dumpMaterial > 0);
  assert.ok(heavy.fabricMaterial > 0);
  assert.ok(heavy.apronMaterial > 0);
  assert.ok(heavy.culvertMaterial > 0);
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
  assert.equal(result.loadedWage, 24 * 1.28);
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

test('compareStone prices four stones on the same drive', () => {
  const rows = compareStone(special());
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const crusher = rows.find((row) => row.stone === 'crusher-run');
  const pea = rows.find((row) => row.stone === 'pea-gravel');
  assert.ok(pea.price > crusher.price);
  assert.ok(pea.stoneMaterial > crusher.stoneMaterial);
  assert.ok(pea.delta > 0);
});

test('slope adds 20% only to grade and spread hours', () => {
  const flat = calculateBid({ ...losingJob(), slope: false });
  const sloped = calculateBid({ ...losingJob(), slope: true });
  assert.ok(Math.abs(sloped.hoursGrade / flat.hoursGrade - 1.2) < 1e-9);
  assert.ok(Math.abs(sloped.hoursSpread / flat.hoursSpread - 1.2) < 1e-9);
  assert.equal(sloped.hoursTrip, flat.hoursTrip);
  assert.equal(sloped.hoursApron, flat.hoursApron);
  assert.equal(sloped.hoursCulvert, flat.hoursCulvert);
});

test('unknown stone, prep, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), stone: 'hot-mix' }), /Unknown stone/);
  assert.throws(() => calculateBid({ ...special(), prep: 'nuke' }), /Unknown prep/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedStoneKit('hot-mix'), /Unknown stone/);
  assert.throws(() => suggestedPrepKit('nuke'), /Unknown prep/);
  assert.throws(() => suggestedDeliveryKit('drone'), /Unknown delivery/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedStoneKit(preset.stone),
      ...suggestedPrepKit(preset.prep),
      ...suggestedDeliveryKit(preset.delivery),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 24,
      burdenRate: 28,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 55,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.neededTons > 0, preset.label);
  }
});

test('the customer summary names the drive and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Front drive');
  assert.match(text, /GRAVEL DRIVEWAY BID/);
  assert.match(text, /Front drive/);
  assert.match(text, /Crusher run/);
  assert.match(text, /4"/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a civil specification/i);
});
