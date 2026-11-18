// Round 13 of the watch: a whole-watch rule for several columns, "alert only when two columns agree", on SKAB.
// Pre-registered 2026-11-14: this header, the rule, the predictions and the code below were written and committed
// before any run that printed a score.
//
//   sh eval/skab-fetch.sh skab-data
//   node eval/watch-skab-agree.mjs skab-data > eval/watch-skab-agree.out.txt
//
// Why (README "Round 12"; flagship next: "a whole-watch budget or a column screen"). Round 12 watched SKAB's 8 sensors
// with `--columns all`, each column on its own, and Quiet sent 8.54 alert lines per 100 checks of the anomaly-free run,
// every one false, against the hint's budget of 2. Splitting the budget across columns failed earlier (README "Several
// metrics in one watch"), and could not have helped here: Quiet is already the floor of the ladder. A column screen by
// loudness would keep the quiet columns (pressure, voltage, current), which caught no fault alone, and could drop flow
// rate, which caught 29 of 33. So this round tests a rule that works on the whole watch instead of on each column: a
// message goes out only when at least k = 2 columns date a change within W points of each other. Independent noise in
// two columns rarely lands on the same point; a real fault on a machine usually moves more than one sensor.
//
// This is a second look at a seen set. Round 12's per-column output (eval/watch-skab.out.txt) is known: per column, the
// normal run's rates and, under Quiet, each column's lines, share at a mark and faults caught alone. Nobody has looked
// at which columns' alerts coincide in time. The replays are the same deterministic code as round 12's.
//
// Design. Round 12's data and replay unchanged (5-second buckets, 8 columns, shipped policy, replayed after every point
// from point 20, the anomaly-free run as the normal history, marks' windows [b - 1, b + 12]). Each column's alert lines
// ({ column, index, at }) go through agreeAlerts (watch-core.mjs) with W = 12 buckets (60 s, the right side of a mark's
// window), giving whole-watch alerts. A1 = agreeAlerts(k = 1): the same lines merged into one message per change, the
// like-for-like baseline; A2 = agreeAlerts(k = 2). A whole-watch alert is scored at its index (the change date of the
// line that completed it) and its `at`, with round 12's score(): alerts, share at a mark, per 1,000 checks, marks
// reached, faults caught, median delay; and, on the anomaly-free run, whole-watch alerts per 100 checks.
//
// The rule, written before the run (ties in a "more" part fail; "at least" and "at most" include ties).
//  T9, two columns agree, every column on Quiet (the default), A2 against A1:
//      (a) on the anomaly-free run, A2 sends at most 2 whole-watch alerts per 100 checks (the hint's budget);
//      (b) A2 catches at least A1's faults minus 2 (of 33);
//      (c) A2's share at a mark is at least A1's.
//  Pass: `watch.mjs --columns ... --agree 2` ships as an option (not a default), with the round's numbers in its help,
//  on the watch page and in the README. Fail: nothing ships; the README and `--columns`'s help record the result.
//
// Reported only, deciding nothing: A2 with every column on Middle, Drift and Eager (agreement may afford a more eager
// setting); A3 on Quiet; A1 and A2 by folder; which column pairs completed A2's alerts; and on synthetic noise, 5
// independent N(0,1) columns of 300 points, 10 seeds, Quiet, from point 60, A1 and A2 per 100 checks.
//
// Predictions, written before the run. (a) Temperature and Thermocouple both follow the room over 2.6 hours, so their
// drifts may be dated together; I predict A2's normal-run rate is about 1.5 per 100 checks, near the line, and could fail.
// (b) A closed valve moves flow rate, and current and the accelerometers with it; I predict A2 catches 30 or more of 33,
// passing. (c) Coinciding lines are likelier at a real event; I predict A2's share at a mark is clearly above A1's, about
// 50% against 37%. Overall: pass, with (a) the part at risk. I expect the median delay to grow by one or two buckets.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch, agreeAlerts } from '../watch-core.mjs';
import { SETTINGS, COLUMNS, FROM, loadSkab, score } from './watch-skab.mjs';

export const W = 12;
const B = 2;
const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000 };
const KEYS = Object.keys(SETTINGS);

if (!isMainThread && workerData === import.meta.url) {
  parentPort.on('message', ({ id, values, detector, from }) => {
    const r = replayWatch(values, null, { ...POLICY, detector, from, budget: Infinity });
    parentPort.postMessage({ id, alerts: r.alerts.map((a) => ({ index: a.index, at: a.reportedAt })) });
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
      const feed = () => { if (next < order.length) { const id = order[next++]; const j = jobs[id]; worker.postMessage({ id, values: j.values, detector: j.detector, from: j.from }); } else worker.terminate(); };
      worker.on('message', (m) => { if (results[m.id]) { reject(new Error(`job ${m.id} answered twice`)); return; } results[m.id] = m; done++; if (done % 50 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

/** Whole-watch alerts for one run from its columns' lines under one setting. */
export const wholeWatch = (perColumn, k, within = W) => agreeAlerts(perColumn.flatMap((a, c) => a.map((x) => ({ column: c, index: x.index, at: x.at }))), k, within);

/** T9 on scored totals (exported so the test can check it on made-up numbers). */
export function ruleT9(a1, a2, nullA2Per100) {
  const p = [nullA2Per100 <= B, a2.caught >= a1.caught - 2, a2.share >= a1.share];
  return { parts: p, pass: p.every(Boolean) };
}

/** Seeded N(0,1) noise (mulberry32 and Box-Muller), for the synthetic null. */
export function noise(n, seed) {
  let s = seed >>> 0;
  const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return Array.from({ length: n }, () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u()));
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'skab-data';
  const t0 = Date.now();
  const { runs, free } = loadSkab(dir);
  const all = [free, ...runs];
  const jobs = [];
  all.forEach((r, ri) => r.cols.forEach((values, c) => { for (const [k, detector] of Object.entries(SETTINGS)) jobs.push({ set: 'skab', ri, c, k, values, detector, from: FROM }); }));
  const SEEDS = 10, NCOL = 5, NPT = 300, SFROM = 60;
  for (let s = 0; s < SEEDS; s++) for (let c = 0; c < NCOL; c++) jobs.push({ set: 'noise', ri: s, c, k: 'quiet', values: noise(NPT, 1000 * (s + 1) + c), detector: SETTINGS.quiet, from: SFROM });
  const res = await runAll(jobs);
  const got = all.map((r) => r.cols.map(() => ({})));
  const syn = Array.from({ length: SEEDS }, () => []);
  jobs.forEach((j, i) => { if (j.set === 'skab') got[j.ri][j.c][j.k] = res[i].alerts; else syn[j.ri][j.c] = res[i].alerts; });
  const cols = (ri, key) => COLUMNS.map((_, c) => got[ri][c][key]);

  // Score whole-watch alerts with round 12's score(): column 0 carries the run's whole-watch alerts, the rest none.
  const scoreWhole = (subset, key, k) => score(subset, (r, c) => (c === 0 ? wholeWatch(cols(all.indexOf(r), key), k) : []), COLUMNS.map(() => null));
  const nullPer100 = (key, k) => (100 * wholeWatch(cols(0, key), k).length) / free.scored;

  console.log(`Round 13: two columns agree, on SKAB (${runs.length} fault runs and the anomaly-free run, ${COLUMNS.length} sensors, 5-second buckets, from point ${FROM}); W = ${W} buckets.\n`);
  const ROWS = [['quiet', 1, 'A1 Quiet (baseline: one message per change)'], ['quiet', 2, 'A2 Quiet (T9)'], ['quiet', 3, 'A3 Quiet'],
    ['middle', 1, 'A1 Middle'], ['middle', 2, 'A2 Middle'], ['drift', 1, 'A1 Drift'], ['drift', 2, 'A2 Drift'], ['eager', 1, 'A1 Eager'], ['eager', 2, 'A2 Eager']];
  console.log('  policy (33 fault runs, 8 columns)              alerts  at a mark (share)  per 1000 checks  marks reached  faults caught  median delay s  null per 100');
  const T = {};
  for (const [key, k, name] of ROWS) {
    const t = (T[`${key}${k}`] = scoreWhole(runs, key, k));
    console.log(`  ${name.padEnd(46)} ${String(t.alerts).padStart(6)}   ${String(t.atMark).padStart(5)} (${t.share.toFixed(1).padStart(4)}%)   ${t.per1000.toFixed(1).padStart(9)}     ${String(t.reached).padStart(4)}/${t.marks}      ${String(t.caught).padStart(3)}/${t.faults}      ${t.medianDelay === null ? '   -' : String(t.medianDelay).padStart(5)}        ${nullPer100(key, k).toFixed(2)}`);
  }
  const a1 = T.quiet1, a2 = T.quiet2, n2 = nullPer100('quiet', 2);
  const { parts, pass } = ruleT9(a1, a2, n2);
  const v = (x) => (x ? 'PASS' : 'FAIL');
  console.log(`\n  T9 A2 vs A1, Quiet: (a) normal run ${n2.toFixed(2)} per 100 checks vs ${B} ${v(parts[0])}; (b) ${a2.caught} vs ${a1.caught} - 2 ${v(parts[1])}; (c) ${a2.share.toFixed(1)}% vs ${a1.share.toFixed(1)}% ${v(parts[2])}. ${pass ? 'PASSES' : 'FAILS'}.`);

  console.log('\n  Reported only, deciding nothing.\n');
  console.log('  A2 Quiet: column pairs that completed a whole-watch alert (fault runs | anomaly-free run)');
  const pairs = (ri) => { const m = new Map(); for (const a of wholeWatch(cols(ri, 'quiet'), 2)) { const key = a.columns.map((c) => COLUMNS[c]).sort().join(' + '); m.set(key, (m.get(key) || 0) + 1); } return m; };
  const pf = new Map(); runs.forEach((_, i) => { for (const [k, n] of pairs(i + 1)) pf.set(k, (pf.get(k) || 0) + n); });
  const pn = pairs(0);
  for (const k of [...new Set([...pf.keys(), ...pn.keys()])].sort((x, y) => (pf.get(y) || 0) - (pf.get(x) || 0))) console.log(`  ${String(pf.get(k) || 0).padStart(4)} | ${String(pn.get(k) || 0).padStart(3)}   ${k}`);
  for (const folder of ['valve1', 'valve2', 'other']) {
    const sub = runs.filter((r) => r.name.startsWith(folder + '/'));
    console.log(`\n  ${folder} (${sub.length}): faults caught / marks reached / share at a mark`);
    for (const [key, k, name] of ROWS.slice(0, 3)) { const t = scoreWhole(sub, key, k); console.log(`  ${name.slice(0, 9).padEnd(9)} ${t.caught}/${t.faults}  ${t.reached}/${t.marks}  ${t.share.toFixed(1)}%  (${t.alerts} alerts)`); }
  }
  const sc = (NPT - SFROM) * SEEDS;
  const s1 = syn.reduce((a, cs) => a + wholeWatch(cs, 1).length, 0), s2 = syn.reduce((a, cs) => a + wholeWatch(cs, 2).length, 0);
  const lines = syn.reduce((a, cs) => a + cs.reduce((b, x) => b + x.length, 0), 0);
  console.log(`\n  Synthetic null, ${NCOL} N(0,1) columns x ${NPT} points x ${SEEDS} seeds, Quiet, from point ${SFROM}: ${lines} column lines; A1 ${(100 * s1 / sc).toFixed(2)}, A2 ${(100 * s2 / sc).toFixed(2)} per 100 whole-watch checks.`);
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall on ${availableParallelism()} cores.`);
}
