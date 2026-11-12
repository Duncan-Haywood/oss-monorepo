// Round 6: a per-series eagerness hint from the replay (pre-registered; this header was committed before the
// first run, README "Round 6").
//
// The question. The page offers three "How eager" settings for a watch: quiet (bocpd-ar1-window, the default),
// middle (bocpd) and eager (pelt). Rounds 1-5 picked one default for every series, and the held-out replay showed
// the cost: the plain pass reached 12 of 12 held-out marks where the default reached 9, while on measles alone the
// default sent 20 alerts and reached none. A person's own history is the one thing the tool has about their
// series before the watch starts. Does replaying it under each setting say which setting suits that series?
//
// Design. Each univariate series is cut at h = floor(n / 2). The first half is "the history the person has when
// they set the watch up"; the second half is "the future". For each setting the watch is replayed after every
// point from start = max(20, floor(0.2 h)) to n (the detections at every prefix, then the shipped `advance` with
// the defaults: confirm 5, tolerance 5, hold history). Alerts sent at a point <= h are history alerts; the rest
// are future alerts. history rate = history alerts per 100 history checks. Series with h < 30 are skipped (too
// little history to replay) and listed.
//
// The hint (budget B alerts per 100 checks): take the most eager setting whose history rate is at most B; if none
// is, take quiet. B = 2 is the pre-registered budget (about one alert per 50 checks; the quiet default ran at
// 1.6 per 100 checks on TCPD in round 4). B = 1 and B = 5 are reported, deciding nothing.
//
// Scored on the future halves only: future alerts, the share of them within 5 points of any annotator's mark,
// alerts per 1,000 future checks, and majority-marked changes in the future half (mark >= h) reached by a future
// alert within 5 points. Majority marks as in eval/watch-flicker.mjs.
//
// Rule (written before the run), on the 31 shipped univariate TCPD series:
//  (a) the hint at B = 2 reaches more future majority-marked changes than fixed quiet;
//  (b) its future alerts per 1,000 checks are at most fixed middle's;
//  (c) its share of future alerts at a mark is at most 5 points below fixed quiet's.
// If all three pass, the page and the agent tool suggest a setting from the person's history at B = 2.
// Whatever the result, the 7 held-out series (tcpd-data/heldout, not apple/bee_waggle/occupancy, which are
// multi-column) are scored and reported, deciding nothing.
//
// A second, separate claim: the history rate is shown to the person as a forecast ("on your history it would have
// sent about r alerts per 100 checks"). That forecast ships only if, for the quiet default, the Spearman rank
// correlation between history rate and future rate across the scored TCPD series is at least 0.5. Reported for
// the other two settings and on the held-out series, deciding nothing.
//
//   sh eval/tcpd-fetch.sh tcpd-data && node eval/watch-eagerness.mjs tcpd-data > eval/watch-eagerness.out.txt
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { detectChanges, advance, emptyState } from '../watch-core.mjs';

const TOL = 5, CONFIRM = 5;
const SETTINGS = { quiet: 'bocpd-ar1-window', middle: 'bocpd', eager: 'pelt' };
const ORDER = ['eager', 'middle', 'quiet'];
// WATCH_BUDGETS (comma-separated) adds budgets to the report, deciding nothing (README "The hint in the CLI watch").
const BUDGETS = [2, 1, 5, ...String(process.env.WATCH_BUDGETS || '').split(',').filter(Boolean).map(Number).filter((b) => ![2, 1, 5].includes(b))];

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
  await new Promise((resolve, reject) => {
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url));
      const feed = () => { if (next < jobs.length) { const id = next++; const j = jobs[id]; worker.postMessage({ id, values: j.values, start: j.start, detector: j.detector }); } else worker.terminate(); };
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
    const r = advance(state, changes, n, labels.slice(0, n), { confirm: CONFIRM, tolerance: TOL, holdHistory: true });
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

// Per series and setting: history rate, and the future alerts.
function perSeries(s, traces) {
  const out = {};
  for (const name of Object.keys(SETTINGS)) {
    const { steps, labels } = traces[name];
    const alerts = replay(steps, labels);
    const histChecks = s.h - s.start, futChecks = s.n - s.h;
    const hist = alerts.filter((x) => x.at <= s.h), fut = alerts.filter((x) => x.at > s.h);
    out[name] = {
      histRate: (100 * hist.length) / histChecks,
      futRate: (100 * fut.length) / futChecks,
      fut, futChecks,
    };
  }
  return out;
}

const hintFor = (ps, B) => ORDER.find((k) => ps[k].histRate <= B) ?? 'quiet';

function score(series, per, pick) {
  const t = { alerts: 0, marked: 0, checks: 0, maj: 0, reached: 0, picks: { quiet: 0, middle: 0, eager: 0 } };
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

function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}
function spearman(x, y) {
  const rx = ranks(x), ry = ranks(y), n = x.length, mx = rx.reduce((a, b) => a + b) / n, my = ry.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

function report(title, { series, skipped }, per) {
  console.log(`${title}: ${series.length} series scored${skipped.length ? `; skipped (h < 30): ${skipped.join(', ')}` : ''}.\n`);
  console.log('  series                       n    h  hist rate q/m/e (per 100)   fut rate q/m/e        hint@2  future marks');
  series.forEach((s, i) => {
    const p = per[i], f = (k, w) => p[k][w].toFixed(1).padStart(5);
    console.log(`  ${s.name.padEnd(26)} ${String(s.n).padStart(5)} ${String(s.h).padStart(4)}  ${f('quiet', 'histRate')} ${f('middle', 'histRate')} ${f('eager', 'histRate')}          ${f('quiet', 'futRate')} ${f('middle', 'futRate')} ${f('eager', 'futRate')}   ${hintFor(p, 2).padEnd(6)}  ${s.majority.length}`);
  });
  const rows = [
    ['fixed quiet (default)', () => 'quiet'],
    ['fixed middle', () => 'middle'],
    ['fixed eager', () => 'eager'],
    ...BUDGETS.map((B) => [`hint, B = ${B}${B === 2 ? ' (pre-registered)' : ''}`, (p) => hintFor(p, B)]),
  ];
  console.log('\n  policy                        future alerts  at a mark (share)  per 1000 checks  majority-marked reached  picks q/m/e');
  const out = {};
  for (const [name, pick] of rows) {
    const t = score(series, per, pick);
    out[name] = t;
    console.log(`  ${name.padEnd(29)} ${String(t.alerts).padStart(8)}      ${String(t.marked).padStart(5)} (${t.share.toFixed(0)}%)       ${t.per1000.toFixed(1).padStart(8)}          ${String(t.reached).padStart(3)}/${t.maj}              ${t.picks.quiet}/${t.picks.middle}/${t.picks.eager}`);
  }
  console.log('\n  Spearman, history rate vs future rate across series:');
  for (const k of Object.keys(SETTINGS)) console.log(`    ${k.padEnd(7)} ${spearman(per.map((p) => p[k].histRate), per.map((p) => p[k].futRate)).toFixed(3)}`);
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
  const main = report('Round 6, the 31 shipped univariate TCPD series (the rule)', sets[0], per.slice(0, nT));
  const h = main['hint, B = 2 (pre-registered)'], q = main['fixed quiet (default)'], m = main['fixed middle'];
  const a = h.reached > q.reached, b = h.per1000 <= m.per1000, c = h.share >= q.share - 5;
  const rho = spearman(per.slice(0, nT).map((p) => p.quiet.histRate), per.slice(0, nT).map((p) => p.quiet.futRate));
  console.log(`\n  Rule: (a) more marks than quiet: ${h.reached} vs ${q.reached} ${a ? 'PASS' : 'FAIL'}; (b) per 1000 at most middle's: ${h.per1000.toFixed(1)} vs ${m.per1000.toFixed(1)} ${b ? 'PASS' : 'FAIL'}; (c) share at most 5 points below quiet's: ${h.share.toFixed(1)}% vs ${q.share.toFixed(1)}% ${c ? 'PASS' : 'FAIL'}.`);
  console.log(`  The hint ${a && b && c ? 'SHIPS' : 'does NOT ship'}. Forecast claim (quiet Spearman >= 0.5): ${rho.toFixed(3)} ${rho >= 0.5 ? 'SHIPS' : 'does NOT ship'}.\n`);
  report('Held out (deciding nothing)', sets[1], per.slice(nT));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s on ${availableParallelism()} cores.`);
}
