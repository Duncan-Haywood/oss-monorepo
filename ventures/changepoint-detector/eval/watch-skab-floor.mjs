// Round 14 of the watch: a smallest-move floor per column, read off the normal history, on SKAB.
// Pre-registered 2026-11-14: this header, the rule, the predictions and the code below were written and committed
// before any run that printed a score.
//
//   sh eval/skab-fetch.sh skab-data
//   node eval/watch-skab-floor.mjs skab-data > eval/watch-skab-floor.out.txt
//
// Why (README "Round 13", open item "a per-column rate cap from the normal history"). Round 12: Quiet on all 8 SKAB
// sensors sent 8.54 alert lines per 100 checks of the anomaly-free run, all false, against the budget of 2; Quiet is the
// floor of the "How eager" ladder, so no eagerness pick or budget split can fix it. Round 13: waiting for two columns
// to agree cut the noise only to 2.69 (coupled sensors agree on noise) and lost 9 faults that one sensor (flow rate) sees
// best. An operator's own answer to a loud sensor is "don't tell me about moves smaller than X". This round tests that
// answer with X read off the normal history, per column, so the person sets nothing by hand: on the normal run, replay
// each column under Quiet, take the size |shift| (the level after minus the level before, in the column's own units, as
// the alert message states it) of every line it sent, and set the column's floor so that at most m of those lines
// clear it, m = floor(B / 100 * normal checks / 8), the column's equal share of the whole-watch budget B = 2 per 100
// checks. The floor is the midpoint between the m-th and (m+1)-th largest size (0 when the column sent m or fewer).
// The watch then drops any detection whose |shift| is under its column's floor (watch-core.mjs, option minShift), at
// every check, before the hold, persist and confirm guards: a change too small at one check can clear the floor at a
// later one, when more points show it, and is then sent as a watch run with the floor would send it. So the fault runs
// are replayed with the floor in the watch, not filtered afterwards.
//
// The normal run's own rate under the floor is in-sample (the floors were read off it) and is reported only. The
// out-of-sample null is each fault run's stretch before its fault: SKAB marks it normal operation (anomaly 0), it was
// recorded on other days than the anomaly-free run, and every alert line sent before the fault's first mark window
// opens is false. Pre-fault checks: points from FROM to the window's start (lo), per run; a pre-fault false line: sent
// at a point before lo. Runs whose fault window opens at or before FROM add nothing to it.
//
// Design. Round 12's data and replay unchanged (5-second buckets, 8 columns, the shipped policy: window 1,000, confirm
// 5, tolerance 5, hold history, persist 2; replayed after every point from point 20; mark windows [b - 1, b + 12]).
// Every column on Quiet (the default, bocpd-ar1-window). Arms: Q, Quiet with no floor (round 12's quiet row, rerun:
// same deterministic code); F, Quiet with each column's floor. Scored with round 12's score() plus the pre-fault rate.
//
// The rule, written before the run (ties in a "more" part fail; "at least" and "at most" include ties).
//  T10, the floor from the normal history, F against Q:
//      (a) F's pre-fault false lines, over the 33 fault runs, at most 2 per 100 whole-watch pre-fault checks;
//      (b) F catches at least Q's faults minus 2 (of 33);
//      (c) F's share of alert lines at a mark is at least Q's.
//  Pass: `watch.mjs --min-shift auto` ships (each column's floor read off its own history at the first check by this
//  rule, kept in the state file), named in `--columns`'s help and the watch page as the round's answer for a loud
//  many-column watch, with the round's numbers. Fail: auto does not ship; the README and `--columns`'s help record it.
//  Either way a hand-set `--min-shift <x>` (or column=x,...) ships as a plain filter: it is the person's own threshold,
//  not a claim this round tests.
//
// Reported only, deciding nothing: the floors and each column's lines under Q and F; Q's pre-fault rate; the normal
// run's in-sample rate under F; faults caught, marks reached and share by folder; and the same floors applied after the
// fact to Q's lines (the cheap approximation a person might compute by hand), to see how far it is from the real watch.
//
// Predictions, written before the run. (a) Temperature and Thermocouple send most of the normal run's noise as slow
// drifts of a fraction of a degree; their floors land above those, and the pre-fault stretches are short (about 94
// points) so the drifts have less room there. I predict Q's pre-fault rate is near its normal-run 8.5 and F's about 1.5,
// passing with little room. (b) A closed valve moves flow rate by far more than its normal-run moves, so its floor
// keeps nearly all fault starts; I predict F catches 31 or more, passing. (c) The floors cut noise more than marks; I
// predict F's share at a mark about 45% against Q's 36.8%, passing. Overall: pass, with (a) the part at risk.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch } from '../watch-core.mjs';
import { SETTINGS, COLUMNS, FROM, loadSkab, score } from './watch-skab.mjs';

const B = 2;
const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000 };

if (!isMainThread && workerData === import.meta.url) {
  parentPort.on('message', ({ id, values, minShift }) => {
    const r = replayWatch(values, null, { ...POLICY, detector: SETTINGS.quiet, from: FROM, budget: Infinity, ...(minShift ? { minShift } : {}) });
    parentPort.postMessage({ id, alerts: r.alerts.map((a) => ({ index: a.index, at: a.reportedAt, shift: a.shift })) });
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
      const feed = () => { if (next < order.length) { const id = order[next++]; const j = jobs[id]; worker.postMessage({ id, values: j.values, minShift: j.minShift }); } else worker.terminate(); };
      worker.on('message', (m) => { if (results[m.id]) { reject(new Error(`job ${m.id} answered twice`)); return; } results[m.id] = m; done++; if (done % 50 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

/** The column's share of the whole-watch budget, in lines on a history of `checks` checks watched over `k` columns. */
export const allowedLines = (checks, k, b = B) => Math.floor(((b / 100) * checks) / k);

/** The floor that lets at most m of these sizes through: midway between the m-th and (m+1)-th largest, 0 if m or fewer. */
export function floorFor(sizes, m) {
  const s = sizes.map(Math.abs).sort((x, y) => y - x);
  if (s.length <= m) return 0;
  return m === 0 ? s[0] * 1.000001 + Number.MIN_VALUE : (s[m - 1] + s[m]) / 2;
}

/** Pre-fault false lines and checks for one run's lines: lines sent before the fault's first window opens. */
export function preFault(run, lines) {
  const w = run.wins.find((x) => x.start);
  if (!w || w.lo <= FROM) return { lines: 0, checks: 0 };
  return { lines: lines.filter((a) => a.at < w.lo).length, checks: w.lo - FROM };
}

/** T10 on scored totals (exported so the test can check it on made-up numbers). */
export function ruleT10(q, f, fPreFaultPer100) {
  const p = [fPreFaultPer100 <= B, f.caught >= q.caught - 2, f.share >= q.share];
  return { parts: p, pass: p.every(Boolean) };
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'skab-data';
  const t0 = Date.now();
  const { runs, free } = loadSkab(dir);
  const all = [free, ...runs];

  // Pass 1: Quiet, no floor, everywhere (the normal run's lines set the floors; the fault runs are arm Q).
  const jobsQ = [];
  all.forEach((r, ri) => r.cols.forEach((values, c) => jobsQ.push({ ri, c, values, minShift: 0 })));
  const resQ = await runAll(jobsQ);
  const Q = all.map((r) => r.cols.map(() => null));
  jobsQ.forEach((j, i) => { Q[j.ri][j.c] = resQ[i].alerts; });
  const m = allowedLines(free.scored, COLUMNS.length);
  const floors = COLUMNS.map((_, c) => floorFor(Q[0][c].map((a) => a.shift ?? 0), m));

  // Pass 2: Quiet with each column's floor in the watch, everywhere.
  const jobsF = [];
  all.forEach((r, ri) => r.cols.forEach((values, c) => jobsF.push({ ri, c, values, minShift: floors[c] })));
  const resF = await runAll(jobsF);
  const F = all.map((r) => r.cols.map(() => null));
  jobsF.forEach((j, i) => { F[j.ri][j.c] = resF[i].alerts; });
  // After the fact: the same floors applied to Q's lines.
  const P = Q.map((cs) => cs.map((a, c) => a.filter((x) => Math.abs(x.shift ?? 0) >= floors[c])));

  const arms = { Q, F, P };
  const alertsOf = (A) => (r, c) => A[all.indexOf(r)][c];
  const pre = (A) => runs.reduce((t, r) => { const lines = COLUMNS.flatMap((_, c) => alertsOf(A)(r, c)); const p = preFault(r, lines); return { lines: t.lines + p.lines, checks: t.checks + p.checks }; }, { lines: 0, checks: 0 });
  const normal = (A) => (100 * COLUMNS.reduce((t, _, c) => t + A[0][c].length, 0)) / free.scored;

  console.log(`Round 14: a smallest-move floor per column from the normal history, on SKAB (${runs.length} fault runs and the anomaly-free run, ${COLUMNS.length} sensors, 5-second buckets, Quiet, from point ${FROM}).\n`);
  console.log(`  Normal run: ${free.scored} checks; each column's share of B = ${B} per 100 is m = ${m} lines.\n`);
  console.log('  column                  floor (|shift|, column units)   normal-run lines Q -> F   fault-run lines Q -> F');
  COLUMNS.forEach((name, c) => {
    const fq = runs.reduce((t, r) => t + alertsOf(Q)(r, c).length, 0), ff = runs.reduce((t, r) => t + alertsOf(F)(r, c).length, 0);
    console.log(`  ${name.padEnd(22)} ${Number(floors[c].toPrecision(4)).toString().padStart(14)}                  ${String(Q[0][c].length).padStart(4)} -> ${String(F[0][c].length).padEnd(4)}             ${String(fq).padStart(4)} -> ${ff}`);
  });
  const T = {};
  console.log('\n  arm (33 fault runs, 8 columns)                lines  at a mark (share)  per 1000 checks  marks reached  faults caught  median delay s  pre-fault per 100  normal per 100');
  const NAMES = { Q: 'Q  Quiet, no floor', F: 'F  Quiet, floor in the watch (T10)', P: 'P  Q\'s lines, floor after the fact' };
  for (const k of Object.keys(arms)) {
    const t = (T[k] = score(runs, alertsOf(arms[k]), COLUMNS.map(() => null)));
    const p = pre(arms[k]); t.pre = p; t.pre100 = p.checks ? (100 * p.lines) / p.checks : 0;
    console.log(`  ${NAMES[k].padEnd(44)} ${String(t.alerts).padStart(6)}   ${String(t.atMark).padStart(5)} (${t.share.toFixed(1).padStart(4)}%)   ${t.per1000.toFixed(1).padStart(9)}     ${String(t.reached).padStart(4)}/${t.marks}      ${String(t.caught).padStart(3)}/${t.faults}      ${t.medianDelay === null ? '   -' : String(t.medianDelay).padStart(5)}        ${t.pre100.toFixed(2).padStart(5)} (${p.lines}/${p.checks})     ${normal(arms[k]).toFixed(2)}`);
  }
  const { parts, pass } = ruleT10(T.Q, T.F, T.F.pre100);
  const v = (x) => (x ? 'PASS' : 'FAIL');
  console.log(`\n  T10 F vs Q: (a) pre-fault ${T.F.pre100.toFixed(2)} per 100 checks vs ${B} ${v(parts[0])}; (b) ${T.F.caught} vs ${T.Q.caught} - 2 ${v(parts[1])}; (c) ${T.F.share.toFixed(1)}% vs ${T.Q.share.toFixed(1)}% ${v(parts[2])}. ${pass ? 'PASSES' : 'FAILS'}.`);

  console.log('\n  Reported only, deciding nothing.');
  for (const folder of ['valve1', 'valve2', 'other']) {
    const sub = runs.filter((r) => r.name.startsWith(folder + '/'));
    console.log(`\n  ${folder} (${sub.length}): faults caught / marks reached / share at a mark (lines)`);
    for (const k of Object.keys(arms)) { const t = score(sub, alertsOf(arms[k]), COLUMNS.map(() => null)); console.log(`  ${k}  ${t.caught}/${t.faults}  ${t.reached}/${t.marks}  ${t.share.toFixed(1)}%  (${t.alerts})`); }
  }
  console.log('\n  by column under F: lines, at a mark, faults caught alone');
  COLUMNS.forEach((name, c) => {
    const one = score(runs, (r, cc) => (cc === c ? alertsOf(F)(r, cc) : []), COLUMNS.map(() => null));
    console.log(`  ${name.padEnd(22)} ${String(one.alerts).padStart(5)} ${String(one.atMark).padStart(5)} (${one.share.toFixed(1)}%)  ${one.caught}/${one.faults}`);
  });
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall on ${availableParallelism()} cores.`);
}
