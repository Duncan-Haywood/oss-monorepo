import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, dailyIncomeGap, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculateQuote() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.laborHours, 0.5);
  close(r.travelHours, 1 / 3);
  close(r.timeCost, 75);
  close(r.emergencySurcharge, 0);
  close(r.billedTime, 75);
  close(r.parts, 56);
  close(r.callbackReserve, 6.64);
  close(r.overhead, 25.896);
  close(r.cost, 198.536);
  close(r.target, 283.62286, 0.001);
  close(r.finalPrice, 283.62286, 0.001);
  assert.equal(r.minimumApplied, false);
  close(r.profit, 85.08686, 0.001);
  close(r.profitMarginPct, 30);
  assert.ok(r.finalPrice > 0, 'the default call should price above zero');
});

test('an emergency call adds the premium to billed time only, never to parts', () => {
  const scheduled = calculateQuote(DEFAULTS);
  const emergency = calculateQuote({ ...DEFAULTS, emergencyCall: true });
  close(emergency.emergencySurcharge, 37.5);
  close(emergency.parts, scheduled.parts);
  assert.ok(emergency.finalPrice > scheduled.finalPrice, 'an emergency call should price higher than a scheduled one');
  close(emergency.profitMarginPct, 30);
});

test('a short, cheap job is priced at the minimum service charge floor, not below it', () => {
  const r = calculateQuote({ ...DEFAULTS, laborMinutes: 5, travelMinutes: 5, partsCost: 0 });
  close(r.cost, 59.8);
  close(r.target, 85.42857, 0.001);
  assert.equal(r.finalPrice, DEFAULTS.minimumServiceCharge);
  assert.equal(r.minimumApplied, true);
  assert.ok(r.profitMarginPct > 30, 'the minimum floor should lift margin above the target once it applies');
});

test('a call with zero labor and travel time still charges the trip fee and parts', () => {
  const r = calculateQuote({ ...DEFAULTS, laborMinutes: 0, travelMinutes: 0 });
  assert.equal(r.timeCost, 0);
  assert.equal(r.billedTime, 0);
  assert.ok(r.finalPrice > 0, 'trip fee and parts alone still produce a positive price');
  assert.equal(r.effectiveHourlyRate, null, 'zero billed hours has no effective hourly rate');
});

test('higher parts markup raises price by exactly the extra markup amount, scaled by cost stack multipliers', () => {
  const low = calculateQuote({ ...DEFAULTS, partsMarkupPct: 30 });
  const high = calculateQuote({ ...DEFAULTS, partsMarkupPct: 50 });
  assert.ok(high.parts > low.parts);
  assert.ok(high.finalPrice > low.finalPrice);
});

test('rejects a target margin of 100% or more', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMargin: 100 }), /margin/i);
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMargin: 150 }), /margin/i);
});

test('rejects a negative labor minutes value', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, laborMinutes: -5 }), /labor minutes/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, hourlyRate: 'a lot' }), /hourly rate/i);
});

test('rejects an emergency premium above the 500% sanity ceiling', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, emergencyPct: 600 }), /emergency premium/i);
});

test('rejects an overhead rate over 100%', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, overheadRate: 150 }), /overhead rate/i);
});

test('dailyIncomeGap reports the shortfall and calls needed to close it', () => {
  const gap = dailyIncomeGap(400, 80, 3);
  assert.equal(gap.totalDailyProfit, 240);
  assert.equal(gap.gap, 160);
  assert.equal(gap.additionalCallsNeeded, 2);
  assert.equal(gap.meetsTarget, false);
});

test('dailyIncomeGap reports goal met with zero additional calls once profit clears the target', () => {
  const gap = dailyIncomeGap(400, 80, 6);
  assert.equal(gap.gap, 0);
  assert.equal(gap.additionalCallsNeeded, 0);
  assert.equal(gap.meetsTarget, true);
});

test('dailyIncomeGap cannot compute additional calls when profit per call is zero or negative', () => {
  const gap = dailyIncomeGap(400, 0, 3);
  assert.equal(gap.additionalCallsNeeded, null);
  assert.equal(gap.meetsTarget, false);
});

test('dailyIncomeGap rejects a negative calls-per-day input', () => {
  assert.throws(() => dailyIncomeGap(400, 80, -1), /calls per day/i);
});
