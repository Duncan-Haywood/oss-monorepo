import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Numbers match eval/sandy-spikes-log.out.txt (Capital Bikeshare daily counts, Sandy 2012-10-29, recalled).
const rows = readFileSync(new URL('./data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const sandy = labels.indexOf('2012-10-29');
const run = (col) => analyze({ values: rows.map((r) => +r[col]), labels, model: 'mean', period: 7, log: true, spikes: true }).spikes;
const hit = (x) => x.startIndex <= sandy && x.endIndex >= sandy;
const ranked = (s) => [...s].sort((a, b) => Math.abs(b.excursionInNoiseSd) - Math.abs(a.excursionInNoiseSd));

test('log scale, registered riders: Sandy is the largest of 22 labels, twice the next', () => {
  const s = run(2), big = ranked(s);
  assert.equal(s.length, 22);
  assert.ok(hit(big[0]));
  assert.ok(Math.abs(big[0].excursionInNoiseSd) > 2 * Math.abs(big[1].excursionInNoiseSd));
});

test('log scale, casual riders: Sandy is now the largest of 16 labels (the level model missed it)', () => {
  const s = run(1), big = ranked(s);
  assert.equal(s.length, 16);
  assert.ok(hit(big[0]));
  assert.ok(Math.exp(big[0].excursion) < 0.05); // the closure day is a few percent of normal ridership
});
