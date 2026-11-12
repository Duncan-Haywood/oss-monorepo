// Pre-registered: telling a stale feed whose moves are about one tick from a rounded slow series
// (update-rate.mjs, CATCHUP; README "One-tick stale feeds: the catch-up check").
//
// Why: the rounding sentence (eval/update-rate-rounding.mjs) flags a change of update rate as
// `rounding` when, in the stickier stretch, the median move is at most 1.5 ticks. Its README section
// named the case it cannot separate: a stale feed whose real moves are themselves about one tick.
// The difference is the move that ends a run of repeats. A rounded walk leaves a run by crossing the
// next rounding boundary, so that move stays about one tick however long the run. A stale figure
// catches up on every step it skipped, so its variance grows about k + 1 times after k repeats.
// catchUpRatio = mean squared move (ticks) ending a run of >= 2 repeats / mean squared move that
// follows a move; `catchUp` (and not `rounding`) when it is >= 1.4, with >= 5 moves on each side.
//
// How the setting was chosen (disclosed): on calibration seed 1 only (a scratch script, not kept),
// runs of >= 1, >= 2 and >= 3 were tried; >= 2 was taken, and 1.4 set just above the largest 95th
// percentile of the ratio in the three rounded-walk cells (1.32, R3) and below the 5th percentile of
// the one-tick stale cells (1.26 to 1.35, so some stale feeds will stay `rounding`).
//
// Confirmation: seed 20261213, run once after this file and the code were committed, no retuning.
// n 300, change at step 150, 200 series a cell, tick 0.1. R1-R3 and F1-F3 are the cells of
// eval/update-rate-rounding.mjs; the new one-tick stale feeds are Gaussian walks carried forward:
//   T1: walk sd 0.10 (one tick), carried forward with probability 0.1, then 0.6;
//   T2: walk sd 0.12, carried forward 0.6, then 0.1;
//   T3: walk sd 0.10, clumped carry-forward (P(stay | stayed) 0.7, P(stay | moved) 0.2), then 0.05.
// Measured on the change nearest step 150, among series with a change. "One tick" = the old flag
// (rounding or catchUp: the median-move test alone).
// Rule (all must hold for the catch-up check to ship):
//   K1. every R cell: catchUp in <= 5% of one-tick series, and rounding still >= 90% of series with
//       a change (the rounding rule's Q1 must survive);
//   K2. every T cell with >= 50 one-tick series: catchUp in >= 80% of them (a cell with fewer
//       one-tick series is reported, not judged; at least two T cells must be judged);
//   K3. every F cell: rounding <= 5% of series with a change (Q2 survives).
// Round one's verdict (eval/update-rate-catchup.out.txt): K1 FAIL (R3 6.0% catchUp, bar 5%); K2, K3
// pass. Does not ship. Round two: eval/update-rate-catchup-2.mjs.
// usage: node eval/update-rate-catchup.mjs > eval/update-rate-catchup.out.txt
import { updateRateChanges } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { CELLS as ROUNDING_CELLS } from './update-rate-rounding.mjs';

export const N = 300, AT = 150, REPS = 200, SEED = 20261213;
const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
const round = (v) => Math.round(v * 10) / 10;
function stale(rnd, s, before, after) {
  const x = [50]; let lv = 50, stayed = false;
  for (let t = 1; t < N; t++) {
    lv += s * gauss(rnd);
    const p = t < AT ? before : after;
    stayed = rnd() < (stayed ? p[0] : p[1]);
    x.push(stayed ? x[t - 1] : round(lv));
  }
  return x;
}
export const CELLS = {
  R1: ROUNDING_CELLS.R1, R2: ROUNDING_CELLS.R2, R3: ROUNDING_CELLS.R3,
  T1: (r) => stale(r, 0.1, [0.1, 0.1], [0.6, 0.6]), T2: (r) => stale(r, 0.12, [0.6, 0.6], [0.1, 0.1]), T3: (r) => stale(r, 0.1, [0.7, 0.2], [0.05, 0.05]),
  F1: ROUNDING_CELLS.F1, F2: ROUNDING_CELLS.F2, F3: ROUNDING_CELLS.F3,
};

export const ROUND_ONE = { minRun: 2, ratio: 1.4, minMoves: 5 };
export function run(seed = SEED, reps = REPS, catchUp = ROUND_ONE) {
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
  const R = ['R1', 'R2', 'R3'], T = ['T1', 'T2', 'T3'], F = ['F1', 'F2', 'F3'];
  const k1 = R.every((k) => out[k].caughtShare <= 0.05 && out[k].roundingShare >= 0.9);
  const judged = T.filter((k) => out[k].oneTick >= 50);
  const k2 = judged.length >= 2 && judged.every((k) => out[k].caughtShare >= 0.8);
  const k3 = F.every((k) => out[k].roundingShare <= 0.05);
  return { cells: out, judged, k1, k2, k3, ships: k1 && k2 && k3 };
}

const invoked = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invoked) {
  const r = run();
  console.log(`seed ${SEED}, ${REPS} series a cell, n ${N}, change at ${AT}`);
  console.log('cell  with a change  one tick  catchUp  share of one tick  rounding  share of found');
  for (const [k, v] of Object.entries(r.cells)) {
    console.log(`${k.padEnd(4)}  ${String(v.found).padStart(13)}  ${String(v.oneTick).padStart(8)}  ${String(v.caught).padStart(7)}  ${(Number.isNaN(v.caughtShare) ? '-' : v.caughtShare.toFixed(3)).padStart(17)}  ${String(v.rounding).padStart(8)}  ${v.roundingShare.toFixed(3).padStart(14)}`);
  }
  console.log(`judged T cells: ${r.judged.join(', ') || 'none'}`);
  console.log(`K1 (R: catchUp <= 0.05 of one tick, rounding >= 0.90): ${r.k1 ? 'pass' : 'FAIL'}`);
  console.log(`K2 (judged T: catchUp >= 0.80 of one tick, >= 2 judged): ${r.k2 ? 'pass' : 'FAIL'}`);
  console.log(`K3 (F: rounding <= 0.05): ${r.k3 ? 'pass' : 'FAIL'}`);
  console.log(`Verdict: ${r.ships ? 'the catch-up check ships' : 'does not ship'}`);
}
