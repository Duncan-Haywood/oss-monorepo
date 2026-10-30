// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchDesigns, searchSteps, evaluateDesign, storageOf, looksOf, paretoFront, picks, sizesUnder, layoutOpenings, LAYOUTS, DOORS, WINDOWS, OBJECTIVES } from './designsearch.mjs';
import { buildShed, defaultDesign, normalize } from './model.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';

test('sizes stay under the footprint limit, both ways round, and include the usual ones', () => {
  const s = sizesUnder(100);
  const names = new Set(s.map((x) => `${x.width / 12}x${x.length / 12}`));
  for (const n of ['10x10', '8x12', '12x8', '7x14', '14x7', '9x11', '11x9']) assert.ok(names.has(n), n);
  for (const x of s) assert.ok((x.length * x.width) / 144 <= 100 && (x.length * x.width) / 144 >= 80);
  assert.ok(sizesUnder(100, { halfFeet: true }).length > s.length);
  assert.ok(sizesUnder(120).some((x) => x.length === 144 && x.width === 120));
});

test('storage is measured from the framing', () => {
  const shed = buildShed(defaultDesign()); // 8x12, 2x4 walls, 86-1/2" walls, ridge beam
  const st = storageOf(shed);
  assert.equal(st.floorSqFt, Math.round(((144 - 7) * (96 - 7)) / 144 * 10) / 10);
  assert.equal(st.clearHeightIn, 86.5 - 3);
  assert.ok(st.overheadOpen);
  assert.equal(st.volumeCuFt, Math.round((st.wallVolumeCuFt + st.overheadCuFt) * 10) / 10);
  // Door 38.5 + 6 and two windows 14.25 + 6 come off the inside perimeter.
  assert.equal(st.shelfFt, Math.round(((2 * 137 + 2 * 89) - 44.5 - 2 * 20.25) / 12 * 10) / 10);
  const board = storageOf(buildShed({ ...defaultDesign(), roofType: 'ridgeBoard' }));
  assert.equal(board.overheadOpen, false);
  assert.match(board.notes.join(' '), /deck the ties/);
});

test('looks is a sum of explained terms out of 100', () => {
  const l = looksOf(buildShed(defaultDesign()));
  assert.equal(l.terms.reduce((t, x) => t + x.max, 0), 100);
  assert.ok(Math.abs(l.score - l.terms.reduce((t, x) => t + x.points, 0)) < 0.15);
  for (const t of l.terms) { assert.ok(t.points >= 0 && t.points <= t.max); assert.ok(t.why.length > 5, t.key); }
  // The default's two back windows mirror about the wall centre, its door is centred: both walls symmetric.
  assert.equal(l.terms.find((t) => t.key === 'symmetry')?.points, 15);
  // A 6/12 roof scores more on pitch than 3/12.
  const p = (pitch) => looksOf(buildShed({ ...defaultDesign(), autoPitch: false, pitch })).terms.find((t) => t.key === 'pitch')?.points ?? 0;
  assert.ok(p(6) > p(3));
});

test('every layout builds on the sizes with all its openings framed, beside a ridge-beam post too', () => {
  for (const size of [{ length: 144, width: 96 }, { length: 120, width: 120 }, { length: 168, width: 84 }, { length: 96, width: 144 }])
  for (const roofType of ['ridgeBoard', 'ridgeBeam']) {
    for (const name of Object.keys(LAYOUTS)) {
      const ops = layoutOpenings(name, size, roofType);
      if (!ops) continue;
      // A door beside the post needs a gable wall of 8 ft 6 in.
      if (roofType === 'ridgeBeam' && size.width < 102 && ops.some((o) => o.kind === 'door' && o.wall === 'right')) continue;
      const shed = buildShed(normalize({ ...defaultDesign(), ...size, roofType, autoPitch: false, pitch: 6, maxPeak: 0, openings: ops }));
      assert.ok(!shed.warnings.some((w) => /left out/.test(w)), `${name} ${size.width}x${size.length}: ${shed.warnings.join(' ')}`);
      assert.equal(shed.design.openings.length, ops.length);
    }
  }
});

test('the Pareto front: nothing on it is beaten, everything off it is', () => {
  const mk = (cost, vol, looks) => /** @type {any} */ ({ cost, storage: { volumeCuFt: vol }, looks: { score: looks } });
  const a = mk(100, 500, 50); const b = mk(120, 600, 50); const c = mk(130, 550, 40); const d = mk(100, 500, 50);
  const f = paretoFront([a, b, c, d]);
  assert.deepEqual(f, [a, b]);
  assert.deepEqual(paretoFront([a, b, c], ['cost']), [a]);
});

test('a small search returns a front of priced designs that pass every check and limit', () => {
  const r = searchDesigns({ budget: 60, sizes: [{ length: 144, width: 96 }, { length: 120, width: 120 }], fixed: ['roofCover', 'sidingType'] });
  assert.ok(r.evaluated <= 60 && r.evaluated > 10);
  assert.ok(r.front.length >= 2);
  for (const s of r.front) {
    assert.ok(s.feasible && s.ok, s.why.join('; '));
    assert.ok(s.cost > 0 && Number.isFinite(s.cost));
    assert.ok(s.footprintSqFt <= 100);
    assert.ok(s.peak <= r.constraints.maxPeak);
    assert.equal(s.design.roofCover, defaultDesign().roofCover);
    assert.equal(s.design.sidingType, defaultDesign().sidingType);
    const shed = buildShed(s.design);
    assert.ok(structuralChecks(shed).ok && connectionChecks(shed).ok);
    // Same numbers again from the design alone.
    assert.equal(evaluateDesign(s.design).cost, s.cost);
  }
  // The front is cheapest first and no design in the pool beats any of it.
  for (let i = 1; i < r.front.length; i++) assert.ok(r.front[i].cost >= r.front[i - 1].cost);
  const v = (s) => [-s.cost, s.storage.volumeCuFt, s.looks.score];
  for (const f of r.front) assert.ok(!r.all.some((s) => v(s).every((x, i) => x >= v(f)[i]) && v(s).some((x, i) => x > v(f)[i])));
  const p = picks(r.front);
  assert.deepEqual(p.map((x) => x.key), ['cost', 'storage', 'looks', 'balanced']);
  assert.equal(p[0].design.cost, Math.min(...r.front.map((s) => s.cost)));
});

test('constraints bind: a tighter footprint, a peak limit and a utilisation cap', () => {
  const r = searchDesigns({ budget: 40, constraints: { maxFootprint: 64, maxPeak: 120, maxUtilisation: 0.8 } });
  assert.ok(r.front.length > 0);
  for (const s of r.front) {
    assert.ok(s.footprintSqFt <= 64);
    assert.ok(s.peak <= 120);
    assert.ok((s.worst?.ratio ?? 0) <= 0.8);
  }
  // Panel siding on studs wider apart than its rating is rejected.
  const t111 = evaluateDesign({ ...defaultDesign(), sidingType: 'T1-11', studSpacing: 24 });
  assert.equal(t111.feasible, false);
  assert.match(t111.why.join(' '), /rated for studs at 16/);
  // A design over a limit says which.
  const big = evaluateDesign({ ...defaultDesign(), length: 192, width: 120 }, undefined, { maxFootprint: 100 });
  assert.equal(big.feasible, false);
  assert.match(big.why.join(' '), /footprint 160\.0 sq ft is over 100/);
});

test('fixed keys are never changed, and the generator reports progress', () => {
  const base = { ...defaultDesign(), roofType: 'ridgeBeam', pitch: 7 };
  const it = searchSteps({ base, budget: 25, fixed: ['roofType', 'pitch'], sizes: [{ length: 144, width: 96 }] });
  let n = 0;
  let res;
  for (;;) { const x = it.next(); if (x.done) { res = x.value; break; } n++; assert.ok(x.value.evaluated <= 25); }
  assert.ok(n > 0);
  for (const s of res.all) { assert.equal(s.design.roofType, 'ridgeBeam'); assert.equal(s.design.pitch, 7); }
});

test('objectives are documented with a unit and a direction', () => {
  for (const [k, o] of Object.entries(OBJECTIVES)) { assert.ok(o.label && o.unit && o.pick, k); assert.ok(o.sense === 1 || o.sense === -1); }
});

test('doors, windows, siding and roofing are choices unless fixed', () => {
  // Every door and window the search knows fits the layouts, heads in line.
  for (const door of Object.keys(DOORS)) for (const win of Object.keys(WINDOWS)) {
    const ops = layoutOpenings('eave door, two windows opposite', { length: 144, width: 96 }, 'ridgeBoard', door, win) ?? [];
    const shed = buildShed(normalize({ ...defaultDesign(), length: 144, width: 96, roofType: 'ridgeBoard', autoWall: true, autoPitch: false, pitch: 6, maxPeak: 0, openings: ops }));
    assert.ok(!shed.warnings.some((w) => /left out/.test(w)), `${door} ${win}: ${shed.warnings.join(' ')}`);
    const d = shed.design.openings.find((o) => o.kind === 'door');
    for (const w of shed.design.openings.filter((o) => o.kind === 'window')) assert.ok(Math.abs((w.sill ?? 0) + w.height - (d?.height ?? 0)) < 0.01);
  }
  const r = searchDesigns({ budget: 120, sizes: [{ length: 144, width: 96 }], layouts: ['eave door, two windows opposite'] });
  const seen = (f) => new Set(r.all.map(f));
  assert.ok(seen((s) => s.design.sidingType).size > 1);
  assert.ok(seen((s) => s.design.openings.find((o) => o.kind === 'door')?.product).size > 1);
  // Fixed: the base's own door product and siding.
  const base = { ...defaultDesign(), sidingType: 'fiber cement', openings: [{ id: 'o1', kind: 'door', wall: 'front', offset: 50, width: 34, height: 82, product: 'masonite-3280-flush' }] };
  const f = searchDesigns({ base, budget: 30, fixed: ['sidingType', 'door', 'roofCover'], sizes: [{ length: 144, width: 96 }] });
  for (const s of f.all) {
    assert.equal(s.design.sidingType, 'fiber cement');
    assert.equal(s.design.openings.find((o) => o.kind === 'door')?.product, 'masonite-3280-flush');
  }
});
