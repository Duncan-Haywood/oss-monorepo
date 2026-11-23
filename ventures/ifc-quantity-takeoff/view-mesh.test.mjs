import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { termBoundary, prismFamily, solidMesh, boxMesh, meshVolume, rowMesh, modelOrigin, storeyList, thinLoops } from "./view-mesh.mjs";
import { convexPieces, prism, clipPoly, polyVolume, solidVolume, IDENTITY } from "./geom.mjs";
import { idColor, colorId, visibleRuns, sectionPlane } from "./viewer.mjs";
import { parseStep } from "./step.mjs";
import { takeoff } from "./qto.mjs";

const extruded = (pts, h = 1) => convexPieces(pts).map((p) => ({ s: p.s, faces: prism(p.pts, [0, 0, h]) }));
const L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
const star = Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * 2 * Math.PI, r = i % 2 ? 1 : 2.5; return [r * Math.cos(a), r * Math.sin(a)]; });
const arch = [];
for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI; arch.push([2 * Math.cos(a), 2 * Math.sin(a)]); }
for (let i = 40; i >= 0; i--) { const a = (i / 40) * Math.PI; arch.push([1.5 * Math.cos(a), 1.5 * Math.sin(a)]); }

// a closed boundary encloses the same volume wherever the origin is
function closed(faces, want) {
  const v0 = polyVolume(faces);
  assert.ok(Math.abs(v0 - want) <= 1e-9 * Math.max(1, want), `volume ${v0} vs ${want}`);
  for (const d of [[10, 0, 0], [0, 10, 0], [0, 0, 10]]) {
    const v = polyVolume(faces.map((f) => f.map((p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]])));
    assert.ok(Math.abs(v - want) <= 1e-7 * Math.max(1, want), `not closed: shifted ${d} gives ${v}`);
  }
}

test("a fanned concave profile draws as its outline, not its fan", () => {
  for (const pts of [L, star, arch]) {
    const terms = extruded(pts, 1.5);
    assert.ok(terms.some((t) => t.s < 0) || pts === L, "the fan has negative triangles");
    const want = solidVolume({ terms, mesh: 0 });
    const fam = prismFamily(terms);
    assert.ok(fam, "recognised as one extrusion");
    closed(fam.faces, want);
    // the general method gives the same closed boundary
    const gen = termBoundary(terms.map((t) => ({ ...t, faces: t.faces.slice().reverse() })));
    closed(gen.faces, want);
  }
});

test("the L's boundary is its six sides and two caps' worth of area", () => {
  const { faces } = termBoundary(extruded(L));
  const area = (f) => { let n = [0, 0, 0]; for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])]; } return Math.hypot(...n) / 2; };
  const total = faces.reduce((s, f) => s + area(f), 0);
  assert.ok(Math.abs(total - (8 * 1 + 2 * 3)) < 1e-9, `surface ${total}`); // perimeter 8 x height 1 + two caps of 3
});

test("a clipped extrusion goes through the general method and stays closed", () => {
  // a half-space clip (a wall top cut by a sloped roof) changes every term
  const n = [0, 0.3, 1], k = 1.2;
  const terms = extruded(star, 2).map((t) => ({ s: t.s, faces: clipPoly(t.faces, n, k) })).filter((t) => t.faces.length >= 4);
  assert.equal(prismFamily(terms), null);
  const want = solidVolume({ terms, mesh: 0 });
  const b = termBoundary(terms);
  assert.ok(b.exact);
  closed(b.faces, want);
});

test("an opening subtracted as a negative term leaves a hole through the wall", () => {
  const wall = { s: 1, faces: prism([[0, 0], [4, 0], [4, 0.3], [0, 0.3]], [0, 0, 3]) };
  const hole = { s: -1, faces: prism([[1, 0], [2, 0], [2, 0.3], [1, 0.3]], [0, 0, 2]).map((f) => f.map((p) => [p[0], p[1], p[2] + 0.5])) };
  const want = 4 * 0.3 * 3 - 1 * 0.3 * 2;
  const { faces } = termBoundary([wall, hole]);
  closed(faces, want);
  // no face crosses the hole's middle
  const mid = [1.5, 0.15, 1.5];
  for (const f of faces) {
    const xs = f.map((p) => p[0]), zs = f.map((p) => p[2]), ys = f.map((p) => p[1]);
    const flatY = Math.max(...ys) - Math.min(...ys) < 1e-12;
    if (flatY && Math.min(...xs) < mid[0] && Math.max(...xs) > mid[0] && Math.min(...zs) < mid[2] && Math.max(...zs) > mid[2]) assert.fail("a wall face covers the opening");
  }
});

test("solidMesh places triangles in the world, in metres, from the origin given", () => {
  const terms = extruded(L);
  const W = [1, 0, 0, 1000, 0, 1, 0, 2000, 0, 0, 1, 0]; // moved by (1000, 2000, 0) mm
  const m = solidMesh({ terms, mesh: 0, shells: [] }, W, 0.001, [1, 2, 0]);
  assert.ok(m.exact && !m.empty);
  let lo = Infinity;
  for (let i = 0; i < m.positions.length; i += 3) lo = Math.min(lo, m.positions[i]);
  assert.ok(Math.abs(lo) < 1e-9);
  assert.ok(Math.abs(meshVolume(m.positions) - 3e-9) < 1e-15);
});

test("a box mesh encloses its box", () => {
  assert.ok(Math.abs(meshVolume(boxMesh([0, 0, 0, 2, 3, 4]).positions) - 24) < 1e-9);
});

test("every element of the sample model draws the solid its volume came from", () => {
  const r = takeoff(parseStep(readFileSync(new URL("./samples/sample-office.ifc", import.meta.url))));
  const origin = modelOrigin(r.rows);
  for (const row of r.rows) {
    const m = rowMesh(row, origin);
    assert.ok(m && m.exact && !m.boxOnly, `${row.ifcClass} #${row.id}`);
    const want = m.net ? row.computed.net : row.computed.gross;
    const got = Math.abs(meshVolume(m.positions));
    assert.ok(Math.abs(got - want) <= 0.005 * want, `${row.ifcClass} #${row.id}: ${got} vs ${want}`);
  }
});

test("pick colours round-trip element slots", () => {
  for (const i of [0, 1, 254, 255, 256, 70000, 16777214]) {
    const [r, g, b] = idColor(i).map((v) => Math.round(v * 255));
    assert.equal(colorId(r, g, b), i);
  }
  assert.equal(colorId(0, 0, 0), -1); // background
});

test("a hollow section's caps are its ring, holes bridged, and it stays closed", () => {
  const circle = (r, n, cw) => { const p = Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [r * Math.cos(a), r * Math.sin(a)]; }); return cw ? p.reverse() : p; };
  const outer = { s: 1, faces: prism(circle(0.1, 72), [0, 0, 3]) };
  const inner = { s: -1, faces: prism(circle(0.09, 72), [0, 0, 3]) };
  const want = solidVolume({ terms: [outer, inner], mesh: 0 });
  const fam = prismFamily([outer, inner]);
  closed(fam.faces, want);
  const m = solidMesh({ terms: [outer, inner], mesh: 0, shells: [] }, IDENTITY, 1);
  assert.ok(Math.abs(meshVolume(m.positions) - want) < 1e-6 * want);
  // sides 2 x 72 quads, caps about one triangle per vertex: far fewer than trapezoids
  assert.ok(m.positions.length / 9 < 2 * 72 * 2 + 2 * (2 * 72 + 2) + 1, `${m.positions.length / 9} triangles`);
});

test("a cut whose end lies a few micrometres off the face it trims still cuts it (Tekla beam #1717)", () => {
  // a 8585 x 200 x 900 mm beam, a full-height notch at its end and a bottom
  // cut whose end plane the exporter left 5 um inside x = 0 (the clip's own
  // rounding), with the notch's and the cut's shared part added back
  const box = (x0, y0, z0, x1, y1, z1) => prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [0, 0, z1 - z0]).map((f) => f.map(([x, y, z]) => [x, y, z + z0]));
  const terms = [
    { s: 1, faces: box(0, -100, -450, 8585, 100, 450) },
    { s: -1, faces: box(0, 40, -450, 160, 100, 450) },
    { s: -1, faces: box(5e-6, -100, -450, 1558, 100, -50) },
    { s: 1, faces: box(5e-6, 40, -450, 160, 100, -50) },
  ];
  const want = solidVolume({ terms, mesh: 0 });
  const b = termBoundary(terms);
  assert.ok(b.exact);
  // the end face at x = 0 is the part above the cut and outside the notch: 140 x 500
  let end = 0;
  for (const f of b.faces) if (f.every((p) => Math.abs(p[0]) < 1e-3)) end += Math.hypot(...f.slice(2).reduce((n, p, i) => { const a = f[0], q = f[i + 1]; const u = [q[0] - a[0], q[1] - a[1], q[2] - a[2]], v = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]; return [n[0] + (u[1] * v[2] - u[2] * v[1]) / 2, n[1] + (u[2] * v[0] - u[0] * v[2]) / 2, n[2] + (u[0] * v[1] - u[1] * v[0]) / 2]; }, [0, 0, 0]));
  assert.ok(Math.abs(end - 140 * 500) < 1, `end face ${end} mm2`);
  assert.ok(Math.abs(polyVolume(b.faces) - want) <= 1e-6 * want, `${polyVolume(b.faces)} vs ${want}`);
});

test("hidden elements leave the draw as few merged ranges", () => {
  const items = [0, 1, 2, 3, 4].map((i) => ({ id: `e${i}`, start: i * 6, count: 6 }));
  assert.deepEqual(visibleRuns(items, null), [[0, 30]]);
  assert.deepEqual(visibleRuns(items, (id) => id !== "e2"), [[0, 12], [18, 12]]);
  assert.deepEqual(visibleRuns(items, (id) => id === "e4"), [[24, 6]]);
  assert.deepEqual(visibleRuns(items, () => false), []);
});

test("the section plane cuts at its fraction of the shown box", () => {
  const box = [-10, -5, 0, 10, 5, 9];
  // plan cut a third of the way up: discard z > 3
  assert.deepEqual(sectionPlane("z", 1 / 3, box), { n: [0, 0, 1], d: 3 });
  // flipped: keep above, discard z < 3 (-z > -3)
  assert.deepEqual(sectionPlane("z", 1 / 3, box, true), { n: [0, 0, -1], d: -3 });
  assert.deepEqual(sectionPlane("x", 0.25, box), { n: [1, 0, 0], d: -5 });
  assert.deepEqual(sectionPlane("y", 2, box), { n: [0, 1, 0], d: 5 }, "clamped to the box");
  assert.equal(sectionPlane("", 0.5, box), null);
  assert.equal(sectionPlane("z", 0.5, null), null);
});

test("storeys list lowest first, with no-storey elements last", () => {
  const rows = [
    { storey: "Level 10", storeyElevation: 30 }, { storey: "Level 2", storeyElevation: 3 },
    { storey: "Level 2", storeyElevation: 3 }, { storey: null }, { storey: "Ground", storeyElevation: 0 },
    { storey: "Roof" }, { storey: "Level 2", isAssembly: true },
  ];
  assert.deepEqual(storeyList(rows).map((s) => [s.name, s.count]), [["Ground", 1], ["Level 2", 2], ["Level 10", 1], ["Roof", 1], [null, 1]]);
  const r = takeoff(parseStep(readFileSync(new URL("./samples/sample-office.ifc", import.meta.url))));
  const list = storeyList(r.rows);
  assert.equal(list.reduce((a, s) => a + s.count, 0), r.rows.filter((x) => !x.isAssembly).length);
});

test("meshRows draws what rowMesh draws, assemblies as their parts", async () => {
  const { meshRows } = await import("./view-mesh.mjs");
  const t = takeoff(parseStep(readFileSync(new URL("./samples/sample-office.ifc", import.meta.url))));
  const { rows, origin } = meshRows.prepare(t.rows);
  assert.deepEqual(origin, modelOrigin(t.rows));
  assert.ok(rows.every((r) => !r.isAssembly));
  const got = [...meshRows(rows, origin)];
  assert.equal(got.length, rows.length);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(got[i].id, rows[i].id);
    assert.deepEqual(got[i].mesh?.positions, rowMesh(rows[i], origin)?.positions);
  }
});

test("visible runs skip items not uploaded yet", () => {
  const items = [{ id: 1, start: 0, count: 6 }, { id: 2, start: 6, count: 3 }, { id: 3 }];
  assert.deepEqual(visibleRuns(items, null), [[0, 9]]);
});

test("a round tube sampled at 360 to the turn is drawn with far fewer sides, still closed, its volume within 0.2%", () => {
  const circle = (r, n, cw) => { const p = Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [r * Math.cos(a), r * Math.sin(a)]; }); return cw ? p.reverse() : p; };
  // a CHS 219.1 x 8 as geom.mjs samples it
  const outer = { s: 1, faces: prism(circle(0.10955, 360), [0, 0, 6]) };
  const inner = { s: -1, faces: prism(circle(0.10155, 360), [0, 0, 6]) };
  const want = solidVolume({ terms: [outer, inner], mesh: 0 });
  const fam = prismFamily([outer, inner]);
  const v0 = polyVolume(fam.faces);
  assert.ok(Math.abs(v0 - want) <= 2e-3 * want, `volume ${v0} vs ${want}`);
  for (const d of [[10, 0, 0], [0, 10, 0], [0, 0, 10]]) {
    const v = polyVolume(fam.faces.map((f) => f.map((p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]])));
    assert.ok(Math.abs(v - v0) <= 1e-7, `not closed: shifted ${d} gives ${v}`);
  }
  const m = solidMesh({ terms: [outer, inner], mesh: 0, shells: [] }, IDENTITY, 1);
  const tris = m.positions.length / 9;
  // 360-point loops gave 2 x 360 quads + bridged caps, about 2,900 triangles
  assert.ok(tris < 600, `${tris} triangles`);
  assert.ok(Math.abs(meshVolume(m.positions) - want) <= 2e-3 * want);
});

test("outline thinning: straight runs lose their extra points exactly; loops that would cross are refused", () => {
  const sq = [];
  for (let i = 0; i < 40; i++) sq.push([i / 40, 0]);
  for (let i = 0; i < 40; i++) sq.push([1, i / 40]);
  for (let i = 0; i < 40; i++) sq.push([1 - i / 40, 1]);
  for (let i = 0; i < 40; i++) sq.push([0, 1 - i / 40]);
  const t = thinLoops([sq]);
  assert.equal(t[0].length, 4);
  // short loops are left alone
  assert.equal(thinLoops([[[0, 0], [1, 0], [1, 1], [0, 1]]]), null);
  // a circle keeps its area (scaled back, as geom.mjs's area-preserving radius)
  const ring = (r, n, ph = 0) => Array.from({ length: n }, (_, i) => [r * Math.cos(ph + i * 2 * Math.PI / n), r * Math.sin(ph + i * 2 * Math.PI / n)]);
  const area = (P) => P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
  const c = ring(1, 360);
  const tc = thinLoops([c])[0];
  assert.ok(tc.length < 80, `${tc.length} points`);
  assert.ok(Math.abs(area(tc) - area(c)) < 1e-9);
  // a wall too thin for the tolerance: the simplified loops would cross, so nothing is thinned
  const inner = ring(0.98, 361, 0.3).reverse();
  assert.equal(thinLoops([c, inner], 0.05), null);
  assert.ok(thinLoops([c, inner]));
});

// ---- swept disks drawn as tubes ----------------------------------------
import { tubeTriangles, tubeDetail, TUBE_SIDES, TUBE_LEVELS } from "./view-mesh.mjs";
const tris64 = (tris) => { let v = 0; const o = tris[0][0]; for (const [a, b, c] of tris) { const A = [a[0] - o[0], a[1] - o[1], a[2] - o[2]], B = [b[0] - o[0], b[1] - o[1], b[2] - o[2]], C = [c[0] - o[0], c[1] - o[1], c[2] - o[2]]; v += A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]); } return v / 6; };
// a TUBE_SIDES-gon of circumradius r: its area, the tube's section
const ngon = (r, n = TUBE_SIDES) => (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
const line = (a, b) => ({ kind: "line", a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) });

test("a straight swept disk is drawn as a closed 8-sided tube facing out: volume = 8-gon x length", () => {
  const t = tubeTriangles({ radius: 0.01, segs: [line([0, 0, 0], [0, 0, 2])] });
  assert.equal(t.length, 2 * TUBE_SIDES + 2 * (TUBE_SIDES - 2));
  const v = tris64(t);
  assert.ok(Math.abs(v - ngon(0.01) * 2) < 1e-12, `${v}`);
});

test("a bent bar's tube is mitred at its bends: the volume is the section x centreline length, for any turn up to 120 degrees", () => {
  for (const deg of [30, 90, 119]) {
    const a = (deg * Math.PI) / 180;
    const p2 = [1 + 0.5 * Math.cos(a), 0.5 * Math.sin(a), 0.3];
    const segs = [line([0, 0, 0.3], [1, 0, 0.3]), line([1, 0, 0.3], p2), line(p2, [p2[0], p2[1], 1.3])];
    const v = tris64(tubeTriangles({ radius: 0.006, segs }));
    const want = ngon(0.006) * (1 + 0.5 + 1);
    assert.ok(Math.abs(v - want) < 1e-9 * want + 1e-15, `${deg}: ${v} vs ${want}`);
  }
});

test("a hairpin turning back on itself gets square rings, no mitre spike, and stays within the bar's reach", () => {
  const t = tubeTriangles({ radius: 0.01, segs: [line([0, 0, 0], [1, 0, 0]), line([1, 0, 0], [0.5, 0.01, 0])] });
  for (const tri of t) for (const p of tri) assert.ok(p[0] <= 1.01 + 1e-9 && Math.abs(p[2]) <= 0.01 + 1e-9, `${p}`);
  assert.ok(tris64(t) > 0);
});

test("an arc bar's tube follows the arc in 22.5-degree chords: volume = 8-gon x chord length, within 11% of pi r^2 L", () => {
  // a quarter circle of radius 0.2 about the origin in the xy plane
  const seg = { kind: "arc", a: [0.2, 0, 0], b: [0, 0.2, 0], c: [0, 0, 0], n: [0, 0, 1], angle: Math.PI / 2, r: 0.2, length: 0.1 * Math.PI };
  const t = tubeTriangles({ radius: 0.008, segs: [seg] });
  const v = tris64(t);
  const chords = 4 * 2 * 0.2 * Math.sin(Math.PI / 16);
  assert.ok(Math.abs(v - ngon(0.008) * chords) < 1e-12, `${v}`);
  const exact = Math.PI * 0.008 ** 2 * 0.1 * Math.PI;
  assert.ok(Math.abs(v - exact) / exact < 0.11, `${v} vs ${exact}`);
  for (const tri of t) for (const p of tri) assert.ok(Math.abs(Math.hypot(p[0], p[1]) - 0.2) <= 0.008 / Math.cos(Math.PI / 16) + 1e-9 && Math.abs(p[2]) <= 0.008 + 1e-9, `${p}`);
});

test("solidMesh draws a tube bar and leaves extruded round bars (which have faces) alone", () => {
  const body = { terms: [], shells: null, mesh: 1, notes: [], bars: [{ radius: 0.01, tube: true, segs: [line([0, 0, 0], [1, 0, 0])] }] };
  const m = solidMesh(body, IDENTITY);
  assert.equal(m.empty, false);
  assert.ok(Math.abs(meshVolume(m.positions) - ngon(0.01)) < 1e-6);
  const noTube = solidMesh({ ...body, bars: [{ radius: 0.01, segs: body.bars[0].segs }] }, IDENTITY);
  assert.equal(noTube.empty, true);
});

test("tubeDetail draws a model's bars at 8 sides until they would pass the budget, then fewer", () => {
  const bar = { radius: 0.006, tube: true, segs: [line([0, 0, 0], [1, 0, 0]), line([1, 0, 0], [1, 1, 0])] };
  const rows = (n) => [{ computed: { solids: { body: { terms: [], bars: Array.from({ length: n }, () => bar) } } } }];
  // 3 centreline points: 2 x sides x 3 triangles per bar
  assert.equal(tubeDetail(rows(10)).sides, 8);
  assert.equal(tubeDetail(rows(10), 2 * 8 * 3 * 10).sides, 8);
  assert.equal(tubeDetail(rows(10), 2 * 8 * 3 * 10 - 1).sides, 6);
  const last = tubeDetail(rows(10), 1);
  assert.equal(last.sides, TUBE_LEVELS.at(-1).sides);
  assert.equal(last.overBudget, true);
  // a lighter level still closes: a 3-sided tube encloses the triangle x length
  const t = tubeTriangles(bar, 3, Math.PI / 4);
  const want = (3 / 2) * 0.006 ** 2 * Math.sin((2 * Math.PI) / 3) * 2;
  assert.ok(Math.abs(tris64(t) - want) < 1e-12, `${tris64(t)} vs ${want}`);
});
