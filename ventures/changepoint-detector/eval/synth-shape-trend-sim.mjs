// Simulation: the gap-shape word read against the panel's own trend (panelShapes, synth-control.mjs) beside the
// plain word (gapShape). README "A donor's own event that is not a step" ended: "a shape word read against the panel's
// own trend (detrended thirds) for long compounding series". On West Germany 1990, 12 of 16 placebos' gaps 'grew':
// gaps of series that wander or compound spread with time, so the plain word names nearly everyone.
// Pre-registration eval/synth-shape-trend-prereg-2026-11-18.md.
// Two families of panels, from eval/synth-donor-shape-sim.mjs's generator and shapes (one donor moved by a step, a
// slope or a pulse averaging `shock` over the 12 after-points; the treated unit drops by effect0):
//   trendless: N1's shape (idiosyncratic sd 0.5, no walk), the donor-shape cells at 11 and 16 units
//   wandering: idiosyncratic sd 0.3 plus a random walk with step sd `walk` (0.15 is the shipped N5/P3 cells'; 0.3
//              doubles it), so every unit's gap after the date spreads like a walk's, at 11 and 16 units
//   growing:   levels that compound, like GDP per head: 100 exp(L), L growing 2.5% a point plus a common AR(0.5)
//              growth factor (loading U(0.5, 1.5), 1% per sd) plus each unit's own growth deviation, AR(0.9) with
//              sd 0.005 (growthPanel below); the treated unit's level drops by 10% from the date, and the shocked
//              donor's level moves by sign x shock x 10% x shape(h). Calibrated in an exploratory run to give a
//              median panel whose median gap grows about 6-8 times in mean square (West Germany 1990: 21.8)
// For each panel: the shocked donor's plain and panel-relative word and whether it is listed at or above the treated
// unit; the clean units listed above, with how many get a word each way; every placebo's words; the treated rank.
//   SC_SEED_BASE=89000 SC_SHARD=0/4 node eval/synth-shape-trend-sim.mjs 100 > part0.json
import { synthControlTest } from '../synth-control.mjs';
import { shapeDonorPanel, SHAPES, CELLS as SHAPE_CELLS } from './synth-donor-shape-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  return { u, g: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
}
export function growthPanel(cell, seed) {
  const { g, u } = rng(seed), n = cell.k + cell.m;
  const F = [g()];
  for (let t = 1; t < n; t++) F.push(0.5 * F[t - 1] + g());
  const rows = [];
  for (let i = 0; i < cell.units; i++) {
    const lam = 0.5 + u();
    let L = 0.3 * g(), v = 0;
    const y = [];
    for (let t = 0; t < n; t++) { v = 0.9 * v + 0.005 * g(); L += 0.025 + 0.01 * lam * F[t] + v; y.push(100 * Math.exp(L)); }
    rows.push(y);
  }
  const row = 1, sign = (seed >>> 7) & 1 ? 1 : -1, f = SHAPES[cell.shape];
  for (let t = cell.k; t < n; t++) {
    rows[0][t] *= 1 + 0.1 * cell.effect0;
    rows[row][t] *= 1 + sign * 0.1 * cell.shock * f(t - cell.k);
  }
  return { rows, row };
}

const KEEP = ['P', 'PD', 'PS', 'PP', 'PSE', 'PPE', 'NS', 'NP', 'PB', 'PBP'];
const trendless = Object.fromEntries(Object.entries(SHAPE_CELLS).filter(([n]) => KEEP.includes(n.replace(/\d+$/, ''))));
const wander = (units, walk, tag) => {
  const base = { k: 19, m: 12, units, idio: { sd: 0.3, rho: 0, walk } };
  return {
    [`W${tag}${units}`]: { ...base, effect0: -1.0, shock: 0, shape: 'step' },
    [`W${tag}D${units}`]: { ...base, effect0: -1.0, shock: 1.0, shape: 'step' },
    [`W${tag}S${units}`]: { ...base, effect0: -1.0, shock: 1.0, shape: 'slope' },
    [`W${tag}P${units}`]: { ...base, effect0: -1.0, shock: 1.0, shape: 'pulse' },
    [`W${tag}SE${units}`]: { ...base, effect0: -1.0, shock: 2.0, shape: 'slope' },
    [`W${tag}PE${units}`]: { ...base, effect0: -1.0, shock: 2.0, shape: 'pulse' },
  };
};
const grow = (units) => {
  const base = { k: 19, m: 12, units, grow: true };
  return {
    [`G${units}`]: { ...base, effect0: -1.0, shock: 0, shape: 'step' },
    [`GD${units}`]: { ...base, effect0: -1.0, shock: 1.0, shape: 'step' },
    [`GS${units}`]: { ...base, effect0: -1.0, shock: 1.0, shape: 'slope' },
    [`GP${units}`]: { ...base, effect0: -1.0, shock: 1.0, shape: 'pulse' },
    [`GSE${units}`]: { ...base, effect0: -1.0, shock: 2.0, shape: 'slope' },
    [`GPE${units}`]: { ...base, effect0: -1.0, shock: 2.0, shape: 'pulse' },
  };
};
export const CELLS = { ...trendless, ...wander(11, 0.15, 'a'), ...wander(16, 0.15, 'a'), ...wander(11, 0.3, 'b'), ...wander(16, 0.3, 'b'), ...grow(11), ...grow(16) };

export function scorePanel(cell, seed) {
  const { rows, row } = cell.grow ? growthPanel(cell, seed) : shapeDonorPanel(cell, seed);
  const name = `d${row - 1}`;
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthControlTest(rows[0], donors, cell.k);
  const own = r.tests.floored.value, above = (z) => z.floored >= own - 1e-12 * Math.abs(own);
  const q = r.placebos.find((x) => x.name === name);
  const clean = r.placebos.filter((z) => z.name !== name && above(z));
  const count = (list, key) => list.reduce((c, z) => { c[z.gapShape[key]] += 1; return c; }, { held: 0, grew: 0, faded: 0 });
  return {
    rank: r.rank, units: cell.units, centre: r.shapeCentre, relative: r.shapeRelative,
    shocked: cell.shock > 0, shockedAbove: above(q), shockedShape: q.gapShape.shape, shockedRel: q.gapShape.relShape,
    cleanAbove: clean.length, cleanAboveShaped: clean.filter((z) => z.gapShape.shape !== 'held').length, cleanAboveRel: clean.filter((z) => z.gapShape.relShape !== 'held').length,
    allPlain: count(r.placebos, 'shape'), allRel: count(r.placebos, 'relShape'),
  };
}

if (process.argv[1]?.endsWith('synth-shape-trend-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 89000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const cname of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(cname);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: cname, rep, ...scorePanel(CELLS[cname], seedOf(base, ci, rep)) }));
  }
}
