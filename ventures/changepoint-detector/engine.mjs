// Changepoint detection for a numeric series: when did its level or its
// volatility change, and how sure can we be?
//
// Two methods from the literature, run side by side:
//
//  * PELT (Killick, Fearnhead & Eckley 2012): the exact minimum of
//    -2 log-likelihood + penalty x (number of changes) over every possible
//    segmentation, found in about linear time by pruning candidates that can
//    never be optimal. Gives the segmentation.
//  * Bayesian online changepoint detection (Adams & MacKay 2007): a posterior
//    over the "run length" (time since the last change) updated one point at a
//    time, with a Normal-Inverse-Gamma prior on each segment's mean and
//    variance. Gives a probability for each candidate change.
//
// Pure functions, no DOM, no network, no randomness: the same input always
// gives the same output, in the browser, the CLI and `platform/agents/tools.mjs`.

import { NILE_CSV } from './example-data.mjs';

export const PAPERS = [
  {
    authors: 'Ryan Prescott Adams and David J. C. MacKay',
    title: 'Bayesian Online Changepoint Detection',
    venue: 'arXiv preprint arXiv:0710.3742',
    year: 2007,
    url: 'https://arxiv.org/abs/0710.3742',
    implemented:
      'The run-length recursion (Algorithm 1) with a constant hazard 1/lambda and a Normal-Inverse-Gamma conjugate model, so each segment has an unknown mean and variance and the predictive is Student-t.',
    deviations:
      'The prior is centred on the data (median and robust variance), an empirical-Bayes choice the paper leaves open. Run lengths whose posterior mass falls below 1e-10 are pruned. Because P(r_t = 0) equals the hazard under a constant hazard, a change is reported as the probability, seen `lag` points later, that the run started at that point.',
    bibtex: `@article{adams2007bayesian,
  title   = {Bayesian Online Changepoint Detection},
  author  = {Adams, Ryan Prescott and MacKay, David J. C.},
  journal = {arXiv preprint arXiv:0710.3742},
  year    = {2007}
}`,
  },
  {
    authors: 'Rebecca Killick, Paul Fearnhead and Idris A. Eckley',
    title: 'Optimal Detection of Changepoints With a Linear Computational Cost',
    venue: 'Journal of the American Statistical Association 107(500): 1590-1598',
    year: 2012,
    url: 'https://arxiv.org/abs/1101.1438',
    doi: '10.1080/01621459.2012.737745',
    implemented:
      'PELT with Gaussian -2 log-likelihood costs for a change in mean (variance estimated once, robustly) or in mean and variance, and K = 0 in the pruning rule, which is valid for these costs.',
    deviations:
      'The known variance of the mean-only model is estimated from the median absolute difference of successive points, so a few level shifts do not inflate it.',
    bibtex: `@article{killick2012optimal,
  title   = {Optimal Detection of Changepoints With a Linear Computational Cost},
  author  = {Killick, Rebecca and Fearnhead, Paul and Eckley, Idris A.},
  journal = {Journal of the American Statistical Association},
  volume  = {107},
  number  = {500},
  pages   = {1590--1598},
  year    = {2012},
  doi     = {10.1080/01621459.2012.737745}
}`,
  },
];

export const DEFAULTS = {
  // CSV text: one numeric column, or a label/time column and a value column.
  csv: NILE_CSV,
  // Value column by header name or 0-based index; null picks the last numeric column.
  column: null,
  // Label column (years, dates) by name or index; null uses the first column if it is not the value column.
  labelColumn: null,
  // 'mean': change in level only. 'meanvar': change in level and/or volatility.
  // 'poisson': change in the rate of a count series (whole numbers, 0 or more).
  // 'trend': change in level or slope, a straight line per segment (a series that climbs or falls).
  model: 'mean',
  // 'bic', 'aic', 'hannan-quinn', or a number (the cost of one extra change).
  penalty: 'bic',
  // Shortest segment PELT may return; null means 2 for 'mean' and 5 for
  // 'meanvar', where a variance fitted to two or three points is so unreliable
  // that its likelihood gain alone would justify a change.
  minSegment: null,
  // BOCPD prior expected run length (1 / hazard), in points.
  hazardLambda: 100,
  // BOCPD looks this many points past a candidate before scoring it.
  lag: 5,
  // BOCPD reports candidates whose probability reaches this.
  threshold: 0.5,
  // Seasonal period in points (12 for monthly data with a yearly cycle, 7 for
  // daily data with a weekly one); 0 or null for none. The per-phase median of
  // the detrended series is subtracted before detection ('mean' and 'meanvar').
  period: 0,
  // true: let the seasonal shape drift (running median across cycles) instead of one fixed profile.
  drift: false,
  // true: widen the noise scale of the 'mean' model for lag-1 autocorrelation
  // so a drifting, sticky series is not cut into many false segments. 'joint': fit the
  // segment means and rho together on the exact AR(1) likelihood (more power on small shifts).
  ar1: false,
  // true: fit one linear trend under the steps and remove it, so a slow ramp is not read as many
  // small level changes (mean and meanvar models; applied after the seasonal adjustment).
  // 'bend': also allow the slope to change once (knot and second slope chosen by BIC).
  // 'bends': up to three slope changes, added greedily while BIC keeps falling.
  trend: false,
  // fraction of the series kept clear at each end when searching for slope-change knots (default 0.1, knots at 10 to 90%; 0.2 was the default before 2026-10-20).
  knotMargin: 0.1,
};

// ---------------------------------------------------------------- pre-steps

/**
 * Classical seasonal adjustment with medians. Detrend with a centred moving
 * average of one period, take the median of each phase, centre the profile at
 * zero and subtract it. The median keeps a level shift (which sits in the
 * detrended series only near the shift) out of the profile.
 * Returns { adjusted, profile } or throws when there are fewer than two cycles.
 */
export function seasonalAdjust(x, period, opts = {}) {
  const m = Math.floor(period);
  if (!(m >= 2)) throw new Error('The seasonal period must be a whole number of at least 2.');
  if (x.length < 2 * m) throw new Error(`A seasonal period of ${m} needs at least ${2 * m} points (two full cycles); got ${x.length}.`);
  const n = x.length;
  // centred moving average of length m (2 x m for even m)
  const trend = new Array(n).fill(null);
  const half = Math.floor(m / 2);
  for (let t = half; t < n - half; t++) {
    let sum = 0;
    if (m % 2) { for (let k = -half; k <= half; k++) sum += x[t + k]; trend[t] = sum / m; }
    else { sum = 0.5 * x[t - half] + 0.5 * x[t + half]; for (let k = -half + 1; k < half; k++) sum += x[t + k]; trend[t] = sum / m; }
  }
  if (opts.multiplicative) {
    // ratio to the moving average: the season is a factor (centred at 1), so a season that grows with the level is removed whole
    if (opts.drift) throw new Error('A multiplicative season cannot also drift: leave out one of the two.');
    if (x.some((v) => !(v > 0))) throw new Error('A multiplicative season needs a series of positive values.');
    const ratios = Array.from({ length: m }, () => []);
    for (let t = 0; t < n; t++) if (trend[t] !== null && trend[t] > 0) ratios[t % m].push(x[t] / trend[t]);
    const rawF = ratios.map((a) => (a.length ? median(a) : 1));
    const mean = rawF.reduce((s, v) => s + v, 0) / m;
    const factors = rawF.map((v) => v / mean);
    return { adjusted: x.map((v, t) => v / factors[t % m]), profile: factors, multiplicative: true };
  }
  const phases = Array.from({ length: m }, () => []);
  for (let t = 0; t < n; t++) if (trend[t] !== null) phases[t % m].push(x[t] - trend[t]);
  const raw = phases.map((a) => (a.length ? median(a) : 0));
  const centre = raw.reduce((s, v) => s + v, 0) / m;
  const profile = raw.map((v) => v - centre);
  if (opts.drift) return driftAdjust(x, m, trend, profile);
  return { adjusted: x.map((v, t) => v - profile[t % m]), profile };
}

/**
 * Quasi-Poisson dispersion of counts: how many times the variance of a block total exceeds its mean.
 * Blocks of b points (a whole number of seasonal cycles, at least 10 points) are compared with their
 * neighbours: D = S_i - (S_(i-1) + S_(i+1)) / 2 has variance phi (S_i + (S_(i-1) + S_(i+1)) / 4) under a Poisson
 * with dispersion phi, and the second difference cancels a straight trend in the totals (first differences
 * counted growth as noise: 6.4 for plain Poisson counts on a bend). The median of D^2 over that variance is
 * 0.455 phi (chi-square, one degree of freedom), so a rate step, which spoils two blocks, is ignored, and blocks
 * long compared with the noise's memory make it the long-run dispersion, so sticky counts count.
 * Returns 1 when there are fewer than 9 blocks; never below 1.
 */
export function countDispersion(x, period = 0) {
  const p = Math.max(1, Math.floor(period) || 1);
  const b = p * Math.ceil(10 / p);
  const m = Math.floor(x.length / b);
  if (m < 9) return 1;
  const S = [];
  for (let i = 0; i < m; i++) { let a = 0; for (let t = i * b; t < (i + 1) * b; t++) a += x[t]; S.push(a); }
  const d = [];
  for (let i = 1; i + 1 < m; i++) {
    const v = S[i] + (S[i - 1] + S[i + 1]) / 4;
    if (v > 0) d.push((S[i] - (S[i - 1] + S[i + 1]) / 2) ** 2 / v);
  }
  if (d.length < 7) return 1;
  return Math.max(1, median(d) / 0.4549);
}

// skip: point indices (known holidays) held out of the seasonal factors, so a holiday that always lands on one phase does not leak into it
// extra: a per-point exposure (fitted holiday factors) the PELT pass multiplies in, so the steps are not asked to explain holiday dips
export function poissonSeasonal(x, period, { penalty = 'bic', minSegment = 2, passes = 8, skip = null, extra = null } = {}) {
  const m = Math.floor(period);
  if (!(m >= 2)) throw new Error('The seasonal period must be a whole number of at least 2.');
  const n = x.length;
  if (n < 2 * m) throw new Error(`A seasonal period of ${m} needs at least ${2 * m} points (two full cycles); got ${n}.`);
  const FLOOR = 0.01;
  const normalise = (f) => { const c = f.reduce((a, v) => a + v, 0) / m; return f.map((v) => Math.max(FLOOR, v / c)); };
  const level = new Array(n).fill(null);
  const half = Math.floor(m / 2);
  for (let t = half; t < n - half; t++) {
    let sum = 0;
    if (m % 2) { for (let k = -half; k <= half; k++) sum += x[t + k]; }
    else { sum = 0.5 * x[t - half] + 0.5 * x[t + half]; for (let k = -half + 1; k < half; k++) sum += x[t + k]; }
    level[t] = sum / m;
  }
  const num = new Array(m).fill(0), den = new Array(m).fill(0);
  for (let t = 0; t < n; t++) if (level[t] !== null && !(skip && skip.has(t))) { num[t % m] += x[t]; den[t % m] += level[t]; }
  let f = normalise(num.map((v, p) => (den[p] > 0 ? v / den[p] : 1)));
  let done = 0;
  for (; done < passes; done++) {
    const e = Array.from({ length: n }, (_, t) => f[t % m] * (extra ? extra[t] : 1));
    const { changepoints } = pelt(x, { model: 'poisson', penalty, minSegment, exposure: e });
    const bounds = [0, ...changepoints, n];
    const pnum = new Array(m).fill(0), pden = new Array(m).fill(0);
    for (let i = 0; i + 1 < bounds.length; i++) {
      let a = 0, E = 0;
      for (let t = bounds[i]; t < bounds[i + 1]; t++) { a += x[t]; E += e[t]; }
      const rate = E > 0 ? a / E : 0;
      for (let t = bounds[i]; t < bounds[i + 1]; t++) if (!(skip && skip.has(t))) { pnum[t % m] += x[t]; pden[t % m] += rate; }
    }
    const g = normalise(pnum.map((v, p) => (pden[p] > 0 ? v / pden[p] : f[p])));
    const move = Math.max(...g.map((v, p) => Math.abs(v - f[p])));
    f = g;
    if (move < 1e-4) { done++; break; }
  }
  return { factors: f, exposure: Array.from({ length: n }, (_, t) => f[t % m]), passes: done };
}

/**
 * Known holidays for counts: one multiplicative factor on the rate at the given
 * points (indices into the series), fitted jointly with the steps. Alternates PELT under the
 * current exposure (base x factor at holidays) with the ratio of the holiday
 * counts to what the segment rates predict there. `base` carries a seasonal or
 * other exposure; the result composes with it. Returns { factor, exposure, passes }.
 */
export function poissonHolidays(x, holidays, { base = null, penalty = 'bic', minSegment = 2, passes = 10, kinds = null } = {}) {
  const n = x.length;
  // kinds: a name per entry of `holidays` (same order); each kind gets its own factor. Without it all share one.
  const group = new Map();  // index -> kind (the first kind given for an index wins)
  holidays.forEach((i, j) => { if (Number.isInteger(i) && i >= 0 && i < n && !group.has(i)) group.set(i, kinds ? String(kinds[j]) : ''); });
  const hol = [...group.keys()].sort((a, b) => a - b);
  if (hol.length < 2) throw new Error('Holidays need at least 2 points inside the series to fit a factor; got ' + hol.length + '.');
  if (hol.length > n / 2) throw new Error('More than half the points are holidays: give only the unusual days.');
  const names = [...new Set(hol.map((i) => group.get(i)))];
  for (const k of names) {
    const c = hol.filter((i) => group.get(i) === k).length;
    if (c < 2) throw new Error(`Holiday kind "${k}" has ${c} point inside the series; each kind needs at least 2 to fit a factor.`);
  }
  const gi = new Array(n).fill(-1);
  for (const i of hol) gi[i] = names.indexOf(group.get(i));
  const b = (t) => (base ? base[t] : 1);
  const factors = new Array(names.length).fill(1);
  let done = 0;
  const expo = () => Array.from({ length: n }, (_, t) => b(t) * (gi[t] >= 0 ? factors[gi[t]] : 1));
  for (; done < passes; done++) {
    const e = expo();
    const { changepoints } = pelt(x, { model: 'poisson', penalty, minSegment, exposure: e });
    const bounds = [0, ...changepoints, n];
    const obs = new Array(names.length).fill(0), exp = new Array(names.length).fill(0);
    for (let i = 0; i + 1 < bounds.length; i++) {
      let a = 0, E = 0;
      for (let t = bounds[i]; t < bounds[i + 1]; t++) { a += x[t]; E += e[t]; }
      const rate = E > 0 ? a / E : 0;
      for (let t = bounds[i]; t < bounds[i + 1]; t++) if (gi[t] >= 0) { obs[gi[t]] += x[t]; exp[gi[t]] += rate * b(t); }
    }
    let move = 0;
    for (let k = 0; k < names.length; k++) {
      const next = exp[k] > 0 ? Math.max(0.01, Math.min(100, obs[k] / exp[k])) : factors[k];
      move = Math.max(move, Math.abs(Math.log(next / factors[k])));
      factors[k] = next;
    }
    if (move < 1e-4) { done++; break; }
  }
  const byKind = kinds ? names.map((name, k) => ({ kind: name, count: hol.filter((i) => gi[i] === k).length, factor: factors[k] })) : null;
  // factor: the single factor, or the count-weighted geometric mean when kinds differ
  const factor = names.length === 1 ? factors[0] : Math.exp(factors.reduce((a, f, k) => a + Math.log(f) * hol.filter((i) => gi[i] === k).length, 0) / hol.length);
  return { factor, exposure: expo(), passes: done, count: hol.length, ...(byKind ? { kinds: byKind } : {}) };
}

/** Solve H z = b for a small symmetric positive-definite H by Gaussian elimination; null when it is (near) singular. */
function solveSym(H, b) {
  const m = b.length, A = H.map((row, i) => [...row, b[i]]);
  const scale = Math.max(...H.map((row, i) => row[i]));
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (!(Math.abs(A[p][c]) > 1e-12 * scale)) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < m; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= m; k++) A[r][k] -= f * A[c][k]; }
  }
  const z = new Array(m).fill(0);
  for (let r = m - 1; r >= 0; r--) { let a = A[r][m]; for (let k = r + 1; k < m; k++) a -= A[r][k] * z[k]; z[r] = a / A[r][r]; }
  return z;
}

/**
 * A common log-linear trend under the steps for counts: the rate at point t is
 * (segment rate) x base[t] x exp(g u[t]), with u running from -0.5 to 0.5 over
 * the series, so g is the total log change across it. The growth factor is an
 * exposure in the Poisson likelihood, like the seasonal factors, and composes
 * with them through `base`. Start from a Theil-Sen-style slope of log counts
 * (median over lag-n/4 differences, which a step touches in only part of the
 * pairs), then alternate: PELT under the current exposures, then a Newton step
 * on g with each segment's rate profiled out, until g moves less than 1e-5.
 * Returns { g, exposure, passes }.
 */
// Widening of the growth-change range: at 1 it held the planted bend on ~86% of seeded Poisson series; 1.15 gives ~95% (README, 2026-10-22).
const RANGE_TEMPER = 1.15;
// Clumpy counts scored with the NB cost: 1.15 held the planted bend on 145 of 161 found bends (90%), 1.4 on 153 (95%), 1.7 on 157 (README, 2026-10-26).
const RANGE_TEMPER_NB = 1.4;
// Measured coverage (README, 2026-10-26 and 27): 94% over 277 found bends on tuning-free seeds, 82% (65 of 79) where the slope bump is steep (0.04).
const GROWTH_RANGE_NB_NOTE = 'Clumpy-count ranges held the true bend on about 94% of simulated series, but only about 82% where the growth change is steep (and the range narrow): treat a narrow range as optimistic.';
export function poissonTrend(x, { base = null, penalty = 'bic', minSegment = 2, passes = 12, bend = false, knotMargin = 0.1, scale = 1, nbSize = 0, diag = null } = {}) {
  const n = x.length;
  const nb = nbSize > 0 && Number.isFinite(nbSize);
  // nb: PELT and the cost that ranks knots use the negative-binomial likelihood (size nbSize); the growth steps stay Poisson score steps (a quasi-likelihood)
  const peltFit = (e, poisson = false) => pelt(x, nb && !poisson ? { model: 'negbin', penalty, minSegment, size: nbSize, exposure: e } : { model: 'poisson', penalty, minSegment, exposure: e });
  const u = Array.from({ length: n }, (_, t) => (t - (n - 1) / 2) / Math.max(1, n - 1));
  const b = (t) => (base ? base[t] : 1);
  const y = x.map((v, t) => Math.log((v + 0.5) / b(t)));
  const k = Math.max(1, Math.floor(n / 4));
  const slopes = [];
  for (let t = 0; t + k < n; t++) slopes.push((y[t + k] - y[t]) / (u[t + k] - u[t]));
  const GMAX = 20;  // a factor of e^20 across the series is not a trend any more
  const clamp = (v) => Math.max(-GMAX, Math.min(GMAX, v));
  const g0 = clamp(slopes.length ? median(slopes) : 0);
  const expo = (phi, g) => Array.from({ length: n }, (_, t) => b(t) * Math.exp(g.reduce((a, gj, j) => a + gj * phi[j][t], 0)));
  // Alternate PELT under the current exposures with a Newton step on all growth terms (phi: one basis row each).
  const fit = (phi, gStart, poisson = false) => {
    let g = gStart.slice(), done = 0, last = null, converged = false;
    const m = phi.length;
    for (; done < passes; done++) {
      const e = expo(phi, g);
      const r = peltFit(e, poisson);
      last = { cost: r.cost, g: g.slice() };
      const bounds = [0, ...r.changepoints, n];
      // Profile score and curvature: sum x phi_j - sum_seg A mean_w(phi_j); sum_seg A cov_w(phi_i, phi_j), w = e.
      const score = new Array(m).fill(0);
      const H = Array.from({ length: m }, () => new Array(m).fill(0));
      for (let i = 0; i + 1 < bounds.length; i++) {
        let A = 0, W = 0;
        const Wp = new Array(m).fill(0), Wpp = Array.from({ length: m }, () => new Array(m).fill(0));
        for (let t = bounds[i]; t < bounds[i + 1]; t++) {
          const w = e[t];
          A += x[t]; W += w;
          for (let p = 0; p < m; p++) { Wp[p] += w * phi[p][t]; score[p] += x[t] * phi[p][t]; for (let q = p; q < m; q++) Wpp[p][q] += w * phi[p][t] * phi[q][t]; }
        }
        if (W > 0) for (let p = 0; p < m; p++) {
          score[p] -= A * Wp[p] / W;
          for (let q = p; q < m; q++) { const c = A * (Wpp[p][q] / W - (Wp[p] / W) * (Wp[q] / W)); H[p][q] += c; if (q !== p) H[q][p] += c; }
        }
      }
      if (!(H[0][0] > 1e-12)) break;
      const step = solveSym(H, score);
      if (!step) break;
      const big = Math.max(...step.map(Math.abs));
      const cap = big > 2 ? 2 / big : 1;
      g = g.map((v, j) => clamp(v + step[j] * cap));
      if (big < 1e-5) { done++; converged = true; break; }
    }
    // PELT's cost leaves out sum x log(exposure), which is constant for a fixed exposure but not across fits; add it back.
    // (the negative-binomial cost keeps it, since the mean enters through lam e[t])
    const linAt = (gv) => nb && !poisson ? 0 : x.reduce((a, v, t) => a + v * gv.reduce((c, gj, j) => c + gj * phi[j][t], 0), 0);
    // A converged Newton step (under 1e-5) moved the exposures too little to change the cost at the profiled optimum, so the last pass's PELT cost stands in for another run.
    if (converged) return { g, phi, cost: last.cost - 2 * linAt(last.g), passes: done };
    return { g, phi, cost: peltFit(expo(phi, g), poisson).cost - 2 * linAt(g), passes: done };
  };
  const plain = fit([u], [g0]);
  const out = (f, extra = {}) => ({ g: f.g[0], exposure: expo(f.phi, f.g), passes: f.passes, ...extra });
  const maxBends = bend === true ? 1 : bend ? Math.min(3, Math.floor(Number(bend)) || 0) : 0;
  if (!maxBends) return out(plain);
  // Bends: the log rate follows g u until the first knot and gains h_j (t - knot_j) after each knot. Scan a grid of knots, keep the best by
  // penalised cost, and accept it only if it beats the fit without it by 3 log n (the knot and the slope change, with the scan over knots charged as another).
  // With more than one bend allowed the search is greedy: each round adds the one knot that lowers the cost most, while it still clears 3 log n.
  const margin = Math.min(0.4, Math.max(0.05, Number(knotMargin) || 0.1));
  const lo = Math.max(2, Math.ceil(margin * n)), hi = Math.min(n - 3, Math.floor((1 - margin) * n));
  const step = Math.max(1, Math.round(n / 40));
  const hinge = (kt) => u.map((v, t) => Math.max(0, t - kt) / Math.max(1, n - 1));
  const side = (a, z) => {  // Theil-Sen-style slope of log counts over [a, z), per series length
    const kk = Math.max(1, Math.floor((z - a) / 4)), sl = [];
    for (let t = a; t + kk < z; t++) sl.push((y[t + kk] - y[t]) / (u[t + kk] - u[t]));
    return sl.length ? clamp(median(sl)) : plain.g[0];
  };
  const NB_FINALISTS = 8;
  let cur = plain, knotsFound = [];
  while (knotsFound.length < maxBends) {
    let best = null;
    // Under the negative binomial a fit costs ~30x a Poisson one, so the grid is ranked with the Poisson cost and only the best
    // few knots are fitted with the negative binomial (measured in README "Speed": most of the power is kept, not all).
    const scanned = [];
    const tryKnot = (kt, poisson = false) => {
      if (knotsFound.some((k) => Math.abs(k - kt) < Math.max(minSegment, 2 * step))) return;
      let f;
      if (!knotsFound.length) {
        const s1 = side(0, kt + 1), s2 = side(kt, n);
        f = fit([u, hinge(kt)], [s1, s2 - s1], poisson);
      } else f = fit([...cur.phi, hinge(kt)], [...cur.g, 0], poisson);
      f.knot = kt;
      if (poisson) scanned.push(f);
      else if (!best || f.cost < best.cost) best = f;
    };
    const quick = nb && n >= 80;
    for (let kt = lo; kt <= hi; kt += step) tryKnot(kt, quick);
    if (quick) {
      if (!scanned.length) break;
      // Finalists are the best grid knots, spread over the series; adding the winner's fine neighbours crowded them out and placed knots worse (README "Speed").
      scanned.sort((a, b) => a.cost - b.cost);
      for (const f of scanned.slice(0, NB_FINALISTS)) tryKnot(f.knot);
      if (!best) break;
    } else {
      if (!best) break;
      for (let kt = Math.max(lo, best.knot - step + 1); kt < Math.min(hi, best.knot + step); kt++) if (kt !== best.knot) tryKnot(kt);
    }
    // diag (an array, optional): the cost drop of each round's best knot in units of log n, for measuring a sharper accept rule
    if (diag) diag.push({ round: knotsFound.length, knot: best.knot, drop: (cur.cost - best.cost) / Math.log(n) });
    if (!(best.cost + 3 * Math.log(n) * scale < cur.cost)) break;
    knotsFound = [...knotsFound, best.knot];
    cur = best;
  }
  if (!knotsFound.length) return out(plain);
  // knots in time order, with the growth rate after each (the slope is cumulative in the hinge terms)
  const order = knotsFound.map((k, j) => ({ k, h: cur.g[j + 1] })).sort((p, q) => p.k - q.k);
  const rates = [cur.g[0]];
  for (const o of order) rates.push(rates[rates.length - 1] + o.h);
  // Where exactly does the growth rate change? As for the Gaussian trend: slide each knot over its allowed span with the others held
  // fixed, refit, weight each position by exp(-(cost - min cost) / 2 / scale) (the cost is -2 log-likelihood; scale is the
  // overdispersion factor, so a noisier series gets a wider range), keep the most likely positions holding 95% of the weight.
  // Stride about n / 80.
  const rangeGap = Math.max(minSegment, 2 * step), rstride = Math.max(1, Math.round(n / 80));
  // The range is scored with the negative-binomial cost itself (measured 2026-10-23: 90% coverage with ranges 30-45% narrower than widening a Poisson-scored range by 1 + mean / size).
  const rangeScale = Math.max(1, scale);
  const phis = knotsFound.map((k) => hinge(k));
  const ranges = knotsFound.map((k, j) => {
    const others = knotsFound.filter((_, i) => i !== j);
    const rlo = Math.max(2, lo, ...others.filter((v) => v < k).map((v) => v + rangeGap));
    const rhi = Math.min(n - 3, hi, ...others.filter((v) => v > k).map((v) => v - rangeGap));
    const ks = [], cs = [];
    for (let q = rlo; q <= rhi; q += rstride) {
      const f = fit([u, ...phis.map((ph, i) => (i === j ? hinge(q) : ph))], cur.g);
      ks.push(q); cs.push(f.cost);
    }
    if (!ks.includes(k)) { ks.push(k); cs.push(fit([u, ...phis], cur.g).cost); }
    const m = Math.min(...cs);
    const w = cs.map((v) => Math.exp(-(v - m) / 2 / (rangeScale * (nb ? RANGE_TEMPER_NB : RANGE_TEMPER))));
    const tot = w.reduce((a, v) => a + v, 0);
    let acc = 0, from = Infinity, to = -Infinity;
    for (const i of w.map((_, i) => i).sort((a, b) => w[b] - w[a])) { acc += w[i] / tot; from = Math.min(from, ks[i]); to = Math.max(to, ks[i]); if (acc >= 0.95) break; }
    return { knot: k, from, to, level: 0.95 };
  }).sort((p, q) => p.knot - q.knot);
  return out(cur, { knot: order[0].k, slopeAfter: rates[1], knots: order.map((o) => o.k), rates, knotRanges: ranges });
}

/**
 * Drifting seasonal shape: each phase's detrended values are smoothed across
 * cycles: a Theil-Sen line through up to 9 cycles on series of 10 or more cycles,
 * a running median of 5 (3 when there are fewer than 6) on shorter ones, so a cycle whose amplitude grows or whose peak moves is followed instead
 * of averaged away. Each cycle's profile is re-centred at zero. Returns the
 * mean profile too, for display.
 */
function driftAdjust(x, m, trend0, profile) {
  let trend = trend0;
  const n = x.length;
  const cycles = Math.ceil(n / m);
  const w = cycles >= 10 ? 4 : cycles >= 6 ? 2 : 1; // half-width in cycles
  // the moving average is missing half a period at each end: hold its nearest value so the end cycles keep their own shape
  const first = trend.findIndex((v) => v !== null), last = n - 1 - [...trend].reverse().findIndex((v) => v !== null);
  trend = trend.map((v, t) => (v !== null ? v : trend[t < first ? first : last]));
  const d = Array.from({ length: m }, (_, p) => {
    const col = [];
    for (let c = 0; c < cycles; c++) { const t = c * m + p; col.push(t < n && trend[t] !== null ? x[t] - trend[t] : null); }
    return col.map((_, c) => {
      const win = [];
      for (let k = Math.max(0, c - w); k <= Math.min(cycles - 1, c + w); k++) if (col[k] !== null) win.push([k, col[k]]);
      if (!win.length) return profile[p];
      if (win.length < 5) return median(win.map((e) => e[1]));
      // a robust line through the window, read at this cycle: a plain median lags a growing cycle at the ends
      const sl = [];
      for (let i = 0; i < win.length; i++) for (let j = i + 1; j < win.length; j++) sl.push((win[j][1] - win[i][1]) / (win[j][0] - win[i][0]));
      const slope = median(sl);
      return median(win.map((e) => e[1] - slope * (e[0] - c)));
    });
  });
  const adjusted = new Array(n);
  for (let c = 0; c < cycles; c++) {
    let centre = 0;
    for (let p = 0; p < m; p++) centre += d[p][c];
    centre /= m;
    for (let p = 0; p < m; p++) { const t = c * m + p; if (t < n) adjusted[t] = x[t] - (d[p][c] - centre); }
  }
  return { adjusted, profile };
}

/**
 * Two knots of the continuous piecewise-linear least-squares line, searched at every point in [lo, hi] at least gap apart.
 * Every normal-equation entry for the basis [1, t, (t-a)+, (t-b)+] is a closed form in prefix sums of 1, t, t^2, x and t*x, so a
 * pair costs a 4x4 solve instead of a pass over the series (n^2 pairs, not n^3 work; 85 s became under a second at 1,200 points).
 * The values are centred first so the subtraction at the end does not lose the residual to rounding.
 */
export function lsKnots(x, lo, hi, gap) {
  const n = x.length;
  const mx = x.reduce((a, v) => a + v, 0) / n, mt = (n - 1) / 2;
  // prefix[i] sums over t < i of 1, u, u^2, y, u*y with u = t - mt, y = x - mx
  const P = Array.from({ length: 5 }, () => new Float64Array(n + 1));
  for (let t = 0; t < n; t++) {
    const u = t - mt, y = x[t] - mx;
    const v = [1, u, u * u, y, u * y];
    for (let q = 0; q < 5; q++) P[q][t + 1] = P[q][t] + v[q];
  }
  const tail = (q, k) => P[q][n] - P[q][k + 1]; // sum over t > k
  const yy = x.reduce((a, v) => a + (v - mx) ** 2, 0);
  let best = null;
  const A = Array.from({ length: 4 }, () => new Float64Array(5));
  for (let a = lo; a <= hi; a++) {
    const ua = a - mt;
    for (let b = a + gap; b <= hi; b++) {
      const ub = b - mt;
      // hinge (t-k)+ = (u - uk) for t > k
      const h0a = tail(1, a) - ua * tail(0, a), h0b = tail(1, b) - ub * tail(0, b); // sums of the hinges
      const m = [
        [n, P[1][n], h0a, h0b],
        [0, P[2][n], tail(2, a) - ua * tail(1, a), tail(2, b) - ub * tail(1, b)],
        [0, 0, tail(2, a) - 2 * ua * tail(1, a) + ua * ua * tail(0, a), tail(2, b) - (ua + ub) * tail(1, b) + ua * ub * tail(0, b)],
        [0, 0, 0, tail(2, b) - 2 * ub * tail(1, b) + ub * ub * tail(0, b)],
      ];
      const rhs = [P[3][n], P[4][n], tail(4, a) - ua * tail(3, a), tail(4, b) - ub * tail(3, b)];
      for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) A[i][j] = j >= i ? m[i][j] : m[j][i]; A[i][4] = rhs[i]; }
      // Gauss-Jordan with partial pivoting
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) {
        let piv = i;
        for (let r = i + 1; r < 4; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
        if (!(Math.abs(A[piv][i]) > 1e-12)) { ok = false; break; }
        if (piv !== i) { const tmp = A[i]; A[i] = A[piv]; A[piv] = tmp; }
        for (let r = 0; r < 4; r++) if (r !== i) { const q = A[r][i] / A[i][i]; for (let c = i; c < 5; c++) A[r][c] -= q * A[i][c]; }
      }
      if (!ok) continue;
      let fit = 0;
      for (let i = 0; i < 4; i++) fit += (A[i][4] / A[i][i]) * rhs[i];
      const rss = yy - fit;
      if (!best || rss < best.rss) best = { rss, knots: [a, b] };
    }
  }
  return best && best.knots;
}

// residual sum of squares of x on [1, t, (t-k)+ ...] by the normal equations (one pass over the series; the reference lsKnots is tested against)
export function lineRss(x, ks) {
  const n = x.length, p = 2 + ks.length;
  const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  const row = (t) => [1, t, ...ks.map((k) => Math.max(0, t - k))];
  for (let t = 0; t < n; t++) {
    const r = row(t);
    for (let i = 0; i < p; i++) { for (let j = 0; j < p; j++) A[i][j] += r[i] * r[j]; A[i][p] += r[i] * x[t]; }
  }
  for (let i = 0; i < p; i++) {
    let m = i;
    for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]];
    for (let r = 0; r < p; r++) if (r !== i) { const q = A[r][i] / A[i][i]; for (let c = i; c <= p; c++) A[r][c] -= q * A[i][c]; }
  }
  const b = A.map((r, i) => r[p] / r[i]);
  let s = 0;
  for (let t = 0; t < n; t++) { const r = row(t); let v = 0; for (let i = 0; i < p; i++) v += b[i] * r[i]; s += (x[t] - v) ** 2; }
  return s;
}

/**
 * A common linear trend under the steps: the series is steps plus one slope.
 * Start from the median first difference (a step touches one difference, so it
 * barely moves the median), segment with PELT, re-estimate the slope as the
 * pooled within-segment least-squares slope, and repeat until it settles.
 * Returns { adjusted, slope } with the slope per point; the adjusted series
 * keeps the mean level of the input.
 */
export function trendAdjust(x, { penalty = 'bic', minSegment = 2, passes = 10, ar1 = false, bend = false, joint = false, knotMargin = 0.1 } = {}) {
  const n = x.length;
  const d = [];
  for (let i = 1; i < n; i++) d.push(x[i] - x[i - 1]);
  const c = (n - 1) / 2;
  // bend: false (one slope), true or 1 (one bend), or a number up to 4 (greedy: most bends allowed)
  const maxBends = bend === true ? 1 : bend ? Math.min(4, Math.floor(Number(bend)) || 0) : 0;
  // the removed line: slope s[0] up to the first knot, s[j] after knot j, continuous at each knot (no knots: one slope)
  const line = (s, knots) => (t) => {
    let v = s[0] * (t - c);
    for (let j = 0; j < knots.length; j++) if (t > knots[j]) v += (s[j + 1] - s[j]) * (t - knots[j]);
    return v;
  };
  const detrend = (f) => x.map((v, t) => v - f(t));
  // pooled within-segment least-squares slope over the points t in [lo, hi) of each segment
  const pooled = (bounds, lo, hi, fallback) => {
    let sxy = 0, sxx = 0;
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = Math.max(bounds[i], lo), e = Math.min(bounds[i + 1], hi), len = e - a;
      if (len < 8) continue; // a short segment fits its own noise, not the slope
      let mt = 0, mx = 0;
      for (let t = a; t < e; t++) { mt += t; mx += x[t]; }
      mt /= len; mx /= len;
      for (let t = a; t < e; t++) { sxy += (t - mt) * (x[t] - mx); sxx += (t - mt) ** 2; }
    }
    return sxx > 0 ? sxy / sxx : fallback;
  };
  const segment = (y, mult) => {
    const sd = robustSd(y);
    // a heavier penalty while the slope is unsettled: only large steps may shape it
    // with ar1, sticky noise widens the scale, so its wandering is not cut into steps that then bend the slope
    return pelt(y, { model: 'mean', penalty: mult * penaltyValue(penalty, n, 'mean'), minSegment, sigma: ar1 ? longRunSd(sd, ar1Rho(y)) : sd }).changepoints;
  };
  const fit = (knots) => {
    const edges = [0, ...knots.map((k) => k + 1), n];
    let s = new Array(knots.length + 1).fill(median(d));
    for (let k = 0; k < passes; k++) {
      const cps = segment(detrend(line(s, knots)), 3);
      const bounds = [0, ...cps, n];
      const next = s.map((v, j) => pooled(bounds, edges[j], edges[j + 1], v));
      const done = next.every((v, j) => Math.abs(v - s[j]) < 1e-9);
      s = next;
      if (done) break;
    }
    // BIC of steps under the final line: n ln(rss/n) plus ln n per step and per slope parameter
    const y = detrend(line(s, knots));
    const cps = segment(y, 1);
    const bounds = [0, ...cps, n];
    let rss = 0;
    for (let i = 0; i + 1 < bounds.length; i++) {
      let m = 0; for (let t = bounds[i]; t < bounds[i + 1]; t++) m += y[t];
      m /= bounds[i + 1] - bounds[i];
      for (let t = bounds[i]; t < bounds[i + 1]; t++) rss += (y[t] - m) ** 2;
    }
    const params = 1 + 2 * knots.length + 2 * cps.length;
    // with ar1, sticky noise makes neighbouring points carry less than one point of evidence each: the fit gain is divided by the
    // variance inflation of the mean (long-run over marginal), so a knot must beat the wandering, not just the white-noise count
    const infl = ar1 ? longRunSd(1, ar1Rho(y)) ** 2 : 1;
    return { s, knots, y, bic: (n * Math.log(Math.max(rss, 1e-12) / n)) / infl + params * Math.log(n) };
  };
  let best = fit([]);
  if (maxBends && n >= 40) {
    const step = Math.max(1, Math.round(n / 40));
    const gap = Math.ceil(0.15 * n);
    const margin = Math.min(0.4, Math.max(0.05, Number(knotMargin) || 0.1));
    // greedy: add the knot that lowers BIC most, keep going while some knot still does
    for (let round = 0; round < maxBends; round++) {
      let found = null;
      for (let knot = Math.ceil(margin * n); knot <= Math.floor((1 - margin) * n); knot += step) {
        if (best.knots.some((k) => Math.abs(k - knot) < gap)) continue;
        const f = fit([...best.knots, knot].sort((p, q) => p - q));
        if (f.bic < (found || best).bic) found = f;
      }
      if (!found) break;
      best = found;
    }
    // the grid is coarse on long series (step n/40), and a knot a few points off leaves a small kink that is read as a step:
    // slide each knot one point at a time within a grid step of where it landed, keeping any move that lowers BIC
    const refine = (start) => {
      let cur = start;
      if (step > 1) {
        for (let j = 0; j < cur.knots.length; j++) {
          const lo = Math.ceil(margin * n), hi = Math.floor((1 - margin) * n);
          const around = cur.knots[j];
          let pick = null;
          for (let knot = Math.max(lo, around - step + 1); knot <= Math.min(hi, around + step - 1); knot++) {
            if (knot === around) continue;
            const ks = cur.knots.map((k, i) => (i === j ? knot : k)).sort((p, q) => p - q);
            if (ks.some((k, i) => i && k - ks[i - 1] < gap)) continue;
            const f = fit(ks);
            if (f.bic < (pick || cur).bic) pick = f;
          }
          if (pick) cur = pick;
        }
      }
      return cur;
    };
    best = refine(best);
    // joint: also score every pair of grid knots (not only the greedy one's), since the best single knot of a two-bend ramp
    // can sit between the two true ones and the second knot then looks unnecessary. The best pair is refined to the point like the
    // greedy result, and the cheaper of the two refined fits wins (comparing the coarse pair with the refined greedy fit would
    // favour the greedy one by the refinement alone, and the pair search is exact only on the grid)
    if (joint && maxBends >= 2) {
      const grid = [];
      for (let knot = Math.ceil(margin * n); knot <= Math.floor((1 - margin) * n); knot += step) grid.push(knot);
      let pair = null;
      for (let a = 0; a < grid.length; a++) {
        for (let b = a + 1; b < grid.length; b++) {
          if (grid[b] - grid[a] < gap) continue;
          const f = fit([grid[a], grid[b]]);
          if (f.bic < (pair || { bic: Infinity }).bic) pair = f;
        }
      }
      // the BIC lets its steps soak up a kink, so its surface is flat near the knots; an unpenalised least-squares line with two
      // knots, searched at every point, sits nearer the truth on clean data. It is offered as one more candidate for the same BIC.
      const ls = lsKnots(x, Math.ceil(margin * n), Math.floor((1 - margin) * n), gap);
      if (ls) {
        const f = fit(ls);
        if (!pair || f.bic < pair.bic) pair = f;
      }
      if (pair) {
        pair = refine(pair);
        if (pair.bic < best.bic) best = pair;
      }
    }
  }
  const out = { adjusted: detrend(line(best.s, best.knots)), slope: best.s[0] };
  if (best.knots.length) {
    Object.assign(out, { slopeAfter: best.s[1], knot: best.knots[0], knots: best.knots, slopes: best.s });
    if (n >= 40) {
      // where exactly does the slope change? The same likelihood range as for steps: slide each knot over its allowed span with the
      // other knots held fixed, weight each position by exp(-(BIC - min BIC) / 2) (the BIC is -2 log-likelihood with the noise
      // variance profiled out, plus a penalty that only differs where the number of steps does), and keep the most likely positions
      // holding 95% of the weight. A long series is scanned on a stride of about n / 200.
      const gap = Math.ceil(0.15 * n);
      const margin = Math.min(0.4, Math.max(0.05, Number(knotMargin) || 0.1));
      const stride = Math.max(1, Math.round(n / 200));
      out.knotRanges = best.knots.map((k, j) => {
        const lo = Math.max(Math.ceil(margin * n), j ? best.knots[j - 1] + gap : 0);
        const hi = Math.min(Math.floor((1 - margin) * n), j + 1 < best.knots.length ? best.knots[j + 1] - gap : n);
        const ks = [], bs = [];
        for (let q = lo; q <= hi; q += stride) {
          const f = q === k ? best : fit(best.knots.map((v, i) => (i === j ? q : v)));
          ks.push(q); bs.push(f.bic);
        }
        if (!ks.includes(k)) { ks.push(k); bs.push(best.bic); }
        const m = Math.min(...bs);
        const w = bs.map((v) => Math.exp(-(v - m) / 2));
        const tot = w.reduce((u, v) => u + v, 0);
        const order = w.map((_, i) => i).sort((u, v) => w[v] - w[u]);
        let acc = 0, from = Infinity, to = -Infinity;
        for (const i of order) { acc += w[i] / tot; from = Math.min(from, ks[i]); to = Math.max(to, ks[i]); if (acc >= 0.95) break; }
        return { knot: k, from, to, level: 0.95 };
      });
    }
  }
  return out;
}

/**
 * Lag-1 autocorrelation of the noise, robust to level shifts. For AR(1) noise
 * the first differences have lag-1 correlation -(1 - rho) / 2, and a level
 * shift touches one difference only, which is clipped at 3 robust sds.
 * Returns rho clipped to [0, 0.95].
 */
export function ar1Rho(x) {
  const d = [];
  for (let i = 1; i < x.length; i++) d.push(x[i] - x[i - 1]);
  if (d.length < 10) return 0;
  const md = median(d);
  const mad = median(d.map((v) => Math.abs(v - md))) / 0.6744897501960817;
  if (!(mad > 0)) return 0;
  const c = d.map((v) => Math.max(-3 * mad, Math.min(3 * mad, v - md)));
  let num = 0, den = 0;
  for (let i = 0; i < c.length; i++) { den += c[i] * c[i]; if (i) num += c[i] * c[i - 1]; }
  const rd = num / den;
  return Math.max(0, Math.min(0.95, 1 + 2 * rd));
}

/** Residuals of x about the segment means set by changepoints (indices where a new segment starts). */
export function stepResiduals(x, cps) {
  const b = [0, ...cps, x.length], r = [];
  for (let s = 0; s + 1 < b.length; s++) {
    let m = 0;
    for (let i = b[s]; i < b[s + 1]; i++) m += x[i];
    m /= b[s + 1] - b[s];
    for (let i = b[s]; i < b[s + 1]; i++) r.push(x[i] - m);
  }
  return r;
}

/** Fisher's g (largest periodogram share) with its exact p-value, over Fourier frequencies 1..floor((n-1)/2). */
export function fisherG(r) {
  const n = r.length, q = Math.floor((n - 1) / 2);
  if (q < 2) return { g: 0, p: 1, period: null };
  let tot = 0, best = 0, bk = 1;
  for (let k = 1; k <= q; k++) {
    let c = 0, s = 0;
    for (let t = 0; t < n; t++) { const a = 2 * Math.PI * k * t / n; c += r[t] * Math.cos(a); s += r[t] * Math.sin(a); }
    const I = c * c + s * s;
    tot += I;
    if (I > best) { best = I; bk = k; }
  }
  const g = tot > 0 ? best / tot : 0;
  let p = 0;
  for (let j = 1; j <= Math.min(q, Math.floor(1 / g)); j++) {
    let lc = 0;
    for (let i = 1; i <= j; i++) lc += Math.log(q - i + 1) - Math.log(i); // log C(q,j)
    p += (j % 2 ? 1 : -1) * Math.exp(lc + (q - 1) * Math.log(1 - j * g));
  }
  return { g, p: Math.min(1, Math.max(0, p)), period: n / bk };
}

/**
 * Variance ratio of block means: the spread of means of blocks of ~n/20 points against what independent noise
 * of the series' own difference-based sd would give (1 for white noise; 95th percentile of white noise 1.6 at
 * n >= 200, 2.5 at n = 48). Long memory, cycles and level shifts all push it up, and it does not tell them apart;
 * unlike ar1Rho it sees slow wandering that has a small lag-1 correlation (treering: rho 0.16, ratio 6).
 */
export function blockVarianceRatio(x) {
  const n = x.length;
  if (n < 40) return 1;
  const d = [];
  for (let i = 1; i < n; i++) d.push(x[i] - x[i - 1]);
  const md = median(d);
  const mad = median(d.map((v) => Math.abs(v - md))) / 0.6744897501960817;
  if (!(mad > 0)) return 1;
  const m = Math.max(4, Math.round(n / 20)), k = Math.floor(n / m);
  const mu = [];
  for (let b = 0; b < k; b++) { let t = 0; for (let i = 0; i < m; i++) t += x[b * m + i]; mu.push(t / m); }
  const g = mu.reduce((a, c) => a + c, 0) / k;
  const v = mu.reduce((a, c) => a + (c - g) ** 2, 0) / (k - 1);
  return v / (mad * mad / 2 / m);
}

/** Long-run noise sd of AR(1) noise from the difference-based sd: sd * sqrt(1 + rho) / (1 - rho). */
export function longRunSd(sd, rho) {
  return sd * Math.sqrt(1 + rho) / (1 - rho);
}

/**
 * AR(1) prewhitening: y[t] = x[t] - rho x[t-1] (y[0] = (1 - rho) x[0]). Independent noise
 * stays independent for the Bayesian pass, and a level shift of d becomes d at the
 * change point and d (1 - rho) after it. The change keeps its index.
 */
export function prewhiten(x, rho) {
  return x.map((v, t) => (t ? v - rho * x[t - 1] : (1 - rho) * v));
}

/**
 * Joint mean-plus-AR(1) fit: PELT on the exact AR(1) likelihood ('ar1mean'), then rho and the
 * innovation sd are re-estimated from the residuals about the fitted segment means (which a level
 * shift no longer pollutes) and PELT is run again, three passes in all.
 * Returns { changepoints, rho, sigma (innovation sd), penalty }.
 */
export function ar1JointFit(x, { penalty = 'bic', minSegment = 2, passes = 3 } = {}) {
  let rho = ar1Rho(x);
  let sigma = robustSd(x) * Math.sqrt(1 + rho);
  let p;
  for (let it = 0; it < passes; it++) {
    p = pelt(x, { model: 'ar1mean', penalty, minSegment, sigma, rho });
    if (it === passes - 1) break;
    const b = [0, ...p.changepoints, x.length];
    const res = new Array(x.length);
    for (let k = 0; k + 1 < b.length; k++) {
      let m = 0;
      for (let i = b[k]; i < b[k + 1]; i++) m += x[i];
      m /= b[k + 1] - b[k];
      for (let i = b[k]; i < b[k + 1]; i++) res[i] = x[i] - m;
    }
    let num = 0, den = 0;
    for (let i = 1; i < x.length; i++) { num += res[i] * res[i - 1]; den += res[i - 1] ** 2; }
    rho = den > 0 ? Math.max(0, Math.min(0.95, num / den)) : 0;
    let ss = 0;
    for (let i = 1; i < x.length; i++) ss += (res[i] - rho * res[i - 1]) ** 2;
    sigma = Math.sqrt(ss / (x.length - 1)) || sigma;
  }
  return { ...p, rho, sigma };
}

/**
 * Profile fit over rho: the exact AR(1) likelihood is scored on a grid of rho (each with its own PELT fit and
 * innovation sd, as in lake-huron-profile.test.mjs) and the best score wins. Score per rho:
 * n log(sd^2) - log(1 - rho^2) + penalty per change. Slower than ar1JointFit (one fit per grid point) but it
 * cannot be pulled to a wrong rho by a start value. Returns { changepoints, rho, sigma, penalty, grid }.
 */
export function ar1ProfileFit(x, { penalty = 'bic', minSegment = 2, grid = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] } = {}) {
  const n = x.length;
  let best = null;
  const scores = [];
  for (const rho of grid) {
    let sigma = robustSd(x) * Math.sqrt(1 + rho), p;
    for (let it = 0; it < 4; it++) {
      p = pelt(x, { model: 'ar1mean', penalty, minSegment, sigma, rho });
      const b = [0, ...p.changepoints, n];
      const c = 1 - rho, w0 = 1 - rho * rho;
      let ss = 0;
      for (let k = 0; k + 1 < b.length; k++) {
        const s = b[k], t = b[k + 1];
        let su = 0;
        for (let i = s + 1; i < t; i++) su += x[i] - rho * x[i - 1];
        const mu = (w0 * x[s] + c * su) / (w0 + (t - s - 1) * c * c);
        ss += w0 * (x[s] - mu) ** 2;
        for (let i = s + 1; i < t; i++) ss += (x[i] - rho * x[i - 1] - c * mu) ** 2;
      }
      sigma = Math.sqrt(ss / n) || sigma;
    }
    const score = n * Math.log(sigma * sigma) - Math.log(1 - rho * rho) + 2 * p.changepoints.length * Math.log(n);
    scores.push({ rho, score: round(score, 3), changes: p.changepoints.length });
    if (!best || score < best.score) best = { ...p, rho, sigma, score };
  }
  const { score, ...rest } = best;
  return { ...rest, grid: scores };
}

const range = (a, b, d) => { const o = []; for (let v = a; v <= b + 1e-9; v += d) o.push(Math.round(v * 100) / 100); return o; };

/**
 * Profile fit over (phi1, phi2): the exact AR(2) likelihood ('ar2mean') scored on a grid of stationary pairs, each with its own
 * PELT fit and innovation sd; the best score wins. Score: n log(sd^2) + log(k0 k1) + penalty per change, where k0 k1 is the
 * start's variance factor. For series with a cycle, where one lag cannot hold the swing (sunspots). Slower than ar1ProfileFit.
 * Returns { changepoints, phi1, phi2, sigma, penalty, grid }.
 */
export function ar2ProfileFit(x, { penalty = 'bic', minSegment = 3, phi1s = range(0, 1.9, 0.1), phi2s = range(-0.9, 0.3, 0.1) } = {}) {
  const n = x.length;
  let best = null;
  const scores = [];
  for (const f1 of phi1s) for (const f2 of phi2s) {
    if (f1 + f2 >= 0.98 || f2 - f1 >= 0.98 || Math.abs(f2) >= 0.98) continue;
    const rho = [f1, f2];
    const r1 = f1 / (1 - f2);
    const k0 = (1 - f2) / ((1 + f2) * ((1 - f2) ** 2 - f1 * f1));
    let sigma = robustSd(x) / Math.sqrt(k0), p;
    for (let it = 0; it < 3; it++) {
      p = pelt(x, { model: 'ar2mean', penalty, minSegment, sigma, rho });
      const b = [0, ...p.changepoints, n];
      const c = 1 - f1 - f2, k1 = k0 * (1 - r1 * r1);
      let ss = 0;
      for (let k = 0; k + 1 < b.length; k++) {
        const s = b[k], t = b[k + 1];
        let A = 1 / k0 + (1 - r1) ** 2 / k1, B = x[s] / k0 + (1 - r1) * (x[s + 1] - r1 * x[s]) / k1;
        for (let i = s + 2; i < t; i++) { A += c * c; B += c * (x[i] - f1 * x[i - 1] - f2 * x[i - 2]); }
        const mu = B / A;
        ss += (x[s] - mu) ** 2 / k0 + (x[s + 1] - r1 * x[s] - (1 - r1) * mu) ** 2 / k1;
        for (let i = s + 2; i < t; i++) ss += (x[i] - f1 * x[i - 1] - f2 * x[i - 2] - c * mu) ** 2;
      }
      sigma = Math.sqrt(ss / n) || sigma;
    }
    const k1 = k0 * (1 - r1 * r1);
    const score = n * Math.log(sigma * sigma) + Math.log(k0 * k1) + 2 * p.changepoints.length * Math.log(n);
    scores.push({ phi1: f1, phi2: f2, score: round(score, 3), changes: p.changepoints.length });
    if (!best || score < best.score) best = { ...p, phi1: f1, phi2: f2, sigma, score };
  }
  const { score, ...rest } = best;
  return { ...rest, grid: scores };
}

// ---------------------------------------------------------------- input

/** Split one CSV line, honouring double quotes. */
function splitLine(line, semi = false) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (semi ? (c === ';' || c === '\t') : (c === ',' || c === '\t' || c === ';')) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const numCell = (s, decimalComma = false) => {
  if (s == null) return NaN;
  const t = decimalComma
    ? String(s).replace(/[$\s.]/g, '').replace(',', '.')
    : String(s).replace(/[$,\s]/g, '');
  return t === '' ? NaN : Number(t);
};

/**
 * Parse CSV text into { labels, values, column, skipped }. A header row is
 * detected when its value cell is not a number. Rows whose value is blank or
 * not numeric are skipped and counted.
 */
export function parseSeries(csv, column = null, labelColumn = null) {
  const lines = String(csv ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) throw new Error('No data: paste a column of numbers or a CSV.');
  // A semicolon-separated file (Excel in a comma-decimal locale) writes 1,5 for 1.5: split on ; only and read the comma as a decimal point.
  const semi = lines.some((l) => l.replace(/"[^"]*"/g, '').includes(';'));
  const rows = lines.map((l) => splitLine(l, semi));
  const num = (s) => numCell(s, semi);
  const width = Math.max(...rows.map((r) => r.length));
  const first = rows[0];
  const header = first.some((c) => c !== '' && Number.isNaN(num(c))) ? first : null;
  const body = header ? rows.slice(1) : rows;
  const resolve = (ref) => {
    if (ref == null || ref === '') return null;
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      const i = Number(ref);
      if (i < 0 || i >= width) throw new Error(`Column ${i} does not exist (the data has ${width}).`);
      return i;
    }
    const i = header ? header.findIndex((h) => h.toLowerCase() === String(ref).toLowerCase()) : -1;
    if (i < 0) throw new Error(`No column named "${ref}".`);
    return i;
  };
  let vi = resolve(column);
  if (vi == null) {
    for (let c = width - 1; c >= 0 && vi == null; c--) {
      const ok = body.filter((r) => Number.isFinite(num(r[c]))).length;
      if (ok >= Math.max(1, body.length / 2)) vi = c;
    }
    if (vi == null) throw new Error('No numeric column found.');
  }
  let li = resolve(labelColumn);
  if (li == null && width > 1 && vi !== 0) li = 0;
  const labels = [];
  const values = [];
  let skipped = 0;
  body.forEach((r, i) => {
    const v = num(r[vi]);
    if (!Number.isFinite(v)) { skipped++; return; }
    values.push(v);
    labels.push(li == null ? String(i + 1) : (r[li] ?? String(i + 1)));
  });
  return { labels, values, column: header ? header[vi] : `column ${vi}`, skipped };
}

// ---------------------------------------------------------------- helpers

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Robust noise sd from successive differences: MAD(diff) / (0.6745 * sqrt 2). Immune to a few level shifts. */
export function robustSd(x) {
  if (x.length < 3) return 1;
  const d = [];
  for (let i = 1; i < x.length; i++) d.push(x[i] - x[i - 1]);
  const md = median(d);
  const mad = median(d.map((v) => Math.abs(v - md)));
  const sd = mad / (0.6744897501960817 * Math.SQRT2);
  if (sd > 0) return sd;
  const mu = x.reduce((s, v) => s + v, 0) / x.length;
  const v = x.reduce((s, y) => s + (y - mu) ** 2, 0) / x.length;
  return Math.sqrt(v) || 1;
}

function lgamma(z) {
  // Lanczos approximation (g = 7, n = 9), accurate to ~1e-15 for z > 0.
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
export { lgamma };

// ---------------------------------------------------------------- PELT

/**
 * Segment cost function over prefix sums. cost(s, t) is -2 log-likelihood of
 * x[s..t) under the model, maximised over the segment's parameters.
 */
export function makeCost(x, model = 'mean', sigma = robustSd(x), rho = 0, exposure = null, size = 0) {
  const n = x.length;
  const S1 = new Float64Array(n + 1);
  const S2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { S1[i + 1] = S1[i] + x[i]; S2[i + 1] = S2[i] + x[i] * x[i]; }
  if (model === 'mean') {
    const s2 = sigma * sigma;
    // Constant n*log(2*pi*sigma^2) terms sum to the same total for every segmentation, so they are dropped.
    return (s, t) => {
      const m = t - s;
      const a = S1[t] - S1[s];
      return Math.max(0, S2[t] - S2[s] - (a * a) / m) / s2;
    };
  }
  if (model === 'ar1mean') {
    // Segment means with AR(1) noise of known rho and innovation sd sigma, conditional on
    // the segment start being a stationary draw: u[i] = x[i] - rho x[i-1] has mean (1-rho) mu,
    // x[s] has precision weight 1-rho^2. Minimising over mu is a quadratic with prefix sums.
    const U1 = new Float64Array(n + 1);
    const U2 = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const u = i ? x[i] - rho * x[i - 1] : 0;
      U1[i + 1] = U1[i] + u; U2[i + 1] = U2[i] + u * u;
    }
    const c = 1 - rho, w0 = 1 - rho * rho, s2 = sigma * sigma;
    return (s, t) => {
      const m = t - s;
      const su = U1[t] - U1[s + 1], suu = U2[t] - U2[s + 1];
      const A = w0 + (m - 1) * c * c;
      const B = w0 * x[s] + c * su;
      const C = w0 * x[s] * x[s] + suu;
      return Math.max(0, C - (B * B) / A) / s2 - Math.log(w0);
    };
  }
  if (model === 'ar2mean') {
    // Segment means with AR(2) noise of known (phi1, phi2) and innovation sd sigma (rho = [phi1, phi2]). The exact Gaussian
    // likelihood given a stationary start: x[s] has variance k0 s2, x[s+1] given x[s] has mean r1 x[s] and variance
    // k0 (1 - r1^2) s2, later points have u = x[i] - phi1 x[i-1] - phi2 x[i-2] with mean (1 - phi1 - phi2) mu. Quadratic in mu.
    const [f1, f2] = rho;
    const r1 = f1 / (1 - f2);
    const k0 = (1 - f2) / ((1 + f2) * ((1 - f2) ** 2 - f1 * f1));
    const k1 = k0 * (1 - r1 * r1);
    const U1 = new Float64Array(n + 1);
    const U2 = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const u = i > 1 ? x[i] - f1 * x[i - 1] - f2 * x[i - 2] : 0;
      U1[i + 1] = U1[i] + u; U2[i + 1] = U2[i] + u * u;
    }
    const c = 1 - f1 - f2, s2 = sigma * sigma, lg = Math.log(k0) + Math.log(k1);
    return (s, t) => {
      const m = t - s;
      if (m < 3) {
        // too short for the lag-2 recursion: score as independent noise of the stationary spread
        let a = 0, q = 0;
        for (let i = s; i < t; i++) { a += x[i]; q += x[i] * x[i]; }
        return Math.max(0, q - (a * a) / m) / (k0 * s2) + m * Math.log(k0);
      }
      // points s and s+1 as regressions on mu, the rest from the prefix sums (their u uses the two points before: inside the
      // segment only from s+2, so the prefix sums for i >= s+2 are right; x[i-2] of s+2 is x[s], inside)
      const z0 = x[s], a0 = 1, w0 = 1 / k0;
      const z1 = x[s + 1] - r1 * x[s], a1 = 1 - r1, w1 = 1 / k1;
      const su = U1[t] - U1[s + 2], suu = U2[t] - U2[s + 2];
      const A = w0 * a0 * a0 + w1 * a1 * a1 + (m - 2) * c * c;
      const B = w0 * a0 * z0 + w1 * a1 * z1 + c * su;
      const C = w0 * z0 * z0 + w1 * z1 * z1 + suu;
      return Math.max(0, C - (B * B) / A) / s2 + lg;
    };
  }
  if (model === 'meanvar') {
    // Floor the variance so a run of identical values cannot drive the cost to -infinity.
    const floor = Math.max(1e-12, (sigma * 1e-3) ** 2);
    return (s, t) => {
      const m = t - s;
      const a = S1[t] - S1[s];
      const v = Math.max(floor, (S2[t] - S2[s] - (a * a) / m) / m);
      return m * (Math.log(2 * Math.PI * v) + 1);
    };
  }
  if (model === 'meanvarlaplace') {
    // Level and volatility with double-exponential (Laplace) noise: the fit is the segment median and the mean absolute
    // deviation b about it, -2 log-likelihood 2 m (log 2b + 1). Heavy tails pull b far less than they pull a variance.
    // No prefix sums for a median, so each segment is sorted on demand (cached by its ends: PELT asks again).
    const floor = Math.max(1e-9, sigma * 1e-3);
    const memo = new Map();
    return (s, t) => {
      const key = s * (n + 1) + t;
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      const m = t - s;
      const seg = Array.from(x.subarray ? x.subarray(s, t) : x.slice(s, t)).sort((a, b) => a - b);
      const med = m % 2 ? seg[(m - 1) / 2] : (seg[m / 2 - 1] + seg[m / 2]) / 2;
      let ad = 0;
      for (let i = 0; i < m; i++) ad += Math.abs(seg[i] - med);
      const c = 2 * m * (Math.log(2 * Math.max(floor, ad / m)) + 1);
      memo.set(key, c);
      return c;
    };
  }
  if (model === 'trend') {
    // One straight line per segment, noise sd sigma: the cost is the segment's residual sum of squares
    // about its least-squares line over sigma^2, from prefix sums of x, t, t^2, t x. t is scaled to [0, 1]
    // so the cancellation in the sums stays small on long series.
    const T1 = new Float64Array(n + 1), T2 = new Float64Array(n + 1), TX = new Float64Array(n + 1);
    const sc = 1 / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      const u = i * sc;
      T1[i + 1] = T1[i] + u; T2[i + 1] = T2[i] + u * u; TX[i + 1] = TX[i] + u * x[i];
    }
    const s2 = sigma * sigma;
    return (s, t) => {
      const m = t - s;
      const st = T1[t] - T1[s], sx = S1[t] - S1[s];
      const sxx = (T2[t] - T2[s]) - (st * st) / m;
      const sxy = (TX[t] - TX[s]) - (st * sx) / m;
      const syy = (S2[t] - S2[s]) - (sx * sx) / m;
      return Math.max(0, sxx > 1e-12 ? syy - (sxy * sxy) / sxx : syy) / s2;
    };
  }
  if (model === 'poisson') {
    // -2 log-likelihood of counts with one rate per segment, the constant sum(log x!) dropped:
    // 2 * (a - a log(a / m)), where a is the segment total and m its length (0 when a = 0).
    // With per-point exposures e (a seasonal factor for each point) the segment rate is a / sum(e) and m becomes sum(e);
    // the dropped terms (sum x log e, sum log x!) do not depend on the segmentation.
    const E = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) E[i + 1] = E[i] + (exposure ? exposure[i] : 1);
    return (s, t) => {
      const m = E[t] - E[s];
      const a = S1[t] - S1[s];
      return a > 0 && m > 0 ? 2 * (a - a * Math.log(a / m)) : 0;
    };
  }
  if (model === 'negbin') {
    // Negative binomial with a known size r (variance mu + mu^2 / r) and one mean per segment, the constants dropped:
    // -2 [a log(mu / (mu + r)) + m r log(r / (mu + r))] with mu = a / m, the maximum-likelihood mean for any fixed r.
    // As r grows this tends to the Poisson cost.
    if (!(size > 0)) throw new Error('The negative-binomial cost needs a size r > 0.');
    if (exposure) {
      // Per-point exposures e (a seasonal factor, a trend): the mean at t is lam e[t], and lam has no closed form,
      // so the segment's lam is the Poisson estimate a / sum(e) polished by two Newton steps on the NB score.
      // The cost is O(segment length), not O(1); PELT's pruning keeps the candidate set small.
      // A season gives a handful of distinct exposures: the score and the likelihood depend on each point only through
      // its exposure class, so prefix sums of count and total per class make the same cost O(classes) per segment.
      const classes = new Map();
      for (let i = 0; i < n && classes.size <= NB_CLASS_MAX; i++) if (!classes.has(exposure[i])) classes.set(exposure[i], classes.size);
      if (classes.size <= NB_CLASS_MAX) {
        const K = classes.size, ev = [...classes.keys()];
        const CN = ev.map(() => new Float64Array(n + 1)), CS = ev.map(() => new Float64Array(n + 1));
        for (let k = 0; k < K; k++) for (let i = 0; i < n; i++) {
          const hit = classes.get(exposure[i]) === k;
          CN[k][i + 1] = CN[k][i] + (hit ? 1 : 0);
          CS[k][i + 1] = CS[k][i] + (hit ? x[i] : 0);
        }
        const nn = new Float64Array(K), ss = new Float64Array(K);
        return (s, t) => {
          let a = 0, E = 0;
          for (let k = 0; k < K; k++) {
            nn[k] = CN[k][t] - CN[k][s]; ss[k] = CS[k][t] - CS[k][s];
            a += ss[k]; E += nn[k] * ev[k];
          }
          if (!(E > 0)) return 0;
          let lam = a / E;
          for (let it = 0; it < 2 && lam > 0; it++) {
            let g = 0, h = 0;
            for (let k = 0; k < K; k++) {
              if (!nn[k]) continue;
              const e = ev[k], d = lam * e + size, w = ss[k] + size * nn[k];
              g += ss[k] / lam - w * e / d;
              h += -ss[k] / (lam * lam) + w * e * e / (d * d);
            }
            const next = lam - g / h;
            if (!(h < 0) || !(next > 0)) break;
            lam = next;
          }
          let ll = 0;
          for (let k = 0; k < K; k++) {
            if (!nn[k]) continue;
            const mu = lam * ev[k];
            ll += (ss[k] > 0 ? ss[k] * Math.log(mu / (mu + size)) : 0) + nn[k] * size * Math.log(size / (mu + size));
          }
          return -2 * ll;
        };
      }
      // Continuous exposures: one pass of reciprocals per Newton step and one log per point. The likelihood is
      // a log(lam) + sum x log e - sum (x + r) log(lam e + r) + m r log r, and sum x log e is a prefix sum, so
      // the final pass takes one log per point where the textbook form takes two.
      const W = new Float64Array(n), LX = new Float64Array(n + 1), EP = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) {
        W[i] = x[i] + size;
        LX[i + 1] = LX[i] + (x[i] > 0 ? x[i] * Math.log(exposure[i]) : 0);
        EP[i + 1] = EP[i] + exposure[i];
      }
      const logSize = Math.log(size);
      // PELT asks for (s, t) with t rising for each start s, and the rate barely moves when one point is added, so the
      // last fitted rate for a start is kept and polished by one Newton step instead of two from the Poisson estimate.
      const lamAt = new Float64Array(n + 1);
      return (s, t) => {
        const a = S1[t] - S1[s], E = EP[t] - EP[s];
        if (!(E > 0)) return 0;
        const warm = lamAt[s] > 0 && t - s > 3;
        let lam = warm ? lamAt[s] : a / E;
        for (let k = warm ? 1 : 0; k < 2 && lam > 0; k++) {
          let g = a / lam, h = -a / (lam * lam);
          for (let i = s; i < t; i++) {
            const e = exposure[i], inv = 1 / (lam * e + size), q = W[i] * e * inv;
            g -= q; h += q * e * inv;
          }
          const next = lam - g / h;
          if (!(h < 0) || !(next > 0)) break;
          lam = next;
        }
        if (lam > 0) lamAt[s] = lam;
        let acc = 0;
        for (let i = s; i < t; i++) acc += W[i] * Math.log(lam * exposure[i] + size);
        const ll = (a > 0 ? a * Math.log(lam) : 0) + (LX[t] - LX[s]) - acc + (t - s) * size * logSize;
        return -2 * ll;
      };
    }
    return (s, t) => {
      const m = t - s;
      const a = S1[t] - S1[s];
      const mu = a / m;
      return -2 * ((a > 0 ? a * Math.log(mu / (mu + size)) : 0) + m * size * Math.log(size / (mu + size)));
    };
  }
  throw new Error(`Unknown model "${model}": use "mean", "meanvar", "trend", "poisson" or "negbin".`);
}

/**
 * Size r of a negative binomial (variance mu + mu^2 / r) for clumpy counts, from the series itself: the variance comes
 * from the median of squared first differences (a step spoils one difference, so the median ignores it; for
 * independent counts D = x_t - x_(t-1) has variance 2 var and D^2 has median 0.4549 * 2 var), the mean from the median.
 * Returns Infinity when the counts are no more spread than a Poisson (the negative binomial then adds nothing).
 */
export function negbinSize(x) {
  if (x.length < 8) return Infinity;
  const d = [];
  for (let t = 1; t < x.length; t++) d.push((x[t] - x[t - 1]) ** 2);
  const v = median(d) / (2 * 0.4549);
  const mu = x.reduce((a, b) => a + b, 0) / x.length;
  return v > 1.05 * mu && mu > 0 ? (mu * mu) / (v - mu) : Infinity;
}

/** Penalty per extra change. Parameters added by one change: its location plus the new segment's parameters. */
export function penaltyValue(penalty, n, model) {
  if (typeof penalty === 'number' && Number.isFinite(penalty) && penalty >= 0) return penalty;
  if (typeof penalty === 'string' && /^\d+(\.\d+)?$/.test(penalty.trim())) return Number(penalty);
  const k = model === 'meanvar' || model === 'meanvarlaplace' || model === 'trend' ? 3 : 2;  // trend: location plus a level and a slope; poisson, like mean: location plus one rate
  switch (String(penalty).toLowerCase()) {
    case 'bic': return k * Math.log(n);
    case 'aic': return 2 * k;
    case 'hannan-quinn': case 'hq': return 2 * k * Math.log(Math.log(Math.max(n, 3)));
    default: throw new Error(`Unknown penalty "${penalty}": use bic, aic, hannan-quinn or a number.`);
  }
}

/**
 * PELT. Returns change locations as indices i where a new segment starts at
 * x[i] (so 0 < i < n), sorted, plus the optimal total cost.
 */
export function pelt(x, { model = 'mean', penalty = 'bic', minSegment = 2, sigma, rho = 0, exposure = null, size = 0 } = {}) {
  const n = x.length;
  const beta = penaltyValue(penalty, n, model);
  const minSeg = Math.max(1, Math.floor(minSegment));
  const cost = makeCost(x, model, sigma ?? robustSd(x), rho, exposure, size);
  if (n < 2 * minSeg) return { changepoints: [], cost: n ? cost(0, n) : 0, penalty: beta };
  const F = new Float64Array(n + 1).fill(Infinity);
  const last = new Int32Array(n + 1).fill(-1);
  F[0] = -beta;
  let R = [0];
  for (let t = minSeg; t <= n; t++) {
    let best = Infinity;
    let arg = -1;
    const vals = [];
    for (const s of R) {
      if (t - s < minSeg) { vals.push(null); continue; }
      const v = F[s] + cost(s, t) + beta;
      vals.push(v);
      if (v < best) { best = v; arg = s; }
    }
    F[t] = best;
    last[t] = arg;
    // Prune: s can never be the last change for any t' > t if F(s) + C(s,t) > F(t) (K = 0).
    const next = [];
    R.forEach((s, i) => { if (vals[i] === null || vals[i] - beta <= best) next.push(s); });
    if (Number.isFinite(F[t])) next.push(t);
    R = next;
  }
  const cps = [];
  for (let t = n; last[t] > 0; t = last[t]) cps.push(last[t]);
  cps.reverse();
  return { changepoints: cps, cost: F[n], penalty: beta };
}

/** O(n^2) optimal partitioning with no pruning: the reference PELT must match (tests). */
export function optimalPartitioning(x, { model = 'mean', penalty = 'bic', minSegment = 2, sigma, rho = 0, exposure = null } = {}) {
  const n = x.length;
  const beta = penaltyValue(penalty, n, model);
  const cost = makeCost(x, model, sigma ?? robustSd(x), rho, exposure);
  const F = new Float64Array(n + 1).fill(Infinity);
  const last = new Int32Array(n + 1).fill(-1);
  F[0] = -beta;
  for (let t = minSegment; t <= n; t++) {
    for (let s = 0; s <= t - minSegment; s++) {
      if (s > 0 && s < minSegment) continue;
      if (!Number.isFinite(F[s])) continue;
      const v = F[s] + cost(s, t) + beta;
      if (v < F[t]) { F[t] = v; last[t] = s; }
    }
  }
  const cps = [];
  for (let t = n; last[t] > 0; t = last[t]) cps.push(last[t]);
  return { changepoints: cps.reverse(), cost: F[n], penalty: beta };
}

// ---------------------------------------------------------------- BOCPD

const NB_CLASS_MAX = 64; // most distinct exposures the per-class prefix-sum NB cost handles
const NB_GRID = 240, NB_SPAN = 10;

/**
 * Bayesian online changepoint detection with a constant hazard and a
 * Normal-Inverse-Gamma prior (mu0, kappa0, alpha0, beta0).
 *
 * Returns, for each t, the MAP run length after seeing x[t], and
 * `changeProb[i]`: the posterior probability, given x[0..i+lag], that a new
 * segment started at x[i]. Also returns the log evidence sum log p(x_t | x_<t).
 */
export function bocpd(x, { hazardLambda = 100, lag = 5, prior, prune = 1e-10, model = 'mean', rho = 0, exposure = null, dispersion = 1, nbSize = 0 } = {}) {
  const n = x.length;
  // Counts with dispersion phi > 1: temper the Poisson likelihood by 1/phi (quasi-likelihood), i.e. counts and exposure
  // each divided by phi, so the evidence for a change is what phi times fewer independent Poisson counts would give.
  const phi = model === 'poisson' ? Math.max(1, dispersion) : 1;
  const H = 1 / Math.max(1, hazardLambda);
  const pois = model === 'poisson';
  // Clumpy counts (nbSize r > 0, no exposure): x ~ NB(r, p) with p ~ Beta(a, b), conjugate: a += r, b += x.
  // The predictive is beta-negative-binomial; alpha and beta hold a and b. Dispersion is not applied on top.
  const useNb = pois && nbSize > 0 && !exposure;
  // Clumpy counts with exposures (nbSize r > 0 and a season or trend): the rate lam has no conjugate prior when the
  // NB success probability changes with the exposure e[t], so each run keeps its posterior over lam on a log grid
  // (NB_GRID points, a factor of NB_SPAN either side of the series' mean rate per unit exposure), and the
  // predictive is the exact grid sum. The prior is Gamma(1) on lam, which is flat-ish and decays beyond the mean.
  const useNbGrid = pois && nbSize > 0 && !!exposure;
  let lamGrid = null, priorGrid = null;
  if (useNbGrid) {
    let sx = 0, se = 0;
    for (let t = 0; t < n; t++) { sx += x[t]; se += exposure[t]; }
    const m = Math.max(sx / se, 1e-3);
    lamGrid = new Float64Array(NB_GRID);
    priorGrid = new Float64Array(NB_GRID);
    let z = -Infinity;
    for (let g = 0; g < NB_GRID; g++) {
      lamGrid[g] = m * Math.exp(Math.log(NB_SPAN) * (2 * g / (NB_GRID - 1) - 1));
      priorGrid[g] = Math.log(lamGrid[g]) - lamGrid[g] / m; // Gamma(1, 1/m) density times the log-grid Jacobian
      z = logAdd(z, priorGrid[g]);
    }
    for (let g = 0; g < NB_GRID; g++) priorGrid[g] -= z;
  }
  let grids = useNbGrid ? [priorGrid] : null;
  const lgR = useNbGrid ? lgamma(nbSize) : 0;
  // Poisson counts: Gamma(alpha, beta) rate prior, negative-binomial predictive; mu and kappa are unused.
  const p0 = prior ?? (useNb ? defaultNbPrior(x, nbSize) : pois ? defaultPoissonPrior(x) : defaultPrior(x));
  // Parallel arrays over current run lengths r = 0..R-1 (index = run length, possibly pruned to a tail).
  let mu = [p0.mu];
  let kappa = [p0.kappa];
  let alpha = [p0.alpha];
  let beta = [p0.beta];
  let rl = [0];
  let logR = [0];
  const mapRun = new Int32Array(n);
  const expRun = new Float64Array(n);
  const changeProb = new Float64Array(n);
  // Posterior P(r_t = r) for the last lag + 1 steps, as maps keyed by run length.
  const window = [];
  let logEvidence = 0;
  for (let t = 0; t < n; t++) {
    const xt = x[t];
    const m = rl.length;
    const logPred = new Float64Array(m);
    // AR(1) noise (rho > 0, mean model): the first point of a run is stationary, x ~ N(mu, s2 / (1 - rho^2)),
    // i.e. z = x sqrt(1 - rho^2) has regressor a0 on mu; later points are x[t] - rho x[t-1] = (1 - rho) mu + e.
    // Each run keeps a scalar-regression NIG posterior; a = 1 and no Jacobian when rho = 0.
    const a0 = Math.sqrt(1 - rho * rho);
    const zAt = (i) => (rl[i] === 0 ? xt * a0 : t ? xt - rho * x[t - 1] : (1 - rho) * xt);
    const aAt = (i) => (rl[i] === 0 ? a0 : 1 - rho);
    let lik = null;
    if (useNbGrid) {
      // log NB(x_t | r, lam e_t) on the grid: p = r / (r + lam e)
      lik = new Float64Array(NB_GRID);
      const c = lgamma(xt + nbSize) - lgR - lgamma(xt + 1), e = exposure[t];
      for (let g = 0; g < NB_GRID; g++) {
        const mean = lamGrid[g] * e;
        lik[g] = c + nbSize * Math.log(nbSize / (nbSize + mean)) + (xt > 0 ? xt * Math.log(mean / (nbSize + mean)) : 0);
      }
      for (let i = 0; i < m; i++) {
        const w = grids[i];
        let top = -Infinity;
        for (let g = 0; g < NB_GRID; g++) { const v = w[g] + lik[g]; if (v > top) top = v; }
        let acc = 0;
        for (let g = 0; g < NB_GRID; g++) acc += Math.exp(w[g] + lik[g] - top);
        logPred[i] = top + Math.log(acc);
      }
    }
    for (let i = 0; i < m; i++) {
      if (useNbGrid) continue;
      if (useNb) logPred[i] = lgamma(xt + nbSize) - lgamma(nbSize) - lgamma(xt + 1) + lbeta(alpha[i] + nbSize, beta[i] + xt) - lbeta(alpha[i], beta[i]);
      else if (pois) logPred[i] = phi === 1 ? gammaPoissonLogPmf(xt, alpha[i], beta[i], exposure ? exposure[t] : 1)
        : gammaPoissonLogPmf(xt / phi, alpha[i], beta[i], (exposure ? exposure[t] : 1) / phi) + lgamma(xt / phi + 1) - lgamma(xt + 1);
      else if (!rho) logPred[i] = studentLogPdf(xt, mu[i], kappa[i], alpha[i], beta[i]);
      else logPred[i] = studentLogPdfReg(zAt(i), aAt(i), mu[i], kappa[i], alpha[i], beta[i]) + (rl[i] === 0 ? Math.log(a0) : 0);
    }
    // Growth and changepoint masses (log space).
    const grow = new Float64Array(m);
    let cpTerms = -Infinity;
    for (let i = 0; i < m; i++) {
      const a = logR[i] + logPred[i];
      grow[i] = a + Math.log1p(-H);
      cpTerms = logAdd(cpTerms, a + Math.log(H));
    }
    // New run-length list: 0 then each old run length + 1.
    let nrl = [0, ...rl.map((r) => r + 1)];
    let nlog = [cpTerms, ...grow];
    let nmu = [p0.mu], nk = [p0.kappa], na = [p0.alpha], nb = [p0.beta];
    let ngrids = null;
    if (useNbGrid) {
      ngrids = [priorGrid];
      for (let i = 0; i < m; i++) {
        const w = grids[i], u = new Float64Array(NB_GRID);
        for (let g = 0; g < NB_GRID; g++) u[g] = w[g] + lik[g] - logPred[i];
        ngrids.push(u);
      }
    }
    for (let i = 0; i < m; i++) {
      if (rho && !pois) {
        const a = aAt(i), z = zAt(i), k1 = kappa[i] + a * a;
        nmu.push((kappa[i] * mu[i] + a * z) / k1);
        nk.push(k1);
        na.push(alpha[i] + 0.5);
        nb.push(beta[i] + (kappa[i] * (z - a * mu[i]) ** 2) / (2 * k1));
        continue;
      }
      const k1 = kappa[i] + 1;
      nmu.push((kappa[i] * mu[i] + xt) / k1);
      nk.push(k1);
      if (useNbGrid) {
        na.push(0); nb.push(0);
      } else if (useNb) {
        na.push(alpha[i] + nbSize);
        nb.push(beta[i] + xt);
      } else if (pois) {
        na.push(alpha[i] + xt / phi);
        nb.push(beta[i] + (exposure ? exposure[t] : 1) / phi);
      } else {
        na.push(alpha[i] + 0.5);
        nb.push(beta[i] + (kappa[i] * (xt - mu[i]) ** 2) / (2 * k1));
      }
    }
    let z = -Infinity;
    for (const v of nlog) z = logAdd(z, v);
    logEvidence += z;
    nlog = nlog.map((v) => v - z);
    // Prune negligible run lengths, always keeping r = 0.
    const keep = nlog.map((v, i) => i === 0 || v > Math.log(prune));
    if (keep.some((k) => !k)) {
      const f = (arr) => arr.filter((_, i) => keep[i]);
      nrl = f(nrl); nmu = f(nmu); nk = f(nk); na = f(na); nb = f(nb); nlog = f(nlog);
      if (ngrids) ngrids = f(ngrids);
      let z2 = -Infinity;
      for (const v of nlog) z2 = logAdd(z2, v);
      nlog = nlog.map((v) => v - z2);
    }
    rl = nrl; mu = nmu; kappa = nk; alpha = na; beta = nb; logR = nlog;
    if (ngrids) grids = ngrids;
    let best = 0, bestV = -Infinity, e = 0;
    const post = new Map();
    for (let i = 0; i < rl.length; i++) {
      const p = Math.exp(logR[i]);
      post.set(rl[i], p);
      e += p * rl[i];
      if (logR[i] > bestV) { bestV = logR[i]; best = rl[i]; }
    }
    mapRun[t] = best;
    expRun[t] = e;
    window.push(post);
    if (window.length > lag + 1) window.shift();
    // r_t counts the points of the current run up to and including x[t], so
    // the run started at x[t - lag] iff r_t = lag + 1.
    if (t - lag >= 1) changeProb[t - lag] = post.get(lag + 1) ?? 0;
  }
  // Points within `lag` of the end are scored with the data available.
  for (let i = Math.max(0, n - lag); i < n; i++) {
    changeProb[i] = window[window.length - 1]?.get(n - i) ?? 0;
  }
  changeProb[0] = 0; // The series starts a segment by definition; not a change.
  return { mapRun: [...mapRun], expectedRun: [...expRun], changeProb: [...changeProb], logEvidence, prior: p0, hazard: H };
}

/** Prior centred on the data: mean at the median, variance at the robust noise variance, weak (kappa=0.1, alpha=1). */
export function defaultPrior(x) {
  const sd = robustSd(x);
  return { mu: x.length ? median(x) : 0, kappa: 0.1, alpha: 1, beta: sd * sd };
}

/** Weak Gamma prior on the rate, centred on the series mean (prior weight of 1 observation). */
export function defaultPoissonPrior(x) {
  const mean = x.length ? x.reduce((s, v) => s + v, 0) / x.length : 1;
  const m = Math.max(mean, 1e-3);
  return { mu: 0, kappa: 1, alpha: m, beta: 1 };
}

/** Beta(a, b) prior on p for NB(r, p) counts: a = 2 and b set so the prior mean count r b / (a - 1) is the series mean. */
export function defaultNbPrior(x, r) {
  const mean = x.length ? x.reduce((s, v) => s + v, 0) / x.length : 1;
  return { mu: 0, kappa: 1, alpha: 2, beta: Math.max(mean, 1e-3) / r };
}

function lbeta(a, b) { return lgamma(a) + lgamma(b) - lgamma(a + b); }

/** log P(k) for a Poisson count whose rate has a Gamma(alpha, beta) posterior: negative binomial. */
function gammaPoissonLogPmf(k, alpha, beta, e = 1) {
  // k ~ Poisson(rate * e), rate ~ Gamma(alpha, beta): negative binomial with success probability beta / (beta + e)
  return lgamma(k + alpha) - lgamma(alpha) - lgamma(k + 1) + alpha * Math.log(beta / (beta + e)) + k * Math.log(e / (beta + e));
}

/** Closed-form log marginal likelihood of counts under one Gamma-Poisson segment (test reference for hazard -> 0). */
export function gammaPoissonLogMarginal(x, { alpha, beta }) {
  const a = x.reduce((s, v) => s + v, 0);
  const logFact = x.reduce((s, v) => s + lgamma(v + 1), 0);
  return alpha * Math.log(beta) - lgamma(alpha) + lgamma(alpha + a) - (alpha + a) * Math.log(beta + x.length) - logFact;
}

function studentLogPdf(x, mu, kappa, alpha, beta) {
  const nu = 2 * alpha;
  const scale2 = (beta * (kappa + 1)) / (alpha * kappa);
  const z = (x - mu) ** 2 / (nu * scale2);
  return lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI * scale2) - ((nu + 1) / 2) * Math.log1p(z);
}

/** Student-t log density of z = a mu + e under the NIG posterior of mu (regressor a); a = 1 is studentLogPdf. */
function studentLogPdfReg(z, a, mu, kappa, alpha, beta) {
  const nu = 2 * alpha;
  const scale2 = (beta * (1 + (a * a) / kappa)) / alpha;
  const d = (z - a * mu) ** 2 / (nu * scale2);
  return lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI * scale2) - ((nu + 1) / 2) * Math.log1p(d);
}

function logAdd(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  return a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b));
}

/** Closed-form log marginal likelihood of x under one Normal-Inverse-Gamma segment (test reference for hazard -> 0). */
export function nigLogMarginal(x, { mu, kappa, alpha, beta }) {
  const n = x.length;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const ss = x.reduce((s, v) => s + (v - mean) ** 2, 0);
  const kn = kappa + n;
  const an = alpha + n / 2;
  const bn = beta + ss / 2 + (kappa * n * (mean - mu) ** 2) / (2 * kn);
  return lgamma(an) - lgamma(alpha) + alpha * Math.log(beta) - an * Math.log(bn) + 0.5 * (Math.log(kappa) - Math.log(kn)) - (n / 2) * Math.log(2 * Math.PI);
}

/** Local maxima of changeProb at or above threshold, at least `gap` apart (strongest kept). */
export function peaks(prob, threshold = 0.5, gap = 3) {
  const cand = [];
  for (let i = 1; i < prob.length; i++) {
    if (prob[i] < threshold) continue;
    if ((prob[i - 1] ?? 0) > prob[i] || (prob[i + 1] ?? 0) > prob[i]) continue;
    cand.push(i);
  }
  cand.sort((a, b) => prob[b] - prob[a]);
  const kept = [];
  for (const i of cand) if (kept.every((k) => Math.abs(k - i) >= gap)) kept.push(i);
  return kept.sort((a, b) => a - b);
}

// ---------------------------------------------------------------- analyze

function stats(a) {
  const n = a.length;
  const mean = a.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd };
}

const round = (v, d = 4) => (Number.isFinite(v) ? Number(v.toPrecision(d + 2)) : v);
const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));

/**
 * Run both methods on a series. Input: DEFAULTS overlaid with the caller's
 * fields; `values` (array of numbers) may replace `csv`.
 */
// Segment-standardise a series by the fitted changepoints, then look for what a Gaussian variance model cannot hold:
// fourth moment above 4.5 (Gaussian runs top out near 3.9), lag-1 autocorrelation of the residuals from 0.25, and of their
// squares from 0.2 (Gaussian 90th percentiles 0.08 and 0.11). Returns a warning string or null.
/**
 * Dispersion of the squared segment-standardised residuals relative to Gaussian noise (1 for Gaussian, larger for heavy
 * tails or clustered volatility): their long-run variance (Bartlett window) over 2. `--dispersion` multiplies the meanvar
 * penalty by it, as `overdispersion` does for counts (eval/meanvar-dispersion.mjs, README).
 */
export function squaredDispersion(x, cps) {
  const b = [0, ...cps, x.length]; const z = [];
  for (let s = 0; s < b.length - 1; s++) {
    const seg = x.slice(b[s], b[s + 1]); if (!seg.length) continue;
    const m = seg.reduce((a, c) => a + c, 0) / seg.length;
    const sd = Math.sqrt(seg.reduce((a, c) => a + (c - m) ** 2, 0) / seg.length) || 1;
    for (const c of seg) z.push((c - m) / sd);
  }
  const n = z.length, q = z.map((c) => c * c), m = q.reduce((a, c) => a + c, 0) / n;
  const g = (k) => { let t = 0; for (let i = k; i < n; i++) t += (q[i] - m) * (q[i - k] - m); return t / n; };
  const L = Math.floor(Math.sqrt(n) / 1.5) || 1; let lrv = g(0);
  for (let k = 1; k <= L; k++) lrv += 2 * (1 - k / (L + 1)) * g(k);
  return Math.max(1, lrv / 2);
}

/**
 * Block-bootstrap penalty for the meanvar model: standardise the series by a 3x BIC fit, resample the residuals in blocks
 * (which keeps volatility clustering and short memory), and take the 95th percentile of the best single-split cost drop
 * over the resamples. Returns max(BIC, that), so it only ever raises the penalty. Seeded, so the same series gives the
 * same answer. eval/meanvar-block-bootstrap.mjs, README "--bootstrap".
 */
export function bootstrapPenalty(x, { minSegment = 10, resamples = 100, seed = 12345, model = 'meanvar', sigma = robustSd(x), exposure = null } = {}) {
  if (model === 'poisson') return poissonBootstrapPenalty(x, { minSegment, resamples, seed, exposure });
  // model 'mean': residuals about the segment means are kept in units of the noise scale `sigma` the mean cost uses, so
  // autocorrelated or clustered noise (residual sd above sigma) raises the penalty; meanvar standardises each segment.
  const n = x.length, bic = penaltyValue('bic', n, model);
  if (n < 4 * minSegment) return bic;
  const cps = pelt(x, { model, penalty: (model === 'mean' ? 2 : 3) * bic, minSegment, sigma }).changepoints;
  const b = [0, ...cps, n], z = [];
  for (let s = 0; s < b.length - 1; s++) {
    const seg = x.slice(b[s], b[s + 1]); const m = seg.reduce((a, c) => a + c, 0) / seg.length;
    const sd = model === 'mean' ? (sigma || 1) : Math.sqrt(seg.reduce((a, c) => a + (c - m) ** 2, 0) / seg.length) || 1;
    for (const c of seg) z.push((c - m) / sd);
  }
  let st = seed >>> 0;
  const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const L = Math.ceil(2 * Math.cbrt(n)), gains = [];
  for (let r = 0; r < resamples; r++) {
    const y = []; while (y.length < n) { const s = Math.floor(rnd() * (n - L + 1)); for (let i = 0; i < L; i++) y.push(z[s + i]); }
    y.length = n;
    const c = makeCost(y, model, 1), whole = c(0, n); let g = 0;
    for (let s = minSegment; s <= n - minSegment; s++) g = Math.max(g, whole - c(0, s) - c(s, n));
    gains.push(g);
  }
  gains.sort((a, c) => a - c);
  return Math.max(bic, gains[Math.floor(0.95 * (resamples - 1))]);
}

/**
 * Block-bootstrap penalty for the Poisson model. A 3x BIC fit gives Pearson residuals (count minus segment rate times
 * exposure, over its root); resampled in blocks they keep clustering (overdispersion that comes in runs) and are turned
 * back into counts about the overall rate, max(0, round(rate*e + r*sqrt(rate*e))). The 95th percentile of the best
 * single-split drop over the resamples is the penalty, never below BIC. eval/poisson-block-bootstrap.mjs.
 */
export function poissonBootstrapPenalty(x, { minSegment = 2, resamples = 100, seed = 12345, exposure = null } = {}) {
  const n = x.length, bic = penaltyValue('bic', n, 'poisson');
  if (n < 4 * minSegment) return bic;
  const e = (t) => (exposure ? exposure[t] : 1);
  const cps = pelt(x, { model: 'poisson', penalty: 3 * bic, minSegment, exposure }).changepoints;
  const b = [0, ...cps, n], z = [];
  for (let s = 0; s < b.length - 1; s++) {
    let a = 0, m = 0; for (let t = b[s]; t < b[s + 1]; t++) { a += x[t]; m += e(t); }
    const lam = m > 0 ? a / m : 0;
    for (let t = b[s]; t < b[s + 1]; t++) { const mu = lam * e(t); z.push(mu > 0 ? (x[t] - mu) / Math.sqrt(mu) : 0); }
  }
  const tot = x.reduce((a, c) => a + c, 0), den = Array.from({ length: n }, (_, t) => e(t)).reduce((a, c) => a + c, 0), lam0 = tot / den;
  if (!(lam0 > 0)) return bic;
  let st = seed >>> 0;
  const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const L = Math.ceil(2 * Math.cbrt(n)), gains = [];
  for (let r = 0; r < resamples; r++) {
    const zr = []; while (zr.length < n) { const s = Math.floor(rnd() * (n - L + 1)); for (let i = 0; i < L; i++) zr.push(z[s + i]); }
    const y = Array.from({ length: n }, (_, t) => { const mu = lam0 * e(t); return Math.max(0, Math.round(mu + zr[t] * Math.sqrt(mu))); });
    const c = makeCost(y, 'poisson', 1, 0, exposure), whole = c(0, n); let g = 0;
    for (let q = minSegment; q <= n - minSegment; q++) g = Math.max(g, whole - c(0, q) - c(q, n));
    gains.push(g);
  }
  gains.sort((a, c) => a - c);
  return Math.max(bic, gains[Math.floor(0.95 * (resamples - 1))]);
}

export function meanvarNoiseCheck(x, cps, robust = false) {
  const b = [0, ...cps, x.length]; const z = [];
  for (let s = 0; s < b.length - 1; s++) {
    const seg = x.slice(b[s], b[s + 1]); if (!seg.length) continue;
    const m = seg.reduce((a, c) => a + c, 0) / seg.length;
    const sd = Math.sqrt(seg.reduce((a, c) => a + (c - m) ** 2, 0) / seg.length) || 1;
    for (const c of seg) z.push((c - m) / sd);
  }
  const n = z.length;
  const acf = (a) => { const m = a.reduce((p, c) => p + c, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { den += (a[i] - m) ** 2; if (i) num += (a[i] - m) * (a[i - 1] - m); } return den ? num / den : 0; };
  const kurt = z.reduce((a, c) => a + c ** 4, 0) / n;
  const sq = z.map((c) => c * c);
  const r1 = acf(z), r2 = acf(sq);
  // Ljung-Box over lags 1..5 of the squares: volatility clustering that decays slowly (GARCH) shows at lags 2 to 5 while lag 1 stays
  // under 0.2. 11.07 is the 95th percentile of chi-square(5), and Gaussian runs exceed it 5% of the time (eval/meanvar-robustness.mjs).
  let q = 0;
  if (n >= 50) for (let k = 1; k <= 5; k++) { const m = sq.reduce((p, c) => p + c, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { den += (sq[i] - m) ** 2; if (i >= k) num += (sq[i] - m) * (sq[i - k] - m); } const rk = den ? num / den : 0; q += rk * rk / (n - k); }
  q *= n * (n + 2);
  const why = [];
  if (kurt > 4.5 && !robust) why.push(`heavy tails (kurtosis ${kurt.toFixed(1)}, 3 for Gaussian noise)`);
  if (r1 >= 0.25) why.push(`autocorrelation (lag 1: ${r1.toFixed(2)})`);
  if (r2 >= 0.2) why.push(`clustered volatility (lag 1 of the squares: ${r2.toFixed(2)})`);
  else if (q >= 11.07) why.push(`clustered volatility (Ljung-Box over lags 1 to 5 of the squares: ${q.toFixed(1)}, 11.1 is the 5% line)`);
  if (!why.length) return null;
  return `The values left after removing the segments show ${why.join(' and ')}. The variance model assumes independent Gaussian noise, so on such noise it reports changes that are not there: treat the dates as candidates, not findings.`;
}

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  let labels, values, column, skipped = 0;
  if (Array.isArray(o.values)) {
    values = o.values.map(Number).filter(Number.isFinite);
    labels = Array.isArray(o.labels) ? o.labels.map(String) : values.map((_, i) => String(i + 1));
    column = 'values';
    skipped = o.values.length - values.length;
  } else {
    ({ labels, values, column, skipped } = parseSeries(o.csv, o.column, o.labelColumn));
  }
  if (values.length < 4) throw new Error(`Need at least 4 numbers; got ${values.length}.`);
  if (values.length > 100000) throw new Error('More than 100,000 points: aggregate the series first.');
  const model = o.model === 'meanvar' || o.model === 'poisson' || o.model === 'trend' ? o.model : 'mean';
  // log: a series that grows by a constant percentage is a straight line once logged; segments are reported back in original units
  const original0 = values;
  if (o.log) {
    if (model === 'poisson') throw new Error('Taking logs is for the "mean", "meanvar" and "trend" models, not counts: counts already model the rate as a factor.');
    const bad = values.findIndex((v) => !(v > 0));
    if (bad >= 0) throw new Error(`Taking logs needs positive values; row ${bad + 1} is ${values[bad]}.`);
    values = values.map(Math.log);
  }
  if (model === 'poisson') {
    const bad = values.findIndex((v) => v < 0 || !Number.isInteger(v));
    if (bad >= 0) throw new Error(`The Poisson model needs counts (whole numbers, 0 or more); row ${bad + 1} is ${values[bad]}.`);
  }
  const period = Math.floor(Number(o.period) || 0);
  let burstInfo = null;
  const rawCounts = values;
  if (o.episodes && model !== 'poisson') throw new Error('Episodes are for counts: use model "poisson".');
  if (o.bursts) {
    if (model !== 'poisson') throw new Error('The burst rule is for counts: use model "poisson".');
    const b = findBursts(values, { period, ratio: typeof o.bursts === "number" ? o.bursts : 2.5, runs: o.burstRuns || 0, ...(o.burstRunRatio ? { runRatio: o.burstRunRatio } : {}) });
    burstInfo = b.indexes.map((i) => ({ index: i, label: labels[i], value: values[i], keptAs: b.counts[i] }));
    values = b.counts;
  }
  let phi = null, penalty = o.penalty;
  let nbSize = 0;
  if (o.overdispersion === 'nb') {
    if (model !== 'poisson') throw new Error('The negative-binomial cost is for counts: use model "poisson".');
  } else if (o.overdispersion) {
    if (model !== 'poisson') throw new Error('The dispersion correction is for counts: use model "poisson".');
    phi = typeof o.overdispersion === 'number' ? Math.max(1, o.overdispersion) : countDispersion(values, period);
    penalty = phi * penaltyValue(o.penalty ?? 'bic', values.length, 'poisson');
  }
  let profile = null, exposure = null, seasonMultiplicative = false;
  const original = values;
  let holIdx = null, holKinds = null;
  if (o.holidays && o.holidays.length) {
    if (model !== 'poisson') throw new Error('Holidays are for counts: use model "poisson".');
    // entries are row labels (the date column when there is one, else the 1-based row number)
    const at = new Map(labels.map((l, i) => [String(l), i]));
    // an entry may be "label=kind": holidays of one kind share a factor, each kind gets its own
    const parts = o.holidays.map((h) => { const [lab, ...rest] = String(h).split('='); return { lab: lab.trim(), kind: rest.length ? rest.join('=').trim() : '' }; });
    holIdx = parts.map(({ lab }) => { const i = at.get(lab); if (i === undefined) throw new Error(`Holiday "${lab}" is not a row label in the series.`); return i; });
    holKinds = parts.some((p) => p.kind) ? parts.map((p) => p.kind || 'other') : null;
  }
  if (period) {
    if (model === 'poisson') {
      if (o.drift) throw new Error('A drifting seasonal shape is not available for counts: leave out drift, or use "mean" or "meanvar".');
      const fit = poissonSeasonal(original, period, { penalty, minSegment: Math.max(1, Math.floor(Number(o.minSegment) || 2)), skip: holIdx ? new Set(holIdx) : null });
      exposure = fit.exposure;
      profile = fit.factors;
    } else {
      if (o.seasonMode === 'multiplicative' && model === 'trend') throw new Error('A multiplicative season is not available with the trend model.');
      ({ adjusted: values, profile } = seasonalAdjust(original, period, { drift: !!o.drift, multiplicative: o.seasonMode === 'multiplicative' }));
      if (o.seasonMode === 'multiplicative') seasonMultiplicative = true;
    }
  }
  let holidayFit = null;
  if (holIdx) {
    const ms = Math.max(1, Math.floor(Number(o.minSegment) || 2));
    holidayFit = poissonHolidays(original, holIdx, { base: exposure, penalty, minSegment: ms, kinds: holKinds });
    exposure = holidayFit.exposure;
    // alternate: the seasonal PELT pass sees the holiday exposure, then the holidays are refitted on the new seasonal factors
    for (let round = 0; period && round < 2 && !o.noHolidayAlternation; round++) {
      const hx = exposure.map((v, t) => v / profile[t % period]);
      const fit = poissonSeasonal(original, period, { penalty, minSegment: ms, skip: new Set(holIdx), extra: hx });
      profile = fit.factors;
      holidayFit = poissonHolidays(original, holIdx, { base: fit.exposure, penalty, minSegment: ms, kinds: holKinds });
      exposure = holidayFit.exposure;
    }
  }
  let slope = null, slopeAfter, knot, knots, slopes, knotRanges;
  let growth = null, countKnot, growthAfter, countKnots, countRates, countRanges;
  const nbAfterExposure = () => { if (o.overdispersion === 'nb') nbSize = negbinSize(exposure ? original.map((v, t) => v / exposure[t]) : values); };
  if (o.trend && model === 'poisson') {
    if (o.trend !== true && o.trend !== 'bend' && o.trend !== 'bends') throw new Error('For counts, --trend takes one common growth rate under the steps, "bend" for one change of growth rate or "bends" for up to two.');
    const fit = poissonTrend(original, { base: exposure, penalty, minSegment: Math.max(1, Math.floor(Number(o.minSegment) || 2)), bend: o.trend === 'bend' ? 1 : o.trend === 'bends' ? 2 : false, knotMargin: o.knotMargin, scale: phi ?? 1, diag: o.diagBends || null,
      nbSize: o.overdispersion === 'nb' ? negbinSize(exposure ? original.map((v, t) => v / exposure[t]) : original) : 0 });
    exposure = fit.exposure;
    growth = fit.g;
    if (fit.knot !== undefined) { countKnot = fit.knot; growthAfter = fit.slopeAfter; countKnots = fit.knots; countRates = fit.rates; countRanges = fit.knotRanges; }
  } else if (o.trend) {
    ({ adjusted: values, slope, slopeAfter, knot, knots, slopes, knotRanges } = trendAdjust(values, { penalty: o.penalty, minSegment: Math.max(1, Math.floor(Number(o.minSegment) || (model === 'meanvar' ? 10 : 2))), ar1: !!o.ar1 && model === 'mean', bend: o.trend === 'bend' ? 1 : o.trend === 'bends' ? 3 : false, joint: !!o.jointKnots, knotMargin: o.knotMargin }));
  }
  nbAfterExposure();
  let sigma = robustSd(values);
  let rho = null;
  const joint = o.ar1 === 'joint';
  if (o.ar1) {
    if (model !== 'mean') throw new Error('The autocorrelation correction is for the "mean" model only.');
    rho = ar1Rho(values);
    if (!joint) sigma = longRunSd(sigma, rho);
  }
  const minSegment = Math.max(1, Math.floor(Number(o.minSegment) || (model === 'meanvar' ? 10 : model === 'trend' ? 4 : 2)));
  // robust: the variance model with Laplace noise, for heavy tails (eval/meanvar-laplace.mjs, README)
  const robust = !!o.robust && model === 'meanvar';
  if (o.robust && model !== 'meanvar') throw new Error('The robust cost is for the "meanvar" model only.');
  let p;
  if (joint) {
    p = ar1JointFit(values, { penalty: o.penalty, minSegment });
    ({ rho, sigma } = p);
  } else p = isFinite(nbSize) && nbSize > 0 ? pelt(values, { model: 'negbin', penalty, minSegment, size: nbSize, exposure }) : pelt(values, { model: robust ? 'meanvarlaplace' : model, penalty, minSegment, sigma, exposure });
  // dispersion: refit with the penalty scaled by the squared residuals' dispersion (heavy tails, clustered volatility)
  let dispersion = null;
  if (o.dispersion) {
    if (model !== 'meanvar' || robust) throw new Error('The dispersion penalty is for the "meanvar" model without --robust.');
    const f = squaredDispersion(values, p.changepoints);
    if (f > 1.0001) { dispersion = round(f, 2); p = pelt(values, { model, penalty: f * penaltyValue(penalty ?? 'bic', values.length, model), minSegment, sigma, exposure }); }
  }
  // bootstrap: refit with a penalty read off block-resampled residuals (clustered volatility, heavy tails, short memory)
  let bootstrap = null;
  if (o.bootstrap) {
    if ((model !== 'meanvar' && model !== 'mean' && model !== 'poisson') || robust || o.dispersion || o.ar1) throw new Error('The bootstrap penalty is for the "meanvar", "mean" or "poisson" model without --robust, --dispersion or --ar1.');
    const bp = bootstrapPenalty(values, { minSegment, model, sigma, exposure });
    const bic = penaltyValue(penalty ?? 'bic', values.length, model);
    if (bp > bic * 1.0001) { bootstrap = round(bp, 2); p = pelt(values, { model, penalty: bp, minSegment, sigma, exposure }); }
  }
  const bounds = [0, ...p.changepoints, values.length];
  const segments = [];
  const lines = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const s = stats(values.slice(bounds[i], bounds[i + 1]));
    // seasonal counts: the segment's mean is its rate per average-season point, total over total exposure
    if (exposure) { let a = 0, E = 0; for (let t = bounds[i]; t < bounds[i + 1]; t++) { a += values[t]; E += exposure[t]; } s.mean = a / E; }
    const seg = { start: bounds[i], end: bounds[i + 1] - 1, from: labels[bounds[i]], to: labels[bounds[i + 1] - 1], n: s.n, mean: round(s.mean), sd: round(s.sd) };
    if (o.log && !o.trend && model !== 'trend') seg.geometricMean = round(Math.exp(s.mean), 4);
    if (model === 'trend') {
      const f = lineFit(values, bounds[i], bounds[i + 1]);
      lines.push(f);
      Object.assign(seg, { slope: round(f.slope, 4), sd: round(f.sd) });
    }
    segments.push(seg);
  }
  // With --ar1 the Bayesian pass uses the conditional AR(1) likelihood on the original series (rho fixed),
  // not the prewhitened one: prewhitening turns a shift into a spike plus a (1 - rho)-sized step.
  // The trend model's Bayesian pass runs the level model on the series minus a straight line whose slope is the
  // median first difference: a level shift touches one difference only, so the slope estimate ignores it.
  let bvals = values;
  if (model === 'trend') {
    const slope = median(values.slice(1).map((v, i) => v - values[i]));
    bvals = values.map((v, i) => v - slope * i);
  }
  // robust: the Bayesian pass reads the series clipped at the median +- 2 robust sds, so a heavy-tailed outlier is one
  // bounded surprise, not evidence of a new segment (eval/meanvar-bayes-tails.mjs, README)
  if (robust) { const m = median(bvals), c = 2 * robustSd(bvals); bvals = bvals.map((v) => Math.max(m - c, Math.min(m + c, v))); }
  const b = bocpd(bvals, { ...(rho ? { rho, prior: { ...defaultPrior(prewhiten(values, rho)), mu: median(values) } } : {}), hazardLambda: Number(o.hazardLambda) || 100, lag: Math.max(1, Math.floor(Number(o.lag) || 5)), model: model === 'trend' ? 'mean' : model, exposure, dispersion: phi ?? 1, nbSize: isFinite(nbSize) && nbSize > 0 ? nbSize : 0 });
  const det = peaks(b.changeProb, Number(o.threshold) || 0.5);
  // joint AR(1) fits use their own likelihood, so no range is offered for them
  let ranges = null;
  if (!joint && o.intervals !== false) {
    const nbOn = isFinite(nbSize) && nbSize > 0;
    ranges = changeIntervals(p.changepoints, values.length, nbOn ? makeCost(values, 'negbin', sigma, 0, exposure, nbSize) : makeCost(values, robust ? 'meanvarlaplace' : model, sigma, 0, exposure), { minSegment, level: 0.95 });
  }
  // the range assumes independent noise: on sticky series without --ar1 it is far too narrow (57% and 30% coverage, README)
  let rangeWarning = null;
  if (ranges && model === 'mean' && !o.ar1 && values.length >= 20) {
    const r0 = ar1Rho(values);
    const vr0 = r0 < 0.3 ? blockVarianceRatio(values) : 0;
    if (r0 < 0.3 && p.changepoints.length >= 5 && vr0 >= 3) rangeWarning = `The series' level wanders more than independent noise allows (block means vary ${round(vr0, 1)} times as much; white noise gives about 1) although the lag-1 correlation is small (rho about ${round(r0, 2)}), so these ${p.changepoints.length} steps and their ranges may be false alarms from slow drift or a cycle rather than separate regime changes: on 7,980 yearly tree rings with no documented step the default found 38, --ar1 still 11 (README, quiet series). A real step raises this ratio too, so read it as a prompt to check dates, not as a verdict.`;
    if (r0 >= 0.3) rangeWarning = `The series looks autocorrelated (rho about ${round(r0, 2)}), so these ranges are too narrow: use --ar1 (page: allow for autocorrelation).${p.changepoints.length >= 5 ? ` With ${p.changepoints.length} steps at this rho, many may be false alarms: on real cycles with no documented step the default found 23 (lynx) and 46 (sunspots), --ar1 found none and --ar1 joint kept a 2 sd step (README, cyclic series).` : ''}`;
  }
  // the same for counts that vary more than Poisson: the plain Poisson range held the date in 6% to 42% of overdispersed series (README)
  if (ranges && !rangeWarning && model === 'poisson' && !phi && !(isFinite(nbSize) && nbSize > 0) && values.length >= 90) {
    const d0 = countDispersion(values, period);
    if (d0 >= 2.5) rangeWarning = `These counts vary about ${round(d0, 1)} times more than Poisson counts would, so these ranges are too narrow: use the negative-binomial cost (--overdispersion nb).`;
  }
  // a variance model reads a short run of similar values as its own calm regime: on 202 quarters of US GDP growth the
  // default 5-point minimum made a 5-quarter patch a segment and its range missed the documented date (README, Great Moderation)
  if (!rangeWarning && model === 'meanvar' && p.changepoints.length) {
    const short = segments.filter((s) => s.n < 10);
    if (short.length) rangeWarning = `${short.length === 1 ? 'One segment has' : `${short.length} segments have`} fewer than 10 points (${short.map((s) => `${s.from} to ${s.to}`).join(', ')}), and a variance model can read a short quiet run as its own regime: check the dates, or try --min-segment 12 or more.`;
  }
  // a variance model assumes Gaussian noise: on heavy-tailed, autocorrelated or volatility-clustered noise with no change at all it
  // reported one 35% to 68% of the time (eval/meanvar-robustness.mjs, README). Warn from the segment-standardised residuals.
  if (!rangeWarning && model === 'meanvar' && values.length >= 40) {
    const nd = meanvarNoiseCheck(values, p.changepoints, robust);
    if (nd) rangeWarning = nd;
  }
  // a drifting seasonal shape that the profile cannot follow shows up as a run of steps inside a cycle or two (UK gas, README):
  // they mark a changing seasonal shape, not separate regime changes
  let driftWarning = null;
  if (o.drift && period && p.changepoints.length >= 3) {
    const cp = p.changepoints;
    const k = cp.findIndex((c, j) => j + 2 < cp.length && cp[j + 2] - c <= 2 * period);
    // autocorrelated noise alone fires this warning (75% to 88% of null series at rho 0.5, eval/drift-warning-null195-ar1.mjs); --ar1 cut that to 0 to 3%
    const hintAr1 = !o.ar1 && ar1Rho(values) >= 0.3 ? ` The residuals look autocorrelated (rho about ${round(ar1Rho(values), 2)}), which alone can cause such a run of steps: re-run with --ar1 (page: allow for autocorrelation) before reading them as a changing shape.` : '';
    if (k >= 0) driftWarning = `With a drifting seasonal shape, ${cp.slice(k).filter((c) => c - cp[k] <= 2 * period).length} steps fall within two cycles of ${labels[cp[k]]}: that usually marks a seasonal shape that is still changing (for example an amplitude that grows), not separate regime changes. Check the dates against the series.${hintAr1}`;
  }
  // a cycle read as steps leaves a spectral peak in the residuals (Fisher's g; sunspots p 2e-6, ~1-3% false on synthetic nulls,
  // README 2026-10-30); with --period the season is already modelled, so the hint stays off
  let cycleWarning = null;
  if (!period && model !== 'poisson' && p.changepoints.length >= 5 && values.length >= 60) {
    const fg = fisherG(stepResiduals(values, p.changepoints));
    if (fg.p < 0.01 && fg.period >= 3) cycleWarning = `The residuals about these ${p.changepoints.length} steps carry a periodic component (peak at about ${round(fg.period, 1)} points, p ${fg.p < 1e-4 ? '< 0.0001' : round(fg.p, 4)}), so some steps may be a cycle read as regime changes, not separate changes: on sunspots (an 11-year cycle) the default found 46 steps and none were real. If the period is known, give it with --period; otherwise read the dates with care.`;
  }
  const changes = p.changepoints.map((i, k) => {
    const before = segments[k];
    const after = segments[k + 1];
    let near = 0;
    for (let j = Math.max(1, i - 3); j <= Math.min(values.length - 1, i + 3); j++) near = Math.max(near, b.changeProb[j]);
    const trend = model === 'trend' ? {
      // the jump between the two fitted lines at the change, and the slope on each side
      jump: round(lines[k + 1].at(i) - lines[k].at(i)),
      slopeBefore: before.slope,
      slopeAfter: after.slope,
    } : null;
    return {
      index: i,
      label: labels[i],
      lastBefore: labels[i - 1],
      meanBefore: before.mean,
      meanAfter: after.mean,
      shift: trend ? trend.jump : round(after.mean - before.mean),
      ...(trend ? { jump: trend.jump, slopeBefore: trend.slopeBefore, slopeAfter: trend.slopeAfter } : {}),
      ...(o.log ? { ratio: round(Math.exp(trend ? trend.jump : after.mean - before.mean), 4) } : {}),
      shiftInNoiseSd: round((trend ? trend.jump : after.mean - before.mean) / (joint ? longRunSd(sigma / Math.sqrt(1 + rho), rho) : sigma), 3),
      sdBefore: before.sd,
      sdAfter: after.sd,
      bocpdProbWithin3: round(near, 3),
      ...(ranges ? { range95: { from: labels[ranges[k].from], to: labels[ranges[k].to], fromIndex: ranges[k].from, toIndex: ranges[k].to } } : {}),
    };
  });
  const excursions = model === 'poisson' ? findExcursions(original, p.changepoints, { exposure }).map((x) => ({ from: labels[x.fromIndex], to: labels[x.toIndex], fromIndex: x.fromIndex, toIndex: x.toIndex, length: x.length, direction: x.direction, baselineRate: round(x.baselineRate), excursionRate: round(x.excursionRate), ratio: x.ratio === null ? null : round(x.ratio, 3), sameBaselineLR: round(x.sameBaselineLR, 3) })) : [];
  const summary = summarize({ n: values.length, column, model, changes, det, labels, prob: b.changeProb, skipped }) + (o.log ? ' Values are natural logs: a move of x in the mean is a factor of e^x (the ratio is in each change).' : '') + excursions.map((x) => ` Changes at ${x.from} and just after ${x.to} may be one temporary ${x.direction === 'up' ? 'burst' : 'dip'}, not two steps: the rate before and after it is the same (${fmt(x.baselineRate)} a point, likelihood ratio ${fmt(x.sameBaselineLR)} against 3.84), and inside it is ${fmt(x.excursionRate)}.`).join('');
  return {
    n: values.length,
    column,
    skipped,
    model,
    noiseSd: round(sigma),
    ...(period ? { seasonal: { period, profile: profile.map((v) => round(v, exposure || seasonMultiplicative ? 3 : undefined)), ...(exposure || seasonMultiplicative ? { multiplicative: true } : {}) } } : {}),
    ...(slope !== null ? { trend: { slopePerPoint: round(slope, 6), ...(knot !== undefined ? { slopeAfter: round(slopeAfter, 6), slopeChangesAt: knot, ...(knotRanges ? { slopeChangeRange95: knotRanges.map((r) => ({ at: labels[r.knot], from: labels[r.from], to: labels[r.to], fromIndex: r.from, toIndex: r.to })) } : {}), ...(knots.length > 1 ? { slopeChangesAtAll: knots, slopes: slopes.map((v) => round(v, 6)) } : {}) } : {}) } } : {}),
    ...(growth !== null ? { trend: { logGrowthAcrossSeries: round(growth, 4), growthFactorAcrossSeries: round(Math.exp(growth), 4), multiplicative: true, ...(countKnot !== undefined ? { growthChangesAt: countKnot, logGrowthAcrossSeriesAfter: round(growthAfter, 4), ...(countRanges ? { growthChangeRange95: countRanges.map((r) => ({ at: labels[r.knot], from: labels[r.from], to: labels[r.to], fromIndex: r.from, toIndex: r.to })), ...(o.overdispersion === 'nb' ? { growthChangeRangeNote: GROWTH_RANGE_NB_NOTE } : {}) } : {}), ...(countKnots.length > 1 ? { growthChangesAtAll: countKnots, logGrowthAcrossSeriesRates: countRates.map((v) => round(v, 4)) } : {}) } : {}) } } : {}),
    ...(holidayFit ? { holidays: { count: holidayFit.count, factor: round(holidayFit.factor, 3), ...(holidayFit.kinds ? { kinds: holidayFit.kinds.map((k) => ({ ...k, factor: round(k.factor, 3) })) } : {}) } } : {}),
    ...(dispersion ? { dispersion } : {}),
    ...(bootstrap ? { bootstrapPenalty: bootstrap } : {}),
    ...(rangeWarning ? { rangeWarning } : {}),
    ...(driftWarning ? { driftWarning } : {}),
    ...(cycleWarning ? { cycleWarning } : {}),
    ...(rho !== null ? { ar1: { rho: round(rho, 3) } } : {}),
    ...(phi !== null ? { dispersion: round(phi, 3) } : {}),
    ...(burstInfo ? { bursts: burstInfo } : {}),
    ...(o.episodes ? { episodes: findEpisodes(changes, values.length, typeof o.episodes === 'number' ? { maxLen: o.episodes } : {}).map((e) => ({ ...e, from: labels[e.startIndex], to: labels[e.endIndex] })) } : {}),
    ...(excursions.length ? { excursions } : {}),
    pelt: { penalty: round(p.penalty), minSegment, changepoints: changes, segments },
    bocpd: {
      hazardLambda: Number(o.hazardLambda) || 100,
      lag: Math.max(1, Math.floor(Number(o.lag) || 5)),
      threshold: Number(o.threshold) || 0.5,
      detections: det.map((i) => ({ index: i, label: labels[i], probability: round(b.changeProb[i], 3) })),
      changeProb: b.changeProb.map((v) => round(v, 3)),
      mapRunLength: b.mapRun,
    },
    labels,
    ...(o.log ? { log: true } : {}),
    values: o.log ? original0 : rawCounts,
    ...(period || o.trend || holidayFit ? { adjusted: values.map((v, t) => round(exposure ? v / exposure[t] : v)) } : {}),
    summary,
  };
}

/**
 * Where exactly did a change happen? A credible range for each PELT change date: with the neighbouring changes held
 * fixed, every start k of the later segment is weighted exp(-(cost(k) - min cost) / 2) (the profile likelihood, since
 * the cost is -2 log-likelihood), and the most likely starts that together hold `level` of the weight are returned as
 * the first and last of them. It is a likelihood range under the fitted model, not an exact frequentist interval;
 * eval/change-interval.mjs measures how often it holds the planted date.
 */
export function changeIntervals(changepoints, n, cost, { minSegment = 2, level = 0.95 } = {}) {
  const ms = Math.max(1, Math.floor(minSegment));
  return changepoints.map((c, j) => {
    const a = j ? changepoints[j - 1] : 0;
    const b = j + 1 < changepoints.length ? changepoints[j + 1] : n;
    const lo = a + ms, hi = b - ms;
    if (hi < lo) return { index: c, from: c, to: c, level };
    const ks = [], cs = [];
    for (let k = lo; k <= hi; k++) { ks.push(k); cs.push(cost(a, k) + cost(k, b)); }
    const m = Math.min(...cs);
    const w = cs.map((v) => Math.exp(-(v - m) / 2));
    const tot = w.reduce((u, v) => u + v, 0);
    const order = w.map((_, i) => i).sort((u, v) => w[v] - w[u]);
    let acc = 0, from = Infinity, to = -Infinity;
    for (const i of order) { acc += w[i] / tot; from = Math.min(from, ks[i]); to = Math.max(to, ks[i]); if (acc >= level) break; }
    return { index: c, from, to, level };
  });
}

/**
 * Burst episodes in fitted count changes: an up-step followed within `maxLen` points by a down-step (or the
 * reverse) where the level on the far sides differs by well under half the episode's own jump (log scale) is one
 * episode, not two regime changes. Labels only: the changes themselves are not altered.
 * `cps` are the changes from analyze() (index, meanBefore, meanAfter); n is the series length.
 */
export function findEpisodes(cps, n, { maxLen = Math.max(5, Math.round(n / 10)), maxNet = 0.5 } = {}) {
  const out = [];
  for (let k = 0; k + 1 < cps.length; k++) {
    const a = cps[k], b = cps[k + 1];
    const len = b.index - a.index;
    const up = a.meanAfter > a.meanBefore && b.meanAfter < b.meanBefore;
    const down = a.meanAfter < a.meanBefore && b.meanAfter > b.meanBefore;
    if (len > maxLen || !(up || down)) continue;
    const lo = Math.max(a.meanBefore, 1e-9), hi = Math.max(b.meanAfter, 1e-9), mid = Math.max(a.meanAfter, 1e-9);
    const jump = Math.abs(Math.log(mid / lo)), net = Math.abs(Math.log(hi / lo));
    if (net >= maxNet * jump) continue;
    out.push({ kind: up ? 'burst' : 'dip', startIndex: a.index, endIndex: b.index - 1, length: len, level: a.meanAfter, baseBefore: a.meanBefore, baseAfter: b.meanAfter, jumpFactor: Math.round(Math.exp(jump) * 100) / 100, netFactor: Math.round(Math.exp(net) * 100) / 100 });
    k++;
  }
  return out;
}

/**
 * Isolated bursts in a count series: single days (or short runs) far above BOTH sides, e.g. a link going viral.
 * The reference is the median of up to `side` same-phase neighbours before and after (lag `period`, or the
 * adjacent points without a period); a point is a burst when it is at least `ratio` times the larger of the two
 * and clears a Poisson-sized excess. A step is high against one side only, so it is never flagged.
 * Returns the flagged indexes and a copy of the counts with each burst cut back to its reference.
 */
export function findBursts(x, { period = 0, ratio = 2.5, side = period ? 3 : 5, skip = null, runs = 0, runRatio = 2 } = {}) {
  const n = x.length, lag = period || 1;
  const med = (a) => { if (!a.length) return null; const s = [...a].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const out = [], cut = x.slice();
  for (let t = 0; t < n; t++) {
    if (skip && skip.has(t)) continue;
    const before = [], after = [];
    for (let k = 1; k <= side; k++) {
      if (t - k * lag >= 0 && !(skip && skip.has(t - k * lag))) before.push(x[t - k * lag]);
      if (t + k * lag < n && !(skip && skip.has(t + k * lag))) after.push(x[t + k * lag]);
    }
    const mb = med(before), ma = med(after);
    if (mb === null && ma === null) continue;
    const ref = Math.max(mb ?? 0, ma ?? 0);
    if (x[t] >= ratio * Math.max(ref, 1) && x[t] - ref > 4 * Math.sqrt(ref + 1)) { out.push(t); cut[t] = Math.round(ref); }
  }
  if (runs) {
    // Short runs (2 to `runs` points): the whole block sits above the reference of the same-phase points outside it
    // (on both sides), at `runRatio` times the reference on average, and its summed excess clears a Poisson-sized bar.
    const flagged = new Set(out), side2 = period ? 3 : 8;
    const ref = (t) => {
      const before = [], after = [];
      for (let k = 1; k <= side2; k++) {
        if (t - k * lag >= 0) before.push(x[t - k * lag]);
        if (t + k * lag < n) after.push(x[t + k * lag]);
      }
      return [med(before), med(after)];
    };
    for (let L = runs; L >= 2; L--) {
      for (let s = 0; s + L <= n; s++) {
        let ok = true;
        for (let i = s; i < s + L; i++) if (flagged.has(i) || (skip && skip.has(i))) { ok = false; break; }
        if (!ok) continue;
        const refs = [];
        if (period) {
          for (let i = s; i < s + L && ok; i++) {
            const [mb, ma] = ref(i);
            if (mb === null || ma === null) ok = false; else refs.push(Math.max(mb, ma));
          }
        } else {
          // no period: the points just outside the run, on both sides
          const before = [], after = [];
          for (let k = 1; k <= side2; k++) { if (s - k >= 0) before.push(x[s - k]); if (s + L - 1 + k < n) after.push(x[s + L - 1 + k]); }
          if (!before.length || !after.length) ok = false;
          else for (let i = 0; i < L; i++) refs.push(Math.max(med(before), med(after)));
        }
        if (!ok) continue;
        let sum = 0, rsum = 0, allHigh = true;
        for (let i = 0; i < L; i++) { sum += x[s + i]; rsum += refs[i]; if (x[s + i] < runRatio * Math.max(refs[i], 1) * 0.8) allHigh = false; }
        if (allHigh && sum >= runRatio * Math.max(rsum, L) && sum - rsum > 4 * Math.sqrt(rsum + L)) {
          for (let i = 0; i < L; i++) { out.push(s + i); flagged.add(s + i); cut[s + i] = Math.round(refs[i]); }
        }
      }
    }
    out.sort((a, b) => a - b);
  }
  return { indexes: out, counts: cut };
}

/** Least-squares line through x[s..t): slope per index, residual sd, and the fitted value at any index. */
/**
 * Burst or two steps? With counts, a temporary excursion (a rate that jumps and then returns to where it was) is read by
 * PELT as two level changes with narrow, over-confident ranges. For each pair of neighbouring changes a < b with a short
 * segment between them, test whether the rate before a and the rate after b are one rate (Poisson likelihood ratio, 1 df,
 * 3.84 = 95%): if they are, the pair is one excursion on a steady baseline. Returned as a note beside the changes; the
 * changes themselves are not altered. `exposure` is the seasonal/holiday expected-share per point when there is one.
 */
export function findExcursions(x, cps, { exposure = null, maxFraction = 0.25, critical = 3.84 } = {}) {
  const n = x.length, e = (t) => (exposure ? exposure[t] : 1);
  const sum = (lo, hi) => { let c = 0, w = 0; for (let t = lo; t < hi; t++) { c += x[t]; w += e(t); } return { c, w }; };
  const ll = (c, w, r) => (c > 0 ? c * Math.log(r * w) : 0) - r * w;
  const out = [];
  for (let k = 0; k + 1 < cps.length; k++) {
    const a = cps[k], b = cps[k + 1];
    if (b - a > maxFraction * n) continue;
    const L = sum(k ? cps[k - 1] : 0, a), M = sum(a, b), R = sum(b, k + 2 < cps.length ? cps[k + 2] : n);
    if (!L.w || !R.w || !M.w) continue;
    const rL = L.c / L.w, rR = R.c / R.w, rM = M.c / M.w, rP = (L.c + R.c) / (L.w + R.w);
    const lr = 2 * (ll(L.c, L.w, rL) + ll(R.c, R.w, rR) - ll(L.c, L.w, rP) - ll(R.c, R.w, rP));
    // the middle must sit clearly on one side of both neighbours (a burst up or a dip down)
    if (!((rM > rL && rM > rR) || (rM < rL && rM < rR))) continue;
    if (lr < critical) out.push({ fromIndex: a, toIndex: b - 1, length: b - a, baselineRate: rP, excursionRate: rM, ratio: rP > 0 ? rM / rP : null, sameBaselineLR: lr, direction: rM > rP ? 'up' : 'down' });
  }
  return out;
}

function lineFit(x, s, t) {
  const m = t - s;
  let st = 0, sx = 0;
  for (let i = s; i < t; i++) { st += i; sx += x[i]; }
  const tb = st / m, xb = sx / m;
  let sxx = 0, sxy = 0;
  for (let i = s; i < t; i++) { sxx += (i - tb) ** 2; sxy += (i - tb) * (x[i] - xb); }
  const slope = sxx > 0 ? sxy / sxx : 0;
  let rss = 0;
  for (let i = s; i < t; i++) rss += (x[i] - xb - slope * (i - tb)) ** 2;
  return { slope, sd: Math.sqrt(rss / Math.max(1, m - 2)), at: (i) => xb + slope * (i - tb) };
}

function summarize({ n, column, model, changes, det, labels, skipped }) {
  const what = model === 'meanvar' ? 'level or volatility' : model === 'poisson' ? 'rate' : model === 'trend' ? 'level or slope' : 'level';
  const lines = [];
  if (!changes.length) {
    lines.push(`PELT finds no change in ${what} across the ${n} points of ${column}: one segment explains the data better than any split, after the penalty.`);
  } else {
    lines.push(`PELT splits the ${n} points of ${column} into ${changes.length + 1} segments (${changes.length} change${changes.length > 1 ? 's' : ''} in ${what}).`);
    for (const c of changes) {
      const dir = c.shift > 0 ? 'up' : 'down';
      if (model === 'trend') {
        lines.push(`From ${c.label} (after ${c.lastBefore}) the line jumps ${c.jump > 0 ? 'up' : 'down'} by ${fmt(Math.abs(c.jump))} and its slope goes from ${fmt(c.slopeBefore)} to ${fmt(c.slopeAfter)} per point; the Bayesian method (level changes only, on the series minus its median slope) puts ${Math.round(c.bocpdProbWithin3 * 100)}% probability on a change within 3 points of it.`);
        continue;
      }
      lines.push(`From ${c.label} (after ${c.lastBefore}) the mean moves ${dir} from ${fmt(c.meanBefore)} to ${fmt(c.meanAfter)}, ${fmt(Math.abs(c.shiftInNoiseSd))} noise standard deviations; the Bayesian method puts ${Math.round(c.bocpdProbWithin3 * 100)}% probability on a change within 3 points of it.`);
    }
  }
  const extra = det.filter((i) => !changes.some((c) => Math.abs(c.index - i) <= 3));
  if (extra.length) lines.push(`The Bayesian method also flags ${extra.map((i) => labels[i]).join(', ')}, which PELT's penalty did not keep: worth a look, weaker evidence.`);
  if (skipped) lines.push(`${skipped} row${skipped > 1 ? 's were' : ' was'} skipped as blank or not numeric.`);
  return lines.join(' ');
}

/**
 * Conditional sd of a GARCH(1,1) fitted by Gaussian quasi-maximum likelihood to the series less its median
 * (h[t] = omega + alpha e[t-1]^2 + beta h[t-1], h[0] the sample variance). Grid search over (alpha, beta) with the
 * unconditional variance matched to the sample variance (variance targeting), then a local refinement. For
 * eval/meanvar-garch-filter.mjs; falls back to a constant sd when nothing beats it.
 */
export function garchSigma(x) {
  const n = x.length, ord = [...x].sort((a, b) => a - b), med = ord[Math.floor(n / 2)];
  const e2 = x.map((c) => (c - med) ** 2), v = e2.reduce((a, c) => a + c, 0) / n || 1;
  const h = (a, b) => { const w = v * (1 - a - b), o = new Array(n); o[0] = v; for (let t = 1; t < n; t++) o[t] = w + a * e2[t - 1] + b * o[t - 1]; return o; };
  const nll = (a, b) => { if (a < 0 || b < 0 || a + b >= 0.999) return Infinity; let s = 0; const o = h(a, b); for (let t = 0; t < n; t++) s += Math.log(o[t]) + e2[t] / o[t]; return s; };
  let best = [0, 0], bl = nll(0, 0);
  for (let a = 0.02; a <= 0.5; a += 0.04) for (let b = 0; b <= 0.97 - a; b += 0.05) { const l = nll(a, b); if (l < bl) { bl = l; best = [a, b]; } }
  for (let step = 0.02; step > 0.002; step /= 2) for (let k = 0; k < 20; k++) {
    let moved = false;
    for (const [da, db] of [[step, 0], [-step, 0], [0, step], [0, -step]]) { const l = nll(best[0] + da, best[1] + db); if (l < bl - 1e-9) { bl = l; best = [best[0] + da, best[1] + db]; moved = true; } }
    if (!moved) break;
  }
  return h(best[0], best[1]).map(Math.sqrt);
}
