import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real mean series (data/us-inflation.csv): US quarterly CPI inflation, annualised %, 1959Q2-2009Q3. The Great Inflation
// began with the 1973 oil shock and the Volcker disinflation ended it in 1981-82 (Stock and Watson 2007).
const rows = readFileSync(new URL('./data/us-inflation.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const at = (cps, from, to) => cps.find((c) => labels[c.index] >= from && labels[c.index] <= to);

test('real US inflation: --bootstrap finds the 1973 surge and the 1981-82 disinflation', () => {
  assert.equal(values.length, 202);
  const cps = analyze({ values, labels, bootstrap: true }).pelt.changepoints;
  const up = at(cps, '1972Q4', '1974Q1');
  assert.ok(up && up.meanAfter > 9 && up.meanBefore < 6, 'a rise near 1973');
  const down = at(cps, '1981Q1', '1982Q4');
  assert.ok(down && down.meanBefore > 9 && down.meanAfter < 4.5, 'the Volcker fall near 1981-82');
});

test('real US inflation: the 2008 deflation quarter is cut as a one-quarter segment (a known artefact)', () => {
  const cps = analyze({ values, labels, bootstrap: true }).pelt.changepoints;
  const c = at(cps, '2008Q2', '2008Q4');
  assert.ok(c && c.meanAfter < 0, 'the single -5.98 quarter becomes its own segment');
});
