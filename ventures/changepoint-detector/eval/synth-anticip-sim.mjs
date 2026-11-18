// Simulation: a shock that starts before the date (anticipation). README "Shocks that are not steps", Next: "a shock
// that starts before the date (anticipation)"; pre-registration eval/synth-anticip-prereg-2026-11-18.md.
// Panels from the shipped generator, cell N1 (39 units, 19 points before, 12 after; eval/synth-sim.mjs). Each unit
// gets Z and W (independent, W moves nothing). Two kinds of early shock:
//   covariate  every unit moves by beta * Z from L points before the stated date on (a step at k - L); no true effect,
//              so every gap is bias. Question: does placeboWarning on Z still hold the false finds when part of the
//              shock is already in the fitting window?
//   effect     the treated unit alone drops by `drop` from L points before the stated date (a true effect that the
//              people affected saw coming). Question: how much power does the stated date lose, and does backdating
//              the date by L (Abadie 2021's advice) win it back?
// Each panel is scored at the stated date k and backdated to k - 2 and k - 4 (outcome-only fit, floored ratio,
// shipped defaults; covariateBalance on [Z, W] with the shipped warning). Cells:
//   A0  nothing (base rates at every date)
//   A2  covariate, beta 1.0, L 2        A4  covariate, beta 1.0, L 4
//   E0  effect -1 at the date (L 0)     E2  effect -1, L 2        E4  effect -1, L 4
//   SC_SEED_BASE=71000 SC_SHARD=0/4 node eval/synth-anticip-sim.mjs 50 > part0.json
import { synthControlTest, covariateBalance } from '../synth-control.mjs';
import { panel, CELLS as OLD } from './synth-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

const N1 = OLD.N1;
export const CELLS = {
  A0: { ...N1, beta: 0, drop: 0, lead: 0 },
  A2: { ...N1, beta: 1.0, drop: 0, lead: 2 },
  A4: { ...N1, beta: 1.0, drop: 0, lead: 4 },
  E0: { ...N1, beta: 0, drop: -1, lead: 0 },
  E2: { ...N1, beta: 0, drop: -1, lead: 2 },
  E4: { ...N1, beta: 0, drop: -1, lead: 4 },
};
export const BACKDATES = [0, 2, 4];

function gauss(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

// rows (unit 0 treated), z and w: the shock (covariate or effect) starts at k - lead.
export function anticipPanel(cell, seed) {
  const rows = panel(cell, seed);
  const g = gauss(seed ^ 0x3c6ef372);
  const z = rows.map(() => g()), w = rows.map(() => g());
  const t0 = cell.k - cell.lead;
  for (let i = 0; i < rows.length; i++) for (let t = t0; t < rows[i].length; t++) {
    rows[i][t] += cell.beta * z[i] + (i === 0 ? cell.drop : 0);
  }
  return { rows, z, w };
}

export function scorePanel(cell, seed) {
  const { rows, z, w } = anticipPanel(cell, seed);
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const cov = { treated: [z[0], w[0]], donors: Object.fromEntries(rows.slice(1).map((_, j) => [`d${j}`, [z[j + 1], w[j + 1]]])) };
  const out = {};
  for (const b of BACKDATES) {
    const r = synthControlTest(rows[0], donors, cell.k - b);
    const [bz, bw] = covariateBalance(r, cov, { names: ['Z', 'W'] });
    // the gap averaged over the stated date's 12 points only, so the dates are compared on the same window
    const tail = r.gap.slice(cell.k), gapStated = tail.reduce((s, v) => s + v, 0) / tail.length;
    out[`b${b}`] = { p: r.tests.floored.p, bias: r.effectAverage, gapStated, pre: r.preRmspe, zWarn: bz.placeboWarning, wWarn: bw.placeboWarning, zShare: bz.placeboShare };
  }
  return out;
}

if (process.argv[1]?.endsWith('synth-anticip-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 71000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const name of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(name);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: name, rep, ...scorePanel(CELLS[name], seedOf(base, ci, rep)) }));
  }
}
