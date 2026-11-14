// Round 15 of the watch: one floor for every column, in units of each column's own recent spread, on SKAB.
// Pre-registered 2026-11-14: this header, the rule, the predictions and the code below were written and committed
// before any run that printed a score.
//
//   sh eval/skab-fetch.sh skab-data
//   node eval/watch-skab-spread.mjs skab-data > eval/watch-skab-spread.out.txt
//
// Why (README "Round 14", open item "an unequal split"). Round 14 read a smallest-move floor per column off the normal
// run, each column allowed an equal m = 4 of the whole-watch budget's lines. It cut the out-of-sample false lines from
// 6.34 to 2.27 per 100 checks (budget 2) and kept 28 of 33 faults (the rule allowed 31): the equal split floored flow
// rate, the column that sees the faults, as hard as the thermocouple, which sees almost none, and temperature's floor,
// read off one day, did not carry to the fault runs' other days. Round 14's own unequal split needs labelled faults,
// which a person setting up a watch rarely has. This round tests a label-free one: measure each move against how much
// its own column wandered just before it. A closed valve moves flow rate by many times its recent spread; a motor's
// temperature drifting with the room moves by about its recent spread. And the spread is re-read at every change from
// the points just before it, so a day on which temperature wanders more gets a higher floor without being set again.
//
// The floor (watch-core.mjs, option minSpreadRatio): a detection is dropped when |shift| (the move the alert message
// states) is under k times the column's spread in the SPREAD_WINDOW = 60 points (5 minutes) before the change's index:
// 1.4826 times the median absolute deviation from their median, or their standard deviation when the MAD is 0. A
// detection with fewer than 10 points before it, no level each side, or a constant stretch before it, is kept. It sits
// in the watch, at every check, before the guards, as round 14's floor did. One k serves all 8 columns, read off the
// normal run: replay every column on Quiet with no floor, take each line's ratio, and set k so that at most
// L = floor(B / 100 * normal checks) of the whole watch's lines clear it (L = 37 for B = 2 and 1,861 checks), lines with
// no ratio counting against L first; k is midway between the (L')-th and (L'+1)-th largest ratio (L' = L minus those).
// The split between columns falls out of the ratios; nothing is set per column and no label is read.
//
// Design. Round 14's data, replay, policy, arms Q and the out-of-sample null unchanged (5-second buckets, 8 columns,
// Quiet = bocpd-ar1-window, window 1,000, confirm 5, tolerance 5, hold history, persist 2, from point 20, mark windows
// [b - 1, b + 12]; the null is each fault run's stretch before its fault's first window, 2,997 checks). Arms: Q, Quiet
// with no floor; R, Quiet with the spread floor at the k read off the normal run. Round 14's F (28/33, 46.5%, 2.27) is
// quoted from eval/watch-skab-floor.out.txt, not rerun.
//
// The rule, written before the run (ties in a "more" part fail; "at least" and "at most" include ties).
//  T11, the spread floor, R against Q (the same three parts as round 14's T10):
//      (a) R's pre-fault false lines, over the 33 fault runs, at most 2 per 100 whole-watch pre-fault checks;
//      (b) R catches at least Q's faults minus 2 (of 33);
//      (c) R's share of alert lines at a mark is at least Q's.
//  Pass: `watch.mjs --min-spread <k|auto>` ships (auto: k read off the history's own replay by this rule at the first
//  check, kept in the state file), named in `--columns`'s help and the watch page as the round's answer for a loud
//  many-column watch. Fail: nothing ships to the CLI; the README and `--columns`'s help record it, and the option stays
//  in watch-core.mjs for later rounds.
//
// Reported only, deciding nothing: k; each column's lines under Q and R, normal and fault runs; the normal run's
// in-sample rate under R; faults caught, marks reached and share by folder; each column alone under R; and the same k
// applied after the fact to Q's lines.
//
// Predictions, written before the run. (b) Flow rate's valve moves are many spreads; I predict R catches 31 or more,
// passing, and more than round 14's 28. (c) I predict R's share about 45%, passing. (a) is the risk: the coupled
// accelerometers and a temperature that steps rather than drifts on a fault day can clear any ratio a calm day sets; I
// predict R's pre-fault rate about 2.0, a coin flip. Overall: a narrow pass or a narrow fail on (a).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch, spreadRatio } from '../watch-core.mjs';
import { SETTINGS, COLUMNS, FROM, loadSkab, score } from './watch-skab.mjs';
import { floorFor, preFault } from './watch-skab-floor.mjs';

const B = 2;
const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000 };

if (!isMainThread && workerData === import.meta.url) {
  parentPort.on('message', ({ id, values, k }) => {
    const r = replayWatch(values, null, { ...POLICY, detector: SETTINGS.quiet, from: FROM, budget: Infinity, ...(k ? { minSpreadRatio: k } : {}) });
    parentPort.postMessage({ id, alerts: r.alerts.map((a) => ({ index: a.index, at: a.reportedAt, shift: a.shift, ratio: spreadRatio(values, a) })) });
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

/** The whole watch's lines on a history of `checks` checks. */
export const allowedWatchLines = (checks, b = B) => Math.floor((b / 100) * checks);

/** One k for every column: at most L lines clear it, lines with no ratio (always kept) counted first. */
export function kFor(ratios, L) {
  const known = ratios.filter((r) => r !== null && r !== undefined);
  const left = Math.max(0, L - (ratios.length - known.length));
  return floorFor(known, left);
}

/** T11 on scored totals (exported so the test can check it on made-up numbers). */
export function ruleT11(q, r, rPreFaultPer100) {
  const p = [rPreFaultPer100 <= B, r.caught >= q.caught - 2, r.share >= q.share];
  return { parts: p, pass: p.every(Boolean) };
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'skab-data';
  const t0 = Date.now();
  const { runs, free } = loadSkab(dir);
  const all = [free, ...runs];
  const pass = async (k) => {
    const jobs = [];
    all.forEach((r, ri) => r.cols.forEach((values, c) => jobs.push({ ri, c, values, k })));
    const res = await runAll(jobs);
    const A = all.map((r) => r.cols.map(() => null));
    jobs.forEach((j, i) => { A[j.ri][j.c] = res[i].alerts; });
    return A;
  };
  const Q = await pass(0);
  const L = allowedWatchLines(free.scored);
  const ratios = COLUMNS.flatMap((_, c) => Q[0][c].map((a) => a.ratio));
  const k = kFor(ratios, L);
  const R = await pass(k);
  const P = Q.map((cs) => cs.map((a) => a.filter((x) => x.ratio === null || x.ratio >= k)));

  const arms = { Q, R, P };
  const alertsOf = (A) => (r, c) => A[all.indexOf(r)][c];
  const pre = (A) => runs.reduce((t, r) => { const lines = COLUMNS.flatMap((_, c) => alertsOf(A)(r, c)); const p = preFault(r, lines); return { lines: t.lines + p.lines, checks: t.checks + p.checks }; }, { lines: 0, checks: 0 });
  const normal = (A) => (100 * COLUMNS.reduce((t, _, c) => t + A[0][c].length, 0)) / free.scored;

  console.log(`Round 15: one floor for every column in units of its own recent spread, on SKAB (${runs.length} fault runs and the anomaly-free run, ${COLUMNS.length} sensors, 5-second buckets, Quiet, from point ${FROM}).\n`);
  console.log(`  Normal run: ${free.scored} checks; the whole watch's share of B = ${B} per 100 is L = ${L} lines; Q sent ${ratios.length} there (${ratios.filter((x) => x === null).length} with no ratio).`);
  console.log(`  k = ${Number(k.toPrecision(4))} (a move must be at least k times its column's spread over the ${60} points before it).\n`);
  console.log('  column                  normal-run lines Q -> R   fault-run lines Q -> R   median ratio of Q\'s normal / fault lines');
  const med = (a) => { const s = a.filter((x) => x !== null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const f2 = (x) => (x === null ? '-' : x.toFixed(2));
  COLUMNS.forEach((name, c) => {
    const fq = runs.reduce((t, r) => t + alertsOf(Q)(r, c).length, 0), fr = runs.reduce((t, r) => t + alertsOf(R)(r, c).length, 0);
    const mq = med(runs.flatMap((r) => alertsOf(Q)(r, c).map((a) => a.ratio)));
    console.log(`  ${name.padEnd(22)}  ${String(Q[0][c].length).padStart(4)} -> ${String(R[0][c].length).padEnd(4)}               ${String(fq).padStart(4)} -> ${String(fr).padEnd(4)}             ${f2(med(Q[0][c].map((a) => a.ratio)))} / ${f2(mq)}`);
  });
  const T = {};
  console.log('\n  arm (33 fault runs, 8 columns)                lines  at a mark (share)  per 1000 checks  marks reached  faults caught  median delay s  pre-fault per 100  normal per 100');
  const NAMES = { Q: 'Q  Quiet, no floor', R: 'R  Quiet, spread floor in the watch (T11)', P: 'P  Q\'s lines, spread floor after the fact' };
  for (const key of Object.keys(arms)) {
    const t = (T[key] = score(runs, alertsOf(arms[key]), COLUMNS.map(() => null)));
    const p = pre(arms[key]); t.pre = p; t.pre100 = p.checks ? (100 * p.lines) / p.checks : 0;
    console.log(`  ${NAMES[key].padEnd(44)} ${String(t.alerts).padStart(6)}   ${String(t.atMark).padStart(5)} (${t.share.toFixed(1).padStart(4)}%)   ${t.per1000.toFixed(1).padStart(9)}     ${String(t.reached).padStart(4)}/${t.marks}      ${String(t.caught).padStart(3)}/${t.faults}      ${t.medianDelay === null ? '   -' : String(t.medianDelay).padStart(5)}        ${t.pre100.toFixed(2).padStart(5)} (${p.lines}/${p.checks})     ${normal(arms[key]).toFixed(2)}`);
  }
  console.log('  F  round 14, equal-split floors (quoted)          198      92 (46.5%)        30.1       74/123       28/33       52.5         2.27 (68/2997)     1.93');
  const { parts, pass: ok } = ruleT11(T.Q, T.R, T.R.pre100);
  const v = (x) => (x ? 'PASS' : 'FAIL');
  console.log(`\n  T11 R vs Q: (a) pre-fault ${T.R.pre100.toFixed(2)} per 100 checks vs ${B} ${v(parts[0])}; (b) ${T.R.caught} vs ${T.Q.caught} - 2 ${v(parts[1])}; (c) ${T.R.share.toFixed(1)}% vs ${T.Q.share.toFixed(1)}% ${v(parts[2])}. ${ok ? 'PASSES' : 'FAILS'}.`);

  console.log('\n  Reported only, deciding nothing.');
  for (const folder of ['valve1', 'valve2', 'other']) {
    const sub = runs.filter((r) => r.name.startsWith(folder + '/'));
    console.log(`\n  ${folder} (${sub.length}): faults caught / marks reached / share at a mark (lines)`);
    for (const key of Object.keys(arms)) { const t = score(sub, alertsOf(arms[key]), COLUMNS.map(() => null)); console.log(`  ${key}  ${t.caught}/${t.faults}  ${t.reached}/${t.marks}  ${t.share.toFixed(1)}%  (${t.alerts})`); }
  }
  console.log('\n  by column under R: lines, at a mark, faults caught alone');
  COLUMNS.forEach((name, c) => {
    const one = score(runs, (r, cc) => (cc === c ? alertsOf(R)(r, cc) : []), COLUMNS.map(() => null));
    console.log(`  ${name.padEnd(22)} ${String(one.alerts).padStart(5)} ${String(one.atMark).padStart(5)} (${one.share.toFixed(1)}%)  ${one.caught}/${one.faults}`);
  });
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall on ${availableParallelism()} cores.`);
}
