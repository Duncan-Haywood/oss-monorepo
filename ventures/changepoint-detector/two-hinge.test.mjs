// The two-hinge level test (two-hinge.mjs): synthetic checks and the pre-registered real results
// (eval/two-hinge-prereg-2026-11-16.md, eval/two-hinge-real.out.txt), at fewer replicates so the suite stays quick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { twoHingeTest, twoHingeRhos, randomWalkCutBar2 } from './two-hinge.mjs';
import { analyze } from './engine.mjs';
import { main } from './cli.mjs';

const load = (f) => { const rows = readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: rows.map((r) => r[0]), x: rows.map((r) => +r[1]) }; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function series(n, rho, mean, seed) {
  const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const x = []; let u = rho < 1 ? g() / Math.sqrt(1 - rho * rho) : 0;
  for (let t = 0; t < n; t++) { if (t) u = rho * u + g(); x.push(mean(t) + u); }
  return x;
}

test('a clear flat-rise-flat curve in AR(1) noise is found, with both knots near the planted ones', () => {
  const x = series(90, 0.3, (t) => (t < 30 ? 0 : t < 60 ? 0.3 * (t - 30) : 9), 11);
  const h = twoHingeTest(x, { reps: 99 });
  assert.equal(h.refused, false);
  assert.ok(h.p <= 0.02, `p ${h.p}`);
  assert.ok(Math.abs(h.index1 - 30) <= 6 && Math.abs(h.index2 - 60) <= 6, `knots ${h.index1}, ${h.index2}`);
  assert.ok(Math.abs(h.slopes[1] - 0.3) < 0.1 && Math.abs(h.slopes[0]) < 0.1 && Math.abs(h.slopes[2]) < 0.1, `slopes ${h.slopes}`);
});

test('the knots stay apart and inside the margin', () => {
  const r = twoHingeRhos(series(60, 0, (t) => 0.02 * t, 3));
  assert.ok(r.index1 >= 9 && r.index2 <= 50 && r.index2 - r.index1 >= 9, `${r.index1}, ${r.index2}`);
});

test('straight lines in AR(1) noise: rejections stay near the nominal rate', () => {
  let rej = 0;
  for (let i = 0; i < 30; i++) if (twoHingeTest(series(60, 0.3, (t) => 0.02 * t, 700 + i), { reps: 39, seed: i + 1 }).p <= 0.05) rej++;
  assert.ok(rej <= 5, `${rej} of 30 rejected`); // full table: eval/two-hinge-sim-size.out.txt
});

test('a random walk is refused, and the random-walk cut bar falls with length', () => {
  const x = series(120, 1, () => 0, 9);
  const h = twoHingeTest(x, { reps: 19 });
  assert.equal(h.refused, true);
  assert.match(h.reason, /unit root/);
  assert.ok(randomWalkCutBar2(40) > randomWalkCutBar2(95));
});

test('pre-registered real results: GCAG knots 1904 and 1985; the sticky short series refused', () => {
  const { labels, x } = load('global-temp-annual.csv');
  const g = twoHingeTest(x, { reps: 99 });
  assert.deepEqual([labels[g.index1], labels[g.index2]], ['1904', '1985']);
  assert.ok(g.p <= 0.02);
  for (const f of ['us-female-murder-rate.csv', 'canada-fertility.csv', 'lake-huron.csv']) assert.equal(twoHingeTest(load(f).x, { reps: 19 }).refused, true, f);
});

test('analyze and the CLI report it', async () => {
  const { labels, x } = load('global-temp-annual.csv');
  const r = analyze({ values: x, labels, twoHingeTest: { reps: 99 } });
  assert.equal(r.twoHingeTest.label1, '1904');
  assert.equal(r.twoHingeTest.significant, true);
  assert.equal(r.twoHingeTest.slopes.length, 3);
  assert.throws(() => analyze({ values: x.slice(0, 20), twoHingeTest: true }), /at least 30/);
  let out = '';
  await main([new URL('./data/global-temp-annual.csv', import.meta.url).pathname, '--column', 'anomaly', '--two-hinge-test'], { out: (s) => { out += s; } });
  assert.match(out, /Two changes of slope, tested on the levels:\n {2}Two changes of slope: best knots 1904 and 1985/);
});
