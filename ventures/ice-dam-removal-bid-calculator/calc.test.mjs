import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculateQuote() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.timeCost, 238);
  close(r.mileageCost, 23.45);
  close(r.overhead, 35.574);
  close(r.cost, 332.024);
  close(r.targetPrice, 474.32);
  close(r.rateCardPrice, 560);
  close(r.quotedPrice, 560);
  close(r.profit, 227.976);
  assert.equal(r.minimumApplied, false);
  assert.equal(r.underpriced, false);
  assert.equal(r.belowTargetMargin, false);
});

test('a long run comfortably clears the minimum charge and its own break-even rate', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.breakEvenRatePerFoot, 4.1503, 0.001);
  assert.equal(r.rateBelowBreakeven, false, 'the $7/ft rate card is above the $4.15/ft this 80ft job needs to break even');
});

test('a short job falls back to the minimum service charge, which is exactly the point of having one', () => {
  const r = calculateQuote({ ...DEFAULTS, edgeFeet: 15 });
  close(r.rateCardPrice, 105);
  close(r.quotedPrice, 375);
  assert.equal(r.minimumApplied, true);
  assert.equal(r.rateBelowBreakeven, true, 'the $7/ft rate card is far below the ~$22.13/ft this 15ft job would need without a floor');
  assert.equal(r.underpriced, false, 'the minimum charge itself still covers the mostly-fixed cost');
  close(r.profit, 42.976);
});

test('a short job with a minimum charge set too low is a real loss, not just a thin margin', () => {
  const r = calculateQuote({ ...DEFAULTS, edgeFeet: 15, minimumServiceCharge: 200 });
  assert.equal(r.minimumApplied, true);
  assert.equal(r.underpriced, true);
  close(r.shortfallVsCost, 132.024);
  assert.ok(r.profit < 0);
});

test('an emergency call adds a premium on billed time only, not on fuel or equipment', () => {
  const withEmergency = calculateQuote({ ...DEFAULTS, emergencyCall: true });
  const without = calculateQuote(DEFAULTS);
  close(withEmergency.emergencySurcharge, 83.3);
  close(withEmergency.cost - without.cost, withEmergency.emergencySurcharge * (1 + DEFAULTS.overheadRate / 100));
  assert.equal(withEmergency.belowTargetMargin, true, 'the rate card price does not itself rise for an emergency call, so it can fall below the higher target price');
});

test('emergencyCall=false ignores emergencyPct entirely', () => {
  const r = calculateQuote({ ...DEFAULTS, emergencyCall: false, emergencyPct: 500 });
  assert.equal(r.emergencySurcharge, 0);
});

test('breakEvenRatePerFoot scales inversely with footage since cost is mostly fixed', () => {
  const long = calculateQuote({ ...DEFAULTS, edgeFeet: 160 });
  const short = calculateQuote({ ...DEFAULTS, edgeFeet: 40 });
  assert.ok(short.breakEvenRatePerFoot > long.breakEvenRatePerFoot);
});

test('crew size and travel scale labor cost', () => {
  const soloCrew = calculateQuote({ ...DEFAULTS, crewSize: 1 });
  const bigCrew = calculateQuote({ ...DEFAULTS, crewSize: 3 });
  assert.ok(bigCrew.timeCost > soloCrew.timeCost);
});

test('no actual hours means the actual field is null', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.actual, null);
});

test('actual hours close to the estimate stay profitable', () => {
  const r = calculateQuote({ ...DEFAULTS, actualHours: 1 });
  close(r.actual.cost, 217.784);
  close(r.actual.profit, 342.216);
  assert.equal(r.actual.belowBreakEven, false);
});

test('actual hours far past the estimate (thick ice) can erase the quoted profit', () => {
  const r = calculateQuote({ ...DEFAULTS, actualHours: 10 });
  close(r.actual.cost, 903.224);
  close(r.actual.profit, -343.224);
  assert.equal(r.actual.belowBreakEven, true);
});

test('the quoted price does not change when actual hours are supplied -- it was already given to the customer', () => {
  const withActual = calculateQuote({ ...DEFAULTS, actualHours: 10 });
  const without = calculateQuote(DEFAULTS);
  close(withActual.quotedPrice, without.quotedPrice);
});

test('rejects a target margin of 100 or more', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, targetMargin: 100 }), /target margin/i);
});

test('rejects a zero edge footage', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, edgeFeet: 0 }), /linear feet/i);
});

test('rejects a zero crew size', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, crewSize: 0 }), /crew size/i);
});

test('rejects a negative travel miles', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, travelMiles: -5 }), /miles/i);
});

test('rejects an overhead rate above 100', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, overheadRate: 150 }), /overhead rate/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, crewHourlyRate: 'lots' }), /crew hourly rate/i);
});

test('rejects a non-numeric actual hours value', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, actualHours: 'a lot' }), /actual on-site hours/i);
});
