import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

function fakeStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('records only an aggregate local event', () => {
  const storage = fakeStorage();
  recordUsage(storage);
  const event = JSON.parse(storage.values.get('booth-rent-vs-commission-usage'));
  assert.equal(event.comparison_calculated, 1);
  assert.match(event.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test('honors opt out', () => {
  let called = false;
  recordUsage({ setItem: () => { called = true; } }, true);
  assert.equal(called, false);
});

test('supports a named aggregate event without recording inputs', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'summary_copied');
  recordUsage(storage, false, 'summary_copied');
  recordUsage(storage, false, 'offered_rent_compared');
  const event = JSON.parse(storage.values.get('booth-rent-vs-commission-usage'));
  assert.equal(event.summary_copied, 2);
  assert.equal(event.offered_rent_compared, 1);
});

test('stores nothing beyond event counters and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'comparison_calculated');
  const keys = Object.keys(JSON.parse(storage.values.get('booth-rent-vs-commission-usage')));
  assert.deepEqual(keys.sort(), ['comparison_calculated', 'last_day']);
});

test('missing storage is a no-op rather than a crash', () => {
  assert.doesNotThrow(() => recordUsage(null));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'comparison_calculated'));
});

test('the tax-flip outcome count is a bare tally like every other event', () => {
  // Recorded when the payroll-tax verdict disagrees with the pre-tax one, so
  // the venture can learn whether this section changes real decisions or only
  // decorates them. It must carry no figure from the book -- a flip says a
  // stylist's two offers were close, which is itself about their pay.
  const storage = new Map();
  storage.getItem = key => storage.get(key) ?? null;
  storage.setItem = (key, value) => storage.set(key, value);

  recordUsage(storage, false, 'tax_verdict_flipped');
  recordUsage(storage, false, 'tax_verdict_flipped');
  const event = JSON.parse(storage.getItem('booth-rent-vs-commission-usage'));
  assert.equal(event.tax_verdict_flipped, 2);
  assert.deepEqual(Object.keys(event).sort(), ['last_day', 'tax_verdict_flipped']);

  // And it honours the opt-out like the rest.
  const optedOut = new Map();
  optedOut.getItem = key => optedOut.get(key) ?? null;
  optedOut.setItem = (key, value) => optedOut.set(key, value);
  recordUsage(optedOut, true, 'tax_verdict_flipped');
  assert.equal(optedOut.getItem('booth-rent-vs-commission-usage'), null);
});
