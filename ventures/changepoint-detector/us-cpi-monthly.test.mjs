import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real monthly series (data/us-cpi-monthly.csv): US CPI inflation, 1200*ln(CPI_t/CPI_t-1), 1947-02 to 2004-12, 695 months
// (AER USMacroSWM). Documented: the 1973 surge, the Volcker disinflation from 1981-82, the 1986 oil-price collapse.
const rows = readFileSync(new URL('./data/us-cpi-monthly.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const at = (cps, from, to) => cps.find((c) => labels[c.index] >= from && labels[c.index] <= to);

test('us-cpi-monthly: --bootstrap dates the 1973 surge, the 1981 disinflation and the 1986 dip', () => {
  assert.equal(values.length, 695);
  const cps = analyze({ values, labels, bootstrap: true }).pelt.changepoints;
  assert.equal(cps.length, 16);
  const up = at(cps, '1973-01', '1973-12');
  assert.ok(up && up.meanBefore < 5 && up.meanAfter > 10, 'a rise in 1973');
  const down = at(cps, '1981-06', '1982-03');
  assert.ok(down && down.meanBefore > 10 && down.meanAfter < 4.5, 'the Volcker fall');
  const dip = at(cps, '1986-01', '1986-03');
  assert.ok(dip && dip.meanAfter < 0, 'the 1986 oil-price collapse as a three-month dip');
});

test('us-cpi-monthly: the plain mean model over-cuts (28 changes), mostly in the 1947-52 postwar swings', () => {
  const cps = analyze({ values, labels }).pelt.changepoints;
  assert.equal(cps.length, 28);
  assert.ok(cps.filter((c) => labels[c.index] < '1953').length >= 12);
});
