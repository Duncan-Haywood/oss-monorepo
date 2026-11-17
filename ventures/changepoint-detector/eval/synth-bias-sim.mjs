// Simulation: does covariate imbalance pick out the synthetic-control panels whose gap is biased?
// (README "Covariate balance": "a simulation where a covariate drives the outcome after the date would" say whether
// the 0.25 flag predicts a biased gap; pre-registration eval/synth-bias-prereg-2026-11-17.md.)
// Panels are the shipped generator's (eval/synth-sim.mjs, cell N1: 39 units, 19 points before, 12 after, idio sd 0.5).
// Each unit also gets one covariate Z_i (think income), drawn from its own hashed stream so the panels are unchanged.
// Before the date Z does nothing; from the date on every unit, treated and donors alike, moves by beta * Z_i (a common
// shock that hits units in proportion to Z: "income moves sales differently after the date"). The treated unit has no
// effect of its own, so any gap after the date is bias, and the part of it Z explains is exactly
// beta * (Z_0 - sum_j w_j Z_j) = beta * sd(Z) * stdGap.
// Each panel is fitted on the outcome alone (the shipped default), tested with the floored ratio, and scored with
// covariateBalance on Z. Cells:
//   B0  beta 0      Z ~ N(0,1), independent of the loadings (the flag's base rate when Z does nothing)
//   B1  beta 0.5    Z ~ N(0,1), independent
//   B2  beta 1.0    Z ~ N(0,1), independent
//   B3  beta 0.5    the treated unit's Z fixed at 1.8 (richer than ~96% of donors: California's position)
//   B4  beta 0.5    Z = 0.8 * (standardised lambda_1 + lambda_2) + 0.6 * N(0,1): partly what the outcome fit matches
//   B5  beta 0.5    as B3 with a true step of -1 on the treated unit (power under an imbalance)
//   B6  beta 0      as B5 with Z doing nothing (power with no covariate shock, B5's comparison; its own seeds)
//   SC_SEED_BASE=41000 SC_SHARD=0/4 node eval/synth-bias-sim.mjs 50 > part0.json
import { synthControlTest, covariateBalance } from '../synth-control.mjs';
import { panel, CELLS as OLD } from './synth-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

const N1 = OLD.N1;
export const CELLS = {
  B0: { ...N1, beta: 0 },
  B1: { ...N1, beta: 0.5 },
  B2: { ...N1, beta: 1.0 },
  B3: { ...N1, beta: 0.5, z0: 1.8 },
  B4: { ...N1, beta: 0.5, zLoad: 0.8 },
  B5: { ...N1, beta: 0.5, z0: 1.8, effect: () => -1.0 },
  B6: { ...N1, beta: 0, z0: 1.8, effect: () => -1.0 },
};

function gauss(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

// The panel with Z attached: rows (unit 0 treated), z (one value per unit).
export function biasPanel(cell, seed) {
  const rows = panel(cell, seed);
  const g = gauss(seed ^ 0x27d4eb2f);
  // loadings are U(0.5, 1.5) each, so lambda_1 + lambda_2 has mean 2 and sd sqrt(2/12)
  const z = rows.lam.map((l) => (cell.zLoad ? cell.zLoad * (l[0] + l[1] - 2) / Math.sqrt(2 / 12) + 0.6 * g() : g()));
  if (cell.z0 != null) z[0] = cell.z0;
  for (let i = 0; i < rows.length; i++) for (let t = cell.k; t < rows[i].length; t++) rows[i][t] += cell.beta * z[i];
  return { rows, z };
}

export function scorePanel(cell, seed) {
  const { rows, z } = biasPanel(cell, seed);
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthControlTest(rows[0], donors, cell.k);
  const [b] = covariateBalance(r, { treated: [z[0]], donors: Object.fromEntries(z.slice(1).map((v, j) => [`d${j}`, [v]])) }, { names: ['Z'] });
  const truth = cell.effect ? cell.effect(0, cell.m) : 0;
  return { p: r.tests.floored.p, effect: r.effectAverage, bias: r.effectAverage - truth, zPart: cell.beta * (b.treated - b.synthetic), stdGap: b.stdGap, placeboShare: b.placeboShare, fitWarning: r.fitWarning };
}

if (process.argv[1]?.endsWith('synth-bias-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 41000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  const only = process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names;
  for (const name of only) {
    const ci = names.indexOf(name);
    for (let rep = 0; rep < reps; rep++) {
      if (rep % sn !== si) continue;
      console.log(JSON.stringify({ cell: name, rep, ...scorePanel(CELLS[name], seedOf(base, ci, rep)) }));
    }
  }
}
