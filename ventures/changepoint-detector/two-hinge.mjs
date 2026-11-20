// A level test for two changes of slope ("two hinges") against a straight line, for trend-stationary series with
// AR(1) noise. The one-hinge test (hinge-test.mjs) refused 7 of 8 real series under 100 points because the residuals
// about its best single bend stayed sticky (lag-1 autocorrelation 0.71-0.95; README, "Step or bend?" and "The hinge
// test on the logs"): a growth curve that speeds up and then levels off, or a rise, plateau and fall, has two bends,
// and one hinge leaves the second in the residuals. This module is the same procedure with one more knot.
//
// Model: x_t = a + b t + c1 (t - k1)+ + c2 (t - k2)+ + u_t, u_t AR(1), knots unknown, k1 < k2.
// Knots: each leaves `margin` of the series at either end, and the two are at least the same trim apart.
// Statistic: rho from the best ordinary least-squares two-hinge fit's residuals; the series and regressors
// Prais-Winsten transformed with it; the largest F (2 and n - 4 degrees of freedom) over knot pairs.
// Calibration: parametric bootstrap from the fitted GLS straight line plus Gaussian AR(1) noise with the bias-corrected
// rho of the line's residuals, every replicate rerunning the whole procedure.
// Guard: the one-hinge test's 'cut' guard with two hinges in place of one. Bias-corrected line rho above rhoMax (0.9;
// 0.7 under 100 points) refuses, unless the two-hinge residuals clear rhoMax and the two hinges cut rho by more than
// the 99th percentile of the same cut over 299 Gaussian random walks of this length (seed 7). Admitted series' nulls
// draw with the line rho capped at 0.95.
// Status and measurements: eval/two-hinge-prereg-2026-11-16.md and README, "Two changes of slope".

import { mulberry, gauss, lag1, pw, resid2, corrected } from './stats-core.mjs';
const trimOf = (n, margin) => Math.max(3, Math.floor(n * margin));

// Best pair of knots with series and columns transformed by rho. By Frisch-Waugh-Lovell, each hinge column is first
// residualised on the transformed intercept and trend; the pair's gain over the line is g' M^-1 g with g the hinge
// columns' inner products with the line's residuals and M their Gram matrix.
function scan2(x, rho, margin) {
  const n = x.length, one = pw(new Float64Array(n).fill(1), rho), tt = pw(Float64Array.from({ length: n }, (_, t) => t), rho);
  const y = pw(x, rho), line = resid2(y, one, tt), trim = trimOf(n, margin);
  const ks = [], Z = [], ez = [], h = new Float64Array(n);
  for (let k = trim; k <= n - 1 - trim; k++) {
    for (let t = 0; t < n; t++) h[t] = Math.max(0, t - k);
    const z = resid2(pw(h, rho), one, tt).e;
    let a = 0; for (let t = 0; t < n; t++) a += line.e[t] * z[t];
    ks.push(k); Z.push(z); ez.push(a);
  }
  const K = ks.length, G = Array.from({ length: K }, () => new Float64Array(K));
  for (let i = 0; i < K; i++) for (let j = i; j < K; j++) { let s = 0; const zi = Z[i], zj = Z[j]; for (let t = 0; t < n; t++) s += zi[t] * zj[t]; G[i][j] = G[j][i] = s; }
  let best = null;
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) {
    if (ks[j] - ks[i] < trim) continue;
    const a = G[i][i], b = G[i][j], d = G[j][j], det = a * d - b * b;
    if (!(det > 1e-12 * a * d)) continue;
    const c1 = (d * ez[i] - b * ez[j]) / det, c2 = (a * ez[j] - b * ez[i]) / det, gain = c1 * ez[i] + c2 * ez[j];
    if (!best || gain > best.gain) best = { i, j, gain, c1, c2 };
  }
  const rss2 = line.ss - best.gain;
  const e = Float64Array.from(line.e, (v, t) => v - best.c1 * Z[best.i][t] - best.c2 * Z[best.j][t]);
  return { k1: ks[best.i], k2: ks[best.j], c1: best.c1, c2: best.c2, gain: best.gain, rss0: line.ss, rss2, e, lineE: line.e, lineG: line.g, f: rss2 > 0 ? (best.gain / 2) / (rss2 / (n - 4)) : Infinity, y, one, tt };
}

function statistic(x, margin, rhoCap) {
  const o = scan2(x, 0, margin);
  const rho = Math.max(-0.9, Math.min(rhoCap, lag1(o.e)));
  return { s: scan2(x, rho, margin), rho, rhoLine: lag1(o.lineE), rhoTwo: lag1(o.e) };
}

const cutBars = new Map();
/** 99th percentile of (line rho - two-hinge rho), both bias corrected, over 299 Gaussian random walks of length n. */
export function randomWalkCutBar2(n, margin = 0.15) {
  const key = `${n}:${margin}`;
  if (cutBars.has(key)) return cutBars.get(key);
  const r = mulberry(7), cuts = [];
  for (let b = 0; b < 299; b++) {
    const z = new Array(n); let u = 0;
    for (let t = 0; t < n; t++) { if (t) u += gauss(r); z[t] = u; }
    const o = scan2(z, 0, margin);
    cuts.push(corrected(lag1(o.lineE), n) - corrected(lag1(o.e), n));
  }
  cuts.sort((p, q) => p - q);
  const bar = cuts[Math.floor(0.99 * (cuts.length - 1))];
  cutBars.set(key, bar);
  return bar;
}

/**
 * x: the series (evenly spaced). Returns { refused, reason, rhoLine, rhoTwo } or { index1, index2, f, p, bar95, rho,
 * slopes: [before, between, after], admittedByCut, cutBar, reps, n }. Slopes are per step, from the GLS fit at the knots.
 */
export function twoHingeTest(x, { margin = 0.15, reps = 499, seed = 1, rhoMax = 0.9, rhoCap = 0.95 } = {}) {
  x = Array.from(x, Number);
  const n = x.length;
  if (n < 30) return { refused: true, reason: `needs 30 or more points (got ${n})`, n };
  if (x.some((v) => !Number.isFinite(v))) throw new Error('twoHingeTest: every value must be a finite number');
  if (n < 100) rhoMax = Math.min(rhoMax, 0.7);
  const st = statistic(x, margin, rhoCap);
  const rhoLine = corrected(st.rhoLine, n), rhoTwo = corrected(st.rhoTwo, n);
  let cutBar = null, admittedByCut = false;
  if (rhoLine > rhoMax) {
    cutBar = randomWalkCutBar2(n, margin);
    admittedByCut = rhoTwo <= rhoMax && rhoLine - rhoTwo > cutBar;
    if (!admittedByCut) return { refused: true, reason: `the residuals about a straight line have lag-1 autocorrelation ${rhoLine.toFixed(2)} (bias-corrected), above ${rhoMax}, and the best two hinges cut it to ${rhoTwo.toFixed(2)}, ${rhoTwo > rhoMax ? 'still above the guard' : `a cut of ${(rhoLine - rhoTwo).toFixed(2)}, not more than random walks of this length give (99th percentile ${cutBar.toFixed(2)})`}: too close to a unit root for a level test`, rhoLine, rhoTwo, cutBar, n };
  }
  const s = st.s, [a0, b0] = s.lineG;
  // slope before the first knot: the trend coefficient once both hinges are taken out (FWL on the transformed fit)
  const h1 = pw(Float64Array.from({ length: n }, (_, t) => Math.max(0, t - s.k1)), st.rho), h2 = pw(Float64Array.from({ length: n }, (_, t) => Math.max(0, t - s.k2)), st.rho);
  const b = resid2(Float64Array.from(s.y, (v, t) => v - s.c1 * h1[t] - s.c2 * h2[t]), s.one, s.tt).g[1];
  const rhoGen = Math.max(-0.9, Math.min(admittedByCut ? rhoCap : rhoMax, rhoLine));
  const sdInnov = Math.sqrt(s.rss0 / (n - 2)), r = mulberry(seed), nulls = [];
  for (let k = 0; k < reps; k++) {
    const z = new Array(n); let u = gauss(r) * sdInnov / Math.sqrt(Math.max(1e-9, 1 - rhoGen * rhoGen));
    for (let t = 0; t < n; t++) { if (t) u = rhoGen * u + gauss(r) * sdInnov; z[t] = a0 + b0 * t + u; }
    nulls.push(statistic(z, margin, rhoCap).s.f);
  }
  nulls.sort((p, q) => p - q);
  const ge = nulls.filter((v) => v >= s.f).length;
  return {
    refused: false, index1: s.k1, index2: s.k2, f: s.f, p: (1 + ge) / (1 + reps), bar95: nulls[Math.floor(0.95 * (reps - 1))],
    rho: st.rho, rhoLine, rhoTwo, admittedByCut, cutBar, slopes: [b, b + s.c1, b + s.c1 + s.c2], reps, n,
  };
}

/** Bias-corrected lag-1 autocorrelations about the best straight line and the best OLS pair of hinges. */
export function twoHingeRhos(x, { margin = 0.15 } = {}) {
  x = Array.from(x, Number);
  const o = scan2(x, 0, margin), n = x.length;
  return { line: corrected(lag1(o.lineE), n), two: corrected(lag1(o.e), n), index1: o.k1, index2: o.k2 };
}
