import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteRevenue, incomeGap, DEFAULTS } from './calc.mjs';

test('default 30-minute walk prices labor, drive, mileage, and overhead', () => {
  const r = calculate(DEFAULTS);
  // billableMinutes = 30 (active) + 10 (drive) = 40 -> 40/60 hours
  assert.ok(Math.abs(r.hoursBilled - 40 / 60) < 1e-9);
  assert.ok(Math.abs(r.laborCost - (40 / 60) * 24) < 1e-9);
  assert.equal(r.mileageCost, 4 * 0.67);
  assert.equal(r.extraPets, 0);
  assert.equal(r.petSurcharge, 0);
  assert.equal(r.overheadPerVisit, 45 / 60);
  assert.ok(r.finalPrice > r.baseCost, 'final price should include the target margin');
});

test('extra pets add a flat surcharge per additional pet, not the first', () => {
  const one = calculate({ ...DEFAULTS, petCount: 1 });
  const three = calculate({ ...DEFAULTS, petCount: 3 });
  assert.equal(three.extraPets, 2);
  assert.equal(three.petSurcharge, 2 * DEFAULTS.additionalPetFee);
  assert.ok(three.finalPrice > one.finalPrice);
});

test('rejects fewer than one pet', () => {
  assert.throws(() => calculate({ ...DEFAULTS, petCount: 0 }), /at least 1/);
});

test('overnight pricing bills active minutes per night plus on-call hours, and drive time only once', () => {
  const r = calculate({
    ...DEFAULTS,
    overnightNights: 2,
    overnightActiveMinutes: 45,
    overnightOnCallHours: 2,
    driveMinutes: 20,
  });
  assert.equal(r.isOvernight, true);
  assert.equal(r.nights, 2);
  assert.equal(r.activeMinutes, 90); // 45 * 2 nights
  assert.equal(r.onCallMinutes, 240); // 2 hours * 60 * 2 nights
  assert.equal(r.driveMinutes, 20); // charged once, not per night
  assert.equal(r.billableMinutes, 90 + 240 + 20);
});

test('overnightNights of zero is treated as a walk/drop-in visit', () => {
  const r = calculate({ ...DEFAULTS, overnightNights: 0 });
  assert.equal(r.isOvernight, false);
  assert.equal(r.activeMinutes, DEFAULTS.visitMinutes);
  assert.equal(r.onCallMinutes, 0);
});

test('holiday surcharge applies after margin, on the marked-up subtotal', () => {
  const base = calculate({ ...DEFAULTS, holidaySurchargePct: 0 });
  const holiday = calculate({ ...DEFAULTS, holidaySurchargePct: 20 });
  const expectedPreHoliday = base.baseCost + base.marginAmount;
  assert.ok(Math.abs(holiday.holidayAmount - expectedPreHoliday * 0.2) < 1e-9);
  assert.ok(holiday.finalPrice > base.finalPrice);
});

test('payment processing fee grosses up the price so the operator still nets the pre-fee total', () => {
  const r = calculate({ ...DEFAULTS, paymentProcessingFeePct: 3 });
  const netAfterFee = r.finalPrice * (1 - 0.03);
  const preProcessing = r.finalPrice - r.processingFeeAmount;
  assert.ok(Math.abs(netAfterFee - preProcessing) < 1e-9);
});

test('rejects a payment processing fee of 100 percent or more', () => {
  assert.throws(() => calculate({ ...DEFAULTS, paymentProcessingFeePct: 100 }), /below 100/);
});

test('rejects a target margin of 100 percent or more', () => {
  assert.throws(() => calculate({ ...DEFAULTS, targetMarginPct: 100 }), /below 100/);
});

test('rejects a negative input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, mileage: -1 }), /zero or greater/);
});

test('zero expected visits per month allocates zero overhead instead of dividing by zero', () => {
  const r = calculate({ ...DEFAULTS, expectedVisitsPerMonth: 0 });
  assert.equal(r.overheadPerVisit, 0);
  assert.ok(Number.isFinite(r.finalPrice));
});

test('effective hourly rate is the final price over hours actually billed', () => {
  const r = calculate(DEFAULTS);
  assert.ok(Math.abs(r.effectiveHourlyRate - r.finalPrice / r.hoursBilled) < 1e-9);
});

test('computeRouteRevenue sums recurring clients using the calendar-average weeks per month', () => {
  const result = computeRouteRevenue([
    { price: 20, visitsPerWeek: 5 }, // Mon-Fri walk
    { price: 35, visitsPerWeek: 2 }, // twice-weekly drop-in
  ]);
  const weeks = 52 / 12;
  const expectedRevenue = 20 * 5 * weeks + 35 * 2 * weeks;
  assert.ok(Math.abs(result.monthlyRevenue - expectedRevenue) < 1e-9);
  assert.equal(result.clientCount, 2);
  assert.ok(Math.abs(result.totalVisitsPerMonth - (5 + 2) * weeks) < 1e-9);
});

test('computeRouteRevenue with no clients returns zero revenue and a zero average, not NaN', () => {
  const result = computeRouteRevenue([]);
  assert.equal(result.monthlyRevenue, 0);
  assert.equal(result.averagePrice, 0);
});

test('computeRouteRevenue accepts an explicit weeks-per-month override', () => {
  const result = computeRouteRevenue([{ price: 10, visitsPerWeek: 1 }], 4);
  assert.equal(result.monthlyRevenue, 40);
});

test('incomeGap reports no gap and zero additional visits when the target is already met', () => {
  const gap = incomeGap(2000, 2200, 25);
  assert.equal(gap.gap, 0);
  assert.equal(gap.additionalVisitsNeeded, 0);
  assert.equal(gap.meetsTarget, true);
});

test('incomeGap rounds up to a whole extra visit', () => {
  const gap = incomeGap(2000, 1900, 30);
  assert.equal(gap.gap, 100);
  assert.equal(gap.additionalVisitsNeeded, 4); // 100/30 = 3.33 -> 4
  assert.equal(gap.meetsTarget, false);
});

test('incomeGap with a zero average price cannot say how many visits close the gap', () => {
  const gap = incomeGap(2000, 0, 0);
  assert.equal(gap.additionalVisitsNeeded, null);
});

test('incomeGap rejects a negative target', () => {
  assert.throws(() => incomeGap(-1, 0, 10), /zero or greater/);
});

test('unbilled cancellations gross the price up so completed visits cover the lost ones', () => {
  const base = calculate({ ...DEFAULTS });
  const r = calculate({ ...DEFAULTS, unbilledCancellationPct: 10 });
  assert.ok(Math.abs(r.finalPrice * 0.9 - base.finalPrice) < 1e-9);
  assert.ok(Math.abs(r.cancellationAmount - (r.finalPrice - base.finalPrice)) < 1e-9);
  assert.throws(() => calculate({ ...DEFAULTS, unbilledCancellationPct: 100 }), /below 100/);
});
