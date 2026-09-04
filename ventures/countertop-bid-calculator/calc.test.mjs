import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  slabCount,
  waterfallSqFt,
  backsplashSqFt,
  suggestedWastePct,
  suggestedEdgeHours,
  suggestedSinkHours,
  suggestedSlab,
  JOB_PRESETS,
  WATERFALL_HEIGHT_IN,
  WATERFALL_DEPTH_IN,
} from './calc.mjs';

function lKitchen() {
  return {
    finishedSqFt: 55,
    perimeterLf: 32,
    wastePct: 20,
    slabSqFt: 46,
    slabCost: 850,
    sinkCount: 1,
    hoursPerSink: 2,
    cooktopCount: 1,
    hoursPerCooktop: 1.5,
    faucetHoles: 3,
    hoursPerFaucet: 0.12,
    waterfallEnds: 0,
    hoursPerWaterfall: 3,
    edgeHoursPerLf: 0.22,
    backsplashLf: 18,
    backsplashHeightIn: 4,
    hoursPerBacksplashLf: 0.22,
    seams: 2,
    hoursPerSeam: 1.25,
    fieldHoursPer100: 2.5,
    installHoursPer100: 3,
    templateHours: 2,
    tearoutHours: 2.5,
    suppliesPerSqFt: 4,
    hourlyWage: 38,
    burdenRate: 30,
    travelAndEquipment: 165,
    overheadRate: 15,
    targetMargin: 25,
  };
}

test('a 28 sq ft waterfall island can consume two slabs while a larger galley consumes one', () => {
  const galley = calculateBid({
    ...lKitchen(),
    finishedSqFt: 40,
    perimeterLf: 22,
    wastePct: 12,
    sinkCount: 1,
    hoursPerSink: 0.6,
    cooktopCount: 0,
    faucetHoles: 1,
    waterfallEnds: 0,
    edgeHoursPerLf: 0.08,
    backsplashLf: 0,
    seams: 0,
    templateHours: 1.5,
    tearoutHours: 1.5,
  });
  const island = calculateBid({
    ...lKitchen(),
    finishedSqFt: 28,
    perimeterLf: 18,
    wastePct: 24,
    sinkCount: 0,
    cooktopCount: 0,
    faucetHoles: 0,
    waterfallEnds: 2,
    edgeHoursPerLf: 0.45,
    backsplashLf: 0,
    seams: 0,
    templateHours: 1.5,
    tearoutHours: 1,
  });

  assert.equal(galley.slabs, 1);
  assert.equal(island.slabs, 2);
  assert.ok(island.finishedSqFt < galley.finishedSqFt);
  assert.ok(island.slabTotal > galley.slabTotal);
  assert.ok(island.pricePerSqFt > galley.pricePerSqFt);
});

test('waterfall area is height times depth, not finished-top square footage', () => {
  const area = waterfallSqFt(2);
  assert.ok(Math.abs(area - (2 * WATERFALL_HEIGHT_IN * WATERFALL_DEPTH_IN / 144)) < 1e-9);
  assert.ok(area > 12 && area < 14);
});

test('backsplash is lineal feet times height, not a blended add-on to the top', () => {
  assert.ok(Math.abs(backsplashSqFt(18, 4) - 6) < 1e-9);
});

test('slab count rounds up; a zero takeoff needs no slab', () => {
  assert.equal(slabCount(0, 46), 0);
  assert.equal(slabCount(46, 46), 1);
  assert.equal(slabCount(46.1, 46), 2);
});

test('preset helpers return the published starting points', () => {
  assert.equal(suggestedWastePct('l_shape'), 20);
  assert.equal(suggestedEdgeHours('ogee'), 0.22);
  assert.equal(suggestedSinkHours('undermount'), 2);
  assert.deepEqual(suggestedSlab('quartz'), { slabSqFt: 46, slabCost: 850 });
});

test('labor hours come from cutouts, edges, and site work, not field area alone', () => {
  const result = calculateBid(lKitchen());
  // field 55/100*2.5 = 1.375
  // sink 2, cooktop 1.5, faucet 0.36
  // edge 32*0.22 = 7.04
  // splash 18*0.22 = 3.96
  // seams 2.5
  // template 2, tear-out 2.5
  // install 55/100*3 = 1.65
  const expected = 1.375 + 2 + 1.5 + 0.36 + 7.04 + 3.96 + 2.5 + 2 + 2.5 + 1.65;
  assert.ok(Math.abs(result.totalHours - expected) < 1e-9);
  assert.ok(result.hourShares.edges > result.hourShares.field);
  assert.ok(result.cutoutHours > result.fieldHours);
});

test('price stacks burden, slabs, overhead, then margin as a share of price', () => {
  const result = calculateBid(lKitchen());
  assert.equal(result.loadedWage, 38 * 1.3);
  assert.equal(result.slabs, 2);
  assert.equal(result.slabTotal, 1700);

  const splash = 18 * 4 / 12;
  assert.ok(Math.abs(result.splashArea - splash) < 1e-9);
  assert.ok(Math.abs(result.supplies - (55 + splash) * 4) < 1e-9);

  const direct = result.laborCost + result.materialCost + 165;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
});

test('a zero-margin bid prices at cost', () => {
  const result = calculateBid({ ...lKitchen(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.totalCost) < 1e-9);
  assert.ok(Math.abs(result.profit) < 1e-9);
});

test('a proposed price is scored against the same cost base', () => {
  const bid = calculateBid(lKitchen());
  const scored = calculateBid({ ...lKitchen(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
  assert.ok(Math.abs(scored.proposed.hourlyRate - bid.effectiveHourlyRate) < 1e-9);
});

test('a proposed price under cost is flagged as a losing bid', () => {
  const bid = calculateBid(lKitchen());
  const scored = calculateBid({ ...lKitchen(), proposedPrice: bid.totalCost - 100 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('no proposed price means no comparison, and empty string counts as none', () => {
  assert.equal(calculateBid(lKitchen()).proposed, null);
  assert.equal(calculateBid({ ...lKitchen(), proposedPrice: '' }).proposed, null);
});

test('rejects a kitchen with no top and no waterfall', () => {
  assert.throws(() => calculateBid({ ...lKitchen(), finishedSqFt: 0, waterfallEnds: 0 }), /finished square footage/);
});

test('rejects a margin of 100% or more', () => {
  assert.throws(() => calculateBid({ ...lKitchen(), targetMargin: 100 }), /less than 100/);
});

test('rejects non-finite inputs', () => {
  assert.throws(() => calculateBid({ ...lKitchen(), finishedSqFt: 'wide' }), /must be a number/);
  assert.throws(() => calculateBid({ ...lKitchen(), slabSqFt: 0 }), /greater than zero/);
});

test('unknown preset ids fail closed', () => {
  assert.throws(() => suggestedWastePct('circle'), /Unknown layout/);
  assert.throws(() => suggestedEdgeHours('roman'), /Unknown edge/);
  assert.throws(() => suggestedSinkHours('vessel'), /Unknown sink/);
  assert.throws(() => suggestedSlab('soapstone'), /Unknown material/);
});

test('customer-facing summary omits wages and invoice costs', () => {
  const text = formatBidSummary(calculateBid(lKitchen()));
  assert.match(text, /QUARTZ \/ GRANITE COUNTERTOP BID/);
  assert.match(text, /Proposed fabrication and install price/);
  assert.doesNotMatch(text, /38/);
  assert.doesNotMatch(text, /wage/i);
  assert.doesNotMatch(text, /burden/i);
});

test('every job preset produces a finite bid a fabricator can send', () => {
  for (const job of JOB_PRESETS) {
    const material = suggestedSlab(job.materialId);
    const result = calculateBid({
      ...lKitchen(),
      finishedSqFt: job.finishedSqFt,
      perimeterLf: job.perimeterLf,
      wastePct: suggestedWastePct(job.layoutId),
      slabSqFt: material.slabSqFt,
      slabCost: material.slabCost,
      sinkCount: job.sinkCount,
      hoursPerSink: suggestedSinkHours(job.sinkId),
      cooktopCount: job.cooktopCount,
      faucetHoles: job.faucetHoles,
      waterfallEnds: job.waterfallEnds,
      edgeHoursPerLf: suggestedEdgeHours(job.edgeId),
      backsplashLf: job.backsplashLf,
      backsplashHeightIn: job.backsplashHeightIn,
      seams: job.seams,
      templateHours: job.templateHours,
      tearoutHours: job.tearoutHours,
    });
    assert.ok(Number.isFinite(result.price), job.label);
    assert.ok(result.price > result.totalCost, job.label);
    assert.ok(result.slabs >= 1, job.label);
  }
});
