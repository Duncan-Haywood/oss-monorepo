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
  L.push('', `(${c.note})`);
  if (c.measured) L.push(`(${c.measured})`);
  return L.join('\n');
}
