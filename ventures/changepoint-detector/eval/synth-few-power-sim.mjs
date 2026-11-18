// Simulation: size and power of the synthetic control's placebo test with few units, with and without one donor that
// has its own shock after the date. README "Few donors", Next: "a size and power check at 10-20 units in simulation
// (how often rank 1 is reached with a real 2 sd step when one donor has its own shock)"; pre-registration
// eval/synth-few-power-prereg-2026-11-18.md.
// Panels from the shipped generator (eval/synth-sim.mjs, cell N1's shape: two AR(1) factors, idiosyncratic sd 0.5,
// 19 points before the date and 12 after) with 11, 16 or 21 units (10, 15 or 20 donors). Unit 0 is treated; unit 1
// is the donor that may carry its own shock. Per cell:
//   effect  the treated unit drops by `effect` from the date on (-1.0 = two idiosyncratic sd, the README's "2 sd step")
//   shock   donor 1 moves by `shock` (sign drawn per panel) from the date on: its own event, nothing to do with the
//           treatment (a store refitted, a region with a plant closure)
// Scored with the shipped defaults (outcome-only fit, floored ratio, pool without the treated unit); the plain ratio
// and the after-gap alone are recorded too (reported, never a bar). Each panel is also scored with donor 1 left out
// of the pool beforehand (rankExcl, effectExcl).
//   SC_SEED_BASE=81000 SC_SHARD=0/4 node eval/synth-few-power-sim.mjs 50 > part0.json
import { synthControlTest } from '../synth-control.mjs';
import { panel, CELLS as OLD } from './synth-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

const N1 = OLD.N1;
const cellsFor = (units) => ({
  [`N${units}`]: { ...N1, units, effect0: 0, shock: 0 },
  [`ND${units}`]: { ...N1, units, effect0: 0, shock: 1.0 },
  [`P${units}`]: { ...N1, units, effect0: -1.0, shock: 0 },
  [`PD${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0 },
  [`PE${units}`]: { ...N1, units, effect0: -1.0, shock: 2.0 },
});
export const CELLS = { ...cellsFor(11), ...cellsFor(16), ...cellsFor(21) };

// rows (unit 0 treated, unit 1 the donor that may be shocked) and the drawn sign of donor 1's shock.
export function fewPanel(cell, seed) {
  const rows = panel(cell, seed);
  const sign = (seed >>> 7) & 1 ? 1 : -1;
  for (let t = cell.k; t < rows[0].length; t++) {
    rows[0][t] += cell.effect0;
    rows[1][t] += sign * cell.shock;
  }
  return { rows, sign };
}

export function scorePanel(cell, seed) {
  const { rows, sign } = fewPanel(cell, seed);
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthControlTest(rows[0], donors, cell.k);
  const own = r.tests.floored.value;
  const shocked = r.placebos[0]; // d0 is unit 1
  // the same panel with donor 1 left out of the pool before the fit, as a user would leave out a donor whose own event
  // is known in advance (a pre-declared exclusion, not one chosen after seeing the ranks)
  const { d0, ...rest } = donors;
  const x = synthControlTest(rows[0], rest, cell.k);
  return {
    rank: r.rank, p: r.p, units: cell.units,
    rankRatio: r.tests.ratio.rank, rankPost: r.tests.post.rank,
    effect: r.effectAverage, fitWarning: r.fitWarning,
    shockedAbove: shocked.floored >= own - 1e-12 * Math.abs(own),
    shockedWeight: r.donorWeights.d0, sign,
    rankExcl: x.rank, effectExcl: x.effectAverage,
  };
}

if (process.argv[1]?.endsWith('synth-few-power-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 81000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const name of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(name);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: name, rep, ...scorePanel(CELLS[name], seedOf(base, ci, rep)) }));
  }
}
