// Simulation for the floored ratio (pre-registration eval/synth-floor-prereg-2026-11-17.md). Every panel is scored
// with all three placebo statistics of synth-control.mjs (ratio, floored, post) from the same fits. Cells N1-N5, E1 and
// P1-P4 are the last round's (eval/synth-sim.mjs); new here:
//   N6/P5  8 near-copy donor pairs (copy = original + N(0, 0.1) each point), no change / a step of -1
//   N7/P6  the treated unit's loadings at (1.45, 1.45), inside the donors' U(0.5, 1.5) square but near its corner,
//          no change / a step of -1
// Seeds are hashed (splitmix32 of base, cell and panel), as the last round asked: its consecutive xorshift seeds may
// have correlated neighbouring panels.
//   SC_SEED_BASE=21000 SC_SHARD=0/4 node eval/synth-floor-sim.mjs 100 > part0.json
import { synthControlTest } from '../synth-control.mjs';
import { panel, CELLS as OLD } from './synth-sim.mjs';

export const CELLS = {
  ...OLD,
  N6: { units: 39, k: 19, m: 12, idio: { sd: 0.5, rho: 0 }, copies: 8, copySd: 0.1 },
  P5: { units: 39, k: 19, m: 12, idio: { sd: 0.5, rho: 0 }, copies: 8, copySd: 0.1, effect: () => -1.0 },
  N7: { units: 39, k: 19, m: 12, idio: { sd: 0.5, rho: 0 }, lam0: [1.45, 1.45] },
  P6: { units: 39, k: 19, m: 12, idio: { sd: 0.5, rho: 0 }, lam0: [1.45, 1.45], effect: () => -1.0 },
};

export function seedOf(base, cellIndex, rep) {
  let x = (base * 0x9e3779b1 + cellIndex * 0x85ebca6b + rep * 0xc2b2ae35) >>> 0;
  x = (x + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0 || 1;
}

const reps = Number(process.argv[2] ?? 100);
const base = Number(process.env.SC_SEED_BASE ?? 21000);
const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
const names = Object.keys(CELLS);
const only = process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names;
for (const name of only) {
  const cell = CELLS[name], ci = names.indexOf(name);
  for (let r = 0; r < reps; r++) {
    if (r % sn !== si) continue;
    const rows = panel(cell, seedOf(base, ci, r));
    const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
    const res = synthControlTest(rows[0], donors, cell.k);
    const t = res.tests;
    console.log(JSON.stringify({ cell: name, rep: r, pRatio: t.ratio.p, pFloored: t.floored.p, pPost: t.post.p, effect: res.effectAverage, fitWarning: res.fitWarning, pre: res.preRmspe, floor: res.floor }));
  }
}
