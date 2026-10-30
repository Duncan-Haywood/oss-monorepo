import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real exponential-growth series (data/johnson-johnson.csv): Johnson & Johnson quarterly earnings per share, 1960Q1-1980Q4.
// It has no documented changepoint; the check is that growth is not read as a staircase once the series is logged.
const rows = readFileSync(new URL('./data/johnson-johnson.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]);
const logged = raw.map(Math.log);
const run = (values, extra) => analyze({ values, labels, period: 4, ...extra }).pelt.changepoints;

test('real J&J earnings: raw growth is cut into a staircase by every level setting', () => {
  assert.equal(raw.length, 84);
  assert.ok(run(raw, {}).length >= 10, 'level model, additive season');
  assert.ok(run(raw, { multiplicative: true }).length >= 10, 'level model, multiplicative season');
});

test('real J&J earnings: the log series with a trend leaves at most a few changes', () => {
  assert.ok(run(logged, { trend: true }).length <= 6);
  assert.ok(run(logged, { trend: 'bend' }).length <= 3);
});

test('real J&J earnings: log option matches the hand-logged series and reports original units', () => {
  const byHand = analyze({ values: logged, labels, period: 4, trend: true });
  const r = analyze({ values: raw, labels, period: 4, trend: true, log: true });
  assert.deepEqual(r.pelt.changepoints.map((c) => c.index), byHand.pelt.changepoints.map((c) => c.index));
  assert.deepEqual(r.values, raw);
  assert.ok(r.pelt.changepoints.every((c) => Math.abs(c.ratio - Math.exp(c.shift)) < 1e-3));
  const plain = analyze({ values: raw, labels, period: 4, log: true });
  assert.ok(plain.pelt.segments.every((s) => Math.abs(s.geometricMean - Math.exp(s.mean)) < 1e-3));
  assert.throws(() => analyze({ values: [1, 2, 0, 4, 5], log: true }), /positive/);
  assert.throws(() => analyze({ values: [1, 2, 3, 4, 5], log: true, model: 'poisson' }), /counts/);
});
