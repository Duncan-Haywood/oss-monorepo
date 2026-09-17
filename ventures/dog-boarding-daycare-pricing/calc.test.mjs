import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, occupancyBreakeven, DEFAULTS } from './calc.mjs';

test('default 3-night boarding stay prices labor, supplies, overhead, and margin', () => {
  const r = calculate(DEFAULTS);
  assert.equal(r.isBoarding, true);
  assert.equal(r.totalDays, 3);
  assert.equal(r.laborCostPerDogDay, (30 / 60) * 18);
  assert.equal(r.baseCostPerDogDay, 9 + 4 + 10);
  assert.equal(r.dailyRate, 23 + 23 * 0.25);
  assert.equal(r.perDogSubtotal, r.dailyRate * 3);
  assert.equal(r.finalPrice, r.perDogSubtotal);
  assert.ok(r.finalPrice > r.baseCostPerDogDay * 3, 'final price should include the target margin');
});

test('boardingNights of zero is treated as a daycare-only booking', () => {
  const r = calculate({ ...DEFAULTS, boardingNights: 0, daycareDays: 2 });
  assert.equal(r.isBoarding, false);
  assert.equal(r.totalDays, 2);
});

test('rejects a booking with no boarding nights and no daycare days', () => {
  assert.throws(() => calculate({ ...DEFAULTS, boardingNights: 0, daycareDays: 0 }), /at least one boarding night or daycare day/);
});

test('rejects fewer than one dog', () => {
  assert.throws(() => calculate({ ...DEFAULTS, dogCount: 0 }), /at least 1/);
});

test('a second dog on the same reservation gets the multi-dog discount, not the first', () => {
  const one = calculate({ ...DEFAULTS, dogCount: 1 });
  const two = calculate({ ...DEFAULTS, dogCount: 2 });
  const fullSecondDog = one.perDogSubtotal;
  const discountedSecondDog = fullSecondDog * (1 - DEFAULTS.multiDogDiscountPct / 100);
  assert.ok(Math.abs(two.finalPrice - (one.finalPrice + discountedSecondDog)) < 1e-9);
  assert.equal(two.extraDogs, 1);
});

test('nights beyond the long-stay threshold are discounted, earlier nights are not', () => {
  const r = calculate({ ...DEFAULTS, boardingNights: 10 });
  assert.equal(r.standardDays, 7);
  assert.equal(r.discountedDays, 3);
  const expectedSubtotal = r.dailyRate * 7 + r.dailyRate * (1 - DEFAULTS.longStayDiscountPct / 100) * 3;
  assert.ok(Math.abs(r.perDogSubtotal - expectedSubtotal) < 1e-9);
});

test('a stay shorter than the long-stay threshold applies no discount at all', () => {
  const r = calculate({ ...DEFAULTS, boardingNights: 5 });
  assert.equal(r.standardDays, 5);
  assert.equal(r.discountedDays, 0);
  assert.equal(r.longStayDiscountAmount, 0);
});

test('add-ons (extra potty breaks, bath, medication) are added on top, not marked up', () => {
  const base = calculate(DEFAULTS);
  const withAddOns = calculate({
    ...DEFAULTS,
    extraPottyBreaks: 2,
    extraPottyBreakFee: 5,
    bathAddOnFee: 20,
    medicationFeePerDay: 2,
  });
  const expectedAddOns = 2 * 5 + 20 + 2 * DEFAULTS.boardingNights;
  assert.equal(withAddOns.addOnsTotal, expectedAddOns);
  assert.ok(Math.abs(withAddOns.finalPrice - (base.finalPrice + expectedAddOns)) < 1e-9);
});

test('payment processing fee grosses up the price so the facility still nets the pre-fee total', () => {
  const r = calculate({ ...DEFAULTS, paymentProcessingFeePct: 3 });
  const preProcessing = r.finalPrice - r.processingFeeAmount;
  const netAfterFee = r.finalPrice * (1 - 0.03);
  assert.ok(Math.abs(netAfterFee - preProcessing) < 1e-9);
});

test('rejects a payment processing fee of 100 percent or more', () => {
  assert.throws(() => calculate({ ...DEFAULTS, paymentProcessingFeePct: 100 }), /must be 99\.999 or less/);
});

test('rejects a target margin of 100 percent or more', () => {
  assert.throws(() => calculate({ ...DEFAULTS, targetMarginPct: 100 }), /must be 99\.999 or less/);
});

test('rejects a negative input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, suppliesCostPerDogDay: -1 }), /zero or greater/);
});

test('effective daily rate per dog is the final price over dog-days actually billed', () => {
  const r = calculate({ ...DEFAULTS, dogCount: 2, boardingNights: 5 });
  assert.ok(Math.abs(r.effectiveDailyRatePerDog - r.finalPrice / (r.totalDays * r.dogCount)) < 1e-9);
});

// -- occupancyBreakeven --

test('default facility inputs compute capacity, break-even occupancy, and a profitable projection', () => {
  const o = occupancyBreakeven(DEFAULTS);
  assert.equal(o.totalDogDayCapacity, 12 * 30);
  assert.equal(o.contributionMarginPerDogDay, 45 - 13);
  assert.equal(o.breakEvenDogDays, 6000 / 32);
  assert.ok(Math.abs(o.breakEvenOccupancyPct - (o.breakEvenDogDays / 360) * 100) < 1e-9);
  assert.equal(o.projectedDogDays, 360 * 0.65);
  assert.equal(o.projectedProfit, o.projectedRevenue - o.projectedVariableCost - DEFAULTS.fixedMonthlyCosts);
  assert.equal(o.meetsBreakeven, true);
  assert.equal(o.occupancyGapPct, 0);
});

test('a projected occupancy below break-even reports a gap and does not meet it', () => {
  const o = occupancyBreakeven({ ...DEFAULTS, projectedOccupancyPct: 30 });
  assert.equal(o.meetsBreakeven, false);
  assert.ok(Math.abs(o.occupancyGapPct - (o.breakEvenOccupancyPct - 30)) < 1e-9);
});

test('a rate at or below variable cost per dog-day can never break even, and says so rather than dividing by zero or a negative', () => {
  const o = occupancyBreakeven({ ...DEFAULTS, averageDailyRate: 13, variableCostPerDogDay: 13 });
  assert.equal(o.canBreakEven, false);
  assert.equal(o.breakEvenDogDays, null);
  assert.equal(o.breakEvenOccupancyPct, null);
  assert.equal(o.meetsBreakeven, false);
  assert.equal(o.occupancyGapPct, null);
});

test('rejects a projected occupancy above 100 percent', () => {
  assert.throws(() => occupancyBreakeven({ ...DEFAULTS, projectedOccupancyPct: 101 }), /100 or less/);
});

test('rejects fewer than one kennel run', () => {
  assert.throws(() => occupancyBreakeven({ ...DEFAULTS, kennelRuns: 0 }), /at least 1/);
});
