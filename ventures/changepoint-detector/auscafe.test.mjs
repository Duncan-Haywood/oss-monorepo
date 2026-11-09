import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/auscafe.csv): Australian monthly cafe, restaurant and catering turnover, 1982-04 to 2017-09 (426 months, fpp2::auscafe).
// Australia's goods and services tax began on 1 July 2000 (recalled, not checked against a source). Counts match README "Cafes and the 2000 GST".
const rows = readFileSync(new URL('./data/auscafe.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]), lg = raw.map(Math.log);
const labs = (o) => analyze({ labels, period: 12, ...o }).pelt.changepoints.map((c) => c.label);
const near = (l) => l.filter((x) => /^(1999|2000|2001)/.test(x));

test('auscafe: 426 months', () => {
  assert.equal(labels.length, 426);
  assert.equal(labels[0], '1982-04');
  assert.equal(labels[425], '2017-09');
});

test('auscafe: every model dates a change at 2000-09, two months after the GST, but each cuts 21 or more times', () => {
  const runs = [
    [{ values: raw }, 49], [{ values: lg }, 44], [{ values: lg, trend: 'bend' }, 28],
    [{ values: lg, model: 'trend' }, 21], [{ values: lg, ar1: 'auto' }, 27], [{ values: lg, model: 'meanvar' }, 24],
  ];
  for (const [o, n] of runs) { const l = labs(o); assert.ok(l.includes('2000-09'), JSON.stringify(o)); assert.equal(l.length, n); }
});

test('auscafe: the other cuts near the GST differ by model', () => {
  assert.deepEqual(near(labs({ values: lg, trend: 'bend' })), ['2000-09', '2001-09']);
  assert.deepEqual(near(labs({ values: lg, ar1: 'auto' })), ['1999-01', '2000-09']);
});
