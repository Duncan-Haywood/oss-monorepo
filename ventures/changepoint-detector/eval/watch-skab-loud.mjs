// Round 16 of the watch: round 15's spread floor, with a loud column given its own k, on SKAB.
// Pre-registered 2026-11-14: this header, the rule, the predictions and the code below were written and committed
// before any run that printed a score.
//
//   sh eval/skab-fetch.sh skab-data
//   node eval/watch-skab-loud.mjs skab-data > eval/watch-skab-loud.out.txt
//
// Why (README "Round 15", open item "k read with the loudest column's lines left out"). Round 15 set one k for all 8
// columns so that at most L = 37 of the whole watch's normal-run lines cleared it. It was the first whole-watch rule
// under the budget out of sample (1.40 false lines per 100 pre-fault checks) and the most precise (59.3% at a mark), but
// it caught 27 of 33 faults, 4 short of the rule. One column set k: 31 of the 37 normal-run lines that cleared k = 4.94
// were the thermocouple's, sharp steps on a flat trace (median ratio 7.90). A k for the other seven columns alone would be
// lower, so the valve faults' smaller flow-rate and accelerometer moves would clear it. This is a second look at a seen
// set: round 15's per-column normal-run counts are known and motivate the rule; no fault-run score under it is.
//
// The rule (loudSplit below), label-free, read off the normal run only. Replay every column on Quiet with no floor and
// take each line's spread ratio, as round 15 did. Read the common k for the columns still sharing it (at first all 8)
// from their lines with the budget still shared (at first L). A column is loud when more than half of the lines that
// clear that k are its own. The loudest such column gets its own k, read so that at most m = floor(L / 8) = 4 of its own
// normal-run lines clear it (an equal column's share); its m lines leave the shared budget, it leaves the shared group,
// and the common k is read again. Repeat until no column is loud (or one column is left). k is read with round 15's
// kFor (lines with no ratio count against the budget first; k midway between neighbouring ratios). Nothing is set by a
// person and no label is read.
//
// Design. Round 15's data, replay, policy, scoring and out-of-sample null unchanged (5-second buckets, 8 columns,
// Quiet = bocpd-ar1-window, window 1,000, confirm 5, tolerance 5, hold history, persist 2, from point 20, mark windows
// [b - 1, b + 12]; the null is each fault run's stretch before its fault's first window, 2,997 checks). Arms: Q, Quiet
// with no floor; S, Quiet with the per-column spread floors from loudSplit, in the watch at every check. Round 15's R
// (one k) is re-run here as a check that the replay matches eval/watch-skab-spread.out.txt (27/33, 59.3%, 1.40).
//
// The rule, written before the run (ties in a "more" part fail; "at least" and "at most" include ties).
//  T12, the loud split, S against Q (the same three parts as T10 and T11):
//      (a) S's pre-fault false lines, over the 33 fault runs, at most 2 per 100 whole-watch pre-fault checks;
//      (b) S catches at least Q's faults minus 2 (of 33);
//      (c) S's share of alert lines at a mark is at least Q's.
//  Pass: `watch.mjs --min-spread auto` ships for `--columns`, its k's read by loudSplit off the history's own replay at
//  the first check, and the watch page names it as the round's answer for a loud many-column watch. Fail: auto does not
//  ship; the README, `--columns`'s help and the watch page record it.
//  Either way, the hand-set `watch.mjs --min-spread <k|col=k,...>` ships, as `--min-shift` did in round 14: it is the
//  person's own threshold in units of the column's recent spread, not a claim this round tests.
//
// Reported only, deciding nothing: the k's; each column's lines under Q, R and S on the normal and fault runs; the
// normal run's in-sample rate; faults caught, marks reached and share by folder; each column alone under S; and S's
// floors applied after the fact to Q's lines.
//
// Predictions, written before the run. The thermocouple is the one loud column; with it out, the other seven columns'
// shared k falls from 4.94 to somewhere near 3. (b) More valve faults clear that: I predict S catches 30, one short of
// the 31 the rule needs, a narrow fail, and more than R's 27. (c) Its share falls from R's 59.3% but stays above Q's
// 36.8%: about 50%, a pass. (a) The lower k lets more accelerometer and temperature noise through on the fault days,
// while the thermocouple's own k cuts it to about 4 lines: I predict about 1.9 per 100, a coin flip. Overall I expect a
// narrow fail on (b) or (a), not a pass.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch, spreadRatio } from '../watch-core.mjs';
import { SETTINGS, COLUMNS, FROM, loadSkab, score } from './watch-skab.mjs';
import { preFault } from './watch-skab-floor.mjs';
import { kFor, allowedWatchLines } from './watch-skab-spread.mjs';

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

/** Lines that clear k: unknown ratios are always kept. */
const clearing = (ratios, k) => ratios.filter((r) => r === null || r === undefined || !(k > 0) || r >= k).length;

/**
 * The loud split: one k per column from each column's normal-run line ratios (`ratiosByCol[c]`, null = unknown) and the
 * whole watch's L lines. Returns { ks, loud }: ks[c] the column's k (0 = no floor), loud the columns that got their own,
 * in the order they were split off.
 */
export function loudSplit(ratiosByCol, L, m = Math.floor(L / ratiosByCol.length)) {
  const ks = ratiosByCol.map(() => 0);
  const loud = [];
  let rest = ratiosByCol.map((_, c) => c), budget = L;
  for (;;) {
    const k = kFor(rest.flatMap((c) => ratiosByCol[c]), budget);
    const counts = rest.map((c) => clearing(ratiosByCol[c], k));
    const total = counts.reduce((t, x) => t + x, 0);
    let d = -1;
    counts.forEach((x, i) => { if (2 * x > total && (d < 0 || x > counts[d])) d = i; });
    if (d < 0 || rest.length === 1 || budget <= m) { for (const c of rest) ks[c] = k; return { ks, loud }; }
    const c = rest[d];
    ks[c] = kFor(ratiosByCol[c], m);
    loud.push(c);
    budget -= m;
    rest = rest.filter((x) => x !== c);
  }
}

/** T12 on scored totals (exported so the test can check it on made-up numbers). */
export function ruleT12(q, s, sPreFaultPer100) {
  const p = [sPreFaultPer100 <= B, s.caught >= q.caught - 2, s.share >= q.share];
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
  const { ks, loud } = loudSplit(byCol, L);
  const R = await pass(() => k1);
  const S = await pass((c) => ks[c]);
  const P = Q.map((cs) => cs.map((a, c) => a.filter((x) => x.ratio === null || !(ks[c] > 0) || x.ratio >= ks[c])));

  const arms = { Q, R, S, P };
  const alertsOf = (A) => (r, c) => A[all.indexOf(r)][c];
  const pre = (A) => runs.reduce((t, r) => { const lines = COLUMNS.flatMap((_, c) => alertsOf(A)(r, c)); const p = preFault(r, lines); return { lines: t.lines + p.lines, checks: t.checks + p.checks }; }, { lines: 0, checks: 0 });
  const normal = (A) => (100 * COLUMNS.reduce((t, _, c) => t + A[0][c].length, 0)) / free.scored;
  const f3 = (x) => (x > 0 ? String(Number(x.toPrecision(4))) : 'none');

  console.log(`Round 16: the spread floor with a loud column given its own k, on SKAB (${runs.length} fault runs and the anomaly-free run, ${COLUMNS.length} sensors, 5-second buckets, Quiet, from point ${FROM}).\n`);
  console.log(`  Normal run: ${free.scored} checks; L = ${L} lines for the whole watch; Q sent ${byCol.flat().length} there.`);
  console.log(`  Round 15's one k: ${f3(k1)}. Loud columns split off: ${loud.length ? loud.map((c) => COLUMNS[c]).join(', ') : 'none'}.\n`);
  console.log('  column                  k under S   normal-run lines Q -> R -> S   fault-run lines Q -> R -> S');
  COLUMNS.forEach((name, c) => {
    const f = (A) => runs.reduce((t, r) => t + alertsOf(A)(r, c).length, 0);
    console.log(`  ${name.padEnd(22)}  ${f3(ks[c]).padStart(8)}    ${String(Q[0][c].length).padStart(4)} -> ${String(R[0][c].length).padStart(3)} -> ${String(S[0][c].length).padEnd(4)}            ${String(f(Q)).padStart(4)} -> ${String(f(R)).padStart(3)} -> ${f(S)}`);
  });
  const T = {};
  console.log('\n  arm (33 fault runs, 8 columns)                lines  at a mark (share)  per 1000 checks  marks reached  faults caught  median delay s  pre-fault per 100  normal per 100');
  const NAMES = { Q: 'Q  Quiet, no floor', R: 'R  round 15, one k in the watch (re-run)', S: 'S  loud split in the watch (T12)', P: 'P  Q\'s lines, S\'s floors after the fact' };
  for (const key of Object.keys(arms)) {
    const t = (T[key] = score(runs, alertsOf(arms[key]), COLUMNS.map(() => null)));
    const p = pre(arms[key]); t.pre = p; t.pre100 = p.checks ? (100 * p.lines) / p.checks : 0;
    console.log(`  ${NAMES[key].padEnd(44)} ${String(t.alerts).padStart(6)}   ${String(t.atMark).padStart(5)} (${t.share.toFixed(1).padStart(4)}%)   ${t.per1000.toFixed(1).padStart(9)}     ${String(t.reached).padStart(4)}/${t.marks}      ${String(t.caught).padStart(3)}/${t.faults}      ${t.medianDelay === null ? '   -' : String(t.medianDelay).padStart(5)}        ${t.pre100.toFixed(2).padStart(5)} (${p.lines}/${p.checks})     ${normal(arms[key]).toFixed(2)}`);
  }
  const { parts, pass: ok } = ruleT12(T.Q, T.S, T.S.pre100);
  const v = (x) => (x ? 'PASS' : 'FAIL');
  console.log(`\n  T12 S vs Q: (a) pre-fault ${T.S.pre100.toFixed(2)} per 100 checks vs ${B} ${v(parts[0])}; (b) ${T.S.caught} vs ${T.Q.caught} - 2 ${v(parts[1])}; (c) ${T.S.share.toFixed(1)}% vs ${T.Q.share.toFixed(1)}% ${v(parts[2])}. ${ok ? 'PASSES' : 'FAILS'}.`);

  console.log('\n  Reported only, deciding nothing.');
  for (const folder of ['valve1', 'valve2', 'other']) {
    const sub = runs.filter((r) => r.name.startsWith(folder + '/'));
    console.log(`\n  ${folder} (${sub.length}): faults caught / marks reached / share at a mark (lines)`);
    for (const key of Object.keys(arms)) { const t = score(sub, alertsOf(arms[key]), COLUMNS.map(() => null)); console.log(`  ${key}  ${t.caught}/${t.faults}  ${t.reached}/${t.marks}  ${t.share.toFixed(1)}%  (${t.alerts})`); }
  }
  console.log('\n  by column under S: lines, at a mark, faults caught alone');
  COLUMNS.forEach((name, c) => {
    const one = score(runs, (r, cc) => (cc === c ? alertsOf(S)(r, cc) : []), COLUMNS.map(() => null));
    console.log(`  ${name.padEnd(22)} ${String(one.alerts).padStart(5)} ${String(one.atMark).padStart(5)} (${one.share.toFixed(1)}%)  ${one.caught}/${one.faults}`);
  });
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall on ${availableParallelism()} cores.`);
}
