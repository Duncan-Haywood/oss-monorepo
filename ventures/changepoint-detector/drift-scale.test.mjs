// A scale per segment in the drift-level model (drift-level.mjs, scale 'segment'; README "Volatility on
// a drifting level", measured and not offered: eval/drift-scale-sim.out.txt, eval/tcpd-drift-scale.out.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftLevelChanges, driftLevel, gains, scaleCost, segmentScales, SCALE_FLOOR } from './drift-level.mjs';

let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

// The profiled cost of one segment, computed directly from its own Kalman filter.
function segCost(y, q) {
  const m = y.length, { K, F } = gains(m, q);
  let a = y[0], S = 0, LF = 0;
  for (let j = 1; j < m; j++) { const v = y[j] - a; S += (v * v) / F[j]; LF += Math.log(F[j]); a += K[j] * v; }
  return scaleCost(m - 1, S, LF);
}

test('scaleCost profiles the scale: it is the minimum over s^2 >= floor of the Gaussian cost', () => {
  for (const [j, S, LF] of [[5, 7.3, 2.1], [12, 0.002, 4], [1, 3, 0.4]]) {
    let best = Infinity;
    for (let k = 0; k < 4000; k++) { const s2 = SCALE_FLOOR * 1.003 ** k; best = Math.min(best, j * Math.log(s2) + LF + S / s2); }
    assert.ok(Math.abs(scaleCost(j, S, LF) - best) < 1e-4, `${j} ${S}: ${scaleCost(j, S, LF)} vs ${best}`);
  }
  assert.equal(scaleCost(0, 0, 0), 0);
});

test('the partition is exact: it matches brute force over every set of changes on a short series', () => {
  seed = 3;
  const x = Array.from({ length: 14 }, (_, t) => (t >= 7 ? 4 : 1) * gauss() + (t >= 9 ? 3 : 0));
  const sigma = 1, omega = 0.4, q = 0.16, beta = 3 * Math.log(14);
  const r = driftLevelChanges(x, { sigma, omega, scale: 'segment' });
  let best = Infinity, arg = null;
  for (let mask = 0; mask < 1 << 13; mask++) {
    const cps = [];
    for (let i = 1; i < 14; i++) if (mask & (1 << (i - 1))) cps.push(i);
    const b = [0, ...cps, 14];
    if (b.some((v, i) => i && v - b[i - 1] < 2)) continue;
    let c = beta * cps.length;
    for (let i = 0; i + 1 < b.length; i++) c += segCost(x.slice(b[i], b[i + 1]), q);
    if (c < best - 1e-12) { best = c; arg = cps; }
  }
  assert.deepEqual(r.changepoints, arg);
  assert.ok(Math.abs(r.cost - best) < 1e-9, `${r.cost} vs ${best}`);
});

test('a volatility burst on a random walk is two edges, not a run of jumps', () => {
  seed = 21;
  let m = 0;
  const x = Array.from({ length: 300 }, (_, t) => (m += t ? (t >= 100 && t < 160 ? 5 : 1) * gauss() : 0) + 0.1 * gauss());
  const g = driftLevelChanges(x, { noise: 'ml' }).changepoints;
  const r = driftLevel(x, { noise: 'ml', scale: 'segment' });
  assert.ok(g.length >= 8, `shipped ${g}`);
  assert.ok(r.changes.length <= 4, `scale ${r.changepoints}`);
  const up = r.changes.find((c) => Math.abs(c.index - 100) <= 5), down = r.changes.find((c) => Math.abs(c.index - 160) <= 5);
  assert.ok(up && up.scaleRatio > 3, `up ${JSON.stringify(up)}`);
  assert.ok(down && down.scaleRatio < 1 / 3, `down ${JSON.stringify(down)}`);
  assert.equal(r.scales.length, r.changes.length + 1);
  assert.deepEqual(r.scales, segmentScales(x, r.changepoints, r));
});

test('a level step in white noise is still found once', () => {
  seed = 5;
  const x = Array.from({ length: 200 }, (_, t) => gauss() + (t >= 120 ? 3 : 0));
  assert.deepEqual(driftLevelChanges(x, { noise: 'ml', scale: 'segment' }).changepoints, [120]);
});

test('the default penalty is 3 log n; bad options are refused', () => {
  seed = 8;
  const x = Array.from({ length: 50 }, gauss);
  assert.ok(Math.abs(driftLevelChanges(x, { scale: 'segment' }).penalty - 3 * Math.log(50)) < 1e-12);
  assert.ok(Math.abs(driftLevelChanges(x, {}).penalty - 2 * Math.log(50)) < 1e-12);
  assert.throws(() => driftLevelChanges(x, { scale: 'local' }), /scale must be/);
  assert.throws(() => driftLevelChanges(x, { scale: 'segment', loss: 'huber' }), /Gaussian loss only/);
});

test('the README quotes both pre-registered runs as they stand', () => {
  const sim = readFileSync(new URL('./eval/drift-scale-sim.out.txt', import.meta.url), 'utf8');
  const out = readFileSync(new URL('./eval/tcpd-drift-scale.out.txt', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
  const sec = readme.slice(readme.indexOf('## Volatility on a drifting level'));
  const burst = sim.slice(sim.indexOf('C walk 1 / noise 0.1, 5x burst'));
  assert.match(burst, /shipped \(global scale\)\s+cuts\s+17\.00/);
  assert.match(burst, /scale per segment\s+cuts\s+2\.43/);
  assert.ok(sec.includes('17.00 cuts to 2.43'));
  for (const [row, shipped, held] of [['scale per segment (primary)', '0.756', '0.464'], ['scale per segment, min seg 5', '0.749', '0.479'], ['Gaussian (shipped)', '0.694', '0.527']]) {
    const lines = out.split('\n').filter((l) => l.includes(`* drift ML, ${row}`));
    assert.equal(lines.length, 2, row);
    assert.ok(lines[0].includes(` ${shipped} `), `${row} shipped: ${lines[0]}`);
    assert.ok(lines[1].includes(` ${held} `), `${row} held out: ${lines[1]}`);
    assert.ok(sec.includes(shipped) && sec.includes(held), row);
  }
  assert.match(out, /drift Gaussian \(shipped\)\s+-0\.064/);
  assert.ok(sec.includes('-0.064 held out'));
  assert.match(out, /bank\s+n\s+581.*gauss\s+63 .*scale 170 /);
});
