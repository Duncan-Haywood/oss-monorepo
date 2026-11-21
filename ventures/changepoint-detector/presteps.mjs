// Pre-steps (changepoint-detector): what analyze() does to a series before PELT looks for steps. The seasonal profile
// (medians, drifting, multiplicative; Poisson factors and holiday factors for counts), the trend under the steps (one
// line, bends, a quadratic; the Poisson growth rate), the AR(1) and AR(2) noise fits and the noise floor
// (localFitScale). preSteps() runs them in analyze()'s order and returns the adjusted series and every fitted term.
// Moved out of engine.mjs on 2026-11-21; engine.mjs re-exports every name it exported.

import { robustSd, median, gaussJordan, solveSym } from './stats-core.mjs';
import { pelt, penaltyValue, round, negbinSize, nb1Dispersion } from './segmentation.mjs';

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
// Measured coverage with the local NB size (README "Clumpy counts that grow", 2026-11-15): 299 of 301 found bends on seeds 3 and 11, 278 of 280 steep ones
// on fresh seeds (it was 94% and 80% while the size was read against the global mean). The temper was not retuned, so ranges may be wider than needed.
export const GROWTH_RANGE_NB_NOTE = 'Clumpy-count ranges held the true bend on about 99% of simulated series, steep growth changes included, so they may be wider than a 95% range needs; checked on simulations, not yet on a real series with a documented break in growth.';
export function poissonTrend(x, { base = null, penalty = 'bic', minSegment = 2, passes = 12, bend = false, knotMargin = 0.1, scale = 1, nbSize = 0, nb1Delta = 0, diag = null } = {}) {
  const n = x.length;
  const nb = nbSize > 0 && Number.isFinite(nbSize);
  const nb1 = !nb && nb1Delta > 0 && Number.isFinite(nb1Delta), nbAny = nb || nb1;
  // nb: PELT and the cost that ranks knots use the negative-binomial likelihood (size nbSize); the growth steps stay Poisson score steps (a quasi-likelihood)
  const peltFit = (e, poisson = false) => pelt(x, nb && !poisson ? { model: 'negbin', penalty, minSegment, size: nbSize, exposure: e } : nb1 && !poisson ? { model: 'negbin1', penalty, minSegment, size: nb1Delta, exposure: e } : { model: 'poisson', penalty, minSegment, exposure: e });
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
    // (the negative-binomial costs, NB2 and NB1, keep it, since the mean enters through lam e[t])
    const linAt = (gv) => nbAny && !poisson ? 0 : x.reduce((a, v, t) => a + v * gv.reduce((c, gj, j) => c + gj * phi[j][t], 0), 0);
    // A converged Newton step (under 1e-5) moved the exposures too little to change the cost at the profiled optimum, so the last pass's PELT cost stands in for another run.
    if (converged) return { g, phi, cost: last.cost - 2 * linAt(last.g), passes: done };
    return { g, phi, cost: peltFit(expo(phi, g), poisson).cost - 2 * linAt(g), passes: done };
  };
  const plain = fit([u], [g0]);
  const out = (f, extra = {}) => ({ g: f.g[0], exposure: expo(f.phi, f.g), passes: f.passes, cost: f.cost, ...extra });
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
    const quick = nbAny && n >= 80;
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
    const w = cs.map((v) => Math.exp(-(v - m) / 2 / (rangeScale * (nbAny ? RANGE_TEMPER_NB : RANGE_TEMPER))));
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
      if (!gaussJordan(A, 4, 1e-12)) continue;
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
  gaussJordan(A, p);
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
export function trendAdjust(x, { penalty = 'bic', minSegment = 2, passes = 10, ar1 = false, bend = false, joint = false, knotMargin = 0.1, quad = false } = {}) {
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
  // Every fit starts from the same slope, median(d), on every piece, so its first pass removes the same straight line whatever the
  // knots (each knot adds (s[j+1] - s[j]) * (t - knot) = 0 exactly): that pass's steps are computed once, not once per fit. A fit is
  // a pure function of its knots, and the greedy grid, the refinement and the knot-range scan revisit some knot sets, so each set
  // is fitted once (docs/history/ci-perf-2026-11-12-trend-fit-memo.md).
  const start = median(d);
  let firstSteps = null;
  const fits = new Map();
  const fit = (knots) => {
    const key = knots.join(',');
    let f = fits.get(key);
    if (!f) { f = fitOnce(knots); fits.set(key, f); }
    return f;
  };
  const fitOnce = (knots) => {
    const edges = [0, ...knots.map((k) => k + 1), n];
    let s = new Array(knots.length + 1).fill(start);
    for (let k = 0; k < passes; k++) {
      const cps = k === 0 ? (firstSteps ??= segment(detrend(line(s, knots)), 3)) : segment(detrend(line(s, knots)), 3);
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
  if (quad && n >= 40) {
    // a smooth curve: slope s plus curvature q (slope grows by 2q per point), both fitted within the steps' segments
    const qline = (s, q) => (t) => s * (t - c) + q * (t - c) ** 2;
    let s = best.s[0], q = 0;
    const pooled2 = (bounds) => {
      let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i + 1 < bounds.length; i++) {
        const lo = bounds[i], hi = bounds[i + 1], len = hi - lo;
        if (len < 8) continue;
        let mu = 0, mw = 0, mx = 0;
        for (let t = lo; t < hi; t++) { mu += t - c; mw += (t - c) ** 2; mx += x[t]; }
        mu /= len; mw /= len; mx /= len;
        for (let t = lo; t < hi; t++) {
          const u = t - c - mu, w = (t - c) ** 2 - mw, z = x[t] - mx;
          a11 += u * u; a12 += u * w; a22 += w * w; b1 += u * z; b2 += w * z;
        }
      }
      const det = a11 * a22 - a12 * a12;
      if (!(det > 1e-12 * a11 * a22) || !(a11 > 0)) return null;
      return [(b1 * a22 - b2 * a12) / det, (a11 * b2 - a12 * b1) / det];
    };
    for (let k = 0; k < passes; k++) {
      const cps = segment(detrend(qline(s, q)), 3);
      const next = pooled2([0, ...cps, n]);
      if (!next) break;
      const done = Math.abs(next[0] - s) < 1e-9 && Math.abs(next[1] - q) < 1e-12;
      [s, q] = next;
      if (done) break;
    }
    const y = detrend(qline(s, q)), cps = segment(y, 1), bounds = [0, ...cps, n];
    let rss = 0;
    for (let i = 0; i + 1 < bounds.length; i++) {
      let m = 0; for (let t = bounds[i]; t < bounds[i + 1]; t++) m += y[t];
      m /= bounds[i + 1] - bounds[i];
      for (let t = bounds[i]; t < bounds[i + 1]; t++) rss += (y[t] - m) ** 2;
    }
    const infl = ar1 ? longRunSd(1, ar1Rho(y)) ** 2 : 1;
    const bic = (n * Math.log(Math.max(rss, 1e-12) / n)) / infl + (2 + 2 * cps.length) * Math.log(n);
    // keep the curvature only if it lowers the BIC against the straight line under steps
    if (bic < best.bic) return { adjusted: y, slope: s, curvature: q, curved: true };
    return { adjusted: detrend(line(best.s, [])), slope: best.s[0], curved: false };
  }
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
  // cos and sin of 2 pi k t / n depend only on k t mod n, so one table of n values replaces n q trig calls (n = 8,609: 679 ms
  // to tens of ms). The table angle is exact in the integer, so its rounding error is that of 2 pi j / n with j < n, where the old
  // 2 pi k t / n carried an argument error growing with k t; the sums run in the same order
  // (docs/history/ci-perf-2026-11-15-changepoint-fisher-table.md).
  const C = new Float64Array(n), Sn = new Float64Array(n);
  for (let j = 0; j < n; j++) { const a = 2 * Math.PI * j / n; C[j] = Math.cos(a); Sn[j] = Math.sin(a); }
  let tot = 0, best = 0, bk = 1;
  for (let k = 1; k <= q; k++) {
    let c = 0, s = 0;
    for (let t = 0, j = 0; t < n; t++) { c += r[t] * C[j]; s += r[t] * Sn[j]; j += k; if (j >= n) j -= n; }
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

// Median absolute residual of centred local polynomial fits (window w, odd; degree 1 = line, 2 = quadratic), divided by the
// white-noise value of that median so the result is on the first-difference scale (0.954 sd on white noise).
// The fitted value at the centre of a least-squares fit is a fixed linear filter (Savitzky-Golay): for a line it is the
// window mean; for a quadratic, c_j = (3(3m^2+3m-1) - 15 j^2) / ((2m-1)(2m+1)(2m+3)) with m = (w-1)/2. The residual is a
// projection, so its variance on white noise is (1 - c_0) sd^2 and, for Gaussian noise, its median |.| is 0.6745 times that sd
// exactly (the 7-point line gives 0.6245; the 0.627 used before 2026-11-10 was a simulation of the same number).
export function localFitScale(v, w = 7, degree = 1) {
  w = Math.floor(Number(w) || 7); if (w % 2 === 0) w += 1;
  const m = (w - 1) / 2;
  if (degree !== 1 && degree !== 2) throw new Error('The local-fit noise floor takes degree 1 (line) or 2 (quadratic).');
  if (degree === 1 ? w < 3 : w < 5) throw new Error(`The local-fit noise floor needs a window of at least ${degree === 1 ? 3 : 5} points for degree ${degree}.`);
  const c = [];
  for (let j = -m; j <= m; j++) c.push(degree === 1 ? 1 / w : (3 * (3 * m * m + 3 * m - 1) - 15 * j * j) / ((2 * m - 1) * (2 * m + 1) * (2 * m + 3)));
  const c0 = c[m];
  const res = [];
  for (let t = m; t < v.length - m; t++) {
    let f = 0;
    for (let j = -m; j <= m; j++) f += c[j + m] * v[t + j];
    res.push(Math.abs(v[t] - f));
  }
  if (!res.length) return 0;
  return median(res) / (0.67449 * Math.sqrt(1 - c0)) * 0.954;
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

/**
 * The pre-steps of analyze(), in its order: checks the options against the model, takes logs, cuts bursts back, reads
 * the count dispersion, fits holidays and the season (alternating them for counts), fits the trend under the steps, then
 * sets the noise scale (robust sd, the noise floor, the AR(1) long-run widening). `o` is DEFAULTS overlaid with the
 * caller's options; `values` and `labels` are the parsed series. Returns the adjusted series and every fitted term.
 */
export function preSteps(o, values, labels) {
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
  if (o.spikes && model === 'poisson') throw new Error('Spikes are for continuous series: use model "mean" or "meanvar"; counts have --bursts and --episodes.');
  if (o.bursts) {
    if (model !== 'poisson') throw new Error('The burst rule is for counts: use model "poisson".');
    const b = findBursts(values, { period, ratio: typeof o.bursts === "number" ? o.bursts : 2.5, runs: o.burstRuns || 0, ...(o.burstRunRatio ? { runRatio: o.burstRunRatio } : {}) });
    burstInfo = b.indexes.map((i) => ({ index: i, label: labels[i], value: values[i], keptAs: b.counts[i] }));
    values = b.counts;
  }
  let phi = null, penalty = o.penalty;
  let nbSize = 0, nb1Delta = 0;
  if (o.overdispersion === 'nb' || o.overdispersion === 'nb1') {
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
  let slope = null, slopeAfter, knot, knots, slopes, knotRanges, curvature, curved;
  let trendRobustKept = null;
  let growth = null, countKnot, growthAfter, countKnots, countRates, countRanges;
  const nbAfterExposure = () => { if (o.overdispersion === 'nb') nbSize = negbinSize(exposure ? original.map((v, t) => v / exposure[t]) : values); else if (o.overdispersion === 'nb1') nb1Delta = nb1Dispersion(original, exposure) - 1; };
  if (o.trend && model === 'poisson') {
    if (o.trend !== true && o.trend !== 'bend' && o.trend !== 'bends' && o.trend !== 'robust') throw new Error('For counts, --trend takes one common growth rate under the steps, "bend" for one change of growth rate, "bends" for up to two, or "robust" for one growth rate read once from a robust slope of the log counts.');
    // robust: the growth rate is the starting estimate only (the median of log-count slopes over a quarter of the
    // series), not refitted under the steps; about 40 times cheaper per check, for the count watch (README "A Middle
    // that allows for growth").
    const fit = poissonTrend(original, { base: exposure, penalty, ...(o.trend === 'robust' ? { passes: 0 } : {}), minSegment: Math.max(1, Math.floor(Number(o.minSegment) || 2)), bend: o.trend === 'bend' ? 1 : o.trend === 'bends' ? 2 : false, knotMargin: o.knotMargin, scale: phi ?? 1, diag: o.diagBends || null,
      nbSize: o.overdispersion === 'nb' ? negbinSize(exposure ? original.map((v, t) => v / exposure[t]) : original) : 0,
      nb1Delta: o.overdispersion === 'nb1' ? nb1Dispersion(original, exposure) - 1 : 0 });
    // robust: keep the growth term only when it earns its place, its fit beating the flat one (same cost, same
    // exposure otherwise) by log n, one parameter by BIC; a flat series is then left as Middle sees it.
    let keep = true;
    // trendGate (with the joint fit, --trend): the same gate on the refitted growth rate (README "The joint growth fit").
    if (o.trend === 'robust' || (o.trend === true && o.trendGate)) {
      const n0 = original.length, size = o.overdispersion === 'nb' ? negbinSize(exposure ? original.map((v, t) => v / exposure[t]) : original) : 0;
      const d1 = o.overdispersion === 'nb1' ? nb1Dispersion(original, exposure) - 1 : 0;
      const ms = Math.max(1, Math.floor(Number(o.minSegment) || 2));
      const flat = pelt(original, size > 0 && Number.isFinite(size) ? { model: 'negbin', penalty, minSegment: ms, size, exposure } : d1 > 0 && Number.isFinite(d1) ? { model: 'negbin1', penalty, minSegment: ms, size: d1, exposure } : { model: 'poisson', penalty, minSegment: ms, exposure });
      keep = fit.cost + Math.log(n0) * (phi ?? 1) < flat.cost;
      trendRobustKept = keep;
    }
    if (keep) { exposure = fit.exposure; growth = fit.g; }
    if (keep && fit.knot !== undefined) { countKnot = fit.knot; growthAfter = fit.slopeAfter; countKnots = fit.knots; countRates = fit.rates; countRanges = fit.knotRanges; }
  } else if (o.trend) {
    ({ adjusted: values, slope, slopeAfter, knot, knots, slopes, knotRanges, curvature, curved } = trendAdjust(values, { quad: o.trend === 'quad', penalty: o.penalty, minSegment: Math.max(1, Math.floor(Number(o.minSegment) || (model === 'meanvar' ? 10 : 2))), ar1: !!o.ar1 && model === 'mean', bend: o.trend === 'bend' ? 1 : o.trend === 'bends' ? 3 : false, joint: !!o.jointKnots, knotMargin: o.knotMargin }));
  }
  nbAfterExposure();
  let sigma = robustSd(values);
  // noiseFloor k: sigma is at least k times the median absolute step between neighbours. A smooth, near-deterministic
  // curve (a population count) has tiny scatter in its differences but a steady drift per step, so the scatter alone
  // makes every bend look significant. White noise has median |step| of about 0.95 sigma, so k below 1 never binds there.
  const noiseFloorK = o.noiseFloor === true ? 1 : Number(o.noiseFloor) || 0;
  let noiseFloorHit = false;
  if (noiseFloorK > 0 && values.length > 2) {
    // order 2 (o.noiseFloorOrder === 2) uses second differences, which cancel a steady drift per step; the factor 0.578
    // (= 0.954 / 1.651, the white-noise medians of |d1| and |d2| in sd units) keeps k on the same scale as order 1.
    // order 3 uses third differences (cancel a quadratic drift); 0.3166 = 0.955 / 3.016 keeps k on the same white-noise scale.
    // 'local': residuals of a least-squares line (or quadratic, noiseFloorDegree 2) over each centred window of
    // noiseFloorWindow points (default 7), rescaled to the white-noise first-difference scale (localFitScale).
    const localW = Math.floor(Number(o.noiseFloorWindow) || 7) | 1, localDeg = o.noiseFloorDegree === 2 ? 2 : 1;
    const fl = o.noiseFloorOrder === 'local' && values.length > localW
      ? noiseFloorK * localFitScale(values, localW, localDeg)
      : o.noiseFloorOrder === 3 && values.length > 4
      ? noiseFloorK * 0.3166 * median(values.slice(3).map((v, i) => Math.abs(v - 3 * values[i + 2] + 3 * values[i + 1] - values[i])))
      : o.noiseFloorOrder === 2 && values.length > 3
      ? noiseFloorK * 0.578 * median(values.slice(2).map((v, i) => Math.abs(v - 2 * values[i + 1] + values[i])))
      : noiseFloorK * median(values.slice(1).map((v, i) => Math.abs(v - values[i])));
    if (fl > sigma) { sigma = fl; noiseFloorHit = true; }
  }
  let rho = null;
  const joint = o.ar1 === 'joint';
  if (o.ar1) {
    if (model !== 'mean') throw new Error('The autocorrelation correction is for the "mean" model only.');
    // o.ar1Rho: a rho the caller fixes (watch.mjs: a cap, or the rho read at the baseline), clipped like the estimate
    rho = !joint && o.ar1Rho != null && Number.isFinite(Number(o.ar1Rho)) ? Math.max(0, Math.min(0.95, Number(o.ar1Rho))) : ar1Rho(values);
    // o.ar1RhoCap: an upper bound on the estimate (watch.mjs uses 0.8: at the 0.95 clip a wandering level reads every
    // real move as persistence, eval/watch-replay-round4.out.txt)
    if (!joint && o.ar1RhoCap != null && Number.isFinite(Number(o.ar1RhoCap))) rho = Math.min(rho, Math.max(0, Number(o.ar1RhoCap)));
    if (!joint) sigma = longRunSd(sigma, rho);
  }
  return { model, values, original0, period, burstInfo, rawCounts, phi, penalty, nbSize, nb1Delta, profile, exposure, seasonMultiplicative, original, holidayFit, slope, slopeAfter, knot, knots, slopes, knotRanges, curvature, curved, growth, countKnot, growthAfter, countKnots, countRates, countRanges, sigma, noiseFloorK, noiseFloorHit, rho, joint, trendRobustKept };
}
