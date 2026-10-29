import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real US airline passenger miles, 1937-1960, in logs (data/airmiles.csv). Numbers match eval/airmiles.out.txt.
const rows = readFileSync(new URL('./data/airmiles.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => Math.log(+r[1]));

test('real boom: the trend model reports exactly one change, at the end of the war', () => {
  assert.equal(labels.length, 24);
  const cps = analyze({ values, labels, model: 'trend' }).pelt.changepoints;
  assert.equal(cps.length, 1);
  assert.equal(cps[0].label, '1946');
  assert.ok(cps[0].range95.from <= 1946 && 1946 <= cps[0].range95.to);
});

test('a level-only model splits the smooth growth into many steps', () => {
  assert.ok(analyze({ values, labels, model: 'mean' }).pelt.changepoints.length >= 5);
});
