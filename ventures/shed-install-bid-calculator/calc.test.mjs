import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  comparePad,
  formatBidSummary,
  shedAreaSqFt,
  padAreaSqFt,
  cubicYards,
  deliveryHours,
  suggestedFulfillmentKit,
  suggestedPadKit,
  suggestedAccessKit,
  suggestedElectricalKit,
  suggestedExtraKit,
  JOB_PRESETS,
} from './calc.mjs';

function special() {
  const kit = {
    ...suggestedFulfillmentKit('dropset'),
    ...suggestedPadKit('existing'),
    ...suggestedAccessKit('forklift'),
    ...suggestedElectricalKit('none'),
    ...suggestedExtraKit(),
  };
  return {
    lengthFt: 12,
    widthFt: 10,
    fulfillment: 'dropset',
    pad: 'existing',
    access: 'forklift',
    electrical: 'none',
    deliveryMiles: 15,
    extraWindows: 0,
    extraDoors: 0,
    ramp: false,
    loft: false,
    haulAway: false,
    hourlyWage: 26,
    burdenRate: 28,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 85,
    otherCost: 0,
    ...kit,
  };
}

function losingJob() {
  const kit = {
    ...suggestedFulfillmentKit('kit'),
    ...suggestedPadKit('gravel'),
    ...suggestedAccessKit('crane'),
    ...suggestedElectricalKit('lights'),
    ...suggestedExtraKit(),
  };
  return {
    lengthFt: 16,
    widthFt: 12,
    fulfillment: 'kit',
    pad: 'gravel',
    access: 'crane',
    electrical: 'lights',
    deliveryMiles: 40,
    extraWindows: 2,
    extraDoors: 1,
    ramp: true,
    loft: true,
    haulAway: true,
    hourlyWage: 26,
    burdenRate: 28,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 160,
    otherCost: 0,
    ...kit,
  };
}

test('area, pad, yards, and delivery hours stack in that order', () => {
  assert.equal(shedAreaSqFt(12, 10), 120);
  assert.equal(padAreaSqFt(12, 10, 1), 14 * 12);
  assert.ok(Math.abs(cubicYards(168, 4) - 168 * (4 / 12) / 27) < 1e-9);
  assert.ok(Math.abs(deliveryHours(2.2, 15, 0.04) - (2.2 + 0.6)) < 1e-9);
  assert.throws(() => deliveryHours('x', 15, 0.04), /must be a number/);
});

test('the cheap special is a drop-and-set on an existing pad, not a kit plus gravel', () => {
  const result = calculateBid(special());
  assert.equal(result.areaSqFt, 120);
  assert.equal(result.billedPadSqFt, 0);
  assert.equal(result.padCy, 0);
  assert.equal(result.gravelCy, 0);
  assert.equal(result.hoursPad, 0);
  assert.equal(result.hoursRamp, 0);
  assert.equal(result.hoursLoft, 0);
  assert.equal(result.hoursHaulAway, 0);
  assert.ok(result.hoursSet > 0);
  assert.ok(result.hoursDelivery > 0);
  assert.ok(result.shedMaterial > 0);
  assert.ok(result.shares.shed > result.shares.extra);
  assert.ok(result.pricePerSqFt > 20 && result.pricePerSqFt < 80);
});

test('a lofted kit on a new gravel pad with a crane is a different job than the cheap special', () => {
  const cheap = calculateBid(special());
  const heavy = calculateBid(losingJob());
  assert.equal(heavy.areaSqFt, 192);
  assert.ok(heavy.billedPadSqFt > heavy.areaSqFt);
  assert.ok(heavy.gravelCy > 0);
  assert.equal(heavy.slabCy, 0);
  assert.ok(heavy.hoursPad > cheap.hoursPad);
  assert.ok(heavy.hoursBuild > cheap.hoursBuild);
  assert.ok(heavy.hoursAccess > cheap.hoursAccess);
  assert.ok(heavy.hoursDelivery > cheap.hoursDelivery);
  assert.ok(heavy.hoursRamp > 0);
  assert.ok(heavy.hoursLoft > 0);
  assert.ok(heavy.hoursHaulAway > 0);
  assert.ok(heavy.accessEquipment > 0);
  assert.ok(heavy.electricalPackage > 0);
  assert.ok(heavy.shares.extra > cheap.shares.extra);
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
  assert.equal(result.loadedWage, 26 * 1.28);
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

test('comparePad prices three pads on the same shed', () => {
  const rows = comparePad(special());
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row, index) => index === 0 || row.price >= rows[index - 1].price));
  assert.equal(rows.filter((row) => row.cheapest).length, 1);
  const existing = rows.find((row) => row.pad === 'existing');
  const slab = rows.find((row) => row.pad === 'slab');
  assert.ok(slab.price > existing.price);
  assert.ok(slab.padMaterial > existing.padMaterial);
  assert.ok(slab.delta > 0);
});

test('delivery miles add hours and invoice without changing the pad', () => {
  const near = calculateBid({ ...special(), deliveryMiles: 10 });
  const far = calculateBid({ ...special(), deliveryMiles: 40 });
  assert.ok(far.hoursDelivery > near.hoursDelivery);
  assert.ok(far.deliveryInvoice > near.deliveryInvoice);
  assert.equal(far.hoursPad, near.hoursPad);
  assert.equal(far.billedPadSqFt, near.billedPadSqFt);
});

test('unknown fulfillment, pad, access, electrical, or a 100% margin is rejected', () => {
  assert.throws(() => calculateBid({ ...special(), fulfillment: 'polebarn' }), /Unknown fulfillment/);
  assert.throws(() => calculateBid({ ...special(), pad: 'pavers' }), /Unknown pad/);
  assert.throws(() => calculateBid({ ...special(), access: 'helicopter' }), /Unknown access/);
  assert.throws(() => calculateBid({ ...special(), electrical: 'solar' }), /Unknown electrical/);
  assert.throws(() => calculateBid({ ...special(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => suggestedFulfillmentKit('polebarn'), /Unknown fulfillment/);
  assert.throws(() => suggestedPadKit('pavers'), /Unknown pad/);
  assert.throws(() => suggestedAccessKit('helicopter'), /Unknown access/);
  assert.throws(() => suggestedElectricalKit('solar'), /Unknown electrical/);
});

test('every shipped job preset calculates without throwing', () => {
  for (const preset of JOB_PRESETS) {
    const kit = {
      ...suggestedFulfillmentKit(preset.fulfillment),
      ...suggestedPadKit(preset.pad),
      ...suggestedAccessKit(preset.access),
      ...suggestedElectricalKit(preset.electrical),
      ...suggestedExtraKit(),
    };
    const result = calculateBid({
      ...preset,
      hourlyWage: 26,
      burdenRate: 28,
      overheadRate: 15,
      targetMargin: 20,
      travelAndEquipment: 85,
      otherCost: 0,
      ...kit,
    });
    assert.ok(result.price > 0, preset.label);
    assert.ok(result.areaSqFt > 0, preset.label);
  }
});

test('the customer summary names the shed and omits wages', () => {
  const text = formatBidSummary(calculateBid(special()), 'Garden shed');
  assert.match(text, /BACKYARD SHED INSTALL BID/);
  assert.match(text, /Garden shed/);
  assert.match(text, /drop-and-set/i);
  assert.match(text, /Existing pad/i);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
  assert.match(text, /not a structural specification/i);
});
