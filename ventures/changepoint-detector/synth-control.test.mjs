import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { simplexLeastSquares, simplexLeastSquaresRows, projectSimplex, synthControlTest, synthInTimePlacebo, covariateBalance } from './synth-control.mjs';
import { predictorsOf } from './eval/synth-cov-sim.mjs';
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

test('the row-form solver recovers a mix of donors from a few predictors', () => {
  const A = [[1, 2, 5, 0, 3], [2, 1, 3, 0, 1], [3, 0, 4, 1, 2]];
  const b = A.map((r) => 0.3 * r[0] + 0.7 * r[2]);
  const w = simplexLeastSquaresRows(A, b);
  assert.ok(Math.abs(w.reduce((a, c) => a + c, 0) - 1) < 1e-9 && w.every((v) => v >= 0));
  const fit = A.map((r) => r.reduce((s, v, j) => s + v * w[j], 0));
  assert.ok(fit.every((v, i) => Math.abs(v - b[i]) < 1e-4), `fit ${fit} vs ${b}`); // stops on a 1e-10 relative change, as in every run
});

test('matched on covariates (README "Matched on covariates"): V on the simplex, the same placebo layout, a step found', () => {
  const rows = panel(CELLS.P1, 777);
  const px = predictorsOf(rows, CELLS.P1.k, 777);
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const predictors = { treated: px[0], donors: Object.fromEntries(px.slice(1).map((a, j) => [`d${j}`, a])) };
  const r = synthControlTest(rows[0], donors, CELLS.P1.k, { predictors });
  assert.equal(r.v.length, 5);
  assert.ok(Math.abs(r.v.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(r.placebos.length, 38);
  assert.ok(r.effectAverage < -0.5 && r.effectAverage > -1.5, `effect ${r.effectAverage}`);
  const again = synthControlTest(rows[0], donors, CELLS.P1.k, { predictors });
  assert.equal(again.p, r.p); // deterministic
  assert.throws(() => synthControlTest(rows[0], donors, CELLS.P1.k, { predictors: { treated: px[0], donors: {} } }), /same count of finite numbers/);
});

test('several starts for V (README "Several starts for V"): never a looser treated fit than one start, deterministic', () => {
  const rows = panel(CELLS.P1, 778);
  const px = predictorsOf(rows, CELLS.P1.k, 778);
  const names = rows.slice(1).map((_, j) => `d${j}`).slice(0, 12); // a small pool keeps the test quick
  const donors = Object.fromEntries(names.map((s, j) => [s, rows[j + 1]]));
  const predictors = { treated: px[0], donors: Object.fromEntries(names.map((s, j) => [s, px[j + 1]])) };
  const one = synthControlTest(rows[0], donors, CELLS.P1.k, { predictors });
  const multi = synthControlTest(rows[0], donors, CELLS.P1.k, { predictors, vSearch: 'multi' });
  assert.ok(multi.preRmspe <= one.preRmspe + 1e-12, `multi ${multi.preRmspe} vs one ${one.preRmspe}`);
  multi.placebos.forEach((q, j) => assert.ok(q.preRmspe <= one.placebos[j].preRmspe + 1e-12, `placebo ${q.name}`));
  assert.equal(synthControlTest(rows[0], donors, CELLS.P1.k, { predictors, vSearch: 'multi' }).p, multi.p);
  assert.throws(() => synthControlTest(rows[0], donors, CELLS.P1.k, { predictors, vSearch: 'many' }), /unknown vSearch/);
});

test('covariate balance (README "Covariate balance"): synthetic value is the fit weights times the donors, placebos ranked', () => {
  const rows = panel(CELLS.P1, 779);
  const names = rows.slice(1).map((_, j) => `d${j}`).slice(0, 10);
  const donors = Object.fromEntries(names.map((s, j) => [s, rows[j + 1]]));
  const r = synthControlTest(rows[0], donors, CELLS.P1.k);
  for (const q of r.placebos) assert.ok(Math.abs(Object.values(q.donorWeights).reduce((a, b) => a + b, 0) - 1) < 1e-6, q.name);
  // covariate 1: each unit's mean before the date (the fit matches it closely); covariate 2: arbitrary per-unit values
  const mean = (a) => a.slice(0, CELLS.P1.k).reduce((s, v) => s + v, 0) / CELLS.P1.k;
  const other = (j) => ((j * 7919) % 13) / 3;
  const cov = { treated: [mean(rows[0]), other(0)], donors: Object.fromEntries(names.map((s, j) => [s, [mean(rows[j + 1]), other(j + 1)]])) };
  const b = covariateBalance(r, cov, { names: ['before mean', 'other'] });
  assert.equal(b.length, 2);
  const synth2 = names.reduce((s, n) => s + r.donorWeights[n] * cov.donors[n][1], 0);
  assert.ok(Math.abs(b[1].synthetic - synth2) < 1e-12);
  assert.ok(Math.abs(b[1].donorMean - names.reduce((s, n) => s + cov.donors[n][1], 0) / names.length) < 1e-12);
  assert.ok(Math.abs(b[0].stdGap) < 0.25 && !b[0].imbalanced, `before mean gap ${b[0].stdGap}`); // matched by the outcome fit
  for (const c of b) assert.ok(c.placeboShare >= 0 && c.placeboShare <= 1);
  assert.throws(() => covariateBalance(r, { treated: [1], donors: {} }), /same count of finite numbers/);
  assert.throws(() => covariateBalance({}, cov), /synthControlTest result/);
});

test('covariate balance on Proposition 99: the outcome-only fit leaves California richer than its synthetic control', async () => {
  const { rows } = await import('./eval/synth-balance-real.mjs?quiet');
  const ca = rows.find((r) => r.state === 'CA').balance;
  assert.ok(ca[0].stdGap > 1 && ca[0].imbalanced, `CA ln income ${ca[0].stdGap}`); // 1.66 sd (eval/synth-balance-real.out.txt)
  assert.ok(ca.slice(2).every((c) => !c.imbalanced)); // the packs lags and before mean are matched
  assert.ok(rows.find((r) => r.state === 'MA').balance.every((c) => !c.imbalanced)); // MA balanced, yet ranked 6th
});
