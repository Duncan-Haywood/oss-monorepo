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
// the pre-registered cells (eval/update-rate-stale-lr.mjs) include one clumped stale feed. Round four
// added t steps; round five (roundedWalkLogLikMarkov, below) models clumped carry-forward and is the default.

const SQRT1_2 = Math.SQRT1_2;
// erfc with relative error under 1.2e-7 (Numerical Recipes, erfcc).
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const Phi = (x) => 0.5 * erfc(-x * SQRT1_2);

function kernel(s, G, nu = Infinity, maxCells = Infinity) {
  if (Number.isFinite(nu)) return tKernel(s, G, nu, maxCells);
  const K = Math.max(1, Math.ceil(6 * s * G)), w = new Float64Array(2 * K + 1);
  let tot = 0;
  for (let d = -K; d <= K; d++) { const v = Phi(((d + 0.5) / G) / s) - Phi(((d - 0.5) / G) / s); w[d + K] = v; tot += v; }
  for (let i = 0; i < w.length; i++) w[i] /= tot;
  return { w, K };
}

// Lanczos log-gamma (g 7, 9 terms), relative error under 1e-13 for x > 0.5.
const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  x -= 1;
  let a = LG[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Round four (README "One-tick stale feeds: a heavy-tailed walk"): Student t steps with nu degrees of
// freedom and scale s ticks. Cell masses by an 8-point midpoint rule on the density. The kernel reaches
// out to the point where the tail mass is about 1e-7, or to `maxCells` (the largest move in the stretch
// plus 3 ticks, set by the caller) if that is nearer; it is not renormalised, so a jump past the reach
// counts as impossible, which changes a likelihood only by the tail mass beyond the largest seen move.
function tKernel(s, G, nu, maxCells) {
  const reach = Math.ceil(s * G * Math.pow(1e7, 1 / nu));
  const K = Math.max(1, Math.ceil(6 * s * G), Math.min(reach, maxCells));
  const logc = lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI) - Math.log(s);
  const e = -(nu + 1) / 2, w = new Float64Array(2 * K + 1), h = 1 / (8 * G);
  for (let d = -K; d <= K; d++) {
    let v = 0;
    for (let i = 0; i < 8; i++) { const x = ((d - 0.5) / G + (i + 0.5) * h) / s; v += Math.exp(logc + e * Math.log1p(x * x / nu)); }
    w[d + K] = v * h;
  }
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
 * recorded rounded, each step carried forward with probability p. G grid cells per tick. With a finite
 * nu the steps are Student t with nu degrees of freedom and scale s (round four); Infinity is Gaussian.
 */
export function roundedWalkLogLik(k, s, p, G = 10, nu = Infinity) {
  if (k.length < 2) return 0;
  let mn = Infinity, mx = -Infinity, big = 0;
  for (let t = 0; t < k.length; t++) {
    const v = k[t];
    if (v < mn) mn = v; if (v > mx) mx = v;
    if (t > 0) big = Math.max(big, Math.abs(v - k[t - 1]));
  }
  const { w, K } = kernel(s, G, nu, (big + 3) * G);
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

// The coordinate ascent below re-asks the filter questions it already answered: when a round moves
// neither s nor p, the next round's golden searches probe exactly the same points (one stale-feed test:
// 10,640 roundedWalkLogLik calls, 3,040 distinct). The likelihood is a pure function of its arguments,
// so each fit keeps its answers by argument (a JS number's string form round-trips exactly); the fits
// and their results are unchanged (docs/history/ci-perf-2026-11-19-rounded-walk-fit-memo.md).
function memo2(fn) { const m = new Map(); return (x, y) => { const key = `${x},${y}`; let v = m.get(key); if (v === undefined) { v = fn(x, y); m.set(key, v); } return v; }; }
function memo3(fn) { const m = new Map(); return (x, y, z) => { const key = `${x},${y},${z}`; let v = m.get(key); if (v === undefined) { v = fn(x, y, z); m.set(key, v); } return v; }; }

export const STALE_LR = { G: 10, sMin: 0.15, sMax: 6, pMax: 0.95, iters: 18, rounds: 3, threshold: 5.41, minSteps: 30, maxSteps: 2000 };

/**
 * The test on integer ticks. { lr, s0, s1, p, l0, l1, steps } or null when the stretch is too short
 * or too long (cost grows with its length and spread).
 */
export function staleLikelihoodRatio(k, opts = {}) {
  const o = { ...STALE_LR, ...opts };
  if (k.length - 1 < o.minSteps || k.length - 1 > o.maxSteps) return null;
  if (o.nus) return staleLRHeavy(k, o);
  const L = memo2((s, p) => roundedWalkLogLik(k, s, p, o.G));
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

// Round four: both models get Student t steps, with nu profiled over the grid `o.nus` (Infinity is the
// Gaussian walk, so round three's M0 is inside M0 here). For each nu, M0 is fitted over s and M1 by
// coordinate ascent from that fit; l0 and l1 are each the best over nu, so l1 >= l0 still holds. Under
// M0 nu is a nuisance shared by both models, so the boundary mix and its 1% point 5.41 are unchanged.
export const STALE_LR_HEAVY = { nus: [2, 4, 10, Infinity] };
function staleLRHeavy(k, o) {
  const ls = [Math.log(o.sMin), Math.log(o.sMax)];
  let best0 = null, best1 = null;
  for (const nu of o.nus) {
    const L = memo2((s, p) => roundedWalkLogLik(k, s, p, o.G, nu));
    const m0 = golden((x) => L(Math.exp(x), 0), ls[0], ls[1], o.iters);
    let s = Math.exp(m0.x), p = 0, l1 = m0.f;
    for (let r = 0; r < o.rounds; r++) {
      const bp = golden((q) => L(s, q), 0, o.pMax, o.iters);
      if (bp.f > l1) { p = bp.x; l1 = bp.f; }
      const bs = golden((x) => L(Math.exp(x), p), ls[0], ls[1], o.iters);
      if (bs.f > l1) { s = Math.exp(bs.x); l1 = bs.f; }
    }
    if (!best0 || m0.f > best0.l) best0 = { l: m0.f, s: Math.exp(m0.x), nu };
    if (!best1 || l1 > best1.l) best1 = { l: l1, s, p, nu };
  }
  return { lr: Math.max(0, 2 * (best1.l - best0.l)), s0: best0.s, s1: best1.s, p: best1.p, nu0: best0.nu, nu1: best1.nu, l0: best0.l, l1: best1.l, steps: k.length - 1 };
}

/** Round four's test on a stretch of values: t steps, nu profiled (STALE_LR_HEAVY). */
export function staleTestHeavy(values, from, to, tick, opts = {}) { return staleLikelihoodRatio(toTicks(values, from, to, tick), { ...STALE_LR_HEAVY, ...opts }); }

/** The test on a stretch of values (value indexes from..to), for update-rate.mjs `catchUp.test`. */
export function staleTest(values, from, to, tick, opts = {}) { return staleLikelihoodRatio(toTicks(values, from, to, tick), opts); }

// Round five (README "One-tick stale feeds: clumped carry-forward"): M1 with Markov carry-forward. A
// feed that has just repeated is likelier to repeat again (a quote that sits for days), which round
// four's M1, one carry probability per step, reads as a slow walk. Here the chance of carrying the
// record forward is `pEnter` after a fresh record and `pStay` after a carried one, so runs of repeats
// clump. With pStay = pEnter it is exactly round four's M1 (a test checks this). Whether the previous
// step was carried is hidden too (a repeat may be rounding), so the filter runs over the hidden value
// and that flag: f0 (last record fresh) and f1 (last record carried). The first record counts as fresh.
export function roundedWalkLogLikMarkov(k, s, pEnter, pStay, G = 10, nu = Infinity) {
  if (k.length < 2) return 0;
  let mn = Infinity, mx = -Infinity, big = 0;
  for (let t = 0; t < k.length; t++) {
    const v = k[t];
    if (v < mn) mn = v; if (v > mx) mx = v;
    if (t > 0) big = Math.max(big, Math.abs(v - k[t - 1]));
  }
  const { w, K } = kernel(s, G, nu, (big + 3) * G);
  const pad = Math.ceil(Math.min(8 * s * Math.sqrt(Math.min(k.length, 400)), 4 * (mx - mn + 10))) + 2;
  const M = (mx - mn + 1 + 2 * pad) * G;
  let f0 = new Float64Array(M), f1 = new Float64Array(M), g0 = new Float64Array(M), g1 = new Float64Array(M);
  const cellsOf = (y) => (y - mn + pad) * G;
  let a = cellsOf(k[0]), b = a + G - 1;
  for (let c = a; c <= b; c++) f0[c] = 1 / G;
  let ll = 0;
  const conv = (f, g, lo, hi) => {
    g.fill(0, lo, hi + 1);
    for (let i = a; i <= b; i++) {
      const fi = f[i];
      if (fi === 0) continue;
      const j0 = Math.max(0, i - K), j1 = Math.min(M - 1, i + K);
      for (let j = j0; j <= j1; j++) g[j] += fi * w[j - i + K];
    }
  };
  for (let t = 1; t < k.length; t++) {
    const lo = Math.max(0, a - K), hi = Math.min(M - 1, b + K);
    conv(f0, g0, lo, hi); conv(f1, g1, lo, hi);
    const y = k[t], same = y === k[t - 1], ya = cellsOf(y), yb = ya + G - 1;
    let Z = 0;
    for (let j = lo; j <= hi; j++) {
      const u0 = g0[j], u1 = g1[j];
      const carried = same ? pEnter * u0 + pStay * u1 : 0;
      const fresh = j >= ya && j <= yb ? (1 - pEnter) * u0 + (1 - pStay) * u1 : 0;
      g0[j] = fresh; g1[j] = carried; Z += fresh + carried;
    }
    if (!(Z > 0)) return -Infinity;
    ll += Math.log(Z);
    let na = -1, nb = -1;
    const tiny = 1e-13;
    for (let j = lo; j <= hi; j++) {
      const v0 = g0[j] / Z, v1 = g1[j] / Z;
      g0[j] = v0 > tiny ? v0 : 0; g1[j] = v1 > tiny ? v1 : 0;
      if (g0[j] > 0 || g1[j] > 0) { if (na < 0) na = j; nb = j; }
    }
    f0.fill(0, a, b + 1); f1.fill(0, a, b + 1);
    [f0, g0] = [g0, f0]; [f1, g1] = [g1, f1];
    a = na; b = nb;
  }
  return ll;
}

// Round five's test: round four's fit (t steps, nu profiled; M1 one carry probability), then, for each
// nu, M1 widened to Markov carry-forward by coordinate ascent over pStay, pEnter and s from round four's
// M1 fit, so l1 here >= round four's l1 >= l0. Returns round four's result with `lr` replaced by the
// Markov statistic and round four's kept as `lrIid`. Under M0 (pEnter = 0) pStay is not identified, so
// the boundary mix does not apply; the threshold is set by simulation (eval/update-rate-stale-lr-5.mjs).
// maxJump (2026-11-18, README "Currency pegs: the update-rate check against documented dates"): the grid's
// kernel spans the stretch's largest move, and the work grows roughly with its square (5 ticks 16 s, 20 to
// 40 ticks about a minute on 120 steps); a pegged rate with one bad print 950 ticks off (Malaysia,
// 1998-1999) ran for hours. A one-tick stretch with a move over 50 ticks is not a slow walk, so the test
// is not run (null), as for a stretch too short or long. Every simulated cell the threshold and the
// pre-registered rounds used moves at most 45 ticks (seeds 6, 31, 20261216, 20261217), so no verdict moves.
export const STALE_LR_MARKOV = { ...STALE_LR_HEAVY, markov: true, maxJump: 50 };
// The test is a pure function of the ticks and the options, and one analysis asks it the same
// question many times: consensus re-runs the update-rate check under each of its settings on the
// same stretch (frozen-juice's ppi: 7 calls, one distinct stretch, 3.6 s each). The last few
// answers are kept, keyed on the ticks and options, and each caller gets its own copy
// (docs/history/ci-perf-2026-11-16-stale-lr-memo.md).
const markovMemo = new Map(), MARKOV_MEMO_SIZE = 16;
const memoKey = (k, opts) => `${k.length}:${Array.prototype.join.call(k, ',')}|${JSON.stringify(opts, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v))}`;
export function staleLRMarkov(k, opts = {}) {
  const key = memoKey(k, opts);
  if (markovMemo.has(key)) { const r = markovMemo.get(key); return r && { ...r }; }
  const r = staleLRMarkovFit(k, opts);
  if (markovMemo.size >= MARKOV_MEMO_SIZE) markovMemo.delete(markovMemo.keys().next().value);
  markovMemo.set(key, r);
  return r && { ...r };
}
function staleLRMarkovFit(k, opts) {
  const o = { ...STALE_LR, ...STALE_LR_HEAVY, maxJump: STALE_LR_MARKOV.maxJump, ...opts };
  if (k.length - 1 < o.minSteps || k.length - 1 > o.maxSteps) return null;
  if (o.maxJump != null) for (let t = 1; t < k.length; t++) if (Math.abs(k[t] - k[t - 1]) > o.maxJump) return null;
  const ls = [Math.log(o.sMin), Math.log(o.sMax)];
  let best0 = null, best1 = null, bestM = null;
  for (const nu of o.nus) {
    const L = memo2((s, p) => roundedWalkLogLik(k, s, p, o.G, nu));
    const m0 = golden((x) => L(Math.exp(x), 0), ls[0], ls[1], o.iters);
    let s = Math.exp(m0.x), p = 0, l1 = m0.f;
    for (let r = 0; r < o.rounds; r++) {
      const bp = golden((q) => L(s, q), 0, o.pMax, o.iters);
      if (bp.f > l1) { p = bp.x; l1 = bp.f; }
      const bs = golden((x) => L(Math.exp(x), p), ls[0], ls[1], o.iters);
      if (bs.f > l1) { s = Math.exp(bs.x); l1 = bs.f; }
    }
    if (!best0 || m0.f > best0.l) best0 = { l: m0.f, s: Math.exp(m0.x), nu };
    if (!best1 || l1 > best1.l) best1 = { l: l1, s, p, nu };
    const LM = memo3((s2, pe, ps) => roundedWalkLogLikMarkov(k, s2, pe, ps, o.G, nu));
    let ms = s, pe = p, ps = p, lm = l1;
    for (let r = 0; r < o.rounds; r++) {
      const bq = golden((q) => LM(ms, pe, q), 0, o.pMax, o.iters);
      if (bq.f > lm) { ps = bq.x; lm = bq.f; }
      const be = golden((q) => LM(ms, q, ps), 0, o.pMax, o.iters);
      if (be.f > lm) { pe = be.x; lm = be.f; }
      const bs = golden((x) => LM(Math.exp(x), pe, ps), ls[0], ls[1], o.iters);
      if (bs.f > lm) { ms = Math.exp(bs.x); lm = bs.f; }
    }
    if (!bestM || lm > bestM.l) bestM = { l: lm, s: ms, pEnter: pe, pStay: ps, nu };
  }
  const lmBest = Math.max(bestM.l, best1.l);
  return {
    lr: Math.max(0, 2 * (lmBest - best0.l)), lrIid: Math.max(0, 2 * (best1.l - best0.l)),
    s0: best0.s, s1: best1.s, p: best1.p, nu0: best0.nu, nu1: best1.nu, pEnter: bestM.pEnter, pStay: bestM.pStay, nuM: bestM.nu,
    l0: best0.l, l1: best1.l, lM: lmBest, steps: k.length - 1,
  };
}

/** Round five's test on a stretch of values, for update-rate.mjs `catchUp.test`. */
export function staleTestMarkov(values, from, to, tick, opts = {}) { return staleLRMarkov(toTicks(values, from, to, tick), opts); }
