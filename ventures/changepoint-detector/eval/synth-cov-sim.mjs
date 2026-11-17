// Simulation for the synthetic control matched on covariates (pre-registration eval/synth-cov-prereg-2026-11-17.md).
// Panels are the floored-ratio round's (eval/synth-floor-sim.mjs, same cells and generator). Each unit gets two
// covariates, its two factor loadings measured with noise (lambda + N(0, SC_COV_SD), default 0.15, drawn from a
// second hashed stream so the panels are unchanged), and three outcome lags as the paper's (1975, 1980, 1988 in a
// 1970-1988 before-period: points k-14, k-9, k-1; k-9, k-5, k-1 when k < 15). Every panel is tested twice from the
// same series: matched on the predictors (covariates) and on every before-date outcome (outcome, the shipped fit),
// both scored with the floored ratio (and the paper's ratio, reported).
//   SC_SEED_BASE=31000 SC_SHARD=0/4 node eval/synth-cov-sim.mjs 100 > part0.json
import { synthControlTest } from '../synth-control.mjs';
import { panel } from './synth-sim.mjs';
import { CELLS, seedOf } from './synth-floor-sim.mjs';

function gauss(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
export const lagsFor = (k) => (k >= 15 ? [k - 14, k - 9, k - 1] : [k - 9, k - 5, k - 1]);
export function predictorsOf(rows, k, seed, covSd = 0.15) {
  const g = gauss(seed ^ 0x5bd1e995);
  const lags = lagsFor(k);
  return rows.map((y, i) => [...rows.lam[i].map((l) => l + covSd * g()), ...lags.map((t) => y[t])]);
}

const reps = Number(process.argv[2] ?? 100);
const base = Number(process.env.SC_SEED_BASE ?? 31000);
const covSd = Number(process.env.SC_COV_SD ?? 0.15);
const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
const names = Object.keys(CELLS);
const only = process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names;
if (process.argv[1]?.endsWith('synth-cov-sim.mjs')) for (const name of only) {
  const cell = CELLS[name], ci = names.indexOf(name);
  for (let r = 0; r < reps; r++) {
    if (r % sn !== si) continue;
    const seed = seedOf(base, ci, r);
    const rows = panel(cell, seed);
    const px = predictorsOf(rows, cell.k, seed, covSd);
    const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
    const predictors = { treated: px[0], donors: Object.fromEntries(px.slice(1).map((a, j) => [`d${j}`, a])) };
    const c = synthControlTest(rows[0], donors, cell.k, { predictors });
    const o = synthControlTest(rows[0], donors, cell.k);
    console.log(JSON.stringify({ cell: name, rep: r, pCov: c.tests.floored.p, pCovRatio: c.tests.ratio.p, pOut: o.tests.floored.p, pOutRatio: o.tests.ratio.p, effCov: c.effectAverage, effOut: o.effectAverage, preCov: c.preRmspe, preOut: o.preRmspe, warnCov: c.fitWarning, warnOut: o.fitWarning }));
  }
}
