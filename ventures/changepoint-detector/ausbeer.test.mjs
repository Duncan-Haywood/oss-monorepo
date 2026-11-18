import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/ausbeer.csv): Australian quarterly beer production 1956Q1-2010Q2. Numbers match eval/ausbeer.out.txt.
const rows = readFileSync(new URL('./data/ausbeer.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]);
const idx = (q) => labels.indexOf(q);

test('real beer production: 218 quarters; one slope bend in the mid-1970s on the log series, range 1975Q2 to 1978Q1', () => {
  assert.equal(labels.length, 218);
  const t = analyze({ values: raw.map(Math.log), labels, period: 4, trend: 'bend' }).trend;
  assert.equal(t.slopeChangeRange95[0].at, '1976Q2');
  assert.ok(t.slopeChangeRange95[0].fromIndex <= idx('1976Q1') && idx('1976Q4') <= t.slopeChangeRange95[0].toIndex);
  assert.ok(t.slopeAfter < t.slopePerPoint, `${t.slopePerPoint} -> ${t.slopeAfter}`);
});

test('real beer production: the raw series dates the same bend but its range spans 1974Q3 to 1989Q1', () => {
  const r = analyze({ values: raw, labels, period: 4, trend: 'bend' }).trend.slopeChangeRange95[0];
  assert.equal(r.at, '1977Q3');
  assert.ok(r.toIndex - r.fromIndex > 40, `${r.from}..${r.to}`);
});

test('real beer production: a level-only fit cuts the series into 10 or more steps', () => {
  assert.ok(analyze({ values: raw, labels, period: 4 }).pelt.changepoints.length >= 10);
});
