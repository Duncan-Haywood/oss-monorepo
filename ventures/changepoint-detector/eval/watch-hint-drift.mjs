// Round 9 of the watch: the drift watch ("Wandering level") as a fourth setting in the "Which How eager suits this
// series?" hint. Pre-registered 2026-11-13: this header was written and committed before any run of this file.
//
//   sh eval/tcpd-fetch.sh tcpd-data
//   node eval/watch-hint-drift.mjs tcpd-data > eval/watch-hint-drift.out.txt
//
// Why (README "Round 8", "Not done"): round 8 shipped the drift detector as an opt-in watch setting. On TCPD's 31
// univariate series, watched from 20% of their length, it reached 44 of 52 majority-marked changes against the
// default's 32, at about twice the alerts, and the gain came from series whose level moves for years at a time. The
// hint (round 6, re-checked under persist 2 in round 6b) replays a person's history once per setting and picks the most
// eager setting whose history rate is at most B = 2 alerts per 100 checks; it scores quiet (bocpd-ar1-window), middle
// (bocpd) and eager (pelt) only, so a person whose series wanders is never pointed at the drift watch.
//
// Design: round 6's, unchanged except for the settings and the policy. Each univariate series is cut at h = floor(n/2);
// the watch is replayed after every point from start = max(20, floor(0.2 h)) under the shipped advance policy
// (confirm 5, tolerance 5, hold history, persist 2: WATCH_DEFAULTS since round 7). History alerts are those sent at a
// point <= h, history rate = per 100 history checks; scored on the future halves only. Series with h < 30 skipped.
//
// Baseline: the shipped three-setting hint at B = 2 (ladder quiet < middle < eager).
// Candidate (the one that decides): a four-setting hint at B = 2 with the ladder quiet < middle < drift < eager, the
// most eager setting on the ladder whose history rate is at most B, else quiet. Drift sits above middle because on
// TCPD in round 8 it sent more alerts than the default and reached more marks than middle reached in round 3 (44 of 52
// against 38 of 52), and below eager, which sends several times either.
// Reported, deciding nothing: the ladder quiet < drift < middle < eager; fixed drift; the candidate at B = 1 and B = 5.
//
// Rule (written before the run), on the 31 shipped univariate TCPD series (23 after the h < 30 skip):
//  (a) the candidate reaches more future majority-marked changes than the shipped three-setting hint;
//  (b) its future alerts per 1,000 checks are at most fixed middle's;
//  (c) its share of future alerts within 5 points of any annotator's mark is at most 5 points below the shipped hint's.
// If all three pass, the hint on the page, `watch.mjs --suggest` / `--detector auto` and the agent tool score four
// settings for the level model, with drift on the ladder as above. If any part fails, the hint keeps three settings and
// the README says which part failed. The volatility and count models are untouched either way (drift is level-only).
// TCPD has been seen by rounds 3-8 (round 8's TCPD run looked at the drift watch on these very series), so this is a
// round on seen data, the same footing as round 6; the 7 held-out series are scored and reported, deciding nothing.
//
// Prediction written before the run: the candidate moves a handful of wandering series (co2_canada, children_per_woman,
// brent_spot) to drift only if drift's history rate there is under 2, and round 8 suggests it often is not (co2_canada
// 23 alerts, children_per_woman 15), so the gain in marks is small, one to three, and (a) is where it could fail.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { detectChanges, advance, emptyState } from '../watch-core.mjs';

const TOL = 5, CONFIRM = 5, PERSIST = 2;
const SETTINGS = { quiet: 'bocpd-ar1-window', middle: 'bocpd', drift: 'drift', eager: 'pelt' };
const KEYS = Object.keys(SETTINGS);
// Ladders, most eager first (the hint takes the first whose history rate is at most B).
const LADDER3 = ['eager', 'middle', 'quiet'];
const LADDER4 = ['eager', 'drift', 'middle', 'quiet'];
const LADDER4B = ['eager', 'middle', 'drift', 'quiet'];

function trace(values, start, detector) {
  const labels = values.map((_, i) => String(i + 1));
  const steps = [];
  for (let n = start; n <= values.length; n++) steps.push({ n, changes: detectChanges(values.slice(0, n), labels.slice(0, n), { detector }).map((c) => ({ index: c.index, label: c.label })) });
  return { labels, steps };
}

if (!isMainThread) parentPort.on('message', ({ id, values, start, detector }) => parentPort.postMessage({ id, ...trace(values, start, detector) }));

async function traceAll(jobs) {
  const results = new Array(jobs.length);
  const k = Math.max(1, Math.min(jobs.length, availableParallelism()));
  let next = 0, done = 0;
  // Longest series first, so the pool does not end waiting on one long drift trace.
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[b].values.length - jobs[a].values.length);
  await new Promise((resolve, reject) => {
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url));
      const feed = () => { if (next < order.length) { const id = order[next++]; const j = jobs[id]; worker.postMessage({ id, values: j.values, start: j.start, detector: j.detector }); } else worker.terminate(); };
      worker.on('message', (m) => { results[m.id] = m; done++; if (done % 20 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

function replay(steps, labels) {
  let state = emptyState();
  const alerts = [];
  for (const { n, changes } of steps) {
    const r = advance(state, changes, n, labels.slice(0, n), { confirm: CONFIRM, tolerance: TOL, holdHistory: true, persist: PERSIST });
    for (const a of r.alerts) alerts.push({ index: a.index, at: n });
    state = r.state;
  }
  return alerts;
}

function loadTcpd(dir, heldout) {
  const ann = JSON.parse(readFileSync(join(dir, 'annotations.json'), 'utf8'));
  const series = [], skipped = [];
  for (const d of Object.keys(ann).sort()) {
    const f = join(dir, heldout ? 'heldout' : 'ds', `${d}.json`);
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    if (j.n_dim !== 1) continue;
    let last = null;
    const values = j.series[0].raw.map((v) => { if (v == null || !Number.isFinite(Number(v))) return last; last = Number(v); return last; });
    const n = values.length, h = Math.floor(n / 2);
    if (h < 30) { skipped.push(`${d} (n=${n})`); continue; }
    const start = Math.max(20, Math.floor(0.2 * h));
    const a = Object.values(ann[d]), K = a.length, anyMark = [...new Set(a.flat())], majority = [];
    for (const l of [...anyMark].sort((x, y) => x - y)) {
      if (l < h) continue;
      if (a.filter((locs) => locs.some((m) => Math.abs(m - l) <= TOL)).length * 2 <= K) continue;
      if (majority.some((p) => Math.abs(p - l) <= TOL)) continue;
      majority.push(l);
    }
    series.push({ name: d, values, n, h, start, anyMark, majority });
  }
  return { series, skipped };
}

function perSeries(s, traces) {
  const out = {};
  for (const name of KEYS) {
    const { steps, labels } = traces[name];
    const alerts = replay(steps, labels);
    const histChecks = s.h - s.start, futChecks = s.n - s.h;
    const hist = alerts.filter((x) => x.at <= s.h), fut = alerts.filter((x) => x.at > s.h);
    out[name] = { histRate: (100 * hist.length) / histChecks, futRate: (100 * fut.length) / futChecks, fut, futChecks };
  }
  return out;
}

const hintFor = (ps, B, ladder) => ladder.find((k) => ps[k].histRate <= B) ?? 'quiet';

function score(series, per, pick) {
  const t = { alerts: 0, marked: 0, checks: 0, maj: 0, reached: 0, picks: Object.fromEntries(KEYS.map((k) => [k, 0])), moved: [] };
  series.forEach((s, i) => {
    const k = pick(per[i]);
    t.picks[k]++;
    const { fut, futChecks } = per[i][k];
    t.alerts += fut.length; t.checks += futChecks; t.maj += s.majority.length;
    t.marked += fut.filter((al) => s.anyMark.some((m) => Math.abs(m - al.index) <= TOL)).length;
    t.reached += s.majority.filter((p) => fut.some((x) => Math.abs(x.index - p) <= TOL)).length;
  });
  t.share = t.alerts ? (100 * t.marked) / t.alerts : 0;
  t.per1000 = (1000 * t.alerts) / t.checks;
  return t;
}

const reachedIn = (s, fut) => s.majority.filter((p) => fut.some((x) => Math.abs(x.index - p) <= TOL)).length;

function report(title, { series, skipped }, per) {
  console.log(`${title}: ${series.length} series scored${skipped.length ? `; skipped (h < 30): ${skipped.join(', ')}` : ''}.\n`);
  console.log('  series                       n    h  hist rate q/m/d/e (per 100)    fut rate q/m/d/e            hint3  hint4   future marks (reached by hint3 / hint4)');
  series.forEach((s, i) => {
    const p = per[i], f = (k, w) => p[k][w].toFixed(1).padStart(5);
    const h3 = hintFor(p, 2, LADDER3), h4 = hintFor(p, 2, LADDER4);
    console.log(`  ${s.name.padEnd(26)} ${String(s.n).padStart(5)} ${String(s.h).padStart(4)}  ${KEYS.map((k) => f(k, 'histRate')).join(' ')}    ${KEYS.map((k) => f(k, 'futRate')).join(' ')}   ${h3.padEnd(6)} ${h4.padEnd(6)}  ${s.majority.length} (${reachedIn(s, p[h3].fut)} / ${reachedIn(s, p[h4].fut)})`);
  });
  const rows = [
    ['fixed quiet (default)', () => 'quiet'],
    ['fixed middle', () => 'middle'],
    ['fixed drift', () => 'drift'],
    ['fixed eager', () => 'eager'],
    ['hint3, B = 2 (shipped)', (p) => hintFor(p, 2, LADDER3)],
    ['hint4, B = 2 (candidate)', (p) => hintFor(p, 2, LADDER4)],
    ['hint4, B = 1', (p) => hintFor(p, 1, LADDER4)],
    ['hint4, B = 5', (p) => hintFor(p, 5, LADDER4)],
    ['hint4 drift<middle, B = 2', (p) => hintFor(p, 2, LADDER4B)],
  ];
  console.log('\n  policy                        future alerts  at a mark (share)  per 1000 checks  majority-marked reached  picks q/m/d/e');
  const out = {};
  for (const [name, pick] of rows) {
    const t = score(series, per, pick);
    out[name] = t;
    console.log(`  ${name.padEnd(29)} ${String(t.alerts).padStart(8)}      ${String(t.marked).padStart(5)} (${t.share.toFixed(0)}%)       ${t.per1000.toFixed(1).padStart(8)}          ${String(t.reached).padStart(3)}/${t.maj}              ${KEYS.map((k) => t.picks[k]).join('/')}`);
  }
  return out;
}

if (isMainThread) {
  const dir = process.argv[2] || 'tcpd-data';
  const t0 = Date.now();
  const sets = [loadTcpd(dir, false), loadTcpd(dir, true)];
  const all = sets.flatMap((x) => x.series);
  const jobs = [];
  all.forEach((s, si) => { for (const [name, detector] of Object.entries(SETTINGS)) jobs.push({ si, name, values: s.values, start: s.start, detector }); });
  const res = await traceAll(jobs);
  const traces = all.map(() => ({}));
  jobs.forEach((j, i) => { traces[j.si][j.name] = res[i]; });
  const per = all.map((s, i) => perSeries(s, traces[i]));
  const nT = sets[0].series.length;
  const main = report('Round 9, the 31 shipped univariate TCPD series (the rule)', sets[0], per.slice(0, nT));
  const c = main['hint4, B = 2 (candidate)'], h = main['hint3, B = 2 (shipped)'], m = main['fixed middle'];
  const A = c.reached > h.reached, B = c.per1000 <= m.per1000, C = c.share >= h.share - 5;
  console.log(`\n  Rule: (a) more marks than the shipped hint: ${c.reached} vs ${h.reached} ${A ? 'PASS' : 'FAIL'}; (b) per 1000 at most middle's: ${c.per1000.toFixed(1)} vs ${m.per1000.toFixed(1)} ${B ? 'PASS' : 'FAIL'}; (c) share at most 5 points below the shipped hint's: ${c.share.toFixed(1)}% vs ${h.share.toFixed(1)}% ${C ? 'PASS' : 'FAIL'}.`);
  console.log(`  The four-setting hint ${A && B && C ? 'SHIPS' : 'does NOT ship'}.\n`);
  report('Held out (deciding nothing)', sets[1], per.slice(nT));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s on ${availableParallelism()} cores.`);
}
