// Simulation: the panel-relative shape word (panelShapes, synth-control.mjs) scored only on the panels where it
// switches on, to decide whether `--shape-word panel` becomes the default. README "The shape word against the panel's
// own trend" failed its bar 1 by 0.4 points on a line pooled over every wandering panel, although the two words are the
// same on every panel where the rule stays off (1-3% of wandering panels switched); "The panel word as an option"
// shipped it opt-in and named this re-test. Pre-registration eval/synth-shape-switch-prereg-2026-11-18.md.
// Panels: every cell of eval/synth-shape-trend-sim.mjs (trendless, wandering, growing with AR(0.9) deviations) plus two
// fresh growing generators the earlier run did not have, so the result is not one persistence's: growth deviations
// AR(0.7) with sd 0.01 (cells H*) and AR(0.97) with sd 0.0025 (cells K*), each at 11 and 16 units.
// For each panel it records whether the rule switched on and, on every placebo, both words, split into the shocked
// donor and the clean units (all of them, and those listed at or above the treated unit), so the merge can score
// discrimination: how much more often the shocked donor gets its shape's word than a clean unit does.
//   SC_SEED_BASE=93000 SC_SHARD=0/4 node eval/synth-shape-switch-sim.mjs 400 > part0.json
import { synthControlTest } from '../synth-control.mjs';
import { shapeDonorPanel, SHAPES } from './synth-donor-shape-sim.mjs';
import { CELLS as TREND_CELLS, growthPanel } from './synth-shape-trend-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  return { u, g: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
}
// growthPanel with the deviation's persistence and sd as parameters (growthPanel itself is AR(0.9), sd 0.005)
export function growthPanelAR(cell, seed) {
  const { g, u } = rng(seed), n = cell.k + cell.m;
  const F = [g()];
  for (let t = 1; t < n; t++) F.push(0.5 * F[t - 1] + g());
  const rows = [];
  for (let i = 0; i < cell.units; i++) {
    const lam = 0.5 + u();
    let L = 0.3 * g(), v = 0;
    const y = [];
    for (let t = 0; t < n; t++) { v = cell.rho * v + cell.sd * g(); L += 0.025 + 0.01 * lam * F[t] + v; y.push(100 * Math.exp(L)); }
    rows.push(y);
  }
  const row = 1, sign = (seed >>> 7) & 1 ? 1 : -1, f = SHAPES[cell.shape];
  for (let t = cell.k; t < n; t++) {
    rows[0][t] *= 1 + 0.1 * cell.effect0;
    rows[row][t] *= 1 + sign * 0.1 * cell.shock * f(t - cell.k);
  }
  return { rows, row };
}
const grow2 = (units, tag, rho, sd) => {
  const base = { k: 19, m: 12, units, growAR: true, rho, sd };
  return {
    [`${tag}${units}`]: { ...base, effect0: -1.0, shock: 0, shape: 'step' },
    [`${tag}D${units}`]: { ...base, effect0: -1.0, shock: 1.0, shape: 'step' },
    [`${tag}S${units}`]: { ...base, effect0: -1.0, shock: 1.0, shape: 'slope' },
    [`${tag}P${units}`]: { ...base, effect0: -1.0, shock: 1.0, shape: 'pulse' },
    [`${tag}SE${units}`]: { ...base, effect0: -1.0, shock: 2.0, shape: 'slope' },
    [`${tag}PE${units}`]: { ...base, effect0: -1.0, shock: 2.0, shape: 'pulse' },
  };
};
export const CELLS = { ...TREND_CELLS, ...grow2(11, 'H', 0.7, 0.01), ...grow2(16, 'H', 0.7, 0.01), ...grow2(11, 'K', 0.97, 0.0025), ...grow2(16, 'K', 0.97, 0.0025) };
export const family = (cell) => (/^W[ab]/.test(cell) ? 'wander' : /^G/.test(cell) ? 'growing' : /^H/.test(cell) ? 'growing-ar0.7' : /^K/.test(cell) ? 'growing-ar0.97' : 'trendless');

const words = () => ({ held: 0, grew: 0, faded: 0 });
export function scorePanel(cell, seed) {
  const { rows, row } = cell.growAR ? growthPanelAR(cell, seed) : cell.grow ? growthPanel(cell, seed) : shapeDonorPanel(cell, seed);
  const name = `d${row - 1}`;
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthControlTest(rows[0], donors, cell.k);
  const own = r.tests.floored.value, above = (z) => z.floored >= own - 1e-12 * Math.abs(own);
  const q = r.placebos.find((x) => x.name === name);
  const clean = r.placebos.filter((z) => z.name !== name);
  const tally = (list) => {
    const c = { plain: words(), panel: words() };
    for (const z of list) { c.plain[z.gapShape.shape] += 1; c.panel[z.gapShape.relShape] += 1; }
    return c;
  };
  return {
    units: cell.units, rank: r.rank, centre: r.shapeCentre, relative: r.shapeRelative,
    shape: cell.shock > 0 ? cell.shape : null, shock: cell.shock,
    shocked: cell.shock > 0 ? { above: above(q), plain: q.gapShape.shape, panel: q.gapShape.relShape } : null,
    clean: tally(clean), cleanAbove: tally(clean.filter(above)),
  };
}

if (process.argv[1]?.endsWith('synth-shape-switch-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 93000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const cname of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(cname);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: cname, rep, ...scorePanel(CELLS[cname], seedOf(base, ci, rep)) }));
  }
}
