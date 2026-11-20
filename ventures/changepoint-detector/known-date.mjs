// A test at a date the user names: did the level or the slope change there? (interrupted time series)
//
// The rest of this tool searches for change dates and charges for the search. This module is for the other question:
// the law, launch or price change happened on a date written down before anyone looked at the chart, so nothing is
// searched and the test can be sharper. Segmented regression (Wagner, Soumerai, Zhang and Ross-Degnan 2002; Bernal,
// Cummins and Gasparrini 2017) with AR(1) noise:
//
//   x_t = a + b t + d 1{t >= k} + c (t - k)+ + [period - 1 seasonal dummies] + u_t,   u_t = rho u_{t-1} + e_t
//
// k is the first point after the change (x[k] is the first "after" point). rho by iterated Prais-Winsten (Prais and
// Winsten 1954), capped at 0.95. Statistics: the Wald F for d = c = 0 and the t for each. Calibration: a parametric
// bootstrap from the null fit (line plus seasons, AR(1) at the null residuals' bias-corrected rho, Kendall 1954), each
// replicate re-estimating rho, so small samples and sticky noise do not inflate the size the way the F table does.
// A 95% range for d and c is the estimate plus or minus its standard error times the bootstrap's 97.5th percentile
// of |t|. Guard: when the full model's residuals have bias-corrected rho above 0.9 (0.7 under 100 points), the series
// is refused as too close to a unit root. Pre-registration: eval/known-date-prereg-2026-11-16.md; rounds 2-5 after it.
// Shipped settings (round 5, CLI --known-date via known-date-cli.mjs): rhoGenMethod 'gated', gateRho 0.5, guard 'cut'.
//
// What it does not do: a synthetic control built from many series (CausalImpact), covariates beyond one control, non-Gaussian noise, dependence
// beyond AR(1), or say what caused the change. A small p says the pre-date line does not carry on through the date.

import { mulberry, gauss, lag1, corrected, pw, ols } from './stats-core.mjs';

// Iterated Prais-Winsten: GLS coefficients, rho and the untransformed residuals.
function gls(x, X, rhoCap, iters = 30) {
  let fit = ols(x, X);
  if (!fit) return null;
  let rho = Math.max(-0.9, Math.min(rhoCap, lag1(fit.e))), g = null;
  for (let it = 0; it < iters; it++) {
    g = ols(pw(x, rho), X.map((c) => pw(c, rho)));
    if (!g) return null;
    const u = new Float64Array(x.length);
    for (let t = 0; t < x.length; t++) { let f = 0; for (let i = 0; i < X.length; i++) f += g.beta[i] * X[i][t]; u[t] = x[t] - f; }
    const next = Math.max(-0.9, Math.min(rhoCap, lag1(u)));
    g.u = u;
    if (Math.abs(next - rho) < 1e-6) { rho = next; break; }
    rho = next;
  }
  return { ...g, rho };
}

// Design columns: intercept, time, [step, slope after], seasonal dummies (phase 0 is the reference).
function design(n, k, period, withChange) {
  const X = [new Float64Array(n).fill(1), Float64Array.from({ length: n }, (_, t) => t)];
  if (withChange) {
    X.push(Float64Array.from({ length: n }, (_, t) => (t >= k ? 1 : 0)));
    X.push(Float64Array.from({ length: n }, (_, t) => Math.max(0, t - k)));
  }
  if (period > 1) for (let ph = 1; ph < period; ph++) X.push(Float64Array.from({ length: n }, (_, t) => (t % period === ph ? 1 : 0)));
  return X;
}

// Wald F for (d, c) = 0 and their t statistics, from a GLS fit of the full model.
function stats(x, X, rhoCap) {
  const g = gls(x, X, rhoCap);
  if (!g) return null;
  const n = x.length, p = X.length, s2 = g.rss / (n - p);
  const d = g.beta[2], c = g.beta[3], vdd = g.inv[2][2] * s2, vcc = g.inv[3][3] * s2, vdc = g.inv[2][3] * s2;
  const det = vdd * vcc - vdc * vdc;
  const f = (vcc * d * d - 2 * vdc * d * c + vdd * c * c) / det / 2;
  return { f, d, c, seD: Math.sqrt(vdd), seC: Math.sqrt(vcc), tD: d / Math.sqrt(vdd), tC: c / Math.sqrt(vcc), rho: g.rho, beta: g.beta, u: g.u, df: n - p };
}

// Indirect inference for rho (Gourieroux, Monfort and Renault 1993): the rho whose GLS estimate, on this null design,
// averages the observed one. The mean estimate at each rho on a grid is simulated once per design (n, columns) with
// common random numbers and cached; the observed estimate is inverted by linear interpolation. Kendall's formula is
// for the sample mean only; with a line, seasons and a short series the downward bias is larger, and a bootstrap that
// draws at a rho biased low makes the test too eager (n 40, rho 0.8: 13.6% at p 0.05, eval/known-date-sim.out.txt).
const matchCache = new Map();
const RHO_GRID = Array.from({ length: 39 }, (_, i) => -0.9 + i * 0.05).filter((v) => v <= 0.981).concat([0.95, 0.98]).sort((a, b) => a - b);
function matchedMeans(X0, rhoCap, cache = true) {
  const n = X0[0].length, key = `${n}|${X0.length}|${rhoCap}`;
  if (cache && matchCache.has(key)) return matchCache.get(key);
  const M = 80, r = mulberry(4242), shocks = Array.from({ length: M }, () => Float64Array.from({ length: n + 1 }, () => gauss(r)));
  const means = RHO_GRID.map((rho) => {
    let s = 0;
    for (const z of shocks) {
      const x = new Float64Array(n); let u = z[n] / Math.sqrt(Math.max(1e-9, 1 - rho * rho));
      for (let t = 0; t < n; t++) { if (t) u = rho * u + z[t]; x[t] = u; }
      s += gls(x, X0, rhoCap).rho;
    }
    return s / M;
  });
  for (let i = 1; i < means.length; i++) means[i] = Math.max(means[i], means[i - 1]);
  if (cache) matchCache.set(key, means);
  return means;
}

// Round 4 (eval/known-date-prereg-round4-2026-11-16.md): an upper confidence bound for rho. For each grid rho, the
// 10th percentile of the GLS estimate over 200 simulated null series (seed 4343, cached per design); the bound is the
// grid rho at which that percentile reaches the observed estimate, so a true rho above it would give an estimate this
// low less than 10% of the time. Short sticky series read rho low, and a bootstrap drawn at the point estimate is
// then too eager (round 3: n 40 rho 0.8 date 80%, 9.4%); the test takes the larger p of the two generators.
const upperCache = new Map();
function upperQuantiles(X0, rhoCap, cache = true) {
  const n = X0[0].length, key = `${n}|${X0.length}|${rhoCap}`;
  if (cache && upperCache.has(key)) return upperCache.get(key);
  const M = 200, r = mulberry(4343), shocks = Array.from({ length: M }, () => Float64Array.from({ length: n + 1 }, () => gauss(r)));
  const q = RHO_GRID.map((rho) => {
    const est = shocks.map((z) => {
      const x = new Float64Array(n); let u = z[n] / Math.sqrt(Math.max(1e-9, 1 - rho * rho));
      for (let t = 0; t < n; t++) { if (t) u = rho * u + z[t]; x[t] = u; }
      return gls(x, X0, rhoCap).rho;
    }).sort((a, b) => a - b);
    return est[Math.floor(0.1 * (M - 1))];
  });
  for (let i = 1; i < q.length; i++) q[i] = Math.max(q[i], q[i - 1]);
  if (cache) upperCache.set(key, q);
  return q;
}
function upperRho(est, X0, rhoCap, cache = true) {
  const m = upperQuantiles(X0, rhoCap, cache), g = RHO_GRID;
  if (est <= m[0]) return g[0];
  for (let i = 1; i < m.length; i++) if (est <= m[i]) return m[i] > m[i - 1] ? g[i - 1] + (g[i] - g[i - 1]) * (est - m[i - 1]) / (m[i] - m[i - 1]) : g[i];
  return g[g.length - 1];
}
function matchedRho(est, X0, rhoCap, cache = true) {
  const m = matchedMeans(X0, rhoCap, cache), g = RHO_GRID;
  if (est <= m[0]) return g[0];
  for (let i = 1; i < m.length; i++) if (est <= m[i]) return m[i] > m[i - 1] ? g[i - 1] + (g[i] - g[i - 1]) * (est - m[i - 1]) / (m[i] - m[i - 1]) : g[i];
  return g[g.length - 1];
}

// 99th percentile of (line rho - change-model rho), both OLS and bias corrected, over 299 Gaussian random walks of
// length n with the change at k (seed 7), cached per (n, k, period). The residual rho ignores scale and the fit
// removes the drift, so the bar depends on the design only.
const cutCache = new Map();
function walkCutBar(n, k, period) {
  const key = `${n}|${k}|${period}`;
  if (cutCache.has(key)) return cutCache.get(key);
  const X0 = design(n, k, period, false), X1 = design(n, k, period, true), r = mulberry(7), cuts = [];
  for (let b = 0; b < 299; b++) {
    const x = new Float64Array(n); let u = 0;
    for (let t = 0; t < n; t++) { u += gauss(r); x[t] = u; }
    cuts.push(corrected(lag1(ols(x, X0).e), n) - corrected(lag1(ols(x, X1).e), n));
  }
  cuts.sort((a, b) => a - b);
  const bar = cuts[Math.floor(0.99 * (cuts.length - 1))];
  cutCache.set(key, bar);
  return bar;
}

// Upper tail of the F(2, m) distribution, exact: (1 + 2f/m)^(-m/2).
function fTail2(f, m) { return Math.pow(1 + 2 * f / m, -m / 2); }

/**
 * x: the series (evenly spaced). k: index of the first point after the change. Options: period (seasonal dummies),
 * reps (bootstrap), seed, rhoMax (guard), rhoCap. Returns { refused, reason } or the estimates and p-values.
 */
export function knownDateTest(x, k, { period = 0, reps = 499, seed = 1, rhoMax = 0.9, rhoCap = 0.95, minSide = 8, rhoGenMethod = 'matched', genCap = 0.95, guard = 'cut', gateRho = 0.5, cutConditional = false, cutWalkGen = false, maxDrawFactor = 200, minAdmitted = 99, control = null, controlMode = 'difference' } = {}) {
  x = Array.from(x, Number);
  const n = x.length;
  // control (comparative interrupted time series; Lopez Bernal, Cummins and Gasparrini 2018): a series the change should
  // not touch, on the same rows. 'difference' tests x - control (on logs, the log ratio), so whatever moved both series
  // at the date (a shared trend, a common wander) cancels; 'regress' adds the control as a fixed regressor with its own
  // coefficient (held fixed in the bootstrap). README "A control series", eval/known-date-prereg-control-2026-11-17.md:
  // 'difference' met the simulation bars (size 3.3-7.8%) but fired on 3 of 3 placebo dates in the seat-belt ratio, and
  // 'regress' flagged 18% under a shared slope, so neither is in the CLI or the page; this option reproduces the table.
  // A step-only rule with the placebos on the difference (README "The step alone, with a control series") met every
  // simulation bar and failed on real state tobacco pairs: 11 of 13 annual log ratios to a donor mean were refused as wanders.
  let ctl = null;
  if (control != null) {
    ctl = Array.from(control, Number);
    if (ctl.length !== n || ctl.some((v) => !Number.isFinite(v))) return { refused: true, reason: `the control series needs a number on every row (${ctl.length} values for ${n} rows)`, n, k };
    if (controlMode === 'difference') x = x.map((v, t) => v - ctl[t]);
    else if (controlMode !== 'regress') throw new Error(`controlMode "${controlMode}": use "difference" or "regress"`);
  }
  const withCtl = (X) => (ctl && controlMode === 'regress' ? [...X, Float64Array.from(ctl)] : X);
  period = period > 1 ? Math.round(period) : 0;
  const side = minSide + (period || 0);
  if (!Number.isInteger(k) || k < side || n - k < side) return { refused: true, reason: `needs at least ${side} points on each side of the date (got ${Math.max(0, k)} before and ${Math.max(0, n - k)} from it on)`, n, k };
  if (n < 100) rhoMax = Math.min(rhoMax, 0.7);
  const X1 = withCtl(design(n, k, period, true)), X0 = withCtl(design(n, k, period, false));
  const st = stats(x, X1, rhoCap);
  if (!st) return { refused: true, reason: 'the design is singular (too few points per season?)', n, k };
  const rhoFull = corrected(lag1(st.u), n);
  if (rhoFull > rhoMax) return { refused: true, reason: `the residuals about the fitted before-and-after lines have lag-1 autocorrelation ${rhoFull.toFixed(2)} (bias-corrected), above ${rhoMax}: too close to a unit root (a wander) for a level test`, rhoFull, n, k };
  const g0 = gls(x, X0, rhoCap);
  // guard 'cut' (round 3, eval/known-date-prereg-round3-2026-11-16.md): when the residuals about the plain line (and
  // seasons) are above the guard, admit only if the step and slope change at the date cut that stickiness by more than
  // 99% of random walks of this length, cut at this date, are cut. A change at the date makes a line's residuals
  // sticky; a wander is sticky about any pair of lines.
  let rhoLine = null, cutBar = null, admittedByCut = false;
  if (guard === 'cut') {
    const f0 = ols(x, X0);
    rhoLine = corrected(lag1(f0.e), n);
    if (rhoLine > rhoMax) {
      const f1 = ols(x, X1), rhoChangeOls = corrected(lag1(f1.e), n);
      cutBar = walkCutBar(n, k, period);
      admittedByCut = rhoChangeOls <= rhoMax && rhoLine - rhoChangeOls > cutBar;
      if (!admittedByCut) return { refused: true, reason: `the residuals about a straight line have lag-1 autocorrelation ${rhoLine.toFixed(2)} (bias-corrected), above ${rhoMax}, and a step and slope change at the date cut it to ${rhoChangeOls.toFixed(2)}, ${rhoChangeOls > rhoMax ? 'still above the guard' : `a cut of ${(rhoLine - rhoChangeOls).toFixed(2)}, not more than random walks of this length cut at this date give (99th percentile ${cutBar.toFixed(2)})`}: too close to a unit root (a wander) for a level test`, rhoFull, rhoLine, cutBar, n, k };
    }
  }
  // null generator(s): round 2's matched rho; with rhoGenMethod 'upper' (round 4) also the upper bound, larger p wins
  const tr = ols(pw(x, g0.rho), X0.map((c) => pw(c, g0.rho)));
  const sdInnov = Math.sqrt(tr.rss / (n - X0.length));
  const mean0 = new Float64Array(n);
  for (let t = 0; t < n; t++) { let f = 0; for (let i = 0; i < X0.length; i++) f += g0.beta[i] * X0[i][t]; mean0[t] = f; }
  const regCtl = !!ctl && controlMode === 'regress'; // the caches are keyed by the design's shape; a control column is data
  const clampGen = (v) => Math.max(-0.9, Math.min(genCap ?? rhoMax, v));
  const point = clampGen(rhoGenMethod === 'kendall' ? corrected(g0.rho, n) : matchedRho(g0.rho, X0, rhoCap, !regCtl));
  const gens = [point];
  // 'gated' (round 5, eval/known-date-prereg-round5-2026-11-16.md): the upper bound only when the plain line's residual
  // rho (bias corrected, OLS; the guard's own reading) is above gateRho, fixed in advance. Round 4 took it everywhere
  // and spent the error budget on rho 0.4 series, where 40 points put the bound far above the truth.
  const lineRho = rhoLine ?? corrected(lag1(ols(x, X0).e), n);
  const gated = rhoGenMethod === 'gated' && lineRho > gateRho;
  if (rhoGenMethod === 'upper' || gated) { const up = clampGen(upperRho(g0.rho, X0, rhoCap, !regCtl)); if (up > point + 1e-9) gens.push(up); }
  const pOf = (arr, v) => (1 + arr.filter((w) => w >= v).length) / (1 + arr.length);
  const q975 = (arr) => { const a = [...arr].sort((p, q) => p - q); return a[Math.min(a.length - 1, Math.floor(0.95 * a.length))]; };
  let p = 0, pStep = 0, pSlope = 0, qD = 0, qC = 0, m = Infinity; const pGen = [];
  // cutConditional (round 6, README "Round 6"; exploratory, not pre-registered, not shipped): a series let through only by the cut is a
  // selected one, and an unconditional bootstrap ignores the selection (round 5 diagnosis: 17 of 26 no-change series
  // admitted this way got p <= 0.05). So each null replicate must pass the same way (line rho above the guard, the cut
  // above the walk bar, the change model's rho at or under the guard, the full GLS check), and the p is the share among
  // admitted replicates: a conditional test on the selection event (Lee, Sun, Sun and Taylor 2016 in spirit, by Monte
  // Carlo). Calibrated but blind: 4.9% of 306 no-change series and 2.6% of 156 real steps flagged
  // (eval/known-date-conditional-replicate.out.txt), so the shipped CLI and page leave it off. Draws stop at reps admitted or reps * maxDrawFactor tries; fewer than minAdmitted leaves it uncalibrated.
  const conditional = cutConditional && admittedByCut;
  // cutConditional 'sticky' conditions on less: only that the plain line's residuals are above the guard, so the size
  // of the cut stays evidence (the full event left no power: a 4 sd step at rho 0.9 was found 2.5% of the time).
  const admits = (z) => {
    const rL = corrected(lag1(ols(z, X0).e), n);
    if (!(rL > rhoMax)) return false;
    if (cutConditional === 'sticky') return true;
    const rC = corrected(lag1(ols(z, X1).e), n);
    return rC <= rhoMax && rL - rC > cutBar;
  };
  // cutWalkGen: a third generator, a random walk (rho 1), so the conditional p is the largest over AR(1) at the point
  // rho, at the upper bound, and a unit root. F and the guard ignore scale and the line, so the walk's start and step
  // size do not matter. Exploratory run (eval/known-date-conditional-explore.out.txt): walks admitted by the cut were
  // still rejected 11-18% with the AR(1) generators alone, because a walk is stickier than any rho 0.95 null.
  if (conditional && cutWalkGen) gens.push(1);
  let draws = 0, admittedReps = Infinity;
  gens.forEach((rhoGen, gi) => {
    const r = mulberry(seed + 7919 * gi), fs = [], tds = [], tcs = [];
    const tries = conditional ? reps * maxDrawFactor : reps;
    for (let b = 0; b < tries && fs.length < reps; b++) {
      const z = new Float64Array(n); let u = rhoGen >= 1 ? 0 : gauss(r) * sdInnov / Math.sqrt(Math.max(1e-9, 1 - rhoGen * rhoGen));
      for (let t = 0; t < n; t++) { if (t) u = rhoGen * u + gauss(r) * sdInnov; z[t] = mean0[t] + u; }
      if (conditional) { draws++; if (!admits(z)) continue; }
      const s = stats(z, X1, rhoCap);
      if (!s) continue;
      if (conditional && cutConditional !== 'sticky' && corrected(lag1(s.u), n) > rhoMax) continue;
      fs.push(s.f); tds.push(Math.abs(s.tD)); tcs.push(Math.abs(s.tC));
    }
    if (conditional) admittedReps = Math.min(admittedReps, fs.length);
    m = Math.min(m, fs.length);
    pGen.push(pOf(fs, st.f));
    p = Math.max(p, pOf(fs, st.f)); pStep = Math.max(pStep, pOf(tds, Math.abs(st.tD))); pSlope = Math.max(pSlope, pOf(tcs, Math.abs(st.tC)));
    qD = Math.max(qD, q975(tds)); qC = Math.max(qC, q975(tcs));
  });
  const post = n - k, meanAfter = (post - 1) / 2;
  return {
    refused: false, n, k, period, rho: st.rho, rhoFull, reps: m, guard, rhoGen: gens, pGen, rhoGenMethod, lineRho, ...(rhoGenMethod === 'gated' ? { gateRho, gated } : {}), ...(guard === 'cut' ? { rhoLine, admittedByCut, cutBar } : {}),
    ...(ctl ? { controlMode, ...(regCtl ? { controlCoef: st.beta[X1.length - 1] } : {}) } : {}),
    ...(conditional ? { conditional: true, draws, admittedReps, calibratedConditional: admittedReps >= minAdmitted } : {}),
    step: st.d, stepSe: st.seD, stepRange95: [st.d - qD * st.seD, st.d + qD * st.seD], pStep,
    slopeBefore: st.beta[1], slopeChange: st.c, slopeChangeSe: st.seC, slopeChangeRange95: [st.c - qC * st.seC, st.c + qC * st.seC], pSlope,
    f: st.f, p, pTable: fTail2(st.f, st.df),
    effectAverage: st.d + st.c * meanAfter, effectAtEnd: st.d + st.c * (post - 1),
  };
}

/** The statistic and the F-table p alone (no bootstrap), for evaluation scripts. */
export function knownDateStatistic(x, k, { period = 0, rhoCap = 0.95 } = {}) {
  x = Array.from(x, Number);
  const s = stats(x, design(x.length, k, period > 1 ? Math.round(period) : 0, true), rhoCap);
  return s && { ...s, pTable: fTail2(s.f, s.df) };
}

export const KNOWN_DATE_PAPERS = [
  'Wagner, A. K., Soumerai, S. B., Zhang, F. & Ross-Degnan, D. (2002). Segmented regression analysis of interrupted time series studies in medication use research. J. Clin. Pharm. Ther. 27(4), 299-309. doi:10.1046/j.1365-2710.2002.00430.x',
  'Bernal, J. L., Cummins, S. & Gasparrini, A. (2017). Interrupted time series regression for the evaluation of public health interventions: a tutorial. Int. J. Epidemiol. 46(1), 348-355. doi:10.1093/ije/dyw098',
  'Prais, S. J. & Winsten, C. B. (1954). Trend estimators and serial correlation. Cowles Commission Discussion Paper 383.',
];


/**
 * In-time placebos (README "In-time placebos"; eval/known-date-prereg-placebo-2026-11-17.md): the same test, on the
 * points before the date only, at up to `count` dates spread evenly through that before-period (each needs minSide +
 * period points on both sides inside it). The real change cannot touch these, so when they fire the line before the
 * date is not a stable baseline, and a small p at the named date may be that curve rather than the event (Lopez Bernal,
 * Cummins and Gasparrini 2017, "falsification"). Returns { dates: [{ k, refused, p, pStep, pSlope }], tested, fired,
 * warn, minFired }; warn when at least minFired of the tested dates have p <= alpha.
 */
export function placeboCheck(x, k, { period = 0, count = 3, reps = 199, seed = 1, minSide = 8, alpha = 0.05, minFired = 2, test = {} } = {}) {
  x = Array.from(x, Number);
  period = period > 1 ? Math.round(period) : 0;
  const side = minSide + period, pre = x.slice(0, k), lo = side, hi = k - side;
  const ks = [];
  if (hi >= lo) {
    for (let i = 1; i <= count; i++) {
      const j = Math.round(lo + (hi - lo) * i / (count + 1));
      if (!ks.includes(j)) ks.push(j);
    }
  }
  const dates = ks.map((j, i) => {
    const h = knownDateTest(pre, j, { period, reps, seed: seed + 104729 * (i + 1), minSide, rhoGenMethod: 'gated', gateRho: 0.5, ...test });
    return h.refused ? { k: j, refused: true, reason: h.reason } : { k: j, refused: false, p: h.p, pStep: h.pStep, pSlope: h.pSlope, admittedByCut: h.admittedByCut };
  });
  const tested = dates.filter((d) => !d.refused).length, fired = dates.filter((d) => !d.refused && d.p <= alpha).length;
  return { before: k, dates, tested, fired, alpha, minFired, warn: tested >= minFired && fired >= minFired };
}
