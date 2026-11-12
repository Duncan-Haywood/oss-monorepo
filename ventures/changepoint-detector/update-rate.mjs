// Changes in how often a series updates (README "When a series starts updating less often").
//
// A step "repeats" when a value equals the one before it exactly: a quote nobody refreshed, a sensor
// that sits still, a figure carried forward. The sticky-series check (drift-level.mjs stickyCheck)
// says how many steps repeat over the whole series. This file says *when* that share changed:
// optimal partitioning (PELT pruning) of the 0/1 repeat indicators, each stretch with its own repeat
// probability. It describes the data; it does not move any level change the models report. Its
// setting (cost and penalty) was chosen on one simulated seed and checked on another, by a rule
// committed before either ran (eval/update-rate-sim.mjs).
//
// Two segment costs:
//   'bernoulli': each step repeats independently with the stretch's probability r / m;
//   'markov':    a two-state chain per stretch (P(repeat | last step repeated), P(repeat | last step
//                updated)), so long flat runs inside a stretch are not read as a change of rate.
// Both are profiled -2 log likelihoods; a cut costs `penalty` (default mult x 2 log n).

/** 0/1 per step t = 1..n-1: 1 when values[t] === values[t - 1]. Non-finite values never repeat. */
export function repeatIndicators(values) {
  const x = Array.from(values, Number), z = [];
  for (let t = 1; t < x.length; t++) z.push(Number.isFinite(x[t]) && x[t] === x[t - 1] ? 1 : 0);
  return z;
}

const xlx = (k, m) => (k > 0 && k < m ? k * Math.log(k / m) : 0);
/** -2 log likelihood of r repeats among m independent steps at the profiled probability r / m. */
export function bernoulliCost(r, m) { return m > 0 ? -2 * (xlx(r, m) + xlx(m - r, m)) : 0; }

// Prefix sums: R[t] repeats among z[0..t); T[t][ij] transitions (z[s-1] = i, z[s] = j) with s < t.
function prefixes(z) {
  const n = z.length, R = new Float64Array(n + 1), T = [0, 1, 2, 3].map(() => new Float64Array(n + 1));
  for (let t = 0; t < n; t++) {
    R[t + 1] = R[t] + z[t];
    for (let k = 0; k < 4; k++) T[k][t + 1] = T[k][t];
    if (t > 0) T[2 * z[t - 1] + z[t]][t + 1] += 1;
  }
  return { R, T };
}

/** Cost of indicators z[a..b) under a cost kind, from prefix sums. */
export function segmentCost(P, a, b, kind) {
  const m = b - a, r = P.R[b] - P.R[a];
  if (kind === 'bernoulli') return bernoulliCost(r, m);
  // Markov: transitions wholly inside [a, b) (s from a + 1 to b - 1), first step by its own share.
  const c = [0, 1, 2, 3].map((k) => P.T[k][b] - P.T[k][a + 1]);
  const first = P.R[a + 1] - P.R[a];
  return bernoulliCost(first, 1) + -2 * (xlx(c[0], c[0] + c[1]) + xlx(c[1], c[0] + c[1]) + xlx(c[2], c[2] + c[3]) + xlx(c[3], c[2] + c[3]));
}

/**
 * Stretches of steady update rate in the repeat indicators z (from repeatIndicators).
 * Returns cut positions in z (a cut at k starts a new stretch at z[k], value index k + 1).
 */
export function partitionRates(z, { kind = 'bernoulli', mult = 1, penalty = null, minSegment = 20 } = {}) {
  const n = z.length;
  const beta = penalty ?? mult * 2 * Math.log(n + 1);
  if (n < 2 * minSegment) return { cuts: [], penalty: beta };
  const P = prefixes(z);
  const F = new Float64Array(n + 1).fill(Infinity), last = new Int32Array(n + 1);
  F[0] = -beta;
  let cand = [0];
  for (let t = minSegment; t <= n; t++) {
    let best = Infinity, arg = 0;
    for (const s of cand) {
      if (t - s < minSegment) continue;
      const v = F[s] + segmentCost(P, s, t, kind) + beta;
      if (v < best) { best = v; arg = s; }
    }
    F[t] = best; last[t] = arg;
    // PELT pruning (Killick, Fearnhead and Eckley 2012): drop s that can never be optimal again.
    const keep = [];
    for (const s of cand) if (t - s < minSegment || F[s] + segmentCost(P, s, t, kind) <= F[t]) keep.push(s);
    if (t - minSegment + 1 >= minSegment) keep.push(t - minSegment + 1);
    cand = keep;
  }
  const cuts = [];
  for (let t = n; t > 0; t = last[t]) if (last[t] > 0) cuts.push(last[t]);
  return { cuts: cuts.reverse(), penalty: beta };
}

// Wilson 95% interval for a share k / m.
function wilson(k, m) {
  if (!m) return [NaN, NaN];
  const z = 1.959964, p = k / m, d = 1 + (z * z) / m;
  const c = (p + (z * z) / (2 * m)) / d, h = (z * Math.sqrt((p * (1 - p)) / m + (z * z) / (4 * m * m))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// The shipped setting, from eval/update-rate-sim.out.txt (chosen on the calibration seed, checked
// on the confirmation seed; a test checks these match the file).
export const UPDATE_RATE = { kind: 'markov', mult: 1.5, minSegment: 20, minRepeats: 10 };

/**
 * When the share of exact repeats changed. Value indexes throughout: a stretch [from, to] covers the
 * steps into values from..to, so the first stretch starts at 1.
 * { changes: [{ index, shareBefore, shareAfter, direction }], stretches: [{ from, to, steps, repeats, share, lo, hi }] }
 * Empty when the series has fewer than minRepeats repeats or is too short for two stretches.
 */
export function updateRateChanges(values, opts = {}) {
  const o = { ...UPDATE_RATE, ...opts };
  const z = repeatIndicators(values);
  const total = z.reduce((s, v) => s + v, 0);
  const none = { changes: [], stretches: [], repeats: total, steps: z.length, setting: o };
  if (total < o.minRepeats || z.length < 2 * o.minSegment) return none;
  const { cuts, penalty } = partitionRates(z, o);
  const bounds = [0, ...cuts, z.length];
  const stretches = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const a = bounds[k], b = bounds[k + 1];
    const r = z.slice(a, b).reduce((s, v) => s + v, 0), m = b - a;
    const [lo, hi] = wilson(r, m);
    stretches.push({ from: a + 1, to: b, steps: m, repeats: r, share: r / m, lo, hi });
  }
  const changes = cuts.map((c, k) => ({
    index: c + 1, shareBefore: stretches[k].share, shareAfter: stretches[k + 1].share,
    direction: stretches[k + 1].share > stretches[k].share ? 'less often' : 'more often',
  }));
  return { changes, stretches, repeats: total, steps: z.length, penalty, setting: o };
}

const pct = (v) => `${(100 * v).toFixed(0)}%`;

/** Plain lines for the CLI and the page; empty when no change of update rate was found. */
export function updateRateLines(u, labels) {
  if (!u || !u.changes || !u.changes.length) return [];
  const L = (i) => (labels && labels[i] != null ? labels[i] : `point ${i}`);
  const parts = u.changes.map((c) => `from ${L(c.index)} it began updating ${c.direction} (repeats ${pct(c.shareBefore)} of steps before, ${pct(c.shareAfter)} after)`);
  return [`Update-rate check: the share of steps that repeat the previous value exactly changed ${u.changes.length === 1 ? 'once' : `${u.changes.length} times`}: ${parts.join('; ')}. This describes how often the data was refreshed (a stale feed, a figure carried forward, a change in how it was recorded), not a change in its level; jumps near these dates may be catch-ups after a stale stretch.`];
}
