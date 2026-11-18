// Simulation: a curvature word for a gap after the date (gapBend, synth-control.mjs), so a donor's own linear slope
// can be told from a compounding gap. README "The panel word scored where it switches on" found the panel word hides a
// donor's slope (a big slope called 'held' 90% of the time on switched growing panels) and the plain word words two
// thirds of clean units there; its Limits: "a slope and a compounding gap differ in curvature". This runs the same 80
// cells (eval/synth-shape-switch-sim.mjs) and records, on every placebo, the plain word, the panel word and the bend.
// Pre-registration eval/synth-shape-curve-prereg-2026-11-18.md.
//   SC_SEED_BASE=97000 SC_SHARD=0/4 node eval/synth-shape-curve-sim.mjs 400 > part0.json
import { synthControlTest } from '../synth-control.mjs';
import { shapeDonorPanel } from './synth-donor-shape-sim.mjs';
import { growthPanel } from './synth-shape-trend-sim.mjs';
import { CELLS, growthPanelAR } from './synth-shape-switch-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

export { CELLS };
const r3 = (v) => (v === null ? null : Math.round(v * 1000) / 1000);
export function scorePanel(cell, seed) {
  const { rows, row } = cell.growAR ? growthPanelAR(cell, seed) : cell.grow ? growthPanel(cell, seed) : shapeDonorPanel(cell, seed);
  const name = `d${row - 1}`;
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthControlTest(rows[0], donors, cell.k);
  const own = r.tests.floored.value, above = (z) => z.floored >= own - 1e-12 * Math.abs(own);
  const unit = (z) => [z.gapShape.shape[0], z.gapShape.relShape[0], r3(z.gapShape.bend), above(z) ? 1 : 0];
  const q = r.placebos.find((x) => x.name === name);
  return {
    units: cell.units, relative: r.shapeRelative, centre: r3(r.shapeCentre), shape: cell.shock > 0 ? cell.shape : null, shock: cell.shock,
    // each unit: [plain word initial, panel word initial, bend, listed at or above the treated unit]
    shocked: cell.shock > 0 ? unit(q) : null,
    clean: r.placebos.filter((z) => z.name !== name).map(unit),
  };
}

if (process.argv[1]?.endsWith('synth-shape-curve-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 97000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const cname of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(cname);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: cname, rep, ...scorePanel(CELLS[cname], seedOf(base, ci, rep)) }));
  }
}
