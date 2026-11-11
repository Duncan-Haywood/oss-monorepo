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
    // A sticky or zero-inflated series (a sensor that reads 0 at night, a count with many quiet
    // days) can have more than half its lag-k differences equal, so the MAD is 0. Before 2026-11-11
    // that left sigma at the 1e-6 numerical floor in the data's own units, and every move became a
    // change (TCPD occupancy's V3, 329 of 508 differences zero). Fall back to the plain variance
    // of the differences, as engine.mjs robustSd does for the level model.
    let vk = s * s;
    if (!(vk > 0)) { const m = d.reduce((a, z) => a + z, 0) / d.length; vk = d.reduce((a, z) => a + (z - m) ** 2, 0) / d.length; }
    v.push({ k, v: vk });
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
export function gains(n, q) {
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
// loss: 'gauss' (the -2 log likelihood above, the default), 'biweight' or 'huber' on the standardised
// innovation z = v / sqrt(F). Both keep the Gaussian cost while |z| <= lossK and change it past that:
// biweight charges a flat lossK^2 and leaves the level where it was (the point is treated as an
// outlier: Fearnhead and Rigaill, "Changepoint detection in the presence of outliers", JASA 2019,
// bounded losses, here inside the filter instead of a flat segment mean); huber charges
// 2 lossK |z| - lossK^2 and moves the level by the clipped innovation (Masreliez-style robust filter).
// The filter's variances are left as they are, so the O(n^2) structure is unchanged
// (README "Heavy tails on a drifting level").
// scale: 'global' (the default) keeps one noise sd for the whole series. 'segment' gives every
// segment its own scale s (both its noise sd and its wander sd are multiplied by s; q is shared), so
// a burst of volatility is one stretch with a larger scale instead of a run of jumps (TCPD's bank,
// bitcoin, apple's volume: README "Volatility on a drifting level"). Each segment's s^2 is profiled
// out: with j innovations and S = sum v^2 / F in global-sigma units, s^2 = max(S / j, SCALE_FLOOR)
// and the cost is j log s^2 + sum log F + S / s^2. The diffuse first point carries no scale, so
// the values are standardised by the global sigma first and the floor (s at least a tenth of it) is
// a numerical guard against a near-constant stretch, not tuned on any scored series. The default
// penalty becomes 3 log n (a level and a scale per change, as engine.mjs gives 'meanvar'). Gaussian
// loss only. Same O(n^2): the running S per open start replaces the running cost.
export const SCALE_FLOOR = 0.01;
// repeats: 'keep' (the default) or 'drop'. 'drop' fits the model to the series with every exact
// repeat of the previous value taken out (x_t === x_{t-1}), then maps the changes back to the
// original positions. A sticky series (a quote that is not updated, a sensor that sits still: 246 of
// TCPD bank's 580 steps are exactly zero) carries no new information in a repeat, but the Gaussian
// cost reads each flat run as a stretch of near-zero noise, which a scale per segment buys with a
// cut at either end (README "Volatility on a drifting level": bank 63 to 170 cuts). The wander over
// the dropped points is not added back (the filter steps once per kept point), so this is an
// approximation for a series that is sticky, not a general missing-data filter. Continuous data has
// no exact repeats and is untouched. A change maps to the position of the first kept point of its
// segment. README "Sticky series: exact repeats dropped" (pre-registered, 2026-11-11).
export function dropRepeats(values) {
  const x = Array.from(values, Number), keep = [];
  for (let t = 0; t < x.length; t++) if (t === 0 || x[t] !== x[t - 1]) keep.push(t);
  return { values: keep.map((t) => x[t]), index: keep };
}
// repeats: 'missing' keeps the time axis: a repeat is a missing observation, so the level's wander
// accrues across it (the filter's predicted variance grows by q for every step, kept or not) while
// only kept points are charged and only a kept point can start a segment. This is the standard
// Kalman treatment of a gap (Durbin and Koopman, "Time Series Analysis by State Space Methods",
// section 4.10) and removes 'drop's approximation: in a sticky walk the step after k repeats has
// k + 1 steps of wander in it, which 'drop' charged as one, so a real jump there looked like
// wander (README "Sticky series"). sigma and omega start from the lag fit on the kept points, as
// with 'drop'; minSegment counts kept points; the penalty uses the original length.
export function driftLevelChanges(values, { sigma, omega, penalty, minSegment = 2, slope = false, noise = 'lags', loss = 'gauss', lossK = 3, scale = 'global', repeats = 'keep' } = {}) {
  if (repeats !== 'keep' && repeats !== 'drop' && repeats !== 'missing') throw new Error(`repeats must be keep, drop or missing, not ${repeats}`);
  if (repeats === 'missing') return gapDrift(values, { sigma, omega, penalty, minSegment, slope, noise, loss, scale });
  if (repeats === 'drop') {
    if (slope) throw new Error('repeats drop does not take slope (the median step would be per kept point, not per period)');
    const d = dropRepeats(values);
    const r = driftLevelChanges(d.values, { sigma, omega, penalty: penalty ?? (scale === 'segment' ? 3 : 2) * Math.log(Array.from(values).length), minSegment, slope, noise, loss, lossK, scale });
    return { ...r, changepoints: r.changepoints.map((c) => d.index[c]), repeats, repeatsDropped: Array.from(values).length - d.values.length, kept: d };
  }
  if (scale !== 'global' && scale !== 'segment') throw new Error(`scale must be global or segment, not ${scale}`);
  if (scale === 'segment' && loss !== 'gauss') throw new Error('scale segment takes the Gaussian loss only');
  const raw = Array.from(values, Number);
  const g = slope ? medianSlope(raw) : 0;
  const x = g ? raw.map((v, t) => v - g * t) : raw;
  const n = x.length;
  if (n < 2 * minSegment) return { changepoints: [], sigma: sigma ?? null, omega: omega ?? null, penalty: null };
  if (noise === 'ml' && (sigma == null || omega == null)) {
    const ml = driftNoiseML(x, { penalty, minSegment, loss, lossK, scale });
    return { ...driftLevelChanges(x, { sigma: ml.sigma, omega: ml.omega, penalty, minSegment, loss, lossK, scale }), slope: g, noise: 'ml', ml };
  }
  const est = sigma == null || omega == null ? driftNoise(x) : null;
  const s = sigma ?? est.sigma, w = omega ?? est.omega;
  const beta = penalty ?? (scale === 'segment' ? 3 : 2) * Math.log(n);
  const q = (w * w) / (s * s);
  const y = x.map((v) => v / s);
  const { K, logF, F } = gains(n, q);
  if (scale === 'segment') return { ...segmentScalePartition(y, K, F, logF, beta, minSegment), sigma: s, omega: w, penalty: beta, slope: g, noise: est ? 'lags' : 'given', loss, lossK: null, scale };
  const lossKind = lossCode(loss), K2 = lossK * lossK;
  // For every open segment start st: its filtered level a[st] and its cost so far c[st].
  const a = new Float64Array(n), c = new Float64Array(n);
  const best = new Float64Array(n + 1); // best[t] = optimal cost of y[0..t-1]
  const last = new Int32Array(n + 1);
  best[0] = -beta;
  for (let t = 0; t < n; t++) {
    // Extend every segment that started before t by the point t, then open one starting at t.
    if (lossKind === 0) {
      for (let st = 0; st < t; st++) {
        const j = t - st, v = y[t] - a[st];
        c[st] += logF[j] + (v * v) / F[j];
        a[st] += K[j] * v;
      }
    } else {
      for (let st = 0; st < t; st++) {
        const j = t - st, v = y[t] - a[st], z2 = (v * v) / F[j];
        if (z2 <= K2) { c[st] += logF[j] + z2; a[st] += K[j] * v; }
        else if (lossKind === 1) c[st] += logF[j] + K2;
        else { const az = Math.sqrt(z2); c[st] += logF[j] + 2 * lossK * az - K2; a[st] += (K[j] * v * lossK) / az; }
      }
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
  return { changepoints: cps, sigma: s, omega: w, penalty: beta, cost: best[n], slope: g, noise: est ? 'lags' : 'given', loss, lossK: lossKind ? lossK : null, scale };
}

function gapDrift(values, { sigma, omega, penalty, minSegment, slope, noise, loss, scale }) {
  if (slope) throw new Error('repeats missing does not take slope');
  if (loss !== 'gauss') throw new Error('repeats missing takes the Gaussian loss only');
  const N = Array.from(values).length;
  const d = dropRepeats(values);
  const beta = penalty ?? (scale === 'segment' ? 3 : 2) * Math.log(N);
  const gap = d.index.map((t, k) => (k ? t - d.index[k - 1] : 0));
  const n = d.values.length;
  if (n < 2 * minSegment) return { changepoints: [], sigma: sigma ?? null, omega: omega ?? null, penalty: null, repeats: 'missing' };
  if (noise === 'ml' && (sigma == null || omega == null)) {
    const s0 = sigma ?? driftNoise(d.values).sigma;
    const memo = new Map();
    const evalQ = (q) => {
      const key = q.toPrecision(12);
      if (!memo.has(key)) memo.set(key, { q, ...gapPartition(d.values.map((v) => v / s0), gap, q, beta, minSegment, scale) });
      return memo.get(key);
    };
    const qs = [0, ...Array.from({ length: 17 }, (_, i) => 10 ** (-4 + i / 2))];
    let best = null, bi = 0;
    qs.forEach((q, i) => { const r = evalQ(q); if (!best || r.cost < best.cost) { best = r; bi = i; } });
    if (best.q > 0) {
      let lo = Math.log10(bi > 1 ? qs[bi - 1] : 1e-5), hi = Math.log10(bi + 1 < qs.length ? qs[bi + 1] : qs[bi]);
      const gr = (Math.sqrt(5) - 1) / 2;
      let c = hi - gr * (hi - lo), e = lo + gr * (hi - lo);
      for (let it = 0; it < 10; it++) {
        if (evalQ(10 ** c).cost < evalQ(10 ** e).cost) { hi = e; e = c; c = hi - gr * (hi - lo); }
        else { lo = c; c = e; e = lo + gr * (hi - lo); }
      }
      for (const q of [10 ** c, 10 ** e]) { const r = evalQ(q); if (r.cost < best.cost) best = r; }
    }
    return { changepoints: best.changepoints.map((c) => d.index[c]), sigma: s0, omega: s0 * Math.sqrt(best.q), penalty: beta, cost: best.cost, slope: 0, noise: 'ml', loss, scale, repeats: 'missing', repeatsDropped: N - n, kept: d };
  }
  const est = sigma == null || omega == null ? driftNoise(d.values) : null;
  const s = sigma ?? est.sigma, w = omega ?? est.omega;
  const r = gapPartition(d.values.map((v) => v / s), gap, (w * w) / (s * s), beta, minSegment, scale);
  return { changepoints: r.changepoints.map((c) => d.index[c]), sigma: s, omega: w, penalty: beta, cost: r.cost, slope: 0, noise: est ? 'lags' : 'given', loss, scale, repeats: 'missing', repeatsDropped: N - n, kept: d };
}

// Exact partition of the kept points y (sigma units) where gap[k] steps of wander separate y[k-1]
// and y[k]. Each open segment start carries its own filter state, since the variances now depend on
// the gaps since the start; still O(n^2). With every gap 1 it is driftLevelChanges' partition exactly.
export function gapPartition(y, gap, q, beta, minSegment = 2, scale = 'global') {
  const n = y.length;
  const a = new Float64Array(n), P = new Float64Array(n), S = new Float64Array(n), LF = new Float64Array(n);
  const best = new Float64Array(n + 1), last = new Int32Array(n + 1);
  best[0] = -beta;
  const seg = scale === 'segment';
  for (let t = 0; t < n; t++) {
    const g = gap[t] * q;
    for (let st = 0; st < t; st++) {
      const Pp = P[st] + g, F = Pp + 1, K = Pp / F, v = y[t] - a[st];
      S[st] += (v * v) / F; LF[st] += Math.log(F);
      a[st] += K * v; P[st] = Pp * (1 - K);
    }
    a[t] = y[t]; P[t] = 1; S[t] = 0; LF[t] = 0;
    let bv = Infinity, bs = 0;
    for (let st = 0; st + minSegment - 1 <= t; st++) {
      if (st > 0 && st < minSegment) continue;
      const c = seg ? scaleCost(t - st, S[st], LF[st]) : LF[st] + S[st];
      const v = best[st] + beta + c;
      if (v < bv) { bv = v; bs = st; }
    }
    best[t + 1] = bv; last[t + 1] = bs;
  }
  const cps = [];
  for (let t = n; t > 0; t = last[t]) if (last[t] > 0) cps.push(last[t]);
  cps.reverse();
  return { changepoints: cps, cost: best[n] };
}

// The profiled cost of j innovations whose sum of squared standardised innovations is S and whose
// log F sum is LF (see driftLevelChanges, scale 'segment').
export function scaleCost(j, S, LF) {
  if (j === 0) return 0;
  const s2 = Math.max(S / j, SCALE_FLOOR);
  return j * Math.log(s2) + LF + S / s2;
}

function segmentScalePartition(y, K, F, logF, beta, minSegment) {
  const n = y.length;
  const cumLF = new Float64Array(n);
  for (let j = 1; j < n; j++) cumLF[j] = cumLF[j - 1] + logF[j];
  const a = new Float64Array(n), S = new Float64Array(n);
  const best = new Float64Array(n + 1), last = new Int32Array(n + 1);
  best[0] = -beta;
  for (let t = 0; t < n; t++) {
    for (let st = 0; st < t; st++) {
      const j = t - st, v = y[t] - a[st];
      S[st] += (v * v) / F[j];
      a[st] += K[j] * v;
    }
    a[t] = y[t]; S[t] = 0;
    let bv = Infinity, bs = 0;
    for (let st = 0; st + minSegment - 1 <= t; st++) {
      if (st > 0 && st < minSegment) continue;
      const v = best[st] + beta + scaleCost(t - st, S[st], cumLF[t - st]);
      if (v < bv) { bv = v; bs = st; }
    }
    best[t + 1] = bv; last[t + 1] = bs;
  }
  const cps = [];
  for (let t = n; t > 0; t = last[t]) if (last[t] > 0) cps.push(last[t]);
  cps.reverse();
  return { changepoints: cps, cost: best[n] };
}

// Each segment's own scale (scale 'segment'), as a multiple of the global sigma: s = sqrt(max(S / j,
// floor)) from that segment's Kalman innovations. One entry per segment, in order.
export function segmentScales(values, changepoints, { sigma, omega, slope = 0 }) {
  const x = Array.from(values, (v, t) => (Number(v) - slope * t) / sigma), n = x.length;
  const bounds = [0, ...changepoints, n];
  const { K, F } = gains(n, (omega * omega) / (sigma * sigma));
  const out = [];
  for (let b = 0; b + 1 < bounds.length; b++) {
    let a = x[bounds[b]], S = 0;
    const m = bounds[b + 1] - bounds[b];
    for (let j = 1; j < m; j++) { const v = x[bounds[b] + j] - a; S += (v * v) / F[j]; a += K[j] * v; }
    out.push(m > 1 ? Math.sqrt(Math.max(S / (m - 1), SCALE_FLOOR)) : 1);
  }
  return out;
}

function lossCode(loss) {
  const k = { gauss: 0, biweight: 1, huber: 2 }[loss];
  if (k == null) throw new Error(`loss must be gauss, biweight or huber, not ${loss}`);
  return k;
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
export function driftNoiseML(values, { penalty, minSegment = 2, grid = null, sigma = null, loss = 'gauss', lossK = 3, scale = 'global' } = {}) {
  const x = Array.from(values, Number), n = x.length;
  const beta = penalty ?? (scale === 'segment' ? 3 : 2) * Math.log(n);
  const start = driftNoise(x);
  const s = sigma ?? start.sigma;
  const memo = new Map();
  const evalQ = (q) => {
    const key = q.toPrecision(12);
    if (!memo.has(key)) {
      const r = driftLevelChanges(x, { sigma: s, omega: s * Math.sqrt(q), penalty: beta, minSegment, loss, lossK, scale });
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
export function driftSegmentCost(values, { sigma, omega, loss = 'gauss', lossK = 3 }) {
  const y = Array.from(values, (v) => Number(v) / sigma), m = y.length;
  const { K, F, logF } = gains(m, (omega * omega) / (sigma * sigma));
  const kind = lossCode(loss), K2 = lossK * lossK;
  let a = y[0], c = 0;
  for (let j = 1; j < m; j++) {
    const v = y[j] - a, z2 = (v * v) / F[j];
    if (kind === 0 || z2 <= K2) { c += logF[j] + z2; a += K[j] * v; }
    else if (kind === 1) c += logF[j] + K2;
    else { const az = Math.sqrt(z2); c += logF[j] + 2 * lossK * az - K2; a += (K[j] * v * lossK) / az; }
  }
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
  const tails = driftTailCheck(values);
  if (!r.changepoints.length && r.sigma == null) return { ...r, tails, changes: [], level: [] };
  const level = driftLevelPath(values, r.changepoints, r);
  // With slope, the path carries the steady growth back in, so one step's growth is taken off the
  // jump (before 2026-11-11 the jump on Australian residents included the 51.3-a-quarter growth).
  const g = r.slope || 0;
  const scales = r.scale === 'segment' ? (r.kept ? segmentScales(r.kept.values, r.changepoints.map((c) => r.kept.index.indexOf(c)), r) : segmentScales(values, r.changepoints, r)) : null;
  const changes = r.changepoints.map((i, k) => ({
    index: i, before: level[i - 1], after: level[i], jump: level[i] - level[i - 1] - g, jumpSd: (level[i] - level[i - 1] - g) / r.sigma,
    ...(scales ? { scaleBefore: scales[k], scaleAfter: scales[k + 1], scaleRatio: scales[k + 1] / scales[k] } : {}),
  }));
  return { ...r, tails, changes, level, ...(scales ? { scales } : {}) };
}

// The heavy-tail check (README "Heavy tails on a drifting level"). It says where a series' heavy
// tails live, which decides whether a robust cost can help:
//   'walk':  the lag fit finds no observation noise beyond its floor (the series reads as a pure
//            random walk) and the first differences, which are then the walk's own steps, are
//            heavy-tailed. A jump in a random walk is one big step, so the model cannot tell a
//            change from the tail of the walk; robust costs made this worse on TCPD (bank 63 cuts
//            to 111, bitcoin 52 to 98, eval/tcpd-drift-robust.out.txt), and the jumps are best read as the largest steps, not changes.
//   'noise': there is observation noise and the differences are heavy-tailed, so the tails are
//            outliers around the level: the case `loss: 'biweight'` is for (well_log 21 cuts to 15).
// Added 2026-11-11 after the pre-registered robust-loss run (README "Heavy tails on a drifting level").
// Kurtosis of the first differences above 6 (a t distribution with 6 degrees of freedom); the
// value was set after looking at TCPD's per-series kurtosis, so TCPD figures for it are in-sample;
// eval/drift-tails-sim.mjs checks it on series where the truth is known.
export const TAIL_KURTOSIS = 6;
export function driftTailCheck(values) {
  const x = Array.from(values, Number), n = x.length;
  if (n < 20) return { kind: null, stepKurtosis: null, noiseShare: null, atFloor: null };
  const e = driftNoise(x);
  const v1 = e.lagVariances[0].v;
  const noiseShare = v1 > 0 ? (2 * e.sigma * e.sigma) / v1 : 0;
  const atFloor = noiseShare <= 0.02 * (1 + 1e-9);
  const d = [];
  for (let t = 1; t < n; t++) d.push(x[t] - x[t - 1]);
  const m = d.reduce((s, v) => s + v, 0) / d.length;
  let s2 = 0, s4 = 0;
  for (const v of d) { const z = (v - m) ** 2; s2 += z; s4 += z * z; }
  s2 /= d.length; s4 /= d.length;
  const stepKurtosis = s2 > 0 ? s4 / (s2 * s2) : 0;
  const kind = stepKurtosis > TAIL_KURTOSIS ? (atFloor ? 'walk' : 'noise') : null;
  return { kind, stepKurtosis, noiseShare, atFloor };
}
