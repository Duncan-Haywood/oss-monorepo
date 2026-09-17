import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAbatementBid, naiveFlatRateQuote, pricingGap, DEFAULTS, CONTAINMENT_LABELS } from './calc.mjs';

test('DEFAULTS price a Class I job above the minimum, hand-verified', () => {
  const q = calculateAbatementBid();
  assert.equal(q.laborHoursTotal, 400 / 18);
  assert.ok(Math.abs(q.crewLaborCost - 844.444) < 0.01);
  assert.ok(Math.abs(q.supervisorCost - 429.63) < 0.01);
  assert.equal(q.containmentSetupCost, 950);
  assert.equal(q.airMonitoringCost, 390);
  assert.equal(q.wasteDisposalCost, 435);
  assert.equal(q.permitCost, 275);
  assert.ok(Math.abs(q.subtotal - 3324.074) < 0.01);
  assert.equal(q.rushSurcharge, 0);
  assert.ok(Math.abs(q.priceAtMargin - 4748.68) < 0.01);
  assert.equal(q.minimumApplied, false);
  assert.ok(Math.abs(q.finalPrice - 4748.68) < 0.01);
});

test('a small, minimal Class III job is priced at the minimum job fee', () => {
  const inputs = {
    containmentClass: 'classIII', squareFootage: 100, containmentAreas: 1, crewSize: 2,
    crewHourlyRatePerWorker: 38, supervisorHourlyRate: 45, airMonitoringSamples: 1,
    airMonitoringCostPerSample: 65, wasteVolumeCubicYards: 0.25, disposalFeePerCubicYard: 145,
    requiresPermit: false, permitFee: 0, targetMarginPercent: 0.3, minimumJobFee: 650,
  };
  const q = calculateAbatementBid(inputs);
  assert.ok(Math.abs(q.priceAtMargin - 351.79) < 0.01);
  assert.equal(q.minimumApplied, true);
  assert.equal(q.finalPrice, 650);
  assert.equal(q.permitCost, 0);
});

test('a flat rate overcharges a small, minimal Class III job', () => {
  const inputs = {
    containmentClass: 'classIII', squareFootage: 100, containmentAreas: 1, crewSize: 2,
    crewHourlyRatePerWorker: 38, supervisorHourlyRate: 45, airMonitoringSamples: 1,
    airMonitoringCostPerSample: 65, wasteVolumeCubicYards: 0.25, disposalFeePerCubicYard: 145,
    requiresPermit: false, permitFee: 0, targetMarginPercent: 0.3, minimumJobFee: 650,
    naiveRatePerSquareFoot: 8.5,
  };
  assert.equal(naiveFlatRateQuote(inputs), 850);
  const gap = pricingGap(inputs);
  assert.equal(gap.finalPrice, 650);
  assert.equal(gap.naiveQuote, 850);
  assert.equal(gap.dollarGap, -200);
  assert.ok(Math.abs(gap.percentGap - -0.2353) < 0.001);
  assert.equal(gap.underpriced, false);
});

test('a flat rate undercharges a large, multi-area Class I job', () => {
  const inputs = {
    containmentClass: 'classI', squareFootage: 1200, containmentAreas: 3, crewSize: 4,
    crewHourlyRatePerWorker: 42, supervisorHourlyRate: 62, airMonitoringSamples: 14,
    airMonitoringCostPerSample: 65, wasteVolumeCubicYards: 9, disposalFeePerCubicYard: 155,
    requiresPermit: true, permitFee: 275, targetMarginPercent: 0.3, minimumJobFee: 650,
    naiveRatePerSquareFoot: 8.5,
  };
  assert.equal(naiveFlatRateQuote(inputs), 10200);
  const gap = pricingGap(inputs);
  assert.ok(Math.abs(gap.finalPrice - 13233.33) < 0.01);
  assert.equal(gap.naiveQuote, 10200);
  assert.ok(Math.abs(gap.dollarGap - 3033.33) < 0.01);
  assert.ok(Math.abs(gap.percentGap - 0.2974) < 0.001);
  assert.equal(gap.underpriced, true);
});

test('Class I is far slower per square foot than Class III', () => {
  const classI = calculateAbatementBid({ containmentClass: 'classI', squareFootage: 400 });
  const classIII = calculateAbatementBid({ containmentClass: 'classIII', squareFootage: 400 });
  assert.ok(classI.laborHoursTotal > classIII.laborHoursTotal * 5);
});

test('more containment areas raises setup cost linearly', () => {
  const one = calculateAbatementBid({ containmentAreas: 1 });
  const three = calculateAbatementBid({ containmentAreas: 3 });
  assert.equal(three.containmentSetupCost, one.containmentSetupCost * 3);
});

test('more crew members shortens elapsed hours but not total labor cost', () => {
  const twoWorkers = calculateAbatementBid({ crewSize: 2 });
  const fourWorkers = calculateAbatementBid({ crewSize: 4 });
  assert.equal(twoWorkers.crewLaborCost, fourWorkers.crewLaborCost);
  assert.ok(fourWorkers.elapsedHours < twoWorkers.elapsedHours);
});

test('a rush job adds a surcharge on the subtotal', () => {
  const normal = calculateAbatementBid({ rushJob: false });
  const rush = calculateAbatementBid({ rushJob: true, rushSurchargePercent: 0.2 });
  assert.equal(rush.rushSurcharge, normal.subtotal * 0.2);
  assert.ok(rush.finalPrice > normal.finalPrice);
});

test('requiresPermit toggles the permit fee on and off', () => {
  const withPermit = calculateAbatementBid({ requiresPermit: true, permitFee: 275 });
  const withoutPermit = calculateAbatementBid({ requiresPermit: false, permitFee: 275 });
  assert.equal(withPermit.permitCost, 275);
  assert.equal(withoutPermit.permitCost, 0);
});

test('air monitoring and waste disposal costs scale linearly', () => {
  const q = calculateAbatementBid({ airMonitoringSamples: 10, airMonitoringCostPerSample: 70, wasteVolumeCubicYards: 5, disposalFeePerCubicYard: 150 });
  assert.equal(q.airMonitoringCost, 700);
  assert.equal(q.wasteDisposalCost, 750);
});

test('rejects an unknown containment class', () => {
  assert.throws(() => calculateAbatementBid({ containmentClass: 'classIV' }), /Containment class must be one of/);
});

test('rejects a square footage below the minimum', () => {
  assert.throws(() => calculateAbatementBid({ squareFootage: 0 }), /Square footage must be at least 1/);
});

test('rejects a non-integer crew size', () => {
  assert.throws(() => calculateAbatementBid({ crewSize: 2.5 }), /Crew size must be a whole number/);
});

test('rejects a negative crew hourly rate', () => {
  assert.throws(() => calculateAbatementBid({ crewHourlyRatePerWorker: -1 }), /Crew hourly rate must be zero or greater/);
});

test('rejects a target margin of 100% or more', () => {
  assert.throws(() => calculateAbatementBid({ targetMarginPercent: 1 }), /Target margin percent must be 0.9999 or less/);
});

test('pricingGap reports null percentGap when the naive quote is zero', () => {
  const gap = pricingGap({ squareFootage: 1, naiveRatePerSquareFoot: 0 });
  assert.equal(gap.naiveQuote, 0);
  assert.equal(gap.percentGap, null);
});

test('CONTAINMENT_LABELS has an entry for every production-rate key', () => {
  assert.deepEqual(Object.keys(CONTAINMENT_LABELS).sort(), ['classI', 'classII', 'classIII']);
});

test('DEFAULTS is a valid, self-consistent input set', () => {
  assert.doesNotThrow(() => calculateAbatementBid(DEFAULTS));
  assert.doesNotThrow(() => naiveFlatRateQuote(DEFAULTS));
});
