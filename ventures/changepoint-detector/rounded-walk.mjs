// Rounded walk or stale feed: a likelihood-ratio test (README "One-tick stale feeds: a likelihood").
//
// The catch-up ratio (update-rate.mjs, catchUpRatio) uses only the moves that end a run of repeats, and
// two pre-registered rounds showed that 300 steps hold too few of them to clear both bars. This uses
// every step. Two models for a stretch of values recorded to a tick:
//   M0, rounding: a hidden Gaussian random walk x_t = x_{t-1} + s e_t, recorded as round(x_t);
//   M1, carried forward: the same hidden walk, but each step, with probability p, the record repeats
//       the previous recorded value whatever x_t is; otherwise it is round(x_t).
// M0 is M1 with p = 0. The likelihood of each is computed exactly up to a grid (G cells per tick) by a
// forward filter over the hidden value, and maximised over s (and p). Under M0 the statistic
// LR = 2 (max l1 - max l0) is, for long stretches, a 50:50 mix of 0 and chi-square(1), since p = 0 is on
// the boundary (Self and Liang 1987); its 1% point is 5.41 (P(chi2_1 > 5.41) = 0.02).
//
// What it does not model: a hidden value that mean-reverts, drifts or has heavy-tailed steps, and
// carry-forward that clumps (a quote that sits for months). Those can move LR in either direction;
// the pre-registered cells (eval/update-rate-stale-lr.mjs) include one clumped stale feed.

const SQRT1_2 = Math.SQRT1_2;
// erfc with relative error under 1.2e-7 (Numerical Recipes, erfcc).
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const Phi = (x) => 0.5 * erfc(-x * SQRT1_2);

function kernel(s, G) {
  const K = Math.max(1, Math.ceil(6 * s * G)), w = new Float64Array(2 * K + 1);
  let tot = 0;
  for (let d = -K; d <= K; d++) { const v = Phi(((d + 0.5) / G) / s) - Phi(((d - 0.5) / G) / s); w[d + K] = v; tot += v; }
  for (let i = 0; i < w.length; i++) w[i] /= tot;
  return { w, K };
}

/** Integer ticks from values: k_t = round((v_t - v_0) / tick), finite values only. */
export function toTicks(values, from, to, tick) {
  const out = [];
  let base = null;
  for (let t = Math.max(0, from); t <= to; t++) {
    const v = Number(values[t]);
    if (!Number.isFinite(v)) continue;
    if (base == null) base = v;
    out.push(Math.round((v - base) / tick));
  }
  return out;
}

/**
 * Log likelihood of integer ticks k (conditioned on k[0]) under the hidden walk with step sd s ticks,
 * recorded rounded, each step carried forward with probability p. G grid cells per tick.
 */
export function roundedWalkLogLik(k, s, p, G = 10) {
  if (k.length < 2) return 0;
  let mn = Infinity, mx = -Infinity;
  for (const v of k) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const { w, K } = kernel(s, G);
  // Cells c in [0, M): cell c covers hidden values [(c + c0) / G - 0.5, (c + c0 + 1) / G - 0.5) ticks,
  // so tick y owns cells (y - mn + pad) * G .. + G - 1. While carried forward the hidden value can wander
  // from the record; the pad covers 8 sd over 400 steps or the range, whichever is larger.
  const pad = Math.ceil(Math.min(8 * s * Math.sqrt(Math.min(k.length, 400)), 4 * (mx - mn + 10))) + 2;
  const M = (mx - mn + 1 + 2 * pad) * G;
  let f = new Float64Array(M), g = new Float64Array(M);
  const cellsOf = (y) => (y - mn + pad) * G;
  let a = cellsOf(k[0]), b = a + G - 1;
  for (let c = a; c <= b; c++) f[c] = 1 / G;
  let ll = 0;
  for (let t = 1; t < k.length; t++) {
    const lo = Math.max(0, a - K), hi = Math.min(M - 1, b + K);
    g.fill(0, lo, hi + 1);
    for (let i = a; i <= b; i++) {
      const fi = f[i];
      if (fi === 0) continue;
      const j0 = Math.max(0, i - K), j1 = Math.min(M - 1, i + K);
      for (let j = j0; j <= j1; j++) g[j] += fi * w[j - i + K];
    }
    const y = k[t], same = y === k[t - 1], ya = cellsOf(y), yb = ya + G - 1;
    let Z = 0;
    if (same && p > 0) {
      for (let j = lo; j <= hi; j++) { const v = g[j] * (p + (j >= ya && j <= yb ? 1 - p : 0)); g[j] = v; Z += v; }
    } else {
      for (let j = lo; j <= hi; j++) { const v = j >= ya && j <= yb ? g[j] * (1 - p) : 0; g[j] = v; Z += v; }
    }
    if (!(Z > 0)) return -Infinity;
    ll += Math.log(Z);
    let na = -1, nb = -1;
    const tiny = 1e-13;
    for (let j = lo; j <= hi; j++) {
      const v = g[j] / Z;
      if (v > tiny) { g[j] = v; if (na < 0) na = j; nb = j; } else g[j] = 0;
    }
    f.fill(0, a, b + 1);
    [f, g] = [g, f];
    a = na; b = nb;
  }
  return ll;
}

const PHI = (Math.sqrt(5) - 1) / 2;
function golden(fn, lo, hi, iters) {
  let x1 = hi - PHI * (hi - lo), x2 = lo + PHI * (hi - lo), f1 = fn(x1), f2 = fn(x2);
  let best = f1 > f2 ? { x: x1, f: f1 } : { x: x2, f: f2 };
  for (let i = 0; i < iters; i++) {
    if (f1 > f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - PHI * (hi - lo); f1 = fn(x1); if (f1 > best.f) best = { x: x1, f: f1 }; }
    else { lo = x1; x1 = x2; f1 = f2; x2 = lo + PHI * (hi - lo); f2 = fn(x2); if (f2 > best.f) best = { x: x2, f: f2 }; }
  }
  return best;
}

export const STALE_LR = { G: 10, sMin: 0.15, sMax: 6, pMax: 0.95, iters: 18, rounds: 3, threshold: 5.41, minSteps: 30, maxSteps: 2000 };

/**
 * The test on integer ticks. { lr, s0, s1, p, l0, l1, steps } or null when the stretch is too short
 * or too long (cost grows with its length and spread).
 */
export function staleLikelihoodRatio(k, opts = {}) {
  const o = { ...STALE_LR, ...opts };
  if (k.length - 1 < o.minSteps || k.length - 1 > o.maxSteps) return null;
  const L = (s, p) => roundedWalkLogLik(k, s, p, o.G);
  const ls = [Math.log(o.sMin), Math.log(o.sMax)];
  const m0 = golden((x) => L(Math.exp(x), 0), ls[0], ls[1], o.iters);
  // M1 by coordinate ascent from M0's fit; the best point seen is kept, so l1 >= l0.
  let s = Math.exp(m0.x), p = 0, l1 = m0.f;
  for (let r = 0; r < o.rounds; r++) {
    const bp = golden((q) => L(s, q), 0, o.pMax, o.iters);
    if (bp.f > l1) { p = bp.x; l1 = bp.f; }
    const bs = golden((x) => L(Math.exp(x), p), ls[0], ls[1], o.iters);
    if (bs.f > l1) { s = Math.exp(bs.x); l1 = bs.f; }
  }
  return { lr: Math.max(0, 2 * (l1 - m0.f)), s0: Math.exp(m0.x), s1: s, p, l0: m0.f, l1, steps: k.length - 1 };
}

/** The test on a stretch of values (value indexes from..to), for update-rate.mjs `catchUp.test`. */
export function staleTest(values, from, to, tick, opts = {}) { return staleLikelihoodRatio(toTicks(values, from, to, tick), opts); }
