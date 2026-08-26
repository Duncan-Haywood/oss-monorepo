import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  CONDITION_COVERAGE,
  METHOD_PRESETS,
  HOURS_PER_OIL_SPOT,
  CRACK_FEET_PER_HOUR,
  HOURS_PER_STALL,
  PRIMER_GALLONS_PER_SPOT,
  SAND_LBS_PER_GALLON,
  LBS_PER_SAND_BAG,
} from './calc.mjs';

const driveway = () => ({
  surfaces: [
    {
      name: 'Residential driveway',
      squareFeet: 800,
      coats: 2,
      firstCoatSqFtPerGal: 90,
      secondCoatSqFtPerGal: 120,
    },
  ],
  condition: 'oxidized',
  method: 'squeegee',
  oilSpots: 4,
  crackFeet: 40,
  stalls: 0,
  sand: false,
  hourlyWage: 24,
  burdenRate: 32,
  milesOneWay: 8,
  speedMph: 35,
  setupHours: 0.5,
  minOnSiteHours: 1.5,
  tripFee: 35,
  sealerPerGallon: 4.25,
  primerPerGallon: 18,
  crackFillerPerFoot: 0.45,
  sandPerBag: 8,
  paintPerStall: 3.5,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 25,
});

test('hours come from coats and crew rate, not square feet alone', () => {
  const result = calculateBid(driveway());
  // 800 sq ft × 2 coats / 900 sq ft per crew-hour
  assert.ok(Math.abs(result.applyHours - (800 * 2) / 900) < 1e-9);
  assert.equal(result.totalSquareFeet, 800);
  const oneCoat = calculateBid({
    ...driveway(),
    surfaces: [{ ...driveway().surfaces[0], coats: 1 }],
  });
  assert.ok(result.applyHours > oneCoat.applyHours * 1.9);
});

test('first coat drinks more sealer than the second, and failing pavement drinks more still', () => {
  const oxidized = calculateBid(driveway());
  const first = 800 / (90 * CONDITION_COVERAGE.oxidized);
  const second = 800 / 120;
  assert.ok(Math.abs(oxidized.totalGallons - (first + second)) < 1e-9);
  assert.ok(oxidized.surfaces[0].firstGallons > oxidized.surfaces[0].extraCoatGallons);

  const failing = calculateBid({ ...driveway(), condition: 'failing' });
  const good = calculateBid({ ...driveway(), condition: 'good' });
  assert.ok(failing.totalGallons > oxidized.totalGallons);
  assert.ok(oxidized.totalGallons > good.totalGallons);
});

test('oil spots, cracks, and striping are labor the cents-per-foot special cannot see', () => {
  const result = calculateBid({ ...driveway(), stalls: 12 });
  assert.ok(Math.abs(result.oilHours - 4 * HOURS_PER_OIL_SPOT) < 1e-9);
  assert.ok(Math.abs(result.crackHours - 40 / CRACK_FEET_PER_HOUR) < 1e-9);
  assert.ok(Math.abs(result.stripeHours - 12 * HOURS_PER_STALL) < 1e-9);
  assert.ok(result.oilHours + result.crackHours + result.stripeHours > 1.4);
});

test('the drive is a second job and the minimum holds a tiny pad up', () => {
  const result = calculateBid(driveway());
  assert.ok(Math.abs(result.travelHours - (16 / 35)) < 1e-9);
  const tiny = calculateBid({
    ...driveway(),
    surfaces: [{ name: 'Apron', squareFeet: 80, coats: 1, firstCoatSqFtPerGal: 95, secondCoatSqFtPerGal: 125 }],
    oilSpots: 0,
    crackFeet: 0,
    setupHours: 0.25,
    minOnSiteHours: 1.5,
  });
  assert.equal(tiny.minimumApplied, true);
  assert.equal(tiny.onSiteHours, 1.5);
});

test('price stacks burden, materials, overhead, then margin as a share of price', () => {
  const result = calculateBid(driveway());
  assert.equal(result.loadedWage, 24 * 1.32);
  const materials = result.sealerCost + result.primerCost + result.crackCost + result.sandCost + result.paintCost;
  assert.ok(Math.abs(result.materials - materials) < 1e-9);
  const direct = result.laborCost + result.materials + 35;
  assert.ok(Math.abs(result.overhead - direct * 0.15) < 1e-9);
  assert.ok(Math.abs(result.totalCost - direct * 1.15) < 1e-9);
  assert.ok(Math.abs(result.profit / result.price * 100 - 25) < 1e-9);
});

test('a neighborhood cents-per-foot special on this driveway is underwater', () => {
  const bid = calculateBid(driveway());
  // $0.18 / sq ft is the postcard price that ignores coats, oil, cracks, and the drive.
  const special = calculateBid({ ...driveway(), proposedPrice: 800 * 0.18 });
  assert.equal(special.proposed.belowBreakEven, true);
  assert.ok(special.proposed.profit < 0);
  assert.ok(bid.pricePerSqFt > 0.3);
  assert.ok(bid.breakEvenPrice > 144);
});

test('a proposed price at the calculated bid keeps the target margin', () => {
  const bid = calculateBid(driveway());
  const scored = calculateBid({ ...driveway(), proposedPrice: bid.price });
  assert.ok(Math.abs(scored.proposed.margin - 25) < 1e-9);
  assert.equal(scored.proposed.belowBreakEven, false);
});

test('spray is faster labor and sand adds mix time plus bags', () => {
  const squeegee = calculateBid(driveway());
  const spray = calculateBid({ ...driveway(), method: 'spray' });
  assert.equal(spray.sqFtPerCrewHour, METHOD_PRESETS.spray.sqFtPerCrewHour);
  assert.ok(spray.applyHours < squeegee.applyHours);

  const withSand = calculateBid({ ...driveway(), sand: true });
  assert.ok(withSand.sandHours > 0);
  assert.ok(Math.abs(withSand.sandBags - (withSand.totalGallons * SAND_LBS_PER_GALLON) / LBS_PER_SAND_BAG) < 1e-9);
  assert.ok(withSand.sandCost > 0);
  assert.equal(squeegee.sandCost, 0);
});

test('primer gallons track oil spots and crack filler tracks linear feet', () => {
  const result = calculateBid(driveway());
  assert.ok(Math.abs(result.primerGallons - 4 * PRIMER_GALLONS_PER_SPOT) < 1e-9);
  assert.ok(Math.abs(result.primerCost - result.primerGallons * 18) < 1e-9);
  assert.ok(Math.abs(result.crackCost - 40 * 0.45) < 1e-9);
});

test('a parking lot with striping is not priced like a driveway of the same area', () => {
  const lot = calculateBid({
    ...driveway(),
    surfaces: [{
      name: 'Commercial parking lot',
      squareFeet: 800,
      coats: 2,
      firstCoatSqFtPerGal: 80,
      secondCoatSqFtPerGal: 110,
    }],
    stalls: 16,
  });
  const pad = calculateBid(driveway());
  assert.ok(lot.totalGallons > pad.totalGallons);
  assert.ok(lot.stripeHours > 0);
  assert.ok(lot.price > pad.price);
});

test('zero-margin bid prices at cost and empty proposed price is no comparison', () => {
  const atCost = calculateBid({ ...driveway(), targetMargin: 0 });
  assert.ok(Math.abs(atCost.price - atCost.totalCost) < 1e-9);
  assert.ok(Math.abs(atCost.profit) < 1e-9);
  assert.equal(calculateBid(driveway()).proposed, null);
  assert.equal(calculateBid({ ...driveway(), proposedPrice: '' }).proposed, null);
});

test('rejects empty surfaces, zero coverage, and a 100% margin', () => {
  assert.throws(() => calculateBid({ ...driveway(), surfaces: [] }), /at least one surface/i);
  assert.throws(() => calculateBid({
    ...driveway(),
    surfaces: [{ name: 'x', squareFeet: 10, coats: 1, firstCoatSqFtPerGal: 0, secondCoatSqFtPerGal: 120 }],
  }), /coverage/i);
  assert.throws(() => calculateBid({ ...driveway(), targetMargin: 100 }), /less than 100/i);
  assert.throws(() => calculateBid({ ...driveway(), condition: 'wet' }), /Condition/i);
  assert.throws(() => calculateBid({ ...driveway(), method: 'roller' }), /Method/i);
  assert.throws(() => calculateBid({ ...driveway(), speedMph: 0 }), /Travel speed/i);
});

test('add-ons that are disabled do not bill hours or parts', () => {
  const result = calculateBid({
    ...driveway(),
    addOns: [
      { id: 'handicap', label: 'Stencil', hours: 0.3, parts: 18, enabled: true },
      { id: 'skip', label: 'Skip me', hours: 9, parts: 90, enabled: false },
    ],
  });
  assert.equal(result.addOns.length, 1);
  assert.equal(result.addOnHours, 0.3);
  assert.ok(result.materials > result.sealerCost);
});
