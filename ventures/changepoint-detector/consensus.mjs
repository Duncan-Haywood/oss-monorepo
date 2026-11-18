// Consensus of changes across a panel of settings.
//
// The README's trials found that no single setting is right on every series:
// the plain level model over-cuts a drifting series, `--ar1` loses steps as
// the autocorrelation rises, the noise floor loses small steps. So rather than
// ask the user to pick, run the panel and report each change with how many
// settings found one near that point. A change every setting finds is the one
// to trust; one a single setting finds is a candidate. It is a read of the
// settings agreeing, not a probability: the settings share a likelihood family
// and are not independent.
import { analyze } from './engine.mjs';

export const PANEL = [
  { name: 'level', opts: { model: 'mean' } },
  { name: 'level under a trend, AR(1) widened', opts: { model: 'mean', trend: true, ar1: true } },
  { name: 'level under a trend, AR(1) joint', opts: { model: 'mean', trend: true, ar1: 'joint' } },
  { name: 'level, noise floor 1.5', opts: { model: 'mean', noiseFloor: 1.5 } },
  { name: 'trend', opts: { model: 'trend' } },
  { name: 'trend, noise floor 1.5', opts: { model: 'trend', noiseFloor: 1.5 } },
];

// Measured on the Turing Change Point Dataset (eval/tcpd.mjs, eval/tcpd.out.txt): 31 real
// series marked by five annotators each, the default panel and tolerance, no per-series options.
// The share of each tier's changes that lay within 5 points of an annotator's mark. Low on every
// tier because the panel over-cuts long smooth series; the order (all > most > few) is the finding.
export const TCPD_RATES = {
  series: 31,
  margin: 5,
  all: { changes: 59, marked: 23, majority: 18 },
  most: { changes: 319, marked: 90, majority: 43 },
  few: { changes: 206, marked: 51, majority: 18 },
};
const pct = (a, b) => `${Math.round((100 * a) / b)}%`;
export const TCPD_NOTE = `On ${TCPD_RATES.series} real series marked by human annotators (Turing Change Point Dataset), ${pct(TCPD_RATES.all.marked, TCPD_RATES.all.changes)} of every-setting changes, ${pct(TCPD_RATES.most.marked, TCPD_RATES.most.changes)} of half-or-more and ${pct(TCPD_RATES.few.marked, TCPD_RATES.few.changes)} of fewer-than-half changes lay within ${TCPD_RATES.margin} points of a change an annotator marked: agreement raises the hit rate but does not make a change certain, and long smooth series are over-cut.`;

// Held out (eval/tcpd-heldout.mjs, eval/tcpd-heldout.out.txt): the 7 univariate TCPD series that
// TCPD does not ship, opened only after every setting was fixed on the 31 above. Mean F1 (margin 5).
export const TCPD_HELDOUT = { series: 7, every: 0.711, level: 0.296, bocpd: 0.622, zero: 0.639, binseg: 0.727, pooledSeries: 38, pooledEvery: 0.704, pooledLevel: 0.444 };

// One paragraph for the page: the changes every setting agrees on, led with what that choice
// scored on labelled series nobody tuned it on. c is consensus()'s result.
export function agreedText(c) {
  const H = TCPD_HELDOUT;
  const every = c.changes.filter((x) => x.tier === 'all').sort((a, z) => a.index - z.index);
  const most = c.changes.filter((x) => x.tier === 'most').length;
  const head = every.length
    ? `Every one of ${c.settings.length} settings agrees on ${every.length} change${every.length === 1 ? '' : 's'}: ${every.slice(0, 12).map((x) => `${x.label}${x.direction === 'up' || x.direction === 'down' ? ` (${x.direction})` : ''}`).join(', ')}${every.length > 12 ? `, and ${every.length - 12} more` : ''}.`
    : `No change is found by all ${c.settings.length} settings${most ? ` (${most} found by half or more)` : ''}, so treat the changes below as candidates.`;
  return `${head} On ${H.series} labelled real series held out from tuning (Turing Change Point Dataset), keeping only these agreed changes scored F1 ${H.every.toFixed(2)}, against ${H.level.toFixed(2)} for the single level model whose results follow and ${H.zero.toFixed(2)} for reporting no change at all.`;
}

// base: analyze() input minus model/ar1/noiseFloor/trend (those the panel sets).
// Strips the keys the panel sets, so a caller's own model or floor never leaks into a setting.
export function panelBase(base = {}) {
  const b = { ...base };
  for (const k of ['model', 'ar1', 'noiseFloor', 'trend']) delete b[k];
  return b;
}

// One setting of the panel. Kept separate so the page can run the six settings in
// parallel Web Workers (consensus-worker.mjs) and merge them with mergeConsensus.
export function runSetting(base, p) {
  try {
    const r = analyze({ ...panelBase(base), ...p.opts });
    return { name: p.name, opts: p.opts, labels: r.labels, cuts: r.pelt.changepoints.map((c) => ({ index: c.index, shift: c.shift })) };
  } catch (e) {
    return { name: p.name, error: e.message, cuts: [] };
  }
}

// The page's own analysis often is the panel's "level" setting: same series, plain level
// model, nothing that changes the cuts. Then its result stands in for that setting and the
// panel runs five analyses, not six. opts is the main analyze() input, r its result; returns
// null unless every option that can move a cut is off (hazardLambda and threshold only steer
// the Bayesian column, knotMargin only a trend fit). Pinned in agreed-worker.test.mjs.
const LEVEL_SAME_KEYS = new Set(['csv', 'column', 'log', 'period', 'penalty', 'model', 'hazardLambda', 'threshold', 'knotMargin']);
export function levelRunFromMain(opts, r) {
  if (!opts || !r || opts.model !== 'mean') return null;
  for (const [k, v] of Object.entries(opts)) {
    if (LEVEL_SAME_KEYS.has(k)) continue;
    if (v === false || v === null || v === undefined || v === 0 || v === '' || (Array.isArray(v) && !v.length)) continue;
    return null;
  }
  return { name: PANEL[0].name, opts: PANEL[0].opts, labels: r.labels, cuts: r.pelt.changepoints.map((c) => ({ index: c.index, shift: c.shift })) };
}

// Many agreed changes spread through the whole series (pre-registered 2026-11-15,
// eval/repeat-guard-prereg-2026-11-15.md; measured in eval/repeat-guard.mjs). On TSSB's long
// repeating waveforms every setting cuts the same peaks, so they agree, and agreement is no
// evidence of a change. Fires on 15 or more every-setting changes that fall in at least 8 of the
// 10 equal tenths of the series. Reads only the agreed indexes and n. Returns null or a note.
// Measured, NOT offered: it failed two of its three pre-registered lines (TCPD's bank fires; on
// the fresh HAS 2023 set it cost 0.008 covering, worse on 20 of 31), so consensus() does not call it.
export const REPEAT_GUARD = { minCount: 15, minTenths: 8 };
export function repeatGuard(indexes, n) {
  const k = indexes.length;
  if (!(n > 0) || k < REPEAT_GUARD.minCount) return null;
  const tenths = new Set(indexes.map((i) => Math.min(9, Math.floor((10 * i) / n)))).size;
  if (tenths < REPEAT_GUARD.minTenths) return null;
  const s = [...indexes].sort((a, z) => a - z);
  const gaps = s.slice(1).map((v, i) => v - s[i]).sort((a, z) => a - z);
  const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
  return {
    count: k, tenths, medianGap: gap,
    text: `All settings agree on ${k} changes spread through ${tenths} of the series' 10 tenths${gap ? `, about every ${gap} points` : ''}. That is what a repeating pattern produces (each setting cuts the same peaks), not evidence of ${k} changes: on 75 long labelled series of repeating waveforms (TSSB) such agreed changes scored below reporting no change at all. Treat them as candidates; a shape-aware method (ClaSP) suits a change of pattern.`,
  };
}

// The shape-repeat check (pre-registered 2026-11-15, eval/shape-repeat-prereg-2026-11-15.md;
// measured in eval/shape-repeat.mjs). The agreed changes cut the series into segments; each
// segment of 4+ points becomes a 32-point z-normalised shape. Two segments match when their
// lengths are within 1.5x and their shapes correlate at 0.8 or more; a segment repeats when it
// matches 2 or more others; an agreed change is a repeat cut when the segments on both sides
// repeat (the same waveform cut at the same phase, cycle after cycle). Returns the indexes kept
// and dropped. Reads only the values and the agreed indexes.
export const SHAPE_REPEAT = { points: 32, minLen: 4, lenRatio: 1.5, minCorr: 0.8, minMatches: 2 };
export function segmentShape(seg, P = SHAPE_REPEAT.points) {
  const m = seg.length;
  if (m < SHAPE_REPEAT.minLen) return null;
  const out = new Array(P);
  if (m >= P) {
    for (let b = 0; b < P; b++) {
      const lo = Math.floor((b * m) / P), hi = Math.floor(((b + 1) * m) / P);
      let s = 0; for (let i = lo; i < hi; i++) s += seg[i];
      out[b] = s / (hi - lo);
    }
  } else {
    for (let b = 0; b < P; b++) {
      const t = (b * (m - 1)) / (P - 1), i = Math.floor(t), f = t - i;
      out[b] = i + 1 < m ? seg[i] * (1 - f) + seg[i + 1] * f : seg[i];
    }
  }
  const mu = out.reduce((s, v) => s + v, 0) / P;
  const sd = Math.sqrt(out.reduce((s, v) => s + (v - mu) ** 2, 0) / P);
  if (!(sd > 1e-12)) return null;
  return out.map((v) => (v - mu) / sd);
}
export function shapeRepeats(values, indexes) {
  const cuts = [...new Set(indexes)].filter((c) => c > 0 && c < values.length).sort((a, z) => a - z);
  if (cuts.length < 3) return { kept: cuts, dropped: [], segments: cuts.length + 1 };
  const bounds = [0, ...cuts, values.length];
  const segs = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const len = bounds[k + 1] - bounds[k];
    segs.push({ len, shape: segmentShape(values.slice(bounds[k], bounds[k + 1])) });
  }
  const P = SHAPE_REPEAT.points;
  const repeats = segs.map((a, i) => {
    if (!a.shape) return false;
    let hits = 0;
    for (let j = 0; j < segs.length && hits < SHAPE_REPEAT.minMatches; j++) {
      const b = segs[j];
      if (j === i || !b.shape) continue;
      if (Math.max(a.len, b.len) > SHAPE_REPEAT.lenRatio * Math.min(a.len, b.len)) continue;
      let r = 0; for (let t = 0; t < P; t++) r += a.shape[t] * b.shape[t];
      if (r / P >= SHAPE_REPEAT.minCorr) hits++;
    }
    return hits >= SHAPE_REPEAT.minMatches;
  });
  const kept = [], dropped = [];
  cuts.forEach((c, k) => ((repeats[k] && repeats[k + 1]) ? dropped : kept).push(c));
  return { kept, dropped, segments: segs.length };
}

export function consensus(base = {}, { tolerance = null, panel = PANEL } = {}) {
  return mergeConsensus(panel.map((p) => runSetting(base, p)), { tolerance });
}

// runs: runSetting() results in panel order (any that failed carry `error`).
export function mergeConsensus(runs, { tolerance = null } = {}) {
  const ok = runs.filter((r) => !r.error);
  if (!ok.length) throw new Error(`No setting could run: ${runs[0].error}`);
  const labels = ok[0].labels;
  const n = labels.length;
  const tol = tolerance != null ? Number(tolerance) : Math.max(2, Math.round(n * 0.02));
  if (!(tol >= 0)) throw new Error('tolerance must be a number of points, 0 or more.');
  const all = [];
  ok.forEach((r, ri) => r.cuts.forEach((c) => all.push({ ...c, run: ri })));
  all.sort((a, z) => a.index - z.index);
  // Cuts within tol of the group's first cut are one group (anchored, not
  // chained, so a staircase does not merge into one wide change); a run counts once.
  const groups = [];
  for (const c of all) {
    const g = groups[groups.length - 1];
    if (g && c.index - g.first <= tol) g.members.push(c); else groups.push({ members: [c], first: c.index });
  }
  const changes = groups.map((g) => {
    const idx = g.members.map((m) => m.index).sort((a, z) => a - z);
    const runsIn = new Set(g.members.map((m) => m.run));
    const dirs = g.members.filter((m) => ok[m.run].opts.model === 'mean').map((m) => Math.sign(m.shift || 0)).filter(Boolean);
    const up = dirs.filter((d) => d > 0).length;
    const index = idx[Math.floor(idx.length / 2)];
    return {
      index, label: labels[index],
      from: labels[idx[0]], to: labels[idx[idx.length - 1]],
      support: runsIn.size, of: ok.length,
      settings: [...runsIn].sort().map((i) => ok[i].name),
      direction: !dirs.length ? 'n/a' : up === dirs.length ? 'up' : up === 0 ? 'down' : 'mixed',
    };
  });
  changes.sort((a, z) => z.support - a.support || a.index - z.index);
  const tier = (c) => (c.support === c.of ? 'all' : c.support >= Math.ceil(c.of / 2) ? 'most' : 'few');
  for (const c of changes) c.tier = tier(c);
  return {
    n, tolerance: tol, settings: ok.map((r) => ({ name: r.name, changes: r.cuts.length })),
    skipped: runs.filter((r) => r.error).map((r) => ({ name: r.name, error: r.error })),
    changes,
    note: 'Agreement among settings that share one likelihood family, not a probability: a change every setting finds is the one to trust, a change one setting finds is a candidate. No setting is told which series it is.',
    measured: TCPD_NOTE,
  };
}

export function consensusText(c) {
  const L = [`Consensus across ${c.settings.length} settings (changes within ${c.tolerance} points count as the same):`];
  L.push(`  ${c.settings.map((s) => `${s.name}: ${s.changes}`).join('; ')}`);
  if (c.skipped.length) L.push(`  not run: ${c.skipped.map((s) => `${s.name} (${s.error})`).join('; ')}`);
  if (!c.changes.length) L.push('', '  No setting reports a change.');
  for (const t of ['all', 'most', 'few']) {
    const rows = c.changes.filter((x) => x.tier === t);
    if (!rows.length) continue;
    L.push('', { all: 'Found by every setting:', most: 'Found by half or more:', few: 'Found by fewer than half (candidates):' }[t]);
    for (const x of rows) L.push(`  ${x.label}${x.from !== x.to ? ` (${x.from} – ${x.to})` : ''}  ${x.support}/${x.of}  ${x.direction}`);
  }
  if (c.updateRateWarning) L.push('', `Read with care: ${c.updateRateWarning}`);
  L.push('', `(${c.note})`);
  if (c.measured) L.push(`(${c.measured})`);
  return L.join('\n');
}
