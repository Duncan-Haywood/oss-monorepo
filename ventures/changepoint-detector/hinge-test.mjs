// A level test for one change of slope (a "hinge"), for trend-stationary series with AR(1) noise.
//
// slope-breaks.mjs tests a slope change on the DIFFERENCES, because a drifting series (GDP, productivity) has
// near-unit-root residuals about any line and a level fit's gain is then huge for any kink. Differencing pays for that
// safety with power: on annual global temperature the recalled 1976 acceleration is the best split of the differences
// but W is 1.8 against a bar of 8.4 (README, "Global temperature"). When the residuals about a line are a stationary
// AR(1), the levels carry the information the differences throw away. This module tests on the levels, and refuses
// when the residuals look like a unit root, which is the case slope-breaks.mjs was written for.
//
// Model: x_t = a + b t + c (t - k)+ + u_t, u_t = rho u_{t-1} + e_t, e_t ~ N(0, s^2), knot k unknown.
// Statistic: rho is read once from the ordinary least-squares hinge at its best knot (lag-1 autocorrelation of
// those residuals), the series and the regressors are Prais-Winsten transformed with it, and the largest F over knots
// that leave `margin` of the series at each end is the statistic (a sup-F, Andrews 1993; the knot is not identified
// under the null, Davies 1987, so no chi-square or F table applies).
// Calibration: a parametric bootstrap. `reps` series are drawn from the fitted straight line plus Gaussian AR(1) noise
// with the estimated rho (small-sample bias corrected, Kendall 1954: rho + (1 + 3 rho) / n) and innovation sd, and each
// replicate repeats the whole procedure, rho estimate included. p = (1 + #replicates >= F) / (1 + reps).
// Guard: when the bias-corrected rho of the straight-line residuals is above `rhoMax` (0.9 by default; 0.7 under 100
// points) the residuals may be too close to a unit root for a level test to be honest. Since 2026-11-15 the default
// guard is 'cut' (eval/hinge-cut-guard-prereg-2026-11-15.md, all four bars held): such a series is still tested when
// the best hinge's residuals clear `rhoMax` AND the hinge cuts rho by more than 99% of random walks of the same length
// do (a real bend makes a line's residuals sticky; a walk's wander is cut far less). Otherwise { refused: true }.
// guard 'line' is the old rule (refuse on the line's rho alone); 'hinge' (failed its bars) is kept for evaluation.
//
// What it does not cover: non-Gaussian noise, dependence beyond AR(1) (long memory makes it over-reject), more than
// one hinge (it tests "one hinge against none"), and steps (a level jump can pass for a hinge; `stepOrBend`, which
// compares the two, failed its pre-registered bend bar, eval/hinge-step-or-bend-prereg-2026-11-15.md). Size and power:
// eval/hinge-test-sim.mjs; real series: eval/hinge-test-real.mjs.





import { mulberry, gauss, lag1, pw, resid2, corrected } from './stats-core.mjs';
function trimOf(n, margin) { return Math.max(3, Math.floor(n * margin)); }

// sup-F scan over knots k (hinge column (t - k)+, zero up to and at k) with the series and columns transformed by rho
function scan(x, rho, margin) {
  const n = x.length, one = pw(new Float64Array(n).fill(1), rho), tt = pw(Float64Array.from({ length: n }, (_, t) => t), rho);
  const y = pw(x, rho), null0 = resid2(y, one, tt), trim = trimOf(n, margin);
  let best = null;
  const h = new Float64Array(n);
  for (let k = trim; k <= n - 1 - trim; k++) {
    for (let t = 0; t < n; t++) h[t] = Math.max(0, t - k);
    const z = resid2(pw(h, rho), one, tt).e;
    let ez = 0, zz = 0;
    for (let t = 0; t < n; t++) { ez += null0.e[t] * z[t]; zz += z[t] * z[t]; }
    if (!(zz > 0)) continue;
    const gain = ez * ez / zz, rss1 = null0.ss - gain, f = rss1 > 0 ? gain / (rss1 / (n - 3)) : Infinity;
    if (!best || f > best.f) best = { k, f, c: ez / zz, rss1 };
  }
  return { best, rss0: null0.ss };
}

// ordinary least-squares hinge: best knot and its residuals (for rho), straight-line residuals (for the guard)
function olsHinge(x, margin) {
  const n = x.length, one = new Float64Array(n).fill(1), tt = Float64Array.from({ length: n }, (_, t) => t);
  const line = resid2(Float64Array.from(x), one, tt), trim = trimOf(n, margin);
  let best = null; const h = new Float64Array(n);
  for (let k = trim; k <= n - 1 - trim; k++) {
    for (let t = 0; t < n; t++) h[t] = Math.max(0, t - k);
    const z = resid2(h, one, tt).e; let ez = 0, zz = 0;
    for (let t = 0; t < n; t++) { ez += line.e[t] * z[t]; zz += z[t] * z[t]; }
    if (zz > 0 && (!best || ez * ez / zz > best.gain)) best = { k, gain: ez * ez / zz, c: ez / zz, z };
  }
  const e = Float64Array.from(line.e, (v, t) => v - best.c * best.z[t]);
  return { k: best.k, rhoHinge: lag1(e), rhoLine: lag1(line.e), line };
}


function statistic(x, margin, rhoCap) {
  const o = olsHinge(x, margin);
  const rho = Math.max(-0.9, Math.min(rhoCap, o.rhoHinge));
  const s = scan(x, rho, margin);
  return { f: s.best.f, k: s.best.k, c: s.best.c, rho, o };
}

/**
 * x: the series (evenly spaced). Returns { refused, reason } when the residuals about a straight line look like a unit
 * root; otherwise { index, f, p, bar95, rho, slopeBefore, slopeAfter, reps, n }. `index` is the knot: the slope is
 * `slopeBefore` per step up to x[index] and `slopeAfter` after it. Slopes are from the transformed (GLS) fit at that knot.
 */
export function hingeTest(x, { margin = 0.15, reps = 499, seed = 1, rhoMax = 0.9, rhoCap = 0.95, gen = 'line', guard = 'cut' } = {}) {
  x = Array.from(x, Number);
  const n = x.length;
  if (n < 30) return { refused: true, reason: `needs 30 or more points (got ${n})`, n };
  const st = statistic(x, margin, rhoCap);
  const rhoLineC = corrected(st.o.rhoLine, n);
  // Short series: the AR(1) estimate is too rough near a unit root (size 10.7% at n 60, rho 0.8 with the 0.9 guard,
  // eval/hinge-test-sim.out.txt), so below 100 points the guard is 0.7.
  if (n < 100) rhoMax = Math.min(rhoMax, 0.7);
  // guard 'hinge' (eval/hinge-guard-prereg-2026-11-15.md): read the guard off the best OLS hinge's residuals, which a
  // real bend does not make sticky; the null still draws with the straight-line rho, capped at rhoCap, not at the guard.
  const rhoHingeC = corrected(st.o.rhoHinge, n);
  const guardRho = guard === 'hinge' ? rhoHingeC : rhoLineC;
  // guard 'cut' (eval/hinge-cut-guard-prereg-2026-11-15.md): where the line guard would refuse, admit only when the
  // hinge's residuals clear the guard AND the hinge cuts rho by more than 99% of random walks of this length do.
  let cutBar = null, admittedByCut = false;
  if (guard === 'cut' && rhoLineC > rhoMax) {
    cutBar = randomWalkCutBar(n, margin);
    admittedByCut = rhoHingeC <= rhoMax && rhoLineC - rhoHingeC > cutBar;
    if (!admittedByCut) return { refused: true, reason: `the residuals about a straight line have lag-1 autocorrelation ${rhoLineC.toFixed(2)} (bias-corrected), above ${rhoMax}, and the best hinge cuts it to ${rhoHingeC.toFixed(2)}, ${rhoHingeC > rhoMax ? 'still above the guard' : `a cut of ${(rhoLineC - rhoHingeC).toFixed(2)}, not more than random walks of this length give (99th percentile ${cutBar.toFixed(2)})`}: too close to a unit root for a level test; use the test on differences (slopeBreaks)`, rhoLine: rhoLineC, rhoHinge: rhoHingeC, cutBar, n };
  } else if (guardRho > rhoMax) {
    const what = guard === 'hinge' ? 'the best hinge' : 'a straight line';
    return { refused: true, reason: `the residuals about ${what} have lag-1 autocorrelation ${guardRho.toFixed(2)} (bias-corrected), above ${rhoMax}: too close to a unit root for a level test; use the test on differences (slopeBreaks)`, rhoLine: rhoLineC, rhoHinge: rhoHingeC, n };
  }
  // GLS fit at the chosen knot, for slopes and the null's line and innovation sd
  const rho = st.rho, one = pw(new Float64Array(n).fill(1), rho), tt = pw(Float64Array.from({ length: n }, (_, t) => t), rho), y = pw(x, rho);
  const nul = resid2(y, one, tt);
  const [a0, b0] = nul.g;
  const h = pw(Float64Array.from({ length: n }, (_, t) => Math.max(0, t - st.k)), rho);
  // slope before the knot: the line coefficient after partialling the hinge out
  const alt = fit3(y, one, tt, h);
  // null generator: fitted line, AR(1) noise with the bias-corrected rho of the line's residuals and their innovation sd
  const rhoGen = Math.max(-0.9, Math.min(guard === 'hinge' || admittedByCut ? rhoCap : rhoMax, gen === 'hinge' ? corrected(st.rho, n) : rhoLineC));
  const sdInnov = Math.sqrt(nul.ss / (n - 2));
  const r = mulberry(seed), nulls = [];
  for (let b = 0; b < reps; b++) {
    const z = new Array(n); let u = gauss(r) * sdInnov / Math.sqrt(Math.max(1e-9, 1 - rhoGen * rhoGen));
    for (let t = 0; t < n; t++) { if (t) u = rhoGen * u + gauss(r) * sdInnov; z[t] = a0 + b0 * t + u; }
    nulls.push(statistic(z, margin, rhoCap).f);
  }
  nulls.sort((p, q) => p - q);
  const ge = nulls.filter((v) => v >= st.f).length;
  return {
    refused: false, index: st.k, f: st.f, p: (1 + ge) / (1 + reps), bar95: nulls[Math.floor(0.95 * (reps - 1))],
    rho, rhoLine: rhoLineC, rhoHinge: rhoHingeC, guard, ...(guard === 'cut' ? { admittedByCut, cutBar } : {}), slopeBefore: alt[1], slopeAfter: alt[1] + alt[2], reps, n,
  };
}

// Step or bend? (eval/hinge-step-or-bend-prereg-2026-11-15.md) With the test's rho and the same knot range, the best
// hinge (a + b t + c (t - k)+) against the best level step on the same line (a + b t + d 1{t > k}). Both have three
// coefficients and one knot, so the smaller transformed residual sum of squares names the better kind.
// Failed its pre-registered bend bar (README, "Step or bend?"): at rho 0.5 it calls most real bends steps, so it is
// not in hingeTest's output, the CLI or the page; it is kept for evaluation.
export function stepOrBend(x, rho, margin = 0.15) {
  x = Array.from(x, Number);
  const n = x.length, one = pw(new Float64Array(n).fill(1), rho), tt = pw(Float64Array.from({ length: n }, (_, t) => t), rho);
  const y = pw(x, rho), null0 = resid2(y, one, tt), trim = trimOf(n, margin), col = new Float64Array(n);
  const best = (make) => {
    let b = null;
    for (let k = trim; k <= n - 1 - trim; k++) {
      for (let t = 0; t < n; t++) col[t] = make(t, k);
      const z = resid2(pw(col, rho), one, tt).e;
      let ez = 0, zz = 0;
      for (let t = 0; t < n; t++) { ez += null0.e[t] * z[t]; zz += z[t] * z[t]; }
      if (!(zz > 0)) continue;
      const rss = null0.ss - ez * ez / zz;
      if (!b || rss < b.rss) b = { k, rss, coef: ez / zz };
    }
    return b;
  };
  const bend = best((t, k) => Math.max(0, t - k)), step = best((t, k) => (t > k ? 1 : 0));
  return {
    better: step.rss < bend.rss ? 'step' : 'bend', stepIndex: step.k, stepSize: step.coef, bendIndex: bend.k,
    rssStep: step.rss, rssBend: bend.rss, ratio: step.rss / bend.rss,
  };
}

// Step or bend, as two tests (eval/hinge-step-or-bend-boot-prereg-2026-11-15.md). The RSS comparison above calls
// whichever kind fits better even when the two fit about equally, which is where it failed. Here each kind is a null
// in turn (a Cox-style non-nested test calibrated by a parametric bootstrap): the statistic is T = log(step RSS /
// bend RSS) (above 0 favours the bend), and it is redrawn `reps` times from the best fitted step plus AR(1) noise and
// `reps` times from the best fitted bend plus AR(1) noise, each replicate rerunning the whole procedure (rho from the
// OLS hinge, as the hinge test reads it). pStep is how often the step null gives a T at least this large; pBend how
// often the bend null gives one at most this large. A kind is called only when its rival is rejected and it is not:
// call 'bend' when pStep <= level < pBend, 'step' when pBend <= level < pStep, else 'unclear'.
// Failed two pre-registered bars (README, "Step or bend, as two tests"): on a bend of 0.08 per step in AR(1) noise with
// rho 0.5 it called 11% of series a step (cap 8%), and its guard let most random walks through, which it then called a
// bend (129 of 200 at n 100, 112 at n 145; cap 10%). Kept for evaluation; not in analyze, the CLI or the page.
function fitKind(x, rho, make, margin) {
  const n = x.length, one = pw(new Float64Array(n).fill(1), rho), tt = pw(Float64Array.from({ length: n }, (_, t) => t), rho);
  const y = pw(x, rho), null0 = resid2(y, one, tt), trim = trimOf(n, margin), col = new Float64Array(n);
  let b = null;
  for (let k = trim; k <= n - 1 - trim; k++) {
    for (let t = 0; t < n; t++) col[t] = make(t, k);
    const z = resid2(pw(col, rho), one, tt).e;
    let ez = 0, zz = 0;
    for (let t = 0; t < n; t++) { ez += null0.e[t] * z[t]; zz += z[t] * z[t]; }
    if (!(zz > 0)) continue;
    const rss = null0.ss - ez * ez / zz;
    if (!b || rss < b.rss) b = { k, rss };
  }
  for (let t = 0; t < n; t++) col[t] = make(t, b.k);
  const coef = fit3(y, one, tt, pw(col, rho));
  return { ...b, coef, mean: Float64Array.from({ length: n }, (_, t) => coef[0] + coef[1] * t + coef[2] * make(t, b.k)) };
}
const HINGE_COL = (t, k) => Math.max(0, t - k), STEP_COL = (t, k) => (t > k ? 1 : 0);
const rhoOf = (x, margin, rhoCap) => Math.max(-0.9, Math.min(rhoCap, olsHinge(x, margin).rhoHinge));
const logRatio = (x, margin, rhoCap) => Math.log(stepOrBend(x, rhoOf(x, margin, rhoCap), margin).ratio);

// Guard: refused under 30 points, and when the residuals of both the best OLS step and the best OLS bend have
// bias-corrected lag-1 autocorrelation above rhoMax (0.9; 0.7 under 100 points, as the hinge test): a wandering
// series is neither a step nor a bend on a line.
export function stepOrBendTest(x, { margin = 0.15, reps = 199, seed = 1, level = 0.05, rhoCap = 0.95, rhoMax = 0.9 } = {}) {
  x = Array.from(x, Number);
  const n = x.length;
  if (n < 30) return { refused: true, reason: `needs 30 or more points (got ${n})`, n };
  if (n < 100) rhoMax = Math.min(rhoMax, 0.7);
  const fits = { step: fitKind(x, 0, STEP_COL, margin), bend: fitKind(x, 0, HINGE_COL, margin) };
  const resid = (f) => x.map((v, t) => v - f.mean[t]);
  const rhoStepOls = corrected(lag1(resid(fits.step)), n), rhoBendOls = corrected(lag1(resid(fits.bend)), n);
  if (Math.min(rhoStepOls, rhoBendOls) > rhoMax) return { refused: true, reason: `the residuals about the best step and the best bend have lag-1 autocorrelation ${rhoStepOls.toFixed(2)} and ${rhoBendOls.toFixed(2)} (bias-corrected), both above ${rhoMax}: the series wanders too much to call it either`, rhoStep: rhoStepOls, rhoBend: rhoBendOls, n };
  const rho = rhoOf(x, margin, rhoCap), s = stepOrBend(x, rho, margin), T = Math.log(s.ratio);
  const draw = (make, r) => {
    // the null's mean is its OLS fit at its best knot; its noise is AR(1) with the bias-corrected lag-1 autocorrelation
    // and innovation sd of those OLS residuals
    const f = make === STEP_COL ? fits.step : fits.bend, e = resid(f);
    const rg = Math.max(-0.9, Math.min(rhoCap, corrected(lag1(e), n)));
    const sdE = Math.sqrt(Math.max(1e-12, e.reduce((a, v, t) => a + (t ? (v - rg * e[t - 1]) ** 2 : 0), 0) / (n - 4)));
    const out = [];
    for (let b = 0; b < reps; b++) {
      const z = new Array(n); let u = gauss(r) * sdE / Math.sqrt(1 - rg * rg);
      for (let t = 0; t < n; t++) { if (t) u = rg * u + gauss(r) * sdE; z[t] = f.mean[t] + u; }
      out.push(logRatio(z, margin, rhoCap));
    }
    return out;
  };
  const r = mulberry(seed), underStep = draw(STEP_COL, r), underBend = draw(HINGE_COL, r);
  const pStep = (1 + underStep.filter((v) => v >= T).length) / (1 + reps);
  const pBend = (1 + underBend.filter((v) => v <= T).length) / (1 + reps);
  const call = pStep <= level && pBend > level ? 'bend' : pBend <= level && pStep > level ? 'step' : 'unclear';
  return { refused: false, call, pStep, pBend, logRatio: T, rho, rhoStep: rhoStepOls, rhoBend: rhoBendOls, stepIndex: s.stepIndex, stepSize: s.stepSize, bendIndex: s.bendIndex, reps, n };
}

// least squares on three columns (Gaussian elimination), returns coefficients
function fit3(y, c1, c2, c3) {
  const C = [c1, c2, c3], A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let t = 0; t < y.length; t++) for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += C[i][t] * C[j][t]; A[i][3] += C[i][t] * y[t]; }
  for (let i = 0; i < 3; i++) {
    let m = i; for (let q = i + 1; q < 3; q++) if (Math.abs(A[q][i]) > Math.abs(A[m][i])) m = q;
    [A[i], A[m]] = [A[m], A[i]];
    for (let q = 0; q < 3; q++) if (q !== i) { const f = A[q][i] / A[i][i]; for (let c = i; c < 4; c++) A[q][c] -= f * A[i][c]; }
  }
  return A.map((row, i) => row[3] / row[i]);
}

/** The statistic alone (no bootstrap), for evaluation scripts. */
export function hingeStatistic(x, { margin = 0.15, rhoCap = 0.95 } = {}) {
  const st = statistic(Array.from(x, Number), margin, rhoCap);
  return { f: st.f, index: st.k, rho: st.rho };
}

export const HINGE_PAPERS = [
  'Andrews, D. W. K. (1993). Tests for parameter instability and structural change with unknown change point. Econometrica 61(4), 821-856. doi:10.2307/2951764',
  'Davies, R. B. (1987). Hypothesis testing when a nuisance parameter is present only under the alternative. Biometrika 74(1), 33-43. doi:10.1093/biomet/74.1.33',
  'Prais, S. J. & Winsten, C. B. (1954). Trend estimators and serial correlation. Cowles Commission Discussion Paper 383.',
];

// 99th percentile of (line rho - hinge rho), both bias corrected, over 299 Gaussian random walks of length n (seed 7).
// Detrending removes a walk's drift and lag-1 autocorrelation ignores scale, so the bar depends on n (and margin) only.
const cutBars = new Map();
export function randomWalkCutBar(n, margin = 0.15) {
  const key = `${n}:${margin}`;
  if (cutBars.has(key)) return cutBars.get(key);
  const r = mulberry(7), cuts = [];
  for (let b = 0; b < 299; b++) {
    const z = new Array(n); let u = 0;
    for (let t = 0; t < n; t++) { if (t) u += gauss(r); z[t] = u; }
    const o = olsHinge(z, margin);
    cuts.push(corrected(o.rhoLine, n) - corrected(o.rhoHinge, n));
  }
  cuts.sort((p, q) => p - q);
  const bar = cuts[Math.floor(0.99 * (cuts.length - 1))];
  cutBars.set(key, bar);
  return bar;
}

/** Bias-corrected lag-1 autocorrelations of the residuals about the best straight line and the best OLS hinge. */
export function hingeRhos(x, { margin = 0.15 } = {}) {
  x = Array.from(x, Number);
  const o = olsHinge(x, margin), n = x.length;
  return { line: corrected(o.rhoLine, n), hinge: corrected(o.rhoHinge, n), index: o.k };
}
