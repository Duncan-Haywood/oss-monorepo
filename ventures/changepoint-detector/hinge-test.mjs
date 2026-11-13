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
// Guard: when the bias-corrected rho of the straight-line residuals is above `rhoMax` (0.9 by default) the residuals are
// too close to a unit root for a level test to be honest, and the result is { refused: true } with the reason.
//
// What it does not cover: non-Gaussian noise, dependence beyond AR(1) (long memory makes it over-reject), more than
// one hinge (it tests "one hinge against none"), and steps (a level jump can pass for a hinge). Size and power:
// eval/hinge-test-sim.mjs; real series: eval/hinge-test-real.mjs.

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

function lag1(e) {
  let num = 0, den = 0;
  for (let i = 0; i < e.length; i++) { den += e[i] * e[i]; if (i) num += e[i] * e[i - 1]; }
  return den > 0 ? num / den : 0;
}

// Prais-Winsten transform of a column
function pw(v, rho) {
  const n = v.length, out = new Float64Array(n), f = Math.sqrt(Math.max(0, 1 - rho * rho));
  out[0] = f * v[0];
  for (let t = 1; t < n; t++) out[t] = v[t] - rho * v[t - 1];
  return out;
}

// residual of v on the two columns c1, c2 (normal equations), and that residual's sum of squares
function resid2(v, c1, c2) {
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (let t = 0; t < v.length; t++) { a11 += c1[t] * c1[t]; a12 += c1[t] * c2[t]; a22 += c2[t] * c2[t]; b1 += c1[t] * v[t]; b2 += c2[t] * v[t]; }
  const det = a11 * a22 - a12 * a12, g1 = (a22 * b1 - a12 * b2) / det, g2 = (a11 * b2 - a12 * b1) / det;
  const e = new Float64Array(v.length); let ss = 0;
  for (let t = 0; t < v.length; t++) { e[t] = v[t] - g1 * c1[t] - g2 * c2[t]; ss += e[t] * e[t]; }
  return { e, ss, g: [g1, g2] };
}

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

const corrected = (rho, n) => rho + (1 + 3 * rho) / n;

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
export function hingeTest(x, { margin = 0.15, reps = 499, seed = 1, rhoMax = 0.9, rhoCap = 0.95, gen = 'line' } = {}) {
  x = Array.from(x, Number);
  const n = x.length;
  if (n < 30) return { refused: true, reason: `needs 30 or more points (got ${n})`, n };
  const st = statistic(x, margin, rhoCap);
  const rhoLineC = corrected(st.o.rhoLine, n);
  // Short series: the AR(1) estimate is too rough near a unit root (size 10.7% at n 60, rho 0.8 with the 0.9 guard,
  // eval/hinge-test-sim.out.txt), so below 100 points the guard is 0.7.
  if (n < 100) rhoMax = Math.min(rhoMax, 0.7);
  if (rhoLineC > rhoMax) {
    return { refused: true, reason: `the residuals about a straight line have lag-1 autocorrelation ${rhoLineC.toFixed(2)} (bias-corrected), above ${rhoMax}: too close to a unit root for a level test; use the test on differences (slopeBreaks)`, rhoLine: rhoLineC, n };
  }
  // GLS fit at the chosen knot, for slopes and the null's line and innovation sd
  const rho = st.rho, one = pw(new Float64Array(n).fill(1), rho), tt = pw(Float64Array.from({ length: n }, (_, t) => t), rho), y = pw(x, rho);
  const nul = resid2(y, one, tt);
  const [a0, b0] = nul.g;
  const h = pw(Float64Array.from({ length: n }, (_, t) => Math.max(0, t - st.k)), rho);
  // slope before the knot: the line coefficient after partialling the hinge out
  const alt = fit3(y, one, tt, h);
  // null generator: fitted line, AR(1) noise with the bias-corrected rho of the line's residuals and their innovation sd
  const rhoGen = Math.max(-0.9, Math.min(rhoMax, gen === 'hinge' ? corrected(st.rho, n) : rhoLineC));
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
    rho, rhoLine: rhoLineC, slopeBefore: alt[1], slopeAfter: alt[1] + alt[2], reps, n,
  };
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
