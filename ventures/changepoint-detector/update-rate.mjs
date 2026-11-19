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
import { staleTestMarkov } from './rounded-walk.mjs';

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
  // A `catchUp` option replaces the default whole, over the ratio-only base, so the earlier rounds'
  // settings (eval/update-rate-catchup*.mjs, update-rate-stale-lr.mjs) still reproduce their files.
  const cu = opts.catchUp ? { ...CATCHUP_BASE, ...opts.catchUp } : CATCHUP;
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
    st.catchUp = catchUpRatio(values, st.from, st.to, st.tick, cu);
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
      ...roundingVerdict(sticky, cu, values, trimmed(stretches, ranges, less ? k + 1 : k, cu)), tick: sticky.tick,
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
// README "A real carried-forward feed: last-trade prices" (2026-11-19): a price file written after float
// arithmetic holds 39.8025 beside 39.802499999999995, and their difference (7e-15) became the tick, so every
// real move read as 10^12 ticks and the rounding and catch-up checks never ran. Two values closer than nine
// significant digits are one value written twice: they are no move and set no tick. Exact repeats are
// unchanged (repeatIndicators still compares exactly).
export const floatNoise = (a, b) => a !== b && Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
export function smallestStep(values, from = 1, to = values.length - 1) {
  let tick = Infinity;
  for (let t = Math.max(1, from); t <= to; t++) {
    const a = Number(values[t]), b = Number(values[t - 1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b || floatNoise(a, b)) continue;
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
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b && !floatNoise(a, b)) m.push(sig(Math.abs(a - b)) / tick);
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
// Not offered: two pre-registered rounds failed (eval/update-rate-catchup.out.txt: runs >= 2, ratio 1.4,
// a 0.6-tick rounded walk called a catch-up in 6.0% of series, bar 5%; eval/update-rate-catchup-2.out.txt:
// runs >= 3, ratio 1.8, one-tick stale feeds caught in 79.5% of one cell, bar 80%). So `ratio` is Infinity
// and `catchUp` is always false; the ratio is still computed and returned (`catchUpRatio`) as a number,
// with no sentence. A test checks this matches the files.
// Round four ships (README "One-tick stale feeds: a heavy-tailed walk", eval/update-rate-stale-lr-4.out.txt,
// all four pre-registered lines passed on seed 20261216): the call is made by the likelihood route below,
// with Student t steps and the stretch trimmed to its cuts' ranges. The ratio stays a reported number.
export const CATCHUP_BASE = { minRun: 3, ratio: Infinity, minMoves: 5 };
// Round five ships (README "One-tick stale feeds: clumped carry-forward", eval/update-rate-stale-lr-5.out.txt,
// K1-K5 passed on seed 20261217): Markov carry-forward, threshold 6.56 set on the null cells of seed 31.
export const CATCHUP = { minRun: 3, ratio: Infinity, minMoves: 5, method: 'lr', lr: 6.56, test: staleTestMarkov, trim: 'range' };
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
// The likelihood route (README "One-tick stale feeds: a likelihood" and "a heavy-tailed walk";
// rounded-walk.mjs): with `method: 'lr'`, a one-tick sticky stretch is called a catch-up when a rounded
// walk carried forward beats the same walk merely rounded by LR >= `lr` (5.41, the 1% point of the
// boundary chi-square mix). It runs only on stretches that already pass the one-tick test. Round three
// (Gaussian steps, whole stretch) failed K1; round four (`staleTestHeavy`, t steps, `trim: 'range'`)
// passed K1-K4; round five (`staleTestMarkov`, clumped carry-forward, lr 6.56) passed K1-K5 and is the
// default. Pass `catchUp: { method: null }` for the median-move test alone.
function trimmed(stretches, ranges, j, cu) {
  const st = stretches[j];
  if (cu.trim !== 'range') return { from: st.from, to: st.to };
  const from = j > 0 ? Math.max(st.from, ranges[j - 1][1] + 1) : st.from;
  const to = j < ranges.length ? Math.min(st.to, ranges[j][0]) : st.to;
  return to - from >= 1 ? { from, to } : { from: st.from, to: st.to };
}
function roundingVerdict(sticky, cu = CATCHUP, values = null, span = sticky) {
  const oneTick = sticky.medianMoveTicks != null && sticky.medianMoveTicks <= ROUNDING_TICKS;
  const r = sticky.catchUp && sticky.catchUp.ratio;
  if (cu.method === 'lr') {
    const t = oneTick && values && cu.test ? cu.test(values, span.from - 1, span.to, sticky.tick) : null;
    const catchUp = !!(t && t.lr >= (cu.lr ?? 5.41));
    return { rounding: oneTick && !catchUp, catchUp, catchUpRatio: r ?? null, staleLR: t ? t.lr : null, staleP: t ? t.p : null, ...(t && t.lrIid != null ? { staleLRIid: t.lrIid, staleEnter: t.pEnter, staleStay: t.pStay, staleThreshold: cu.lr } : {}) };
  }
  const catchUp = oneTick && r != null && r >= cu.ratio;
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
  const lrNote = (c) => c.staleStay != null
    ? `a rounded walk carried forward in runs (after a fresh value the next repeats about ${pct(c.staleEnter)} of the time, after a repeat about ${pct(c.staleStay)}) fits it better than the same walk only rounded, even allowing heavy-tailed jumps (likelihood ratio ${c.staleLR.toFixed(1)}, against ${c.staleThreshold.toFixed(1)}, which about 2% of rounded slow series clear in simulation)`
    : c.staleLR != null
    ? `a rounded walk carried forward on about ${pct(c.staleP)} of steps fits it better than the same walk only rounded, even allowing heavy-tailed jumps (likelihood ratio ${c.staleLR.toFixed(1)}, against 5.4 at the 1% level)`
    : `a move that ends two or more repeats is ${c.catchUpRatio.toFixed(1)}x the mean square of a move after a move`;
  const catchNote = caught.length
    ? ` Around ${caught.map((c) => L(c.index)).join(', ')} most moves in the stickier stretch are one tick (${[...new Set(caught.map(tk))].join(' or ')}), but the moves that end runs of repeats grow with the run, as a stale figure catching up would (${caught.map(lrNote).join('; ')}), so those repeats read as staleness, not rounding.`
    : '';
  return [`Update-rate check: the share of steps that repeat the previous value exactly changed ${u.changes.length === 1 ? 'once' : `${u.changes.length} times`}: ${parts.join('; ')}.${why}${catchNote}`];
}

// Short returns to more frequent updates (README "Short returns to more frequent updates";
// eval/update-rate-returns.mjs, pre-registered). The partition above pays its penalty once per cut, so a
// brief stretch of fewer repeats inside a stickier one (a provider that resumed daily publication for two
// months, then went back) costs two cuts and rarely pays for itself. This pass looks inside each stretch
// the partition found for one "epidemic" interval [a, b): its own two-state chain inside, ONE chain shared
// by the parts before and after (the same schedule resumed), and the inside sharing fewer repeats. It is
// reported only when the cost it saves beats `mult` x 2 log n. Descriptive: it never moves the partition's
// cuts. Each side keeps at least minSegment steps, so a change at the series' ends is not a "return".
function chainCounts(P, a, b) { // transitions s in [a + 1, b), as segmentCost counts them
  const T = P.T, a1 = a + 1;
  return [T[0][b] - T[0][a1], T[1][b] - T[1][a1], T[2][b] - T[2][a1], T[3][b] - T[3][a1]];
}
const chainCost = (c) => -2 * (xlx(c[0], c[0] + c[1]) + xlx(c[1], c[0] + c[1]) + xlx(c[2], c[2] + c[3]) + xlx(c[3], c[2] + c[3]));

/** Best epidemic interval of fewer repeats inside z[L..R); { a, b, gain } in z positions, or null. */
export function bestReturn(z, L, R, { minSegment = 20, P = prefixes(z) } = {}) {
  if (R - L < 3 * minSegment) return null;
  const whole = chainCost(chainCounts(P, L, R));
  let best = null;
  for (let a = L + minSegment; a <= R - 2 * minSegment; a++) {
    const left = chainCounts(P, L, a);
    for (let b = a + minSegment; b <= R - minSegment; b++) {
      const inR = P.R[b] - P.R[a], outR = P.R[R] - P.R[L] - inR;
      if (inR / (b - a) >= outR / (R - L - (b - a))) continue; // only fewer repeats inside
      const right = chainCounts(P, b, R), inside = chainCounts(P, a, b);
      const out = [left[0] + right[0], left[1] + right[1], left[2] + right[2], left[3] + right[3]];
      const gain = whole - chainCost(out) - chainCost(inside);
      if (!best || gain > best.gain) best = { a, b, gain };
    }
  }
  return best;
}

// Not a default: `mult` is set by eval/update-rate-returns.mjs (null until a round passes).
export const SHORT_RETURNS = { mult: null, minSegment: 20, minRepeats: 10 };

/**
 * Short stretches of more frequent updates inside the stretches updateRateChanges found. Value indexes:
 * { returns: [{ from, to, steps, shareInside, shareOutside, gain }], penalty }. `u` may be passed to
 * reuse a computed updateRateChanges result.
 */
export function shortReturns(values, { mult = SHORT_RETURNS.mult, minSegment = SHORT_RETURNS.minSegment, minRepeats = SHORT_RETURNS.minRepeats, u = null } = {}) {
  const z = repeatIndicators(values);
  const penalty = mult == null ? Infinity : mult * 2 * Math.log(z.length + 1);
  const total = z.reduce((s, v) => s + v, 0);
  if (!Number.isFinite(penalty) || total < minRepeats) return { returns: [], penalty };
  const st = (u || updateRateChanges(values)).stretches;
  const spans = st.length ? st.map((s) => [s.from - 1, s.to]) : [[0, z.length]];
  const P = prefixes(z), returns = [];
  for (const [L, R] of spans) {
    const r = bestReturn(z, L, R, { minSegment, P });
    if (!r || r.gain <= penalty) continue;
    const inR = P.R[r.b] - P.R[r.a], outR = P.R[R] - P.R[L] - inR;
    returns.push({ from: r.a + 1, to: r.b, steps: r.b - r.a, shareInside: inR / (r.b - r.a), shareOutside: outR / (R - L - (r.b - r.a)), gain: r.gain });
  }
  return { returns, penalty };
}

// ---- Short returns with a calendar (README "Short returns, with the day of the week"). ----
// The pass above models a stretch as one two-state chain, which describes a fixed weekly schedule badly:
// whether today repeats depends on the day of the week, not on yesterday. These costs give each stretch one
// repeat probability per weekday ('dow', 7 per region) or a two-state chain per weekday ('dowchain', 14).
// `days[s]` is the weekday (0-6, any fixed origin) of repeat indicator z[s] (the step into value s + 1).
// Each cost is a sum over "pairs" of counts (x, y) of -2 (x log x/(x+y) + y log y/(x+y)):
//   'chain':    pair by z[s-1] (the shipped pass's cost; steps from the region's second on);
//   'dow':      pair by days[s] (every step of the region);
//   'dowchain': pair by (days[s], z[s-1]) (steps from the region's second on).
export const RETURN_COSTS = { chain: { pairs: 2, off: 1 }, dow: { pairs: 7, off: 0 }, dowchain: { pairs: 14, off: 1 } };

function pairPrefixes(z, days, kind) {
  const { pairs, off } = RETURN_COSTS[kind], n = z.length;
  const C = new Int32Array((n + 1) * 2 * pairs), R = new Int32Array(n + 1), W = 2 * pairs;
  for (let s = 0; s < n; s++) {
    R[s + 1] = R[s] + z[s];
    const row = (s + 1) * W;
    for (let k = 0; k < W; k++) C[row + k] = C[s * W + k];
    if (s < off) continue;
    const p = kind === 'chain' ? z[s - 1] : kind === 'dow' ? days[s] : 2 * days[s] + z[s - 1];
    C[row + 2 * p + z[s]] += 1;
  }
  return { C, R, W, off };
}

/**
 * Direction guard for a candidate return (round 5, README "Short returns: a real drop in repeats"): asks that the
 * repeat share inside the interval be really lower than around it, not just lower. `guard` is
 * { kind: 'ratio', r } (share inside <= r x share around) or { kind: 'z', z } (one-sided pooled two-proportion
 * z of the drop >= z). Off (null) by default everywhere: the shipped pass and rounds 1-4 are unchanged.
 */
export function returnGuardPasses(inR, nIn, outR, nOut, guard) {
  const pIn = inR / nIn, pOut = outR / nOut;
  if (guard.kind === 'ratio') return pIn <= guard.r * pOut;
  if (guard.kind === 'z') {
    const p = (inR + outR) / (nIn + nOut), se = Math.sqrt(p * (1 - p) * (1 / nIn + 1 / nOut));
    return se > 0 && (pOut - pIn) / se >= guard.z;
  }
  throw new Error(`unknown return guard '${guard.kind}'`);
}

/**
 * Best interval [a, b) of fewer repeats inside z[L..R) under a return cost kind; { a, b, gain } or null.
 * `sparse: true` (README "Short sparse spells") looks for the mirror instead: a spell of MORE repeats inside (fewer
 * publishing days), the guard applied with inside and around swapped (ratio r 0.5: share inside at least twice the
 * share around; z: a significant rise). Off by default: the shipped pass and rounds 1-5 are unchanged.
 */
export function bestReturnCost(z, L, R, { kind = 'dow', days = null, minSegment = 20, P = null, guard = null, sparse = false } = {}) {
  if (R - L < 3 * minSegment) return null;
  if (kind !== 'chain' && !days) throw new Error(`a '${kind}' cost needs days`);
  P = P || pairPrefixes(z, days, kind);
  const { C, W, off } = P, Rp = P.R, n = z.length;
  const LL = new Float64Array(n + 2); for (let k = 2; k <= n + 1; k++) LL[k] = k * Math.log(k);
  const cost = (v) => { let s = 0; for (let k = 0; k < W; k += 2) s += LL[v[k] + v[k + 1]] - LL[v[k]] - LL[v[k + 1]]; return 2 * s; };
  const diff = (out, b, a) => { for (let k = 0; k < W; k++) out[k] = C[b * W + k] - C[a * W + k]; return out; };
  const whole = cost(diff(new Int32Array(W), R, L + off));
  const left = new Int32Array(W), ins = new Int32Array(W), out = new Int32Array(W);
  const totR = Rp[R] - Rp[L];
  let best = null;
  for (let a = L + minSegment; a <= R - 2 * minSegment; a++) {
    diff(left, a, L + off);
    for (let b = a + minSegment; b <= R - minSegment; b++) {
      const inR = Rp[b] - Rp[a];
      const nIn = b - a, nOut = R - L - nIn, outR = totR - inR;
      if (sparse ? inR / nIn <= outR / nOut : inR / nIn >= outR / nOut) continue; // only fewer (sparse: more) repeats inside
      if (guard && !(sparse ? returnGuardPasses(outR, nOut, inR, nIn, guard) : returnGuardPasses(inR, nIn, outR, nOut, guard))) continue;
      let ci = 0, co = 0;
      const bi = b * W, ai = (a + off) * W, ri = R * W, bo = (b + off) * W;
      for (let k = 0; k < W; k += 2) {
        const x = C[bi + k] - C[ai + k], y = C[bi + k + 1] - C[ai + k + 1];
        ci += LL[x + y] - LL[x] - LL[y];
        const u = left[k] + C[ri + k] - C[bo + k], w = left[k + 1] + C[ri + k + 1] - C[bo + k + 1];
        co += LL[u + w] - LL[u] - LL[w];
      }
      const gain = whole - 2 * (ci + co);
      if (!best || gain > best.gain) best = { a, b, gain };
    }
  }
  return best;
}

/** Weekday (0 Sunday to 6 Saturday) of each repeat indicator, from ISO dates per value (dates[s + 1]). */
export function daysFromDates(dates) {
  return dates.slice(1).map((d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`).getUTCDay());
}

/**
 * The best return per stretch under a return cost, with no penalty applied (so a caller can test several):
 * [{ L, R, a, b, gain, shareInside, shareOutside }] in z positions. `u` reuses an updateRateChanges result.
 */
export function returnCandidates(values, { kind = 'dow', days = null, minSegment = SHORT_RETURNS.minSegment, minRepeats = SHORT_RETURNS.minRepeats, u = null, guard = null, sparse = false } = {}) {
  const z = repeatIndicators(values);
  if (z.reduce((s, v) => s + v, 0) < minRepeats) return [];
  const st = (u || updateRateChanges(values)).stretches;
  const spans = st.length ? st.map((s) => [s.from - 1, s.to]) : [[0, z.length]];
  const P = pairPrefixes(z, days, kind), out = [];
  for (const [L, R] of spans) {
    const r = bestReturnCost(z, L, R, { kind, days, minSegment, P, guard, sparse });
    if (!r) continue;
    const inR = P.R[r.b] - P.R[r.a], outR = P.R[R] - P.R[L] - inR;
    out.push({ L, R, ...r, shareInside: inR / (r.b - r.a), shareOutside: outR / (R - L - (r.b - r.a)) });
  }
  return out;
}

/**
 * Weekly-pattern test for one stretch z[L..R) (round 4 of the short-returns pass, README "Short returns: the
 * model chosen per stretch"): the likelihood ratio of a two-state chain per weekday (14 parameters) against one
 * two-state chain (2), over the same transitions. Under a chain with no weekly pattern it is about chi-square on
 * 12 degrees of freedom, and the chain null keeps clumps from reading as a calendar. Returns the statistic.
 */
export function weeklyPatternLR(z, days, L, R) {
  let lr = 0;
  for (const [kind, sign] of [['chain', 1], ['dowchain', -1]]) {
    const { pairs } = RETURN_COSTS[kind], v = new Array(2 * pairs).fill(0);
    for (let s = L + 1; s < R; s++) v[2 * (kind === 'chain' ? z[s - 1] : 2 * days[s] + z[s - 1]) + z[s]]++;
    for (let k = 0; k < v.length; k += 2) lr += sign * 2 * (xlx(v[k], v[k] + v[k + 1]) + xlx(v[k + 1], v[k] + v[k + 1]));
  }
  return -lr;
}

/** chi-square 0.999 quantile on 12 degrees of freedom: a stretch above it is read as on a weekly schedule. */
export const WEEKLY_TEST = { df: 12, crit: 32.909 };

// ---- Short sparse spells (README "Short sparse spells: the return pass reversed", 2026-11-19, pre-registered). ----
// The mirror of the short-returns pass: inside each stretch the shipped check finds, the one interval with MORE
// repeats (fewer publishing days) than the parts around it, which share one model because the old schedule came
// back. Round 5's per-stretch model (weekday cost where weeklyPatternLR reads a weekly schedule, else the chain);
// guard z01 (a significant rise in repeats); reported when gain > mult x 2 log(n + 1). eval/update-rate-sparse-
// spells.mjs chose z01 at m 3.5 on calibration and passed S1-S4 on confirmation and K1 on seen data (Alaska, South
// Dakota). An opt-in: nothing the CLI or the page prints calls it yet. Needs a weekday per step (daysFromDates).
// Superseded 2026-11-19 by the differing-weekday score below (README "Short spells scored on the weekdays that
// differ"): eval/update-rate-spells-weekdays.mjs chose arm A, beta 4, m 2.5 on calibration and passed C1-C5 and K1.
// The round-5 search stays reachable as `score: 'dow'` (SHORT_SPELLS_DOW) so earlier rounds' outputs reproduce.
export const SHORT_SPELLS_DOW = { score: 'dow', mult: 3.5, guard: { kind: 'z', z: 2.326 }, minSegment: 20, minRepeats: 10 };
export const SHORT_SPELLS = { score: 'weekdays', arm: 'A', beta: 4, mult: 2.5, guard: { kind: 'z', z: 2.326 }, minSegment: 20, minRepeats: 10 };

/**
 * Short spells of less frequent updates inside the stretches updateRateChanges found. `days[s]` is the weekday of
 * repeat indicator s. Value indexes: { spells: [{ from, to, steps, shareInside, shareOutside, gain, kind }], penalty }.
 * score 'weekdays' (the default since 2026-11-19; kind 'weekdays' or 'chain', `weekdays` a bitmask of the weekday
 * values counted) or 'dow' (round 5's search, kind 'dow' or 'chain').
 */
export function shortSpells(values, { days, score = SHORT_SPELLS.score, mult = null, guard = SHORT_SPELLS.guard, minSegment = SHORT_SPELLS.minSegment, minRepeats = SHORT_SPELLS.minRepeats, u = null, beta = SHORT_SPELLS.beta, arm = SHORT_SPELLS.arm } = {}) {
  if (!days) throw new Error('shortSpells needs a weekday per step (daysFromDates)');
  if (mult == null) mult = score === 'dow' ? SHORT_SPELLS_DOW.mult : SHORT_SPELLS.mult;
  const n = values.length - 1, penalty = mult * 2 * Math.log(n + 1), z = repeatIndicators(values);
  u = u || updateRateChanges(values);
  if (score === 'weekdays') {
    const rows = spellWeekdayCandidates(values, { days, betas: [beta], guard, minSegment, minRepeats, u });
    return { spells: spellsFromWeekdayRows(rows, { arm, t: 0, pen: penalty }), penalty };
  }
  if (score !== 'dow') throw new Error(`unknown spell score '${score}'`);
  const opts = { days, u, guard, minSegment, minRepeats, sparse: true };
  const D = new Map(returnCandidates(values, { ...opts, kind: 'dow' }).map((q) => [q.L, q]));
  const F = new Map(returnCandidates(values, { ...opts, kind: 'chain' }).map((q) => [q.L, q]));
  const spells = [];
  for (const L of [...new Set([...D.keys(), ...F.keys()])].sort((a, b) => a - b)) {
    const q = D.get(L) || F.get(L), weekly = weeklyPatternLR(z, days, q.L, q.R) > WEEKLY_TEST.crit;
    const c = weekly ? D.get(L) : F.get(L);
    if (c && c.gain > penalty) spells.push({ from: c.a + 1, to: c.b, steps: c.b - c.a, shareInside: c.shareInside, shareOutside: c.shareOutside, gain: c.gain, kind: weekly ? 'dow' : 'chain' });
  }
  return { spells, penalty };
}

// ---- A spell score on the differing weekdays only (README "Short spells scored on the weekdays that differ",
// 2026-11-19, pre-registered in eval/update-rate-spells-weekdays.mjs). The weekday cost's gain is a sum over the
// seven weekdays of a per-weekday likelihood ratio LR_k (inside against around). Weekdays on which the two schedules
// agree add only chi-square noise to that sum, and the penalty has to sit above the noise of all seven, so a spell
// that differs on few days (a month of Mon/Wed/Fri inside Monday-Friday differs on 8 or 9 Tuesdays and Thursdays)
// falls under it. This score counts a weekday only when its repeat share rises inside and its LR_k clears `beta`:
// score = sum_k max(0, LR_k - beta) over rising weekdays. With beta 0 and every weekday rising it is the weekday
// gain. Off by default: shortSpells is unchanged unless called with `sel`.

/**
 * Best sparse spell [a, b) inside z[L..R) under the differing-weekday score, one per beta in `betas`:
 * [{ a, b, gain, weekdays }] (null where none), gain being the score. `guard` as bestReturnCost's (sparse).
 */
export function bestSpellWeekdays(z, L, R, { days, betas = [0], minSegment = 20, P = null, guard = null } = {}) {
  if (R - L < 3 * minSegment) return betas.map(() => null);
  if (!days) throw new Error('bestSpellWeekdays needs days');
  P = P || pairPrefixes(z, days, 'dow');
  const { C, W } = P, Rp = P.R, n = z.length;
  const LL = new Float64Array(n + 2); for (let k = 2; k <= n + 1; k++) LL[k] = k * Math.log(k);
  const c2 = (x, y) => LL[x + y] - LL[x] - LL[y];
  const totR = Rp[R] - Rp[L], best = betas.map(() => null), lr = new Float64Array(7), rise = new Uint8Array(7);
  for (let a = L + minSegment; a <= R - 2 * minSegment; a++) {
    for (let b = a + minSegment; b <= R - minSegment; b++) {
      const inR = Rp[b] - Rp[a], nIn = b - a, nOut = R - L - nIn, outR = totR - inR;
      if (inR / nIn <= outR / nOut) continue;
      if (guard && !returnGuardPasses(outR, nOut, inR, nIn, guard)) continue;
      const bi = b * W, ai = a * W, ri = R * W, li = L * W;
      for (let k = 0; k < 7; k++) {
        const j = 2 * k, x = C[bi + j] - C[ai + j], y = C[bi + j + 1] - C[ai + j + 1];
        const u = C[ri + j] - C[li + j] - x, w = C[ri + j + 1] - C[li + j + 1] - y;
        rise[k] = y * (u + w) > w * (x + y) ? 1 : 0;
        lr[k] = rise[k] ? 2 * (c2(x + u, y + w) - c2(x, y) - c2(u, w)) : 0;
      }
      for (let t = 0; t < betas.length; t++) {
        let g = 0, wd = 0;
        for (let k = 0; k < 7; k++) if (rise[k] && lr[k] > betas[t]) { g += lr[k] - betas[t]; wd |= 1 << k; }
        if (g > 0 && (!best[t] || g > best[t].gain)) best[t] = { a, b, gain: g, weekdays: wd };
      }
    }
  }
  return best;
}

/**
 * Per stretch of updateRateChanges: the shipped chain candidate, the weekly test, and the differing-weekday
 * candidate per beta (all unpenalised), so a caller can apply several penalties. [{ L, R, weekly, chain, sel: [] }].
 */
export function spellWeekdayCandidates(values, { days, betas = [0], guard = SHORT_SPELLS.guard, minSegment = SHORT_SPELLS.minSegment, minRepeats = SHORT_SPELLS.minRepeats, u = null } = {}) {
  const z = repeatIndicators(values);
  if (z.reduce((s, v) => s + v, 0) < minRepeats) return [];
  u = u || updateRateChanges(values);
  const st = u.stretches, spans = st.length ? st.map((s) => [s.from - 1, s.to]) : [[0, z.length]];
  const PD = pairPrefixes(z, days, 'dow'), PC = pairPrefixes(z, days, 'chain'), out = [];
  const share = (P, a, b, L, R) => { const inR = P.R[b] - P.R[a], outR = P.R[R] - P.R[L] - inR; return { shareInside: inR / (b - a), shareOutside: outR / (R - L - (b - a)) }; };
  for (const [L, R] of spans) {
    if (R - L < 3 * minSegment) continue;
    const ch = bestReturnCost(z, L, R, { kind: 'chain', days, minSegment, P: PC, guard, sparse: true });
    const sel = bestSpellWeekdays(z, L, R, { days, betas, minSegment, P: PD, guard });
    out.push({ L, R, weekly: weeklyPatternLR(z, days, L, R) > WEEKLY_TEST.crit,
      chain: ch && { ...ch, ...share(PD, ch.a, ch.b, L, R) },
      sel: sel.map((q) => q && { ...q, ...share(PD, q.a, q.b, L, R) }) });
  }
  return out;
}

/**
 * Arms of the pre-registered round, applied to spellWeekdayCandidates rows with the chosen beta index `t` and
 * penalty `pen`: 'A' keeps round 5's per-stretch choice (the weekday score on weekly stretches, the chain elsewhere);
 * 'B' also tries the weekday score on stretches the weekly test does not read as weekly, after the chain.
 * Returns spells as shortSpells does.
 */
export function spellsFromWeekdayRows(rows, { arm, t = 0, pen }) {
  const spells = [];
  for (const r of rows) {
    const s = r.sel[t], c = r.chain;
    let pick = null, kind = null;
    if (r.weekly) { if (s && s.gain > pen) { pick = s; kind = 'weekdays'; } }
    else if (c && c.gain > pen) { pick = c; kind = 'chain'; }
    else if (arm === 'B' && s && s.gain > pen) { pick = s; kind = 'weekdays'; }
    if (pick) spells.push({ from: pick.a + 1, to: pick.b, steps: pick.b - pick.a, shareInside: pick.shareInside, shareOutside: pick.shareOutside, gain: pick.gain, kind, weekdays: pick.weekdays });
  }
  return spells;
}

// ---- The --spells line (CLI --spells, the page's "short spells" box; README "Short sparse spells on the CLI and page"). ----
// shortSpells needs a weekday per step, so it runs only when every label is a date (YYYY-MM-DD). The search is
// quadratic in each stretch's length (about 1 s on 1,143 daily values), so it stops at SPELLS_MAX_POINTS.
export const SPELLS_MAX_POINTS = 4000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/**
 * Run shortSpells for the CLI or page. Returns { spells: [{ ...spell, fromLabel, toLabel }], penalty } or
 * { refused: reason }. `u` reuses an updateRateChanges result for the same values.
 */
export function spellsResult(values, labels, { u = null, maxPoints = SPELLS_MAX_POINTS, score = SHORT_SPELLS.score } = {}) {
  if (values.length > maxPoints) return { refused: `${values.length} points is above the ${maxPoints} the spell search runs on` };
  if (!labels || labels.length !== values.length || !labels.every((l) => ISO_DAY.test(String(l)) && !Number.isNaN(Date.parse(String(l).slice(0, 10))))) {
    return { refused: 'it needs a date on every row (YYYY-MM-DD labels), to read the weekday of each update' };
  }
  u = u || updateRateChanges(values);
  const { spells, penalty } = shortSpells(values, { days: daysFromDates(labels), u, score });
  const edgeSpells = edgeSpellsOf(u).map((s) => ({ ...s, fromLabel: String(labels[s.from]), toLabel: String(labels[s.to]) }));
  return { spells: spells.map((s) => ({ ...s, fromLabel: String(labels[s.from]), toLabel: String(labels[s.to]) })), edgeSpells, penalty };
}

// README "Short spells on a second provider": the spell search looks INSIDE the update-rate line's stretches, so a
// spell whose two edges that line already cut (fewer updates, then back to more within EDGE_SPELL_MAX_STEPS) is not
// found again. On NYT's Alaska series the default line cut 2021-06-04 and 2021-08-01 and the search said "none
// found". This restates the default line's own two changes as one spell; it adds no test and no new p.
export const EDGE_SPELL_MAX_STEPS = 120;
export function edgeSpellsOf(u, maxSteps = EDGE_SPELL_MAX_STEPS) {
  const out = [];
  for (let k = 0; k + 1 < u.changes.length; k++) {
    const a = u.changes[k], b = u.changes[k + 1], mid = u.stretches[k + 1];
    if (a.direction === 'less often' && b.direction === 'more often' && mid.steps <= maxSteps) {
      out.push({ from: mid.from, to: mid.to, steps: mid.steps, shareInside: mid.share, shareBefore: u.stretches[k].share, shareAfter: u.stretches[k + 2].share });
    }
  }
  return out;
}

const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
/** Names of the weekdays in a bitmask of daysFromDates values (0 Sunday): 'Tuesdays and Thursdays'. */
export function weekdayNames(mask) {
  const n = WEEKDAY_NAMES.filter((_, k) => mask & (1 << k));
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/** One plain line for the CLI and the page, or null when there is nothing to say. */
export function spellsLine(res) {
  if (!res) return null;
  if (res.refused) return `Short spells of fewer updates: not searched, because ${res.refused}.`;
  const edges = (res.edgeSpells || []).filter((e) => !res.spells.some((s) => s.from <= e.to && e.from <= s.to));
  const edgeText = edges.length ? ` The update-rate line already dates ${edges.length === 1 ? 'a spell' : `${edges.length} spells`} as two changes, fewer updates and then back to more: ${edges.map((e) => `${e.fromLabel} to ${e.toLabel} (${e.steps} steps, ${pct(e.shareInside)} repeats inside, ${pct(e.shareBefore)} before, ${pct(e.shareAfter)} after)`).join('; ')}.` : '';
  if (!res.spells.length) return edges.length
    ? `Short spells of fewer updates: none inside the update-rate line's stretches.${edgeText}`
    : 'Short spells of fewer updates: none found (no stretch of a month or so where the series repeated its last value clearly more often than before and after it).';
  const one = (s) => `${s.fromLabel} to ${s.toLabel} (${s.steps} steps): the value repeated on ${pct(s.shareInside)} of steps inside, against ${pct(s.shareOutside)} before and after${s.kind === 'dow' ? ', read weekday by weekday because the stretch runs on a weekly schedule' : s.kind === 'weekdays' ? `, read on the weekdays where the schedule changed (${weekdayNames(s.weekdays)})` : ''}`;
  return `Short spells of fewer updates: ${res.spells.length === 1 ? 'one spell' : `${res.spells.length} spells`} where the series was refreshed on fewer days for a while and then went back to its old schedule: ${res.spells.map(one).join('; ')}. This is about how often the data was published (a reduced reporting schedule, a holiday spell), not its level; a jump at the end of a spell may be a catch-up.${edgeText}`;
}
