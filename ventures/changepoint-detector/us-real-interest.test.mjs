import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real mean series (data/us-real-interest.csv): US ex-post real interest rate, 1959Q2-2009Q3. Literature (cited from memory,
// papers unread): a fall near 1973Q3 and a rise near 1980Q3 (Garcia and Perron 1996). Numbers match eval/us-real-interest.out.txt.
const rows = readFileSync(new URL('./data/us-real-interest.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const at = (cps, from, to) => cps.find((c) => labels[c.index] >= from && labels[c.index] <= to);

test('real US real rate: defaults and --bootstrap both find the 1973 fall and the 1980 rise', () => {
  assert.equal(values.length, 202);
  for (const opt of [{}, { bootstrap: true }]) {
    const cps = analyze({ values, labels, ...opt }).pelt.changepoints;
    const down = at(cps, '1972Q4', '1973Q4');
    assert.ok(down && down.meanBefore > 0 && down.meanAfter < 0, 'a fall near 1973');
    const up = at(cps, '1980Q2', '1981Q1');
    assert.ok(up && up.meanBefore < 0 && up.meanAfter > 5, 'the 1980 rise');
  }
});

test('the 1980 rise is dated one quarter after the literature (1980Q4 vs 1980Q3), range95 a single quarter', () => {
  const up = at(analyze({ values, labels }).pelt.changepoints, '1980Q2', '1981Q1');
  assert.equal(labels[up.index], '1980Q4');
  assert.equal(labels[up.range95.fromIndex], '1980Q4');
  assert.equal(labels[up.range95.toIndex], '1980Q4');
});

test('the best single break lies after 1980Q3, so 1980Q3 is the last old quarter (a convention gap, not a late date)', () => {
  const lo = labels.indexOf('1973Q4'), hi = labels.indexOf('1986Q1');
  const sse = (a) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return a.reduce((s, x) => s + (x - m) ** 2, 0); };
  const cost = (last) => { const k = labels.indexOf(last) + 1; return sse(values.slice(lo, k)) + sse(values.slice(k, hi)); };
  assert.ok(cost('1980Q3') < cost('1980Q2') && cost('1980Q3') < cost('1980Q4'));
});

test('the 2007-09 crisis quarters are cut into one-quarter segments (a known artefact, as in inflation)', () => {
  const cps = analyze({ values, labels, bootstrap: true }).pelt.changepoints;
  assert.ok(cps.filter((c) => labels[c.index] >= '2007Q3').length >= 3);
});
