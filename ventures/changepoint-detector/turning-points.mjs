// Dated turning points: the Bry-Boschan rule in its quarterly form (BBQ, Harding and Pagan 2002) and a
// growth-cycle mode on a Hodrick-Prescott cycle.
//
// A changepoint model asks "where did the level or the noise jump?". A business-cycle dater asks "where
// did the series stop rising and start falling, and back?". The two are different questions: README
// "A turning-point option on Iran's dated cycle" showed a changepoint model's cuts land on dated turns no
// better than random cuts. This module answers the second question with the rule official daters use.
//
// Rule (Harding, D. and Pagan, A. (2002), Dissecting the cycle: a methodological investigation, Journal of
// Monetary Economics 49(2), 365-381; Bry, G. and Boschan, C. (1971), NBER Technical Paper 20):
//   1. a candidate peak at t when x[t] is above every value within `window` steps before it and at least
//      every value within `window` steps after it; a trough the same way round (the first of a flat top
//      is the one kept);
//   2. peaks and troughs alternate: of two peaks in a row the higher is kept, of two troughs the lower;
//   3. a peak or trough at either end must be more extreme than every value between it and that end;
//   4. every phase (peak to trough, trough to peak) lasts at least `minPhase` steps, and every full cycle
//      (peak to peak, trough to trough) at least `minCycle`. The shortest offending stretch goes first.
//      A short phase loses a turn pair: its own two ends, unless one of them is more extreme than the turn of
//      its kind beside it, in which case that neighbour pair goes instead; a short cycle loses its less extreme
//      turn, and alternation is restored. Repeat until nothing changes.
// Quarterly defaults (BBQ): window 2, minPhase 2, minCycle 5. Monthly (Bry-Boschan's own durations):
// window 5, minPhase 6, minCycle 15. No smoothing step: BBQ dates the series as given (log it first for
// a level that grows).
//
// Growth cycle: hpFilter(log x, lambda) gives trend and cycle; the rule then runs on the cycle. That is how
// growth-cycle daters such as Iran's MBRI work (dated on an HP cycle, lambda 1600 for quarters).

export const PRESETS = {
  quarterly: { window: 2, minPhase: 2, minCycle: 5, lambda: 1600 },
  monthly: { window: 5, minPhase: 6, minCycle: 15, lambda: 129600 },
};

function candidates(x, k) {
  const out = [];
  for (let t = k; t < x.length - k; t++) {
    let peak = true, trough = true;
    for (let j = 1; j <= k; j++) {
      if (!(x[t] > x[t - j] && x[t] >= x[t + j])) peak = false;
      if (!(x[t] < x[t - j] && x[t] <= x[t + j])) trough = false;
    }
    if (peak) out.push({ i: t, kind: 'peak' });
    else if (trough) out.push({ i: t, kind: 'trough' });
  }
  return out;
}

const better = (x, a, b) => (a.kind === 'peak' ? x[a.i] >= x[b.i] : x[a.i] <= x[b.i]);
const strictly = (x, a, b) => (a.kind === 'peak' ? x[a.i] > x[b.i] : x[a.i] < x[b.i]);

function alternate(x, turns) {
  const out = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.kind === t.kind) { if (!better(x, last, t)) out[out.length - 1] = t; }
    else out.push(t);
  }
  return out;
}

function ends(x, turns) {
  let s = turns.slice(), changed = true;
  while (changed && s.length) {
    changed = false;
    const f = s[0], l = s[s.length - 1];
    const okFirst = f.kind === 'peak' ? x.slice(0, f.i).every((v) => v < x[f.i]) : x.slice(0, f.i).every((v) => v > x[f.i]);
    if (!okFirst) { s.shift(); changed = true; continue; }
    const okLast = l.kind === 'peak' ? x.slice(l.i + 1).every((v) => v <= x[l.i]) : x.slice(l.i + 1).every((v) => v >= x[l.i]);
    if (!okLast) { s.pop(); changed = true; }
  }
  return s;
}

// one pass of the duration rules; returns null when nothing offends
// bigMove: a phase shorter than minPhase is kept when the series moves at least this much across it
// (on a logged series, 0.05 is about 5%). Off by default (Infinity), which is Bry-Boschan's rule as written.
function enforceOnce(x, s, minPhase, minCycle, bigMove = Infinity) {
  let worst = null;
  for (let j = 0; j + 1 < s.length; j++) {
    const d = s[j + 1].i - s[j].i;
    if (Math.abs(x[s[j + 1].i] - x[s[j].i]) >= bigMove) continue;
    if (d < minPhase && (!worst || d < worst.d)) worst = { type: 'phase', j, d };
  }
  for (let j = 0; j + 2 < s.length; j++) {
    const d = s[j + 2].i - s[j].i;
    if (d < minCycle && (!worst || d < worst.d)) worst = { type: 'cycle', j, d };
  }
  if (!worst) return null;
  const out = s.slice();
  if (worst.type === 'phase') {
    // a short phase a->b loses a turn pair, chosen so the more extreme turn of each kind stays: when b beats the
    // turn of its kind before a, the pair before b goes; when a beats the turn of its kind after b, the pair
    // after a goes; when both, the pair with the smaller move; otherwise a and b themselves. Each choice keeps
    // the kinds alternating. (Dropping a and b always could leave a lower peak standing over a higher one:
    // README "Japan's coincident index", the 2005-04 peak kept over 2007-05.)
    const j = worst.j, a = s[j], b = s[j + 1], before = s[j - 1], after = s[j + 2];
    const left = before && strictly(x, b, before), right = after && strictly(x, a, after);
    let at = j;
    if (left && right) at = Math.abs(x[a.i] - x[before.i]) <= Math.abs(x[after.i] - x[b.i]) ? j - 1 : j + 1;
    else if (left) at = j - 1;
    else if (right) at = j + 1;
    out.splice(at, 2);
  } else {
    const a = s[worst.j], b = s[worst.j + 2];
    out.splice(better(x, a, b) ? worst.j + 2 : worst.j, 1);
  }
  return alternate(x, out);
}

export function bbq(x, opts = {}) {
  const o = { ...PRESETS.quarterly, ...opts };
  if (!Array.isArray(x) || x.length < 2 * o.window + 1) throw new Error(`bbq needs at least ${2 * o.window + 1} values`);
  if (x.some((v) => !Number.isFinite(v))) throw new Error('bbq needs finite numbers (fill or drop gaps first)');
  let s = ends(x, alternate(x, candidates(x, o.window)));
  for (let guard = 0; guard < 10 * x.length; guard++) {
    const next = enforceOnce(x, s, o.minPhase, o.minCycle, o.bigMove);
    if (!next) break;
    s = ends(x, next);
  }
  return s;
}

// Hodrick-Prescott filter: trend minimises sum (y - tau)^2 + lambda sum (second difference of tau)^2.
// Solved as (I + lambda D'D) tau = y, a symmetric pentadiagonal system (banded Cholesky, O(n)).
export function hpFilter(y, lambda = 1600) {
  const n = y.length;
  if (n < 3) return { trend: y.slice(), cycle: y.map(() => 0) };
  // build the 5 diagonals of A = I + lambda D'D (only main, +1, +2 needed by symmetry)
  const d0 = new Float64Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n);
  for (let k = 0; k < n - 2; k++) {
    // row of D: [1, -2, 1] at k, k+1, k+2
    const c = [1, -2, 1];
    for (let a = 0; a < 3; a++) {
      d0[k + a] += lambda * c[a] * c[a];
      if (a < 2) d1[k + a] += lambda * c[a] * c[a + 1];
      if (a < 1) d2[k + a] += lambda * c[a] * c[a + 2];
    }
  }
  for (let i = 0; i < n; i++) d0[i] += 1;
  // LDL' of a pentadiagonal matrix
  const L1 = new Float64Array(n), L2 = new Float64Array(n), D = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = d0[i];
    if (i >= 1) v -= L1[i - 1] * L1[i - 1] * D[i - 1];
    if (i >= 2) v -= L2[i - 2] * L2[i - 2] * D[i - 2];
    D[i] = v;
    if (i + 1 < n) {
      let u = d1[i];
      if (i >= 1) u -= L1[i - 1] * L2[i - 1] * D[i - 1];
      L1[i] = u / D[i];
    }
    if (i + 2 < n) L2[i] = d2[i] / D[i];
  }
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = y[i] - (i >= 1 ? L1[i - 1] * z[i - 1] : 0) - (i >= 2 ? L2[i - 2] * z[i - 2] : 0);
  for (let i = 0; i < n; i++) z[i] /= D[i];
  const tau = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) tau[i] = z[i] - (i + 1 < n ? L1[i] * tau[i + 1] : 0) - (i + 2 < n ? L2[i] * tau[i + 2] : 0);
  const trend = Array.from(tau);
  return { trend, cycle: y.map((v, i) => v - trend[i]) };
}

// Turning points of a series with the phases between them.
//   mode 'classical' (default): the rule on log x (x if any value is <= 0, or with log: false)
//   mode 'growth': the rule on the HP cycle of log x
export function turningPoints(x, { frequency = 'quarterly', mode = 'classical', log = true, lambda, ...rule } = {}) {
  const preset = PRESETS[frequency];
  if (!preset) throw new Error(`frequency is quarterly or monthly, not ${frequency}`);
  if (mode !== 'classical' && mode !== 'growth') throw new Error(`mode is classical or growth, not ${mode}`);
  const canLog = log && x.every((v) => v > 0);
  const y = canLog ? x.map(Math.log) : x.slice();
  const lam = lambda ?? preset.lambda;
  const dated = mode === 'growth' ? hpFilter(y, lam).cycle : y;
  const turns = bbq(dated, { ...preset, ...rule });
  const phases = [];
  for (let j = 0; j + 1 < turns.length; j++) {
    const a = turns[j], b = turns[j + 1];
    phases.push({
      from: a.i, to: b.i, kind: a.kind === 'trough' ? 'expansion' : 'contraction', steps: b.i - a.i,
      change: canLog ? Math.exp(y[b.i] - y[a.i]) - 1 : x[b.i] - x[a.i], relative: canLog,
    });
  }
  return { mode, frequency, logged: canLog, lambda: mode === 'growth' ? lam : null, turns, phases, dated };
}
