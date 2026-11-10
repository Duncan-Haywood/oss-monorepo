import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Numbers match eval/sandy-spikes.out.txt (Capital Bikeshare daily counts, Hurricane Sandy 2012-10-29, recalled).
const rows = readFileSync(new URL('./data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const sandy = labels.indexOf('2012-10-29');
const run = (col) => analyze({ values: rows.map((r) => +r[col]), labels, model: 'mean', period: 7, spikes: true }).spikes;
const hit = (x) => x.startIndex <= sandy && x.endIndex >= sandy;

test('registered riders: Sandy is the largest of 16 labels, about twice the next', () => {
  const s = run(2);
  assert.equal(s.length, 16);
  const big = [...s].sort((a, b) => Math.abs(b.excursionInNoiseSd) - Math.abs(a.excursionInNoiseSd));
  assert.ok(hit(big[0]));
  assert.ok(Math.abs(big[0].excursionInNoiseSd) > 2 * Math.abs(big[1].excursionInNoiseSd));
});

test('casual riders: Sandy is not labelled at all under the mean model (negative result)', () => {
  const s = run(1);
  assert.equal(s.length, 27);
  assert.ok(!s.some(hit));
});
