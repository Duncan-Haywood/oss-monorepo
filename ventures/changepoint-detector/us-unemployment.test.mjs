import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/us-unemployment.csv): US civilian unemployment rate, 1959Q2-2009Q3. Recessions that decay slowly, so
// no step is documented. Counts match eval/us-unemployment.out.txt and README "A real series of recessions".
const rows = readFileSync(new URL('./data/us-unemployment.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (o) => analyze({ values, labels, ...o });

test('unemployment: the default mean model cuts the series 33 times and says the ranges are too narrow (rho about 0.95)', () => {
  assert.equal(values.length, 202);
  const r = run({});
  assert.equal(r.pelt.changepoints.length, 33);
  assert.match(r.rangeWarning, /autocorrelated \(rho about 0\.9\d\)/);
});

test('unemployment: --ar1 leaves no change, --bootstrap keeps all 33, --min-segment 12 keeps 13', () => {
  assert.equal(run({ ar1: true }).pelt.changepoints.length, 0);
  assert.equal(run({ bootstrap: true }).pelt.changepoints.length, 33);
  assert.equal(run({ minSegment: 12 }).pelt.changepoints.length, 13);
});

test('unemployment: the 1974-75 and 2008-09 recessions are cut as steps (shocks read as levels)', () => {
  const labs = run({}).pelt.changepoints.map((c) => c.label ?? labels[c.index]);
  for (const l of ['1974Q3', '1975Q1', '2008Q2', '2008Q4', '2009Q2']) assert.ok(labs.includes(l), l);
});
