// Simulation: the few-donor placebo test when two donors have their own after-date shocks, and when the one shocked
// donor is the treated unit's best match. README "Few donors: size and power" ended: "two shocked donors at 11-16
// units" and listed "a shocked donor that is also the treated unit's best match" as untested. Pre-registration
// eval/synth-two-shock-prereg-2026-11-18.md.
// Panels from the shipped generator (eval/synth-sim.mjs, N1's shape: two AR(1) factors, idiosyncratic sd 0.5, 19 points
// before and 12 after) with 11 or 16 units. Unit 0 is treated (drops by `effect0` from the date). Per cell:
//   shocks  the number of shocked donors (0, 1 or 2): units 1 and 2, each moved by `shock` from the date, each with its
//           own sign drawn per panel (independent events)
//   best    true: the one shocked donor is not unit 1 but the donor with the largest weight in the treated unit's fit
//           (the weights use the before-period only, so they are found before any shock is added)
// Scored with the shipped defaults (outcome-only fit, floored ratio). Each panel is also refitted with the shocked
// donors left out of the pool beforehand: the first only (excl1, a user who knew of one event and not the other) and
// all of them (exclAll), as a user leaves out donors whose own events are known in advance.
//   SC_SEED_BASE=85000 SC_SHARD=0/4 node eval/synth-two-shock-sim.mjs 100 > part0.json
import { synthControlTest, synthFit } from '../synth-control.mjs';
import { panel, CELLS as OLD } from './synth-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

const N1 = OLD.N1;
const cellsFor = (units) => ({
  [`P${units}`]: { ...N1, units, effect0: -1.0, shock: 0, shocks: 0 },
  [`PD${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0, shocks: 1 },
  [`NDD${units}`]: { ...N1, units, effect0: 0, shock: 1.0, shocks: 2 },
  [`PDD${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0, shocks: 2 },
  [`PEE${units}`]: { ...N1, units, effect0: -1.0, shock: 2.0, shocks: 2 },
  [`PB${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0, shocks: 1, best: true },
});
export const CELLS = { ...cellsFor(11), ...cellsFor(16) };

// rows (unit 0 treated), the indices of the shocked rows, their signs, and the best match's index.
export function twoShockPanel(cell, seed) {
  const rows = panel(cell, seed);
  const pre = synthFit(rows[0], rows.slice(1), cell.k);
  let bestRow = 1;
  pre.weights.forEach((w, j) => { if (w > pre.weights[bestRow - 1]) bestRow = j + 1; });
  const shocked = cell.best ? [bestRow] : [1, 2].slice(0, cell.shocks);
  const signs = shocked.map((_, q) => ((seed >>> (7 + q)) & 1 ? 1 : -1));
  for (let t = cell.k; t < rows[0].length; t++) {
    rows[0][t] += cell.effect0;
    shocked.forEach((i, q) => { rows[i][t] += signs[q] * cell.shock; });
  }
  return { rows, shocked, signs, bestRow, bestWeight: pre.weights[bestRow - 1] };
}

export function scorePanel(cell, seed) {
  const { rows, shocked, signs, bestRow, bestWeight } = twoShockPanel(cell, seed);
  const name = (i) => `d${i - 1}`;
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthControlTest(rows[0], donors, cell.k);
  const own = r.tests.floored.value;
  const above = (q) => q.floored >= own - 1e-12 * Math.abs(own);
  const byName = Object.fromEntries(r.placebos.map((q) => [q.name, q]));
  // with no shocked donor, units 1 and 2 stand in for them so excl1 and exclAll still drop one and two donors
  const drop = shocked.length ? shocked : [1];
  const without = (list) => Object.fromEntries(Object.entries(donors).filter(([s]) => !list.map(name).includes(s)));
  const x1 = synthControlTest(rows[0], without(drop.slice(0, 1)), cell.k);
  const xa = drop.length > 1 ? synthControlTest(rows[0], without(drop), cell.k) : x1;
  return {
    rank: r.rank, p: r.p, units: cell.units,
    rankRatio: r.tests.ratio.rank, effect: r.effectAverage, fitWarning: r.fitWarning,
    shockedAbove: shocked.filter((i) => above(byName[name(i)])).length,
    shockedWeight: shocked.reduce((s, i) => s + r.donorWeights[name(i)], 0),
    sameSign: signs.length === 2 ? signs[0] === signs[1] : null,
    bestRow, bestWeight,
    rankExcl1: x1.rank, effectExcl1: x1.effectAverage,
    rankExclAll: xa.rank, effectExclAll: xa.effectAverage,
  };
}

if (process.argv[1]?.endsWith('synth-two-shock-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 85000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const cname of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(cname);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: cname, rep, ...scorePanel(CELLS[cname], seedOf(base, ci, rep)) }));
  }
}
