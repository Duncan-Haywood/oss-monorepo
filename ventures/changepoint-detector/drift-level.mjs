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

// Robust segment costs, for heavy tails and isolated outliers (README "Heavy tails on a drifting
// level"). Each innovation v of the segment's Kalman filter, standardised z = v / sqrt(F), costs
// log F + rho(z) instead of log F + z^2:
//   huber:    rho = z^2 for |z| <= c, else 2c|z| - c^2; the level moves by K sqrt(F) clip(z, c),
//             the classical variances kept (a Masreliez-Martin / rLS-style robust filter);
//   biweight: rho = min(z^2, c^2); a rejected point costs c^2 and does not move the level, and the
//             level's variance grows as if the point were missing. This is the loss of Fearnhead and
//             Rigaill ("Changepoint detection in the presence of outliers", JASA 2019, doi
//             10.1080/01621459.2017.1385466) for a flat level, put inside the random-walk filter here.
// With the biweight loss one outlier costs at most c^2 (9 at c = 3), less than a change at the
// 2 log n penalty for n >= 90, so a lone spike can no longer buy itself two changes.
export function lossSpec(loss = 'gauss', lossC = null) {
  if (loss == null || loss === 'gauss') return { kind: 'gauss', c: null };
  if (loss === 'huber') return { kind: 'huber', c: lossC ?? 1.345 };
  if (loss === 'biweight') return { kind: 'biweight', c: lossC ?? 3 };
  throw new Error(`unknown drift loss ${loss}: gauss, huber or biweight`);
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
// noise: 'lags' sizes sigma and omega from lag differences (driftNoise); 'ml' keeps that sigma and
// chooses omega with the changes (driftNoiseML). Library default 'lags' (the pinned tests and the
// O(n^2) single fit); the CLI defaults to 'ml' (eval/tcpd-drift-ml.mjs, README "A step-robust omega").
// loss: 'gauss' (default, the -2 log likelihood), 'huber' or 'biweight' (robust, see robustTerm).
// lossC: the clipping point in innovation sd (defaults 1.345 for huber, 3 for biweight).
export function driftLevelChanges(values, { sigma, omega, penalty, minSegment = 2, slope = false, noise = 'lags', loss = 'gauss', lossC = null } = {}) {
  const raw = Array.from(values, Number);
  const g = slope ? medianSlope(raw) : 0;
  const x = g ? raw.map((v, t) => v - g * t) : raw;
  const n = x.length;
  if (n < 2 * minSegment) return { changepoints: [], sigma: sigma ?? null, omega: omega ?? null, penalty: null };
  if (noise === 'ml' && (sigma == null || omega == null)) {
    const ml = driftNoiseML(x, { penalty, minSegment, loss, lossC });
    return { ...driftLevelChanges(x, { sigma: ml.sigma, omega: ml.omega, penalty, minSegment, loss, lossC }), slope: g, noise: 'ml', ml };
  }
  const est = sigma == null || omega == null ? driftNoise(x) : null;
  const s = sigma ?? est.sigma, w = omega ?? est.omega;
  const beta = penalty ?? 2 * Math.log(n);
  const q = (w * w) / (s * s);
  const y = x.map((v) => v / s);
  const L = lossSpec(loss, lossC);
  const { K, logF, F } = gains(n, q);
  // For every open segment start st: its filtered level a[st] and its cost so far c[st]; with the
  // biweight loss also its level variance P[st], which then depends on which points were rejected.
  const a = new Float64Array(n), c = new Float64Array(n), P = L.kind === 'biweight' ? new Float64Array(n) : null;
  const best = new Float64Array(n + 1); // best[t] = optimal cost of y[0..t-1]
  const last = new Int32Array(n + 1);
  best[0] = -beta;
  for (let t = 0; t < n; t++) {
    // Extend every segment that started before t by the point t, then open one starting at t.
    if (L.kind === 'gauss') {
      for (let st = 0; st < t; st++) {
        const j = t - st, v = y[t] - a[st];
        c[st] += logF[j] + (v * v) / F[j];
        a[st] += K[j] * v;
      }
    } else if (L.kind === 'huber') {
      const cc = L.c, c2 = cc * cc;
      for (let st = 0; st < t; st++) {
        const j = t - st, v = y[t] - a[st], sf = Math.sqrt(F[j]), z = v / sf, az = Math.abs(z);
        if (az <= cc) { c[st] += logF[j] + z * z; a[st] += K[j] * v; }
        else { c[st] += logF[j] + 2 * cc * az - c2; a[st] += K[j] * sf * (z > 0 ? cc : -cc); }
      }
    } else {
      const c2 = L.c * L.c;
      for (let st = 0; st < t; st++) {
        const Pp = P[st] + q, Fj = Pp + 1, v = y[t] - a[st], z2 = (v * v) / Fj;
        if (z2 <= c2) { const k = Pp / Fj; c[st] += Math.log(Fj) + z2; a[st] += k * v; P[st] = Pp * (1 - k); }
        else { c[st] += Math.log(Fj) + c2; P[st] = Pp; } // rejected: costs c^2, the level is not moved
      }
    }
    a[t] = y[t]; c[t] = 0; if (P) P[t] = 1;
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
  return { changepoints: cps, sigma: s, omega: w, penalty: beta, cost: best[n], slope: g, noise: est ? 'lags' : 'given', loss: L.kind, lossC: L.c };
}

// omega chosen together with the changes, by penalised likelihood, so that a single large step
// cannot inflate it the way it inflates the lag-difference estimate's slope: a step is absorbed as
// wander only if a larger omega gives a lower cost than one change at the penalty. sigma stays at
// the lag fit's intercept, which a few jumps barely move. The objective is exactly the one optimal
// partitioning minimises (the -2 log likelihood in sigma units plus the penalty per change), so
// for each q = omega^2 / sigma^2 one exact partition gives its value; q is profiled on a log grid
// from 1e-4 to 1e4 with q = 0 (a flat level) included, then refined by golden section in log q
// around the best grid point.
//
// Why sigma is not profiled too (tried first, 2026-11-11, README "A step-robust omega"): each
// segment's first point is diffuse, so the likelihood in the input's units drops one log sigma^2
// per change, which makes a change worth -log sigma^2 (a bonus that depends on the data's units);
// charging that point log sigma^2 instead makes the likelihood unbounded as sigma goes to 0 with
// many short segments. Holding sigma at a robust estimate avoids both.
export function driftNoiseML(values, { penalty, minSegment = 2, grid = null, sigma = null, loss = 'gauss', lossC = null } = {}) {
  const x = Array.from(values, Number), n = x.length;
  const beta = penalty ?? 2 * Math.log(n);
  const start = driftNoise(x);
  const s = sigma ?? start.sigma;
  const memo = new Map();
  const evalQ = (q) => {
    const key = q.toPrecision(12);
    if (!memo.has(key)) {
      const r = driftLevelChanges(x, { sigma: s, omega: s * Math.sqrt(q), penalty: beta, minSegment, loss, lossC });
      memo.set(key, { q, sigma: s, omega: r.omega, objective: r.cost, changepoints: r.changepoints });
    }
    return memo.get(key);
  };
  const qs = grid ?? [0, ...Array.from({ length: 17 }, (_, i) => 10 ** (-4 + i / 2))];
  let best = null, bi = 0;
  qs.forEach((q, i) => { const r = evalQ(q); if (!best || r.objective < best.objective) { best = r; bi = i; } });
  if (!grid && best.q > 0) {
    // Golden section on log q between the neighbouring grid points (below 1e-4, down to 1e-5).
    let lo = Math.log10(bi > 1 ? qs[bi - 1] : 1e-5), hi = Math.log10(bi + 1 < qs.length ? qs[bi + 1] : qs[bi]);
    const gr = (Math.sqrt(5) - 1) / 2;
    let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
    for (let it = 0; it < 10; it++) {
      if (evalQ(10 ** c).objective < evalQ(10 ** d).objective) { hi = d; d = c; c = hi - gr * (hi - lo); }
      else { lo = c; c = d; d = lo + gr * (hi - lo); }
    }
    for (const q of [10 ** c, 10 ** d]) { const r = evalQ(q); if (r.objective < best.objective) best = r; }
  }
  return { ...best, fits: memo.size, atGridEdge: !grid && bi === qs.length - 1, start: { sigma: start.sigma, omega: start.omega } };
}

// The -2 log likelihood of one segment on its own (the cost optimal partitioning adds up), in the
// same units as driftLevelChanges: values divided by sigma. For tests and for checking a partition.
export function driftSegmentCost(values, { sigma, omega, loss = 'gauss', lossC = null }) {
  const y = Array.from(values, (v) => Number(v) / sigma), m = y.length;
  const f = robustFilter(y, (omega * omega) / (sigma * sigma), lossSpec(loss, lossC));
  return f.cost;
}

// One segment's filter under a loss: filtered levels, prior and posterior variances, and the cost.
// The same arithmetic as the loops in driftLevelChanges, one segment at a time.
function robustFilter(y, q, L) {
  const m = y.length;
  const af = new Float64Array(m), Pf = new Float64Array(m), Pp = new Float64Array(m);
  af[0] = y[0]; Pf[0] = 1; Pp[0] = Infinity;
  let cost = 0, rejected = 0;
  for (let j = 1; j < m; j++) {
    Pp[j] = Pf[j - 1] + q;
    const F = Pp[j] + 1, k = Pp[j] / F, v = y[j] - af[j - 1], z = v / Math.sqrt(F), az = Math.abs(z);
    if (L.kind === 'gauss' || az <= L.c) { cost += Math.log(F) + z * z; af[j] = af[j - 1] + k * v; Pf[j] = Pp[j] * (1 - k); }
    else if (L.kind === 'huber') { rejected++; cost += Math.log(F) + 2 * L.c * az - L.c * L.c; af[j] = af[j - 1] + k * Math.sqrt(F) * (z > 0 ? L.c : -L.c); Pf[j] = Pp[j] * (1 - k); }
    else { rejected++; cost += Math.log(F) + L.c * L.c; af[j] = af[j - 1]; Pf[j] = Pp[j]; }
  }
  return { af, Pf, Pp, cost, rejected };
}

// Smoothed level within each segment (Rauch-Tung-Striebel), so a change can be reported as the
// level just before it and just after it. Returns an array of n levels in the input's units.
export function driftLevelPath(values, changepoints, { sigma, omega, slope = 0, loss = 'gauss', lossC = null }) {
  const x = Array.from(values, (v, t) => Number(v) - slope * t), n = x.length;
  const q = (omega * omega) / (sigma * sigma);
  const L = lossSpec(loss, lossC);
  const out = new Float64Array(n);
  const bounds = [0, ...changepoints, n];
  for (let b = 0; b + 1 < bounds.length; b++) {
    const lo = bounds[b], hi = bounds[b + 1], m = hi - lo;
    // Filter in sigma units (the robust losses clip in those units), smooth, scale back.
    const { af, Pf, Pp } = robustFilter(x.slice(lo, hi).map((v) => v / sigma), q, L);
    let as = af[m - 1];
    out[hi - 1] = as * sigma;
    for (let j = m - 2; j >= 0; j--) {
      const J = Pf[j] / Pp[j + 1];
      as = af[j] + J * (as - af[j]);
      out[lo + j] = as * sigma;
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
