import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, rankClients, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  close(r.extraAttempts, 1);
  close(r.extraAttemptRevenue, 15);
  close(r.rushRevenue, 0);
  close(r.skipTraceRevenue, 0);
  close(r.mileageRevenue, 6.7);
  close(r.grossRevenue, 96.7);
  close(r.vehicleCost, 3.6);
  close(r.fixedJobCost, 5);
  close(r.totalCost, 8.6);
  close(r.netProfit, 88.1);
  close(r.totalTimeHours, 0.9);
  close(r.effectiveHourlyRate, 88.1 / 0.9);
  close(r.profitMarginPct, (88.1 / 96.7) * 100);
  close(r.minBaseFeeToBreakEven, -23.1);
  assert.ok(r.netProfit > 0, 'the default job should be profitable');
});

test('a rush job with a needed skip trace adds both surcharges to gross revenue', () => {
  const r = calculate({ ...DEFAULTS, rushJob: 1, skipTraceNeeded: 1 });
  close(r.rushRevenue, 25);
  close(r.skipTraceRevenue, 40);
  close(r.grossRevenue, 161.7);
  close(r.netProfit, 153.1);
});

test('exactly the included attempts and miles adds no extra-attempt or mileage revenue', () => {
  const r = calculate({ ...DEFAULTS, attemptsActual: 2, milesRoundTrip: 10 });
  assert.equal(r.extraAttempts, 0);
  assert.equal(r.extraAttemptRevenue, 0);
  assert.equal(r.mileageRevenue, 0);
  close(r.grossRevenue, 75);
});

test('miles driven under the included radius still cost real vehicle money, just not billed to the client', () => {
  const r = calculate({ ...DEFAULTS, milesRoundTrip: 5 });
  assert.equal(r.mileageRevenue, 0);
  close(r.vehicleCost, 0.9);
  close(r.grossRevenue, 90);
  close(r.netProfit, 84.1);
});

test('zero total time hours reports a null effective hourly rate instead of dividing by zero', () => {
  const r = calculate({ ...DEFAULTS, driveTimeHours: 0, onSiteTimeHours: 0, paperworkTimeHours: 0 });
  assert.equal(r.effectiveHourlyRate, null);
});

test('zero gross revenue reports a null profit margin instead of dividing by zero', () => {
  const r = calculate({
    ...DEFAULTS, baseFee: 0, extraAttemptFee: 0, rushSurchargeFee: 0, skipTraceFee: 0,
    affidavitFee: 0, attemptsActual: 2, milesRoundTrip: 10,
  });
  assert.equal(r.grossRevenue, 0);
  assert.equal(r.profitMarginPct, null);
  assert.ok(r.netProfit < 0, 'vehicle and fixed cost still apply with zero revenue');
});

test('a job worth taking even for free from add-ons alone reports a negative break-even base fee', () => {
  const r = calculate(DEFAULTS);
  assert.ok(r.minBaseFeeToBreakEven < 0, 'add-on revenue alone already covers this job\'s cost');
});

test('a bad address needing many extra attempts and a long drive can push break-even above a normal base fee', () => {
  const r = calculate({
    ...DEFAULTS, attemptsActual: 2, extraAttemptFee: 0, rushJob: 0, skipTraceNeeded: 0,
    affidavitFee: 0, milesRoundTrip: 10, milesIncluded: 10, fixedJobCost: 80,
  });
  assert.ok(r.minBaseFeeToBreakEven > 65, 'this job needs more than a normal base fee to break even');
});

test('rejects a rush flag above 1', () => {
  assert.throws(() => calculate({ ...DEFAULTS, rushJob: 2 }), /rush job flag/i);
});

test('rejects a skip trace flag above 1', () => {
  assert.throws(() => calculate({ ...DEFAULTS, skipTraceNeeded: 3 }), /skip trace flag/i);
});

test('rejects a negative attempts actual', () => {
  assert.throws(() => calculate({ ...DEFAULTS, attemptsActual: -1 }), /attempts actual/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, baseFee: 'a lot' }), /base fee/i);
});

test('rankClients sorts by net profit descending and reports the spread', () => {
  const r = rankClients([
    { name: 'Firm A', netProfit: 88.1 },
    { name: 'Firm B', netProfit: 40 },
    { name: 'Firm C', netProfit: 153.1 },
  ]);
  assert.deepEqual(r.ranked.map(o => o.name), ['Firm C', 'Firm A', 'Firm B']);
  assert.equal(r.best.name, 'Firm C');
  assert.equal(r.worst.name, 'Firm B');
  close(r.spread, 153.1 - 40);
  assert.equal(r.clientCount, 3);
});

test('rankClients on an empty list returns nulls without dividing by zero', () => {
  const r = rankClients([]);
  assert.equal(r.best, null);
  assert.equal(r.worst, null);
  assert.equal(r.spread, 0);
  assert.equal(r.clientCount, 0);
});

test('rankClients accepts a negative net profit (a losing client relationship) rather than rejecting it', () => {
  const r = rankClients([{ name: 'Bad firm', netProfit: -12 }, { name: 'Good firm', netProfit: 88.1 }]);
  assert.equal(r.best.name, 'Good firm');
  assert.equal(r.worst.name, 'Bad firm');
  close(r.spread, 100.1);
});
