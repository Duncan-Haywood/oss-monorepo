// Advanced brep faces on curved surfaces other than cylinders (surface.mjs and
// Geometry.surfaceTriangles in geom.mjs), checked against volumes by formula.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStep } from "./step.mjs";
import { Geometry, solidVolume, sectionArea, Unresolved, offEdges } from "./geom.mjs";
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

test("surface of revolution, line profile: half a cone frustum to 1e-6, and its section", () => {
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
  // the flat triangles' sag added back (bulgeVolume): 0.034% light without it
  close(solidVolume(s), (Math.PI * (1 + 0.5 + 0.25)) / 6, 1e-6);
  // exact circles on an exact cone: no off-the-edges note
  assert.ok(!s.notes.some((n) => /off the edges/.test(n)), s.notes.join("; "));
  close(sectionArea(s, [0, 0, 1], 0.5), (Math.PI * 0.75 * 0.75) / 2, 1e-3);
});

test("the sag added back keeps its sign when a curved face is written turned the wrong way", () => {
  // the frustum above with the curved face's loop walked backwards: the
  // shell turns that face to match its neighbours, and its sag turns with it
  const { model: m, id } = model(({ vertex, line, circle, edge, loop, face, plane, revolution }) => {
    const B0 = [1, 0, 0], B1 = [-1, 0, 0], T0 = [0.5, 0, 1], T1 = [-0.5, 0, 1];
    const [b0, b1, t0, t1] = [B0, B1, T0, T1].map(vertex);
    const bot = edge(b0, b1, circle([0, 0, 0], 1)), top = edge(t0, t1, circle([0, 0, 1], 0.5));
    const bd = edge(b1, b0, line(B1, B0)), td = edge(t1, t0, line(T1, T0));
    const s0 = edge(b0, t0, line(B0, T0)), s1 = edge(b1, t1, line(B1, T1));
    return [
      face([loop([[s0, true], [top, true], [s1, false], [bot, false]])], revolution(line(B0, T0), [0, 0, 0], [0, 0, 1])),
      face([loop([[bot, true], [bd, true]])], plane([0, 0, 0], [0, 0, -1])),
      face([loop([[top, true], [td, true]])], plane([0, 0, 1], [0, 0, 1])),
      face([loop([[bd, false], [s1, true], [td, true], [s0, false]])], plane([0, 0, 0], [0, -1, 0])),
    ];
  });
  close(solidVolume(new Geometry(m).item(id)), (Math.PI * (1 + 0.5 + 0.25)) / 6, 1e-6);
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

test("surface of revolution, circle profile: a quarter of a torus in two faces to 2e-5", () => {
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
  // the triangles lie inside the tube (0.12% light); their sag added back
  // leaves the end discs' 360-gons (5e-6)
  const v = solidVolume(s), exact = (Math.PI * r * r * R * Math.PI) / 2;
  close(v, exact, 2e-5);
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

// kleine_Wohnung #207997 (ThatOpen/engine_web-ifc tests/ifcfiles/public/
// ISSUE_159_kleine_Wohnung_R22.ifc), its 100 entities as written: an oblique
// half-and-half cone frustum, radii 0.035 and 0.015 m, 0.2 m tall, whose two
// side faces are cubic B-splines with every weight 1. A polynomial cubic
// cannot follow a circle: the faces stand up to 0.042 mm inside the circular
// edges and caps that bound them (eval/off-edges-2026-11-23.md).
const KW207997 = `
#14=IFCDIRECTION((-1.,0.,0.));
#16=IFCDIRECTION((0.,1.,0.));
#20=IFCDIRECTION((0.,0.,1.));
#22=IFCDIRECTION((0.,0.,-1.));
#207805=IFCCARTESIANPOINT((0.0223449901289267,0.061595272235916,0.329999999999992));
#207807=IFCVERTEXPOINT(#207805);
#207808=IFCCARTESIANPOINT((0.0523449901289267,0.0615952722359162,0.329999999999992));
#207810=IFCVERTEXPOINT(#207808);
#207811=IFCCARTESIANPOINT((0.0373449901289267,0.0615952722359161,0.329999999999992));
#207813=IFCAXIS2PLACEMENT3D(#207811,#20,#14);
#207814=IFCCIRCLE(#207813,0.015);
#207815=IFCTRIMMEDCURVE(#207814,(#207805),(#207808),.T.,.CARTESIAN.);
#207818=IFCEDGECURVE(#207807,#207810,#207815,.T.);
#207819=IFCCARTESIANPOINT((0.001595272235916,0.0615952722359159,0.129999999999993));
#207821=IFCVERTEXPOINT(#207819);
#207822=IFCDIRECTION((-0.10319469401016,0.,-0.994661176043455));
#207824=IFCVECTOR(#207822,0.3048);
#207825=IFCLINE(#207805,#207824);
#207826=IFCTRIMMEDCURVE(#207825,(#207805),(#207819),.T.,.CARTESIAN.);
#207829=IFCEDGECURVE(#207807,#207821,#207826,.T.);
#207830=IFCCARTESIANPOINT((0.071595272235916,0.0615952722359163,0.129999999999993));
#207832=IFCVERTEXPOINT(#207830);
#207833=IFCCARTESIANPOINT((0.036595272235916,0.0615952722359162,0.129999999999993));
#207835=IFCAXIS2PLACEMENT3D(#207833,#22,#14);
#207836=IFCCIRCLE(#207835,0.035);
#207837=IFCTRIMMEDCURVE(#207836,(#207830),(#207819),.T.,.CARTESIAN.);
#207840=IFCEDGECURVE(#207832,#207821,#207837,.T.);
#207841=IFCDIRECTION((-0.0958086320972001,0.,0.995399771958816));
#207843=IFCVECTOR(#207841,0.3048);
#207844=IFCLINE(#207830,#207843);
#207845=IFCTRIMMEDCURVE(#207844,(#207830),(#207808),.T.,.CARTESIAN.);
#207848=IFCEDGECURVE(#207832,#207810,#207845,.T.);
#207849=IFCAXIS2PLACEMENT3D(#207811,#20,#14);
#207850=IFCCIRCLE(#207849,0.015);
#207851=IFCTRIMMEDCURVE(#207850,(#207808),(#207805),.T.,.CARTESIAN.);
#207854=IFCEDGECURVE(#207810,#207807,#207851,.T.);
#207855=IFCAXIS2PLACEMENT3D(#207833,#22,#14);
#207856=IFCCIRCLE(#207855,0.035);
#207857=IFCTRIMMEDCURVE(#207856,(#207819),(#207830),.T.,.CARTESIAN.);
#207860=IFCEDGECURVE(#207821,#207832,#207857,.T.);
#207861=IFCORIENTEDEDGE(*,*,#207840,.T.);
#207862=IFCORIENTEDEDGE(*,*,#207860,.T.);
#207863=IFCEDGELOOP((#207861,#207862));
#207865=IFCFACEOUTERBOUND(#207863,.T.);
#207866=IFCAXIS2PLACEMENT3D(#207833,#22,#16);
#207867=IFCPLANE(#207866);
#207868=IFCADVANCEDFACE((#207865),#207867,.T.);
#207870=IFCORIENTEDEDGE(*,*,#207854,.T.);
#207871=IFCORIENTEDEDGE(*,*,#207818,.T.);
#207872=IFCEDGELOOP((#207870,#207871));
#207874=IFCFACEOUTERBOUND(#207872,.T.);
#207875=IFCAXIS2PLACEMENT3D(#207811,#20,#16);
#207876=IFCPLANE(#207875);
#207877=IFCADVANCEDFACE((#207874),#207876,.T.);
#207879=IFCORIENTEDEDGE(*,*,#207818,.F.);
#207880=IFCORIENTEDEDGE(*,*,#207829,.T.);
#207881=IFCORIENTEDEDGE(*,*,#207840,.F.);
#207882=IFCORIENTEDEDGE(*,*,#207848,.T.);
#207883=IFCEDGELOOP((#207879,#207880,#207881,#207882));
#207885=IFCFACEOUTERBOUND(#207883,.T.);
#207886=IFCCARTESIANPOINT((0.0523449901289267,0.0615952722359162,0.329999999999992));
#207888=IFCCARTESIANPOINT((0.071595272235916,0.0615952722359163,0.129999999999993));
#207890=IFCCARTESIANPOINT((0.0523449901289267,0.0576682814189289,0.329999999999992));
#207892=IFCCARTESIANPOINT((0.071595272235916,0.0524322936629461,0.129999999999993));
#207894=IFCCARTESIANPOINT((0.0490991645022952,0.0498455642088134,0.329999999999992));
#207896=IFCCARTESIANPOINT((0.0640216791071089,0.0341792868393431,0.129999999999993));
#207898=IFCCARTESIANPOINT((0.0373449901289268,0.0449701262494675,0.329999999999992));
#207900=IFCCARTESIANPOINT((0.0365952722359162,0.0228032649342028,0.129999999999993));
#207902=IFCCARTESIANPOINT((0.0255908157555585,0.0498455642088133,0.329999999999992));
#207904=IFCCARTESIANPOINT((0.00916886536472338,0.0341792868393428,0.129999999999993));
#207906=IFCCARTESIANPOINT((0.0223449901289268,0.0576682814189288,0.329999999999992));
#207908=IFCCARTESIANPOINT((0.00159527223591604,0.0524322936629457,0.129999999999993));
#207910=IFCCARTESIANPOINT((0.0223449901289267,0.061595272235916,0.329999999999992));
#207912=IFCCARTESIANPOINT((0.00159527223591597,0.0615952722359159,0.129999999999993));
#207914=IFCRATIONALBSPLINESURFACEWITHKNOTS(3,1,((#207886,#207888),(#207890,#207892),(#207894,#207896),(#207898,#207900),(#207902,#207904),(#207906,#207908),(#207910,#207912)),.RULED_SURF.,.F.,.F.,.U.,(4,1,1,1,4),(2,2),(0.,0.25,0.5,0.75,1.),(0.,1.),.UNSPECIFIED.,((1.,1.),(1.,1.),(1.,1.),(1.,1.),(1.,1.),(1.,1.),(1.,1.)));
#207935=IFCADVANCEDFACE((#207885),#207914,.T.);
#207937=IFCORIENTEDEDGE(*,*,#207854,.F.);
#207938=IFCORIENTEDEDGE(*,*,#207848,.F.);
#207939=IFCORIENTEDEDGE(*,*,#207860,.F.);
#207940=IFCORIENTEDEDGE(*,*,#207829,.F.);
#207941=IFCEDGELOOP((#207937,#207938,#207939,#207940));
#207943=IFCFACEOUTERBOUND(#207941,.T.);
#207944=IFCCARTESIANPOINT((0.0223449901289267,0.0615952722359161,0.329999999999992));
#207946=IFCCARTESIANPOINT((0.001595272235916,0.0615952722359162,0.129999999999993));
#207948=IFCCARTESIANPOINT((0.0223449901289267,0.0655222630529034,0.329999999999992));
#207950=IFCCARTESIANPOINT((0.001595272235916,0.0707582508088864,0.129999999999993));
#207952=IFCCARTESIANPOINT((0.0255908157555584,0.0733449802630189,0.329999999999992));
#207954=IFCCARTESIANPOINT((0.00916886536472321,0.0890112576324893,0.129999999999993));
#207956=IFCCARTESIANPOINT((0.0373449901289267,0.0782204182223647,0.329999999999992));
#207958=IFCCARTESIANPOINT((0.036595272235916,0.10038727953763,0.129999999999993));
#207960=IFCCARTESIANPOINT((0.0490991645022952,0.073344980263019,0.329999999999993));
#207962=IFCCARTESIANPOINT((0.0640216791071088,0.0890112576324894,0.129999999999993));
#207964=IFCCARTESIANPOINT((0.0523449901289267,0.0655222630529034,0.329999999999992));
#207966=IFCCARTESIANPOINT((0.071595272235916,0.0707582508088865,0.129999999999993));
#207968=IFCCARTESIANPOINT((0.0523449901289267,0.0615952722359162,0.329999999999992));
#207970=IFCCARTESIANPOINT((0.071595272235916,0.0615952722359163,0.129999999999993));
#207972=IFCRATIONALBSPLINESURFACEWITHKNOTS(3,1,((#207944,#207946),(#207948,#207950),(#207952,#207954),(#207956,#207958),(#207960,#207962),(#207964,#207966),(#207968,#207970)),.RULED_SURF.,.F.,.F.,.U.,(4,1,1,1,4),(2,2),(0.,0.25,0.5,0.75,1.),(0.,1.),.UNSPECIFIED.,((1.,1.),(1.,1.),(1.,1.),(1.,1.),(1.,1.),(1.,1.),(1.,1.)));
#207993=IFCADVANCEDFACE((#207943),#207972,.T.);
#207995=IFCCLOSEDSHELL((#207868,#207877,#207935,#207993));
#207997=IFCADVANCEDBREP(#207995);
`;

test("kleine_Wohnung #207997: the volume of its B-spline faces, not of the circles bounding them, and a note saying so", () => {
  const text = `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${KW207997.trim()}\nENDSEC;\nEND-ISO-10303-21;\n`;
  const m = parseStep(text);
  const geo = new Geometry(m);
  const s = geo.item(207997);
  // the faces' volume, integrated exactly: each face is ruled (linear from
  // cap to cap), so a section's area is quadratic in height and Simpson's
  // rule on three sections (each 40,000 points round the two cubics) is
  // exact: 4.131503e-4 m3 (eval/off-edges.mjs)
  close(Math.abs(solidVolume(s)), 4.131503e-4, 2e-5);
  // the circular frustum its edges describe, pi h (R^2 + R r + r^2) / 3, is
  // IfcOpenShell's 4.1364e-4, 0.12% more: not what the faces enclose
  const circular = Math.PI * 0.2 * (0.035 ** 2 + 0.035 * 0.015 + 0.015 ** 2) / 3;
  assert.ok(Math.abs(solidVolume(s)) < circular * (1 - 1e-3));
  const oe = offEdges([{ faces: geo.advancedShellLoops(m.entities.get(207997).args[0]) }]);
  close(oe.max, 4.2e-5, 0.05);
  // the bound covers the gap to the circular figure
  assert.ok(circular - Math.abs(solidVolume(s)) <= oe.bound);
  assert.ok(s.notes.some((n) => /0\.042 mm off the edges/.test(n)), s.notes.join("; "));
});

