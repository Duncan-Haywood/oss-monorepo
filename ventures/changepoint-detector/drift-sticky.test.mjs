// Sticky series on the drift-level model (README "Sticky series: exact repeats"): the warning that
// ships, and the two pre-registered fixes that did not (repeats 'drop' and 'missing', library only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftLevelChanges, driftLevel, dropRepeats, gapPartition, gains, stickyCheck, STICKY_SHARE } from './drift-level.mjs';
import { driftResult, driftText, stickyLines, DRIFT_STICKY } from './drift-cli.mjs';
import { driftNotes } from './drift-view.mjs';

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const walk = (n, p) => { let m = 0; const x = Array.from({ length: n }, (_, t) => (m += t ? gauss() : 0) + 0.1 * gauss()); for (let t = 1; t < n; t++) if (rnd() < p) x[t] = x[t - 1]; return x; };

test('dropRepeats keeps the first point and every value that differs from the one before', () => {
  assert.deepEqual(dropRepeats([1, 1, 2, 2, 2, 3, 1, 1]), { values: [1, 2, 3, 1], index: [0, 2, 5, 6] });
});

test('with no exact repeats, drop and missing give the shipped fit exactly', () => {
  seed = 3;
  const x = Array.from({ length: 160 }, (_, t) => (t >= 80 ? 4 : 0) + gauss());
  for (const scale of ['global', 'segment']) {
    const k = driftLevelChanges(x, { noise: 'ml', scale });
    for (const repeats of ['drop', 'missing']) {
      const r = driftLevelChanges(x, { noise: 'ml', scale, repeats });
      assert.deepEqual(r.changepoints, k.changepoints, `${scale} ${repeats}`);
      assert.ok(Math.abs(r.cost - k.cost) < 1e-8, `${scale} ${repeats}: ${r.cost} vs ${k.cost}`);
    }
  }
});

test('gapPartition with every gap 1 is the shipped partition; with gaps it matches a direct filter', () => {
  seed = 9;
  const y = Array.from({ length: 12 }, (_, t) => (t >= 6 ? 3 : 0) + gauss());
  const q = 0.2, beta = 2 * Math.log(12);
  const ones = y.map((_, k) => (k ? 1 : 0));
  const ship = driftLevelChanges(y, { sigma: 1, omega: Math.sqrt(q) });
  const g1 = gapPartition(y, ones, q, beta);
  assert.deepEqual(g1.changepoints, ship.changepoints);
  assert.ok(Math.abs(g1.cost - ship.cost) < 1e-9);
  // One segment with gaps: the cost is the local-level filter's -2 log likelihood with q * gap of wander.
  const gap = [0, 1, 3, 1, 2, 1, 1, 4, 1, 1, 1, 1];
  let a = y[0], P = 1, c = 0;
  for (let k = 1; k < 12; k++) { const Pp = P + q * gap[k], F = Pp + 1, v = y[k] - a; c += Math.log(F) + (v * v) / F; a += (Pp / F) * v; P = Pp * (1 - Pp / F); }
  const one = gapPartition(y, gap, q, 1e9);
  assert.deepEqual(one.changepoints, []);
  assert.ok(Math.abs(one.cost - c) < 1e-6, `${one.cost} vs ${c}`);
});

test('changes map back to positions in the original series', () => {
  const x = [0, 0, 0, 0.1, 0.1, -0.1, 0, 0.05, 0.05, 10, 10, 10, 10.1, 9.9, 10, 10.2, 10.2, 9.8, 10, 10.1];
  for (const repeats of ['drop', 'missing']) {
    const r = driftLevelChanges(x, { sigma: 0.1, omega: 0.01, repeats });
    assert.deepEqual(r.changepoints, [9], repeats);
    assert.equal(r.repeatsDropped, 7);
  }
  assert.throws(() => driftLevelChanges(x, { repeats: 'drop', slope: true }), /slope/);
  assert.throws(() => driftLevelChanges(x, { repeats: 'nope' }), /keep, drop or missing/);
});

test('on a sticky walk with no change, both fixes remove most of the false changes', () => {
  seed = 21;
  const x = walk(300, 0.4);
  const ship = driftLevelChanges(x, { noise: 'ml' }).changepoints.length;
  const drop = driftLevelChanges(x, { noise: 'ml', repeats: 'drop' }).changepoints.length;
  const miss = driftLevelChanges(x, { noise: 'ml', repeats: 'missing' }).changepoints.length;
  assert.ok(ship >= 15, `shipped ${ship}`);
  assert.ok(drop <= ship / 3 && miss <= ship / 3, `drop ${drop}, missing ${miss}, shipped ${ship}`);
});

test('stickyCheck fires at 20% exact repeats, and the warning reaches the CLI text and the page notes', () => {
  assert.equal(STICKY_SHARE, 0.2);
  const base = Array.from({ length: 101 }, (_, t) => t);
  const at = (k) => base.map((v, t) => (t > 0 && t <= k ? 0 : v));
  assert.equal(stickyCheck(at(19)).sticky, false);
  assert.equal(stickyCheck(at(20)).sticky, true);
  assert.equal(stickyCheck(at(20)).repeats, 20);
  assert.equal(stickyCheck([1, 1, 1]).sticky, false);
  seed = 5;
  const x = walk(200, 0.4);
  const csv = 'v\n' + x.join('\n');
  const r = driftResult({ csv });
  assert.equal(r.sticky.sticky, true);
  const line = stickyLines(r)[0];
  assert.match(line, /^Sticky-series check: \d+% of the steps/);
  assert.ok(driftText(r).includes(line));
  assert.ok(driftNotes(r).includes(line));
  const calm = driftResult({ csv: 'v\n' + walk(200, 0).join('\n') });
  assert.equal(calm.sticky.sticky, false);
  assert.deepEqual(stickyLines(calm), []);
  assert.ok(!driftText(calm).includes('Sticky-series'));
  assert.equal(driftLevel(x).sticky.sticky, true);
});

test('the figures quoted in the warning match eval/drift-sticky-share.out.txt', () => {
  const out = readFileSync(new URL('./eval/drift-sticky-share.out.txt', import.meta.url), 'utf8');
  const row = (p) => Number(out.split('\n').find((l) => l.trim().startsWith(p)).trim().split(/\s+/)[2]);
  assert.equal(row('0.00'), DRIFT_STICKY.none);
  assert.equal(row('0.20'), DRIFT_STICKY.at20);
  assert.equal(row('0.40'), DRIFT_STICKY.at40);
});

test('the measured verdicts: both fixes fail the sticky-step power rule', () => {
  const found = (file, label) => {
    const out = readFileSync(new URL(`./eval/${file}`, import.meta.url), 'utf8');
    const g = out.slice(out.indexOf('G sticky walk'));
    return Number(g.split('\n').find((l) => l.trim().startsWith(label)).match(/found (\d+)\/60/)[1]);
  };
  const ship = found('drift-repeats-sim.out.txt', 'shipped');
  assert.ok(ship - found('drift-repeats-sim.out.txt', 'R:') > 6);
  assert.ok(ship - found('drift-repeats-sim.out.txt', 'S:') > 6);
  const ship2 = found('drift-missing-sim.out.txt', 'shipped');
  assert.ok(ship2 - found('drift-missing-sim.out.txt', 'MR:') > 6);
  assert.ok(ship2 - found('drift-missing-sim.out.txt', 'MS:') > 6);
});
