#!/usr/bin/env node
// Watch a growing series and alert once per new, confirmed change.
//
//   node watch.mjs daily.csv --state watch-state.json            # run after each new row (cron, CI)
//   node watch.mjs https://example.com/metric.csv --state s.json --column orders --model poisson
//   WATCH_WEBHOOK_URL=https://hooks.slack.com/... node watch.mjs daily.csv --state s.json --webhook-env WATCH_WEBHOOK_URL
//
// Each run refits the newest --window points with the same engine as the page and the CLI, then
// compares the changes with the ones it already alerted on (kept in the state file). A change is
// reported once it has --confirm points after it, and never again while it stays within
// --tolerance points of where it was first reported, so a change PELT re-dates by a point or two
// as data arrives is not a second alert. Zero dependencies; the only network calls are the ones
// you ask for (a CSV URL, a webhook URL from an environment variable).

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { analyze, parseSeries, peaks } from './engine.mjs';

// Defaults chosen on synthetic streams only (eval/watch-replay.mjs, eval/watch-replay.out.txt), then
// scored once on the TCPD series without changing them (same file, "TCPD replay").
// Pre-registered rule: of the candidates finding at least 90% of 2-sd steps, the fewest false alerts on three null
// streams. Chosen: the Bayesian detections with 5 points of confirmation (0 per 1,000 checks on independent noise,
// 7.5 on AR(1) 0.5, 2.5 on t3; PELT's level model 2.5 / 49.75 / 12.75). On TCPD: 193 alerts against PELT's 626.
export const WATCH_DEFAULTS = { confirm: 5, tolerance: 5, window: 1000, detector: 'bocpd', model: 'mean' };

const STATE_VERSION = 1;
export const DETECTORS = ['bocpd', 'bocpd-window', 'bocpd-ar1', 'bocpd-ar1-window', 'pelt'];

export function emptyState() {
  return { version: STATE_VERSION, alerted: [], n: 0, lastLabel: null };
}

/**
 * The changes the chosen detector finds in the newest `window` points. Indexes are absolute
 * (0-based in the full series). opts: detector 'pelt' | 'bocpd', model, penalty, period, log, ...
 */
export function detectChanges(values, labels, opts = {}) {
  const d = opts.detector ?? WATCH_DEFAULTS.detector;
  if (d.startsWith('bocpd-ar1') && (opts.model ?? 'mean') !== 'mean') throw new Error(`--detector ${d} is for the level model (--model mean) only.`);
  const all = detectBoth(values, labels, opts);
  if (!all[d]) throw new Error(`Unknown detector ${d}.`);
  return all[d];
}

/** Both detectors' changes from one engine run: { pelt, bocpd }. */
export function detectBoth(values, labels, opts = {}) {
  const o = { ...WATCH_DEFAULTS, ...opts };
  const off = Math.max(0, values.length - o.window);
  const v = values.slice(off), l = labels.slice(off);
  const { confirm, tolerance, window, detector, alertHistory, ar1Detectors, ...engine } = o;
  const r = analyze({ ...engine, values: v, labels: l });
  const map = (c) => ({
    index: c.index + off,
    label: c.label,
    ...(c.meanBefore !== undefined ? { meanBefore: c.meanBefore, meanAfter: c.meanAfter, shift: c.shift } : {}),
    ...(c.shiftInNoiseSd !== undefined ? { shiftInNoiseSd: c.shiftInNoiseSd } : {}),
    ...(c.sdBefore !== undefined ? { sdBefore: c.sdBefore, sdAfter: c.sdAfter } : {}),
    ...(c.probability !== undefined ? { probability: c.probability } : {}),
  });
  const out = { pelt: r.pelt.changepoints.map(map), ...bayesLists(r, map, '') };
  // 'bocpd-ar1' / 'bocpd-ar1-window': the same Bayesian pass with the engine's AR(1) term (--ar1: rho from the
  // window, the conditional AR(1) likelihood in bocpd), for sticky noise. A second engine run, so only on request.
  if ((o.ar1Detectors || String(detector).startsWith('bocpd-ar1')) && (engine.model ?? 'mean') === 'mean') {
    Object.assign(out, bayesLists(analyze({ ...engine, values: v, labels: l, ar1: true }), map, '-ar1'));
  }
  return out;
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
 * { alerts, pending, state, notes }. `changes` from detectChanges on the same series.
 */
export function advance(state, changes, n, labels, opts = {}) {
  const { confirm, tolerance } = { ...WATCH_DEFAULTS, ...opts };
  const st = state && state.version === STATE_VERSION ? state : emptyState();
  const notes = [];
  if (st.n && n < st.n) notes.push(`The series is shorter than at the last check (${n} points, was ${st.n}): rows were removed or the file was replaced.`);
  const unique = new Set(labels).size === labels.length;
  const labelIndex = unique ? new Map(labels.map((x, i) => [String(x), i])) : null;
  if (st.lastLabel != null && labelIndex && !labelIndex.has(st.lastLabel)) notes.push(`The last label seen before (${st.lastLabel}) is no longer in the series: its history was rewritten.`);
  const known = st.alerted.map((a) => locate(a, labelIndex));
  const alerts = [], pending = [], baseline = [];
  // The first check of a file that already has history records the changes in it as the baseline
  // instead of alerting on each (opts.alertHistory reports them).
  const first = !st.n && !st.alerted.length && !opts.alertHistory;
  for (const c of changes) {
    if (known.some((k) => Math.abs(k - c.index) <= tolerance)) continue;
    const after = n - c.index; // points from the change to the newest, inclusive
    if (after < confirm) { pending.push({ ...c, pointsAfter: after }); continue; }
    if (first) baseline.push({ ...c, pointsAfter: after });
    else alerts.push({ ...c, pointsAfter: after, late: after > 2 * confirm + 1 });
    known.push(c.index);
  }
  const next = {
    version: STATE_VERSION,
    alerted: [...st.alerted, ...[...baseline, ...alerts].map((a) => ({ index: a.index, label: String(a.label), reportedAtN: n, ...(a.shift !== undefined ? { shift: a.shift } : {}), ...(first ? { baseline: true } : {}) }))],
    n,
    lastLabel: labels.length ? String(labels[labels.length - 1]) : null,
  };
  return { alerts, pending, baseline, state: next, notes };
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
  for (const p of res.pending) lines.push(`Watching: a possible change from ${p.label}, ${p.pointsAfter} point${p.pointsAfter === 1 ? '' : 's'} after it so far (reported at ${opts.confirm ?? WATCH_DEFAULTS.confirm}).`);
  for (const n of res.notes) lines.push(`Note: ${n}`);
  lines.push(`Changes on record: ${res.state.alerted.length}. Points: ${res.state.n}.`);
  return lines.join('\n');
}

/** One body that Slack, Mattermost and Teams incoming webhooks read as `text` and Discord as `content`. */
export function webhookBody(text) {
  return { text, content: text.length > 1990 ? text.slice(0, 1987) + '...' : text };
}

const USAGE = `Watch a growing time series and alert once per new, confirmed change (run it after each new row).

Usage:
  node watch.mjs <file.csv | https://...csv> --state <state.json> [options]

Options:
  --state <file>            where alerted changes are remembered (created if missing; commit it or cache it)
  --column <name|index>     value column (default: last numeric column)
  --label-column <name|i>   label/date column (default: first column)
  --model mean|meanvar|poisson   change in level, in level and volatility, or in the rate of counts (default: mean)
  --penalty bic|aic|<number>     PELT penalty per change (default: bic)
  --period <n>              remove a seasonal cycle of n points first (7 for daily data, 12 for monthly)
  --log                     take logs first (positive values; percentage growth)
  --detector bocpd|pelt     which detector's changes to alert on (default: bocpd, the Bayesian detections: far fewer false
                            alerts; pelt finds smaller steps, e.g. 1 noise sd, at about 3x the false alerts on real series;
                            bocpd-ar1 allows for sticky (autocorrelated) noise, level model only; *-window sums the
                            probability over 5 neighbouring points: see the README, "Watching a growing series")
  --confirm <k>             report a change once k points are on its far side (default: ${WATCH_DEFAULTS.confirm})
  --tolerance <k>           a change within k points of one already reported is the same change (default: ${WATCH_DEFAULTS.tolerance})
  --window <n>              refit only the newest n points (default: ${WATCH_DEFAULTS.window})
  --webhook-env <NAME>      POST each new alert to the URL in environment variable NAME (Slack, Discord, Teams, Mattermost)
  --fail-on-alert           exit 1 when there is a new alert (a CI run then fails and its owner is emailed)
  --alert-history           on the first check, alert on the changes already in the history too (default: record them as the baseline)
  --dry-run                 do not write the state file
  --json                    print the result as JSON
  -h, --help                this help

Statistical analysis of data you supply, not advice. MIT licence.`;

export async function main(argv, { out = (s) => process.stdout.write(s), env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const o = {};
  let src = null, statePath = null, json = false, failOnAlert = false, dry = false, hookEnv = null;
  const num = (s, name) => { const v = Number(s); if (!(v > 0) || !Number.isInteger(v)) throw new Error(`${name} takes a whole number above 0.`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--state') statePath = argv[++i];
    else if (a === '--column') o.column = argv[++i];
    else if (a === '--label-column') o.labelColumn = argv[++i];
    else if (a === '--model') { o.model = argv[++i]; if (!['mean', 'meanvar', 'poisson'].includes(o.model)) throw new Error('--model takes mean, meanvar or poisson.'); }
    else if (a === '--penalty') { const p = argv[++i]; o.penalty = /^\d+(\.\d+)?$/.test(p) ? Number(p) : p; }
    else if (a === '--period') o.period = num(argv[++i], '--period');
    else if (a === '--log') o.log = true;
    else if (a === '--detector') { o.detector = argv[++i]; if (!DETECTORS.includes(o.detector)) throw new Error(`--detector takes ${DETECTORS.join(', ')}.`); }
    else if (a === '--confirm') o.confirm = num(argv[++i], '--confirm');
    else if (a === '--tolerance') o.tolerance = Number(argv[++i]);
    else if (a === '--window') o.window = num(argv[++i], '--window');
    else if (a === '--webhook-env') hookEnv = argv[++i];
    else if (a === '--fail-on-alert') failOnAlert = true;
    else if (a === '--dry-run') dry = true;
    else if (a === '--alert-history') o.alertHistory = true;
    else if (a === '--json') json = true;
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a} (see --help).`);
    else src = a;
  }
  if (!src) throw new Error('Give a CSV file or URL (see --help).');
  if (!statePath && !dry) throw new Error('Give --state <file> so the next run knows what was already reported (or --dry-run).');
  if (o.column != null && /^\d+$/.test(o.column)) o.column = Number(o.column);
  if (o.labelColumn != null && /^\d+$/.test(o.labelColumn)) o.labelColumn = Number(o.labelColumn);
  let csv;
  if (/^https?:\/\//i.test(src)) {
    const r = await fetchImpl(src);
    if (!r.ok) throw new Error(`Fetching ${src} answered ${r.status}.`);
    csv = await r.text();
  } else csv = await readFile(src, 'utf8');
  const { labels, values, column } = parseSeries(csv, o.column ?? null, o.labelColumn ?? null);
  if (values.length < 4) throw new Error(`Need at least 4 numbers; got ${values.length}.`);
  const state = statePath && existsSync(statePath) ? JSON.parse(await readFile(statePath, 'utf8')) : emptyState();
  const { column: _c, labelColumn: _l, alertHistory: _h, ...detOpts } = o;
  const changes = detectChanges(values, labels, detOpts);
  const res = advance(state, changes, values.length, labels, o);
  const textOpts = { column, model: o.model || 'mean', confirm: o.confirm };
  if (hookEnv && res.alerts.length) {
    const url = env[hookEnv];
    if (!url) throw new Error(`--webhook-env ${hookEnv}: that environment variable is empty.`);
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(webhookBody(alertText(res, textOpts))) });
    if (!r.ok) throw new Error(`The webhook answered ${r.status}; the state was not saved, so the next run will try again.`);
  }
  if (!dry) await writeFile(statePath, JSON.stringify(res.state, null, 2) + '\n');
  out((json ? JSON.stringify({ column, n: values.length, ...res }, null, 2) : statusText(res, textOpts)) + '\n');
  return failOnAlert && res.alerts.length ? 1 : 0;
}

const invoked = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invoked) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { process.stderr.write(`error: ${e.message}\n`); process.exit(2); });
}
