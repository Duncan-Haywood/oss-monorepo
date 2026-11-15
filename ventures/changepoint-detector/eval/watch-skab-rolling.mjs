// Round 17 of the watch: a floor re-read on a rolling window of the same run, on SKAB.
// Pre-registered 2026-11-14: this header, the rule, the predictions and the code below were written and committed
// before any run that printed a score.
//
//   sh eval/skab-fetch.sh skab-data
//   node eval/watch-skab-rolling.mjs skab-data > eval/watch-skab-rolling.out.txt
//
// Why (README "Round 16", open item "a floor re-read on a rolling normal window, so a new day's temperature resets it").
// Rounds 14-16 read their floors off one anomaly-free day and applied them to 33 fault runs recorded on other days. Each
// missed the three-part bar through one column whose normal day did not describe its fault days: the motor temperature,
// whose 27 normal-run lines were slow drift and fell under every floor, sent 47-67 lines on the fault runs. Round 15's
// spread floor is re-read before every change, but spread (MAD of the points) does not see drift: a slow ramp has a
// small MAD around a moving level, so a drift-made change looks many spreads tall. This round measures a move against
// the largest move the same column made in the minutes just before it, which does see drift, and reads nothing from
// another day.
//
// The floor (watch-core.mjs, option minMoveRatio): a detection is dropped when |shift| (the move the alert message
// states) is under k times largestMoveBefore: over the MOVE_WINDOW = 60 points (5 minutes) before the change's index,
// the largest |mean of MOVE_SPAN = 12 points - mean of the 12 points before them| over every split (12 points = 60 s,
// the span of the mark windows and of round 13's agreement window). A detection with fewer than 24 points before it, no
// level each side, or a stretch that never moves, is kept. It sits in the watch at every check, before the guards, as
// rounds 14-16's floors did.
//
// Arms. Q, Quiet with no floor. W, the floor at k = 1, fixed before the run: "tell me about a move only when it is
// bigger than any move this column made in the last five minutes". Nothing is read off the normal run, so W is the
// rolling window alone. K (reported only, deciding nothing), the same floor with one k read off the normal run by
// round 15's kFor so that at most L = 37 of the whole watch's lines clear it, to show what a budget-read k does on top.
// P (reported only), Q's lines with W's floor applied after the fact. Data, replay, policy, scoring and out-of-sample
// null are rounds 14-16's (5-second buckets, 8 columns, Quiet = bocpd-ar1-window, window 1,000, confirm 5, tolerance 5,
// hold history, persist 2, from point 20, mark windows [b - 1, b + 12]; the null is each fault run's stretch before its
// fault's first window, 2,997 checks). This is a fifth look at a seen set: rounds 12-16's per-column outputs are known;
// no score under this floor is.
//
// The rule, written before the run (ties in a "more" part fail; "at least" and "at most" include ties).
//  T13, the rolling floor, W against Q (the same three parts as T10-T12):
//      (a) W's pre-fault false lines, over the 33 fault runs, at most 2 per 100 whole-watch pre-fault checks;
//      (b) W catches at least Q's faults minus 2 (of 33);
//      (c) W's share of alert lines at a mark is at least Q's.
//  Pass: `watch.mjs --min-move <k|col=k,...>` ships with k = 1 named as the round's answer for a loud many-column
//  watch, in `--columns`'s help, the watch page and llms.txt. Fail: the README, `--columns`'s help and the watch page
//  record it, and the option stays in watch-core.mjs for later rounds; nothing ships to the CLI.
//
// Reported only, deciding nothing: K's k and its scores; each column's lines under Q, W and K on the normal and fault
// runs; the normal run's rate under each arm (out of sample for W, since nothing is read from it); faults caught, marks
// reached and share by folder; each column alone under W; and P.
//
// Predictions, written before the run. On white noise the largest 12-point move in 60 points is about 0.9 sd, below the
// moves Quiet already needs to alert, so on the flat noisy columns (accelerometers, current, voltage) W cuts little;
// it cuts where the column wanders or drifts, temperature and the thermocouple. (b) A closed valve moves flow rate far
// beyond its last five minutes: I predict W catches 32, a pass. (c) Fewer drift lines: about 45% at a mark, a pass.
// (a) is the risk again: the coupled accelerometers keep their noise lines. I predict about 3.0 per 100, a fail. On the
// normal run I predict about 4 per 100. K's k I expect near 2, catching fewer faults (about 28).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch, moveRatio } from '../watch-core.mjs';
import { SETTINGS, COLUMNS, FROM, loadSkab, score } from './watch-skab.mjs';
import { preFault } from './watch-skab-floor.mjs';
import { kFor, allowedWatchLines } from './watch-skab-spread.mjs';

export const K_FIXED = 1;

const B = 2;
const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000 };

if (!isMainThread && workerData === import.meta.url) {
  parentPort.on('message', ({ id, values, k }) => {
    const r = replayWatch(values, null, { ...POLICY, detector: SETTINGS.quiet, from: FROM, budget: Infinity, ...(k ? { minMoveRatio: k } : {}) });
    parentPort.postMessage({ id, alerts: r.alerts.map((a) => ({ index: a.index, at: a.reportedAt, shift: a.shift, ratio: moveRatio(values, a) })) });
  });
}

async function runAll(jobs) {
  const results = new Array(jobs.length);
  const n = Math.max(1, Math.min(jobs.length, availableParallelism()));
  let next = 0, done = 0;
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[b].values.length - jobs[a].values.length);
  await new Promise((resolve, reject) => {
    for (let w = 0; w < n; w++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: import.meta.url });
      const feed = () => { if (next < order.length) { const id = order[next++]; const j = jobs[id]; worker.postMessage({ id, values: j.values, k: j.k }); } else worker.terminate(); };
      worker.on('message', (m) => { if (results[m.id]) { reject(new Error(`job ${m.id} answered twice`)); return; } results[m.id] = m; done++; if (done % 50 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

/** T13 on scored totals (exported so the test can check it on made-up numbers). */
export function ruleT13(q, w, wPreFaultPer100) {
  const p = [wPreFaultPer100 <= B, w.caught >= q.caught - 2, w.share >= q.share];
  return { parts: p, pass: p.every(Boolean) };
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'skab-data';
  const t0 = Date.now();
  const { runs, free } = loadSkab(dir);
  const all = [free, ...runs];
  const pass = async (kOf) => {
    const jobs = [];
    all.forEach((r, ri) => r.cols.forEach((values, c) => jobs.push({ ri, c, values, k: kOf(c) })));
    const res = await runAll(jobs);
    const A = all.map((r) => r.cols.map(() => null));
    jobs.forEach((j, i) => { A[j.ri][j.c] = res[i].alerts; });
    return A;
  };
  const Q = await pass(() => 0);
  const L = allowedWatchLines(free.scored);
  const byCol = COLUMNS.map((_, c) => Q[0][c].map((a) => a.ratio));
  const k1 = kFor(byCol.flat(), L);
  const W = await pass(() => K_FIXED);
  const K = await pass(() => k1);
  const P = Q.map((cs) => cs.map((a) => a.filter((x) => x.ratio === null || x.ratio >= K_FIXED)));

  const arms = { Q, W, K, P };
  const alertsOf = (A) => (r, c) => A[all.indexOf(r)][c];
  const pre = (A) => runs.reduce((t, r) => { const lines = COLUMNS.flatMap((_, c) => alertsOf(A)(r, c)); const p = preFault(r, lines); return { lines: t.lines + p.lines, checks: t.checks + p.checks }; }, { lines: 0, checks: 0 });
  const normal = (A) => (100 * COLUMNS.reduce((t, _, c) => t + A[0][c].length, 0)) / free.scored;
  const f3 = (x) => (x > 0 ? String(Number(x.toPrecision(4))) : 'none');
  const med = (a) => { const s = a.filter((x) => x !== null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

  console.log(`Round 17: a floor re-read on a rolling window of the same run, on SKAB (${runs.length} fault runs and the anomaly-free run, ${COLUMNS.length} sensors, 5-second buckets, Quiet, from point ${FROM}).\n`);
  console.log(`  Normal run: ${free.scored} checks; L = ${L} lines for the whole watch; Q sent ${byCol.flat().length} there.`);
  console.log(`  W's k: ${K_FIXED} (fixed before the run). K's k, read off the normal run: ${f3(k1)}.\n`);
  console.log('  column                  median move ratio of Q\'s lines (normal / fault runs)   normal-run lines Q -> W -> K   fault-run lines Q -> W -> K');
  COLUMNS.forEach((name, c) => {
    const f = (A) => runs.reduce((t, r) => t + alertsOf(A)(r, c).length, 0);
    const mn = med(Q[0][c].map((a) => a.ratio)), mf = med(runs.flatMap((r) => alertsOf(Q)(r, c).map((a) => a.ratio)));
    console.log(`  ${name.padEnd(22)}  ${(mn === null ? '-' : mn.toFixed(2)).padStart(6)} / ${(mf === null ? '-' : mf.toFixed(2)).padEnd(6)}                                  ${String(Q[0][c].length).padStart(4)} -> ${String(W[0][c].length).padStart(3)} -> ${String(K[0][c].length).padEnd(4)}            ${String(f(Q)).padStart(4)} -> ${String(f(W)).padStart(3)} -> ${f(K)}`);
  });
  const T = {};
  console.log('\n  arm (33 fault runs, 8 columns)                lines  at a mark (share)  per 1000 checks  marks reached  faults caught  median delay s  pre-fault per 100  normal per 100');
  const NAMES = { Q: 'Q  Quiet, no floor', W: 'W  rolling floor, k = 1, in the watch (T13)', K: 'K  rolling floor, k read off the normal run', P: 'P  Q\'s lines, W\'s floor after the fact' };
  for (const key of Object.keys(arms)) {
    const t = (T[key] = score(runs, alertsOf(arms[key]), COLUMNS.map(() => null)));
    const p = pre(arms[key]); t.pre = p; t.pre100 = p.checks ? (100 * p.lines) / p.checks : 0;
    console.log(`  ${NAMES[key].padEnd(44)} ${String(t.alerts).padStart(6)}   ${String(t.atMark).padStart(5)} (${t.share.toFixed(1).padStart(4)}%)   ${t.per1000.toFixed(1).padStart(9)}     ${String(t.reached).padStart(4)}/${t.marks}      ${String(t.caught).padStart(3)}/${t.faults}      ${t.medianDelay === null ? '   -' : String(t.medianDelay).padStart(5)}        ${t.pre100.toFixed(2).padStart(5)} (${p.lines}/${p.checks})     ${normal(arms[key]).toFixed(2)}`);
  }
  const { parts, pass: ok } = ruleT13(T.Q, T.W, T.W.pre100);
  const v = (x) => (x ? 'PASS' : 'FAIL');
  console.log(`\n  T13 W vs Q: (a) pre-fault ${T.W.pre100.toFixed(2)} per 100 checks vs ${B} ${v(parts[0])}; (b) ${T.W.caught} vs ${T.Q.caught} - 2 ${v(parts[1])}; (c) ${T.W.share.toFixed(1)}% vs ${T.Q.share.toFixed(1)}% ${v(parts[2])}. ${ok ? 'PASSES' : 'FAILS'}.`);
  console.log('\n  Reported only, deciding nothing.');
  for (const folder of ['valve1', 'valve2', 'other']) {
    const sub = runs.filter((r) => r.name.startsWith(folder + '/'));
    console.log(`\n  ${folder} (${sub.length}): faults caught / marks reached / share at a mark (lines)`);
    for (const key of Object.keys(arms)) { const t = score(sub, alertsOf(arms[key]), COLUMNS.map(() => null)); console.log(`  ${key}  ${t.caught}/${t.faults}  ${t.reached}/${t.marks}  ${t.share.toFixed(1)}%  (${t.alerts})`); }
  }
  console.log('\n  by column under W: lines, at a mark, faults caught alone');
  COLUMNS.forEach((name, c) => {
    const one = score(runs, (r, cc) => (cc === c ? alertsOf(W)(r, cc) : []), COLUMNS.map(() => null));
    console.log(`  ${name.padEnd(22)} ${String(one.alerts).padStart(5)} ${String(one.atMark).padStart(5)} (${one.share.toFixed(1)}%)  ${one.caught}/${one.faults}`);
  });
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall on ${availableParallelism()} cores.`);
}
