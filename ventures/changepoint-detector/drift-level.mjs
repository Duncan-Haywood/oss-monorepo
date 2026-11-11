// Changes in level on a series whose level also drifts: a jump model with a random-walk level.
//
// The plain level model (engine.mjs, model 'mean') assumes the level is flat between changes, so a
// smooth or wandering series is read as a staircase (406 cuts on TCPD's 816-month US population).
// This model assumes instead that between changes the level follows a random walk,
//
//   y_t = mu_t + e_t,   e_t ~ N(0, sigma^2)
//   mu_t = mu_{t-1} + w_t,   w_t ~ N(0, omega^2)      (no change at t)
//   mu_t free                                          (a change at t)
//
// so slow wander is paid for by omega, and only a jump too large for the walk is a change. It is
// the phi = 0 case of DeCAFS (Romano, Rigaill, Runge and Fearnhead, "Detecting abrupt changes in
// the presence of local fluctuations and autocorrelated noise", JASA 2022), solved here by exact
// optimal partitioning over segments instead of DeCAFS's functional pruning: a change restarts
// the level from a flat (diffuse) prior, so the segments are independent and each one's cost is
// the -2 log likelihood of a local-level Kalman filter run over it. The filter's variances depend
// only on how far into the segment it is, not on the data, so they are computed once and every
// candidate segment start costs one multiply-add per point. O(n^2) time, O(n) memory.
//
// sigma and omega come from the data before any change is fitted, robustly, as DeCAFS does: the
// lag-k difference y_{t+k} - y_t has variance 2 sigma^2 + k omega^2, and the median absolute
// difference is barely moved by a few jumps, so a least-squares line through the robust variances
// at lags 1..K gives both. Pure code, no dependencies; same results in the browser and Node.

const MAD = 1.482602218505602; // 1 / Phi^-1(0.75): MAD to sd under normal noise

function median(a) {
  const s = Float64Array.from(a).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Robust variance of the lag-k differences, k = 1..maxLag, and the fitted (sigma, omega).
export function driftNoise(x, { maxLag = 10 } = {}) {
  const n = x.length;
  const K = Math.max(1, Math.min(maxLag, Math.floor((n - 1) / 3)));
  const v = [];
  for (let k = 1; k <= K; k++) {
    const d = [];
    for (let t = 0; t + k < n; t++) d.push(x[t + k] - x[t]);
    const md = median(d);
    const s = MAD * median(d.map((z) => Math.abs(z - md)));
    v.push({ k, v: s * s });
  }
  // Least squares v_k = a + b k with a = 2 sigma^2 >= 0, b = omega^2 >= 0.
  let a, b;
  if (v.length < 2) { a = v[0].v; b = 0; } else {
    const mk = v.reduce((s, r) => s + r.k, 0) / v.length;
    const mv = v.reduce((s, r) => s + r.v, 0) / v.length;
    const sxy = v.reduce((s, r) => s + (r.k - mk) * (r.v - mv), 0);
    const sxx = v.reduce((s, r) => s + (r.k - mk) ** 2, 0);
    b = sxy / sxx; a = mv - b * mk;
    if (b < 0) { b = 0; a = mv; }
    if (a < 0) { a = 0; b = v.reduce((s, r) => s + r.k * r.v, 0) / v.reduce((s, r) => s + r.k * r.k, 0); }
  }
  // A pure random walk has sigma = 0; keep a small floor so the cost stays finite. The floor
  // (2% of the lag-1 variance) is a numerical guard, not tuned on any scored series.
  const sigma2 = Math.max(a / 2, 0.02 * v[0].v / 2, 1e-12);
  return { sigma: Math.sqrt(sigma2), omega: Math.sqrt(Math.max(b, 0)), lagVariances: v };
}

// The level's steady drift per step: the median first difference, which a few jumps barely move.
// With slope: true it is taken out first, so the random walk only has to follow the wander around a
// steady growth (a population, a price index), not the growth itself. Added after the first TCPD
// scoring (eval/tcpd-drift.mjs labels it post hoc).
export function medianSlope(x) {
  const d = [];
  for (let t = 1; t < x.length; t++) d.push(x[t] - x[t - 1]);
  return d.length ? median(d) : 0;
}

// Kalman gains and innovation variances for the j-th point of a segment (j = 1, 2, ...), in units
// of sigma^2 (q = omega^2 / sigma^2). The first point (j = 0) only sets the level.
function gains(n, q) {
  const K = new Float64Array(n), F = new Float64Array(n), logF = new Float64Array(n);
  let P = 1; // posterior variance of the level after the segment's first point, in sigma^2 units
  for (let j = 1; j < n; j++) {
    const Pp = P + q;
    F[j] = Pp + 1;
    K[j] = Pp / F[j];
    logF[j] = Math.log(F[j]);
    P = Pp * (1 - K[j]);
  }
  return { K, F, logF };
}

// Exact optimal partitioning. Returns the change indices (the first point of each new segment).
// penalty is on the -2 log likelihood scale with sigma = 1; the default, 2 log n, is the BIC the
// plain level model uses (engine.mjs penaltyValue 'bic' for model 'mean').
export function driftLevelChanges(values, { sigma, omega, penalty, minSegment = 2, slope = false } = {}) {
  const raw = Array.from(values, Number);
  const g = slope ? medianSlope(raw) : 0;
  const x = g ? raw.map((v, t) => v - g * t) : raw;
  const n = x.length;
  if (n < 2 * minSegment) return { changepoints: [], sigma: sigma ?? null, omega: omega ?? null, penalty: null };
  const est = sigma == null || omega == null ? driftNoise(x) : null;
  const s = sigma ?? est.sigma, w = omega ?? est.omega;
  const beta = penalty ?? 2 * Math.log(n);
  const q = (w * w) / (s * s);
  const y = x.map((v) => v / s);
  const { K, logF, F } = gains(n, q);
  // For every open segment start st: its filtered level a[st] and its cost so far c[st].
  const a = new Float64Array(n), c = new Float64Array(n);
  const best = new Float64Array(n + 1); // best[t] = optimal cost of y[0..t-1]
  const last = new Int32Array(n + 1);
  best[0] = -beta;
  for (let t = 0; t < n; t++) {
    // Extend every segment that started before t by the point t, then open one starting at t.
    for (let st = 0; st < t; st++) {
      const j = t - st, v = y[t] - a[st];
      c[st] += logF[j] + (v * v) / F[j];
      a[st] += K[j] * v;
    }
    a[t] = y[t]; c[t] = 0;
    // best[t+1]: the last segment is y[st..t], at least minSegment long.
    let bv = Infinity, bs = 0;
    for (let st = 0; st + minSegment - 1 <= t; st++) {
      if (st > 0 && st < minSegment) continue;
      const v = best[st] + beta + c[st];
      if (v < bv) { bv = v; bs = st; }
    }
    best[t + 1] = bv; last[t + 1] = bs;
  }
  const cps = [];
  for (let t = n; t > 0; t = last[t]) if (last[t] > 0) cps.push(last[t]);
  cps.reverse();
  return { changepoints: cps, sigma: s, omega: w, penalty: beta, cost: best[n], slope: g };
}

// The -2 log likelihood of one segment on its own (the cost optimal partitioning adds up), in the
// same units as driftLevelChanges: values divided by sigma. For tests and for checking a partition.
export function driftSegmentCost(values, { sigma, omega }) {
  const y = Array.from(values, (v) => Number(v) / sigma), m = y.length;
  const { K, F, logF } = gains(m, (omega * omega) / (sigma * sigma));
  let a = y[0], c = 0;
  for (let j = 1; j < m; j++) { const v = y[j] - a; c += logF[j] + (v * v) / F[j]; a += K[j] * v; }
  return c;
}

// Smoothed level within each segment (Rauch-Tung-Striebel), so a change can be reported as the
// level just before it and just after it. Returns an array of n levels in the input's units.
export function driftLevelPath(values, changepoints, { sigma, omega, slope = 0 }) {
  const x = Array.from(values, (v, t) => Number(v) - slope * t), n = x.length;
  const q = (omega * omega) / (sigma * sigma);
  const out = new Float64Array(n);
  const bounds = [0, ...changepoints, n];
  for (let b = 0; b + 1 < bounds.length; b++) {
    const lo = bounds[b], hi = bounds[b + 1], m = hi - lo;
    const af = new Float64Array(m), Pf = new Float64Array(m), Pp = new Float64Array(m);
    af[0] = x[lo]; Pf[0] = 1; Pp[0] = Infinity;
    for (let j = 1; j < m; j++) {
      Pp[j] = Pf[j - 1] + q;
      const k = Pp[j] / (Pp[j] + 1);
      af[j] = af[j - 1] + k * (x[lo + j] - af[j - 1]);
      Pf[j] = Pp[j] * (1 - k);
    }
    let as = af[m - 1];
    out[hi - 1] = as;
    for (let j = m - 2; j >= 0; j--) {
      const J = Pf[j] / Pp[j + 1];
      as = af[j] + J * (as - af[j]);
      out[lo + j] = as;
    }
  }
  return Array.from(out, (v, t) => v + slope * t);
}

// One call for the CLI and tests: changes with the level before and after each, in sigma units too.
export function driftLevel(values, opts = {}) {
  const r = driftLevelChanges(values, opts);
  if (!r.changepoints.length && r.sigma == null) return { ...r, changes: [], level: [] };
  const level = driftLevelPath(values, r.changepoints, r);
  const changes = r.changepoints.map((i) => ({
    index: i, before: level[i - 1], after: level[i], jump: level[i] - level[i - 1], jumpSd: (level[i] - level[i - 1]) / r.sigma,
  }));
  return { ...r, changes, level };
}
