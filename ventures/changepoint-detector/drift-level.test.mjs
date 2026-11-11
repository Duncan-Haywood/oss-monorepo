// The drift-level model (drift-level.mjs, `--model drift`): jumps on a random-walk level.
// TCPD measurement: eval/tcpd-drift.mjs; synthetic: eval/drift-sim.mjs; README "Jumps on a drifting level".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftLevel, driftLevelChanges, driftNoise, driftSegmentCost, medianSlope } from './drift-level.mjs';
import { analyze, parseSeries } from './engine.mjs';
import { main } from './cli.mjs';
import { DRIFT_TCPD } from './drift-cli.mjs';

let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const series = (n, omega, step, at, s = 11) => { seed = s; let m = 0; return Array.from({ length: n }, (_, t) => (m += t ? omega * gauss() : 0) + (t >= at ? step : 0) + gauss()); };
const read = (f) => parseSeries(readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8'));

test('noise estimates: white noise has no wander; a walk\'s wander is recovered roughly', () => {
  const w = driftNoise(series(2000, 0, 0, 0));
  assert.ok(Math.abs(w.sigma - 1) < 0.1 && w.omega < 0.1, JSON.stringify(w));
  const r = driftNoise(series(2000, 0.5, 0, 0));
  assert.ok(Math.abs(r.sigma - 1) < 0.25 && Math.abs(r.omega - 0.5) < 0.15, `sigma ${r.sigma} omega ${r.omega}`);
});

test('a step on white noise is found at its place', () => {
  const r = driftLevel(series(200, 0, 3, 100));
  assert.deepEqual(r.changepoints, [100]);
  assert.ok(Math.abs(r.changes[0].jump - 3) < 0.8, `jump ${r.changes[0].jump}`);
});

test('a step on a wandering level is found, and the wander is not cut into a staircase', () => {
  const x = series(300, 0.3, 5, 150);
  const plain = analyze({ values: x }).pelt.changepoints.length;
  const r = driftLevelChanges(x);
  assert.ok(r.changepoints.some((c) => Math.abs(c - 150) <= 2), `cuts ${r.changepoints}`);
  assert.ok(r.changepoints.length <= 2 && plain >= 5, `drift ${r.changepoints.length}, plain ${plain}`);
});

test('the optimal partition is exact: no single extra or dropped change lowers the cost', () => {
  const x = series(80, 0.2, 4, 40, 5);
  const r = driftLevelChanges(x);
  const cost = (cps) => { // cost of a given partition, from the same segment cost
    let c = -r.penalty;
    const b = [0, ...cps, x.length];
    for (let i = 0; i + 1 < b.length; i++) c += r.penalty + driftSegmentCost(x.slice(b[i], b[i + 1]), r);
    return c;
  };
  const base = cost(r.changepoints);
  assert.ok(Math.abs(base - r.cost) < 1e-6, `${base} vs ${r.cost}`);
  for (let t = 2; t < x.length - 2; t++) {
    const alt = r.changepoints.includes(t) ? r.changepoints.filter((c) => c !== t) : [...r.changepoints, t].sort((a, b) => a - b);
    if (alt.some((c, i) => i && c - alt[i - 1] < 2)) continue;
    assert.ok(cost(alt) >= base - 1e-9, `moving ${t} lowers the cost`);
  }
});

test('real smooth series: US real GDP 57 plain cuts to 2; with --drift-slope Australian residents 43 to 0', () => {
  const gdp = read('us-real-gdp.csv');
  assert.equal(analyze({ values: gdp.values }).pelt.changepoints.length, 57);
  assert.deepEqual(driftLevelChanges(gdp.values).changepoints.map((i) => gdp.labels[i]), ['1978Q2', '1999Q4']);
  const au = read('austres.csv');
  assert.equal(driftLevelChanges(au.values).changepoints.length, 31);
  assert.equal(driftLevelChanges(au.values, { slope: true }).changepoints.length, 0);
  assert.ok(medianSlope(au.values) > 40);
});

test('the cost of absorbing: Nile\'s 1899 drop is read as wander (a known miss, README)', () => {
  const nile = read('nile.csv');
  assert.deepEqual(driftLevelChanges(nile.values).changepoints, []);
});

test('CLI --model drift prints the jumps and the TCPD figures it quotes match the eval output', async () => {
  let s = '';
  await main(['--model', 'drift', new URL('./data/us-real-gdp.csv', import.meta.url).pathname], { out: (t) => (s += t) });
  assert.match(s, /2 jumps too big for the drift/);
  assert.match(s, /1978Q2: level/);
  assert.match(s, /not advice/);
  const out = readFileSync(new URL('./eval/tcpd-drift.out.txt', import.meta.url), 'utf8');
  const [shipped, held] = out.split('TCPD held out');
  const row = (txt, name) => Number(txt.split('\n').find((l) => l.includes(name)).trim().split(/\s+/).at(-3));
  assert.equal(row(shipped, 'drift level, 2 log n (primary)'), DRIFT_TCPD.shipped.drift);
  assert.equal(row(shipped, 'level (default)'), DRIFT_TCPD.shipped.level);
  assert.equal(row(shipped, 'following the over-cut warning'), DRIFT_TCPD.shipped.warn);
  assert.equal(row(held, 'drift level, 2 log n (primary)'), DRIFT_TCPD.heldout.drift);
  assert.equal(row(held, 'level (default)'), DRIFT_TCPD.heldout.level);
  assert.equal(row(held, 'following the over-cut warning'), DRIFT_TCPD.heldout.warn);
  let j = '';
  await main(['--model', 'drift', '--drift-slope', '--json', new URL('./data/austres.csv', import.meta.url).pathname], { out: (t) => (j += t) });
  const r = JSON.parse(j);
  assert.equal(r.changes.length, 0);
  assert.ok(r.slope > 40);
});
