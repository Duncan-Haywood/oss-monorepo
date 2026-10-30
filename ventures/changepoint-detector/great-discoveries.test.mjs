import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, findExcursions } from './engine.mjs';

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

test('real great discoveries: --episodes reads 1884-1888 as one burst, not two steps', () => {
  const r = analyze({ values, labels, model: 'poisson', episodes: true });
  assert.equal(r.episodes.length, 1);
  const e = r.episodes[0];
  assert.equal(e.kind, 'burst');
  assert.deepEqual([e.from, e.to], ['1884', '1888']);
  assert.ok(e.jumpFactor > 3 && e.netFactor < 1.6, `${e.jumpFactor} ${e.netFactor}`);
  assert.equal(r.pelt.changepoints.length, 3);
  assert.throws(() => analyze({ values, model: 'mean', episodes: true }), /counts/);
});

test('real great discoveries: quasi-Poisson --overdispersion cuts nothing; --bursts cuts the spike and keeps one step', () => {
  const od = analyze({ values, labels, model: 'poisson', overdispersion: true });
  assert.equal(od.pelt.changepoints.length, 0);
  assert.ok(od.dispersion > 2.5 && od.dispersion < 3, `${od.dispersion}`);
  const b = analyze({ values, labels, model: 'poisson', bursts: true });
  assert.deepEqual(b.bursts.map((x) => x.label), ['1885']);
  assert.deepEqual(b.pelt.changepoints.map((c) => c.label), ['1884', '1933']);
});

test('real great discoveries: the burst is NOT called an excursion, because the rate after it (3.7) is not the rate before (2.5)', () => {
  const r = analyze({ values, labels, model: 'poisson' });
  assert.equal(r.excursions, undefined);
  const [x] = findExcursions(values, r.pelt.changepoints.map((c) => c.index), { maxFraction: 0.5, critical: Infinity });
  assert.equal(x.fromIndex, 24);
  assert.ok(x.sameBaselineLR > 6 && x.sameBaselineLR < 8, `${x.sameBaselineLR}`);
});

test('a real step is not an excursion; a planted burst is', () => {
  const step = Array.from({ length: 80 }, (_, i) => (i < 40 ? 3 : 9) + (i % 3 === 0 ? 1 : 0));
  assert.equal(analyze({ values: step, model: 'poisson' }).excursions, undefined);
  const burst = Array.from({ length: 80 }, (_, i) => (i >= 30 && i < 40 ? 12 : 3) + (i % 3 === 0 ? 1 : 0));
  assert.equal(analyze({ values: burst, model: 'poisson' }).excursions.length, 1);
});
