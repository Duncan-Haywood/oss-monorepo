import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  COATING_SYSTEMS,
  GARAGE_PRESETS,
  PREP_METHODS,
  STARVED_FLAKE_LB_PER_SQ_FT,
} from './calc.mjs';

const twoCarFlake = () => ({
  garageId: '2-car',
  systemId: 'full-flake',
  prepId: 'full-grind',
  crackLinearFeet: 20,
  pitSquareFeet: 0,
  moistureBarrier: false,
  hourlyWage: 45,
  burdenRate: 22,
  flakePricePerLb: 4.5,
  moisturePerSqFt: 1.1,
  crackFillPerLf: 1.25,
  pitFillPerSf: 4,
  otherJobCost: 40,
  roundTripMiles: 30,
  travelMph: 35,
  vehiclePerMile: 0.85,
  overheadRate: 15,
  targetMargin: 35,
});

test('garage presets expose the openings contractors actually quote', () => {
  assert.deepEqual(
    GARAGE_PRESETS.map(g => [g.id, g.width, g.length]),
    [
      ['1-car', 12, 20],
      ['2-car', 20, 20],
      ['2.5-car', 24, 22],
      ['3-car', 32, 22],
      ['custom', null, null],
    ],
  );
  assert.ok(COATING_SYSTEMS.some(s => s.id === 'polyaspartic'));
  assert.ok(PREP_METHODS.find(p => p.id === 'degrease').skipGrind);
});

test('a 2-car flake job prices from grind hours, flake load, and waste — not a flat $/sf', () => {
  const result = calculateBid(twoCarFlake());
  assert.equal(result.garage.squareFeet, 400);
  assert.ok(Math.abs(result.garage.billableSquareFeet - 400 * 1.12) < 1e-9);
  assert.ok(Math.abs(result.hours.prep - 400 / 80) < 1e-9);
  assert.ok(Math.abs(result.hours.coat - (448 / 220) * 3) < 1e-9);
  assert.ok(Math.abs(result.hours.crack - 1) < 1e-9);
  assert.ok(Math.abs(result.flakePounds - 448 * 0.2) < 1e-9);
  assert.ok(result.pricePerSqFt > 8 && result.pricePerSqFt < 16);
  assert.ok(result.price > 3000 && result.price < 7000);
});

test('loaded wage, overhead, and margin-of-price stack the way a shop P&L reads them', () => {
  const result = calculateBid(twoCarFlake());
  assert.ok(Math.abs(result.loadedWage - 45 * 1.22) < 1e-9);
  assert.ok(Math.abs(result.costs.overhead - result.costs.direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.costs.total - result.costs.direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 35) < 1e-9);
  assert.equal(result.breakEvenPrice, result.costs.total);
});

test('travel is shop labor plus vehicle miles, not a forgotten drive', () => {
  const result = calculateBid(twoCarFlake());
  assert.ok(Math.abs(result.hours.travel - 30 / 35) < 1e-9);
  assert.ok(Math.abs(result.costs.vehicle - 30 * 0.85) < 1e-9);
  const noTravel = calculateBid({ ...twoCarFlake(), roundTripMiles: 0 });
  assert.ok(result.price > noTravel.price);
});

test('a moisture barrier is slab area, not waste area — it goes on the concrete once', () => {
  const withBarrier = calculateBid({ ...twoCarFlake(), moistureBarrier: true });
  const without = calculateBid(twoCarFlake());
  assert.ok(Math.abs(withBarrier.costs.moisture - 400 * 1.1) < 1e-9);
  assert.equal(without.costs.moisture, 0);
  assert.ok(withBarrier.price > without.price);
});

test('polyaspartic spends more on kit and less on coat hours than flake epoxy', () => {
  const flake = calculateBid(twoCarFlake());
  const poly = calculateBid({ ...twoCarFlake(), systemId: 'polyaspartic' });
  assert.ok(poly.costs.coating > flake.costs.coating);
  assert.ok(poly.hours.coat < flake.hours.coat);
  assert.ok(poly.price > flake.price);
});

test('skipping the grind on a flake job is flagged as the cheap special that fails', () => {
  const result = calculateBid({ ...twoCarFlake(), prepId: 'degrease' });
  assert.equal(result.prep.skipGrind, true);
  assert.ok(result.warnings.some(w => w.id === 'skip-grind' && w.severity === 'high'));
  assert.ok(result.hours.prep < calculateBid(twoCarFlake()).hours.prep);
});

test('a starved flake load is flagged so the shop does not guess two bags', () => {
  const result = calculateBid({ ...twoCarFlake(), flakeLbPerSqFt: 0.05 });
  assert.ok(0.05 < STARVED_FLAKE_LB_PER_SQ_FT);
  assert.ok(result.warnings.some(w => w.id === 'starved-flake'));
});

test('a long drive relative to shop time is called out', () => {
  const result = calculateBid({ ...twoCarFlake(), roundTripMiles: 180, travelMph: 30 });
  assert.ok(result.hours.travel >= result.hours.shop * 0.4);
  assert.ok(result.warnings.some(w => w.id === 'travel-heavy'));
});

test('a proposed price under cost is a losing bid', () => {
  const bid = calculateBid(twoCarFlake());
  const scored = calculateBid({ ...twoCarFlake(), proposedPrice: bid.breakEvenPrice - 200 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.proposed.profit < 0);
});

test('a proposed price at the calculated bid keeps the target margin', () => {
  const bid = calculateBid(twoCarFlake());
  const scored = calculateBid({ ...twoCarFlake(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 35) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('empty proposed price is no comparison', () => {
  assert.equal(calculateBid(twoCarFlake()).proposed, null);
  assert.equal(calculateBid({ ...twoCarFlake(), proposedPrice: '' }).proposed, null);
});

test('zero margin prices at cost', () => {
  const result = calculateBid({ ...twoCarFlake(), targetMargin: 0 });
  assert.ok(Math.abs(result.price - result.costs.total) < 1e-9);
});

test('custom width × length and a direct square-footage override both work', () => {
  const custom = calculateBid({ ...twoCarFlake(), garageId: 'custom', width: 18, length: 22 });
  assert.equal(custom.garage.squareFeet, 396);
  const direct = calculateBid({ ...twoCarFlake(), squareFeet: 520 });
  assert.equal(direct.garage.squareFeet, 520);
});

test('rejects a missing slab, a 100% margin, and an unknown system', () => {
  assert.throws(() => calculateBid({ ...twoCarFlake(), garageId: 'custom' }), /slab size/);
  assert.throws(() => calculateBid({ ...twoCarFlake(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateBid({ ...twoCarFlake(), systemId: 'paint' }), /not a recognised/);
});

test('a $4/sq ft special on a 2-car flake grind loses money', () => {
  const scored = calculateBid({ ...twoCarFlake(), proposedPrice: 1600 });
  assert.equal(scored.proposed.belowBreakEven, true);
  assert.ok(scored.breakEvenPrice > 1600);
});
