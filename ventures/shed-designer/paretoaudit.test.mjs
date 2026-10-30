// The starting designs stay good ones as prices and framing rules change:
// each preset under 100 sq ft must be within a few percent of the cheapest
// look-alike that stores as much (paretoaudit.mjs). AUDIT_FULL=1 runs the
// brute-force grid and random restarts as well (a few minutes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, buildShed } from './model.mjs';
import { storageOf, neighbourGap, audit, paretoFront, gridPoints, refitOpenings, looksLike, evaluate } from './paretoaudit.mjs';

// The largest share of its cost a starting design may leave on the table.
// The 8x12 default sits at about 2.4% (2x4 rafters and floor joists would
// pass every check); tighten this once the right-sizing lane lands.
const MAX_GAP = 0.03;

const under100 = Object.entries(PRESETS).filter(([, f]) => { const d = f(); return (d.length * d.width) / 144 <= 100; });

test('storage of the default 8x12 worked by hand', () => {
  const shed = buildShed(PRESETS['8x12']());
  const s = storageOf(shed);
  // 144 x 96 outside, 3-1/2" studs: 137 x 89 inside.
  assert.equal(Math.round(s.floorSqFt * 100) / 100, Math.round(((137 * 89) / 144) * 100) / 100);
  // Clear height is plate top less floor top less the two 1-1/2" top plates.
  assert.ok(Math.abs(s.clearFt - (shed.dims.plateTop - shed.dims.floorTop - 3) / 12) < 1e-9);
  assert.ok(s.cuFt > s.floorSqFt * s.clearFt);
});

test('every preset under 100 sq ft passes its checks with no warning but the height limit', () => {
  for (const [name, f] of under100) assert.ok(evaluate(f()).ok, name);
});

for (const [name, f] of under100) {
  test(`${name}: no one-step change saves more than ${MAX_GAP * 100}% without losing storage or looks`, () => {
    const r = neighbourGap(f());
    const why = r.best && `${r.best.built.length}x${r.best.built.width} ${r.best.built.pitch}/12, ${r.best.built.rafterSize} rafters, ${r.best.built.joistSize} joists, $${r.best.cost.toFixed(0)} against $${r.start.cost.toFixed(0)}`;
    assert.ok(r.gap <= MAX_GAP, `${name} gap ${(r.gap * 100).toFixed(1)}%: ${why}`);
    assert.ok(r.evaluated > 20);
  });
}

test('openings refit along a shorter wall stay on it and apart', () => {
  const ops = refitOpenings(PRESETS['8x12']().openings, 96, 96);
  const back = ops.filter((o) => o.wall === 'back').sort((a, b) => a.offset - b.offset);
  assert.equal(back.length, 2);
  assert.ok(back[1].offset + back[1].width <= 96 && back[1].offset >= back[0].offset + back[0].width);
});

test('the Pareto front keeps only designs nothing beats on both cost and storage', () => {
  const p = (cost, cuFt) => ({ ok: true, cost, cuFt });
  const f = paretoFront([p(100, 10), p(90, 12), p(120, 11), p(130, 20), { ...p(50, 99), ok: false }]);
  assert.deepEqual(f.map((x) => x.cost), [90, 130]);
});

test('the grid enumerates the full product', () => {
  assert.equal([...gridPoints({ a: [1, 2], b: [1, 2, 3] })].length, 6);
});

test('looks-alike needs the same siding and roof and no lower walls', () => {
  const s = evaluate(PRESETS['8x12']());
  assert.ok(looksLike(s, s));
  assert.ok(!looksLike({ ...s, built: { ...s.built, sidingType: 'vinyl' } }, s));
  assert.ok(!looksLike({ ...s, built: { ...s.built, wallHeight: s.built.wallHeight - 6 } }, s));
});

test('full audit: brute-force grid and random restarts', { skip: !process.env.AUDIT_FULL }, () => {
  const rows = audit(under100.map(([, f]) => f()), { restarts: Number(process.env.AUDIT_RESTARTS || 4), seed: Number(process.env.AUDIT_SEED || 7) });
  for (const r of rows) {
    console.log(`${r.start.built.name}: $${r.start.cost.toFixed(0)}, ${r.start.cuFt.toFixed(0)} cu ft; gap ${(r.gap * 100).toFixed(1)}% over ${r.evaluated} designs`);
    assert.ok(r.gap <= MAX_GAP, r.start.built.name);
  }
});

// The design search (designsearch.mjs), checked from outside: no design on its
// front may be beaten outright by one change the search itself offers to the
// knobs that mostly move cost. Before its polish phase, every front design was
// (mostly by floor joists at 24", 1 to 4% cheaper with the same storage and looks).
test('design search: no front design is beaten by one cost-only change the search offers', async () => {
  const { searchDesigns, evaluateDesign, LAYOUTS } = await import('./designsearch.mjs');
  const layouts = Object.keys(LAYOUTS);
  // One size and two layouts, so the search finishes (polish converges) inside its budget.
  const r = searchDesigns({ budget: 1500, sizes: [{ length: 144, width: 96 }], layouts: [layouts[0], layouts[3]] });
  assert.ok(r.evaluated < 1500, `the search used its whole budget (${r.evaluated})`);
  const V = (s) => [-s.cost, s.storage.volumeCuFt, s.looks.score];
  const beats = (a, b) => V(a).every((x, i) => x >= V(b)[i] - 1e-9) && V(a).some((x, i) => x > V(b)[i] + 1e-6);
  const MOVES = { joistSize: ['2x4', '2x6', '2x8'], joistSpacing: [16, 24], rafterSpacing: [16, 24], studSpacing: [16, 24], rafterSize: ['2x4', '2x6'], overhang: [6, 9, 12] };
  const misses = [];
  for (const f of r.front) {
    for (const [k, vals] of Object.entries(MOVES)) {
      for (const v of vals) {
        if (f.design[k] === v) continue;
        const s = evaluateDesign({ ...f.design, [k]: v }, undefined, r.constraints);
        if (s.feasible && beats(s, f)) misses.push(`${f.label}: ${k} ${f.design[k]} to ${v} saves $${(f.cost - s.cost).toFixed(2)}`);
      }
    }
  }
  assert.ok(r.front.length >= 3);
  assert.deepEqual(misses, []);
});
