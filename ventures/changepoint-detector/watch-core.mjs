// The watch's logic with no file, network or process access, so the page, the CLI (watch.mjs) and
// the agent tool (platform/agents/tools.mjs, which exposes what the page imports) share one copy.
// watch.mjs adds the state file, the CSV URL, the webhook and the exit code around it.

import { analyze, parseSeries, peaks } from './engine.mjs';
import { driftLevel, driftNoiseML, driftSegmentCost } from './drift-level.mjs';
import { median } from './stats-core.mjs';

// Defaults chosen on synthetic streams only (eval/watch-replay.mjs, eval/watch-replay.out.txt), then
// scored once on the TCPD series without changing them (same file, "TCPD replay").
// Pre-registered rule: of the candidates finding at least 90% of 2-sd steps, the fewest false alerts on three null
// streams. Chosen: the Bayesian detections with 5 points of confirmation (0 per 1,000 checks on independent noise,
// 7.5 on AR(1) 0.5, 2.5 on t3; PELT's level model 2.5 / 49.75 / 12.75). On TCPD: 193 alerts against PELT's 626.
// Round 3 (eval/watch-replay-round3.out.txt, rule pre-registered in eval/watch-replay.mjs) replaced the detector with
// the AR(1) Bayesian pass, probability summed over 5 neighbours: mean null false alerts 2.38 per 1,000 against 10.56
// (AR(1) 0.8: 1.5 against 32.25), 38 steps found against 35. The AR(1) term is for the level model only, so with
// --model poisson or meanvar the default stays 'bocpd'.
// Round 4 (eval/watch-replay-round4.out.txt, rule pre-registered in eval/watch-rho.mjs) capped the AR(1) pass's rho at 0.8:
// 15 of the 17 marked TCPD changes the AR(1) pass lost were at the 0.95 clip (eval/watch-rho-why.out.txt). With the cap,
// 33 of 52 marked changes against 29, 41% of alerts at a mark against 38%, synthetic nulls and steps unchanged; the cost
// is noise that really is that sticky (AR(1) 0.95: 3.0 false alerts per 1,000 checks against 1.25).
// Round 5 (eval/watch-flicker.out.txt, rule pre-registered in eval/watch-flicker.mjs) holds changes dated inside the history
// the first check called quiet instead of alerting them: TCPD 115 alerts to 106 with the same 33 of 52 marked changes and
// 42% at a mark against 41%; synthetic cells unchanged; on the 7 held-out TCPD series 68 to 61 alerts, the same 9 of 12.
// persist 2 (wait for a second check) failed round 5 by one marked TCPD change, which round 7 (eval/watch-persist-censor.mjs,
// rule pre-registered there) traced to the replay ending: the change was first seen at the series' last point. Scored
// with end-pending changes apart, it passed on fresh synthetic seeds and on TCPD (103 alerts against 105, the same 32 of
// 51 marks) and the held-out 7 (59 against 61, the same 9 of 12), so it is the default from round 7; --persist 1 turns
// it off. It costs one check of delay on every alert.
export const WATCH_DEFAULTS = { confirm: 5, tolerance: 5, window: 1000, detector: 'bocpd-ar1-window', model: 'mean', rhoCap: 0.8, holdHistory: true, persist: 2 };
/** The default detector for a model: the AR(1) pass for the level model, the plain Bayesian pass otherwise. */
export const defaultDetector = (model = 'mean') => (model === 'mean' ? WATCH_DEFAULTS.detector : 'bocpd');
/**
 * The count watch's default (2026-11-20, eval/poisson-window-threshold.prereg.md, tuned on seeds 601-800, passed on fresh
 * seeds 801-1000): with `--model poisson` and no detector, clumping cost or threshold named, the watch uses the
 * windowed Bayesian pass with the negative-binomial cost at threshold 0.3. Against `bocpd`: 2.23 fewer false alerts per
 * 1,000 checks (1.55 to 2.90), 355 more of 1,200 steps (326 to 385), the 40% drop in very clumped counts 145 of 200
 * against 129. Naming any of the three keeps the rest as before (an explicit `--detector bocpd` is the old default).
 * The "How eager" ladder and `--detector auto` use it as Quiet for counts (eagerSettings; README "The How eager hint
 * for counts").
 */
export const COUNT_DEFAULTS = { detector: 'bocpd-window', overdispersion: 'nb', threshold: 0.3 };
/**
 * The middle setting for counts (2026-11-21, eval/gsc-middle.prereg.md; README "A middle setting for over-dispersed
 * counts"): PELT with the negative-binomial cost. Picked on tuning seeds from five candidates, then checked on fresh
 * simulated sites whose daily counts swing beyond Poisson (weekends at 70%, a day multiplier with cv 15%): 115 of 120
 * 20% falls heard against the count default's 38, 0.83 false alerts per 1,000 days against 0.17, the same 4-day
 * delay on 40% falls; at cv 30%, 88 against 17 and 1.33 false per 1,000. It is slower than Quiet on the falls both
 * hear (a median of 8 days on a 20% fall) because PELT waits until the new level is clear. Plain `pelt` (Eager) takes
 * the extra swings for changes, 39-148 false alerts per 1,000 days on the same sites.
 */
export const COUNT_MIDDLE = { detector: 'pelt', overdispersion: 'nb', trend: 'gated' };
// Since 2026-11-21 (eval/middle-trend-joint.prereg.md, README "The joint growth fit, gated", every H bar passed) Middle
// also refits one growth rate under the steps and keeps it when it beats a flat level by log n: on sites growing 30%
// over 240 days it alerted on 6 of 40 against plain PELT + NB's 27 (1.46 alerts per 1,000 days against 7.71), with the
// same steps found on flat series and 0.2-0.7 more days unaware per fall. About 2.5x plain PELT + NB's time a check.
export function withCountDefaults(opts = {}) {
  if ((opts.model ?? 'mean') !== 'poisson' || opts.detector != null || opts.overdispersion != null || opts.threshold != null) return opts;
  return { ...opts, ...COUNT_DEFAULTS };
}

const STATE_VERSION = 1;
// 'drift': jumps on a wandering level (drift-level.mjs, `--model drift`: a local-level model whose random-walk wander and
// noise are estimated from the window, jumps placed by penalised likelihood). For a series whose level drifts all the time,
// where the level detectors alert on the wander itself. Round 8 (eval/watch-drift.mjs, rule pre-registered there).
export const DETECTORS = ['bocpd', 'bocpd-window', 'bocpd-ar1', 'bocpd-ar1-window', 'pelt', 'drift'];

export function emptyState() {
  return { version: STATE_VERSION, alerted: [], n: 0, lastLabel: null };
}

/**
 * The changes the chosen detector finds in the newest `window` points. Indexes are absolute
 * (0-based in the full series). opts: detector 'pelt' | 'bocpd', model, penalty, period, log, ...
 */
export function detectChanges(values, labels, opts0 = {}) {
  const { minShift, minSpreadRatio, minMoveRatio, ...opts } = withCountDefaults(opts0);
  const d = opts.detector ?? defaultDetector(opts.model ?? 'mean');
  if ((d.startsWith('bocpd-ar1') || d === 'drift') && (opts.model ?? 'mean') !== 'mean') throw new Error(`--detector ${d} is for the level model (--model mean) only.`);
  const floors = (cs) => aboveMoveFloor(aboveSpreadFloor(aboveFloor(cs, minShift), values, minSpreadRatio), values, minMoveRatio);
  if (d === 'drift') return floors(detectDrift(values, labels, opts));
  const { wander, wanderMargin, wanderJump, wanderTest, wanderBefore, wanderSplit, ...rest } = opts;
  if (wander != null && wander !== 'gated') throw new Error('wander takes gated.');
  if (wander && (opts.model ?? 'mean') !== 'poisson') throw new Error('--wander gated is for counts: add --model poisson.');
  const all = detectBoth(values, labels, { ...rest, detector: d });
  if (!all[d]) throw new Error(`Unknown detector ${d}.`);
  const found = floors(all[d]);
  if (!wander || !found.length) return found;
  return wanderFilter(found, values, { window: opts.window ?? WATCH_DEFAULTS.window, tolerance: opts.tolerance ?? WATCH_DEFAULTS.tolerance, margin: wanderMargin, jump: wanderJump, test: wanderTest, before: wanderBefore === undefined ? WANDER_BEFORE : wanderBefore || null, split: wanderSplit });
}

/**
 * The wander gate for counts (`wander: 'gated'`, README "A wandering level under Middle"). On the window's
 * log counts, less a day-of-week effect, the drift model (drift-level.mjs: a random-walk level with jumps) is fitted
 * twice with the same noise scale, on the series less its robust slope: with its wander profiled, and with no wander
 * (a flat level with jumps). When the
 * wander beats the flat fit by more than log n, the level is wandering, and a count change is kept only when the
 * drift model also places a jump within `tolerance` points of it; otherwise every change is kept as it was.
 */
/**
 * Since 2026-11-21 (README "A calmer wander gate", eval/middle-wander-calm.prereg.md) `wander: 'gated'` decides whether
 * the level wanders on the window before the newest count change when at least this many points precede it, so a real
 * fall on a calm site cannot open the gate. `wanderBefore: false` gives the first gate (README "A wandering level under
 * Middle").
 */
export const WANDER_BEFORE = 60;

// Engine-only knobs for the gate (README "A calmer wander gate"): `margin` multiplies the log n the wander must win by
// (1 as shipped 2026-11-21); `jump` multiplies the log n penalty of the drift fit's jumps (2); with `test` set, a count
// change the drift fit has no jump near is still kept when forcing a drift jump at it lowers the drift cost by more
// than test x log n (the change's place is given by the count detector, so it pays less than a searched jump). With
// `before` (wanderFilter), whether the level wanders is decided on the window before the newest count change (when at
// least `before` points precede it), so the change itself, a real fall, cannot be what opens the gate. With `split`,
// it is decided on the whole window with a given jump at the newest count change (the two sides fitted apart).
export function wanderGate(values, { margin: mk = 1, jump: jk = 2, cut = null } = {}) {
  const n = values.length;
  if (n < 20) return { open: false, margin: null, jumps: [] };
  const y = Array.from(values, (v) => Math.log(Math.max(0, Number(v)) + 0.5));
  const r = [[], [], [], [], [], [], []];
  for (let i = 3; i < n - 3; i++) { let t = 0; for (let j = -3; j <= 3; j++) t += y[i + j]; r[i % 7].push(y[i] - t / 7); }
  const med = r.map((a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; });
  const m0 = med.reduce((t, v) => t + v, 0) / 7;
  const z0 = y.map((v, i) => v - (med[i % 7] - m0));
  // Steady growth is the growth term's job (trend 'gated'), not wander: both fits see the series less its robust slope,
  // the median of lag-n/4 differences over the lag, from pairs that do not straddle a jump of a first flat fit (a
  // one-step median is as noisy as the counts themselves, and a pair across a fall reads the fall as growth).
  const beta = jk * Math.log(n);
  const first = driftNoiseML(z0, { penalty: beta, grid: [0] });
  const seg = new Int32Array(n);
  for (const c of first.changepoints) for (let t = c; t < n; t++) seg[t]++;
  const L = Math.floor(n / 4), d = [];
  for (let t = 0; t + L < n; t++) if (seg[t] === seg[t + L]) d.push((z0[t + L] - z0[t]) / L);
  const g = d.length ? median(d) : 0;
  const z = z0.map((v, t) => v - g * t);
  const best = driftNoiseML(z, { penalty: beta });
  if (!(best.q > 0) || !(best.sigma > 0)) return { open: false, margin: null, jumps: best.changepoints ?? [] };
  let flatObj = driftNoiseML(z, { penalty: beta, grid: [0], sigma: best.sigma }).objective, bestObj = best.objective;
  if (cut != null && cut >= 20 && cut < n) {
    // A given jump at `cut` (the newest count change): both fits see the two sides apart, with the window's noise scale.
    flatObj = 0; bestObj = 0;
    for (const piece of [z.slice(0, cut), z.slice(cut)]) {
      const f = driftNoiseML(piece, { penalty: beta, grid: [0], sigma: best.sigma }).objective;
      flatObj += f;
      bestObj += piece.length >= 20 ? Math.min(f, driftNoiseML(piece, { penalty: beta, sigma: best.sigma }).objective) : f;
    }
  }
  const margin = flatObj - bestObj - mk * Math.log(n);
  return { open: margin > 0, margin, q: best.q, sigma: best.sigma, omega: best.omega, jumps: best.changepoints, z };
}

/** The drift cost of z cut at `cuts` (sorted window indices), as driftLevelChanges sums it (no penalty). */
function driftPartitionCost(z, cuts, sigma, omega) {
  const b = [0, ...cuts, z.length];
  let c = 0;
  for (let i = 0; i + 1 < b.length; i++) if (b[i + 1] > b[i]) c += driftSegmentCost(z.slice(b[i], b[i + 1]), { sigma, omega });
  return c;
}

function wanderFilter(found, values, { window, tolerance, margin, jump, test, before, split }) {
  const off = Math.max(0, values.length - window);
  if (before != null) {
    const last = Math.max(...found.map((c) => c.index));
    if (last - off >= before && !wanderGate(values.slice(off, last), { margin, jump }).open) return found;
  }
  const g = wanderGate(values.slice(off), { margin, jump });
  if (!g.open) return found;
  if (split && !wanderGate(values.slice(off), { margin, jump, cut: Math.max(...found.map((c) => c.index)) - off }).open) return found;
  const jumps = g.jumps.map((j) => j + off);
  const near = (c) => jumps.some((j) => Math.abs(j - c.index) <= tolerance);
  if (test == null) return found.filter(near);
  const n = g.z.length, base = driftPartitionCost(g.z, g.jumps, g.sigma, g.omega);
  return found.filter((c) => {
    if (near(c)) return true;
    const at = c.index - off;
    if (at < 2 || at > n - 2) return false;
    const cuts = [...g.jumps, at].sort((p, q) => p - q);
    return base - driftPartitionCost(g.z, cuts, g.sigma, g.omega) > test * Math.log(n);
  });
}

/** Points before a change that its spread is read from (README "Round 15"), and the fewest that make a reading. */
export const SPREAD_WINDOW = 60;
export const SPREAD_MIN_POINTS = 10;

/**
 * The spread of the series in the `w` points before index i: 1.4826 times the median absolute deviation from their
 * median (a robust standard deviation), or their standard deviation when the MAD is 0 (a quantized column). null when
 * fewer than SPREAD_MIN_POINTS points precede i or the points do not vary.
 */
export function spreadBefore(values, i, w = SPREAD_WINDOW) {
  const xs = values.slice(Math.max(0, i - w), Math.max(0, i)).map(Number);
  if (xs.length < SPREAD_MIN_POINTS) return null;
  const med = (a) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const m = med(xs);
  const mad = 1.4826 * med(xs.map((x) => Math.abs(x - m)));
  if (mad > 0) return mad;
  const mean = xs.reduce((t, x) => t + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((t, x) => t + (x - mean) ** 2, 0) / (xs.length - 1));
  return sd > 0 ? sd : null;
}

/** A change's move in units of the spread before it: |shift| / spreadBefore, or null when either is unknown. */
export function spreadRatio(values, c, w = SPREAD_WINDOW) {
  if (c.shift === undefined) return null;
  const s = spreadBefore(values, c.index, w);
  return s === null ? null : Math.abs(c.shift) / s;
}

/**
 * The spread-relative floor (option minSpreadRatio; README "Round 15", measured, not offered): drop a detection whose
 * move is under `k` times the column's own spread in the SPREAD_WINDOW points before it. One k serves every column, so
 * a column that wanders gets a higher floor in its own units than a flat one, with no labels and no per-column setting.
 * A detection whose ratio is unknown (no level each side, too little history, a constant stretch) is kept.
 */
export function aboveSpreadFloor(changes, values, k) {
  if (k == null || k === 0) return changes;
  if (!(typeof k === 'number' && k > 0 && Number.isFinite(k))) throw new Error('minSpreadRatio takes a number above 0.');
  return changes.filter((c) => { const r = spreadRatio(values, c); return r === null || r >= k; });
}

/** Points before a change that its largest recent move is read from, and the span of the means compared (README "Round 17"). */
export const MOVE_WINDOW = 60;
export const MOVE_SPAN = 12;

/**
 * The largest level move the series made in the `w` points before index i: the largest |mean of h points - mean of the
 * h points before them| over every split inside that stretch. A rolling, same-day reading of "how far does this column
 * move on its own": on white noise it is about 0.9 sd, on a drifting column it grows with the drift over h points.
 * null when fewer than 2h points precede i or the stretch never moves.
 */
export function largestMoveBefore(values, i, w = MOVE_WINDOW, h = MOVE_SPAN) {
  const xs = values.slice(Math.max(0, i - w), Math.max(0, i)).map(Number);
  if (xs.length < 2 * h) return null;
  const cum = [0];
  for (const x of xs) cum.push(cum[cum.length - 1] + x);
  let best = 0;
  for (let t = h; t + h <= xs.length; t++) best = Math.max(best, Math.abs((cum[t + h] - cum[t]) - (cum[t] - cum[t - h])) / h);
  return best > 0 ? best : null;
}

/** A change's move in units of the largest move before it: |shift| / largestMoveBefore, or null when either is unknown. */
export function moveRatio(values, c, w = MOVE_WINDOW, h = MOVE_SPAN) {
  if (c.shift === undefined) return null;
  const m = largestMoveBefore(values, c.index, w, h);
  return m === null ? null : Math.abs(c.shift) / m;
}

/**
 * The rolling move floor (option minMoveRatio; README "Round 17"): drop a detection whose move is under `k` times the
 * largest move its own column made in the MOVE_WINDOW points before it. Re-read at every change from the same run, so
 * a new day's level and wander reset it; nothing is read from another day. Unknown ratios are kept.
 */
export function aboveMoveFloor(changes, values, k) {
  if (k == null || k === 0) return changes;
  if (!(typeof k === 'number' && k > 0 && Number.isFinite(k))) throw new Error('minMoveRatio takes a number above 0.');
  return changes.filter((c) => { const r = moveRatio(values, c); return r === null || r >= k; });
}

/**
 * The smallest-move floor (option minShift, `watch.mjs --min-shift`; README "Round 14"): drop a detection whose level
 * moved by less than `floor` in the series' own units (|shift|, the move the alert message states). Applied at every
 * check before the guards, so a change too small at one check can clear the floor at a later one and is then sent.
 * A detection with no level on each side (none of the shipped detectors) is kept. 0, null or undefined: no floor.
 */
export function aboveFloor(changes, floor) {
  if (floor == null || floor === 0) return changes;
  if (!(typeof floor === 'number' && floor > 0 && Number.isFinite(floor))) throw new Error('minShift (--min-shift) takes a number above 0.');
  return changes.filter((c) => c.shift === undefined || Math.abs(c.shift) >= floor);
}

/** Both detectors' changes from one engine run: { pelt, bocpd }. */
export function detectBoth(values, labels, opts = {}) {
  const o = { ...WATCH_DEFAULTS, ...opts };
  const off = Math.max(0, values.length - o.window);
  const v = values.slice(off), l = labels.slice(off);
  const { confirm, tolerance, window, detector, alertHistory, ar1Detectors, rhoCap, holdHistory, persist, ...engine } = o;
  // With an AR(1) detector chosen and the plain lists not asked for, the plain engine run is skipped (half the time per check).
  const ar1Only = String(detector).startsWith('bocpd-ar1') && !o.ar1Detectors && (engine.model ?? 'mean') === 'mean';
  const map = (c) => ({
    index: c.index + off,
    label: c.label,
    ...(c.meanBefore !== undefined ? { meanBefore: c.meanBefore, meanAfter: c.meanAfter, shift: c.shift } : {}),
    ...(c.shiftInNoiseSd !== undefined ? { shiftInNoiseSd: c.shiftInNoiseSd } : {}),
    ...(c.sdBefore !== undefined ? { sdBefore: c.sdBefore, sdAfter: c.sdAfter } : {}),
    ...(c.probability !== undefined ? { probability: c.probability } : {}),
  });
  let out = {};
  if (!ar1Only) { const r = analyze({ ...engine, values: v, labels: l }); out = { pelt: r.pelt.changepoints.map(map), ...bayesLists(r, map, '') }; }
  // 'bocpd-ar1' / 'bocpd-ar1-window': the same Bayesian pass with the engine's AR(1) term (--ar1: rho from the
  // window, the conditional AR(1) likelihood in bocpd), for sticky noise. A second engine run, so only on request.
  if ((o.ar1Detectors || String(detector).startsWith('bocpd-ar1')) && (engine.model ?? 'mean') === 'mean') {
    Object.assign(out, bayesLists(analyze({ ...engine, values: v, labels: l, ar1: true, ...(rhoCap != null ? { ar1RhoCap: rhoCap } : {}) }), map, '-ar1'));
  }
  return out;
}

/** The drift detector's jumps in the newest `window` points, with the smoothed level on each side (meanBefore/After). */
export function detectDrift(values, labels, opts = {}) {
  const { window, log, penalty } = { ...WATCH_DEFAULTS, ...opts };
  if (opts.period > 1) throw new Error('The drift watch takes no seasonal period: leave the period out, or use another setting.');
  const off = Math.max(0, values.length - window);
  let v = values.slice(off);
  if (log) { if (v.some((x) => !(x > 0))) throw new Error('--log needs every value above zero.'); v = v.map(Math.log); }
  if (v.length < 10) return [];
  const r = driftLevel(v, { noise: 'ml', ...(typeof penalty === 'number' ? { penalty } : {}) });
  const back = (x) => (log ? Math.exp(x) : x);
  return r.changes.map((c) => ({
    index: c.index + off, label: labels[c.index + off],
    meanBefore: back(c.before), meanAfter: back(c.after), shift: back(c.after) - back(c.before),
    ...(Number.isFinite(c.jumpSd) ? { shiftInNoiseSd: c.jumpSd } : {}),
  }));
}

// The Bayesian detections of one engine run, with the levels on each side, as { bocpd<suffix>, bocpd<suffix>-window }.
function bayesLists(r, map, suffix) {
  const sd = r.noiseSd;
  const mean = (a, b) => { let t = 0; for (let i = a; i < b; i++) t += r.values[i]; return t / Math.max(1, b - a); };
  // A Bayesian detection carries only a probability; give it the levels on each side (from the previous
  // detection, or the window's start, to the next one or the end) so a message can say what moved.
  const withLevels = (list) => list.map((c, i) => {
    const a = i ? list[i - 1].index : 0, b = i + 1 < list.length ? list[i + 1].index : r.values.length;
    const meanBefore = mean(a, c.index), meanAfter = mean(c.index, b), shift = meanAfter - meanBefore;
    return { ...map(c), meanBefore, meanAfter, shift, ...(sd > 0 ? { shiftInNoiseSd: shift / sd } : {}) };
  });
  // The '-window' variant: the Bayesian probability summed over 5 neighbouring points, because on a clear step the
  // probability is often split between neighbours (a 3-sd step at 0.15, 0.03, 0.17, 0.36: no single point at 0.5).
  const cp = r.bocpd.changeProb, H = 2;
  const m = cp.map((_, i) => { let t = 0; for (let j = Math.max(0, i - H); j <= Math.min(cp.length - 1, i + H); j++) t += cp[j]; return Math.min(1, t); });
  const wdet = peaks(m, r.bocpd.threshold, 2 * H + 1).map((i) => {
    let best = i;
    for (let j = Math.max(1, i - H); j <= Math.min(cp.length - 1, i + H); j++) if (cp[j] > cp[best]) best = j;
    return { index: best, label: r.labels[best], probability: Math.round(m[i] * 1000) / 1000 };
  });
  return { [`bocpd${suffix}`]: withLevels(r.bocpd.detections), [`bocpd${suffix}-window`]: withLevels(wdet) };
}

// Where a previously alerted change sits in today's series: by its label when labels are unique
// (a rolling file that drops old rows keeps its dates), else by its stored index.
function locate(a, labelIndex) {
  if (labelIndex && a.label != null && labelIndex.has(a.label)) return labelIndex.get(a.label);
  return a.index;
}

/**
 * Compare today's changes with the state and decide what to report. Pure: returns
 * { alerts, pending, baseline, held, state, notes }. `changes` from detectChanges on the same series.
 * Two flicker guards (round 5, eval/watch-flicker.mjs):
 *   holdHistory (on by default since round 5): a change dated where the first check already had `confirm` points after it (history the
 *     baseline called quiet) is recorded as `held`, not alerted.
 *   persist (2 by default since round 7; 1 turns it off): 2 makes a change wait until a detection within `tolerance` of it was also present at the
 *     previous check (state.seen), so a detection that appears for one check and vanishes is never sent.
 */
export function advance(state, changes, n, labels, opts = {}) {
  const { confirm, tolerance, holdHistory, persist } = { ...WATCH_DEFAULTS, ...opts };
  const st = state && state.version === STATE_VERSION ? state : emptyState();
  const notes = [];
  if (st.n && n < st.n) notes.push(`The series is shorter than at the last check (${n} points, was ${st.n}): rows were removed or the file was replaced.`);
  const unique = new Set(labels).size === labels.length;
  const labelIndex = unique ? new Map(labels.map((x, i) => [String(x), i])) : null;
  if (st.lastLabel != null && labelIndex && !labelIndex.has(st.lastLabel)) notes.push(`The last label seen before (${st.lastLabel}) is no longer in the series: its history was rewritten.`);
  const known = st.alerted.map((a) => locate(a, labelIndex));
  const alerts = [], pending = [], baseline = [], held = [];
  // The first check of a file that already has history records the changes in it as the baseline
  // instead of alerting on each (opts.alertHistory reports them).
  const first = !st.n && !st.alerted.length && !opts.alertHistory;
  // The last row the first check had `confirm` points after: changes up to it are history the baseline saw.
  const quiet = first ? (n - confirm >= 0 ? { index: n - confirm, label: String(labels[n - confirm]) } : null) : st.quietUntil ?? null;
  const quietAt = !quiet ? -1 : labelIndex ? (labelIndex.has(quiet.label) ? labelIndex.get(quiet.label) : -1) : quiet.index;
  const seen = Array.isArray(st.seen) ? st.seen.map((a) => locate(a, labelIndex)) : [];
  for (const c of changes) {
    if (known.some((k) => Math.abs(k - c.index) <= tolerance)) continue;
    const after = n - c.index; // points from the change to the newest, inclusive
    if (after < confirm) { pending.push({ ...c, pointsAfter: after }); continue; }
    if (first) baseline.push({ ...c, pointsAfter: after });
    else if (holdHistory && c.index <= quietAt) held.push({ ...c, pointsAfter: after });
    // Only once there was a previous check: a first check with --alert-history has nothing to compare with.
    else if (persist > 1 && st.n && !seen.some((k) => Math.abs(k - c.index) <= tolerance)) { pending.push({ ...c, pointsAfter: after, unconfirmed: true }); continue; }
    else alerts.push({ ...c, pointsAfter: after, late: after > 2 * confirm + 1 });
    known.push(c.index);
  }
  const rec = (a, extra) => ({ index: a.index, label: String(a.label), reportedAtN: n, ...(a.shift !== undefined ? { shift: a.shift } : {}), ...extra });
  const next = {
    version: STATE_VERSION,
    alerted: [...st.alerted, ...baseline.map((a) => rec(a, { baseline: true })), ...held.map((a) => rec(a, { held: true })), ...alerts.map((a) => rec(a, {}))],
    n,
    lastLabel: labels.length ? String(labels[labels.length - 1]) : null,
    ...(quiet ? { quietUntil: quiet } : {}),
    ...(persist > 1 ? { seen: changes.map((c) => ({ index: c.index, label: String(c.label) })) } : {}),
    // The setting `--detector auto` picked at the first check (watch.mjs), kept so later checks use the same one.
    ...(st.choice ? { choice: st.choice } : {}),
  };
  return { alerts, pending, baseline, held, state: next, notes };
}

const fmt = (v) => (Math.abs(v) >= 100 ? String(Math.round(v * 10) / 10) : String(Number(v.toPrecision(3))));

export function alertText(res, { column = 'the series', model = 'mean' } = {}) {
  const lines = [];
  for (const a of res.alerts) {
    let what = `${column} changed from ${a.label}`;
    if (a.meanBefore !== undefined) {
      const dir = a.shift > 0 ? 'up' : 'down';
      what += `: ${model === 'poisson' ? 'rate' : 'level'} ${dir} from ${fmt(a.meanBefore)} to ${fmt(a.meanAfter)}`;
      if (a.shiftInNoiseSd !== undefined) what += ` (${fmt(Math.abs(a.shiftInNoiseSd))} noise sd)`;
      if (a.sdBefore !== undefined && model === 'meanvar') what += `, sd ${fmt(a.sdBefore)} to ${fmt(a.sdAfter)}`;
    }
    if (a.probability !== undefined) what += `, Bayesian probability ${Math.round(a.probability * 100)}%`;
    what += `; ${a.pointsAfter} points since${a.late ? ' (dated well back: it took more data to show)' : ''}.`;
    lines.push(what);
  }
  return lines.join('\n');
}

export function statusText(res, opts = {}) {
  const lines = [];
  if (res.alerts.length) lines.push(`New change${res.alerts.length > 1 ? 's' : ''}:`, alertText(res, opts).split('\n').map((l) => `  ${l}`).join('\n'));
  else if (res.baseline && res.baseline.length) lines.push(`First check: ${res.baseline.length} change${res.baseline.length > 1 ? 's' : ''} already in the history, recorded as the baseline, not alerted (${res.baseline.map((b) => b.label).join(', ')}).`);
  else lines.push('No new confirmed change.');
  for (const p of res.pending) lines.push(p.unconfirmed
    ? `Watching: a possible change from ${p.label}, found at this check for the first time; reported if the next check finds it too.`
    : `Watching: a possible change from ${p.label}, ${p.pointsAfter} point${p.pointsAfter === 1 ? '' : 's'} after it so far (reported at ${opts.confirm ?? WATCH_DEFAULTS.confirm}).`);
  for (const h of res.held ?? []) lines.push(`Held, not alerted: a change from ${h.label}, dated inside the history the first check called quiet.`);
  for (const n of res.notes) lines.push(`Note: ${n}`);
  lines.push(`Changes on record: ${res.state.alerted.length}. Points: ${res.state.n}.`);
  return lines.join('\n');
}

/** One body that Slack, Mattermost and Teams incoming webhooks read as `text` and Discord as `content`. */
export function webhookBody(text) {
  return { text, content: text.length > 1990 ? text.slice(0, 1987) + '...' : text };
}

/** Every change on record in a state, oldest first, as "label (up 1.2)" lines; baseline ones marked. */
export function recordText(state) {
  const a = state && Array.isArray(state.alerted) ? state.alerted : [];
  if (!a.length) return 'No changes on record yet.';
  return a.map((c) => {
    let s = `${c.label}`;
    if (c.shift !== undefined) s += `: ${c.shift > 0 ? 'up' : 'down'} ${fmt(Math.abs(c.shift))}`;
    s += c.baseline ? ' (in the history at the first check)' : c.held ? ` (found at point ${c.reportedAtN}, dated inside the history the first check saw; not alerted)` : ` (reported at point ${c.reportedAtN})`;
    return s;
  }).join('\n');
}

/**
 * One check of a growing series, from CSV text and the state the previous check returned (or none).
 * Returns { column, n, alerts, pending, baseline, notes, state, text }; keep `state` for the next check.
 * The page keeps it in the browser; an agent keeps it wherever it keeps notes. Options as the CLI's:
 * column, labelColumn, model (mean | meanvar | poisson), detector, penalty, period, log, confirm,
 * tolerance, window, rhoCap, alertHistory.
 */
export function watchCheck({ csv, state = null, column = null, labelColumn = null, alertHistory = false, ...opts } = {}) {
  if (typeof csv !== 'string' || !csv.trim()) throw new Error('Give the series as CSV text (csv).');
  const model = opts.model ?? 'mean';
  if (!['mean', 'meanvar', 'poisson'].includes(model)) throw new Error('The watch takes model mean, meanvar or poisson.');
  if (opts.detector != null && !DETECTORS.includes(opts.detector)) throw new Error(`detector takes ${DETECTORS.join(', ')}.`);
  const parsed = parseSeries(csv, column ?? null, labelColumn ?? null);
  const { labels, values } = parsed;
  if (values.length < 4) throw new Error(`Need at least 4 numbers; got ${values.length}.`);
  const clean = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const changes = detectChanges(values, labels, clean);
  const res = advance(state, changes, values.length, labels, { ...clean, alertHistory });
  const text = statusText(res, { column: parsed.column, model, confirm: clean.confirm });
  return { column: parsed.column, n: values.length, ...res, text };
}

/**
 * Work one replay may do, in (points refit)^2 summed over its checks: each check refits the newest
 * `window` points, and the Bayesian pass costs about the square of that (175 ms for 1,000 points on
 * one 2026 cloud core). 3e7 is about 5 s there: a 500-point series is checked every 2 points, 1,000
 * points every 11, a 2,000-point series every 30 or so.
 */
export const REPLAY_BUDGET = 3e7;

/**
 * Replay the watch over a finished series, as if it had run after each new point, and return what it
 * would have sent and when. The question a person asks before setting a watch up: "on my own history,
 * how often would this have pinged me, and how late?" values: numbers, oldest first; labels: dates or
 * row names (default 1..n). opts: the watch options (model, detector, confirm, tolerance, window,
 * penalty, period, log, rhoCap) plus from (the number of points at the first check; default 20% of the
 * series, at least 20, as in eval/watch-replay.mjs), step (points between checks; default 1, raised to
 * keep within budget, default REPLAY_BUDGET). With step above 1, a check that finds an alert is
 * bisected back to the first point whose arrival sends it, so each alert's date and delay are those of
 * a watch run after every point (assuming an alert, once due, stays due: true in every test here); a
 * detection that showed and vanished between two checks is not seen, so false alerts can be undercounted.
 * The first check records the changes already in the history as the baseline, as a real first run does.
 * Returns { n, from, step, checks, settings, baseline, alerts, pending }; each alert carries the change
 * (index, label, levels each side when known), reportedAt / reportedAtLabel (the point whose arrival
 * sent it) and pointsAfter, its delay in points.
 */
export function replayWatch(values, labels = null, opts = {}) {
  if (!Array.isArray(values)) throw new Error('values must be an array of numbers.');
  const v = values.map(Number);
  if (v.some((x) => !Number.isFinite(x))) throw new Error('values must all be numbers.');
  const n = v.length;
  if (n < 10) throw new Error(`A replay needs at least 10 points; got ${n}.`);
  const l = (labels && labels.length === n ? labels : v.map((_, i) => i + 1)).map(String);
  const { from: from0, step: step0, budget: budget0, alertHistory: _h, ...rest } = withCountDefaults(opts);
  const model = rest.model ?? 'mean';
  const settings = { ...WATCH_DEFAULTS, ...rest, model, detector: rest.detector ?? defaultDetector(model) };
  if (!DETECTORS.includes(settings.detector)) throw new Error(`detector takes ${DETECTORS.join(', ')}.`);
  const from = Math.min(n, Math.max(4, Math.round(from0 ?? Math.max(Math.min(20, n), Math.floor(0.2 * n)))));
  const budget = budget0 ?? REPLAY_BUDGET;
  const endsFor = (s) => { const e = []; for (let x = from; x <= n; x += s) e.push(x); if (e[e.length - 1] !== n) e.push(n); return e; };
  const cost = (e) => e.reduce((t, x) => t + Math.min(x, settings.window) ** 2, 0) * (settings.persist > 1 && e.length > 1 && e[1] - e[0] > 1 ? 2 : 1);
  let step = Math.max(1, Math.round(step0 ?? 1));
  while (step < n && cost(endsFor(step)) > budget) step = Math.max(step + 1, Math.ceil(step * 1.25));
  const { confirm, tolerance, holdHistory, persist, ...detOpts } = settings;
  const pol = { confirm, tolerance, holdHistory: !!holdHistory, persist: persist > 1 ? persist : 1 };
  let state = emptyState(), baseline = [], pending = [], checks = 0;
  const alerts = [], held = [];
  const det = (end) => detectChanges(v.slice(0, end), l.slice(0, end), detOpts);
  const check = (end) => {
    checks++;
    const ls = l.slice(0, end);
    // With persist, a check needs the detections one point earlier, as a watch run after every point would have
    // seen them; a coarse or bisected check computes them (one more engine run).
    let st = state;
    if (persist > 1 && state.n && state.n !== end - 1) { checks++; st = { ...state, seen: det(end - 1).map((c) => ({ index: c.index, label: String(c.label) })) }; }
    return advance(st, det(end), end, ls, pol);
  };
  const commit = (r, end) => {
    if (end === from) baseline = r.baseline;
    for (const a of r.alerts) alerts.push({ ...a, reportedAt: end - 1, reportedAtLabel: l[end - 1] });
    for (const a of r.held) held.push({ ...a, reportedAt: end - 1, reportedAtLabel: l[end - 1] });
    pending = r.pending;
    state = r.state;
  };
  let prev = from - 1;
  for (const end of endsFor(step)) {
    for (;;) {
      const r = check(end);
      if (!r.alerts.length || end - prev <= 1) { commit(r, end); break; }
      // Bisect for the first point in (prev, end] whose arrival sends an alert.
      let lo = prev + 1, hi = end, best = r;
      while (lo < hi) { const mid = Math.floor((lo + hi) / 2); const m = check(mid); if (m.alerts.length) { hi = mid; best = m; } else lo = mid + 1; }
      commit(best, hi);
      prev = hi;
      if (hi === end) break;
    }
    prev = end;
  }
  return { n, from, step, checks, settings, baseline, alerts, pending, held };
}

/** Plain sentences for a replay, for the page and an agent's answer. */
export function replayText(res, { column = 'the series', model = 'mean' } = {}) {
  const lines = [];
  const every = res.step > 1 ? `every ${res.step} points, each alert dated back to the point that would have sent it` : 'after each new point';
  lines.push(`Replayed as a watch started at point ${res.from} of ${res.n} and run ${every} (${res.checks} checks).`);
  if (res.baseline.length) lines.push(`Already in the history at the start, recorded and not alerted: ${res.baseline.map((b) => b.label).join(', ')}.`);
  if (res.held && res.held.length) lines.push(`Found later but dated inside that history, so held and not alerted: ${res.held.map((h) => `${h.label} (found on ${h.reportedAtLabel})`).join(', ')}.`);
  if (!res.alerts.length) lines.push('It would have sent no alert.');
  else {
    lines.push(`It would have sent ${res.alerts.length} alert${res.alerts.length > 1 ? 's' : ''}:`);
    const body = alertText({ alerts: res.alerts }, { column, model }).split('\n');
    res.alerts.forEach((a, i) => lines.push(`  on ${a.reportedAtLabel}: ${body[i]}`));
  }
  for (const p of res.pending) lines.push(`Still watching at the end: a possible change from ${p.label}, ${p.pointsAfter} point${p.pointsAfter === 1 ? '' : 's'} after it (reported at ${res.settings.confirm}).`);
  return lines.join('\n');
}

/** The page's three "How eager" settings, quietest first. For the volatility and counts models the quiet default is
 * already `bocpd`, so those models have two settings. "Wandering level" (drift) is not on this ladder: round 9
 * (eval/watch-hint-drift.mjs, pre-registered) put it between middle and eager and the hint reached 15 of 31 future marks
 * against 17, because drift is quietest on flat series (it absorbs modest steps as wander) and the rule read that as room
 * to be more eager. The rule assumes nested settings; drift is a different model (README "Round 9"). */
export function eagerSettings(model = 'mean', opts = {}) {
  // Counts with no clumping cost or threshold named: the count default is Quiet, then pelt (README "The How eager hint
  // for counts", eval/watch-eagerness-counts.prereg.md). bocpd is not between them: on unclumped counts it is quieter
  // than the count default, on clumped ones noisier, so it is not a step up in eagerness.
  // Since 2026-11-21 (eval/gsc-middle.prereg.md, stage C) PELT with the negative-binomial cost is Middle between them:
  // on 2,200 fresh simulated shops 49 more of 1,200 steps heard (36 to 62) for 0.37 more false alerts per 1,000 checks.
  if (model === 'poisson' && opts.overdispersion == null && opts.threshold == null) return [{ key: 'quiet', ...COUNT_DEFAULTS }, { key: 'middle', ...COUNT_MIDDLE }, { key: 'eager', detector: 'pelt' }];
  const q = defaultDetector(model);
  return [{ key: 'quiet', detector: q }, ...(q === 'bocpd' ? [] : [{ key: 'middle', detector: 'bocpd' }]), { key: 'eager', detector: 'pelt' }];
}

/**
 * Replay the person's own history once per "How eager" setting and report, for each, the alerts it would have sent,
 * the daily checks after the baseline, alerts per 100 of them and the median delay (README "Round 6"). opts: as replayWatch (detector
 * is ignored). Each replay keeps its own work budget, so a long series takes up to three times one replay.
 * suggest: the most eager setting whose rate is at most `budget` alerts per 100 checks (default HINT_BUDGET, 2),
 * else quiet; the rule round 6 pre-registered and passed, narrowly, on TCPD (eval/watch-eagerness.out.txt).
 * Returns { n, from, model, budget, suggest, settings: [{ key, detector, alerts, checks, step, per100, medianDelay }] }.
 */
export function eagernessReplay(values, labels = null, opts = {}) {
  const { detector: _d, budget: b0, keepAlerts = false, ladder = null, ...rest } = opts;
  const budget = b0 ?? HINT_BUDGET;
  const model = rest.model ?? 'mean';
  let n = 0, from = 0;
  const v = values.map(Number);
  // ladder: [{ key, detector, ...options }] to replay instead of eagerSettings(model) (the eval scripts compare ladders).
  const settings = (ladder ?? eagerSettings(model, rest)).map(({ key, detector, ...extra }) => {
    const r = replayWatch(values, labels, { ...rest, ...extra, detector });
    n = r.n; from = r.from;
    const d = r.alerts.map((a) => a.pointsAfter).sort((x, y) => x - y), m = d.length >> 1;
    // Per daily check after the baseline (n - from), as a watch run after every row would count them, not the
    // replay's own coarse and bisection checks.
    const daily = r.n - r.from;
    const weekly = rest.period > 1 ? null : weekdayBunching(r.alerts.map((a) => a.label), labels, { values: v });
    return { key, detector, ...extra, alerts: r.alerts.length, checks: daily, step: r.step, per100: daily ? (100 * r.alerts.length) / daily : 0, medianDelay: d.length ? (d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2) : null, ...(weekly ? { weekly } : {}), ...(keepAlerts ? { alertLabels: r.alerts.map((a) => a.label) } : {}) };
  });
  return { n, from, model, budget, suggest: suggestFor(settings, budget, n), settings };
}

/**
 * The round 6 rule on settings already replayed: the most eager one whose rate is at most `budget` alerts per 100
 * checks, else quiet. The page uses it to re-pick when the person changes the budget, without replaying again.
 * Given `n`, a history under AUTO_MIN_POINTS keeps quiet, as `--detector auto` does (round 6 skipped those series).
 */
export function suggestFor(settings, budget = HINT_BUDGET, n = Infinity) {
  if (n < AUTO_MIN_POINTS) return 'quiet';
  return [...settings].reverse().find((x) => x.per100 <= budget)?.key ?? 'quiet';
}

/** Round 6's pre-registered alert budget for the eagerness suggestion: alerts per 100 daily checks. */
export const HINT_BUDGET = 2;

const EAGER_NAMES = { quiet: 'Quiet', middle: 'Middle', eager: 'Eager' };
const eagerName = (k) => (Object.hasOwn(EAGER_NAMES, k) ? EAGER_NAMES[k] : String(k));

/** Plain sentences for an eagerness replay, for the page and an agent's answer. */
export function eagernessText(res, { column = 'the series', every = 'day' } = {}) {
  const lines = [`On the history of ${column} (a watch started at point ${res.from} of ${res.n}, then ${res.n - res.from} daily checks):`];
  for (const s of res.settings) lines.push(`  ${eagerName(s.key)} (${settingWords(s)}): ${s.alerts} alert${s.alerts === 1 ? '' : 's'}, ${s.per100.toFixed(1)} per 100 checks${s.medianDelay !== null ? `, median ${s.medianDelay} rows late` : ''}.`);
  const fb = Number(Number(res.budget).toPrecision(3));
  const pick = res.settings.find((s) => s.key === res.suggest);
  lines.push(res.n < AUTO_MIN_POINTS
    ? `Suggested: Quiet. ${res.n} points is under the ${AUTO_MIN_POINTS} the suggestion was tested on, too short a history to choose from.`
    : res.suggest === 'quiet'
    ? (pick.per100 > res.budget
      ? (res.budget < HINT_BUDGET
        ? `Suggested: Quiet, the least eager setting. Even Quiet would have sent ${pick.per100.toFixed(1)} alerts per 100 checks on this history, above your ${fb}.`
        : `Suggested: Quiet. Even Quiet would have sent ${pick.per100.toFixed(1)} alerts per 100 checks, above ${fb}; a level that wanders all the time keeps alerting, so consider watching its daily change instead.`)
      : `Suggested: Quiet. The more eager settings would have sent more than ${fb} alerts per 100 checks on this history.`)
    : `Suggested: ${eagerName(res.suggest)}, the most eager setting that stayed at or under ${fb} alerts per 100 checks on this history.`);
  lines.push(`Budget: ${fb} alert${fb === 1 ? '' : 's'} per 100 checks, ${plainBudgetText(res.budget, every)}.`);
  if (res.model === 'poisson' && res.settings[0]?.overdispersion === 'nb') lines.push('For counts (README "A middle setting for over-dispersed counts", pre-registered): on 2,200 fresh simulated shops this hint sent 2.37 false alerts per 1,000 checks and heard 1,131 of 1,200 steps; staying on Quiet (no hint) sent 0.72 and heard 1,056, and Middle alone sent 1.53 and heard 1,140, so on counts that bunch or swing beyond Poisson, Middle is a good place to start. Since 2026-11-21 Middle allows for steady growth: on simulated sites growing 30% over 240 days it alerted on 6 of 40 against Quiet\'s 2 and the old flat Middle\'s 27; on a level that wanders at random it still alerts on the wander (20 of 40 at a 1% daily walk; README "The joint growth fit, gated").');
  lines.push('A suggestion from one past, not a promise: on 23 labelled series it reached 17 of 31 later marked changes against the default\'s 16, at 17.5 alerts per 1,000 checks against 15.7 (replayed with the shipped persist 2), and on 6 held-out series it changed nothing. On a second labelled set it was not confirmed: on 47 server, traffic, ad and Twitter series from the Numenta Anomaly Benchmark, watched hourly, it reached 49 of 61 later anomaly windows against the default\'s 50 (README "Round 10"). Nor on a third: on 33 fault runs of a water-pump testbed (SKAB, all 8 sensors watched), picked from a normal run, it reached 118 of 123 marked changes against the default\'s 97, but only 28.4% of its alerts sat at a marked change against the default\'s 36.8%, at 163 alerts per 1,000 checks against 69 (README "Round 12").'
    + (Math.abs(res.budget - HINT_BUDGET) > 1e-9 ? ` Those numbers are for the tested budget of ${HINT_BUDGET} per 100 (${plainBudgetText(HINT_BUDGET)}); at about 1 a month the same series reached 19 of 31 at 19.3 per 1,000, at about 1 a week 29 of 31 at 74.0 per 1,000.` : ''));
  const wk = res.settings.find((s) => s.key === res.suggest)?.weekly ?? res.settings.find((s) => s.weekly)?.weekly;
  if (wk) lines.push(weeklyText(wk));
  return lines.join('\n');
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayNumber = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? Date.parse(`${s}T00:00:00Z`) / 864e5 : NaN);

/**
 * Weekdays a business does not open: on labels that are consecutive calendar days, the weekdays whose value is 0 on
 * each of their last `recent` occurrences (default 8; round 2, eval/shut-weekday.prereg.md), or on every occurrence
 * with `recent: 0` (round 1, which a single trading Saturday in the first week defeated), with at least `minWeeks`
 * occurrences. Returns their names, or [] (labels not daily, too short, no such weekday, or every weekday zero).
 */
export function shutWeekdays(values, labels, { minWeeks = 4, recent = 8 } = {}) {
  if (!labels || labels.length < 7 * minWeeks || labels.length !== values.length) return [];
  const d0 = dayNumber(labels[0]), d1 = dayNumber(labels[1]), dn = dayNumber(labels[labels.length - 1]);
  if (!Number.isFinite(d0) || d1 - d0 !== 1 || dn - d0 !== labels.length - 1) return [];
  const seen = new Array(7).fill(0), open = new Array(7).fill(false);
  for (let i = values.length - 1; i >= 0; i--) {
    const w = ((d0 + i + 4) % 7 + 7) % 7; // 1970-01-01 was a Thursday
    if (recent > 0 && seen[w] >= recent) continue;
    seen[w]++;
    if (Number(values[i]) !== 0) open[w] = true;
  }
  const out = [];
  for (let w = 0; w < 7; w++) if (seen[w] >= minWeeks && !open[w]) out.push(WEEKDAYS[w]);
  return out.length === 7 ? [] : out;
}

/**
 * Leave out the rows of the weekdays a business never opens (shutWeekdays) before a level model reads the series, so a
 * week's built-in zero is neither noise nor a step (README "A shop shut one weekday: revenue's slow climb"). Labels stay
 * the dates of the rows kept, so alerts and the state file name the same days. Every-week zeros only: a closure on a
 * weekday the shop usually opens (a bank holiday) is kept, and is `--closed`'s job. Returns { values, labels, dropped }.
 */
export function dropShutWeekdays(values, labels, opts = {}) {
  const days = shutWeekdays(values, labels, opts);
  if (!days.length) return { values, labels, dropped: [] };
  const keep = labels.map((l) => !days.includes(WEEKDAYS[((dayNumber(l) + 4) % 7 + 7) % 7]));
  return { values: values.filter((_, i) => keep[i]), labels: labels.filter((_, i) => keep[i]), dropped: days };
}

/** P(X >= k) for X ~ Binomial(n, p), summed in log space (n is an alert count, small). */
function binomialTail(k, n, p) {
  let lc = 0, t = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) lc += Math.log((n - i + 1) / i);
    if (i >= k) t += Math.exp(lc + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, t);
}

/**
 * Do a replay's alerts bunch on two neighbouring weekdays? On a daily series with a weekly cycle (a shop closed one day a
 * week, a weekend dip) every week's low day reads as a step down and the next day as a step back, so the alerts fall on
 * the same days week after week: on the UCI Online Retail shop (closed Saturdays) all 37 of Quiet's order alerts in 300
 * days were dated Sunday or Monday, and --period 7 cut them to 4 (README "A real shop's daily series"). The test: the
 * most-hit pair of adjacent weekdays against Binomial(n, 2/7), Bonferroni over the 7 pairs, at 1%, with 6 alerts or more,
 * and (given `values`) a weekday effect in the history itself at 0.1% (weekdayEffect).
 * Only for labels that are consecutive calendar days (YYYY-MM-DD, one row per day); otherwise null.
 */
export function weekdayBunching(alertLabels, labels, { alpha = 0.01, minAlerts = 6, values = null, dataAlpha = 0.001 } = {}) {
  if (!labels || labels.length < 15 || alertLabels.length < minAlerts) return null;
  const d0 = dayNumber(labels[0]), d1 = dayNumber(labels[1]), dn = dayNumber(labels[labels.length - 1]);
  if (!Number.isFinite(d0) || d1 - d0 !== 1 || dn - d0 !== labels.length - 1) return null;
  const counts = new Array(7).fill(0);
  for (const l of alertLabels) {
    const x = dayNumber(l);
    if (!Number.isFinite(x)) return null;
    counts[((x + 4) % 7 + 7) % 7]++; // 1970-01-01 was a Thursday
  }
  let best = 0;
  for (let i = 1; i < 7; i++) if (counts[i] + counts[(i + 1) % 7] > counts[best] + counts[(best + 1) % 7]) best = i;
  const k = counts[best] + counts[(best + 1) % 7], n = alertLabels.length;
  const p = Math.min(1, 7 * binomialTail(k, n, 2 / 7));
  if (!(p < alpha)) return null;
  // Alerts on a busy series come about a week apart (confirm 5, tolerance 5), so their weekdays bunch on noise too
  // (eval/weekday-bunching.out.txt: 4 of 60 null replays at 1%). The history itself must also show a weekday effect.
  const data = values ? weekdayEffect(values, d0) : null;
  if (values && !(data && data.p < dataAlpha)) return null;
  return { alerts: n, onPair: k, days: [WEEKDAYS[best], WEEKDAYS[(best + 1) % 7]], p, ...(data ? { dataP: data.p } : {}) };
}

/**
 * A weekday effect in a daily series: each point less its centred 7-day mean (which removes a level that wanders, and
 * averages a weekly pattern out), ranked, and the ranks compared across the 7 weekdays (Kruskal-Wallis, chi-square
 * with 6 degrees of freedom; ties take mid-ranks). d0: the day number of values[0]. Returns { h, p }.
 */
export function weekdayEffect(values, d0) {
  const x = values.map(Number), r = [];
  for (let i = 3; i + 3 < x.length; i++) {
    let s = 0;
    for (let j = i - 3; j <= i + 3; j++) s += x[j];
    if (Number.isFinite(s)) r.push({ e: x[i] - s / 7, w: ((d0 + i + 4) % 7 + 7) % 7 });
  }
  const N = r.length;
  if (N < 21) return null;
  const order = r.map((_, i) => i).sort((a, b) => r[a].e - r[b].e), rank = new Array(N);
  for (let i = 0; i < N;) { let j = i; while (j + 1 < N && r[order[j + 1]].e === r[order[i]].e) j++; for (let t = i; t <= j; t++) rank[order[t]] = (i + j) / 2 + 1; i = j + 1; }
  const sum = new Array(7).fill(0), cnt = new Array(7).fill(0);
  r.forEach((q, i) => { sum[q.w] += rank[i]; cnt[q.w]++; });
  let h = 0;
  for (let w = 0; w < 7; w++) if (cnt[w]) h += sum[w] ** 2 / cnt[w];
  h = (12 / (N * (N + 1))) * h - 3 * (N + 1);
  const y = h / 2; // chi-square, 6 degrees of freedom: P(X > h) = e^-y (1 + y + y^2/2)
  return { h, p: Math.min(1, Math.exp(-y) * (1 + y + (y * y) / 2)) };
}

/** One plain sentence for weekdayBunching's result. */
export function weeklyText(w) {
  return `Weekly cycle: ${w.onPair} of these ${w.alerts} alerts are dated on a ${w.days[0]} or ${w.days[1]} (p ${w.p < 1e-4 ? '< 0.0001' : w.p.toFixed(4)} if alerts fell on any day alike), so the watch is reading a weekly pattern (a closed day, a weekend dip) as a new level each week. Replay with --period 7. On a real online shop closed on Saturdays it cut Quiet's order alerts from 37 to 4 in 300 days; one-day closures such as bank holidays still alerted (README "A real shop's daily series").`;
}

// A budget in plain terms (README "The hint in the CLI watch"). Days per period and per check; a month is a twelfth
// of a 365.25-day year, so "1 alert a month at a daily check" is 100 / 30.44 = 3.29 per 100 checks.
const DAYS_PER = { week: 7, month: 365.25 / 12, year: 365.25 };
const DAYS_PER_CHECK = { hour: 1 / 24, day: 1, week: 7 };
const EVERY_WORD = { hour: 'an hourly', day: 'a daily', week: 'a weekly' };
const EVERY_ADJ = { hour: 'hourly', day: 'daily', week: 'weekly' };

/** Alerts per 100 checks from "about `alerts` alerts a `per` (week | month | year), checked every `every` (hour | day | week)". */
export function budgetFromPlain({ alerts, per = 'month', every = 'day' } = {}) {
  const a = Number(alerts);
  if (!(a >= 0) || !Number.isFinite(a)) throw new Error('alerts takes a number of 0 or more.');
  if (!Object.hasOwn(DAYS_PER, per)) throw new Error('per takes week, month or year.');
  if (!Object.hasOwn(DAYS_PER_CHECK, every)) throw new Error('every takes hour, day or week.');
  const checks = DAYS_PER[per] / DAYS_PER_CHECK[every];
  if (checks < 1) throw new Error(`${EVERY_WORD[every][0].toUpperCase()}${EVERY_WORD[every].slice(1)} check runs less than once a ${per}; give a longer period.`);
  if (a > checks) throw new Error(`That is more than one alert per check (${+checks.toPrecision(3)} ${EVERY_ADJ[every]} checks a ${per}); give at most ${Math.floor(checks)}.`);
  return (100 * a) / checks;
}

/** The same budget back in plain words, e.g. "about 0.6 alerts a month at a daily check". */
export function plainBudgetText(budget, every = 'day') {
  if (!Object.hasOwn(DAYS_PER_CHECK, every)) every = 'day';
  const perMonth = (budget / 100) * (DAYS_PER.month / DAYS_PER_CHECK[every]);
  const [x, unit] = perMonth >= 0.95 ? [perMonth, 'a month'] : [perMonth * 12, 'a year'];
  const r = x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
  return `about ${r} alert${r === 1 ? '' : 's'} ${unit} at ${EVERY_WORD[every]} check`;
}

/**
 * The detector options a stored `choice` (or a replayed setting) stands for: the detector, and for the count default
 * its cost and threshold. A choice stored before the count ladder (only a detector) gives that detector alone, so a
 * watch that picked `bocpd` keeps running plain `bocpd`.
 */
export function choiceOptions(c) {
  if (!c || !DETECTORS.includes(c.detector)) return null;
  return { detector: c.detector, ...(c.overdispersion != null ? { overdispersion: c.overdispersion } : {}), ...(c.threshold != null ? { threshold: c.threshold } : {}), ...(c.trend != null ? { trend: c.trend } : {}), ...(c.wander != null ? { wander: c.wander } : {}) };
}

/** Plain words for a setting: its detector, and the count default's cost and threshold when it has them. */
export function settingWords(s) {
  const nb = s.overdispersion === 'nb' ? ', negative-binomial cost' : s.overdispersion ? ', clumping-corrected cost' : '';
  const tr = s.trend === 'gated' ? ', growth term when it earns its place' : s.trend === 'robust' ? ', robust growth term' : '';
  const wa = s.wander === 'gated' ? ', wandering level allowed for' : '';
  return `${s.detector}${nb}${tr}${wa}${s.threshold != null ? `, alert threshold ${s.threshold}` : ''}`;
}

/** Below this many points the history is too short to choose from (round 6 skipped series with fewer than 30). */
export const AUTO_MIN_POINTS = 30;

/**
 * `--detector auto`: pick the "How eager" setting at the first check from the history, by the round 6 rule, and
 * return { detector, key, budget, n, per100, reason }. Under AUTO_MIN_POINTS points it keeps the quiet default.
 * opts: the watch options (model, penalty, period, log, rhoCap, confirm, tolerance, window) plus budget.
 */
export function chooseDetector(values, labels = null, opts = {}) {
  const model = opts.model ?? 'mean';
  const budget = opts.budget ?? HINT_BUDGET;
  const fb = Number(Number(budget).toPrecision(3));
  if (values.length < AUTO_MIN_POINTS) {
    const { key: _k, ...quiet } = eagerSettings(model, opts)[0];
    return { ...quiet, key: 'quiet', budget, n: values.length, per100: null, reason: `under ${AUTO_MIN_POINTS} points of history, so the quiet default` };
  }
  const { detector: _d, ...rest } = opts;
  const r = eagernessReplay(values, labels, { ...rest, budget });
  const pick = r.settings.find((s) => s.key === r.suggest);
  return { ...choiceOptions(pick), key: pick.key, budget, n: values.length, per100: Math.round(pick.per100 * 100) / 100, reason: r.suggest === 'quiet' && pick.per100 > budget
    ? `even Quiet sent more than ${fb} alerts per 100 checks on the history, so Quiet`
    : `the most eager setting at or under ${fb} alerts per 100 checks on the history`, replay: r };
}

/**
 * Agreement across columns (Round 13, eval/watch-skab-agree.mjs): turn several columns' alert lines into whole-watch
 * alerts that need `k` distinct columns to agree. lines: [{ column, index, at }] (the change's point and the point whose
 * arrival sent the line). Taken in the order they were sent, a line becomes a whole-watch alert when, counting it and
 * every line sent at or before it whose change lies within `within` points of its change, at least `k` distinct
 * columns have alerted, and no whole-watch alert was already sent for a change within `within` points of it. With
 * k = 1 this only merges near-simultaneous lines into one message, the like-for-like baseline. Returns
 * [{ index, at, columns }] in the order sent.
 */
export function agreeAlerts(lines, k = 2, within = 12) {
  if (!Number.isInteger(k) || k < 1) throw new Error('agreement takes a whole number of columns, 1 or more.');
  const order = [...lines].sort((a, b) => a.at - b.at || a.index - b.index);
  const seen = [], sent = [];
  for (const l of order) {
    seen.push(l);
    if (sent.some((s) => Math.abs(s.index - l.index) <= within)) continue;
    const cols = new Set(seen.filter((x) => Math.abs(x.index - l.index) <= within).map((x) => x.column));
    if (cols.size >= k) sent.push({ index: l.index, at: l.at, columns: [...cols] });
  }
  return sent;
}

/**
 * Closed days (a bank holiday, a Christmas closure) filled before any detector sees them, so a zero on a closed weekday
 * is not read as a step down and back. Round 1 (lags 4, eval/closed-days.prereg.md) failed its bars and was not offered
 * (README "Closed days filled as missing"); round 2 (lags 1, eval/closed-steps.prereg.md) passed S1-S3 on fresh seeds
 * and is what `watch.mjs --closed` uses (README "Steps beside a closure").
 * Each listed label of the series takes the median of the open values at i-L, i-2L, ... (up to the 4 nearest), where
 * L is `period` if given, else 7 when the labels are consecutive calendar days, else 1; with none of those, the nearest
 * open value before i, else after it. Only earlier points feed a fill (but for a closure at the very start), so filling
 * a whole history once equals filling each prefix and a replay stays honest. `round` rounds the fills (counts).
 * `lags` (default 4) is how many earlier same-phase open values the median takes (README "Steps beside a closure").
 * `recent` (default 0, off; round 3, eval/closed-recent.prereg.md) reads the level from the `recent` nearest earlier
 * open days within the last cycle instead of one cycle back: each is scaled to the closed day's phase by the phase means
 * over the 4 cycles ending at i-L, which the recent days are not part of (fill = s_p * mean_j(v_j / s_q(j)); days whose phase mean is 0, such as an always-shut Saturday,
 * are skipped), so a closure a few days after a step is filled at the new level. Falls back to the `lags` rule when
 * the closed day's phase or the recent days have no mean in that window.
 * Listed dates that are not labels of the series are ignored (a deployer may list next year's holidays ahead).
 * Returns { values, filled: [{ index, label, was, now }] }.
 */
export function fillClosed(values, labels, closed, { period = null, round = false, lags = 4, recent = 0 } = {}) {
  const v = values.map(Number);
  const shut = new Set((closed ?? []).map((s) => String(s).trim()).filter(Boolean));
  if (!shut.size || !labels) return { values: v, filled: [] };
  const l = labels.map(String);
  const idx = [];
  for (let i = 0; i < l.length; i++) if (shut.has(l[i])) idx.push(i);
  if (!idx.length) return { values: v, filled: [] };
  if (idx.length === l.length) throw new Error('--closed lists every label of the series; nothing is left to watch.');
  const isShut = new Set(idx);
  const d0 = dayNumber(l[0]);
  const daily = Number.isFinite(d0) && l.every((s, i) => dayNumber(s) === d0 + i);
  const L = period > 1 ? period : daily ? 7 : 1;
  const out = v.slice(), filled = [];
  const phaseMeans = (i) => {
    const sum = new Map(), n = new Map();
    for (let j = Math.max(0, i - 5 * L + 1); j <= i - L; j++) if (!isShut.has(j)) { const q = j % L; sum.set(q, (sum.get(q) ?? 0) + v[j]); n.set(q, (n.get(q) ?? 0) + 1); }
    return (q) => (n.get(q) ? sum.get(q) / n.get(q) : null);
  };
  for (const i of idx) {
    const same = [];
    for (let j = i - L; j >= 0 && same.length < lags; j -= L) if (!isShut.has(j)) same.push(v[j]);
    let x;
    let rec = null;
    if (recent > 0) {
      const s = phaseMeans(i), sp = s(i % L);
      if (sp != null) {
        const r = [];
        for (let j = i - 1; j > i - L && j >= 0 && r.length < recent; j--) { if (isShut.has(j)) continue; const sq = s(j % L); if (sq > 0) r.push(v[j] / sq); }
        if (r.length) rec = sp * r.reduce((a, b) => a + b, 0) / r.length;
      }
    }
    if (rec != null) x = rec;
    else if (same.length) {
      same.sort((a, b) => a - b);
      const m = same.length >> 1;
      x = same.length % 2 ? same[m] : (same[m - 1] + same[m]) / 2;
    } else {
      let j = i - 1;
      while (j >= 0 && isShut.has(j)) j--;
      if (j < 0) { j = i + 1; while (j < v.length && isShut.has(j)) j++; }
      x = v[j];
    }
    if (round) x = Math.round(x);
    out[i] = x;
    filled.push({ index: i, label: l[i], was: v[i], now: x });
  }
  return { values: out, filled };
}
