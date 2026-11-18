// Simulation: the few-donor placebo test when a donor's own after-date event is a slope or a pulse rather than a step.
// README "Two shocked donors, and a shocked best match" ended: "Next: ... a donor with a slope or pulse rather than a
// step." Pre-registration eval/synth-donor-shape-prereg-2026-11-18.md.
// Panels from the shipped generator (eval/synth-sim.mjs, N1's shape: two AR(1) factors, idiosyncratic sd 0.5, 19 points
// before and 12 after) with 11 or 16 units. Unit 0 is treated (drops by `effect0` from the date). One donor is moved
// by sign * shock * shape(h) at h = 0..11 points after the date, with the shapes of eval/synth-shape-sim.mjs, each
// averaging 1 over the 12 points so `shock` is the average move, as for a step:
//   step   1
//   slope  (h + 1) / 6.5        0.15 at the first point, 1.85 at the last
//   pulse  3 for h < 4, else 0  three times the step for four points, then nothing
// The shocked donor is unit 1, or (best: true) the donor with the largest weight in the treated fit (weights from the
// before-period only, found before the shock is added). Shipped defaults (outcome-only fit, floored ratio); each panel
// is also refitted with the shocked donor left out of the pool beforehand (excl). The shocked donor's own placebo gap
// is described by gapShape (synth-control.mjs: 'faded', 'grew' or 'held'), as are the clean units listed above.
//   SC_SEED_BASE=87000 SC_SHARD=0/4 node eval/synth-donor-shape-sim.mjs 100 > part0.json
import { synthControlTest, synthFit } from '../synth-control.mjs';
import { panel, CELLS as OLD } from './synth-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

export const SHAPES = {
  step: () => 1,
  slope: (h) => (h + 1) / 6.5,
  pulse: (h) => (h < 4 ? 3 : 0),
};
const N1 = OLD.N1;
const cellsFor = (units) => ({
  [`P${units}`]: { ...N1, units, effect0: -1.0, shock: 0, shape: 'step' },
  [`PD${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0, shape: 'step' },
  [`PS${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0, shape: 'slope' },
  [`PP${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0, shape: 'pulse' },
  [`PSE${units}`]: { ...N1, units, effect0: -1.0, shock: 2.0, shape: 'slope' },
  [`PPE${units}`]: { ...N1, units, effect0: -1.0, shock: 2.0, shape: 'pulse' },
  [`NS${units}`]: { ...N1, units, effect0: 0, shock: 1.0, shape: 'slope' },
  [`NP${units}`]: { ...N1, units, effect0: 0, shock: 1.0, shape: 'pulse' },
  [`PB${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0, shape: 'step', best: true },
  [`PBS${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0, shape: 'slope', best: true },
  [`PBP${units}`]: { ...N1, units, effect0: -1.0, shock: 1.0, shape: 'pulse', best: true },
});
export const CELLS = { ...cellsFor(11), ...cellsFor(16) };

// rows (unit 0 treated), the shocked row's index, its sign, and its weight in the before-period fit.
export function shapeDonorPanel(cell, seed) {
  const rows = panel(cell, seed);
  const pre = synthFit(rows[0], rows.slice(1), cell.k);
  let bestRow = 1;
  pre.weights.forEach((w, j) => { if (w > pre.weights[bestRow - 1]) bestRow = j + 1; });
  const row = cell.best ? bestRow : 1, sign = (seed >>> 7) & 1 ? 1 : -1, f = SHAPES[cell.shape];
  for (let t = cell.k; t < rows[0].length; t++) {
    rows[0][t] += cell.effect0;
    rows[row][t] += sign * cell.shock * f(t - cell.k);
  }
  return { rows, row, sign, preWeight: pre.weights[row - 1] };
}

export function scorePanel(cell, seed) {
  const { rows, row, sign, preWeight } = shapeDonorPanel(cell, seed);
  const name = `d${row - 1}`;
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthControlTest(rows[0], donors, cell.k);
  const own = r.tests.floored.value;
  const q = r.placebos.find((x) => x.name === name);
  const x = synthControlTest(rows[0], Object.fromEntries(Object.entries(donors).filter(([s]) => s !== name)), cell.k);
  return {
    rank: r.rank, p: r.p, units: cell.units, rankRatio: r.tests.ratio.rank,
    effect: r.effectAverage, effectEnd: r.effectAtEnd, fitWarning: r.fitWarning,
    shockedAbove: q.floored >= own - 1e-12 * Math.abs(own), shockedShape: q.gapShape.shape,
    // the other units listed at or above the treated one, and how many of them gapShape calls 'faded' or 'grew'
    cleanAbove: r.placebos.filter((z) => z.name !== name && z.floored >= own - 1e-12 * Math.abs(own)).length,
    cleanAboveShaped: r.placebos.filter((z) => z.name !== name && z.floored >= own - 1e-12 * Math.abs(own) && z.gapShape.shape !== 'held').length,
    // late over early RMS of each gap, for reading GAP_SHAPE_RATIO off the exploratory run
    shockedLR: q.gapShape.late / q.gapShape.early,
    cleanAboveLR: r.placebos.filter((z) => z.name !== name && z.floored >= own - 1e-12 * Math.abs(own)).map((z) => z.gapShape.late / z.gapShape.early),
    shockedWeight: r.donorWeights[name], preWeight, sign,
    rankExcl: x.rank, effectExcl: x.effectAverage, effectEndExcl: x.effectAtEnd,
  };
}

if (process.argv[1]?.endsWith('synth-donor-shape-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 87000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const cname of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(cname);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: cname, rep, ...scorePanel(CELLS[cname], seedOf(base, ci, rep)) }));
  }
}
