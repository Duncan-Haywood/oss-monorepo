import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, quoteResult } from './calc.mjs';

const base = { travelMiles: 20, mileageRate: .7, travelMinutes: 30, hourlyRate: 60, appointmentMinutes: 45, minimumFee: 50, stateFees: 15, witnessFee: 25, witnesses: 1, afterHoursFee: 0, waitingMinutes: 0, waitingRate: 30 };
test('prices travel, time, fees, and witness', () => { const result = calculateQuote(base); assert.equal(result.travelCost, 14); assert.equal(result.travelTimeCost, 30); assert.equal(result.appointmentCost, 45); assert.equal(result.quote, 129); });
test('minimum protects a short appointment', () => { const result = calculateQuote({ ...base, travelMiles: 0, travelMinutes: 0, appointmentMinutes: 5, stateFees: 0, witnesses: 0, minimumFee: 75 }); assert.equal(result.minimumApplied, true); assert.equal(result.quote, 75); });
test('rejects negative or nonnumeric inputs', () => { assert.throws(() => calculateQuote({ ...base, travelMiles: -1 }), /Travel miles/); assert.throws(() => calculateQuote({ ...base, hourlyRate: 'nope' }), /Hourly rate/); });

test('a fractional witness count floors instead of pricing a partial witness', () => {
  const result = calculateQuote({ ...base, witnesses: 2.9 });
  assert.equal(result.witnessCost, 50);
});

test('a very large but finite trip still totals correctly', () => {
  const result = calculateQuote({ ...base, travelMiles: 5000, mileageRate: 1.25, hourlyRate: 500 });
  assert.equal(result.travelCost, 6250);
  assert.ok(Number.isFinite(result.quote));
});

// The page recalculates on every keystroke, and a `type="number"` input lets
// a visitor type a leading "-" even with `min="0"` set (the browser only
// enforces `min` on submit and the spinner buttons). Before quoteResult()
// existed, the page called calculateQuote() directly with nothing to catch
// the throw, so one stray "-" froze the total with no explanation on screen.
test('quoteResult never throws: an invalid figure comes back as a message, not an exception', () => {
  const bad = quoteResult({ ...base, travelMiles: -1 });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Travel miles/);
  assert.doesNotThrow(() => quoteResult({ ...base, hourlyRate: 'nope' }));
  assert.doesNotThrow(() => quoteResult({ ...base, witnesses: Infinity }));
});

test('quoteResult mirrors calculateQuote on valid input', () => {
  const good = quoteResult(base);
  assert.equal(good.ok, true);
  assert.equal(good.quote, 129);
});
