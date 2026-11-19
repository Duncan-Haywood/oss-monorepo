import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSeries } from './engine.mjs';
import { fillClosed, replayWatch } from './watch-core.mjs';

// README "Closed days filled as missing" (eval/closed-days.prereg.md): fillClosed is pre-registered and failed its
// purpose bar (K1), so it is a module function only, not a CLI option. These tests pin the rule and the fresh-year numbers.

const days = (n, from = '2024-01-01') => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10));

test('a closed day takes the median of the same weekday in the 4 weeks before it', () => {
  const l = days(36);
  const v = l.map((_, i) => 10 + i); // 10, 11, ...
  const { values, filled } = fillClosed(v, l, [l[35]]);
  // same weekday: 28, 21, 14, 7 -> values 38, 31, 24, 17 -> median (24 + 31) / 2
  assert.equal(values[35], 27.5);
  assert.deepEqual(filled, [{ index: 35, label: l[35], was: 45, now: 27.5 }]);
  assert.equal(fillClosed(v, l, [l[35]], { round: true }).values[35], 28);
});

test('only earlier points feed a fill, so filling the whole series equals filling each prefix', () => {
  const l = days(60);
  const v = l.map((_, i) => (i * 37) % 11);
  const shut = [l[9], l[16], l[30], l[31], l[50]];
  const whole = fillClosed(v, l, shut).values;
  for (let n = 10; n <= 60; n++) assert.deepEqual(fillClosed(v.slice(0, n), l.slice(0, n), shut).values, whole.slice(0, n), `prefix ${n}`);
});

test('fallbacks: no same weekday before -> previous open day; closure at the start -> next open day; period sets the lag', () => {
  const l = days(10);
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const r = fillClosed(v, l, ['2024-01-01', '2024-01-08', '2030-01-01']);
  assert.deepEqual(r.values, [2, 2, 3, 4, 5, 6, 7, 7, 9, 10]);
  assert.equal(r.filled.length, 2); // the 2030 date is not in the series and is ignored
  assert.equal(fillClosed(v, l, [l[9]], { period: 3 }).values[9], 4); // lags 3, 6, 9 -> 7, 4, 1 -> median 4
});

test('labels that are not consecutive days use lag 1; every label closed is refused', () => {
  const l = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(fillClosed([5, 1, 9, 3, 7], l, ['e']).values, [5, 1, 9, 3, 4]); // the 4 before: 3, 9, 1, 5 -> 4
  assert.throws(() => fillClosed([1, 2], ['x', 'y'], ['x', 'y']), /every label/);
});

test('fresh year (Online Retail II 2009-10), orders, Quiet, --period 7: 3 of 11 alerts at a closure without, 0 of 6 with', () => {
  const csv = readFileSync(new URL('./data/online-retail-2009-daily.csv', import.meta.url), 'utf8');
  const { labels, values } = parseSeries(csv, 'orders', null);
  assert.equal(values.length, 374);
  const closed = ['2009-12-24', '2009-12-25', '2009-12-27', '2009-12-28', '2009-12-29', '2009-12-30', '2009-12-31', '2010-01-01', '2010-01-03', '2010-04-02', '2010-04-04', '2010-04-05', '2010-05-03', '2010-05-31', '2010-08-30'];
  for (const d of closed) assert.equal(values[labels.indexOf(d)], 0, d);
  const day = (s) => Date.parse(`${s}T00:00:00Z`) / 864e5;
  const atClosure = (r) => r.alerts.filter((a) => closed.some((c) => Math.abs(day(c) - day(String(a.label))) <= 1)).length;
  const off = replayWatch(values, labels, { model: 'poisson', period: 7, detector: 'bocpd' });
  const on = replayWatch(fillClosed(values, labels, closed, { period: 7, round: true }).values, labels, { model: 'poisson', period: 7, detector: 'bocpd' });
  assert.equal(off.alerts.length, 11);
  assert.equal(atClosure(off), 3);
  assert.equal(on.alerts.length, 6);
  assert.equal(atClosure(on), 0);
  // the autumn build-up, dated 2010-11-09 either way, is sent 6 days sooner with the closures filled
  assert.equal(off.alerts.find((a) => a.label === '2010-11-09').reportedAtLabel, '2010-11-19');
  assert.equal(on.alerts.find((a) => a.label === '2010-11-09').reportedAtLabel, '2010-11-13');
});
