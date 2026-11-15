// Round 19 of the watch: how much of round 18's floor miss on SMD is hourly dilution? The same machines' metrics in
// 10-minute buckets, checked every hour, against hourly buckets. Pre-registered 2026-11-15: this header, the rule,
// the predictions and the code below were written and committed before any run that printed a score. A timing-only
// pilot (one column of machine-1-1's test half, printing points, checks and seconds and nothing else) showed one
// column in 10-minute buckets replayed after every point is out of reach (the replay grows with the cube of the
// points), and checked every 6 points (hourly) costs about 70 s against 3 s for hourly buckets.
//
//   sh eval/smd-fetch.sh smd-data        (or only the three machines below)
//   node eval/watch-smd-10min.mjs smd-data [cache-dir] > eval/watch-smd-10min.out.txt   (cache: per-machine lines, so a stopped run resumes)
//
// Why (README "Round 18"). Round 18's three label-free floors lost 63-86% of the segments Quiet caught on SMD's 28
// servers. Two thirds of SMD's segments (222 of 309) last under an hour, and in hourly buckets a 10-minute event is a
// sixth of a bucket's mean, so the floors (k read off a normal stretch at 2 lines per 100 checks) caught few of them
// (K 15, R 38, S 52 of 222). Round 18 left open "SMD at 10-minute buckets on a few machines, to see how much of the miss
// is hourly dilution". If finer buckets let a floor keep most of Quiet's catches, the miss was resolution, and a server
// watch should run on finer data; if not, the miss is the budget and the data, as round 18 read it.
//
// Design. Three machines, chosen by name before anything was looked at: the first of each SMD group, machine-1-1,
// machine-2-1 and machine-3-1 (30, 33 and 30 watched columns; 8, 13 and 3 scored segments in round 18). Each runs the
// round 18 pipeline twice, changing only the bucket:
//   H  hourly buckets, replayed after every point, baseline 24 points (round 18 exactly, on these machines);
//   T  10-minute buckets (consecutive means of 10 rows), checked every 6 points (once an hour, replayWatch's `step`,
//      each alert dated back by bisection to the point that would have sent it), baseline 144 points (one day).
// Kept in points, as shipped (not rescaled): the policy (Quiet, bocpd-ar1-window; window 1,000, confirm 5, tolerance 5,
// hold history, persist 2) and the floors' rolling windows (SPREAD_WINDOW 60, MOVE_WINDOW 60, MOVE_SPAN 12), so under T
// a floor compares a move with the last 10 hours, not 60. A segment's window is one bucket wider each side (under T,
// 10 minutes each side, against an hour under H). Setup: Quiet on the train half's first half (T: the train series cut
// at the half point; a replay is causal, so the lines are the same as on the whole half); each arm's k is read per
// machine by its own round's rule at 2 lines per 100 whole-watch hourly checks, so L (3-4 lines a machine) is the same
// under H and T. Arms Q, R, S, K as in round 18.
// Not run, to fit the session: the null stretch (the train half's second half). Round 18 measured it on all 28 machines
// under H; (a) of T14 is not re-tested here, and this round decides nothing for the product.
//
// Scores, on the three test halves after the baseline: lines; share of lines at a mark (the alerted change's index
// inside a segment window) and chance (the share of scored points inside a window); segments caught (some line's
// change index inside the window), split under 60 minutes / longer; median delay in hours from the segment's start to
// the first catching line's report; lines per 100 hourly checks.
//
// The rule, written before the run (D19; ties in "at least" pass):
//   For each floor arm X in R, S, K, its kept share is X's caught / Q's caught under the same bucket.
//   D19, dilution explains the miss for X: under T, X catches at least Q's caught minus floor(0.06 * Q's caught)
//   (T14's part (b) on these machines).
//   D19', dilution explains part of the miss for X: X's kept share under T is at least 20 points above its share under H.
//   If no arm meets D19: the README says finer buckets did not rescue the floors on these machines, and round 18's
//   reading (the miss is set by the data and the budget) stands with that added. If any arm meets D19: the README says
//   so, names hourly dilution as the cause of round 18's miss for that arm on these three machines, and pre-registers
//   T14 in full (with the null) under T on the other 25 machines; nothing ships from three machines.
//   Three arms on three machines (24 segments): one pass is weak evidence.
//
// Predictions, written before the run. H reproduces round 18's by-machine catches (Q 22, R 12, S 14, K 4 of 24). Under
// T, Quiet sends more lines an hour (it watches 6 times as many points with the same window and confirm) and catches
// about as many segments (it already catches 22 of 24). The floors' k under T is read off setup lines that are finer
// too, so short spikes in normal operation set it as high as the labelled ones. I predict no arm meets D19; R and S
// meet D19' (their kept share rises 20+ points, as short segments stop being diluted), K does not. Overall: dilution is
// part of the miss, not most of it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch, spreadRatio, moveRatio } from '../watch-core.mjs';
import { parseRows, parseInterpretation, machineFrom, score, floorsFor, ARMS } from './watch-smd.mjs';

export const MACHINES = ['machine-1-1', 'machine-2-1', 'machine-3-1'];
export const RUNS = { H: { bucket: 60, from: 24, step: 1 }, T: { bucket: 10, from: 144, step: 6 } };
const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000, detector: 'bocpd-ar1-window' };

if (!isMainThread && workerData === import.meta.url) {
  parentPort.on('message', ({ id, values, from, step, floor }) => {
    const r = replayWatch(values, null, { ...POLICY, from, step, budget: Infinity, ...(floor || {}) });
    parentPort.postMessage({ id, checks: r.checks, alerts: r.alerts.map((a) => ({ index: a.index, at: a.reportedAt, spread: spreadRatio(values, a), move: moveRatio(values, a) })) });
  });
}

async function runAll(jobs) {
  const results = new Array(jobs.length);
  const k = Math.max(1, Math.min(jobs.length, availableParallelism()));
  let next = 0, done = 0;
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[b].values.length / jobs[b].step - jobs[a].values.length / jobs[a].step);
  await new Promise((resolve, reject) => {
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: import.meta.url });
      const feed = () => { if (next < order.length) { const id = order[next++]; const j = jobs[id]; worker.postMessage({ id, values: j.values, from: j.from, step: j.step, floor: j.floor }); } else worker.terminate(); };
      worker.on('message', (m) => { results[m.id] = m; done++; if (done % 20 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

/** D19 and D19' for one arm (exported so the test can check them on made-up totals). */
export function ruleD19(qH, xH, qT, xT) {
  const kept = (x, q) => (q.caught ? (100 * x.caught) / q.caught : 0);
  return { d19: xT.caught >= qT.caught - Math.floor(0.06 * qT.caught), d19p: kept(xT, qT) - kept(xH, qH) >= 20, keptH: kept(xH, qH), keptT: kept(xT, qT) };
}

/** One machine under one run: its floors and every arm's test lines (cached in `cache` when given, so a long run resumes). */
async function runMachine(r, { bucket, from, step }, cache) {
  const file = cache && join(cache, `${r.name}-${bucket}.json`);
  const m = machineFrom(r, bucket, from);
  if (file && existsSync(file)) return { m, ...JSON.parse(readFileSync(file, 'utf8')) };
  const jobs1 = m.tr.map((values, c) => ({ c, values: values.slice(0, m.half), from, step, floor: null }));
  const res1 = await runAll(jobs1);
  const setup = jobs1.map((j, i) => res1[i].alerts.filter((a) => a.at < m.half));
  const f = floorsFor(setup, Math.floor((m.half - from) / step));
  const F = { L: f.L, kR: f.kR, kS: f.kS, loud: f.loud, kK: f.kK };
  const jobs2 = [];
  m.cols.forEach((_, c) => { for (const arm of ARMS) jobs2.push({ c, arm, values: m.te[c], from, step, floor: f[arm][c] }); });
  const res2 = await runAll(jobs2);
  const got = Object.fromEntries(ARMS.map((a) => [a, []]));
  jobs2.forEach((j, i) => { for (const x of res2[i].alerts) got[j.arm].push({ index: x.index, at: x.at, col: j.c }); });
  if (file) { mkdirSync(cache, { recursive: true }); writeFileSync(file, JSON.stringify({ F, got })); }
  return { m, F, got };
}

async function runOne(raw, run, cache) {
  const { bucket, step } = run;
  const per = [];
  for (const r of raw) per.push(await runMachine(r, run, cache));
  const machines = per.map((p) => p.m);
  const T = {};
  for (const arm of ARMS) {
    const t = (T[arm] = score(machines, (m) => per[machines.indexOf(m)].got[arm]));
    t.hours = machines.reduce((s, m) => s + Math.floor(m.scored / step), 0);
    t.per100h = (100 * t.alerts) / t.hours;
    t.medianDelayH = t.medianDelay === null ? null : (t.medianDelay * bucket) / 60;
    t.byMachine = machines.map((m, mi) => score([m], () => per[mi].got[arm]).caught);
  }
  const chance = machines.reduce((s, m) => s + m.covered, 0) / machines.reduce((s, m) => s + m.scored, 0);
  return { machines, F: per.map((p) => p.F), T, chance };
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'smd-data';
  const t0 = Date.now();
  const raw = MACHINES.map((name) => ({
    name,
    train: parseRows(readFileSync(join(dir, 'train', `${name}.txt`), 'utf8'), name),
    test: parseRows(readFileSync(join(dir, 'test', `${name}.txt`), 'utf8'), name),
    label: readFileSync(join(dir, 'test_label', `${name}.txt`), 'utf8').trim().split('\n').map(Number),
    interp: parseInterpretation(readFileSync(join(dir, 'interpretation_label', `${name}.txt`), 'utf8')),
  }));
  const out = {};
  for (const run of ['H', 'T']) {
    const t1 = Date.now();
    out[run] = await runOne(raw, RUNS[run], process.argv[3]);
    const { machines, F, T, chance } = out[run];
    const { bucket, from, step } = RUNS[run];
    console.log(`\n${run}: ${bucket}-minute buckets, checked every ${step} point${step > 1 ? 's' : ''}, baseline ${from} points (${((Date.now() - t1) / 1000).toFixed(0)} s).`);
    console.log('  machine        cols  L    k R     k S (non-loud; loud own k)        k K   segments scored');
    machines.forEach((m, mi) => {
      const f = F[mi];
      const sTxt = `${f.kS.find((_, c) => !f.loud.includes(c))?.toFixed(2) ?? '-'}${f.loud.length ? ` (${f.loud.map((c) => `m${m.cols[c] + 1}: ${f.kS[c].toFixed(1)}`).join(', ')})` : ''}`;
      console.log(`  ${m.name.padEnd(14)} ${String(m.cols.length).padStart(4)}  ${String(f.L).padStart(2)}  ${f.kR.toPrecision(4).padStart(9)}  ${sTxt.padEnd(32)} ${f.kK.toPrecision(4).padStart(9)}  ${m.wins.filter((w) => w.b >= m.from).length}`);
    });
    console.log(`  chance: ${(100 * chance).toFixed(1)}% of scored points lie inside a segment window`);
    console.log('  arm   lines  at a mark  per 100 h  caught  under 60 min / longer  median delay h  by machine');
    for (const arm of ARMS) {
      const t = T[arm];
      console.log(`  ${arm}    ${String(t.alerts).padStart(5)}    ${t.share.toFixed(1).padStart(5)}%  ${t.per100h.toFixed(1).padStart(8)}   ${String(t.caught).padStart(2)}/${t.segs}   ${String(t.shortCaught).padStart(2)}/${t.short}, ${t.caught - t.shortCaught}/${t.segs - t.short}             ${t.medianDelayH === null ? '-' : t.medianDelayH.toFixed(1)}      ${t.byMachine.join(' ')}`);
    }
  }
  console.log('\nD19 (under T, X catches at least Q - floor(0.06 Q)) and D19\' (X\'s kept share of Q\'s catches rises 20+ points, H to T):');
  for (const arm of ['R', 'S', 'K']) {
    const r = ruleD19(out.H.T.Q, out.H.T[arm], out.T.T.Q, out.T.T[arm]);
    console.log(`  ${arm}: kept ${r.keptH.toFixed(0)}% under H, ${r.keptT.toFixed(0)}% under T; D19 ${r.d19 ? 'MET' : 'NOT MET'} (${out.T.T[arm].caught} vs ${out.T.T.Q.caught} - ${Math.floor(0.06 * out.T.T.Q.caught)}); D19' ${r.d19p ? 'MET' : 'NOT MET'}.`);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall on ${availableParallelism()} cores.`);
}
