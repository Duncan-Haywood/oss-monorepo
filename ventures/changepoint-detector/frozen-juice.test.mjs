import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/frozen-juice.csv): Florida frozen orange juice price over the producer price index, monthly 1950-2000.
// The shocks have a measured cause: `fdd`, Orlando freezing degree days. Numbers match eval/frozen-juice.out.txt.
const rows = readFileSync(new URL('./data/frozen-juice.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => Math.log(+r[1] / +r[2]));
const freezes = rows.map((r, i) => (+r[3] >= 19 ? i : -1)).filter((i) => i >= 0);
const score = (opt) => {
  const idx = analyze({ values, labels, model: 'mean', ...opt }).pelt.changepoints.map((c) => labels.indexOf(c.label));
  return { n: idx.length, found: freezes.filter((f) => idx.some((i) => Math.abs(f - i) <= 2)).length };
};

test('real juice prices: eight big freezes, and the default mean model finds all of them inside 148 changes', () => {
  assert.equal(labels.length, 612);
  assert.equal(freezes.length, 8);
  const s = score({});
  assert.equal(s.found, 8);
  assert.ok(s.n > 100, `${s.n} changes: the shocks are real but so is the over-cut`);
});

test('real juice prices: --ar1 gives 10 changes but finds only 3 of the 8 freezes (1958, 1963, 1977)', () => {
  const s = score({ ar1: true });
  assert.ok(s.n <= 12 && s.found === 3, `${s.n} changes, ${s.found} freezes`);
});
