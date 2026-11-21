// PELT and its costs (changepoint-detector): the segment cost functions over prefix sums (Gaussian mean, mean and
// variance, Laplace, AR(1), Poisson, the two negative-binomial forms), the penalties, PELT and exact optimal partitioning,
// and the penalty checks that refit with a raised penalty (squared-residual dispersion, block bootstrap) or warn
// (meanvarNoiseCheck). Moved out of engine.mjs on 2026-11-21 unchanged; engine.mjs re-exports every name it exported.
// Depends only on stats-core.mjs and bocpd.mjs, so presteps.mjs and engine.mjs can both import it without a cycle.

import { robustSd, median, select, lgamma, NBP, nbPair, mulberry } from './stats-core.mjs';
import { NB_CLASS_MAX } from './bocpd.mjs';

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
    const fromSorted = (seg, m) => {
      const med = m % 2 ? seg[(m - 1) / 2] : (seg[m / 2 - 1] + seg[m / 2]) / 2;
      let ad = 0;
      for (let i = 0; i < m; i++) ad += Math.abs(seg[i] - med);
      return 2 * m * (Math.log(2 * Math.max(floor, ad / m)) + 1);
    };
    // PELT asks for each start s with t rising by one, so each start keeps its segment sorted and takes x[t-1] by one
    // binary-search insert instead of a fresh copy and sort per pair (the robust CAC run went from 183 s to about 2 s,
    // docs/history/ci-perf-2026-11-10-laplace-cost-sorted-runs.md). Same sorted values, same sum order, same cost.
    // Any other order of asking falls back to the sort, memoised as before.
    // A start PELT has pruned is never asked again: every 256 steps, buffers untouched for 256 steps are freed, so
    // memory follows the starts still in play, not n^2/2 values (8,609 DJIA days would otherwise hold ~300 MB).
    // Freeing is always safe: a start asked again is rebuilt from x.
    const runs = new Map();
    let sweptAt = 0;
    return (s, t) => {
      if (t > sweptAt + 256) {
        for (const [k, q] of runs) if (q.t < t - 256) runs.delete(k);
        sweptAt = t;
      }
      let r = runs.get(s);
      if (r === undefined && t > s) { r = { buf: new Float64Array(n - s), t: s, c: 0 }; runs.set(s, r); }
      if (r !== undefined && t >= r.t && t > s) {
        if (t === r.t) return r.c;
        const buf = r.buf;
        for (let k = r.t; k < t; k++) {
          const v = x[k];
          let lo = 0, hi = k - s;
          while (lo < hi) { const mid = (lo + hi) >>> 1; if (buf[mid] <= v) lo = mid + 1; else hi = mid; }
          buf.copyWithin(lo + 1, lo, k - s);
          buf[lo] = v;
        }
        r.t = t;
        r.c = fromSorted(buf, t - s);
        return r.c;
      }
      const key = s * (n + 1) + t;
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      const m = t - s;
      const seg = Array.from(x.subarray ? x.subarray(s, t) : x.slice(s, t)).sort((a, b) => a - b);
      const c = fromSorted(seg, m);
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
  if (model === 'negbin1') {
    // NB1 (variance phi mu, delta = phi - 1): the point at mean mu = lam e is NB with size mu / delta and p = 1 / (1 + delta),
    // so the clumping grows with the level instead of being one size r for the whole series (eval/nb1-preregistration.md).
    // ll(lam) = sum [lgamma(x + lam e / delta) - lgamma(lam e / delta)] - (lam E / delta) log(1 + delta), the x-only terms
    // dropped. The NB1 mean has no closed-form maximum, and the moment estimate S / E is not it once the exposures differ
    // (on a 100-fold ramp it left enough misfit that splitting a segment paid: 1.0 false changes per series where NB2 gave
    // 0.6, development seeds), so S / E is polished by Newton steps on the exact score, warm-started per segment start as
    // the NB2 cost does. O(segment length) per step.
    if (!(size > 0)) throw new Error('The NB1 cost needs a dispersion delta > 0.');
    const delta = size, L1 = Math.log1p(delta);
    const EP = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) EP[i + 1] = EP[i] + (exposure ? exposure[i] : 1);
    const ex = exposure || new Float64Array(n).fill(1);
    const lamAt = new Float64Array(n + 1);
    return (s, t) => {
      const a = S1[t] - S1[s], E = EP[t] - EP[s];
      if (!(a > 0) || !(E > 0)) return 0;
      // One pass at a starting rate lam0 (the last fitted rate for this start, else S / E) gives ll, its score g and
      // curvature h; the maximum is ll - g^2 / (2 h) to second order, and lam0 - g / h is kept as the next warm start
      // (PELT asks for (s, t) with t rising, and one more point barely moves the rate). Within 1e-6 of a full Newton
      // solve on the ramps of eval/nb1.mjs, at a sixth of the special-function work.
      const lam = lamAt[s] > 0 && t - s > 3 ? lamAt[s] : a / E;
      let ll = -lam * E * L1 / delta, g = -E * L1 / delta, h = 0;
      for (let i = s; i < t; i++) {
        if (!(x[i] > 0)) continue;
        const w = ex[i] / delta;
        nbPair(x[i], lam * w);
        ll += NBP[0]; g += w * NBP[1]; h += w * w * NBP[2];
      }
      if (h < 0) {
        const next = lam - g / h;
        lamAt[s] = next > 0 ? next : lam / 2;
        ll -= (g * g) / (2 * h);
      }
      return -2 * ll;
    };
  }
  throw new Error(`Unknown model "${model}": use "mean", "meanvar", "trend", "poisson", "negbin" or "negbin1".`);
}

/**
 * Size r of a negative binomial (variance mu + mu^2 / r) for clumpy counts, from the series itself: the variance comes
 * from the median of squared first differences (a step spoils one difference, so the median ignores it; for
 * independent counts D = x_t - x_(t-1) has variance 2 var and D^2 has median 0.4549 * 2 var), the mean from the median.
 * Returns Infinity when the counts are no more spread than a Poisson (the negative binomial then adds nothing).
 */
export function negbinSize(x) {
  if (x.length < 8) return Infinity;
  // Each first difference is read against the level around it (a 7-point window), not the series mean: under NB2 a pair at
  // level m has E d^2 = 2 (m + m^2 / r). Solve mean_t min(z_t, K) = E min(chi2_1, K) for c = 1 / r, z_t = d_t^2 / (2 (m_t + c m_t^2)),
  // K = 6.63 (chi2_1's 99th percentile), so a step's few huge differences are capped instead of driving the size, and the mean
  // has no lattice on small counts (the median did). Poisson (Infinity) unless the c = 0 mean clears its target by two standard
  // errors (1.5 for the overlap of neighbouring differences). The old estimator compared small local spreads with a large global
  // mean and returned Infinity on growing counts (README, 2026-11-15).
  const n = x.length, H = 3, pre = [0];
  for (let t = 0; t < n; t++) pre.push(pre[t] + x[t]);
  const d2 = [], m = [];
  for (let t = 1; t < n; t++) {
    const a = Math.max(0, t - 1 - H), z = Math.min(n, t + 1 + H);
    const mt = (pre[z] - pre[a]) / (z - a);
    if (mt > 0) { d2.push((x[t] - x[t - 1]) ** 2); m.push(mt); }
  }
  if (d2.length < 8) return Infinity;
  const K = 6.635, TARGET = 0.9813;  // E min(chi2_1, K) = P(chi2_3 < K) + K P(chi2_1 > K)
  const zs = (c) => d2.map((v, i) => Math.min(K, v / (2 * (m[i] + c * m[i] * m[i]))));
  const meanAt = (c) => zs(c).reduce((s, v) => s + v, 0) / d2.length;
  const z0 = zs(0), mu0 = z0.reduce((s, v) => s + v, 0) / z0.length;
  const se = Math.sqrt(1.5 * z0.reduce((s, v) => s + (v - mu0) ** 2, 0) / (z0.length - 1) / z0.length);
  if (!(mu0 > TARGET + 2 * se)) return Infinity;
  let lo = 0, hi = 1;
  while (meanAt(hi) > TARGET && hi < 1e6) hi *= 4;
  for (let k = 0; k < 60; k++) { const c = (lo + hi) / 2; if (meanAt(c) > TARGET) lo = c; else hi = c; }
  const c = (lo + hi) / 2;
  return c > 0 ? 1 / c : Infinity;
}

// What `--overdispersion nb|nb1` used, and which law the counts look like (clumpingLaw), with a hint when the other fits better.
export function clumpingOut(asked, nbSize, nb1Delta, x) {
  const law = clumpingLaw(x);
  const used = asked === 'nb1' ? { law: 'nb1', phi: round(1 + nb1Delta, 3) } : { law: 'nb2', size: Number.isFinite(nbSize) && nbSize > 0 ? round(nbSize, 2) : null };
  const other = asked === 'nb1' ? 'nb2' : 'nb1';
  const hint = law.law === other
    ? (other === 'nb1' ? 'These counts clump in proportion to their level (variance about phi times the mean), which one negative-binomial size cannot describe: --overdispersion nb1 fits that law (on simulated NB1 counts that moved 100-fold the NB2 cost gave 4 to 7 times its usual false changes, README).'
      : 'These counts clump more at high levels than in proportion to the level (variance mu + mu^2 / r): --overdispersion nb fits that law.')
    : null;
  return { used, fits: law.law, levelSpan: law.levelSpan, ...(hint ? { hint } : {}) };
}

/** The size against the global mean (the estimator before 2026-11-15), kept for comparison. */
export function negbinSizeGlobal(x) {
  if (x.length < 8) return Infinity;
  const d = [];
  for (let t = 1; t < x.length; t++) d.push((x[t] - x[t - 1]) ** 2);
  const v = median(d) / (2 * 0.4549);
  const mu = x.reduce((a, b) => a + b, 0) / x.length;
  return v > 1.05 * mu && mu > 0 ? (mu * mu) / (v - mu) : Infinity;
}

// First differences read against the 7-point local level (of x / e when there are exposures), as negbinSize does:
// d2[i] the squared difference, m[i] the local rate, w[i] = (1 / e_t + 1 / e_(t-1)) / 2 (1 without exposures).
function localDiffs(x, exposure = null) {
  const n = x.length, H = 3, y = exposure ? x.map((v, t) => v / exposure[t]) : x, pre = [0];
  for (let t = 0; t < n; t++) pre.push(pre[t] + y[t]);
  const d2 = [], m = [], w = [];
  for (let t = 1; t < n; t++) {
    const a = Math.max(0, t - 1 - H), z = Math.min(n, t + 1 + H);
    const mt = (pre[z] - pre[a]) / (z - a);
    if (!(mt > 0)) continue;
    if (exposure) {
      // x_t - (e_t / e_(t-1)) x_(t-1) has mean 0 at a common rate; scaled to the x / e pair it has variance phi m (1 / e_t + 1 / e_(t-1))
      d2.push((y[t] - y[t - 1]) ** 2); m.push(mt); w.push((1 / exposure[t] + 1 / exposure[t - 1]) / 2);
    } else { d2.push((x[t] - x[t - 1]) ** 2); m.push(mt); w.push(1); }
  }
  return { d2, m, w };
}
const NB_K = 6.635, NB_TARGET = 0.9813;  // chi2_1's 99th percentile and E min(chi2_1, K)
const cappedMean = (z) => z.reduce((s, v) => s + Math.min(NB_K, v), 0) / z.length;

/**
 * NB1 dispersion phi (variance phi mu) of counts, read against each point's local level like negbinSize: solve
 * mean min(d^2 / (2 phi m w), 6.635) = 0.9813 for phi. Returns 1 (Poisson) unless phi = 1 is rejected by two standard
 * errors (1.5 for overlapping differences). exposure: per-point factors (a season, a trend) the rate is multiplied by.
 */
export function nb1Dispersion(x, exposure = null) {
  if (x.length < 8) return 1;
  const { d2, m, w } = localDiffs(x, exposure);
  if (d2.length < 8) return 1;
  const z0 = d2.map((v, i) => Math.min(NB_K, v / (2 * m[i] * w[i]))), mu0 = cappedMean(z0);
  const se = Math.sqrt(1.5 * z0.reduce((s, v) => s + (v - mu0) ** 2, 0) / (z0.length - 1) / z0.length);
  if (!(mu0 > NB_TARGET + 2 * se)) return 1;
  const at = (phi) => cappedMean(d2.map((v, i) => v / (2 * phi * m[i] * w[i])));
  let lo = 1, hi = 2;
  while (at(hi) > NB_TARGET && hi < 1e6) hi *= 2;
  for (let k = 0; k < 60; k++) { const c = (lo + hi) / 2; if (at(c) > NB_TARGET) lo = c; else hi = c; }
  return (lo + hi) / 2;
}

/**
 * Which clumping law the counts follow: NB2 (variance mu + mu^2 / r, one size r) or NB1 (variance phi mu). Both are
 * fitted to the same local differences; under the right law z = d^2 / (2 var) has the same capped mean on the lower
 * and upper halves of the local level. Returns { law: 'nb1' | 'nb2' | 'either', phi, size, levelSpan, gapNb1, gapNb2 }
 * (gaps in standard errors, upper half minus lower). 'either': the level spans less than 3 times, the counts read as
 * Poisson, or neither law is clearly worse.
 */
export function clumpingLaw(x) {
  const size = negbinSize(x), phi = nb1Dispersion(x);
  const { d2, m } = localDiffs(x);
  const out = { law: 'either', phi: Math.round(phi * 1000) / 1000, size: Number.isFinite(size) ? Math.round(size * 100) / 100 : null };
  if (d2.length < 20) return { ...out, levelSpan: null };
  const order = m.map((_, i) => i).sort((a, b) => m[a] - m[b]);
  const half = Math.floor(order.length / 2), low = order.slice(0, half), high = order.slice(order.length - half);
  const mid = (idx) => median(idx.map((i) => m[i]));
  const levelSpan = mid(high) / mid(low);
  const gap = (vf) => {
    const z = (idx) => idx.map((i) => Math.min(NB_K, d2[i] / (2 * vf(m[i]))));
    const zl = z(low), zh = z(high), ml = cappedMean(zl), mh = cappedMean(zh);
    const v = (a, mu) => a.reduce((s, q) => s + (q - mu) ** 2, 0) / (a.length - 1) / a.length;
    return (mh - ml) / Math.sqrt(1.5 * (v(zl, ml) + v(zh, mh)));
  };
  const gapNb1 = gap((mu) => phi * mu), gapNb2 = gap((mu) => mu + (Number.isFinite(size) ? mu * mu / size : 0));
  const r = { ...out, levelSpan: Math.round(levelSpan * 100) / 100, gapNb1: Math.round(gapNb1 * 100) / 100, gapNb2: Math.round(gapNb2 * 100) / 100 };
  if (!(levelSpan >= 3) || (phi <= 1 && !Number.isFinite(size))) return r;
  const a1 = Math.abs(gapNb1), a2 = Math.abs(gapNb2);
  if (a2 > 2 && a2 > a1 + 1) return { ...r, law: 'nb1' };
  if (a1 > 2 && a1 > a2 + 1) return { ...r, law: 'nb2' };
  return r;
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
  // The count costs (poisson, negbin, negbin1) never read sigma, so their noise sd is not estimated: robustSd's two medians
  // were about 5% of a Poisson trend fit (docs/history/ci-perf-2026-11-16-changepoint-poisson-inline.md). 1 is a placeholder.
  const counts = model === 'poisson' || model === 'negbin' || model === 'negbin1';
  const sd = sigma ?? (counts ? 1 : robustSd(x));
  const mean = model === 'mean';
  const poisson = model === 'poisson';
  // 'mean' and 'poisson' build their own prefix sums below, so their closures are only needed for the short-series answer
  const cost = (mean || poisson) && n >= 2 * minSeg ? null : makeCost(x, model, sd, rho, exposure, size);
  if (n < 2 * minSeg) return { changepoints: [], cost: n ? cost(0, n) : 0, penalty: beta };
  const F = new Float64Array(n + 1).fill(Infinity);
  const last = new Int32Array(n + 1).fill(-1);
  F[0] = -beta;
  // The candidate starts R live in a typed array compacted in place, and each start's value in a parallel one: no array,
  // closure or boxed number per step. The 'mean' cost (most calls: every trend and seasonal pass) is written out inline,
  // the same expression in the same order as makeCost's, so the call is not a megamorphic closure call.
  // Pruning is deferred one step and folded into the next step's scan: at step t a start whose value at t - 1 failed the
  // prune test against F(t - 1) is dropped as it is reached, so R is walked once per step, not twice. The same starts are
  // scored in the same order against the same values, so the same changepoints
  // (docs/history/ci-perf-2026-11-11-pelt-inner-loop.md, ci-perf-2026-11-11-median-select-pelt-one-pass.md).
  // The 'mean' cost runs in its own loop, peltMeanLoop, with nothing else in its body: about 23% faster per call on the 195-point
  // trend fits, the same bits (docs/history/ci-perf-2026-11-17-changepoint-pelt-mean-loop.md).
  let R = new Int32Array(n + 1), V = new Float64Array(n + 1), r = 1;
  V[0] = -Infinity; // a new start is kept unconditionally, as before
  let S1 = null, S2 = null, s2 = 0;
  if (mean) {
    S1 = new Float64Array(n + 1); S2 = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { S1[i + 1] = S1[i] + x[i]; S2[i + 1] = S2[i] + x[i] * x[i]; }
    s2 = sd * sd;
  }
  let P1 = null, PE = null;
  if (poisson) {
    // the same prefix sums, in the same order, as makeCost's poisson branch (S1 and E)
    P1 = new Float64Array(n + 1); PE = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { P1[i + 1] = P1[i] + x[i]; PE[i + 1] = PE[i] + (exposure ? exposure[i] : 1); }
  }
  let prev = Infinity; // F at the previous step, the bound the stored values are pruned against
  if (mean) return peltMeanLoop(n, minSeg, beta, F, last, R, V, S1, S2, s2);
  for (let t = minSeg; t <= n; t++) {
    let best = Infinity;
    let arg = -1;
    let k = 0;
    for (let i = 0; i < r; i++) {
      // Prune: s can never be the last change for any t' > t - 1 if F(s) + C(s,t - 1) > F(t - 1) (K = 0). A start too recent
      // to score was marked -Infinity, which keeps it, as the old null did; a NaN cost is pruned, as before.
      if (!(V[i] - beta <= prev)) continue;
      const s = R[i];
      R[k] = s;
      if (t - s < minSeg) { V[k++] = -Infinity; continue; }
      let c;
      if (poisson) {
        const m = PE[t] - PE[s];
        const a = P1[t] - P1[s];
        c = a > 0 && m > 0 ? 2 * (a - a * Math.log(a / m)) : 0;
      } else c = cost(s, t);
      const v = F[s] + c + beta;
      V[k++] = v;
      if (v < best) { best = v; arg = s; }
    }
    F[t] = best;
    last[t] = arg;
    if (Number.isFinite(best)) { R[k] = t; V[k++] = -Infinity; }
    r = k;
    prev = best;
  }
  const cps = [];
  for (let t = n; last[t] > 0; t = last[t]) cps.push(last[t]);
  cps.reverse();
  return { changepoints: cps, cost: F[n], penalty: beta };
}

// PELT's step loop for the 'mean' cost alone: the same starts, the same pruning, the same cost expression in the same order as
// the general loop's mean branch, so the same F, the same changepoints and the same cost to the bit.
function peltMeanLoop(n, minSeg, beta, F, last, R, V, S1, S2, s2) {
  let r = 1, prev = Infinity;
  for (let t = minSeg; t <= n; t++) {
    let best = Infinity;
    let arg = -1;
    let k = 0;
    const St1 = S1[t], St2 = S2[t];
    for (let i = 0; i < r; i++) {
      const vi = V[i];
      if (!(vi - beta <= prev)) continue;
      const s = R[i];
      R[k] = s;
      const m = t - s;
      if (m < minSeg) { V[k++] = -Infinity; continue; }
      const a = St1 - S1[s];
      const v = F[s] + Math.max(0, St2 - S2[s] - (a * a) / m) / s2 + beta;
      V[k++] = v;
      if (v < best) { best = v; arg = s; }
    }
    F[t] = best;
    last[t] = arg;
    if (Number.isFinite(best)) { R[k] = t; V[k++] = -Infinity; }
    r = k;
    prev = best;
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


export function stats(a) {
  const n = a.length;
  const mean = a.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd };
}

export const round = (v, d = 4) => (Number.isFinite(v) ? Number(v.toPrecision(d + 2)) : v);
export const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));

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
  const rnd = mulberry(seed);
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
  const rnd = mulberry(seed);
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

// Segment-standardise a series by the fitted changepoints, then look for what a Gaussian variance model cannot hold:
// fourth moment above 4.5 (Gaussian runs top out near 3.9), lag-1 autocorrelation of the residuals from 0.25, and of their
// squares from 0.2 (Gaussian 90th percentiles 0.08 and 0.11). Returns a warning string or null.
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
