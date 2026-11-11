// Heavy tails on a drifting level (README "Heavy tails on a drifting level"): the heavy-tail check
// (drift-level.mjs driftTailCheck) in `--model drift`'s text and JSON. The losses: drift-robust.test.mjs.
// TCPD: eval/tcpd-drift-robust.mjs (pre-registered), eval/tcpd-drift-tails.mjs (post hoc);
// synthetic: eval/drift-tails-sim.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftLevel, driftLevelChanges, driftTailCheck } from './drift-level.mjs';
import { DRIFT_TAILS, driftResult, driftText } from './drift-cli.mjs';
import { parseSeries } from './engine.mjs';
import { main } from './cli.mjs';

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const t3 = () => { let c = 0; for (let i = 0; i < 3; i++) c += gauss() ** 2; return gauss() / Math.sqrt(c / 3) / Math.sqrt(3); };
const outlierSeries = (s = 7) => { seed = s; return Array.from({ length: 300 }, (_, t) => (t >= 150 ? 3 : 0) + t3()); };
const walk = (s, step) => { seed = s; let m = 0; return Array.from({ length: 400 }, (_, t) => (m += t ? step() : 0)); };
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('on heavy-tailed noise the biweight cost finds the step and not the outliers', () => {
  let gaussOther = 0, bwOther = 0, bwFound = 0;
  for (let s = 1; s <= 10; s++) {
    const x = outlierSeries(s);
    const g = driftLevelChanges(x, { noise: 'ml' }).changepoints, b = driftLevelChanges(x, { noise: 'ml', loss: 'biweight' }).changepoints;
    gaussOther += g.filter((c) => Math.abs(c - 150) > 5).length;
    bwOther += b.filter((c) => Math.abs(c - 150) > 5).length;
    bwFound += b.some((c) => Math.abs(c - 150) <= 5) ? 1 : 0;
  }
  assert.equal(bwFound, 10);
  assert.ok(bwOther <= 2 && gaussOther >= 10, `other cuts: gauss ${gaussOther}, biweight ${bwOther}`);
});

test('Gaussian loss is unchanged by the rewrite: the reported levels match the classical filter', () => {
  const nile = parseSeries(read('./data/nile.csv'));
  const r = driftLevel(nile.values, { noise: 'ml' });
  assert.equal(r.loss, 'gauss');
  assert.deepEqual(r.changepoints.map((i) => nile.labels[i]), ['1899']);
  assert.ok(Math.abs(r.changes[0].jump + 250) < 100, `jump ${r.changes[0].jump}`);
});

// The check fires on about half of single t3 series (eval/drift-tails-sim.out.txt: 30 of 60 with
// no step), so these seeds are ones it fires on; the rates are in the sim, not pinned here.
test('the heavy-tail check: a heavy-tailed walk reads as walk, heavy-tailed noise as noise, Gaussian as nothing', () => {
  assert.equal(driftTailCheck(walk(4, t3)).kind, 'walk');
  assert.equal(driftTailCheck(walk(4, gauss)).kind, null);
  assert.equal(driftTailCheck(outlierSeries(5)).kind, 'noise');
  seed = 9;
  assert.equal(driftTailCheck(Array.from({ length: 300 }, () => gauss())).kind, null);
  assert.equal(driftTailCheck([1, 2, 3]).kind, null);
  assert.equal(driftTailCheck(parseSeries(read('./data/nile.csv')).values).kind, null);
});

test('the text says what the check found and points to the right remedy', () => {
  const csv = (x) => 't,v\n' + x.map((v, t) => `${t},${v}`).join('\n');
  const noise = driftText(driftResult({ csv: csv(outlierSeries(5)) }));
  assert.match(noise, /noise around the level is heavy-tailed/);
  assert.match(noise, /not offered here yet/);
  const w = driftText(driftResult({ csv: csv(walk(4, t3)) }));
  assert.match(w, /random walk with heavy-tailed steps/);
  assert.match(w, /--model meanvar on its differences/);
  assert.doesNotMatch(driftText(driftResult({ csv: read('./data/nile.csv') })), /Heavy-tail check/);
});

test('the quoted figures match the eval outputs', () => {
  const rob = read('./eval/tcpd-drift-robust.out.txt'), sim = read('./eval/drift-tails-sim.out.txt');
  const T = DRIFT_TAILS;
  assert.match(rob, new RegExp(`biweight K 3 \\(primary\\)\\s+${T.tcpd.biweightShipped}`));
  assert.match(rob, new RegExp(`biweight K 3 \\(primary\\)\\s+${T.tcpd.biweightHeldout}`));
  assert.match(rob, new RegExp(`bank .*gauss\\s+${T.tcpd.bankGauss} .*biw\\s+${T.tcpd.bankBiweight} `));
  assert.match(rob, new RegExp(`well_log .*gauss\\s+${T.tcpd.wellGauss} .*biw\\s+${T.tcpd.wellBiweight} `));
  const cell = (name) => sim.split('\n\n').find((b) => b.startsWith(name));
  assert.match(cell('t3 noise, flat level, no step'), new RegExp(`gauss\\s+found\\s+-\\s+other ${T.sim.t3NoiseGauss.toFixed(2)}`));
  assert.match(cell('t3 noise, flat level, no step'), new RegExp(`biweight\\s+found\\s+-\\s+other ${T.sim.t3NoiseBiweight.toFixed(2)}`));
  assert.match(cell('t3 random walk, no noise'), new RegExp(`gauss\\s+found\\s+-\\s+other ${T.sim.t3WalkGauss.toFixed(2)}`));
  assert.match(cell('t3 random walk, no noise'), new RegExp(`biweight\\s+found\\s+-\\s+other ${T.sim.t3WalkBiweight.toFixed(2)}`));
});

test('CLI: --model drift --json carries the check', async () => {
  let out = '';
  const csv = 't,v\n' + outlierSeries(5).map((v, t) => `${t},${v}`).join('\n');
  await main(['--model', 'drift', '--json'], { stdin: csv, out: (s) => { out += s; } });
  const j = JSON.parse(out);
  assert.equal(j.tails.kind, 'noise');
  assert.ok(j.tails.stepKurtosis > 6);
});
