import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ar2ProfileFit, pelt } from './engine.mjs';

const load = (f) => readFileSync(new URL(`./data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => +l.split(',')[1]);

test('ar2mean cost: a clean level shift in AR(2) noise is found at the right place', () => {
  let seed = 3;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const e = [];
  for (let t = 0; t < 300; t++) e[t] = 1.2 * (e[t - 1] ?? 0) - 0.5 * (e[t - 2] ?? 0) + g();
  const x = e.slice(100).map((v, t) => v + (t >= 100 ? 4 : 0));
  const p = pelt(x, { model: 'ar2mean', minSegment: 3, sigma: 1, rho: [1.2, -0.5] });
  assert.equal(p.changepoints.length, 1);
  assert.ok(Math.abs(p.changepoints[0] - 100) <= 3);
});

test('ar2ProfileFit: log lynx (cycle, no documented step) gets no change', () => {
  const r = ar2ProfileFit(load('lynx').map(Math.log10));
  assert.equal(r.changepoints.length, 0);
  assert.ok(r.phi1 > 1 && r.phi2 < 0, 'finds the cycle');
});
