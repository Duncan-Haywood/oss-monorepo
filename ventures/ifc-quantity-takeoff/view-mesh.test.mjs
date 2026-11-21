import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { termBoundary, prismFamily, solidMesh, boxMesh, meshVolume, rowMesh, modelOrigin } from "./view-mesh.mjs";
import { convexPieces, prism, clipPoly, polyVolume, solidVolume, IDENTITY } from "./geom.mjs";
import { idColor, colorId } from "./viewer.mjs";
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
