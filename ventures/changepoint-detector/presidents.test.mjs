import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/presidents.csv): Gallup presidential approval, 1945Q1-1974Q4, 114 quarters (6 NA dropped).
// Counts match README "Presidential approval".
const rows = readFileSync(new URL('./data/presidents.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, ...o }).pelt.changepoints.map((c) => c.label ?? labels[c.index]);

test('presidents: the default finds Watergate (1973Q3) and the 1953 change of president, and warns about rho', () => {
  assert.equal(values.length, 114);
  const l = labs({});
  assert.equal(l.length, 8);
  for (const q of ['1953Q1', '1973Q3']) assert.ok(l.includes(q), q);
  assert.match(analyze({ values, labels }).rangeWarning, /autocorrelated \(rho about 0\.5/);
});

test('presidents: --ar1 keeps 1953Q1 and 1966Q2 but loses Watergate', () => {
  const l = labs({ ar1: true });
  assert.deepEqual(l, ['1953Q1', '1966Q2']);
});

test('presidents: no setup cuts the 1964Q1 rally (57 to 80)', () => {
  for (const o of [{}, { ar1: true }, { bootstrap: true }]) assert.ok(!labs(o).includes('1964Q1'));
});
