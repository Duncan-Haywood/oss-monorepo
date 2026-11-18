// Jumps on a wandering level, across several columns at once: the drift model (drift-level.mjs)
// with one segmentation shared by every column.
//
// Each column i has its own noise sd sigma_i and its own random-walk step sd omega_i. Between
// changes every column's level wanders as a random walk; at a change every column's level restarts
// from a flat prior. Columns are independent given the changes, so a segment's cost is the sum of
// the columns' local-level Kalman filter costs (each in its own sigma units), and exact optimal
// partitioning over that summed cost gives the joint changes. With one column this is exactly
// driftLevelChanges (the pinned identity in multi-drift.test.mjs).
//
// Why: the joint level fit (multivariate.mjs multiPelt) cuts a smooth or wandering column into a
// staircase, as the one-column level model does (95 to 132 cuts on TCPD's three multi-column series
// before the noise floor). The drift model was the one-column answer to that (US population 406
// cuts to 1); this carries it to the several-columns mode (flagship item b).
//
// Noise per column: 'ml' (default, as the one-column CLI) sizes each column's omega with that
// column's own changes (driftNoiseML at the one-column penalty), so one big step is not absorbed as
// wander; 'lags' uses the lag-difference estimate alone (driftNoise). Sized per column, not jointly:
// profiling d omegas together would need a d-dimensional search, and each column's own fit already
// guards its omega against its own steps.
//
// Penalty per change: (1 + d) log n, the BIC count for the change's location plus one level per
// column, which is the one-column drift default 2 log n at d = 1 and matches multiPenalty's level count.
// O(d n^2) time, O(d n) memory; 'ml' adds about 30 one-column fits per column.
import { driftNoise, driftNoiseML, gains, driftLevelPath } from './drift-level.mjs';

export function multiDriftPenalty(n, d) { return (1 + d) * Math.log(n); }

/** Per-column { sigma, omega } for the joint drift fit. */
export function multiDriftNoise(cols, { noise = 'ml', minSegment = 2 } = {}) {
  return cols.map((c) => {
    if (noise === 'ml') { const m = driftNoiseML(c, { minSegment }); return { sigma: m.sigma, omega: m.omega }; }
    if (noise === 'lags') { const e = driftNoise(c); return { sigma: e.sigma, omega: e.omega }; }
    throw new Error(`noise must be ml or lags, not ${noise}`);
  });
}

/**
 * cols: equal-length number arrays. Returns { changepoints, penalty, noise: [{ sigma, omega }], cost }.
 * opts.noise: 'ml' | 'lags', or an array of { sigma, omega } per column.
 */
export function multiDriftChanges(cols, { penalty = null, minSegment = 2, noise = 'ml' } = {}) {
  if (!Array.isArray(cols) || !cols.length) throw new Error('Give one or more columns.');
  const n = cols[0].length, d = cols.length;
  for (const c of cols) if (c.length !== n) throw new Error('Every column needs the same number of points.');
  if (n < 4) throw new Error(`Need at least 4 points; got ${n}.`);
  const minSeg = Math.max(1, Math.floor(Number(minSegment) || 2));
  const nz = Array.isArray(noise) ? noise : multiDriftNoise(cols, { noise, minSegment: minSeg });
  const beta = penalty != null && penalty !== '' ? Number(penalty) : multiDriftPenalty(n, d);
  if (!(beta >= 0)) throw new Error('The penalty is a number of 0 or more.');
  if (n < 2 * minSeg) return { changepoints: [], penalty: beta, noise: nz, cost: null };
  const Y = cols.map((c, i) => Float64Array.from(c, (v) => Number(v) / nz[i].sigma));
  const G = nz.map((z) => gains(n, (z.omega * z.omega) / (z.sigma * z.sigma)));
  const A = cols.map(() => new Float64Array(n));
  const c = new Float64Array(n);
  const best = new Float64Array(n + 1), last = new Int32Array(n + 1);
  best[0] = -beta;
  for (let t = 0; t < n; t++) {
    for (let i = 0; i < d; i++) {
      const y = Y[i][t], a = A[i], { K, F, logF } = G[i];
      for (let st = 0; st < t; st++) {
        const j = t - st, v = y - a[st];
        c[st] += logF[j] + (v * v) / F[j];
        a[st] += K[j] * v;
      }
      a[t] = y;
    }
    c[t] = 0;
    let bv = Infinity, bs = 0;
    for (let st = 0; st + minSeg - 1 <= t; st++) {
      if (st > 0 && st < minSeg) continue;
      const v = best[st] + beta + c[st];
      if (v < bv) { bv = v; bs = st; }
    }
    best[t + 1] = bv; last[t + 1] = bs;
  }
  const cps = [];
  for (let t = n; t > 0; t = last[t]) if (last[t] > 0) cps.push(last[t]);
  cps.reverse();
  return { changepoints: cps, penalty: beta, noise: nz, cost: best[n] };
}

/** Changes with each column's smoothed level just before and after, in its own units and in its noise sds. */
export function multiDrift(cols, opts = {}) {
  const r = multiDriftChanges(cols, opts);
  const levels = cols.map((c, i) => driftLevelPath(c, r.changepoints, r.noise[i]));
  const changes = r.changepoints.map((idx) => ({
    index: idx,
    jumps: cols.map((_, i) => {
      const jump = levels[i][idx] - levels[i][idx - 1];
      return { before: levels[i][idx - 1], after: levels[i][idx], jump, sds: jump / r.noise[i].sigma };
    }),
  }));
  return { ...r, changes, levels };
}
