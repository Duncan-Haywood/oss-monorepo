// Simulation for the multi-start V search (pre-registration eval/synth-multi-prereg-2026-11-17.md). Panels, cells and
// predictors are the covariate round's (eval/synth-cov-sim.mjs). Every panel is tested three times from the same
// series and predictors: covariates with the multi-start V search (multi), covariates with one start (single, the
// last round's method) and every before-date outcome (outcome, the shipped default), all scored with the floored
// ratio (the paper's ratio reported).
//   SC_SEED_BASE=41000 SC_SHARD=0/4 node eval/synth-multi-sim.mjs 30 > part0.json
import { synthControlTest } from '../synth-control.mjs';
import { panel } from './synth-sim.mjs';
import { CELLS, seedOf } from './synth-floor-sim.mjs';
import { predictorsOf } from './synth-cov-sim.mjs';

const reps = Number(process.argv[2] ?? 30);
const base = Number(process.env.SC_SEED_BASE ?? 41000);
const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
const names = Object.keys(CELLS);
const only = process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names;
for (const name of only) {
  const cell = CELLS[name], ci = names.indexOf(name);
  for (let r = 0; r < reps; r++) {
    if (r % sn !== si) continue;
    const seed = seedOf(base, ci, r);
    const rows = panel(cell, seed);
    const px = predictorsOf(rows, cell.k, seed);
    const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
    const predictors = { treated: px[0], donors: Object.fromEntries(px.slice(1).map((a, j) => [`d${j}`, a])) };
    const m = synthControlTest(rows[0], donors, cell.k, { predictors, vSearch: 'multi' });
    const s = synthControlTest(rows[0], donors, cell.k, { predictors });
    const o = synthControlTest(rows[0], donors, cell.k);
    const pick = (x) => ({ p: x.tests.floored.p, pr: x.tests.ratio.p, eff: x.effectAverage, pre: x.preRmspe, warn: x.fitWarning, floor: x.floor });
    console.log(JSON.stringify({ cell: name, rep: r, multi: pick(m), single: pick(s), outcome: pick(o) }));
  }
}
