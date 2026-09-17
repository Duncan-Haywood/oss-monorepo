import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PART_107_CEILING_M,
  SENSOR_PRESETS,
  altitudeForGsd,
  compareOverlap,
  computeGsd,
  money,
  planFlight,
  priceJob,
  reviewPlan,
} from './calc.mjs';

const MAVIC_3E = SENSOR_PRESETS['mavic-3e'];

/** A complete, realistic job: 100 acres of a construction site at 120 m. */
function baseJob(overrides = {}) {
  return {
    areaAcres: 100,
    altitudeM: 120,
    sensorWidthMm: MAVIC_3E.sensorWidthMm,
    focalLengthMm: MAVIC_3E.focalLengthMm,
    imageWidthPx: MAVIC_3E.imageWidthPx,
    imageHeightPx: MAVIC_3E.imageHeightPx,
    frontOverlapPct: 75,
    sideOverlapPct: 70,
    speedMs: 10,
    usableBatteryMin: 25,
    batteryCount: 4,
    turnSeconds: 8,
    setupMinutes: 30,
    swapMinutes: 4,
    gcpCount: 5,
    gcpMinutesEach: 6,
    travelMinutes: 60,
    travelMiles: 45,
    mileageRate: 0.7,
    fieldHourlyRate: 125,
    processingHourlyRate: 95,
    secondsPerImage: 9,
    targetMarginPct: 40,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Optics. These are the numbers a client can check against a published spec
// sheet, so they are pinned against published spec sheets.
// ---------------------------------------------------------------------------

test('GSD matches the value DJI publishes for the Phantom 4 RTK at 100 m', () => {
  const gsd = computeGsd({ ...SENSOR_PRESETS['phantom-4-rtk'], altitudeM: 100 });
  // DJI's own spec sheet states 2.74 cm/px at 100 m for this camera.
  assert.ok(Math.abs(gsd - 2.74) < 0.01, `expected ~2.74 cm/px, got ${gsd}`);
});

test('GSD is linear in altitude', () => {
  const low = computeGsd({ ...MAVIC_3E, altitudeM: 60 });
  const high = computeGsd({ ...MAVIC_3E, altitudeM: 120 });
  assert.ok(Math.abs(high - low * 2) < 1e-9, 'doubling altitude must double GSD');
});

test('altitudeForGsd is the exact inverse of computeGsd', () => {
  const alt = altitudeForGsd({ ...MAVIC_3E, gsdCmPx: 2.5 });
  const back = computeGsd({ ...MAVIC_3E, altitudeM: alt });
  assert.ok(Math.abs(back - 2.5) < 1e-9);
});

test('a longer lens gives a finer GSD at the same altitude', () => {
  const wide = computeGsd({ ...MAVIC_3E, altitudeM: 100 });
  const tele = computeGsd({ ...MAVIC_3E, focalLengthMm: MAVIC_3E.focalLengthMm * 2, altitudeM: 100 });
  assert.ok(tele < wide);
});

// ---------------------------------------------------------------------------
// The claim the product is built on. If this stops holding, the headline on
// the page is false and the test must fail rather than the page go quietly
// wrong.
// ---------------------------------------------------------------------------

test('image count scales as 1/((1-front)(1-side)), so 70/70 -> 80/80 is far more than "a bit more overlap"', () => {
  const at70 = planFlight(baseJob({ frontOverlapPct: 70, sideOverlapPct: 70 }));
  const at80 = planFlight(baseJob({ frontOverlapPct: 80, sideOverlapPct: 80 }));
  const ratio = at80.totalPhotos / at70.totalPhotos;
  // Continuous theory is (0.3*0.3)/(0.2*0.2) = 2.25; discretising lines and
  // exposures to whole frames moves it slightly. Anything near 1.0 would mean
  // the quadratic has been lost.
  assert.ok(ratio > 2.0 && ratio < 2.4, `expected ~2.25x the photos, got ${ratio}`);
});

test('flight time grows only with side overlap, and far slower than image count', () => {
  const at70 = planFlight(baseJob({ frontOverlapPct: 70, sideOverlapPct: 70 }));
  const at80 = planFlight(baseJob({ frontOverlapPct: 80, sideOverlapPct: 80 }));
  const photoRatio = at80.totalPhotos / at70.totalPhotos;
  const flightRatio = at80.flightMinutes / at70.flightMinutes;
  assert.ok(flightRatio > 1.3 && flightRatio < 1.7, `expected ~1.5x flight, got ${flightRatio}`);
  assert.ok(
    photoRatio > flightRatio,
    'the point of the tool: photographs (and so processing) grow faster than airtime',
  );
});

test('front overlap alone changes photo count without changing flight time', () => {
  const a = planFlight(baseJob({ frontOverlapPct: 70, sideOverlapPct: 70 }));
  const b = planFlight(baseJob({ frontOverlapPct: 85, sideOverlapPct: 70 }));
  assert.equal(a.lines, b.lines, 'side overlap sets the line count, front overlap must not');
  assert.ok(Math.abs(a.flightMinutes - b.flightMinutes) < 1e-9, 'same path, same airtime');
  assert.ok(b.totalPhotos > a.totalPhotos, 'but more exposures along each line');
});

test('compareOverlap reports the ratios and the money together', () => {
  const cmp = compareOverlap(baseJob({ frontOverlapPct: 70, sideOverlapPct: 70 }), 80, 80);
  assert.ok(cmp.photoRatio > 2.0);
  assert.ok(cmp.costDelta > 0, 'more overlap costs more');
  assert.ok(cmp.priceDelta > cmp.costDelta, 'and the quote has to move by more than the cost');
});

// ---------------------------------------------------------------------------
// Flight geometry.
// ---------------------------------------------------------------------------

test('line spacing and trigger spacing follow the footprint and the overlap', () => {
  const r = planFlight(baseJob({ frontOverlapPct: 75, sideOverlapPct: 70 }));
  assert.ok(Math.abs(r.lineSpacingM - r.footprintWidthM * 0.3) < 1e-9);
  assert.ok(Math.abs(r.triggerSpacingM - r.footprintHeightM * 0.25) < 1e-9);
});

test('a bigger site needs more lines and more airtime', () => {
  const small = planFlight(baseJob({ areaAcres: 10 }));
  const big = planFlight(baseJob({ areaAcres: 250 }));
  assert.ok(big.lines > small.lines);
  assert.ok(big.flightMinutes > small.flightMinutes);
  assert.ok(big.totalPhotos > small.totalPhotos);
});

test('sorties and battery swaps come from the usable battery window', () => {
  const r = planFlight(baseJob({ areaAcres: 400, usableBatteryMin: 20 }));
  assert.equal(r.sortiesNeeded, Math.ceil(r.flightMinutes / 20));
  assert.equal(r.batterySwaps, r.sortiesNeeded - 1);
});

test('a single short flight needs one sortie and no swap', () => {
  const r = planFlight(baseJob({ areaAcres: 5 }));
  assert.equal(r.sortiesNeeded, 1);
  assert.equal(r.batterySwaps, 0);
});

test('every line carries at least the two exposures that bound it', () => {
  const r = planFlight(baseJob({ areaAcres: 0.5, frontOverlapPct: 0 }));
  assert.ok(r.photosPerLine >= 2);
});

// ---------------------------------------------------------------------------
// Money.
// ---------------------------------------------------------------------------

test('margin is taken on the price, not as a markup on cost', () => {
  const r = priceJob(baseJob({ targetMarginPct: 40 }));
  assert.ok(Math.abs(r.price - r.totalCost / 0.6) < 1e-6);
  // The error this guards: 40% *markup* would be cost * 1.4, which is a 28.6%
  // margin and a materially smaller number.
  assert.ok(r.price > r.totalCost * 1.4);
});

test('profit is price less cost, and the margin comes back out of it', () => {
  const r = priceJob(baseJob({ targetMarginPct: 35 }));
  assert.ok(Math.abs(r.profit - (r.price - r.totalCost)) < 1e-9);
  assert.ok(Math.abs(r.profit / r.price - 0.35) < 1e-9);
});

test('a zero-margin job prices exactly at cost', () => {
  const r = priceJob(baseJob({ targetMarginPct: 0 }));
  assert.ok(Math.abs(r.price - r.totalCost) < 1e-9);
  assert.ok(Math.abs(r.profit) < 1e-9);
});

test('cost is the sum of its parts and nothing else', () => {
  const r = priceJob(baseJob());
  assert.ok(Math.abs(r.totalCost - (r.fieldCost + r.processingCost + r.mileageCost)) < 1e-9);
});

test('travel time is billed at the field rate and mileage on top of it', () => {
  const without = priceJob(baseJob({ travelMinutes: 0, travelMiles: 0 }));
  const with_ = priceJob(baseJob({ travelMinutes: 60, travelMiles: 45 }));
  assert.ok(Math.abs(with_.fieldCost - without.fieldCost - 125) < 1e-6, 'one hour at $125');
  assert.ok(Math.abs(with_.mileageCost - 45 * 0.7) < 1e-9);
});

test('processing time follows the photo count, which is what makes overlap expensive twice', () => {
  const at70 = priceJob(baseJob({ frontOverlapPct: 70, sideOverlapPct: 70 }));
  const at80 = priceJob(baseJob({ frontOverlapPct: 80, sideOverlapPct: 80 }));
  assert.ok(at80.processingMinutes / at70.processingMinutes > 2.0);
});

test('money puts the sign outside the symbol and never renders a negative zero', () => {
  assert.equal(money(-9.24), '-$9.24');
  assert.equal(money(9.24), '$9.24');
  assert.equal(money(-0.004), '$0.00');
  assert.equal(money(0), '$0.00');
  assert.equal(money(1234567.891), '$1,234,567.89');
});

// ---------------------------------------------------------------------------
// Validation. Every bound here has to match the markup's min/max, which
// platform/ci/check_input_bounds.py enforces from the other side.
// ---------------------------------------------------------------------------

test('a zero or negative site area is refused rather than divided by', () => {
  assert.throws(() => planFlight(baseJob({ areaAcres: 0 })), /Site area/);
  assert.throws(() => planFlight(baseJob({ areaAcres: -5 })), /Site area/);
});

test('overlap at or above 100% is refused, because spacing would be zero or negative', () => {
  assert.throws(() => planFlight(baseJob({ sideOverlapPct: 100 })), /Side overlap/);
  assert.throws(() => planFlight(baseJob({ frontOverlapPct: 99 })), /Front overlap/);
});

test('a fractional battery count is refused', () => {
  assert.throws(() => planFlight(baseJob({ batteryCount: 2.5 })), /whole number/);
});

test('non-numeric input is refused rather than producing NaN', () => {
  assert.throws(() => planFlight(baseJob({ speedMs: 'fast' })), /Flight speed/);
  assert.throws(() => priceJob(baseJob({ fieldHourlyRate: null })), /Field rate/);
});

test('a margin of 100% is refused, since price would be infinite', () => {
  assert.throws(() => priceJob(baseJob({ targetMarginPct: 100 })), /Target margin/);
});

// ---------------------------------------------------------------------------
// Advisory notes.
// ---------------------------------------------------------------------------

test('a GSD that would need more than 400 ft AGL is flagged against Part 107', () => {
  // A coarse target on a wide lens pushes the required altitude past the ceiling.
  const job = baseJob({ targetGsdCmPx: 8 });
  const notes = reviewPlan(job, planFlight(job));
  const flagged = notes.find((n) => n.severity === 'legal');
  assert.ok(flagged, 'expected a Part 107 ceiling note');
  assert.match(flagged.detail, /107\.51/);
  assert.ok(altitudeForGsd({ ...MAVIC_3E, gsdCmPx: 8 }) > PART_107_CEILING_M);
});

test('a plan inside the ceiling raises no Part 107 note', () => {
  const job = baseJob({ targetGsdCmPx: 2 });
  const notes = reviewPlan(job, planFlight(job));
  assert.equal(notes.filter((n) => n.severity === 'legal').length, 0);
});

test('a job needing more sorties than batteries carried is flagged as a second mobilisation', () => {
  const job = baseJob({ areaAcres: 900, batteryCount: 2, usableBatteryMin: 20 });
  const result = planFlight(job);
  assert.ok(result.batteriesShort > 0);
  const notes = reviewPlan(job, result);
  assert.ok(notes.some((n) => n.severity === 'operational'));
});

test('flying with no ground control points is flagged as an accuracy question', () => {
  const job = baseJob({ gcpCount: 0 });
  const notes = reviewPlan(job, planFlight(job));
  assert.ok(notes.some((n) => n.severity === 'accuracy'));
});

test('thin overlap is flagged as a reconstruction risk', () => {
  const job = baseJob({ frontOverlapPct: 60, sideOverlapPct: 55 });
  const notes = reviewPlan(job, planFlight(job));
  assert.ok(notes.some((n) => n.title === 'Overlap below the usual reconstruction floor'));
});

test('a healthy plan produces no operational or legal note', () => {
  const job = baseJob({ areaAcres: 40, gcpCount: 5, targetGsdCmPx: 3.2 });
  const notes = reviewPlan(job, planFlight(job));
  assert.equal(notes.filter((n) => n.severity === 'legal' || n.severity === 'operational').length, 0);
});

// ---------------------------------------------------------------------------
// The shipped worked example. The page opens with these values, so a change
// that moves them should be a deliberate one.
// ---------------------------------------------------------------------------

test('the shipped example produces a coherent, plausible quote', () => {
  const r = priceJob(baseJob());
  assert.ok(r.totalPhotos > 100 && r.totalPhotos < 1000, `photo count ${r.totalPhotos}`);
  assert.ok(r.flightMinutes > 5 && r.flightMinutes < 60, `flight ${r.flightMinutes}`);
  assert.ok(r.price > r.totalCost);
  assert.ok(r.pricePerAcre > 0);
  assert.ok(Number.isFinite(r.price));
});

test('every preset camera yields a sane GSD at a normal survey altitude', () => {
  for (const [slug, preset] of Object.entries(SENSOR_PRESETS)) {
    const gsd = computeGsd({ ...preset, altitudeM: 100 });
    assert.ok(gsd > 0.1 && gsd < 10, `${slug} gave ${gsd} cm/px at 100 m`);
  }
});
