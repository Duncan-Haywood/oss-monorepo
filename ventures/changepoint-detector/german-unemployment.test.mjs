import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/german-unemployment.csv): West German quarterly unemployment rate, 1962Q1-1991Q4. It is not a
// stack of steps: it is near 1% to 1973, ramps through the 1974-75 oil-shock recession to about 4.5%, and ramps again
// through the 1980-82 recession to about 9%. The case is the over-cut: a mean model reads each ramp as many steps.
const rows = readFileSync(new URL('./data/german-unemployment.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const col = (i) => rows.map((r) => +r[i]);
const run = (i, opt) => analyze({ values: col(i), labels, model: 'mean', ...opt }).pelt.changepoints;

test('real German unemployment: the default mean model cuts the two ramps into many steps', () => {
  assert.equal(labels.length, 120);
  assert.ok(run(2, {}).length >= 20, 'seasonally adjusted: 24 changes');
  assert.ok(run(1, {}).length >= 8, 'unadjusted: 10 changes');
});

test('real German unemployment: --ar1 leaves the two oil-shock-era level changes, 1974 and 1981-82', () => {
  for (const [i, want] of [[1, ['1974Q4', '1981Q4']], [2, ['1974Q3', '1981Q4']]]) {
    const cps = run(i, { ar1: true });
    assert.deepEqual(cps.map((c) => c.label), want, `column ${i}`);
    assert.ok(cps[0].meanBefore < 1.3 && cps[0].meanAfter > 4 && cps[1].meanAfter > 8);
  }
});

test('real German unemployment: --period 4 with --ar1 on the unadjusted series loses the 1974 step', () => {
  const cps = run(1, { ar1: true, period: 4 });
  assert.ok(!cps.some((c) => /^197[3-5]/.test(c.label)), 'a documented step is lost, the adjusted column keeps it');
});
