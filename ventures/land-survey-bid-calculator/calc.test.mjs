import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSurveyBid, naivePerAcreQuote, pricingGap, DEFAULTS, TERRAIN_MULTIPLIER } from './calc.mjs';

function close(actual, expected, eps = 0.05) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

// --- Hand-verified breakdown at DEFAULTS ---
//
// fieldMinutes = 1.4 * (3*25 + 1*55) = 1.4 * 130 = 182 -> fieldHours = 3.0333...
// crewFieldCost = 3.0333... * 2 * 45 = 273
// officeCost = 3 * 85 = 255
// draftingHours = 2 + 20*(3+1)/60 = 2 + 1.3333... = 3.3333...
// draftingCost = 3.3333... * 55 = 183.3333...
// travelHours = max(0.5, 40/40) = 1
// travelLaborCost = 1 * 2 * 45 = 90
// mileageCost = 40 * 0.67 = 26.8
// subtotal = 273 + 255 + 183.3333 + 90 + 26.8 = 828.1333...
// totalCost (no rush) = 828.1333...
// priceAtMargin = 828.1333... / 0.65 = 1274.0513...
// finalPrice = max(1274.05, 850) = 1274.05 (minimum not applied)

test('calculateSurveyBid matches the hand-verified breakdown at DEFAULTS', () => {
  const q = calculateSurveyBid(DEFAULTS);
  close(q.fieldHours, 3.0333);
  close(q.crewFieldCost, 273);
  close(q.officeCost, 255);
  close(q.draftingHours, 3.3333);
  close(q.draftingCost, 183.3333);
  close(q.travelHours, 1);
  close(q.travelLaborCost, 90);
  close(q.mileageCost, 26.8);
  close(q.subtotal, 828.1333);
  assert.equal(q.rushSurcharge, 0);
  close(q.totalCost, 828.1333);
  close(q.priceAtMargin, 1274.0513);
  assert.equal(q.minimumApplied, false);
  close(q.finalPrice, 1274.0513);
});

// --- Terrain multiplier changes field cost, and only field cost ---

test('heavier terrain raises field time and cost proportionally, holding everything else fixed', () => {
  const open = calculateSurveyBid({ ...DEFAULTS, terrain: 'open' });
  const moderate = calculateSurveyBid({ ...DEFAULTS, terrain: 'moderate' });
  const heavy = calculateSurveyBid({ ...DEFAULTS, terrain: 'heavy' });
  assert.ok(open.crewFieldCost < moderate.crewFieldCost);
  assert.ok(moderate.crewFieldCost < heavy.crewFieldCost);
  // The multiplier is exact and linear in field minutes.
  close(heavy.fieldHours / open.fieldHours, TERRAIN_MULTIPLIER.heavy / TERRAIN_MULTIPLIER.open, 0.001);
  // Office, drafting, travel, and mileage costs are terrain-independent.
  close(open.officeCost, heavy.officeCost, 0.001);
  close(open.draftingCost, heavy.draftingCost, 0.001);
  close(open.mileageCost, heavy.mileageCost, 0.001);
});

// --- A corner that must be set costs more field time than one just located ---

test('setting a corner costs more field time than locating one, at the same count', () => {
  const locateOnly = calculateSurveyBid({ ...DEFAULTS, cornersToLocate: 4, cornersToSet: 0 });
  const setOnly = calculateSurveyBid({ ...DEFAULTS, cornersToLocate: 0, cornersToSet: 4 });
  assert.ok(setOnly.fieldHours > locateOnly.fieldHours);
  assert.ok(setOnly.crewFieldCost > locateOnly.crewFieldCost);
});

// --- Rush surcharge ---

test('a rush job adds the surcharge percent on top of the subtotal, and a non-rush job does not', () => {
  const normal = calculateSurveyBid(DEFAULTS);
  const rushed = calculateSurveyBid({ ...DEFAULTS, rushJob: true });
  close(rushed.rushSurcharge, normal.subtotal * DEFAULTS.rushSurchargePercent);
  close(rushed.totalCost, normal.subtotal * (1 + DEFAULTS.rushSurchargePercent));
  assert.ok(rushed.finalPrice > normal.finalPrice);
});

test('a rush surcharge percent above zero has no effect unless rushJob is true', () => {
  const notRushed = calculateSurveyBid({ ...DEFAULTS, rushJob: false, rushSurchargePercent: 0.5 });
  assert.equal(notRushed.rushSurcharge, 0);
});

// --- Minimum job fee floor ---

test('a small, simple job is floored at the minimum job fee', () => {
  const tiny = calculateSurveyBid({
    ...DEFAULTS,
    cornersToLocate: 2,
    cornersToSet: 0,
    recordResearchHours: 0.5,
    terrain: 'open',
    travelMilesRoundTrip: 5,
    minimumJobFee: 850,
  });
  assert.ok(tiny.priceAtMargin < 850, 'fixture should price below the minimum before flooring');
  assert.equal(tiny.finalPrice, 850);
  assert.equal(tiny.minimumApplied, true);
});

test('a job priced above the minimum is not floored', () => {
  const q = calculateSurveyBid(DEFAULTS);
  assert.equal(q.minimumApplied, false);
  assert.ok(q.finalPrice > DEFAULTS.minimumJobFee);
});

// --- Travel floor ---

test('travel time never drops below the configured minimum, even with zero miles', () => {
  const q = calculateSurveyBid({ ...DEFAULTS, travelMilesRoundTrip: 0, minimumTravelHours: 0.75 });
  assert.equal(q.travelHours, 0.75);
  assert.equal(q.mileageCost, 0);
});

// --- naivePerAcreQuote and pricingGap ---

test('naivePerAcreQuote is a flat multiple of acreage', () => {
  assert.equal(naivePerAcreQuote({ parcelAcres: 5, naivePerAcreRate: 120 }), 600);
  assert.equal(naivePerAcreQuote({ parcelAcres: 10, naivePerAcreRate: 120 }), 1200);
});

test('pricingGap shows a small, complex parcel is underpriced by the naive per-acre method', () => {
  const gap = pricingGap(DEFAULTS);
  close(gap.finalPrice, 1274.0513);
  assert.equal(gap.naiveQuote, 600);
  assert.ok(gap.dollarGap > 0);
  assert.equal(gap.underpriced, true);
  close(gap.percentGap, 1.1234, 0.01);
});

test('pricingGap can also show a large, simple parcel overpriced by the naive per-acre method', () => {
  const gap = pricingGap({
    ...DEFAULTS,
    parcelAcres: 80,
    cornersToLocate: 4,
    cornersToSet: 0,
    terrain: 'open',
    recordResearchHours: 1,
  });
  // 80 acres at $120/acre = $9,600 naive quote, far above the actual cost of
  // a simple 4-corner open-terrain job.
  assert.equal(gap.naiveQuote, 9600);
  assert.ok(gap.finalPrice < gap.naiveQuote);
  assert.equal(gap.underpriced, false);
});

// --- Validation ---

test('rejects an unknown terrain value', () => {
  assert.throws(() => calculateSurveyBid({ ...DEFAULTS, terrain: 'moon' }), /terrain/i);
});

test('rejects a negative crew size', () => {
  assert.throws(() => calculateSurveyBid({ ...DEFAULTS, crewSize: -1 }), /crew size/i);
});

test('rejects a zero crew size', () => {
  assert.throws(() => calculateSurveyBid({ ...DEFAULTS, crewSize: 0 }), /crew size/i);
});

test('rejects a non-integer corner count', () => {
  assert.throws(() => calculateSurveyBid({ ...DEFAULTS, cornersToLocate: 2.5 }), /whole number/i);
});

test('rejects a target margin of 100% or more (would divide by zero or go negative)', () => {
  assert.throws(() => calculateSurveyBid({ ...DEFAULTS, targetMarginPercent: 1 }), /margin/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculateSurveyBid({ ...DEFAULTS, officeHourlyRate: 'lots' }), /office hourly rate/i);
});

test('rejects zero or negative parcel acreage in naivePerAcreQuote', () => {
  assert.throws(() => naivePerAcreQuote({ ...DEFAULTS, parcelAcres: 0 }), /parcel acres/i);
});

// --- DEFAULTS sanity ---

test('DEFAULTS produce a finite, positive price', () => {
  const q = calculateSurveyBid(DEFAULTS);
  assert.ok(Number.isFinite(q.finalPrice));
  assert.ok(q.finalPrice > 0);
});
