// Writes haul instances (cell centres and bank net volumes) and this engine's
// least haul as JSON for haul_differential.py to re-solve with SciPy's HiGHS.
import { makeSurface, parsePoints, exampleCsv, EXAMPLE_BOUNDARY, parseBoundary, designPlane, computeVolumes, balanceElevation } from '../earthwork.mjs';
import { haulPlan } from '../haul.mjs';

const ex = makeSurface(parsePoints(exampleCsv()).points);
const bnd = parseBoundary(EXAMPLE_BOUNDARY).vertices;
const mound = [];
for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) { const x = i * 10, y = j * 10, r = Math.hypot(x - 100, y - 100); mound.push({ x, y, z: 100 + 3 * Math.exp(-((r / 40) ** 2)) }); }
const ms = makeSurface(mound);
const flat = { elevation: 0, x0: 612500, y0: 2087200 };
const bal = balanceElevation(ex, flat, { boundary: bnd, shrink: 15 });
const mb = balanceElevation(ms, { elevation: 0, x0: 100, y0: 100 }, {});
const cases = [
  { name: 'example, balanced pad, 15% shrink, 10 ft cells', s: ex, d: designPlane({ ...flat, elevation: bal }), o: { boundary: bnd, shrink: 15, cell: 10 } },
  { name: 'example, 1% sloped pad at 107, 7.5 ft cells', s: ex, d: designPlane({ ...flat, elevation: 107, slopeX: 1 }), o: { boundary: bnd, shrink: 15, cell: 7.5 } },
  { name: 'example, pad at 104 (export)', s: ex, d: designPlane({ ...flat, elevation: 104 }), o: { boundary: bnd, cell: 10 } },
  { name: 'example, pad at 112 (import)', s: ex, d: designPlane({ ...flat, elevation: 112 }), o: { boundary: bnd, cell: 10 } },
  { name: 'example, no boundary, 900-cell cap', s: ex, d: designPlane({ ...flat, elevation: 108, slopeX: 0.5 }), o: { cell: 1 } },
  { name: 'mound, balanced, 10 ft cells', s: ms, d: designPlane({ elevation: mb, x0: 100, y0: 100 }), o: { cell: 10 } },
];
const out = [];
for (const c of cases) {
  const h = haulPlan(c.s, c.d, { ...c.o, perVolume: 27 });
  out.push({ name: c.name, cells: h.cells.map(k => [k.x, k.y, k.net]), moment: h.moment, moved: h.moved, optimal: h.optimal, pivots: h.pivots, ms: h.ms, n: h.cells.length });
}
process.stdout.write(JSON.stringify(out));
