// Round 12 of the watch: a third labelled set, SKAB's 33 real fault runs, every sensor watched at once (`--columns all`).
// Pre-registered 2026-11-14: this header, the rules and the code below were written and committed before any run that
// printed a score. A timing-only pilot (one column of valve1/1.csv, printing checks and milliseconds per setting and
// nothing else) showed that a check after every 1-second row costs about 80 s per column and setting, about 6 hours
// for the round, and that 5-second buckets cost about 0.7 s; so the round runs on 5-second buckets.
//
//   sh eval/skab-fetch.sh skab-data
//   node eval/watch-skab.mjs skab-data > eval/watch-skab.out.txt
//
// Why (README "Round 11"): the watch's open decisions wait on "a third labelled set, not a third look at NAB". Rounds 10
// and 11 left three things to test on fresh data: (1) the "How eager" hint, confirmed narrowly on TCPD and not
// confirmed on NAB; (2) NAB's post hoc reading that "Wandering level" (drift) alerts land on labelled events more often
// than the level settings, at about half their alerts (20.5% against Quiet's 13.6%, 1.7 times chance); (3) the open
// item on `--columns` (README "Several metrics in one watch"): does the unsplit default stay near the alert budget on a
// real, many-column normal run? No round has had labelled data for several columns at once.
//
// Data: the Skoltech Anomaly Benchmark (SKAB v0.9; Katser and Kozitsin 2020; GPL-3.0, fetched, not committed). A water
// circulation testbed logs 8 sensors once a second: two accelerometer RMS, motor current, pressure, motor body
// temperature, fluid thermocouple, motor voltage, flow rate. 33 runs each hold one fault, made on purpose: a valve
// closed at the pump's inlet (valve1, 16 runs) or outlet (valve2, 3; SKAB's data README lists a fourth, not in the
// repository), and 14 others (fluid leaks and additions, rotor
// imbalance of five shapes, water added slowly or suddenly, tank drained to cavitation, two-phase inflow, hot water).
// Each run has an `anomaly` column (1 during the fault) and a `changepoint` column marking the fault's start, the end
// of its transition, the start of the return and the return (usually 4; 125 marked rows, 123 marks once in buckets). A separate run of about
// 2.6 hours is anomaly-free. Nobody in this repository has looked at these series before; the 33 fault files' labels were
// counted (marks per file, to size the windows) and nothing else.
//
// Design. (i) 5-second buckets: each run's rows are averaged in consecutive groups of 5 (a last partial group is
// dropped), about 230 points a run and 1,881 for the anomaly-free run; a mark's bucket is its row's. (ii) Every one of
// the 8 columns is watched, as `watch.mjs --columns all` does: each column runs the one-column watch under the shipped
// policy (window 1,000, confirm 5, tolerance 5, hold history, persist 2; level model, raw values, no log, no period),
// replayed with replayWatch from point 20 (the first 100 s are the baseline) and checked after every point. (iii) The
// whole run after the baseline is scored; the history the hint reads is the anomaly-free run, the normal operation of
// the same testbed (a person setting up a watch on a machine replays it on a normal day). So each column's hint pick is
// made once, from the anomaly-free run, and applied to all 33 fault runs.
//
// Settings: quiet bocpd-ar1-window (default), middle bocpd, drift drift, eager pelt.
// Policies, each one setting per column: fixed quiet / middle / drift / eager; hint3 (shipped: per column, the most
// eager of eager > middle > quiet whose anomaly-free rate is at most B = 2 per 100 checks, else quiet); hintNN (round
// 10's non-nested candidate: drift when quiet's rate is over B and drift's is below quiet's, else hint3).
//
// Scores, over the 33 fault runs, after the baseline. A mark's window is [b - 1, b + 12] in buckets (5 s before to 60 s
// after the marked second; 60 s right of the mark is SKAB's own leaderboard window). An alert line is one column's
// alert; a whole-watch check is one point (all columns are checked together). Alerts; share "at a mark" (the alerted
// change's index inside any mark's window of that run); alert lines per 1,000 whole-watch checks; marks reached (some
// alert line's change index inside the mark's window); faults caught (the first mark, the fault's start, reached) and
// the median delay from the fault's start to the first alert line that reached it, in seconds. Chance for "at a mark":
// the share of scored points inside any mark window. On the anomaly-free run, every alert line is false: alert lines
// per 100 whole-watch checks. (hint3 and hintNN were picked on that run, so their null rates are in-sample.)
//
// Rules, written before the run. Ties in a "more" part fail; "at least" and "at most" include ties.
//  T6, the hint on a third labelled set (round 6's rule, as round 10's T1): hint3 against fixed quiet. (a) more marks
//      reached; (b) alert lines per 1,000 checks at most fixed middle's; (c) share at a mark at most 5 points below
//      quiet's. Pass: the hint's text (eagernessText: the page, `--suggest`, the agent tool) says it was confirmed on
//      SKAB. Fail: the text says it was not confirmed on SKAB either.
//  T7, NAB's drift reading on fresh data: fixed drift against fixed quiet. (a) share at a mark at least quiet's + 2
//      points; (b) alert lines per 1,000 checks at most quiet's. Pass: the "Wandering level" help on the page and in
//      `watch.mjs --help` says that on two labelled sets its alerts sat on labelled events more often, at fewer alerts,
//      and gives both sets' reach. Fail: nothing new is said about drift.
//  T8, the unsplit `--columns all` default on a real normal run: fixed quiet's alert lines on the anomaly-free run, at
//      most 2 per 100 whole-watch checks (the hint's budget). Pass: the README records it, nothing changes. Fail:
//      `watch.mjs --help`'s `--columns` text and the watch page's help say how many lines Quiet sent per 100 checks on
//      SKAB's normal run and to replay with `--suggest` first.
//  Nothing in the default changes from this round either way.
//
// Predictions, written before the run. T6: the testbed's normal run is calm on most sensors at 5-second buckets, so the
// hint picks Middle or Eager on several columns; the faults are clear steps (a closed valve moves flow, pressure and
// current at once), so the eager picks reach more marks, but they also alert on the return and transition marks'
// noise; I predict (a) passes and (b) fails: T6 is not confirmed. T7: SKAB's faults are steps a few minutes long, which
// the drift model partly absorbs as wander (as NAB's taxi holidays were), so drift sends fewer alerts and its share is
// higher; I predict T7 passes on both parts but drift catches clearly fewer fault starts than Quiet. T8: the
// accelerometer and voltage columns are noisy and the thermocouple wanders slowly over 2.6 hours, so eight columns give
// Quiet many chances; I predict Quiet sends more than 2 lines per 100 whole-watch checks on the normal run and T8 fails.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch } from '../watch-core.mjs';

export const BUCKET = 5;
export const FROM = 20;
export const WIN = [1, 12];
const B = 2;
export const SETTINGS = { quiet: 'bocpd-ar1-window', middle: 'bocpd', drift: 'drift', eager: 'pelt' };
const KEYS = Object.keys(SETTINGS);
const LADDER3 = ['eager', 'middle', 'quiet'];
const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000 };
export const COLUMNS = ['Accelerometer1RMS', 'Accelerometer2RMS', 'Current', 'Pressure', 'Temperature', 'Thermocouple', 'Voltage', 'Volume Flow RateRMS'];
export const FILES = [
  ...Array.from({ length: 16 }, (_, i) => `valve1/${i}.csv`),
  ...[1, 2, 3].map((i) => `valve2/${i}.csv`),
  ...Array.from({ length: 14 }, (_, i) => `other/${i + 1}.csv`),
];

// Answer only workers this file started.
if (!isMainThread && workerData === import.meta.url) {
  parentPort.on('message', ({ id, values, detector }) => {
    const t = Date.now();
    const r = replayWatch(values, null, { ...POLICY, detector, from: FROM, budget: Infinity });
    parentPort.postMessage({ id, checks: r.checks, secs: (Date.now() - t) / 1000, alerts: r.alerts.map((a) => ({ index: a.index, at: a.reportedAt })) });
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
      const feed = () => { if (next < order.length) { const id = order[next++]; worker.postMessage({ id, values: jobs[id].values, detector: jobs[id].detector }); } else worker.terminate(); };
      worker.on('message', (m) => { if (results[m.id]) { reject(new Error(`job ${m.id} answered twice`)); return; } results[m.id] = m; done++; if (done % 50 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

/** Parse one SKAB file (semicolon-separated, CRLF): the 8 sensor columns, and the anomaly and changepoint flags. */
export function parseSkab(text, name = '') {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  const head = lines[0].split(';');
  const at = (h) => { const i = head.indexOf(h); if (i < 0) throw new Error(`${name}: no column ${h}`); return i; };
  const ci = COLUMNS.map(at);
  const ai = head.indexOf('anomaly'), pi = head.indexOf('changepoint');
  const rows = lines.slice(1).map((l) => l.split(';'));
  const cols = ci.map((i) => rows.map((r) => { const v = Number(r[i]); if (!Number.isFinite(v)) throw new Error(`${name}: a bad value`); return v; }));
  const anomaly = ai < 0 ? rows.map(() => 0) : rows.map((r) => Number(r[ai]));
  const cp = pi < 0 ? rows.map(() => 0) : rows.map((r) => Number(r[pi]));
  return { cols, anomaly, cp, rows: rows.length };
}

/** Means of consecutive groups of `k` values; a last partial group is dropped. */
export function buckets(v, k = BUCKET) {
  const out = [];
  for (let i = 0; i + k <= v.length; i += k) { let s = 0; for (let j = 0; j < k; j++) s += v[i + j]; out.push(s / k); }
  return out;
}

/** One run in buckets: the 8 columns, its mark buckets (deduplicated, in order) and the fault's start bucket. */
export function runFrom(parsed, name) {
  const cols = parsed.cols.map((c) => buckets(c));
  const n = cols[0].length;
  const marks = [...new Set(parsed.cp.flatMap((x, r) => (x === 1 ? [Math.floor(r / BUCKET)] : [])))].filter((b) => b < n);
  const a0 = parsed.anomaly.indexOf(1);
  const start = a0 < 0 ? null : Math.floor(a0 / BUCKET);
  const wins = marks.map((b) => ({ b, lo: b - WIN[0], hi: b + WIN[1], start: b === start }));
  let covered = 0;
  for (let i = FROM; i < n; i++) if (wins.some((w) => i >= w.lo && i <= w.hi)) covered++;
  return { name, cols, n, marks, start, wins, covered, scored: n - FROM };
}

export function loadSkab(dir) {
  const runs = FILES.map((f) => runFrom(parseSkab(readFileSync(join(dir, f), 'utf8'), f), f));
  const free = runFrom(parseSkab(readFileSync(join(dir, 'anomaly-free', 'anomaly-free.csv'), 'utf8'), 'anomaly-free'), 'anomaly-free');
  return { runs, free };
}

export const hint3 = (rates, b = B) => LADDER3.find((k) => rates[k] <= b) ?? 'quiet';
export const hintNN = (rates, b = B) => (rates.quiet > b && rates.drift < rates.quiet ? 'drift' : hint3(rates, b));

const inWin = (w, i) => i >= w.lo && i <= w.hi;

/**
 * Score one policy over the fault runs. alertsOf(run, column, key) gives that column's alerts ({index, at}) under a
 * setting; picks[column] is the policy's setting for each column.
 */
export function score(runs, alertsOf, picks) {
  const t = { alerts: 0, atMark: 0, checks: 0, marks: 0, reached: 0, faults: 0, caught: 0, delays: [] };
  for (const r of runs) {
    const lines = COLUMNS.flatMap((_, c) => alertsOf(r, c, picks[c]));
    t.alerts += lines.length; t.checks += r.scored;
    t.atMark += lines.filter((a) => r.wins.some((w) => inWin(w, a.index))).length;
    for (const w of r.wins) {
      if (w.b < FROM) continue;
      t.marks++;
      const hit = lines.filter((a) => inWin(w, a.index));
      if (hit.length) t.reached++;
      if (w.start) { t.faults++; if (hit.length) { t.caught++; t.delays.push(BUCKET * (Math.min(...hit.map((a) => a.at)) - w.b)); } }
    }
  }
  t.share = t.alerts ? (100 * t.atMark) / t.alerts : 0;
  t.per1000 = t.checks ? (1000 * t.alerts) / t.checks : 0;
  const d = [...t.delays].sort((x, y) => x - y), m = d.length >> 1;
  t.medianDelay = d.length ? (d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2) : null;
  return t;
}

/** The three rules on scored totals (exported so the test can check them on made-up numbers). */
export function rules(T, nullQuietPer100) {
  const q = T.quiet, m = T.middle, d = T.drift, h = T.hint3;
  const t6 = [h.reached > q.reached, h.per1000 <= m.per1000, h.share >= q.share - 5];
  const t7 = [d.share >= q.share + 2, d.per1000 <= q.per1000];
  const t8 = [nullQuietPer100 <= B];
  return { t6, t7, t8, T6: t6.every(Boolean), T7: t7.every(Boolean), T8: t8.every(Boolean) };
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'skab-data';
  const t0 = Date.now();
  const { runs, free } = loadSkab(dir);
  const all = [free, ...runs];
  const jobs = [];
  all.forEach((r, ri) => r.cols.forEach((values, c) => { for (const [k, detector] of Object.entries(SETTINGS)) jobs.push({ ri, c, k, values, detector }); }));
  const res = await runAll(jobs);
  const got = all.map((r) => r.cols.map(() => ({})));
  jobs.forEach((j, i) => { got[j.ri][j.c][j.k] = res[i]; });
  const alertsOf = (r, c, k) => got[all.indexOf(r)][c][k].alerts;

  // Null rates per column on the anomaly-free run, and the hint's picks from them.
  const rates = COLUMNS.map((_, c) => Object.fromEntries(KEYS.map((k) => [k, (100 * got[0][c][k].alerts.length) / free.scored])));
  const P = {
    quiet: COLUMNS.map(() => 'quiet'), middle: COLUMNS.map(() => 'middle'), drift: COLUMNS.map(() => 'drift'), eager: COLUMNS.map(() => 'eager'),
    hint3: rates.map((x) => hint3(x)), hintNN: rates.map((x) => hintNN(x)),
  };
  const nullPer100 = (picks) => (100 * COLUMNS.reduce((a, _, c) => a + got[0][c][picks[c]].alerts.length, 0)) / free.scored;

  console.log(`Round 12: the watch on SKAB, ${runs.length} fault runs and 1 anomaly-free run, ${COLUMNS.length} sensors each, in ${BUCKET}-second buckets (${runs.reduce((a, r) => a + r.n, 0)} points a column on the fault runs, ${free.n} on the normal run), checked after every point from point ${FROM}.\n`);
  console.log('  anomaly-free run, alert lines per 100 checks by column (quiet / middle / drift / eager) and the picks');
  COLUMNS.forEach((name, c) => console.log(`  ${name.padEnd(22)} ${KEYS.map((k) => rates[c][k].toFixed(2).padStart(6)).join(' ')}   hint3 ${P.hint3[c].padEnd(6)} hintNN ${P.hintNN[c]}`));
  const chance = runs.reduce((a, r) => a + r.covered, 0) / runs.reduce((a, r) => a + r.scored, 0);
  console.log(`\n  Chance: ${(100 * chance).toFixed(1)}% of scored points lie inside a mark window.\n`);
  console.log('  per run: n, marks, start; faults caught by quiet / middle / drift / eager / hint3, and alert lines');
  for (const r of runs) {
    const one = (picks) => score([r], alertsOf, picks);
    console.log(`  ${r.name.padEnd(16)} ${String(r.n).padStart(4)} ${String(r.marks.length).padStart(2)} ${String(r.start).padStart(4)}   ${['quiet', 'middle', 'drift', 'eager', 'hint3'].map((k) => { const s = one(P[k]); return `${s.caught ? 'Y' : '-'}${String(s.alerts).padStart(3)}`; }).join('  ')}`);
  }
  const T = {};
  console.log('\n  policy (33 fault runs, 8 columns)  alert lines  at a mark (share)  per 1000 checks  marks reached  faults caught  median delay s  null per 100');
  for (const k of Object.keys(P)) {
    const t = (T[k] = score(runs, alertsOf, P[k]));
    console.log(`  ${(k === 'quiet' ? 'fixed quiet (default)' : k.startsWith('hint') ? `${k}, B = 2` : `fixed ${k}`).padEnd(34)} ${String(t.alerts).padStart(8)}   ${String(t.atMark).padStart(6)} (${t.share.toFixed(1).padStart(4)}%)   ${t.per1000.toFixed(1).padStart(9)}     ${String(t.reached).padStart(4)}/${t.marks}      ${String(t.caught).padStart(3)}/${t.faults}      ${t.medianDelay === null ? '   -' : String(t.medianDelay).padStart(5)}        ${nullPer100(P[k]).toFixed(2)}`);
  }
  const { t6, t7, t8, T6, T7, T8 } = rules(T, nullPer100(P.quiet));
  const v = (x) => (x ? 'PASS' : 'FAIL');
  const q = T.quiet, m = T.middle, d = T.drift, h = T.hint3;
  console.log(`\n  T6 hint3 vs quiet: (a) ${h.reached} vs ${q.reached} ${v(t6[0])}; (b) ${h.per1000.toFixed(1)} vs middle ${m.per1000.toFixed(1)} ${v(t6[1])}; (c) ${h.share.toFixed(1)}% vs ${q.share.toFixed(1)}% - 5 ${v(t6[2])}. ${T6 ? 'CONFIRMED' : 'NOT CONFIRMED'}.`);
  console.log(`  T7 drift vs quiet: (a) ${d.share.toFixed(1)}% vs ${q.share.toFixed(1)}% + 2 ${v(t7[0])}; (b) ${d.per1000.toFixed(1)} vs ${q.per1000.toFixed(1)} ${v(t7[1])}. ${T7 ? 'PASSES' : 'FAILS'}.`);
  console.log(`  T8 quiet on all 8 columns of the normal run: ${nullPer100(P.quiet).toFixed(2)} lines per 100 checks vs ${B} ${v(t8[0])}. ${T8 ? 'PASSES' : 'FAILS'}.`);

  console.log('\n  Reported only, deciding nothing.\n');
  console.log('  by column, fixed quiet: alert lines, at a mark, faults caught (alone)');
  COLUMNS.forEach((name, c) => {
    const picks = COLUMNS.map(() => null);
    const one = score(runs, (r, cc, k) => (cc === c ? alertsOf(r, cc, 'quiet') : []), picks);
    console.log(`  ${name.padEnd(22)} ${String(one.alerts).padStart(5)} ${String(one.atMark).padStart(5)} (${one.share.toFixed(1)}%)  ${one.caught}/${one.faults}`);
  });
  for (const folder of ['valve1', 'valve2', 'other']) {
    const sub = runs.filter((r) => r.name.startsWith(folder + '/'));
    console.log(`\n  ${folder} (${sub.length}): faults caught / marks reached / share at a mark`);
    for (const k of Object.keys(P)) { const t = score(sub, alertsOf, P[k]); console.log(`  ${k.padEnd(8)} ${t.caught}/${t.faults}  ${t.reached}/${t.marks}  ${t.share.toFixed(1)}%  (${t.alerts} lines)`); }
  }
  const secs = res.reduce((a, r) => a + r.secs, 0);
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall, ${secs.toFixed(0)} s of replays on ${availableParallelism()} cores.`);
}
