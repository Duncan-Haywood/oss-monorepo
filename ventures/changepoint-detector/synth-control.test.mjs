import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { simplexLeastSquares, projectSimplex, synthControlTest, synthInTimePlacebo } from './synth-control.mjs';
import { panel, CELLS } from './eval/synth-sim.mjs';

test('the simplex projection lands on the simplex and leaves a point already there', () => {
  const w = projectSimplex([0.9, -0.3, 0.7, 0.1]);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(w.every((v) => v >= 0));
  assert.deepEqual(Array.from(projectSimplex([0.2, 0.3, 0.5])).map((v) => +v.toFixed(12)), [0.2, 0.3, 0.5]);
});

test('weights are recovered exactly when the treated series is a mix of donors', () => {
  const D = [[1, 2, 3, 4, 5, 6], [2, 1, 0, 1, 2, 3], [5, 3, 4, 2, 6, 1], [0, 0, 1, 1, 0, 2]];
  const y = D[0].map((v, t) => 0.6 * v + 0.4 * D[2][t]);
  const w = simplexLeastSquares(y.map((_, t) => D.map((d) => d[t])), y);
  assert.deepEqual(w.map((v) => +v.toFixed(4)), [0.6, 0, 0.4, 0]);
});

test('a treated series above every donor gets the top donor and a fit warning', () => {
  const rows = panel(CELLS.E1, 424242);
  const r = synthControlTest(rows[0], Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d])), CELLS.E1.k);
  assert.equal(r.fitWarning, true);
});

test('a real step on a matched series ranks at the top of 39 (p 1/39 or 2/39); a no-change panel is not rejected', () => {
  const step = panel(CELLS.P1, 777);
  const r = synthControlTest(step[0], Object.fromEntries(step.slice(1).map((d, j) => [`d${j}`, d])), CELLS.P1.k);
  assert.equal(r.donors, 38);
  assert.ok(Math.abs(r.minP - 1 / 39) < 1e-12);
  assert.ok(r.effectAverage < -0.6 && r.effectAverage > -1.4, `effect ${r.effectAverage}`);
  assert.ok(r.rank <= 2, `rank ${r.rank}`);
  const none = panel(CELLS.N1, 778);
  const q = synthControlTest(none[0], Object.fromEntries(none.slice(1).map((d, j) => [`d${j}`, d])), CELLS.N1.k);
  assert.ok(q.p > 0.05, `p ${q.p}`);
});

test('in-time placebo cuts the window at the real date', () => {
  const rows = panel(CELLS.N1, 9);
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthInTimePlacebo(rows[0], donors, 19, 10);
  assert.equal(r.n, 19);
  assert.equal(r.k, 10);
});

test('bad input is refused with a reason', () => {
  assert.throws(() => synthControlTest([1, 2, 3, 4, 5, 6, 7, 8], { a: [1, 2, 3, 4, 5, 6, 7, 8] }, 6), /at least 4 donor/);
  const d = { a: [1, 2, 3, 4, 5, 6, 7, 8], b: [1, 2, 3, 4, 5, 6, 7, 8], c: [2, 2, 3, 4, 5, 6, 7, 8], e: [3, 2, 3, 4, 5, 6, 7, 8] };
  assert.throws(() => synthControlTest([1, 2, 3, 4, 5, 6, 7, 8], d, 2), /at least 5 before/);
});

test('California 1989 against the 38 donors: the published weights and gap; floored ratio rank 1 of 39, the paper\'s ratio rank 3 (README "A floored ratio")', () => {
  const [h, ...rows] = readFileSync(new URL('./data/us-cigarette-packs-per-capita.csv', import.meta.url), 'utf8').trim().split('\n');
  const head = h.split(','), data = rows.map((l) => l.split(',').map(Number));
  const col = (s) => data.slice(0, 31).map((r) => r[head.indexOf(s)]);
  const EX = new Set('AK AZ FL HI MD MA MI NJ NY OR WA DC CA'.split(' '));
  const donors = Object.fromEntries(head.slice(1).filter((s) => !EX.has(s)).map((s) => [s, col(s)]));
  const r = synthControlTest(col('CA'), donors, 19);
  assert.deepEqual(r.weights.slice(0, 4).map((w) => w.name), ['UT', 'MT', 'NV', 'CT']);
  assert.ok(Math.abs(r.effectAtEnd - -26.5) < 0.5, `gap at 2000 ${r.effectAtEnd}`);
  assert.ok(Math.abs(r.effectAverage - -19.5) < 0.5);
  assert.equal(r.statistic, 'floored');
  assert.equal(r.rank, 1);
  assert.ok(Math.abs(r.p - 1 / 39) < 1e-12);
  assert.ok(Math.abs(r.floor - 2.15) < 0.01, `floor ${r.floor}`);
  assert.equal(r.tests.ratio.rank, 3);
  assert.equal(r.tests.post.rank, 4);
  assert.equal(synthControlTest(col('CA'), donors, 19, { statistic: 'ratio' }).rank, 3);
});

test('the floored ratio leaves a unit fitted worse than the median alone and caps the rest at the median', () => {
  const rows = panel(CELLS.N1, 31337);
  const r = synthControlTest(rows[0], Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d])), CELLS.N1.k);
  const all = [r.preRmspe, ...r.placebos.map((q) => q.preRmspe)].sort((a, b) => a - b);
  assert.equal(r.floor, all[19]);
  for (const q of r.placebos) assert.ok(Math.abs(q.floored - q.postRmspe / Math.max(q.preRmspe, r.floor)) < 1e-12);
  assert.throws(() => synthControlTest(rows[0], Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d])), CELLS.N1.k, { statistic: 'max' }), /unknown statistic/);
});
