import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeboCheck } from './known-date.mjs';
import { knownDateResult, knownDateText } from './known-date-cli.mjs';
import { analyze } from './engine.mjs';

// In-time placebos beside --known-date (README "In-time placebos", eval/known-date-prereg-placebo-2026-11-17.md;
// real readings in eval/known-date-placebo-real.out.txt).
const csv = (name) => readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8');

test('placeboCheck: dates spread through the before-period, each with minSide + period points on both sides', () => {
  const x = Array.from({ length: 120 }, (_, t) => 0.05 * t + Math.sin(t * 1.7));
  const pc = placeboCheck(x, 60, { reps: 19 });
  assert.deepEqual(pc.dates.map((d) => d.k), [19, 30, 41]);
  assert.equal(pc.before, 60);
  const short = placeboCheck(x.slice(0, 30), 15, { reps: 19 });
  assert.deepEqual(short.dates, []);
  assert.equal(short.warn, false);
  const seasonal = placeboCheck(x, 60, { period: 12, reps: 19 });
  assert.ok(seasonal.dates.every((d) => d.k >= 20 && d.k <= 40), JSON.stringify(seasonal.dates.map((d) => d.k)));
});

test('the drivers-to-rear ratio before the seat-belt law warns (the series whose placebos failed the control round)', () => {
  const d = csv('uk-road-casualties.csv').trim().split('\n').map((l) => l.split(','));
  const rows = ['month,ratio', ...d.slice(1).map((r) => `${r[0]},${(+r[2] / +r[4]).toFixed(6)}`)].join('\n');
  const r = knownDateResult({ csv: rows, column: 'ratio', date: '1983-02', period: 12, log: true, reps: 199 });
  assert.equal(r.placebo.warn, true);
  assert.equal(r.placebo.fired, 3);
  assert.deepEqual(r.placebo.dates.map((x) => x.label), ['1973-05', '1976-02', '1978-10']);
  assert.match(knownDateText(r), /WARNING: the line before your date is not a stable baseline/);
});

test('the Nile before 1899 and drivers before 1983 do not warn', () => {
  const nile = knownDateResult({ csv: csv('nile.csv'), date: '1899', reps: 199 });
  assert.equal(nile.placebo.warn, false);
  assert.equal(nile.placebo.tested, 3);
  assert.match(knownDateText(nile), /0 of 3 at p <= 0\.05\. No warning/);
  const drivers = knownDateResult({ csv: csv('uk-driver-deaths.csv'), column: 'deaths', date: '1983-02', period: 12, log: true, reps: 199 });
  assert.equal(drivers.placebo.warn, false);
  assert.equal(drivers.placebo.fired, 1); // 1973-05, the 1973-74 fuel crisis
});

test('a refused named date carries no placebo field', () => {
  const r = knownDateResult({ csv: csv('qcement.csv'), column: 'cement', date: '2000Q3', period: 4, log: true, reps: 19 });
  assert.equal(r.refused, true);
  assert.equal('placebo' in r, false);
});

test('analyze(): knownDate carries the placebos, and placebo: false leaves them out', () => {
  const r = analyze({ csv: csv('nile.csv'), knownDate: { date: '1899', reps: 199 } }).knownDate;
  assert.equal(r.placebo.warn, false);
  assert.deepEqual(r.placebo.dates.map((d) => d.label), ['1882', '1885', '1888']);
  assert.equal('placebo' in analyze({ csv: csv('nile.csv'), knownDate: { date: '1899', reps: 19, placebo: false } }).knownDate, false);
});

test('page: the placebo sentence is in the known-date result', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /In-time placebos<\/strong>/);
  assert.match(html, /h\.placebo\.warn/);
});
