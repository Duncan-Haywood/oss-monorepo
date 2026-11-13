// The level hinge test (hinge-test.mjs): synthetic checks and the pre-registered real results
// (eval/hinge-test-prereg-2026-11-13.md, eval/hinge-test-real.out.txt), at fewer replicates so the suite stays quick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hingeTest } from './hinge-test.mjs';
import { analyze } from './engine.mjs';
import { main } from './cli.mjs';

const load = (f) => { const rows = readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: rows.map((r) => r[0]), x: rows.map((r) => +r[1]) }; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function series(n, rho, k, dSlope, seed) {
  const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const x = []; let u = g() / Math.sqrt(1 - rho * rho);
  for (let t = 0; t < n; t++) { if (t) u = rho * u + g(); x.push(0.02 * t + dSlope * Math.max(0, t - k) + u); }
  return x;
}

test('a clear hinge in AR(1) noise is found and dated near its knot', () => {
  const h = hingeTest(series(150, 0.5, 100, 0.15, 3), { reps: 99 });
  assert.equal(h.refused, false);
  assert.ok(h.p <= 0.02, `p ${h.p}`);
  assert.ok(Math.abs(h.index - 100) <= 10, `knot ${h.index}`);
  assert.ok(h.slopeAfter - h.slopeBefore > 0.08);
});

test('straight lines in AR(1) noise: rejections stay near the nominal rate', () => {
  let rej = 0;
  for (let i = 0; i < 40; i++) if (hingeTest(series(120, 0.5, 60, 0, 500 + i), { reps: 59, seed: i + 1 }).p <= 0.05) rej++;
  assert.ok(rej <= 6, `${rej} of 40 rejected`); // full table: eval/hinge-test-sim-size.out.txt
});

test('a random walk is refused (unit-root guard)', () => {
  const r = rng(9), x = []; let v = 0;
  for (let t = 0; t < 200; t++) { v += Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); x.push(v); }
  const h = hingeTest(x, { reps: 19 });
  assert.equal(h.refused, true);
  assert.match(h.reason, /unit root/);
});

test('pre-registered: global temperature 1880-2024 (GCAG and GISTEMP), knot 1976, p at the floor; log GDP refused', () => {
  for (const f of ['global-temp-annual.csv', 'gistemp-annual.csv']) {
    const { labels, x } = load(f), h = hingeTest(x, { reps: 199 });
    assert.equal(labels[h.index], '1976', f);
    assert.equal(h.p, 1 / 200, f);
  }
  const g = load('us-real-gdp.csv');
  assert.equal(hingeTest(g.x.map(Math.log), { reps: 19 }).refused, true);
});

test('analyze and the CLI report it', async () => {
  const { labels, x } = load('global-temp-annual.csv');
  const r = analyze({ values: x, labels, hingeTest: { reps: 99 } });
  assert.equal(r.hingeTest.label, '1976');
  assert.equal(r.hingeTest.significant, true);
  assert.throws(() => analyze({ values: x.slice(0, 20), hingeTest: true }), /at least 30/);
  let out = '';
  await main([new URL('./data/global-temp-annual.csv', import.meta.url).pathname, '--column', 'anomaly', '--hinge-test'], { out: (s) => { out += s; } });
  assert.match(out, /One change of slope, tested on the levels:\n {2}A change of slope: best knot 1976/);
});
