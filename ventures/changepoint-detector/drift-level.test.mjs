// The drift-level model (drift-level.mjs, `--model drift`): jumps on a random-walk level.
// TCPD measurement: eval/tcpd-drift.mjs; synthetic: eval/drift-sim.mjs; README "Jumps on a drifting level".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftLevel, driftLevelChanges, driftNoise, driftNoiseML, driftSegmentCost, medianSlope } from './drift-level.mjs';
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

test('the cost of absorbing: lag-difference wander reads Nile\'s 1899 drop as wander; wander by likelihood dates it', () => {
  const nile = read('nile.csv');
  assert.deepEqual(driftLevelChanges(nile.values).changepoints, []);
  const r = driftLevelChanges(nile.values, { noise: 'ml' });
  assert.deepEqual(r.changepoints.map((i) => nile.labels[i]), ['1899']);
  assert.equal(r.noise, 'ml');
  assert.ok(r.omega < 5 && r.ml.start.omega > 40, `omega ${r.omega}, from lags ${r.ml.start.omega}`);
});

test('the segment cost is the local level likelihood: no-change ML on the Nile is Durbin and Koopman\'s 15,099 and 1,469', () => {
  // -2 log L in the input's units = cost in sigma units + (n - 1) log sigma^2 (first point diffuse).
  // Durbin and Koopman, Time Series Analysis by State Space Methods (2nd ed., 2012), section 2.10.
  const x = read('nile.csv').values, n = x.length;
  const m2ll = (s2, w2) => driftSegmentCost(x, { sigma: Math.sqrt(s2), omega: Math.sqrt(w2) }) + (n - 1) * Math.log(s2);
  let best = { v: Infinity };
  for (let s2 = 13000; s2 <= 17000; s2 += 50) for (let w2 = 800; w2 <= 2400; w2 += 25) { const v = m2ll(s2, w2); if (v < best.v) best = { v, s2, w2 }; }
  assert.ok(Math.abs(best.s2 - 15099) <= 100 && Math.abs(best.w2 - 1469) <= 50, JSON.stringify(best));
});

test('wander by likelihood: q = 0 on a flat series with a step, a walk keeps a real omega, and the profile is the best of its grid', () => {
  const step = driftNoiseML(series(200, 0, 3, 100));
  assert.deepEqual(step.changepoints, [100]);
  assert.ok(step.omega < 0.1, `omega ${step.omega}`);
  const walk = driftNoiseML(series(400, 0.5, 0, 0, 3));
  assert.ok(walk.omega > 0.25 && walk.omega < 1, `omega ${walk.omega}`);
  assert.ok(walk.changepoints.length <= 1, `cuts ${walk.changepoints}`);
  const grid = [0, ...Array.from({ length: 17 }, (_, i) => 10 ** (-4 + i / 2))];
  const coarse = driftNoiseML(series(400, 0.5, 0, 0, 3), { grid });
  assert.ok(walk.objective <= coarse.objective + 1e-9);
  assert.equal(walk.atGridEdge, false);
});

test('CLI --model drift prints the jumps and the TCPD figures it quotes match the eval output', async () => {
  let s = '';
  await main(['--model', 'drift', '--drift-noise', 'lags', new URL('./data/us-real-gdp.csv', import.meta.url).pathname], { out: (t) => (s += t) });
  assert.match(s, /2 jumps too big for the drift/);
  assert.match(s, /1978Q2: level/);
  assert.match(s, /both from lag differences/);
  assert.match(s, /not advice/);
  let d = '';
  await main(['--model', 'drift', new URL('./data/nile.csv', import.meta.url).pathname], { out: (t) => (d += t) });
  assert.match(d, /1 jump too big for the drift/);
  assert.match(d, /1899: level/);
  assert.match(d, /chosen together with the changes/);
  await assert.rejects(main(['--model', 'drift', '--drift-noise', 'x', 'nile.csv'], { out: () => {} }), /ml or lags/);
  for (const [file, key, name] of [['tcpd-drift-ml.out.txt', 'ml', 'drift level, ML noise (primary)'], ['tcpd-drift-ml.out.txt', 'lags', 'drift level, lag noise (shipped)'], ['tcpd-drift.out.txt', 'lags', 'drift level, 2 log n (primary)'], ['tcpd-drift.out.txt', 'level', 'level (default)'], ['tcpd-drift.out.txt', 'warn', 'following the over-cut warning']]) {
    const out = readFileSync(new URL(`./eval/${file}`, import.meta.url), 'utf8');
    const [shipped, held] = out.split('TCPD held out');
    const row = (txt) => Number(txt.split('\n').find((l) => l.includes(name)).trim().split(/\s+/).at(-3));
    assert.equal(row(shipped), DRIFT_TCPD.shipped[key], `${file} ${name} shipped`);
    assert.equal(row(held), DRIFT_TCPD.heldout[key], `${file} ${name} held out`);
  }
  let j = '';
  await main(['--model', 'drift', '--drift-slope', '--drift-noise', 'lags', '--json', new URL('./data/austres.csv', import.meta.url).pathname], { out: (t) => (j += t) });
  const r = JSON.parse(j);
  assert.equal(r.changes.length, 0);
  assert.ok(r.slope > 40);
  // The default (wander by likelihood) is worse here: 4 cuts, 1988 to 1990, on a series with no
  // documented break (README "A step-robust omega", where it loses).
  j = '';
  await main(['--model', 'drift', '--drift-slope', '--json', new URL('./data/austres.csv', import.meta.url).pathname], { out: (t) => (j += t) });
  assert.equal(JSON.parse(j).changes.length, 4);
  assert.equal(JSON.parse(j).noise, 'ml');
});
