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
  // (Written out without arrays: this runs O(n) to O(n^2) times in the search below.)
  const T = P.T, a1 = a + 1;
  const c0 = T[0][b] - T[0][a1], c1 = T[1][b] - T[1][a1], c2 = T[2][b] - T[2][a1], c3 = T[3][b] - T[3][a1];
  const first = P.R[a1] - P.R[a];
  return bernoulliCost(first, 1) - 2 * (xlx(c0, c0 + c1) + xlx(c1, c0 + c1) + xlx(c2, c2 + c3) + xlx(c3, c2 + c3));
}

/**
 * Stretches of steady update rate in the repeat indicators z (from repeatIndicators).
 * Returns cut positions in z (a cut at k starts a new stretch at z[k], value index k + 1).
 */
export function partitionRates(z, { kind = 'bernoulli', mult = 1, penalty = null, minSegment = 20, exactUpTo = EXACT_UP_TO } = {}) {
  const n = z.length;
  const beta = penalty ?? mult * 2 * Math.log(n + 1);
  if (n < 2 * minSegment) return { cuts: [], penalty: beta };
  const P = prefixes(z);
  // PELT prunes little when changes are few, so the exact search grows as n^2 (24 s at 20,000 steps before
  // this guard). Above exactUpTo steps it searches a grid of about exactUpTo positions, then moves each cut to
  // its best position between its neighbours (README "The update-rate check on long series").
  if (n > exactUpTo) return gridPartition(z, P, { kind, beta, minSegment, step: Math.ceil(n / exactUpTo) });
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

// Series longer than this many steps are searched on a grid first (partitionRates).
export const EXACT_UP_TO = 1500;

// Optimal partitioning with cuts only at multiples of `step`, then each cut moved, with its neighbours
// fixed, to its best position anywhere between them (passes until nothing moves). Every move lowers the
// total cost, so the result is never worse than the grid's.
function gridPartition(z, P, { kind, beta, minSegment, step }) {
  const n = z.length, pos = [0];
  for (let t = step; t < n; t += step) pos.push(t);
  pos.push(n);
  const m = pos.length, F = new Float64Array(m).fill(Infinity), last = new Int32Array(m);
  F[0] = -beta;
  let cand = [0];
  for (let j = 1; j < m; j++) {
    const t = pos[j];
    let best = Infinity, arg = -1;
    for (const i of cand) {
      if (t - pos[i] < minSegment) continue;
      const v = F[i] + segmentCost(P, pos[i], t, kind) + beta;
      if (v < best) { best = v; arg = i; }
    }
    if (arg < 0) continue; // too close to the start for any segment
    F[j] = best; last[j] = arg;
    const keep = [];
    for (const i of cand) if (t - pos[i] < minSegment || F[i] + segmentCost(P, pos[i], t, kind) <= F[j]) keep.push(i);
    keep.push(j);
    cand = keep;
  }
  const cuts = [];
  for (let j = m - 1; j > 0; j = last[j]) if (last[j] > 0) cuts.push(pos[last[j]]);
  cuts.reverse();
  for (let pass = 0, moved = true; moved && pass < 10; pass++) {
    moved = false;
    for (let k = 0; k < cuts.length; k++) {
      const L = k ? cuts[k - 1] : 0, R = k + 1 < cuts.length ? cuts[k + 1] : n;
      let best = segmentCost(P, L, cuts[k], kind) + segmentCost(P, cuts[k], R, kind), arg = cuts[k];
      for (let c = L + minSegment; c <= R - minSegment; c++) {
        const v = segmentCost(P, L, c, kind) + segmentCost(P, c, R, kind);
        if (v < best - 1e-9) { best = v; arg = c; }
      }
      if (arg !== cuts[k]) { cuts[k] = arg; moved = true; }
    }
  }
  return { cuts, penalty: beta, grid: step };
}

/**
 * A range of dates for each cut: every position k between the neighbouring cuts (keeping minSegment on
 * both sides) whose two-stretch cost is within `slack` of the best. Returned in z positions, like cuts.
 */
export function cutRanges(z, cuts, { kind = 'bernoulli', minSegment = 20, slack = 6 } = {}) {
  const P = prefixes(z), b = [0, ...cuts, z.length];
  return cuts.map((_, j) => {
    const L = b[j], R = b[j + 2];
    const D = [];
    for (let k = L + minSegment; k <= R - minSegment; k++) D.push([k, segmentCost(P, L, k, kind) + segmentCost(P, k, R, kind)]);
    let best = Infinity;
    for (const d of D) if (d[1] < best) best = d[1];
    let lo = Infinity, hi = -Infinity; // loops, not Math.min(...): a range on a long series can hold 100,000 positions
    for (const d of D) if (d[1] - best <= slack) { if (d[0] < lo) lo = d[0]; if (d[0] > hi) hi = d[0]; }
    return [lo, hi];
  });
}

// Wilson 95% interval for a share k / m.
function wilson(k, m) {
  if (!m) return [NaN, NaN];
  const z = 1.959964, p = k / m, d = 1 + (z * z) / m;
  const c = (p + (z * z) / (2 * m)) / d, h = (z * Math.sqrt((p * (1 - p)) / m + (z * z) / (4 * m * m))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// The shipped setting. Cost and penalty from eval/update-rate-sim.out.txt (round one: chosen on its
// calibration seed; its confirmation failed on dating to within 5 steps), the range's slack from
// eval/update-rate-range.out.txt (round two: chosen on seed 20261203, all four rules passed on
// 20261204-5). A test checks these match the files.
export const UPDATE_RATE = { kind: 'markov', mult: 2, minSegment: 20, minRepeats: 10, slack: 9 };

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
  const ranges = cutRanges(z, cuts, o);
  for (const st of stretches) {
    st.tick = smallestStep(values, st.from, st.to); st.medianMoveTicks = medianMoveTicks(values, st.from, st.to, st.tick);
    st.catchUp = catchUpRatio(values, st.from, st.to, st.tick);
  }
  const changes = cuts.map((c, k) => {
    const less = stretches[k + 1].share > stretches[k].share;
    const sticky = stretches[less ? k + 1 : k];
    return {
      index: c + 1, from: ranges[k][0] + 1, to: ranges[k][1] + 1, shareBefore: stretches[k].share, shareAfter: stretches[k + 1].share,
      direction: less ? 'less often' : 'more often',
      // README "Repeats from rounding": in the stickier stretch, at least half the moves are one tick,
      // unless the move after a run of repeats grows with the run, as a stale feed's catch-up does
      // (README "One-tick stale feeds: the catch-up check").
      ...roundingVerdict(sticky), tick: sticky.tick,
    };
  });
  return { changes, stretches, repeats: total, steps: z.length, penalty, setting: o };
}

// A slowly moving series recorded to a fixed precision repeats whenever it moves less than that
// precision, so a change in its repeat share may be a change in how fast it moves, not in how often it
// was refreshed. A stretch's tick is its smallest move between neighbours (its own, since a series may
// gain a decimal later; to 9 significant digits, so 0.1
// stored as 0.0999... counts as 0.1); a stretch whose median move, among steps that moved, is at most
// ROUNDING_TICKS ticks moves mostly by the smallest step the data records. 1.5 (half the moves are one
// tick) was set before any run (README "Repeats from rounding", eval/update-rate-rounding.mjs).
export const ROUNDING_TICKS = 1.5;
const sig = (v) => Number(v.toPrecision(9));
export function smallestStep(values, from = 1, to = values.length - 1) {
  let tick = Infinity;
  for (let t = Math.max(1, from); t <= to; t++) {
    const a = Number(values[t]), b = Number(values[t - 1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
    const d = sig(Math.abs(a - b));
    if (d > 0 && d < tick) tick = d;
  }
  return Number.isFinite(tick) ? tick : null;
}
/** Median |move| in ticks over the steps into values from..to that moved; null with no tick or no move. */
export function medianMoveTicks(values, from, to, tick) {
  if (!tick) return null;
  const m = [];
  for (let t = from; t <= to; t++) {
    const a = Number(values[t]), b = Number(values[t - 1]);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) m.push(sig(Math.abs(a - b)) / tick);
  }
  if (!m.length) return null;
  m.sort((x, y) => x - y);
  const h = m.length >> 1;
  return m.length % 2 ? m[h] : (m[h - 1] + m[h]) / 2;
}

// One-tick stale feeds (README "One-tick stale feeds: the catch-up check"; eval/update-rate-catchup.mjs).
// A stale feed whose real moves are about one tick passes the median-move test above, so it read as
// rounding. What differs is the move that ends a run of repeats. In a rounded slow walk the value
// leaves a run by crossing the next rounding boundary, so that move is still about one tick however
// long the run was. In a stale feed the hidden value kept moving while the figure sat still, so the
// move that ends k repeats is a catch-up over k + 1 steps, with about k + 1 times the variance.
// catchUpRatio: mean squared move (in ticks) ending a run of CATCHUP.minRun or more repeats, over the
// mean squared move that follows a move. Near 1 for rounding, above CATCHUP.ratio for a catch-up.
// Setting chosen on calibration seed 1 and checked once on fresh seeds by a committed rule.
export const CATCHUP = { minRun: 2, ratio: 1.4, minMoves: 5 };
export function catchUpRatio(values, from, to, tick, { minRun = CATCHUP.minRun, minMoves = CATCHUP.minMoves } = {}) {
  if (!tick) return null;
  let after = 0, nAfter = 0, plain = 0, nPlain = 0, run = 0, prevMoved = false;
  for (let t = Math.max(1, from); t <= to; t++) {
    const a = Number(values[t]), b = Number(values[t - 1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) { run = 0; prevMoved = false; continue; }
    if (a === b) { run++; prevMoved = false; continue; }
    const d2 = (sig(Math.abs(a - b)) / tick) ** 2;
    if (run >= minRun) { after += d2; nAfter++; } else if (run === 0 && prevMoved) { plain += d2; nPlain++; }
    run = 0; prevMoved = true;
  }
  if (nAfter < minMoves || nPlain < minMoves) return { ratio: null, after: nAfter, plain: nPlain };
  return { ratio: (after / nAfter) / (plain / nPlain), after: nAfter, plain: nPlain };
}
function roundingVerdict(sticky) {
  const oneTick = sticky.medianMoveTicks != null && sticky.medianMoveTicks <= ROUNDING_TICKS;
  const r = sticky.catchUp && sticky.catchUp.ratio;
  const catchUp = oneTick && r != null && r >= CATCHUP.ratio;
  return { rounding: oneTick && !catchUp, catchUp, catchUpRatio: r ?? null };
}

const pct = (v) => `${(100 * v).toFixed(0)}%`;

/** Plain lines for the CLI and the page; empty when no change of update rate was found. */
export function updateRateLines(u, labels) {
  if (!u || !u.changes || !u.changes.length) return [];
  const L = (i) => (labels && labels[i] != null ? labels[i] : `point ${i}`);
  const when = (c) => (c.from === c.to ? L(c.index) : `about ${L(c.index)} (between ${L(c.from)} and ${L(c.to)})`);
  const parts = u.changes.map((c) => `from ${when(c)} it began updating ${c.direction} (repeats ${pct(c.shareBefore)} of steps before, ${pct(c.shareAfter)} after)`);
  const rounded = u.changes.filter((c) => c.rounding);
  const tk = (c) => String(+c.tick.toPrecision(6));
  const allRounded = rounded.length === u.changes.length;
  const why = allRounded
    ? ` In the stretch with more repeats at least half the moves are one tick (${[...new Set(rounded.map(tk))].join(' or ')}, the smallest move there), so the repeats may only mean the series moved less than its recorded precision then: a slower series, not a stale one. If so, this is a change in how fast it moved, not in how often it was refreshed.`
    : ` This describes how often the data was refreshed (a stale feed, a figure carried forward, a change in how it was recorded), not a change in its level; jumps near these dates may be catch-ups after a stale stretch.${rounded.length ? ` Around ${rounded.map((c) => `${L(c.index)} (tick ${tk(c)})`).join(', ')}, though, at least half the moves in the stickier stretch are one tick, so those repeats may only be a slow series rounded to its precision.` : ''}`;
  const caught = u.changes.filter((c) => c.catchUp);
  const catchNote = caught.length
    ? ` Around ${caught.map((c) => L(c.index)).join(', ')} most moves in the stickier stretch are one tick (${[...new Set(caught.map(tk))].join(' or ')}), but a move that ends two or more repeats is larger (${caught.map((c) => `${c.catchUpRatio.toFixed(1)}x`).join(', ')} the mean square of a move after a move), as a stale figure catching up would be, so those repeats read as staleness, not rounding.`
    : '';
  return [`Update-rate check: the share of steps that repeat the previous value exactly changed ${u.changes.length === 1 ? 'once' : `${u.changes.length} times`}: ${parts.join('; ')}.${why}${catchNote}`];
}
