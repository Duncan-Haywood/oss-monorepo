import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/uk-gas.csv): quarterly UK gas consumption 1960-1986. Not counts. Numbers match eval/uk-gas.out.txt.
const rows = readFileSync(new URL('./data/uk-gas.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]);
const idx = (q) => labels.indexOf(q);

test('real gas consumption: one slope bend on the raw series, 1966 to 1971, steeper after', () => {
  assert.equal(labels.length, 108);
  const t = analyze({ values: raw, labels, period: 4, trend: 'bend' }).trend;
  assert.equal(t.slopeChangeRange95[0].at, '1969Q4');
  assert.ok(t.slopeChangeRange95[0].fromIndex <= idx('1970Q1') && idx('1970Q4') <= t.slopeChangeRange95[0].toIndex);
  assert.ok(t.slopeAfter > 4 * t.slopePerPoint, `${t.slopePerPoint} -> ${t.slopeAfter}`);
});

test('real gas consumption: the log series gets no slope bend, whatever the scale does to the seasonal swing', () => {
  const a = analyze({ values: raw.map(Math.log), labels, period: 4, trend: 'bend' });
  assert.equal(a.trend.slopeChangeRange95, undefined);
});

test('real gas consumption: a drifting seasonal shape cuts the 1969-1972 amplitude change into several steps', () => {
  const cps = analyze({ values: raw, labels, period: 4, drift: true, trend: 'bend' }).pelt.changepoints;
  assert.ok(cps.filter((c) => idx('1969Q4') <= c.index && c.index <= idx('1972Q4')).length >= 3, cps.map((c) => c.label).join(' '));
});

test('real gas consumption: the drift run says its steps may be a changing seasonal shape; the fixed profile does not', () => {
  const a = analyze({ values: raw, labels, period: 4, drift: true, trend: 'bend' });
  assert.match(a.driftWarning, /seasonal shape is still changing|still changing/);
  assert.equal(analyze({ values: raw, labels, period: 4, trend: 'bend' }).driftWarning, undefined);
});
