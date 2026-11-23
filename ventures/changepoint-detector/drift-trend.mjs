// Jumps on a smooth trend: a changepoint model whose level carries momentum between changes.
//
// The drift model (drift-level.mjs) lets the level wander as a random walk between changes. On a
// series whose level is smooth instead (it moves in the same direction for many steps, then turns),
// the lag-k differences grow faster than linearly in k, the walk-plus-noise line through them has a
// negative intercept, and driftNoise falls back to its 2% floor for sigma: on 21 of 38 TCPD series
// (README "Why the likelihood's wander absorbs a step"). A floored sigma means the walk is the wrong
// shape. This model is the standard smooth-trend (integrated random walk) state space model,
//
//   y_t = mu_t + e_t,             e_t ~ N(0, sigma^2)
//   mu_{t+1} = mu_t + b_t         (the level moves by the current slope)
//   b_{t+1} = b_t + z_{t+1},      z ~ N(0, zeta^2)    (the slope wanders)
//
// (Durbin and Koopman, "Time Series Analysis by State Space Methods", section 3.2.1; the Hodrick-
// Prescott filter is its smoother at a fixed zeta / sigma), with a change restarting both the level
// and the slope from a flat (diffuse) prior. Segments are then independent; the first two points of
// a segment set its level and slope and carry no cost, and the filter's variances depend only on the
// position in the segment, so they are computed once and every open segment start costs a few
// multiply-adds per point: exact optimal partitioning in O(n^2) time, O(n) memory, as in
// drift-level.mjs. The default penalty is 3 log n (a change places a cut and restarts two states).
//
// sigma and zeta come from lag-k second differences before any change is fitted, robustly:
// y_{t+2k} - 2 y_{t+k} + y_t has variance 6 sigma^2 + zeta^2 k (2k^2 + 1) / 3 under this model (the
// slope steps enter with triangular weights 1..k..1), and the median absolute deviation of each lag's
// differences is barely moved by a few jumps, so a least-squares line through the robust variances in
// c_k = k (2k^2 + 1) / 3 gives both. With noise 'ml' (as the drift CLI's default) sigma is kept and
// zeta is chosen with the changes, by the same profiled objective driftNoiseML uses.
// Pure code, no dependencies.

import { median } from './stats-core.mjs';
const MAD = 1.482602218505602;

// Robust variance of the lag-k second differences, k = 1..maxLag, and the fitted (sigma, zeta).
export function trendNoise(x, { maxLag = 6 } = {}) {
  const n = x.length;
  const K = Math.max(1, Math.min(maxLag, Math.floor((n - 1) / 6)));
  const v = [];
  for (let k = 1; k <= K; k++) {
    const d = [];
    for (let t = 0; t + 2 * k < n; t++) d.push(x[t + 2 * k] - 2 * x[t + k] + x[t]);
    const md = median(d);
    const s = MAD * median(d.map((z) => Math.abs(z - md)));
    let vk = s * s;
    if (!(vk > 0)) { const m = d.reduce((a, z) => a + z, 0) / d.length; vk = d.reduce((a, z) => a + (z - m) ** 2, 0) / d.length; }
    v.push({ k, c: (k * (2 * k * k + 1)) / 3, v: vk });
  }
  let a, b;
  if (v.length < 2) { a = v[0].v; b = 0; } else {
    const mc = v.reduce((s, r) => s + r.c, 0) / v.length;
    const mv = v.reduce((s, r) => s + r.v, 0) / v.length;
    const sxy = v.reduce((s, r) => s + (r.c - mc) * (r.v - mv), 0);
    const sxx = v.reduce((s, r) => s + (r.c - mc) ** 2, 0);
    b = sxy / sxx; a = mv - b * mc;
    if (b < 0) { b = 0; a = mv; }
    if (a < 0) { a = 0; b = v.reduce((s, r) => s + r.c * r.v, 0) / v.reduce((s, r) => s + r.c * r.c, 0); }
  }
  // Same numerical guard as driftNoise: sigma at least 2% of the lag-1 variance's noise share.
  const floor = (0.02 * v[0].v) / 6;
  const sigma2 = Math.max(a / 6, floor, 1e-12);
  return { sigma: Math.sqrt(sigma2), zeta: Math.sqrt(Math.max(b, 0)), lagVariances: v, flooredSigma: a / 6 < floor };
}

// Gains and innovation variances for the j-th point of a segment (j = 2, 3, ...), in sigma^2 units,
// qz = zeta^2 / sigma^2. After the first two points: level y_1 (error e_1), slope y_1 - y_0
// (error e_1 - e_0 - z_1), so P = [[1, 1], [1, 2 + qz]].
export function trendGains(n, qz) {
  const K0 = new Float64Array(n), K1 = new Float64Array(n), F = new Float64Array(n), logF = new Float64Array(n);
  let p00 = 1, p01 = 1, p11 = 2 + qz;
  for (let j = 2; j < n; j++) {
    const a00 = p00 + 2 * p01 + p11, a01 = p01 + p11, a11 = p11 + qz;
    F[j] = a00 + 1; K0[j] = a00 / F[j]; K1[j] = a01 / F[j]; logF[j] = Math.log(F[j]);
    p00 = a00 * (1 - K0[j]); p01 = a01 * (1 - K0[j]); p11 = a11 - K1[j] * a01;
  }
  return { K0, K1, F, logF };
}

// -2 log likelihood of one segment (values / sigma), for tests and for checking a partition.
export function trendSegmentCost(values, { sigma, zeta }) {
  const y = Array.from(values, (v) => Number(v) / sigma), m = y.length;
  if (m < 3) return 0;
  const { K0, K1, F, logF } = trendGains(m, (zeta * zeta) / (sigma * sigma));
  let a = y[1], b = y[1] - y[0], c = 0;
  for (let j = 2; j < m; j++) {
    const ap = a + b, v = y[j] - ap;
    c += logF[j] + (v * v) / F[j];
    a = ap + K0[j] * v; b += K1[j] * v;
  }
  return c;
}

function partition(y, qz, beta, minSegment) {
  const n = y.length;
  const { K0, K1, F, logF } = trendGains(n, qz);
  const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n);
  const best = new Float64Array(n + 1), last = new Int32Array(n + 1);
  best[0] = -beta;
  for (let t = 0; t < n; t++) {
    for (let st = 0; st < t - 1; st++) {
      const j = t - st, ap = a[st] + b[st], v = y[t] - ap;
      c[st] += logF[j] + (v * v) / F[j];
      a[st] = ap + K0[j] * v; b[st] += K1[j] * v;
    }
    if (t >= 1) { a[t - 1] = y[t]; b[t - 1] = y[t] - y[t - 1]; c[t - 1] = 0; }
    a[t] = y[t]; b[t] = 0; c[t] = 0;
    let bv = Infinity, bs = 0;
    for (let st = 0; st + minSegment - 1 <= t; st++) {
      if (st > 0 && st < minSegment) continue;
      const val = best[st] + beta + c[st];
      if (val < bv) { bv = val; bs = st; }
    }
    best[t + 1] = bv; last[t + 1] = bs;
  }
  const cps = [];
  for (let t = n; t > 0; t = last[t]) if (last[t] > 0) cps.push(last[t]);
  cps.reverse();
  return { changepoints: cps, cost: best[n] };
}

// Changes on a smooth trend. noise: 'ml' (default; sigma from second differences, zeta profiled with
// the changes on a log grid of qz from 1e-6 to 1e2 plus 0, refined by golden section) or 'lags'
// (both from second differences). minSegment at least 3.
// qzMax caps the slope wander (zeta^2 / sigma^2) the 'ml' search may choose: a stiff slope, so a turn
// in the trend costs a cut instead of being absorbed as a slope move (README "A stiff slope").
export function trendWalkChanges(values, { sigma, zeta, penalty, minSegment = 3, noise = 'ml', qzMax = Infinity } = {}) {
  const x = Array.from(values, Number), n = x.length;
  const ms = Math.max(3, minSegment);
  const beta = penalty ?? 3 * Math.log(n);
  if (n < 2 * ms) return { changepoints: [], sigma: sigma ?? null, zeta: zeta ?? null, penalty: beta, noise };
  const est = trendNoise(x);
  const s = sigma ?? est.sigma;
  const y = x.map((v) => v / s);
  if (zeta != null || noise === 'lags') {
    const z = zeta ?? est.zeta;
    const r = partition(y, (z * z) / (s * s), beta, ms);
    return { ...r, sigma: s, zeta: z, penalty: beta, noise: zeta != null ? 'given' : 'lags', flooredSigma: sigma == null && est.flooredSigma };
  }
  const memo = new Map();
  const evalQ = (q) => { const k = q.toPrecision(12); if (!memo.has(k)) memo.set(k, { q, ...partition(y, q, beta, ms) }); return memo.get(k); };
  const capped = Number.isFinite(qzMax) && qzMax > 0;
  const qs = [0, ...Array.from({ length: 17 }, (_, i) => 10 ** (-6 + i / 2)).filter((q) => !capped || q < qzMax * (1 - 1e-9)), ...(capped ? [qzMax] : [])];
  let best = null, bi = 0;
  qs.forEach((q, i) => { const r = evalQ(q); if (!best || r.cost < best.cost) { best = r; bi = i; } });
  if (best.q > 0) {
    let lo = Math.log10(bi > 1 ? qs[bi - 1] : 1e-7), hi = Math.log10(bi + 1 < qs.length ? qs[bi + 1] : qs[bi]);
    const gr = (Math.sqrt(5) - 1) / 2;
    let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
    for (let it = 0; it < 10; it++) {
      if (evalQ(10 ** c).cost < evalQ(10 ** d).cost) { hi = d; d = c; c = hi - gr * (hi - lo); }
      else { lo = c; c = d; d = lo + gr * (hi - lo); }
    }
    for (const q of [10 ** c, 10 ** d]) { const r = evalQ(q); if (r.cost < best.cost) best = r; }
  }
  return { changepoints: best.changepoints, cost: best.cost, sigma: s, zeta: s * Math.sqrt(best.q), q: best.q, penalty: beta, noise: 'ml', flooredSigma: sigma == null && est.flooredSigma, atGridEdge: bi === qs.length - 1, qzMax: capped ? qzMax : null, atCap: capped && best.q >= qzMax * (1 - 1e-6) };
}
