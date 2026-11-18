// Simulation: when a covariate's shock after the date is not a step, does the placebo warning (covariateBalance's
// placeboWarning, placeboShare >= 0.8) still hold the false finds? (README "Two covariates", Next: "covariates with
// shocks that are not steps (a slope from the date)"; pre-registration eval/synth-shape-prereg-2026-11-18.md.)
// Panels as eval/synth-two-cov-sim.mjs (the shipped generator, cell N1: 39 units, 19 points before, 12 after). Each
// unit gets Z, which moves every unit by beta * Z * shape(h) at h = 0..11 points after the date, and W, which moves
// nothing (independent of Z). Each shape is scaled so its average over the 12 points after the date is 1, so beta
// is the average shift per unit of Z, as in the step rounds:
//   slope  shape(h) = (h + 1) / 6.5        a trend from the date: 0.15 at the first point, 1.85 at the last
//   pulse  shape(h) = 3 for h < 4, else 0  a shock that fades: three times the step for four points, then nothing
// The treated unit has no effect of its own, so any gap after the date is bias. Outcome-only fit, floored ratio
// (shipped defaults), then covariateBalance on [Z, W]. Cells:
//   S0  beta 0           (base rates: the shape does nothing)
//   S1  slope, beta 0.5
//   S2  slope, beta 1.0
//   P1  pulse, beta 0.5
//   P2  pulse, beta 1.0
//   SC_SEED_BASE=61000 SC_SHARD=0/4 node eval/synth-shape-sim.mjs 50 > part0.json
import { synthControlTest, covariateBalance } from '../synth-control.mjs';
import { panel, CELLS as OLD } from './synth-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

const N1 = OLD.N1;
export const SHAPES = {
  slope: (h) => (h + 1) / 6.5,
  pulse: (h) => (h < 4 ? 3 : 0),
};
export const CELLS = {
  S0: { ...N1, beta: 0, shape: 'slope' },
  S1: { ...N1, beta: 0.5, shape: 'slope' },
  S2: { ...N1, beta: 1.0, shape: 'slope' },
  P1: { ...N1, beta: 0.5, shape: 'pulse' },
  P2: { ...N1, beta: 1.0, shape: 'pulse' },
};

function gauss(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

// The panel with Z and W attached: rows (unit 0 treated), z and w (one value per unit).
export function shapePanel(cell, seed) {
  const rows = panel(cell, seed);
  const g = gauss(seed ^ 0x3c6ef372);
  const z = rows.map(() => g()), w = rows.map(() => g());
  const f = SHAPES[cell.shape];
  for (let i = 0; i < rows.length; i++) for (let t = cell.k; t < rows[i].length; t++) rows[i][t] += cell.beta * z[i] * f(t - cell.k);
  return { rows, z, w };
}

export function scorePanel(cell, seed) {
  const { rows, z, w } = shapePanel(cell, seed);
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthControlTest(rows[0], donors, cell.k);
  const [bz, bw] = covariateBalance(r, { treated: [z[0], w[0]], donors: Object.fromEntries(rows.slice(1).map((_, j) => [`d${j}`, [z[j + 1], w[j + 1]]])) }, { names: ['Z', 'W'] });
  return { p: r.tests.floored.p, bias: r.effectAverage, biasEnd: r.effectAtEnd, zShare: bz.placeboShare, wShare: bw.placeboShare, zWarn: bz.placeboWarning, wWarn: bw.placeboWarning, zStd: bz.stdGap, wStd: bw.stdGap };
}

if (process.argv[1]?.endsWith('synth-shape-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 61000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const name of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(name);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: name, rep, ...scorePanel(CELLS[name], seedOf(base, ci, rep)) }));
  }
}
