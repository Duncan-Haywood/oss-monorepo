import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real overdispersed counts (data/great-discoveries.csv): "great" inventions and scientific discoveries per year,
// 1860-1959 (World Almanac and Book of Facts; R datasets::discoveries). Variance/mean is 1.64, and 1884-1888 is a
// five-year burst (7, 12, 3, 10, 9) inside a 2.5-a-year start, so plain Poisson reads a rise and a fall.
const rows = readFileSync(new URL('./data/great-discoveries.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (opt) => analyze({ values, labels, model: 'poisson', ...opt }).pelt.changepoints;

test('real great discoveries: plain Poisson cuts the 1884-1888 burst; --bootstrap cuts nothing', () => {
  assert.equal(values.length, 100);
  assert.equal(values.reduce((a, b) => a + b, 0), 310);
  const cps = run({});
  assert.deepEqual(cps.map((c) => c.label), ['1884', '1889', '1933']);
  assert.ok(cps[0].meanBefore < 3 && cps[0].meanAfter > 7.5, `${cps[0].meanBefore} -> ${cps[0].meanAfter}`);
  assert.ok(cps[2].meanBefore > 3.4 && cps[2].meanAfter < 2, `${cps[2].meanBefore} -> ${cps[2].meanAfter}`);
  assert.equal(run({ bootstrap: true }).length, 0);
});
