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

test('lags: 1 takes the nearest earlier same-weekday open day (README "Steps beside a closure")', () => {
  const l = days(36);
  const v = l.map((_, i) => 10 + i);
  assert.equal(fillClosed(v, l, [l[35]], { lags: 1 }).values[35], 38); // index 28
  // a closed same weekday is skipped: 28 shut too, so 35 takes 21
  const r = fillClosed(v, l, [l[28], l[35]], { lags: 1 });
  assert.equal(r.values[35], 31);
  // prefix-honest as the default is
  const shut = [l[9], l[16], l[30], l[31]];
  const whole = fillClosed(v, l, shut, { lags: 1 }).values;
  for (let n = 10; n <= 36; n++) assert.deepEqual(fillClosed(v.slice(0, n), l.slice(0, n), shut, { lags: 1 }).values, whole.slice(0, n));
});

// README "Steps beside a closure" (eval/closed-steps.prereg.md): fill1 passed S1-S3 on fresh seeds, so --closed ships.
test('--closed on the watch CLI: list or @file, one column and --columns, text and JSON', async () => {
  const { main } = await import('./watch.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const csv = new URL('./data/online-retail-2009-daily.csv', import.meta.url).pathname;
  const run = async (args) => { let s = ''; const code = await main(args, { out: (t) => { s += t; } }); return { code, s }; };
  const one = await run([csv, '--column', 'orders', '--model', 'poisson', '--period', '7', '--closed', '2010-04-02,2010-04-05,2031-01-01', '--dry-run', '--json']);
  const j = JSON.parse(one.s);
  assert.equal(j.closed.listed, 3);
  assert.deepEqual(j.closed.filled.map((f) => [f.label, f.was, f.now]), [['2010-04-02', 0, 62], ['2010-04-05', 0, 85]]);
  const dir = mkdtempSync(join(tmpdir(), 'closed-'));
  writeFileSync(join(dir, 'c.txt'), '# Easter\n2010-04-02\n\n2010-04-05\n');
  const text = await run([csv, '--columns', 'orders:poisson,cancellations:poisson', '--period', '7', '--closed', '@' + join(dir, 'c.txt'), '--suggest']);
  assert.match(text.s, /Closed: 2 of 2 listed days in this series/);
  await assert.rejects(() => run([csv, '--closed', '--dry-run']), /--closed takes/);
});

test('fill1 on the fresh shop year: Quiet on orders sends no alert at a closure', () => {
  const csv = readFileSync(new URL('./data/online-retail-2009-daily.csv', import.meta.url), 'utf8');
  const { labels, values } = parseSeries(csv, 'orders', null);
  const closed = ['2009-12-24', '2009-12-25', '2009-12-27', '2009-12-28', '2009-12-29', '2009-12-30', '2009-12-31', '2010-01-01', '2010-01-03', '2010-04-02', '2010-04-04', '2010-04-05', '2010-05-03', '2010-05-31', '2010-08-30'];
  const day = (s) => Date.parse(`${s}T00:00:00Z`) / 864e5;
  const r = replayWatch(fillClosed(values, labels, closed, { period: 7, round: true, lags: 1 }).values, labels, { model: 'poisson', period: 7, detector: 'bocpd' });
  assert.equal(r.alerts.filter((a) => closed.some((c) => Math.abs(day(c) - day(String(a.label))) <= 1)).length, 0);
});

// Round 3 (eval/closed-recent.prereg.md): `recent: k` reads the level from the k nearest earlier open days in the last
// cycle, each scaled to the closed day's phase by phase means over the 4 cycles ending at i-L.
test('recent: 3 fills a closure a few days after a step at the new level, skipping always-zero days', () => {
  const l = days(40);
  const v = l.map((_, i) => (i % 7 === 5 ? 0 : (i % 7 === 6 ? 24 : 40) * (i >= 30 ? 1.4 : 1)));
  // index 34 (a Sunday, 4 days after the step): recent days 32, 31, 30 (33 is the always-zero Saturday)
  assert.ok(Math.abs(fillClosed(v, l, [l[34]], { period: 7, recent: 3 }).values[34] - 33.6) < 1e-9);
  assert.equal(fillClosed(v, l, [l[34]], { period: 7, lags: 1 }).values[34], 24); // fill1: the Sunday before the step
  // flat series: the fill is the weekday's own level
  const f = l.map((_, i) => (i % 7 === 5 ? 0 : i % 7 === 6 ? 24 : 40));
  assert.equal(fillClosed(f, l, [l[34], l[36]], { period: 7, recent: 3 }).values[36], 40);
  // no history for the closed weekday in the window: falls back to the lags rule (here: the previous open day)
  assert.equal(fillClosed(v, l, [l[3]], { period: 7, recent: 3 }).values[3], 40);
});

test('recent: 3 is prefix-honest', () => {
  const l = days(70);
  const v = l.map((_, i) => ((i * 37) % 11) + (i % 7 === 5 ? 0 : 5));
  const shut = [l[9], l[16], l[30], l[31], l[50], l[66]];
  const whole = fillClosed(v, l, shut, { recent: 3, lags: 1 }).values;
  for (let n = 10; n <= 70; n++) assert.deepEqual(fillClosed(v.slice(0, n), l.slice(0, n), shut, { recent: 3, lags: 1 }).values, whole.slice(0, n), `prefix ${n}`);
});

// README "A closure in the week before a step" (eval/closed-before.prereg.md, real part): the design year's 2011-09-01
// orders alert (the Christmas build-up) is sent only while the 2011-08-29 bank holiday, three days earlier, is a zero.
test('design year orders: the 2011-09-01 build-up alert comes from the 2011-08-29 zero, not the rise alone', () => {
  const csv = readFileSync(new URL('./data/online-retail-daily.csv', import.meta.url), 'utf8');
  const { labels, values } = parseSeries(csv, 'orders', null);
  const closed = labels.filter((d, i) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 6 && values[i] === 0);
  assert.ok(closed.includes('2011-08-29'));
  const h = labels.indexOf('2011-08-29');
  const sept = (v) => replayWatch(v, labels, { model: 'poisson', period: 7, detector: 'bocpd' }).alerts.filter((a) => a.label === '2011-09-01').length;
  const fill = (list) => fillClosed(values, labels, list, { period: 7, round: true, lags: 1 }).values;
  assert.equal(sept(fill(closed.filter((d) => d !== '2011-08-29'))), 1, 'with the holiday as a zero, Quiet sends it');
  assert.equal(sept(fill(closed)), 0, 'with --closed (fill1), it does not');
  const open = fill(closed); open[h] = Math.round((values[h - 7] + values[h + 7]) / 2);
  assert.equal(sept(open), 0, 'with the Monday read as an ordinary open Monday, it does not either');
});
