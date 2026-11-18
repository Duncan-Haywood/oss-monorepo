import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/argentina-inflation.csv): quarterly log change of Argentina's CPI, 1970Q2-1989Q4. Documented
// regime changes: the Austral Plan of 14 June 1985 (inflation falls) and the 1989 hyperinflation.
const rows = readFileSync(new URL('./data/argentina-inflation.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (opt) => analyze({ values, labels, ...opt }).pelt.changepoints;

test('real Argentine inflation: the mean model dates the Austral Plan drop at 1985Q3 and the 1989 hyperinflation', () => {
  assert.equal(labels.length, 79);
  for (const opt of [{ model: 'mean' }, { model: 'mean', ar1: true }]) {
    const cps = run(opt);
    const plan = cps.find((c) => c.label === '1985Q3');
    assert.ok(plan && plan.meanAfter < plan.meanBefore / 2, `plan drop with ${JSON.stringify(opt)}`);
    const hyper = cps.find((c) => c.label === '1989Q2');
    assert.ok(hyper && hyper.meanAfter > 2 * hyper.meanBefore, 'hyperinflation step');
  }
});

test('real Argentine inflation: the variance model puts the plan a quarter early, as a 0.65 sd move', () => {
  const cps = run({ model: 'meanvar' });
  assert.ok(!cps.some((c) => c.label === '1985Q3'));
  assert.ok(cps.some((c) => c.label === '1985Q2'));
});
