// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchDesigns, searchSteps, evaluateDesign, storageOf, looksOf, paretoFront, picks, sizesUnder, layoutOpenings, LAYOUTS, DOORS, WINDOWS, OBJECTIVES } from './designsearch.mjs';
import { buildShed, defaultDesign, normalize } from './model.mjs';
import { designFacts } from './designfacts.mjs';
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
  const shed = buildShed(defaultDesign()); // 8x12, 2x4 walls, 84-1/2" walls (a two-2x4 header over the 78" door), ridge beam
  const st = storageOf(shed);
  assert.equal(st.floorSqFt, Math.round(((144 - 7) * (96 - 7)) / 144 * 10) / 10);
  assert.equal(st.clearHeightIn, 84.5 - 3);
  assert.ok(st.overheadOpen);
  // Each part is rounded to 0.1, so their sum can differ from the rounded total by 0.1.
  assert.ok(Math.abs(st.volumeCuFt - (st.wallVolumeCuFt + st.overheadCuFt)) <= 0.1 + 1e-9);
  // The door's and two windows' rough widths come off the inside perimeter.
  assert.equal(st.shelfFt, Math.round(((2 * 137 + 2 * 89) - 38.5 - 2 * 14.25) / 12 * 10) / 10);
  // The box runs to the top of the plates; the same numbers the detail panel shows.
  assert.equal(st.wallHeightIn, 84.5);
  assert.equal(st.volumeCuFt, Math.round(designFacts(defaultDesign()).storage.volumeCuFt * 10) / 10);
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
  // 132": at 120" the only design that met every limit was a 7x8 with its door
  // in the 7 ft gable, which the racking check (2026-10-30) fails: the door
  // leaves that wall no panel wide enough to brace it.
  const r = searchDesigns({ budget: 40, constraints: { maxFootprint: 64, maxPeak: 132, maxUtilisation: 0.8 } });
  assert.ok(r.front.length > 0);
  for (const s of r.front) {
    assert.ok(s.footprintSqFt <= 64);
    assert.ok(s.peak <= 132);
    assert.ok((s.worst?.ratio ?? 0) <= 0.8);
  }
  // Panel siding on studs wider apart than its rating is rejected.
  const t111 = evaluateDesign({ ...defaultDesign(), sidingType: 'T1-11', studSpacing: 24, autoStuds: false });
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

test('choices the design locks (levers.mjs) are never changed', () => {
  const base = { ...defaultDesign(), sidingType: 'fiber cement', foundation: 'deck blocks', joistSpacing: 16, locked: ['siding', 'roofing', 'foundation', 'floor', 'doors'] };
  const r = searchDesigns({ base, budget: 60, sizes: [{ length: 144, width: 96 }, { length: 120, width: 120 }] });
  assert.ok(r.all.length > 0);
  for (const s of r.all) {
    assert.equal(s.design.sidingType, 'fiber cement');
    assert.equal(s.design.roofCover, 'shingles');
    assert.equal(s.design.foundation, 'deck blocks');
    assert.equal(s.design.joistSpacing, 16);
    assert.equal(s.design.joistSize, defaultDesign().joistSize);
    assert.equal(s.design.openings.find((o) => o.kind === 'door')?.product, 'site-built');
  }
});

test('an 8" overhang and 88" walls are offered, and a small budget still leaves a tight front', () => {
  const r = searchDesigns({ budget: 800, sizes: [{ length: 120, width: 96 }, { length: 144, width: 96 }] });
  assert.ok(r.all.some((s) => s.design.overhang === 8));
  assert.ok(r.all.some((s) => s.wallHeight === 88));
  // The polish phase: few front designs are beaten outright by one lighter-framing or overhang change.
  const V = (s) => [-s.cost, s.storage.volumeCuFt, s.looks.score];
  const beats = (a, b) => V(a).every((x, i) => x >= V(b)[i] - 1e-9) && V(a).some((x, i) => x > V(b)[i] + 1e-6);
  const MOVES = { joistSize: ['2x4'], joistSpacing: [24], rafterSpacing: [24], studSpacing: [24], rafterSize: ['2x4'], overhang: [6, 8, 9, 12] };
  let beaten = 0;
  for (const f of r.front) {
    const hit = Object.entries(MOVES).some(([k, vals]) => vals.some((v) => {
      if (f.design[k] === v) return false;
      const s = evaluateDesign({ ...f.design, [k]: v }, undefined, r.constraints);
      return s.feasible && beats(s, f);
    }));
    if (hit) beaten++;
  }
  assert.ok(beaten <= Math.ceil(r.front.length * 0.15), `${beaten} of ${r.front.length} front designs beaten by one change`);
});

test('no floor is searched only when asked; block spacing is a move the skid check rules on', () => {
  const sizes = [{ length: 144, width: 96 }];
  const plain = searchDesigns({ budget: 80, sizes });
  assert.ok(plain.all.every((s) => s.design.floor === 'framed'), 'the default search keeps the framed floor');
  const asked = searchDesigns({ budget: 200, sizes, knobs: { floor: ['framed', 'none'] } });
  const none = asked.all.filter((s) => s.design.floor === 'none');
  assert.ok(none.length > 0, 'asked, it tries designs with no floor');
  assert.ok(none.every((s) => s.design.floor === 'none' && Number.isFinite(s.cost)));
  const floorless = searchDesigns({ base: { ...defaultDesign(), floor: 'none' }, budget: 40, sizes });
  assert.ok(floorless.all.every((s) => s.design.floor === 'none'), 'a floorless design stays floorless');
  const wide = searchDesigns({ budget: 200, sizes, knobs: { foundation: ['blocks'], blockSpacing: [72] } });
  assert.ok(wide.all.every((s) => s.design.blockSpacing === 72));
});

test('the gambrel knobs: the search varies the lower slope, the knee and the loft, under the peak limit', () => {
  const r = searchDesigns({ budget: 70, sizes: [{ length: 120, width: 96 }], layouts: ['eave door, no windows'], knobs: { style: ['gambrel'] } });
  const barns = r.all.filter((s) => s.design.style === 'gambrel');
  assert.ok(barns.length > 10);
  const seen = (k) => new Set(barns.map((s) => s.design[k])).size;
  assert.ok(seen('gambrelLower') > 1 && seen('gambrelKnee') > 1 && seen('loft') > 1, `lower ${seen('gambrelLower')}, knee ${seen('gambrelKnee')}, loft ${seen('loft')}`);
  for (const s of r.all) assert.ok(s.peak <= 156 + 0.01, `${s.label}: peak ${s.peak}`);
  // The knee as a fraction of the width: a third of 96" is 32".
  assert.ok(barns.some((s) => s.design.gambrelKnee === 32) || barns.every((s) => s.design.gambrelKnee !== 32));
  // Usable storage: the whole roof space over a full loft, none over bare ties, part over half a loft.
  for (const s of barns) {
    const u = s.storage.usableCuFt;
    if (s.design.loft === 'full') assert.ok(Math.abs(u - s.storage.volumeCuFt) < 0.2, s.label);
    if (s.design.loft === 'none') assert.ok(Math.abs(u - s.storage.wallVolumeCuFt) < 0.2, s.label);
    if (s.design.loft === 'half') assert.ok(u > s.storage.wallVolumeCuFt && u < s.storage.volumeCuFt, s.label);
  }
});

test('the gambrel knobs change nothing on a gable: no gable is built twice for them', () => {
  const base = { budget: 40, sizes: [{ length: 144, width: 96 }], layouts: ['eave door, two windows opposite'] };
  const without = searchDesigns({ ...base, knobs: { style: ['gable'], gambrelLower: [20], gambrelKnee: ['quarter'], loft: ['none'] } });
  const withKnobs = searchDesigns({ ...base, knobs: { style: ['gable'] } });
  assert.deepEqual(withKnobs.all.map((s) => s.label + s.cost), without.all.map((s) => s.label + s.cost));
});

test('usable storage: open roof space counts, space over bare ties does not', () => {
  const beam = evaluateDesign(defaultDesign());
  assert.equal(beam.storage.usableCuFt, beam.storage.volumeCuFt);
  const board = evaluateDesign({ ...defaultDesign(), roofType: 'ridgeBoard' });
  assert.equal(board.storage.usableCuFt, board.storage.wallVolumeCuFt);
  assert.ok(OBJECTIVES.usable.of(board) < OBJECTIVES.storage.of(board));
});

test('clerestory windows: a row of transoms high in a lean-to\'s tall wall, all framed', async () => {
  const { PRESETS } = await import('./model.mjs');
  const ops = layoutOpenings('eave door and clerestory windows', { length: 144, width: 96 }, undefined);
  const door = ops.find((o) => o.kind === 'door');
  const wins = ops.filter((o) => o.kind === 'window');
  assert.equal(wins.length, 2);
  for (const w of wins) {
    assert.equal(w.product, 'swm-t2312');
    assert.equal(w.wall, 'front');
    assert.ok(w.sill >= door.height + 6 - 1e-9, 'sill over the door head');
  }
  const shed = buildShed({ ...PRESETS['8x12 lean-to'](), openings: ops });
  assert.equal(shed.framedOpenings.length, ops.length);
  assert.deepEqual(shed.warnings, []);
  // On a gable the front wall is too low for them: the search does not seed gables with this layout.
  const g = evaluateDesign({ ...defaultDesign(), openings: ops, autoWall: true });
  assert.ok(!g.feasible);
});
