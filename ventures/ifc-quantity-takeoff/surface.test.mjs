// Advanced brep faces on curved surfaces other than cylinders (surface.mjs and
// Geometry.surfaceTriangles in geom.mjs), checked against volumes by formula.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStep } from "./step.mjs";
import { Geometry, solidVolume, sectionArea, Unresolved } from "./geom.mjs";
import { bsplineCurve, bsplineSurface, invertSurface, surfaceGrid, meshFace } from "./surface.mjs";

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} vs ${b} (tol ${tol})`);

/** A STEP model of one IfcAdvancedBrep (as engine.test.mjs builds them), with curved surfaces. */
function model(build) {
  const lines = [];
  let id = 100;
  const put = (s) => { const i = id++; lines.push(`#${i}=${s};`); return `#${i}`; };
  const pt = (p) => put(`IFCCARTESIANPOINT((${p.map((x) => x.toFixed(9)).join(",")}))`);
  const dir = (d) => put(`IFCDIRECTION((${d.map((x) => x.toFixed(9)).join(",")}))`);
  const place = (o, z = [0, 0, 1], x = [1, 0, 0]) => put(`IFCAXIS2PLACEMENT3D(${pt(o)},${dir(z)},${dir(x)})`);
  const b = {
    vertex: (p) => put(`IFCVERTEXPOINT(${pt(p)})`),
    line: (a, c) => put(`IFCLINE(${pt(a)},${put(`IFCVECTOR(${dir(c.map((x, i) => x - a[i]))},1.)`)})`),
    circle: (o, r, z = [0, 0, 1], x = [1, 0, 0]) => put(`IFCCIRCLE(${place(o, z, x)},${r})`),
    edge: (v0, v1, curve) => put(`IFCEDGECURVE(${v0},${v1},${curve},.T.)`),
    loop: (oes) => put(`IFCEDGELOOP((${oes.map(([e, fwd]) => put(`IFCORIENTEDEDGE(*,*,${e},${fwd ? ".T." : ".F."})`)).join(",")}))`),
    face: (loops, surface) => put(`IFCADVANCEDFACE((${loops.map((l, i) => put(`${i ? "IFCFACEBOUND" : "IFCFACEOUTERBOUND"}(${l},.T.)`)).join(",")}),${surface},.T.)`),
    plane: (o, z) => put(`IFCPLANE(${place(o, z, Math.abs(z[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0])})`),
    revolution: (profile, axisAt, axisDir) => put(`IFCSURFACEOFREVOLUTION(${put(`IFCARBITRARYOPENPROFILEDEF(.CURVE.,$,${profile})`)},$,${put(`IFCAXIS1PLACEMENT(${pt(axisAt)},${dir(axisDir)})`)})`),
    bspline: (rows) => put(`IFCBSPLINESURFACEWITHKNOTS(1,1,(${rows.map((r) => `(${r.map(pt).join(",")})`).join(",")}),.UNSPECIFIED.,.F.,.F.,.F.,(2,2),(2,2),(0.,1.),(0.,1.),.UNSPECIFIED.)`),
  };
  const faces = build(b);
  const brep = put(`IFCADVANCEDBREP(${put(`IFCCLOSEDSHELL((${faces.join(",")}))`)})`);
  const text = `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`;
  return { model: parseStep(text), id: Number(brep.slice(1)) };
}

test("surface of revolution, line profile: half a cone frustum to 0.1%, and its section", () => {
  // R 1 at z 0, r 0.5 at z 1, the y >= 0 half
  const { model: m, id } = model(({ vertex, line, circle, edge, loop, face, plane, revolution }) => {
    const B0 = [1, 0, 0], B1 = [-1, 0, 0], T0 = [0.5, 0, 1], T1 = [-0.5, 0, 1];
    const [b0, b1, t0, t1] = [B0, B1, T0, T1].map(vertex);
    const bot = edge(b0, b1, circle([0, 0, 0], 1)), top = edge(t0, t1, circle([0, 0, 1], 0.5));
    const bd = edge(b1, b0, line(B1, B0)), td = edge(t1, t0, line(T1, T0));
    const s0 = edge(b0, t0, line(B0, T0)), s1 = edge(b1, t1, line(B1, T1));
    return [
      face([loop([[bot, true], [s1, true], [top, false], [s0, false]])], revolution(line(B0, T0), [0, 0, 0], [0, 0, 1])),
      face([loop([[bot, true], [bd, true]])], plane([0, 0, 0], [0, 0, -1])),
      face([loop([[top, true], [td, true]])], plane([0, 0, 1], [0, 0, 1])),
      face([loop([[bd, false], [s1, true], [td, true], [s0, false]])], plane([0, 0, 0], [0, -1, 0])),
    ];
  });
  const s = new Geometry(m).item(id);
  close(solidVolume(s), (Math.PI * (1 + 0.5 + 0.25)) / 6, 1e-3);
  close(sectionArea(s, [0, 0, 1], 0.5), (Math.PI * 0.75 * 0.75) / 2, 1e-3);
});

test("surface of revolution through the axis: half a cone, its tip a pole run along in (u, v)", () => {
  const { model: m, id } = model(({ vertex, line, circle, edge, loop, face, plane, revolution }) => {
    const B0 = [1, 0, 0], B1 = [-1, 0, 0], A = [0, 0, 2];
    const [b0, b1, a] = [B0, B1, A].map(vertex);
    const bot = edge(b0, b1, circle([0, 0, 0], 1));
    const bd = edge(b1, b0, line(B1, B0));
    const s0 = edge(b0, a, line(B0, A)), s1 = edge(b1, a, line(B1, A));
    return [
      face([loop([[bot, true], [s1, true], [s0, false]])], revolution(line(B0, A), [0, 0, 0], [0, 0, 1])),
      face([loop([[bot, true], [bd, true]])], plane([0, 0, 0], [0, 0, -1])),
      face([loop([[bd, false], [s1, true], [s0, false]])], plane([0, 0, 0], [0, -1, 0])),
    ];
  });
  const s = new Geometry(m).item(id);
  assert.ok(s.shells, "closed: the pole's triangles of no area are dropped and the rest pair up");
  close(solidVolume(s), (Math.PI * 2) / 6, 1e-3);
});

test("surface of revolution, circle profile: a quarter of a torus in two faces to 0.2%", () => {
  const R = 2, r = 0.5;
  const { model: m, id } = model(({ vertex, circle, edge, loop, face, plane, revolution }) => {
    const A0 = [R + r, 0, 0], B0 = [R - r, 0, 0], A1 = [0, R + r, 0], B1 = [0, R - r, 0];
    const [a0, b0, a1, b1] = [A0, B0, A1, B1].map(vertex);
    const outer = edge(a0, a1, circle([0, 0, 0], R + r)), inner = edge(b0, b1, circle([0, 0, 0], R - r));
    // the tube's circle at u = 0 (in y = 0) and at u = 90 degrees (in x = 0), each in two halves
    const c0 = circle([R, 0, 0], r, [0, -1, 0], [1, 0, 0]), c1 = circle([0, R, 0], r, [1, 0, 0], [0, 1, 0]);
    const top0 = edge(a0, b0, c0), bot0 = edge(b0, a0, c0), top1 = edge(a1, b1, c1), bot1 = edge(b1, a1, c1);
    const surf = revolution(c0, [0, 0, 0], [0, 0, 1]);
    return [
      face([loop([[outer, true], [top1, true], [inner, false], [top0, false]])], surf),
      face([loop([[outer, true], [bot1, false], [inner, false], [bot0, true]])], surf),
      face([loop([[top0, true], [bot0, true]])], plane([R, 0, 0], [0, -1, 0])),
      face([loop([[top1, true], [bot1, true]])], plane([0, R, 0], [-1, 0, 0])),
    ];
  });
  const s = new Geometry(m).item(id);
  // the triangles lie inside the tube, so the figure is a little light (0.12%)
  const v = solidVolume(s), exact = (Math.PI * r * r * R * Math.PI) / 2;
  close(v, exact, 2e-3);
  assert.ok(v < exact);
});

test("B-spline surface: a box with a twisted (bilinear) top, 1 + a/4", () => {
  const a = 0.5;
  const P = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1 + a], [0, 1, 1]];
  const { model: m, id } = model(({ vertex, line, edge, loop, face, plane, bspline }) => {
    const V = P.map(vertex);
    const E = new Map();
    const e = (x, y) => {
      const k = x < y ? `${x}-${y}` : `${y}-${x}`;
      if (!E.has(k)) E.set(k, { id: edge(V[Math.min(x, y)], V[Math.max(x, y)], line(P[Math.min(x, y)], P[Math.max(x, y)])), lo: Math.min(x, y) });
      const q = E.get(k);
      return [q.id, q.lo === x];
    };
    const quad = (q) => q.map((x, i) => e(x, q[(i + 1) % 4]));
    return [
      face([loop(quad([0, 3, 2, 1]))], plane([0, 0, 0], [0, 0, -1])),
      face([loop(quad([0, 1, 5, 4]))], plane([0, 0, 0], [0, -1, 0])),
      face([loop(quad([1, 2, 6, 5]))], plane([1, 0, 0], [1, 0, 0])),
      face([loop(quad([2, 3, 7, 6]))], plane([0, 1, 0], [0, 1, 0])),
      face([loop(quad([3, 0, 4, 7]))], plane([0, 0, 0], [-1, 0, 0])),
      face([loop(quad([4, 5, 6, 7]))], bspline([[P[4], P[7]], [P[5], P[6]]])),
    ];
  });
  const s = new Geometry(m).item(id);
  close(solidVolume(s), 1 + a / 4, 1e-3);
});

test("bsplineCurve: a rational quadratic quarter circle stays on the circle", () => {
  const w = Math.SQRT1_2;
  const C = bsplineCurve([[1, 0, 0], [1, 1, 0], [0, 1, 0]], 2, [3, 3], [0, 1], [1, w, 1]);
  for (let k = 0; k <= 10; k++) {
    const p = C.at(k / 10);
    close(Math.hypot(p[0], p[1]), 1, 1e-12);
  }
});

test("invertSurface finds (u, v) on a rational B-spline surface", () => {
  const w = Math.SQRT1_2;
  // a quarter cylinder, r 1, h 2: the circle along u, straight along v
  const S = bsplineSurface([[[1, 0, 0], [1, 0, 2]], [[1, 1, 0], [1, 1, 2]], [[0, 1, 0], [0, 1, 2]]], 2, 1, [3, 3], [2, 2], [0, 1], [0, 1], [[1, 1], [w, w], [1, 1]]);
  const grid = surfaceGrid(S);
  const p = S.at(0.37, 0.81);
  const [u, v, d] = invertSurface(S, p, null, grid);
  assert.ok(d < 1e-9 && Math.abs(u - 0.37) < 1e-6 && Math.abs(v - 0.81) < 1e-6, `${u} ${v} ${d}`);
});

test("meshFace keeps every boundary point and adds none to the boundary", () => {
  // a cylinder patch, r 1, angle 0..pi/2, height 0..1, its curved edges sampled at 1 degree
  const at = (u, v) => [Math.cos(u), Math.sin(u), v];
  const UV = [];
  for (let i = 0; i <= 90; i++) UV.push([(i * Math.PI) / 180, 0]);
  for (let i = 90; i >= 0; i--) UV.push([(i * Math.PI) / 180, 1]);
  const V3 = UV.map(([u, v]) => at(u, v));
  const n = V3.length;
  const tris = meshFace(V3, UV, at, (q, ids) => {
    // fan from the first point (the loop is convex in (u, v))
    const out = [];
    for (let k = 1; k + 1 < ids.length; k++) out.push([ids[0], ids[k], ids[k + 1]]);
    return out;
  }, { tol: 1e-4, maxLen: 0.5 });
  // every boundary step is an edge of exactly one triangle
  const use = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; const q = a < b ? `${a},${b}` : `${b},${a}`; use.set(q, (use.get(q) || 0) + 1); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; assert.equal(use.get(i < j ? `${i},${j}` : `${j},${i}`), 1, `boundary edge ${i}`); }
  let area = 0;
  for (const [a, b, c] of tris) {
    const p = V3[a], q = V3[b], s = V3[c];
    const x = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], y = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
    area += Math.hypot(x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]) / 2;
  }
  close(area, Math.PI / 2, 1e-4);
});

test("a face wrapping all the way round a surface of revolution is reported, not guessed", () => {
  // a full cone frustum's side bounded by its two circles: not read yet
  const { model: m, id } = model(({ vertex, line, circle, edge, loop, face, plane, revolution }) => {
    const v0 = vertex([1, 0, 0]), v1 = vertex([0.5, 0, 1]);
    const c0 = edge(v0, v0, circle([0, 0, 0], 1)), c1 = edge(v1, v1, circle([0, 0, 1], 0.5));
    return [
      face([loop([[c0, false]])], plane([0, 0, 0], [0, 0, -1])),
      face([loop([[c1, true]])], plane([0, 0, 1], [0, 0, 1])),
      face([loop([[c1, false]]), loop([[c0, true]])], revolution(line([1, 0, 0], [0.5, 0, 1]), [0, 0, 0], [0, 0, 1])),
    ];
  });
  assert.throws(() => new Geometry(m).item(id), (e) => e instanceof Unresolved);
});

for (const flip of [false, true]) test(`a bowl in two halves meeting on the axis${flip ? ", loops reversed" : ""}: the angle across the pole closes the loop`, () => {
  // A hemisphere below z = 0 (radius 1), each half bounded by half the rim
  // and two meridians that meet at the bottom pole. Unwrapping the angle at
  // the pole could take half a turn either way; one of them made the face
  // look as if it went round the whole surface (kleine_Wohnung #162827,
  // a basin's domed bottom, was not read for that reason). Both loop
  // directions are tried, as each one rounds the half turn its own way.
  const { model: m, id } = model(({ vertex, circle, edge, loop, face, plane, revolution }) => {
    const L = (oes) => loop(flip ? oes.slice().reverse().map(([e, f]) => [e, !f]) : oes);
    const B0 = [1, 0, 0], B1 = [-1, 0, 0], P = [0, 0, -1];
    const [b0, b1, p] = [B0, B1, P].map(vertex);
    const r0 = edge(b0, b1, circle([0, 0, 0], 1)), r1 = edge(b1, b0, circle([0, 0, 0], 1));
    const m0 = edge(b0, p, circle([0, 0, 0], 1, [0, 1, 0], [1, 0, 0]));
    const m1 = edge(b1, p, circle([0, 0, 0], 1, [0, -1, 0], [-1, 0, 0]));
    const sphere = () => revolution(circle([0, 0, 0], 1, [0, 1, 0], [1, 0, 0]), [0, 0, 0], [0, 0, 1]);
    return [
      face([L([[r1, false], [r0, false]])], plane([0, 0, 0], [0, 0, 1])),
      face([L([[r0, true], [m1, true], [m0, false]])], sphere()),
      face([L([[r1, true], [m0, true], [m1, false]])], sphere()),
    ];
  });
  const s = new Geometry(m).item(id);
  assert.ok(s.shells, "closed");
  close(Math.abs(solidVolume(s)), (2 * Math.PI) / 3, 3e-3);
  close(sectionArea(s, [0, 0, 1], -0.5), Math.PI * 0.75, 3e-3);
});
