// Pre-registered, round three of telling a one-tick stale feed from a rounded slow series
// (README "One-tick stale feeds: a likelihood"; rounded-walk.mjs; update-rate.mjs `method: 'lr'`).
//
// Rounds one and two (eval/update-rate-catchup.mjs, eval/update-rate-catchup-2.mjs) used the catch-up
// ratio, which reads only the moves that end a run of repeats; they bracketed a trade-off (R3 called
// stale 6.0% at a ratio that caught 90% of one-tick stale feeds; 79.5% caught at a ratio that kept R3
// at 1.5%). The README named the next idea: a likelihood for a rounded walk against a rounded walk
// carried forward. This round tests it.
//
// This file and rounded-walk.mjs were committed before CONFIRMATION_SEED ran. Disclosed beforehand:
// a smoke run on seed 3 (10 series a cell, sticky halves cut by hand, a scratch script not kept) to check
// the code and its run time: R-cell LR 0.0 to 5.2, T-cell LR 21 to 174. The grid (10 cells a tick) was
// checked against 20 and 40 cells on seed 4 (LR moved under 0.02). Nothing was chosen on either seed:
// the threshold 5.41 is the 1% point of the 50:50 mix of 0 and chi-square(1), set from theory; the grid,
// search bounds and iteration counts are as first written.
//
// Confirmation: seed 20261215, run once, 200 series a cell, the same R1-R3, T1-T3 and F1-F3 cells and
// the same rule K1-K3 as rounds one and two, so the verdicts compare:
//   K1. every R cell: catchUp in <= 5% of one-tick series, and rounding >= 90% of series with a change;
//   K2. every T cell with >= 50 one-tick series: catchUp in >= 80% of them (>= 2 judged);
//   K3. every F cell: rounding <= 5% of series with a change.
// Pass K1-K3: `method: 'lr'` becomes update-rate.mjs CATCHUP's default and the catch-up sentence ships.
// Fail any: it does not ship and CATCHUP stays off.
//
// K4, pre-registered here, decides only the wording, because the likelihood assumes a Gaussian hidden
// walk and real series need not be one. Two rounded series that are not Gaussian walks, each slow
// (about 0.6 ticks a step) for the first 150 steps and a 10-tick walk after (as R3), 200 series a cell:
//   X1: walk steps Student t, 3 degrees of freedom, scaled to sd 0.06 (0.6 ticks);
//   X2: mean-reverting, u_t = 0.95 u_{t-1} + 0.06 e_t around 50, then the 10-tick walk.
//   K4: catchUp in <= 10% of one-tick series in each judged X cell (>= 50 one-tick series).
// If K1-K3 pass and K4 fails, it ships with the caveat in the sentence and the README that a series
// whose hidden value jumps or reverts can read as stale.
// usage: node eval/update-rate-stale-lr.mjs > eval/update-rate-stale-lr.out.txt  (about 10 minutes)
import { updateRateChanges } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { CELLS as BASE, N, AT } from './update-rate-catchup.mjs';
import { staleTest } from '../rounded-walk.mjs';
import { pathToFileURL } from 'node:url';

export const CONFIRMATION_SEED = 20261215, REPS = 200;
export const LR_RULE = { method: 'lr', lr: 5.41, test: staleTest };
const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
const round = (v) => Math.round(v * 10) / 10;
function student3(rnd) { let c = 0; for (let i = 0; i < 3; i++) c += gauss(rnd) ** 2; return gauss(rnd) / Math.sqrt(c / 3); }
function heavyWalk(rnd) {
  const x = [50]; let lv = 50;
  for (let t = 1; t < N; t++) { lv += t < AT ? (0.06 / Math.sqrt(3)) * student3(rnd) : 1.0 * gauss(rnd); x.push(round(lv)); }
  return x;
}
function reverting(rnd) {
  const x = [50]; let u = 0, lv = 50;
  for (let t = 1; t < N; t++) {
    if (t < AT) { u = 0.95 * u + 0.06 * gauss(rnd); lv = 50 + u; } else lv += 1.0 * gauss(rnd);
    x.push(round(lv));
  }
  return x;
}
export const CELLS = { ...BASE, X1: heavyWalk, X2: reverting };

export function run(seed = CONFIRMATION_SEED, reps = REPS, catchUp = LR_RULE) {
  const rnd = makeRng(seed), out = {};
  for (const [name, gen] of Object.entries(CELLS)) {
    let found = 0, oneTick = 0, caught = 0, rounding = 0;
    for (let i = 0; i < reps; i++) {
      const u = updateRateChanges(gen(rnd), { catchUp });
      if (!u.changes.length) continue;
      found++;
      const c = u.changes.reduce((a, z) => (Math.abs(z.index - AT) < Math.abs(a.index - AT) ? z : a));
      if (c.rounding || c.catchUp) oneTick++;
      if (c.catchUp) caught++;
      if (c.rounding) rounding++;
    }
    out[name] = { found, oneTick, caught, rounding, caughtShare: oneTick ? caught / oneTick : NaN, roundingShare: found ? rounding / found : NaN };
  }
  const R = ['R1', 'R2', 'R3'], T = ['T1', 'T2', 'T3'], F = ['F1', 'F2', 'F3'], X = ['X1', 'X2'];
  const k1 = R.every((k) => out[k].caughtShare <= 0.05 && out[k].roundingShare >= 0.9);
  const judged = T.filter((k) => out[k].oneTick >= 50);
  const k2 = judged.length >= 2 && judged.every((k) => out[k].caughtShare >= 0.8);
  const k3 = F.every((k) => out[k].roundingShare <= 0.05);
  const judgedX = X.filter((k) => out[k].oneTick >= 50);
  const k4 = judgedX.every((k) => out[k].caughtShare <= 0.1);
  return { cells: out, judged, judgedX, k1, k2, k3, k4, ships: k1 && k2 && k3 };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const t0 = Date.now();
  const r = run();
  console.log(`seed ${CONFIRMATION_SEED}, ${REPS} series a cell, n ${N}, change at ${AT}, rule LR >= ${LR_RULE.lr}`);
  console.log('cell  with a change  one tick  catchUp  share of one tick  rounding  share of found');
  for (const [k, v] of Object.entries(r.cells)) {
    console.log(`${k.padEnd(4)}  ${String(v.found).padStart(13)}  ${String(v.oneTick).padStart(8)}  ${String(v.caught).padStart(7)}  ${(Number.isNaN(v.caughtShare) ? '-' : v.caughtShare.toFixed(3)).padStart(17)}  ${String(v.rounding).padStart(8)}  ${(Number.isNaN(v.roundingShare) ? '-' : v.roundingShare.toFixed(3)).padStart(14)}`);
  }
  console.log(`judged T cells: ${r.judged.join(', ') || 'none'}; judged X cells: ${r.judgedX.join(', ') || 'none'}`);
  console.log(`K1 (R: catchUp <= 0.05 of one tick, rounding >= 0.90): ${r.k1 ? 'pass' : 'FAIL'}`);
  console.log(`K2 (judged T: catchUp >= 0.80 of one tick, >= 2 judged): ${r.k2 ? 'pass' : 'FAIL'}`);
  console.log(`K3 (F: rounding <= 0.05): ${r.k3 ? 'pass' : 'FAIL'}`);
  console.log(`K4 (judged X: catchUp <= 0.10 of one tick; wording only): ${r.k4 ? 'pass' : 'FAIL'}`);
  console.log(`Verdict: ${r.ships ? 'the likelihood catch-up check ships' : 'does not ship'}${r.ships && !r.k4 ? ', with the non-Gaussian caveat' : ''}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
