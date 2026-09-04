import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  extraDepthFt,
  suggestedMethod,
  JOB_PRESETS,
} from './calc.mjs';

function shopRates() {
  return {
    hoursInteriorPerPier: 1.6,
    hoursPoorAccess: 3.5,
    hoursPerStrap: 2.8,
    hoursPerIBeam: 4.2,
    hoursPerGradeBeamLf: 0.45,
    hoursPer100Slab: 1.8,
    hoursEngineering: 2.5,
    hoursPlumbingReroute: 3.5,
    siteHours: 3,
    extraDepthCostPerFt: 18,
    interiorBracketCost: 95,
    strapCostEach: 185,
    iBeamCostEach: 420,
    gradeBeamCostPerLf: 28,
    slabJackCostPerSqFt: 8,
    engineeringFee: 850,
    permitFee: 275,
    plumbingAllowance: 650,
    hourlyWage: 42,
    burdenRate: 34,
    travelAndEquipment: 285,
    overheadRate: 16,
    targetMargin: 28,
  };
}

function brochureJob() {
  return {
    ...shopRates(),
    ...suggestedMethod('helical'),
    pierCount: 8,
    averageDepthFt: 12,
    interiorAccess: false,
    poorAccess: false,
    engineeringStamp: false,
    carbonFiberStraps: 0,
    steelIBeams: 0,
    gradeBeamLf: 0,
    slabJackingSqFt: 0,
    plumbingReroute: false,
  };
}

function interiorTrap() {
  return {
    ...shopRates(),
    ...suggestedMethod('helical'),
    pierCount: 6,
    averageDepthFt: 14,
    interiorAccess: true,
    poorAccess: false,
    engineeringStamp: true,
    carbonFiberStraps: 4,
    steelIBeams: 0,
    gradeBeamLf: 0,
    slabJackingSqFt: 0,
    plumbingReroute: true,
  };
}

test('a 6-pier interior house can cost more than an 8-pier brochure job', () => {
  const brochure = calculateBid(brochureJob());
  const trap = calculateBid(interiorTrap());

  assert.ok(trap.pierCount < brochure.pierCount);
  assert.ok(trap.price > brochure.price);
  assert.ok(trap.pricePerPier > brochure.pricePerPier);
  assert.ok(trap.interiorHours > 0);
  assert.equal(brochure.interiorHours, 0);
  assert.ok(trap.wallHours > brochure.wallHours);
  assert.ok(trap.engineeringHours > brochure.engineeringHours);
});

test('extra shaft is only the footage past the included depth, not the whole stick', () => {
  assert.equal(extraDepthFt(12, 10), 2);
  assert.equal(extraDepthFt(8, 10), 0);
  const result = calculateBid(brochureJob());
  assert.equal(result.extraFtEach, 2);
  assert.equal(result.extraDepthLf, 16);
  assert.ok(Math.abs(result.extraDepthMaterial - 16 * 18) < 1e-9);
});

test('preset helpers return the published starting points', () => {
  assert.equal(suggestedMethod('helical').hoursPerPier, 2.4);
  assert.equal(suggestedMethod('push').hoursPerPier, 1.8);
  assert.equal(suggestedMethod('wall_stabilize').pierCostEach, 0);
});

test('labor hours come from access, straps, and engineering, not pier count alone', () => {
  const result = calculateBid(interiorTrap());
  // piers 6*2.4 = 14.4
  // depth 6*14*0.08 = 6.72
  // interior 6*1.6 = 9.6
  // straps 4*2.8 = 11.2
  // engineering 2.5, plumbing 3.5, site 3
  const expected = 14.4 + 6.72 + 9.6 + 11.2 + 2.5 + 3.5 + 3;
  assert.ok(Math.abs(result.totalHours - expected) < 1e-9);
  assert.ok(result.interiorHours + result.wallHours + result.softHours > result.pierHours);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(brochureJob());
  assert.equal(result.loadedWage, 42 * 1.34);

  const direct = result.laborCost + result.materialCost + 285;
  assert.ok(Math.abs(result.overhead - direct * 0.16) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.16) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 28) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...brochureJob(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(brochureJob());
  const scored = calculateBid({ ...brochureJob(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 28) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(brochureJob());
  const scored = calculateBid({ ...brochureJob(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(brochureJob()).proposed, null);
  assert.equal(calculateBid({ ...brochureJob(), proposedPrice: '' }).proposed, null);
});

test('rejects a takeoff with no piers and no wall or slab work', () => {
  assert.throws(
    () => calculateBid({ ...brochureJob(), pierCount: 0, carbonFiberStraps: 0 }),
    /piers, wall straps, I-beams, grade beam, or slab jacking/,
  );
});

test('rejects a margin of 100% or more', () => {
  assert.throws(() => calculateBid({ ...brochureJob(), targetMargin: 100 }), /less than 100/);
});

test('rejects non-finite inputs', () => {
  assert.throws(() => calculateBid({ ...brochureJob(), pierCount: 'settled' }), /must be a number/);
});

test('unknown method ids fail closed', () => {
  assert.throws(() => suggestedMethod('mudjack_only'), /Unknown foundation-repair method/);
});

test('boolean flags accept form-string true/false and 1/0', () => {
  const asString = calculateBid({ ...brochureJob(), interiorAccess: 'true' });
  const asNumber = calculateBid({ ...brochureJob(), interiorAccess: 1 });
  const off = calculateBid({ ...brochureJob(), interiorAccess: 'false' });
  assert.equal(asString.interiorAccess, true);
  assert.equal(asNumber.interiorAccess, true);
  assert.equal(off.interiorAccess, false);
  assert.ok(asString.interiorHours > off.interiorHours);
});

test('customer-facing summary omits wages and invoice costs', () => {
  const text = formatBidSummary(calculateBid(brochureJob()), 'Helical piers (exterior or interior brackets)');
  assert.match(text, /FOUNDATION REPAIR BID/);
  assert.match(text, /Proposed foundation-repair price/);
  assert.doesNotMatch(text, /42/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
});

test('push-pier hours on the same count stay below helical hours', () => {
  const helical = calculateBid(brochureJob());
  const push = calculateBid({
    ...brochureJob(),
    ...suggestedMethod('push'),
  });
  assert.ok(push.pierHours < helical.pierHours);
  assert.ok(push.price < helical.price);
});

test('a bowed-wall-only job prices without inventing piers', () => {
  const result = calculateBid({
    ...shopRates(),
    ...suggestedMethod('wall_stabilize'),
    pierCount: 0,
    averageDepthFt: 0,
    interiorAccess: true,
    poorAccess: false,
    engineeringStamp: true,
    carbonFiberStraps: 8,
    steelIBeams: 0,
    gradeBeamLf: 0,
    slabJackingSqFt: 0,
    plumbingReroute: false,
  });
  assert.equal(result.pierCount, 0);
  assert.equal(result.pricePerPier, null);
  assert.equal(result.wallHours, 8 * 2.8);
  assert.ok(result.price > result.totalCost);
  assert.ok(result.engineeringHours > 0);
});

test('every job preset produces a finite bid a contractor can send', () => {
  for (const job of JOB_PRESETS) {
    const result = calculateBid({
      ...shopRates(),
      ...suggestedMethod(job.methodId),
      pierCount: job.pierCount,
      averageDepthFt: job.averageDepthFt,
      interiorAccess: job.interiorAccess,
      poorAccess: job.poorAccess,
      engineeringStamp: job.engineeringStamp,
      carbonFiberStraps: job.carbonFiberStraps,
      steelIBeams: job.steelIBeams,
      gradeBeamLf: job.gradeBeamLf,
      slabJackingSqFt: job.slabJackingSqFt,
      plumbingReroute: job.plumbingReroute,
    });
    assert.ok(Number.isFinite(result.price), job.label);
    assert.ok(result.price > result.totalCost, job.label);
    assert.ok(result.totalHours > 0, job.label);
  }
});
