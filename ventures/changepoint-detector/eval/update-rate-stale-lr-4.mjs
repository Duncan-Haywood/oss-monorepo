// Pre-registered, round four of telling a one-tick stale feed from a rounded slow series
// (README "One-tick stale feeds: a heavy-tailed walk"; rounded-walk.mjs `staleTestHeavy`; update-rate.mjs
// `trim: 'range'`).
//
// Round three (eval/update-rate-stale-lr.mjs, .out.txt) failed K1 (R cells called stale 7.0 / 11.5 /
// 9.0%) and its wording-only K4 (X1, a heavy-tailed walk, 61.5%). Its post hoc (eval/update-rate-stale-
// lr-why.mjs) named two causes and so two changes, both made here and nothing else:
//   1. the stretch: the partition's cut lands a few steps late, so the sticky stretch ends with the fast
//      regime's moves. Now the likelihood sees the stretch only inside its cuts' date ranges (cutRanges,
//      the shipped slack 6): `trim: 'range'`. Not the post hoc's 15 steps, a number seen on the data.
//   2. the walk: a Gaussian M0 reads a heavy-tailed walk's rare big jumps after quiet runs as catch-ups.
//      Now both models have Student t steps, nu profiled over {2, 4, 10, Infinity} (Infinity is round
//      three's Gaussian), so M0 can explain big jumps by heavy tails; M1 must win on catch-ups that grow
//      with the run. The grid was written down before any run and does not include X1's own 3.
// The threshold stays 5.41 (theory, the 1% point of the boundary mix; nu is a nuisance shared by M0 and
// M1). Grid 10 cells a tick, search bounds and iteration counts as in round three.
//
// Disclosed beforehand: one smoke run on seed 6, 20 series a cell, to check the code and its run time
// (output in the commit message of the commit that adds this file, not used to choose anything).
//
// Confirmation: seed 20261216, run once, 200 series a cell. Cells R1-R3, T1-T3, F1-F3 as rounds one to
// three, X1 and X2 as round three, and one new cell reported but not judged:
//   X3: X1's heavy-tailed walk (t3 steps, sd 0.06) carried forward with probability 0.6 for the first
//       150 steps, then the 10-tick walk: what the heavier M0 costs in power on a heavy-tailed stale feed.
// Rule. All of K1-K4 must hold for the check to ship (K4 now binds: real slow series often jump, and
// a check that calls them stale would mislead):
//   K1. every R cell: catchUp in <= 5% of one-tick series, and rounding >= 90% of series with a change;
//   K2. every T cell with >= 50 one-tick series: catchUp in >= 80% of them (>= 2 judged);
//   K3. every F cell: rounding <= 5% of series with a change;
//   K4. every X1/X2 cell with >= 50 one-tick series: catchUp in <= 10% of them.
// Pass: `method: 'lr'` with the heavy test and `trim: 'range'` becomes CATCHUP's default and the catch-up
// sentence ships. Fail any: it does not, CATCHUP stays off, and the README says which line failed.
// usage: node eval/update-rate-stale-lr-4.mjs [seed reps] > eval/update-rate-stale-lr-4.out.txt
// (four worker threads; about 10 minutes on four cores)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { updateRateChanges } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { CELLS as R3CELLS } from './update-rate-stale-lr.mjs';
import { N, AT } from './update-rate-catchup.mjs';
import { staleTestHeavy } from '../rounded-walk.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CONFIRMATION_SEED = 20261216, REPS = 200;
export const LR4_RULE = { method: 'lr', lr: 5.41, test: staleTestHeavy, trim: 'range' };
const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
const round = (v) => Math.round(v * 10) / 10;
function student3(rnd) { let c = 0; for (let i = 0; i < 3; i++) c += gauss(rnd) ** 2; return gauss(rnd) / Math.sqrt(c / 3); }
function heavyStale(rnd) {
  const x = [50]; let lv = 50;
  for (let t = 1; t < N; t++) {
    if (t < AT) { lv += (0.06 / Math.sqrt(3)) * student3(rnd); x.push(rnd() < 0.6 ? x[t - 1] : round(lv)); }
    else { lv += 1.0 * gauss(rnd); x.push(round(lv)); }
  }
  return x;
}
export const CELLS = { ...R3CELLS, X3: heavyStale };

/** One series' verdict on the change nearest AT, or null when there is no change. */
export function judge(v, catchUp = LR4_RULE) {
  const u = updateRateChanges(v, { catchUp });
  if (!u.changes.length) return null;
  const c = u.changes.reduce((a, z) => (Math.abs(z.index - AT) < Math.abs(a.index - AT) ? z : a));
  return { rounding: !!c.rounding, catchUp: !!c.catchUp, lr: c.staleLR };
}

export function tally(cellNames, verdicts) {
  const out = {};
  cellNames.forEach((name, i) => {
    let found = 0, oneTick = 0, caught = 0, rounding = 0;
    for (const c of verdicts[i]) {
      if (!c) continue;
      found++;
      if (c.rounding || c.catchUp) oneTick++;
      if (c.catchUp) caught++;
      if (c.rounding) rounding++;
    }
    out[name] = { found, oneTick, caught, rounding, caughtShare: oneTick ? caught / oneTick : NaN, roundingShare: found ? rounding / found : NaN };
  });
  const R = ['R1', 'R2', 'R3'], T = ['T1', 'T2', 'T3'], F = ['F1', 'F2', 'F3'], X = ['X1', 'X2'];
  const k1 = R.every((k) => out[k].caughtShare <= 0.05 && out[k].roundingShare >= 0.9);
  const judged = T.filter((k) => out[k].oneTick >= 50);
  const k2 = judged.length >= 2 && judged.every((k) => out[k].caughtShare >= 0.8);
  const k3 = F.every((k) => out[k].roundingShare <= 0.05);
  const judgedX = X.filter((k) => out[k].oneTick >= 50);
  const k4 = judgedX.every((k) => out[k].caughtShare <= 0.1);
  return { cells: out, judged, judgedX, k1, k2, k3, k4, ships: k1 && k2 && k3 && k4 };
}

/** Series are drawn in one stream (cell by cell, as rounds one to three), then judged on worker threads. */
export async function run(seed = CONFIRMATION_SEED, reps = REPS, threads = Math.min(4, cpus().length)) {
  const rnd = makeRng(seed), names = Object.keys(CELLS), jobs = [];
  for (const name of names) for (let i = 0; i < reps; i++) jobs.push(CELLS[name](rnd));
  const parts = Array.from({ length: threads }, (_, w) => jobs.map((v, j) => [j, v]).filter(([j]) => j % threads === w));
  const results = new Array(jobs.length);
  await Promise.all(parts.map((part) => new Promise((ok, bad) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: part });
    wk.on('message', (rows) => { for (const [j, c] of rows) results[j] = c; ok(); });
    wk.on('error', bad);
  })));
  return tally(names, names.map((_, c) => results.slice(c * reps, (c + 1) * reps)));
}

if (!isMainThread) parentPort.postMessage(workerData.map(([j, v]) => [j, judge(v)]));

const invoked = isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const seed = Number(process.argv[2] ?? CONFIRMATION_SEED), reps = Number(process.argv[3] ?? REPS);
  const t0 = Date.now();
  const r = await run(seed, reps);
  console.log(`seed ${seed}, ${reps} series a cell, n ${N}, change at ${AT}, rule LR >= ${LR4_RULE.lr}, t steps nu in {2, 4, 10, Inf}, stretch trimmed to its cuts' ranges`);
  console.log('cell  with a change  one tick  catchUp  share of one tick  rounding  share of found');
  for (const [k, v] of Object.entries(r.cells)) {
    console.log(`${k.padEnd(4)}  ${String(v.found).padStart(13)}  ${String(v.oneTick).padStart(8)}  ${String(v.caught).padStart(7)}  ${(Number.isNaN(v.caughtShare) ? '-' : v.caughtShare.toFixed(3)).padStart(17)}  ${String(v.rounding).padStart(8)}  ${(Number.isNaN(v.roundingShare) ? '-' : v.roundingShare.toFixed(3)).padStart(14)}`);
  }
  console.log(`judged T cells: ${r.judged.join(', ') || 'none'}; judged X cells: ${r.judgedX.join(', ') || 'none'} (X3 reported, not judged)`);
  console.log(`K1 (R: catchUp <= 0.05 of one tick, rounding >= 0.90): ${r.k1 ? 'pass' : 'FAIL'}`);
  console.log(`K2 (judged T: catchUp >= 0.80 of one tick, >= 2 judged): ${r.k2 ? 'pass' : 'FAIL'}`);
  console.log(`K3 (F: rounding <= 0.05): ${r.k3 ? 'pass' : 'FAIL'}`);
  console.log(`K4 (judged X1/X2: catchUp <= 0.10 of one tick): ${r.k4 ? 'pass' : 'FAIL'}`);
  console.log(`Verdict: ${r.ships ? 'the heavy-tailed, trimmed likelihood check ships' : 'does not ship'}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
