// Pre-registered: telling repeats from rounding apart from repeats from a stale feed (update-rate.mjs,
// ROUNDING_TICKS; README "Repeats from rounding").
//
// Why: on the frozen orange juice file's `ppi` column the update-rate check reports repeats falling
// from 33% to 8% of months around 1969. The index was published every month; it is recorded to 0.1 and
// moved less than that in half the 1950s and 1960s months. Its repeats are rounding, not staleness.
// The juice `price` column's stickier stretch moves a median 19.5 ticks when it moves: stale, not
// rounding. Both real columns were looked at before this rule was written (so they are not evidence
// for it); the threshold 1.5 ticks (half the moves in the stickier stretch are one tick) was set from
// what "moves by its precision" means, then checked here once, on one seed, with no retuning.
//
// Cells, n 300, change of behaviour at step 150, 200 series a cell, seed 20261212. Each series is a
// Gaussian random walk from 50 with step sd s, rounded to a tick of 0.1:
//   R1: s 0.04 -> 0.40 (rounded walk that speeds up: repeats from rounding fall);
//   R2: s 0.40 -> 0.05 (slows down: repeats rise);
//   R3: s 0.06 -> 1.0;
//   F1: s 2.0 throughout; each step carries the last value forward with probability 0.6, then 0.1
//       (a stale feed that was fixed);
//   F2: s 0.5 throughout (5 ticks), carried forward with probability 0.1, then 0.6;
//   F3: s 2.0, clumped carry-forward (P(stay | stayed) 0.7, P(stay | moved) 0.2), then 0.05.
// Measured on series where the check reports one or more changes: the share whose change nearest step
// 150 is flagged `rounding`.
// Rule (all must hold for the rounding sentence to ship):
//   Q1. every R cell: flagged >= 90% of series with a change;
//   Q2. every F cell: flagged <= 5% of series with a change.
// usage: node eval/update-rate-rounding.mjs > eval/update-rate-rounding.out.txt
import { updateRateChanges } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';

const N = 300, AT = 150, REPS = 200, SEED = 20261212;
const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
const round = (v) => Math.round(v * 10) / 10;

function walk(rnd, s1, s2) {
  const x = [50]; let lv = 50;
  for (let t = 1; t < N; t++) { lv += (t < AT ? s1 : s2) * gauss(rnd); x.push(round(lv)); }
  return x;
}
function stale(rnd, s, before, after) {
  // before/after: [P(stay | stayed), P(stay | moved)]
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
  R1: (r) => walk(r, 0.04, 0.4), R2: (r) => walk(r, 0.4, 0.05), R3: (r) => walk(r, 0.06, 1.0),
  F1: (r) => stale(r, 2.0, [0.6, 0.6], [0.1, 0.1]), F2: (r) => stale(r, 0.5, [0.1, 0.1], [0.6, 0.6]), F3: (r) => stale(r, 2.0, [0.7, 0.2], [0.05, 0.05]),
};

export function run(seed = SEED, reps = REPS) {
  const rnd = makeRng(seed), out = {};
  for (const [name, gen] of Object.entries(CELLS)) {
    let found = 0, flagged = 0, near = 0;
    for (let i = 0; i < reps; i++) {
      const u = updateRateChanges(gen(rnd));
      if (!u.changes.length) continue;
      found++;
      const c = u.changes.reduce((a, z) => (Math.abs(z.index - AT) < Math.abs(a.index - AT) ? z : a));
      if (Math.abs(c.index - AT) <= 20) near++;
      if (c.rounding) flagged++;
    }
    out[name] = { found, near, flagged, share: found ? flagged / found : NaN };
  }
  const q1 = ['R1', 'R2', 'R3'].every((k) => out[k].share >= 0.9);
  const q2 = ['F1', 'F2', 'F3'].every((k) => out[k].share <= 0.05);
  return { cells: out, q1, q2, ships: q1 && q2 };
}

const invoked = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invoked) {
  const r = run();
  console.log(`seed ${SEED}, ${REPS} series a cell, n ${N}, change at ${AT}`);
  console.log('cell  with a change  within 20 steps  flagged rounding  share');
  for (const [k, v] of Object.entries(r.cells)) console.log(`${k.padEnd(4)}  ${String(v.found).padStart(13)}  ${String(v.near).padStart(15)}  ${String(v.flagged).padStart(16)}  ${v.share.toFixed(3)}`);
  console.log(`Q1 (R cells >= 0.90): ${r.q1 ? 'pass' : 'FAIL'}`);
  console.log(`Q2 (F cells <= 0.05): ${r.q2 ? 'pass' : 'FAIL'}`);
  console.log(`Verdict: ${r.ships ? 'the rounding sentence ships' : 'does not ship'}`);
}
