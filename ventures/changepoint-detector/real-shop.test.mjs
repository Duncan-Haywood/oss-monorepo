import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSeries } from './engine.mjs';
import { eagernessReplay, eagernessText, weekdayBunching, weekdayEffect } from './watch-core.mjs';

// README "A real shop's daily series": UCI Online Retail, a UK online shop closed on Saturdays.
const csv = readFileSync(new URL('./data/online-retail-daily.csv', import.meta.url), 'utf8');
const orders = parseSeries(csv, 'orders', null);

test('the daily CSV: 374 days, every Saturday zero, the Christmas closure zero', () => {
  assert.equal(orders.values.length, 374);
  assert.equal(orders.labels[0], '2010-12-01');
  orders.labels.forEach((l, i) => {
    if (new Date(`${l}T00:00:00Z`).getUTCDay() === 6) assert.equal(orders.values[i], 0, l);
  });
  for (const l of ['2010-12-24', '2010-12-27', '2010-12-31', '2011-01-03']) assert.equal(orders.values[orders.labels.indexOf(l)], 0, l);
});

// The 2026-11-18 round ran the count ladder of its day, Quiet = bocpd; README "The How eager hint for counts" made the
// count default Quiet on 2026-11-20, so these two pin the old ladder to keep that round's numbers checkable.
const OLD_LADDER = [{ key: 'quiet', detector: 'bocpd' }, { key: 'eager', detector: 'pelt' }];

test('orders without a period: Quiet sends 37 alerts, all on a Sunday or Monday, and the text says weekly cycle', () => {
  const r = eagernessReplay(orders.values, orders.labels, { model: 'poisson', ladder: OLD_LADDER });
  const quiet = r.settings.find((s) => s.key === 'quiet');
  assert.equal(quiet.alerts, 37);
  assert.deepEqual(quiet.weekly.days, ['Sunday', 'Monday']);
  assert.equal(quiet.weekly.onPair, 37);
  assert.ok(quiet.weekly.dataP < 1e-10);
  assert.match(eagernessText(r, { column: 'orders' }), /Weekly cycle: 37 of these 37 alerts .*--period 7/);
});

test('orders with --period 7: Quiet sends 4 alerts and no weekly line', () => {
  const r = eagernessReplay(orders.values, orders.labels, { model: 'poisson', period: 7, ladder: OLD_LADDER });
  const quiet = r.settings.find((s) => s.key === 'quiet');
  assert.equal(quiet.alerts, 4);
  assert.ok(r.settings.every((s) => !s.weekly));
  assert.doesNotMatch(eagernessText(r, { column: 'orders' }), /Weekly cycle/);
});

test('today\'s count ladder on the same orders: Quiet (the count default) sends 2 alerts, and misses the 2011-09-01 build-up', () => {
  // Since 2026-11-21 the ladder has a Middle (pelt + NB cost; README "A middle setting for over-dispersed counts").
  // Flat, without a period it sent 7 (2.33 per 100 checks, over budget) and the hint stayed on Quiet. With the gated
  // growth term (README "The joint growth fit, gated", eval/real-shop-joint-middle.out.txt) it sends 5 (1.67 per 100):
  // 2011-08-27 and 2011-09-19 inside the autumn climb are gone, and the hint picks Middle. With --period 7 it sends 3,
  // Easter's two and 2011-09-19, as before, and the hint picks it.
  for (const [period, want, middle, suggest] of [
    [undefined, ['2011-05-03', '2011-05-31'], ['2011-03-12', '2011-04-22', '2011-04-29', '2011-05-28', '2011-11-06'], 'middle'],
    [7, ['2011-04-26', '2011-05-03'], ['2011-04-22', '2011-04-29', '2011-09-19'], 'middle'],
  ]) {
    const r = eagernessReplay(orders.values, orders.labels, { model: 'poisson', period, keepAlerts: true });
    const quiet = r.settings.find((s) => s.key === 'quiet');
    assert.equal(quiet.detector, 'bocpd-window');
    assert.deepEqual(quiet.alertLabels, want);
    assert.deepEqual(r.settings.find((s) => s.key === 'middle').alertLabels, middle);
    assert.equal(r.suggest, suggest);
    assert.ok(!quiet.weekly);
  }
});

const days = (n, start = '2024-01-01') => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10));

test('weekdayBunching: needs consecutive calendar days and 6 alerts; bunching alone is not enough when the history has no weekday effect', () => {
  const labels = days(120);
  const mondays = labels.filter((l) => new Date(`${l}T00:00:00Z`).getUTCDay() === 1).slice(0, 10);
  assert.ok(weekdayBunching(mondays, labels));                                          // no values: the alert test alone
  assert.equal(weekdayBunching(mondays.slice(0, 5), labels), null);                     // under 6 alerts
  assert.equal(weekdayBunching(mondays, labels.map((_, i) => String(i + 1))), null);    // not dates
  assert.equal(weekdayBunching(mondays, [...labels.slice(0, 50), ...labels.slice(51), '2030-01-01']), null); // a gap
  let s = 7;
  const noise = labels.map(() => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 10);
  assert.ok(weekdayEffect(noise, Date.parse('2024-01-01') / 864e5).p > 0.001);
  assert.equal(weekdayBunching(mondays, labels, { values: noise }), null);
  const closed = noise.map((x, i) => (new Date(`${labels[i]}T00:00:00Z`).getUTCDay() === 6 ? 0 : 20 + x));
  assert.ok(weekdayBunching(mondays, labels, { values: closed }));
});
