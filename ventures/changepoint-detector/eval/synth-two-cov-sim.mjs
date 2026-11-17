// Simulation: with two covariates, one that moves the outcome after the date and one that does not, does the placebo
// warning (covariateBalance's placeboWarning, placeboShare >= 0.8) name the one that matters?
// (README "Which imbalance biases the gap", Next: "a two-covariate cell (one that matters, one that does not) to check
// the warning names the right one"; pre-registration eval/synth-two-cov-prereg-2026-11-17.md.)
// Panels as eval/synth-bias-sim.mjs (the shipped generator, cell N1: 39 units, 19 points before, 12 after). Each unit
// gets Z (moves every unit by beta * Z from the date on) and W (moves nothing). The treated unit has no effect of its
// own, so any gap after the date is bias. Fitted on the outcome alone, floored ratio, then covariateBalance on [Z, W].
//   C1  beta 0.5, Z and W independent N(0,1)
//   C2  beta 0.5, corr(Z, W) = 0.7 (real covariates come correlated: income and price)
//   C3  beta 1.0, Z and W independent (a stronger shock)
//   SC_SEED_BASE=51000 SC_SHARD=0/4 node eval/synth-two-cov-sim.mjs 50 > part0.json
import { synthControlTest, covariateBalance } from '../synth-control.mjs';
import { panel, CELLS as OLD } from './synth-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

const N1 = OLD.N1;
export const CELLS = {
  C1: { ...N1, beta: 0.5, rho: 0 },
  C2: { ...N1, beta: 0.5, rho: 0.7 },
  C3: { ...N1, beta: 1.0, rho: 0 },
};

function gauss(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

export function scorePanel(cell, seed) {
  const rows = panel(cell, seed);
  const g = gauss(seed ^ 0x165667b1);
  const z = rows.map(() => g());
  const w = z.map((v) => cell.rho * v + Math.sqrt(1 - cell.rho ** 2) * g());
  for (let i = 0; i < rows.length; i++) for (let t = cell.k; t < rows[i].length; t++) rows[i][t] += cell.beta * z[i];
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthControlTest(rows[0], donors, cell.k);
  const [bz, bw] = covariateBalance(r, { treated: [z[0], w[0]], donors: Object.fromEntries(rows.slice(1).map((_, j) => [`d${j}`, [z[j + 1], w[j + 1]]])) }, { names: ['Z', 'W'] });
  return { p: r.tests.floored.p, bias: r.effectAverage, zShare: bz.placeboShare, wShare: bw.placeboShare, zWarn: bz.placeboWarning, wWarn: bw.placeboWarning, zStd: bz.stdGap, wStd: bw.stdGap };
}

if (process.argv[1]?.endsWith('synth-two-cov-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 51000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const name of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(name);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: name, rep, ...scorePanel(CELLS[name], seedOf(base, ci, rep)) }));
  }
}
