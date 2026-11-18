// Round 10 of the watch: the first labelled set from outside TCPD. Pre-registered 2026-11-13: this header, the rule
// and the code below were written and committed before any run that printed a score (a timing-only pilot on one
// series, printing step, checks and seconds, showed native resolution was too slow and chose hourly buckets).
//
//   sh eval/nab-fetch.sh nab-data
//   node eval/watch-nab.mjs nab-data > eval/watch-nab.out.txt
//
// Why (README "Round 6" to "Round 9"): every watch round so far was scored on TCPD's 31 univariate series, and rounds
// 3-9 have all seen them. Three things wait on a fresh labelled set: (1) the "Which How eager suits this series?" hint
// (shipped narrowly in round 6, 17 of 31 future marks against quiet's 16); (2) round 9's post hoc lead that fixed drift
// beat fixed middle on all three counts; (3) a hint rule that does not assume nested settings.
//
// Data: the Numenta Anomaly Benchmark (NAB; Lavin and Ahmad 2015; MIT), its 47 real series (AWS CloudWatch, ad exchange,
// known-cause failures, Twin Cities traffic, Twitter volumes; 1,127 to 22,695 points each), with NAB's combined labels
// and windows (all 47 have h of at least 52 hourly points, so none is skipped). Nobody in this repository has looked at these series before. They are labelled for anomalies, not change
// points: a window marks an anomaly (a spike, a failure, a change of regime), sized by NAB to 10% of the file divided by
// its number of anomalies, and NAB rewards a detection anywhere inside it. So this set tests the watch as a monitor of
// operational metrics, which is what people set it up for, and its windows are wide: the share of future points inside
// a window is printed as the chance rate for "at a window".
//
// Design: round 9's, with one change forced by length. (i) An hourly watch: each series is averaged into clock-hour
// buckets (empty hours skipped; the ad-exchange and ambient-temperature series are already hourly, nyc_taxi is half-
// hourly). At NAB's native 5-minute rows a check after every row would take about 15 hours here; hourly it is 48,163
// points and about 40 minutes, and an hourly scheduled check is what a person monitoring these metrics would run.
// Windows and labels are mapped to the buckets by time. (ii) Values raw, no log, no season, the watch's shipped
// defaults (window 1,000, confirm 5, tolerance 5, hold history, persist 2), level model. (iii) Each series is cut at
// h = floor(n/2) and replayed with replayWatch (watch-core.mjs) from start = max(20, floor(0.2 h)), checked after every
// point (BUDGET = Infinity, so step 1 and no bisection). History alerts are those reported at a point < h, future the
// rest; rates per 100 checks. A window is a future window when its labelled anomaly point is at or after h; a window
// with no label inside uses its midpoint.
//
// Scores, future halves only: alerts; alerts "at a window" (the alerted change's index lies inside any labelled window
// of the series, history ones included); per 1,000 checks; future windows reached (some future alert's change index lies
// inside it). Rates per 1,000 are per hourly check. Reported beside, deciding nothing: windows reached NAB's way (some future alert reported inside it) and
// the chance rate.
//
// Settings: quiet bocpd-ar1-window (default), middle bocpd, drift drift, eager pelt.
// Policies: fixed quiet / middle / drift / eager; hint3 (shipped: the most eager of eager > middle > quiet whose history
// rate is at most B = 2, else quiet); hintNN (candidate, not nested): drift when quiet's history rate is over B and
// drift's history rate is below quiet's (the series is too loud for the default and the wandering-level model is quieter
// on it), otherwise hint3. Reported only: hint3 at B = 1 and B = 5; round 9's four-rung ladder.
//
// Rules, written before the run. Each is applied to the 47 series; ties in (a) fail.
//  T1, the hint on fresh data (round 6's rule): hint3 against fixed quiet. (a) more future windows reached; (b) future
//      alerts per 1,000 checks at most fixed middle's; (c) share at a window at most 5 points below quiet's.
//      Pass: the README calls the hint confirmed on a second labelled set and the hint text cites it. Fail: the hint
//      stays (it is opt-in advice, not a default) but its text says it was not confirmed on NAB and why.
//  T2, round 9's lead: fixed drift against fixed middle. (a) at least as many future windows reached; (b) per 1,000
//      points at most middle's; (c) share at a window at least middle's. Pass: the lead is confirmed and the next round
//      may pre-register drift in place of middle on the page's select. Fail: the lead is dropped. No code changes here.
//  T3, a non-nested hint: hintNN against hint3. (a) more future windows reached; (b) per 1,000 checks at most fixed
//      middle's; (c) share at a window at most 5 points below hint3's. Pass: hintNN ships in eagernessReplay, the page,
//      `watch.mjs --suggest` / `--detector auto` and the agent tool. Fail: the hint stays nested.
//
// Predictions, written before the run. T1: server metrics are spiky and loud, so quiet is often over B on the history
// and the hint picks quiet there; elsewhere it moves a few series to middle; (a) passes by a few windows, (b) and (c)
// pass. T2: NAB's anomalies are mostly spikes and short excursions, not long wandering levels, and drift absorbs short
// excursions as wander, so drift reaches fewer windows than middle and T2 fails on (a). T3: round 9 found drift quieter
// than quiet on only 1 of 9 loud series; on NAB the loud series are spiky rather than wandering, so hintNN moves few
// series and T3 fails on (a) by a tie or near tie.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch } from '../watch-core.mjs';

export const BUDGET = Infinity;
const B = 2;
const SETTINGS = { quiet: 'bocpd-ar1-window', middle: 'bocpd', drift: 'drift', eager: 'pelt' };
const KEYS = Object.keys(SETTINGS);
const LADDER3 = ['eager', 'middle', 'quiet'];
const LADDER4 = ['eager', 'drift', 'middle', 'quiet'];
const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000 };

// Answer only workers this file started: a script that imports this one starts workers with its own URL.
if (!isMainThread && workerData === import.meta.url) {
  parentPort.on('message', ({ id, values, start, detector }) => {
    const t = Date.now();
    const r = replayWatch(values, null, { ...POLICY, detector, from: start, budget: BUDGET });
    parentPort.postMessage({ id, step: r.step, checks: r.checks, secs: (Date.now() - t) / 1000, alerts: r.alerts.map((a) => ({ index: a.index, at: a.reportedAt })) });
  });
}

async function runAll(jobs) {
  const results = new Array(jobs.length);
  const k = Math.max(1, Math.min(jobs.length, availableParallelism()));
  let next = 0, done = 0;
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[b].values.length - jobs[a].values.length);
  await new Promise((resolve, reject) => {
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: import.meta.url });
      const feed = () => { if (next < order.length) { const id = order[next++]; const j = jobs[id]; worker.postMessage({ id, values: j.values, start: j.start, detector: j.detector }); } else worker.terminate(); };
      worker.on('message', (m) => { results[m.id] = m; done++; if (done % 10 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

const HOUR = 3600e3;
const floorHour = (x) => Math.floor(x / HOUR) * HOUR;
/** Average [time, value] rows into clock-hour buckets; t is each bucket's start. */
export function hourly(rows, name = '') {
  const t = [], values = [];
  let sum = 0, k = 0, cur = null;
  for (const [time, v] of rows) {
    if (!Number.isFinite(v) || !Number.isFinite(time)) throw new Error(`${name}: a bad row`);
    const b = floorHour(time);
    if (cur !== null && b !== cur) { t.push(cur); values.push(sum / k); sum = 0; k = 0; }
    cur = b; sum += v; k++;
  }
  if (k) { t.push(cur); values.push(sum / k); }
  return { t, values };
}
const ts = (s) => Date.parse(s.replace(' ', 'T').replace(/\.\d+$/, '') + 'Z');

export function loadNab(dir) {
  const windows = JSON.parse(readFileSync(join(dir, 'windows.json'), 'utf8'));
  const labels = JSON.parse(readFileSync(join(dir, 'labels.json'), 'utf8'));
  const series = [];
  for (const name of Object.keys(windows).filter((k) => k.startsWith('real')).sort()) {
    const rows = readFileSync(join(dir, 'data', name), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
    const { t, values } = hourly(rows.map((r) => [ts(r[0]), Number(r[1])]), name);
    const idx = (time, after) => { let i = t.findIndex((x) => x >= time); if (i < 0) i = t.length; return after ? i - (t[i] === time ? 0 : 1) : i; };
    const n = values.length, h = Math.floor(n / 2), start = Math.max(20, Math.floor(0.2 * h));
    const labIdx = (labels[name] || []).map((s) => idx(floorHour(ts(s)), false));
    const wins = windows[name].map(([a, b]) => {
      const lo = idx(floorHour(ts(a)), false), hi = Math.min(n - 1, idx(floorHour(ts(b)), true));
      const lab = labIdx.find((x) => x >= lo && x <= hi) ?? Math.floor((lo + hi) / 2);
      return { lo, hi, lab, future: lab >= h };
    });
    let covered = 0;
    for (let i = h; i < n; i++) if (wins.some((w) => i >= w.lo && i <= w.hi)) covered++;
    series.push({ name, values, n, h, start, wins, chance: covered / (n - h) });
  }
  return series;
}

function perSeries(s, res) {
  const out = {};
  for (const k of KEYS) {
    const r = res[k];
    const hist = r.alerts.filter((a) => a.at < s.h), fut = r.alerts.filter((a) => a.at >= s.h);
    out[k] = { histRate: (100 * hist.length) / (s.h - s.start), futRate: (100 * fut.length) / (s.n - s.h), fut, step: r.step, secs: r.secs };
  }
  return out;
}

export const hint3 = (ps, b = B) => LADDER3.find((k) => ps[k].histRate <= b) ?? 'quiet';
export const hintNN = (ps, b = B) => (ps.quiet.histRate > b && ps.drift.histRate < ps.quiet.histRate ? 'drift' : hint3(ps, b));
const hint4 = (ps, b = B) => LADDER4.find((k) => ps[k].histRate <= b) ?? 'quiet';

const inWin = (w, i) => i >= w.lo && i <= w.hi;
const reachedBy = (s, fut, key) => s.wins.filter((w) => w.future && fut.some((a) => inWin(w, a[key]))).length;

function score(series, per, pick) {
  const t = { alerts: 0, atWin: 0, points: 0, wins: 0, reached: 0, reachedNab: 0, picks: Object.fromEntries(KEYS.map((k) => [k, 0])) };
  series.forEach((s, i) => {
    const k = pick(per[i]);
    t.picks[k]++;
    const { fut } = per[i][k];
    t.alerts += fut.length; t.points += s.n - s.h; t.wins += s.wins.filter((w) => w.future).length;
    t.atWin += fut.filter((a) => s.wins.some((w) => inWin(w, a.index))).length;
    t.reached += reachedBy(s, fut, 'index');
    t.reachedNab += reachedBy(s, fut, 'at');
  });
  t.share = t.alerts ? (100 * t.atWin) / t.alerts : 0;
  t.per1000 = (1000 * t.alerts) / t.points;
  return t;
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'nab-data';
  const t0 = Date.now();
  const series = loadNab(dir);
  const jobs = [];
  series.forEach((s, si) => { for (const [k, detector] of Object.entries(SETTINGS)) jobs.push({ si, k, values: s.values, start: s.start, detector }); });
  const res = await runAll(jobs);
  const bySeries = series.map(() => ({}));
  jobs.forEach((j, i) => { bySeries[j.si][j.k] = res[i]; });
  const per = series.map((s, i) => perSeries(s, bySeries[i]));
  const chance = series.reduce((a, s) => a + s.chance * (s.n - s.h), 0) / series.reduce((a, s) => a + (s.n - s.h), 0);

  console.log(`Round 10: an hourly watch on NAB's ${series.length} real series (${series.reduce((a, s) => a + s.n, 0)} hourly points, checked after every point).\n`);
  console.log('  series                                          n     h  step q/m/d/e      hist rate q/m/d/e (per 100)   fut rate q/m/d/e              hint3  hintNN  future windows (reached by quiet / hint3 / hintNN)');
  series.forEach((s, i) => {
    const p = per[i], f = (k, w) => p[k][w].toFixed(2).padStart(5);
    const a = hint3(p), b = hintNN(p), fw = s.wins.filter((w) => w.future).length;
    console.log(`  ${s.name.padEnd(45)} ${String(s.n).padStart(6)} ${String(s.h).padStart(5)}  ${KEYS.map((k) => String(p[k].step).padStart(3)).join(' ')}   ${KEYS.map((k) => f(k, 'histRate')).join(' ')}   ${KEYS.map((k) => f(k, 'futRate')).join(' ')}   ${a.padEnd(6)} ${b.padEnd(6)}  ${fw} (${reachedBy(s, p.quiet.fut, 'index')} / ${reachedBy(s, p[a].fut, 'index')} / ${reachedBy(s, p[b].fut, 'index')})`);
  });
  const rows = [
    ['fixed quiet (default)', () => 'quiet'],
    ['fixed middle', () => 'middle'],
    ['fixed drift', () => 'drift'],
    ['fixed eager', () => 'eager'],
    ['hint3, B = 2 (shipped)', (p) => hint3(p)],
    ['hintNN, B = 2 (candidate)', (p) => hintNN(p)],
    ['hint3, B = 1', (p) => hint3(p, 1)],
    ['hint3, B = 5', (p) => hint3(p, 5)],
    ['round 9 four-rung, B = 2', (p) => hint4(p)],
  ];
  console.log(`\n  Chance: ${(100 * chance).toFixed(1)}% of future points lie inside a labelled window.\n`);
  console.log('  policy                        future alerts  at a window (share)  per 1000 checks  windows reached  (NAB way: reported inside)  picks q/m/d/e');
  const T = {};
  for (const [name, pick] of rows) {
    const t = score(series, per, pick);
    T[name] = t;
    console.log(`  ${name.padEnd(29)} ${String(t.alerts).padStart(8)}      ${String(t.atWin).padStart(5)} (${t.share.toFixed(1)}%)      ${t.per1000.toFixed(2).padStart(8)}         ${String(t.reached).padStart(3)}/${t.wins}            ${String(t.reachedNab).padStart(3)}/${t.wins}               ${KEYS.map((k) => t.picks[k]).join('/')}`);
  }
  const q = T['fixed quiet (default)'], m = T['fixed middle'], d = T['fixed drift'], h3 = T['hint3, B = 2 (shipped)'], nn = T['hintNN, B = 2 (candidate)'];
  const v = (x) => (x ? 'PASS' : 'FAIL');
  const t1 = [h3.reached > q.reached, h3.per1000 <= m.per1000, h3.share >= q.share - 5];
  const t2 = [d.reached >= m.reached, d.per1000 <= m.per1000, d.share >= m.share];
  const t3 = [nn.reached > h3.reached, nn.per1000 <= m.per1000, nn.share >= h3.share - 5];
  console.log(`\n  T1 hint3 vs quiet: (a) ${h3.reached} vs ${q.reached} ${v(t1[0])}; (b) ${h3.per1000.toFixed(2)} vs middle ${m.per1000.toFixed(2)} ${v(t1[1])}; (c) ${h3.share.toFixed(1)}% vs ${q.share.toFixed(1)}% - 5 ${v(t1[2])}. ${t1.every(Boolean) ? 'CONFIRMED' : 'NOT CONFIRMED'}.`);
  console.log(`  T2 drift vs middle: (a) ${d.reached} vs ${m.reached} ${v(t2[0])}; (b) ${d.per1000.toFixed(2)} vs ${m.per1000.toFixed(2)} ${v(t2[1])}; (c) ${d.share.toFixed(1)}% vs ${m.share.toFixed(1)}% ${v(t2[2])}. ${t2.every(Boolean) ? 'CONFIRMED' : 'DROPPED'}.`);
  console.log(`  T3 hintNN vs hint3: (a) ${nn.reached} vs ${h3.reached} ${v(t3[0])}; (b) ${nn.per1000.toFixed(2)} vs middle ${m.per1000.toFixed(2)} ${v(t3[1])}; (c) ${nn.share.toFixed(1)}% vs ${h3.share.toFixed(1)}% - 5 ${v(t3[2])}. ${t3.every(Boolean) ? 'SHIPS' : 'does NOT ship'}.`);
  const secs = res.reduce((a, r) => a + r.secs, 0);
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall, ${secs.toFixed(0)} s of replays on ${availableParallelism()} cores.`);
}
