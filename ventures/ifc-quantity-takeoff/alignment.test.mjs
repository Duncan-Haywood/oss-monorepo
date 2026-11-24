// IFC4X3 alignment curves and IfcLinearPlacement (alignment.mjs, geom.mjs
// objectPlacement). Checked on a real bridge too: eval/linear-placement-2026-11-22.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStep } from "./step.mjs";
import { Geometry, Unresolved, apply, shellPlanArea } from "./geom.mjs";
import { AlignmentReader } from "./alignment.mjs";
import { takeoff } from "./qto.mjs";

const file = (body) => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4X3_ADD2'));ENDSEC;DATA;\n${body}\nENDSEC;END-ISO-10303-21;`;
const near = (a, b, tol, what) => {
  for (let i = 0; i < b.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= tol, `${what}: ${a} vs ${b}`);
};

// horizontal: 100 m east from the origin, then a 200 m arc turning left for
// 50 m (its parent circle drawn somewhere else entirely, entered a third of
// the way round), then a 200 m arc turning right (a ccw circle run backwards)
const R = 200, a = 50 / R;
const arcEnd = [100 + R * Math.sin(a), R * (1 - Math.cos(a))];
const H = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#4=IFCVECTOR(#2,1.);
#5=IFCLINE(#1,#4);
#6=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(100.),#5);
#7=IFCCARTESIANPOINT((100.,0.));
#8=IFCAXIS2PLACEMENT2D(#7,#2);
#9=IFCCARTESIANPOINT((-37.,512.));
#10=IFCDIRECTION((0.,1.));
#11=IFCAXIS2PLACEMENT2D(#9,#10);
#12=IFCCIRCLE(#11,200.);
#13=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#8,IFCLENGTHMEASURE(${(R * Math.PI) / 3}),IFCLENGTHMEASURE(50.),#12);
#14=IFCCARTESIANPOINT((${arcEnd[0]},${arcEnd[1]}));
#15=IFCDIRECTION((${Math.cos(a)},${Math.sin(a)}));
#16=IFCAXIS2PLACEMENT2D(#14,#15);
#17=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#16,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(-50.),#12);
#18=IFCCOMPOSITECURVE((#6,#13,#17),.F.);
`;
// vertical: 2% up from elevation 10 for 300 m (drawn in distance, elevation)
const g2 = 0.02;
const V = `
#20=IFCCARTESIANPOINT((0.,10.));
#21=IFCDIRECTION((1.,${g2}));
#22=IFCAXIS2PLACEMENT2D(#20,#21);
#23=IFCVECTOR(#21,1.);
#24=IFCLINE(#1,#23);
#25=IFCCURVESEGMENT(.CONTINUOUS.,#22,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(${300 * Math.hypot(1, g2)}),#24);
#26=IFCGRADIENTCURVE((#25),.F.,#18,$);
`;

test("curve segments: a line, a parent circle drawn elsewhere, and a circle run backwards", () => {
  const geo = new Geometry(parseStep(file(H)));
  const A = new AlignmentReader(geo);
  const C = A.composite(18);
  assert.equal(C.length, 200);
  near(C.at(50).p, [50, 0], 1e-12, "on the line");
  // the arc starts where the segment's Placement says, heading east, turning left
  near(C.at(100 + 25).p, [100 + R * Math.sin(25 / R), R * (1 - Math.cos(25 / R))], 1e-9, "on the left arc");
  near(C.at(150).p, arcEnd, 1e-9, "end of the left arc");
  near(C.at(150).t, [Math.cos(a), Math.sin(a)], 1e-12, "tangent at the end of the left arc");
  // run backwards, the same ccw circle turns right: the heading comes back to east
  near(C.at(200).t, [1, 0], 1e-12, "heading after the right arc");
  // past the end: straight on along the last tangent
  near(C.at(210).p, [C.at(200).p[0] + 10, C.at(200).p[1]], 1e-9, "carried past the end");
});

test("clothoid: the end point matches the Fresnel series to four terms each", () => {
  const geo = new Geometry(parseStep(file(`
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#4=IFCCLOTHOID(#3,100.);
#5=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(30.),#4);
#6=IFCCLOTHOID(#3,-100.);
#7=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(30.),#6);`)));
  const A = new AlignmentReader(geo);
  const s = 30, A2 = 100 * 100;
  const x = s - s ** 5 / (40 * A2 ** 2) + s ** 9 / (3456 * A2 ** 4) - s ** 13 / (599040 * A2 ** 6);
  const y = s ** 3 / (6 * A2) - s ** 7 / (336 * A2 ** 3) + s ** 11 / (42240 * A2 ** 5) - s ** 15 / (9676800 * A2 ** 7);
  near(A.segment(5).at(30).p, [x, y], 1e-12, "left-hand clothoid");
  near(A.segment(7).at(30).p, [x, -y], 1e-12, "a negative constant turns right");
  near(A.segment(5).at(30).t, [Math.cos(s * s / (2 * A2)), Math.sin(s * s / (2 * A2))], 1e-12, "tangent angle s^2/2A^2");
});

test("IfcLinearPlacement on a gradient curve: offsets in the tangent's frame, longitudinal as a straight step", () => {
  const body = `${H}${V}
#30=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(50.),2.,3.,1.,#26);
#31=IFCAXIS2PLACEMENTLINEAR(#30,$,$);
#32=IFCLINEARPLACEMENT($,#31,$);
#33=IFCCARTESIANPOINT((1000.,0.,0.));
#34=IFCAXIS2PLACEMENT3D(#33,$,$);
#35=IFCLOCALPLACEMENT($,#34);
#36=IFCLINEARPLACEMENT(#35,#31,$);`;
  const geo = new Geometry(parseStep(file(body)));
  const m = geo.objectPlacement(32);
  const c = 1 / Math.hypot(1, g2);
  const X = [c, 0, g2 * c], Z = [-g2 * c, 0, c];
  // station 50 on the line: (50, 0) at elevation 11, then 2 left, 3 "up" square to the grade, 1 along it
  const want = [0, 1, 2].map((i) => [50, 0, 11][i] + 2 * [0, 1, 0][i] + 3 * Z[i] + 1 * X[i]);
  near(apply(m, [0, 0, 0]), want, 1e-9, "origin");
  near([m[0], m[4], m[8]], X, 1e-12, "x along the grade");
  near([m[2], m[6], m[10]], Z, 1e-12, "z square to it");
  // PlacementRelTo carries it like a local placement
  near(apply(geo.objectPlacement(36), [0, 0, 0]), [want[0] + 1000, want[1], want[2]], 1e-9, "relative to a local placement");
});

test("on the arc, the station is measured along the horizontal and the frame turns with it", () => {
  const body = `${H}${V}
#30=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(125.),0.,0.,$,#26);
#31=IFCAXIS2PLACEMENTLINEAR(#30,$,$);
#32=IFCLINEARPLACEMENT($,#31,$);`;
  const m = new Geometry(parseStep(file(body))).objectPlacement(32);
  const t = 25 / R;
  near(apply(m, [0, 0, 0]), [100 + R * Math.sin(t), R * (1 - Math.cos(t)), 10 + 125 * g2], 1e-9, "origin on the arc");
  const c = 1 / Math.hypot(1, g2);
  near([m[0], m[4], m[8]], [Math.cos(t) * c, Math.sin(t) * c, g2 * c], 1e-12, "heading");
});

test("a curve it cannot draw: the cached CartesianPosition stands in, else the element alone is not read", () => {
  const pre = `#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
#4=IFCOFFSETCURVEBYDISTANCES($,(),$);
#5=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(10.),0.,0.,$,#4);
#6=IFCAXIS2PLACEMENTLINEAR(#5,$,$);
#7=IFCCARTESIANPOINT((4.,5.,6.));
#8=IFCAXIS2PLACEMENT3D(#7,$,$);
#9=IFCLINEARPLACEMENT($,#6,#8);
#10=IFCLINEARPLACEMENT($,#6,$);`;
  const geo = new Geometry(parseStep(file(pre)));
  near(apply(geo.objectPlacement(9), [0, 0, 0]), [4, 5, 6], 0, "cached position");
  assert.throws(() => geo.objectPlacement(10), Unresolved);

  // the same in a file: the beam on the unreadable placement is "not read", the column still counts
  const box = (id, pl) => `#${id}=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1.,1.);
#${id + 1}=IFCDIRECTION((0.,0.,1.));
#${id + 2}=IFCEXTRUDEDAREASOLID(#${id},#2,#${id + 1},2.);
#${id + 3}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${id + 2}));
#${id + 4}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${id + 3}));`;
  const ifc = file(`${pre}
${box(20, 3)}
#30=IFCCOLUMN('1YvctVUKr0kugbFTf53O9L',$,'c',$,$,#3,#24,$,$);
${box(40, 10)}
#50=IFCBEAM('2YvctVUKr0kugbFTf53O9L',$,'b',$,$,#10,#44,$,$);`);
  const { rows } = takeoff(parseStep(ifc));
  const col = rows.find((r) => r.id === 30), beam = rows.find((r) => r.id === 50);
  assert.equal(col.computed.status, "ok");
  assert.ok(Math.abs(col.computed.gross - 2) < 1e-9);
  assert.equal(beam.computed.status, "not read");
  assert.match(beam.computed.reason, /^placement: basis curve IFCOFFSETCURVEBYDISTANCES/);
});

// IfcSectionedSolidHorizontal: lofted between cross-sections along the directrix
const loft = (dir, sections, positions) => `
#900=IFCCARTESIANPOINT((0.,0.));
${sections.map((pts, i) => `${pts.map((p, j) => `#${1000 + i * 20 + j}=IFCCARTESIANPOINT((${p[0]},${p[1]}));`).join("\n")}
#${1000 + i * 20 + 19}=IFCPOLYLINE((${[...pts, pts[0]].map((_, j) => `#${1000 + i * 20 + (j % pts.length)}`).join(",")}));
#${1500 + i}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${1000 + i * 20 + 19});`).join("\n")}
${positions.map((d, i) => `#${1600 + i}=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(${d}),$,$,$,${dir});
#${1700 + i}=IFCAXIS2PLACEMENTLINEAR(#${1600 + i},$,$);`).join("\n")}
#1800=IFCSECTIONEDSOLIDHORIZONTAL(${dir},(${sections.map((_, i) => `#${1500 + i}`).join(",")}),(${positions.map((_, i) => `#${1700 + i}`).join(",")}));`;
const rect = (w, h) => [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];

test("sectioned solid on a straight 3D polyline: area x 3D length, box square to the climb", () => {
  // 30 m level, 0.4 m up: stations are 3D distances along it
  const body = `#50=IFCCARTESIANPOINT((0.,0.,0.));
#51=IFCCARTESIANPOINT((30.,0.,0.4));
#52=IFCPOLYLINE((#50,#51));
${loft("#52", [rect(2, 1), rect(2, 1)], [0, Math.hypot(30, 0.4)])}`;
  const s = new Geometry(parseStep(file(body))).item(1800);
  assert.ok(Math.abs(s.mesh - 2 * Math.hypot(30, 0.4)) < 1e-9, `volume ${s.mesh}`);
  assert.deepEqual(s.notes, []);
});

test("sectioned solid on an arc: Pappus, the centroid's side of the curve decides", () => {
  // the left-turning 200 m arc of H from station 100 to 150; a 2 x 1 section whose
  // centre sits 3 m left (profile x +3): the centroid path is R - 3 long per radian
  const left = rect(2, 1).map(([x, y]) => [x + 3, y]);
  const s = new Geometry(parseStep(file(`${H}${loft("#18", [left, left], [100, 150])}`))).item(1800);
  const want = 2 * 50 * (1 - 3 / R);
  assert.ok(Math.abs(s.mesh / want - 1) < 2e-5, `volume ${s.mesh} vs ${want}`);
});

test("a cross-section that twists (a crossfall turning over) is lofted exactly, and a station past the end is said", () => {
  // a 0.04 m course 10 m wide whose left edge rises 0.26 m between stations 0 and 25:
  // the volume is the integral of the interpolated section's area (prismatoid)
  const a = [[5, -0.1], [-5, -0.1], [-5, -0.14], [5, -0.14]];
  const b = [[5, -0.1], [-5, 0.16], [-5, 0.12], [5, -0.14]];
  const area = (p) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
  const mid = a.map((p, i) => [(p[0] + b[i][0]) / 2, (p[1] + b[i][1]) / 2]);
  const want = (25 / 6) * (area(a) + 4 * area(mid) + area(b));
  const body = `#50=IFCCARTESIANPOINT((0.,0.,0.));
#51=IFCCARTESIANPOINT((20.,0.,0.));
#52=IFCPOLYLINE((#50,#51));
${loft("#52", [a, b], [0, 25])}`;
  const s = new Geometry(parseStep(file(body))).item(1800);
  assert.ok(Math.abs(s.mesh / want - 1) < 1e-9, `volume ${s.mesh} vs ${want}`);
  assert.equal(s.notes.length, 1);
  assert.match(s.notes[0], /5\.000 m past the end of its directrix/);
});

// Cant: an IfcSegmentedReferenceCurve over a level, straight 200 m track.
// The right rail rises 0 to 0.15 m over 80 m on a cosine run-in (D(s) =
// L/A0 + L/A1 cos(pi s/L), as buildingSMART's sample text writes it), holds
// 0.15 m for 40 m (an IfcLine), and runs out linearly over 80 m (a clothoid,
// L times whose curvature is linear). Railhead distance 1.5 m: the full
// cant's roll is atan(0.15 / 1.5), its centreline raised half the cant.
const roll = Math.atan(0.15 / 1.5);
const CANT = `
#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#4=IFCVECTOR(#2,1.);
#5=IFCLINE(#1,#4);
#6=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#5);
#7=IFCCOMPOSITECURVE((#6),.F.);
#8=IFCCURVESEGMENT(.CONTINUOUS.,#3,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(200.),#5);
#9=IFCGRADIENTCURVE((#8),.F.,#7,$);
#10=IFCDIRECTION((1.,0.,0.));
#11=IFCDIRECTION((0.,0.,1.));
#12=IFCDIRECTION((0.,${Math.sin(roll)},${Math.cos(roll)}));
#13=IFCCARTESIANPOINT((0.,0.,0.));
#14=IFCAXIS2PLACEMENT3D(#13,#11,#10);
#15=IFCCOSINESPIRAL(#3,${-80 / 0.0375},${80 / 0.0375});
#16=IFCCURVESEGMENT(.CONTINUOUS.,#14,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(80.),#15);
#17=IFCCARTESIANPOINT((80.,0.075,0.));
#18=IFCAXIS2PLACEMENT3D(#17,#12,#10);
#19=IFCCURVESEGMENT(.CONTINUOUS.,#18,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(40.),#5);
#20=IFCCARTESIANPOINT((120.,0.075,0.));
#21=IFCAXIS2PLACEMENT3D(#20,#12,#10);
#22=IFCCLOTHOID(#3,500.);
#23=IFCCURVESEGMENT(.CONTINUOUS.,#21,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(80.),#22);
#24=IFCCARTESIANPOINT((200.,0.,0.));
#25=IFCAXIS2PLACEMENT3D(#24,#11,#10);
#26=IFCSEGMENTEDREFERENCECURVE((#16,#19,#23),.F.,#9,#25);
`;

test("cant: elevation, slope and roll follow each segment's function between its placement and the next", () => {
  const A = new AlignmentReader(new Geometry(parseStep(file(CANT))));
  const B = A.basis(26);
  assert.equal(B.length, 200);
  const D = (s) => 0.0375 - 0.0375 * Math.cos((Math.PI * s) / 80);
  for (const s of [0, 10, 20, 40, 60, 80]) {
    const c = B.cant(s);
    assert.ok(Math.abs(c.y - D(s)) < 1e-12, `D(${s}) ${c.y} vs ${D(s)}`);
    // theta moves linearly with D (the sample text), so the roll does too
    assert.ok(Math.abs(c.roll - (roll * D(s)) / 0.075) < 1e-12, `roll at ${s}`);
  }
  assert.ok(Math.abs(B.cant(40).dy - (0.0375 * Math.PI) / 80) < 1e-7, "slope at the run-in's middle");
  // the constant stretch on an IfcLine: no change
  for (const s of [80, 100, 120]) { assert.ok(Math.abs(B.cant(s).y - 0.075) < 1e-12); assert.ok(Math.abs(B.cant(s).roll - roll) < 1e-12); }
  // the clothoid run-out: linear to the EndPoint
  for (const s of [130, 160, 190, 200]) assert.ok(Math.abs(B.cant(s).y - 0.075 * (1 - (s - 120) / 80)) < 1e-12, `run-out at ${s}`);
  assert.ok(Math.abs(B.cant(160).dy + 0.075 / 80) < 1e-9, "run-out slope");
  // the 3D frame: raised by D, rolled about the tangent, the high (right) rail up
  near(B.frame(100).p, [100, 0, 0.075], 1e-12, "raised centreline");
});

test("cant: a linear placement's offsets and axes turn with the roll, and a sleeper on it is boxed tilted", () => {
  const sleeper = (id, d) => `
#${id}=IFCPOINTBYDISTANCEEXPRESSION(IFCLENGTHMEASURE(${d}),0.,0.,$,#26);
#${id + 1}=IFCAXIS2PLACEMENTLINEAR(#${id},$,$);
#${id + 2}=IFCLINEARPLACEMENT($,#${id + 1},$);
#${id + 3}=IFCEXTRUDEDAREASOLID(#901,#902,#11,0.2);
#${id + 4}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${id + 3}));
#${id + 5}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${id + 4}));
#${id + 6}=IFCBEAM('${id}vctVUKr0kugbFTf53O',$,'sleeper',$,$,#${id + 2},#${id + 5},$,$);`;
  const ifc = file(`${CANT}
#900=IFCCARTESIANPOINT((0.,0.));
#901=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,0.25,2.6);
#902=IFCAXIS2PLACEMENT3D(#13,$,$);
${sleeper(1000, 100)}
${sleeper(1100, 0)}`);
  const geo = new Geometry(parseStep(ifc));
  const M = geo.objectPlacement(1002);
  // 0.75 m to the left drops by 0.75 sin(roll); 1 m up leans to the left
  near(apply(M, [0, 0.75, 0]), [100, 0.75 * Math.cos(roll), 0.075 - 0.75 * Math.sin(roll)], 1e-12, "left rail");
  near(apply(M, [0, 0, 1]), [100, Math.sin(roll), 0.075 + Math.cos(roll)], 1e-12, "up");
  const { rows } = takeoff(parseStep(ifc));
  const on = rows.find((r) => r.id === 1006), off = rows.find((r) => r.id === 1106);
  for (const r of [on, off]) { assert.equal(r.computed.status, "ok"); assert.ok(Math.abs(r.computed.gross - 0.25 * 2.6 * 0.2) < 1e-9); }
  // the box: where the rolled 2.6 m sleeper reaches (its low end at the left rail), and a level one at the start
  const sn = Math.sin(roll), cs = Math.cos(roll);
  near(on.box, [99.875, -1.3 * cs, 0.075 - 1.3 * sn, 100.125, 1.3 * cs + 0.2 * sn, 0.075 + 1.3 * sn + 0.2 * cs], 1e-9, "tilted sleeper box");
  near(off.box, [-0.125, -1.3, 0, 0.125, 1.3, 0.2], 1e-9, "level sleeper box");
});

// IfcPolynomialCurve and the PGSuper vertical (eval/pgsuper-bridges-2026-11-24.md)
test("polynomial curve: a parabola's point at an arc length, by inverting the arc length integral", () => {
  const c = -0.000375, g0 = 0.04;
  const body = `#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#4=IFCPOLYNOMIALCURVE(#3,(0.,1.),(0.,${g0},${c}),$);`;
  const A = new AlignmentReader(new Geometry(parseStep(file(body))));
  const P = A.parent(4);
  // arc length of y = g0 u + c u^2 from 0 to 80, in closed form
  const S = (u) => { const t = g0 + 2 * c * u; return (t * Math.hypot(1, t) + Math.asinh(t)) / (4 * c); };
  const s = S(80) - S(0);
  near(P.at(s).p, [80, g0 * 80 + c * 6400], 1e-9, "end of the arc");
  const t = P.at(s).t, slope = g0 + 2 * c * 80;
  assert.ok(Math.abs(t[1] / t[0] - slope) < 1e-9, `tangent ${t}`);
  assert.ok(Math.abs(P.param(80) - s) < 1e-9, "parameter value to arc length");
  // z coefficients are a 3D curve the alignment reader does not draw
  const z = new AlignmentReader(new Geometry(parseStep(file(body.replace("$);", "(0.,1.));")))));
  assert.throws(() => z.parent(4), /z coefficients/);
});

test("PGSuper's vertical: a level parabola carrying its grade, lines graded by their sine, lengths as horizontal runs", () => {
  // from elevation 10: an 80 m parabola from +4% to -2%, then two 60 m lines
  // at -2%, then the zero-length closing segment PGSuper places at the last
  // one's start (so the last line takes the reading the first one showed)
  const c = (-0.02 - 0.04) / (2 * 80), z1 = 10 + 0.04 * 80 + c * 6400, gl = -0.02;
  const PV = `
#30=IFCCARTESIANPOINT((0.,10.));
#31=IFCAXIS2PLACEMENT2D(#30,#2);
#32=IFCAXIS2PLACEMENT2D(#1,#2);
#33=IFCPOLYNOMIALCURVE(#32,(0.,1.),(0.,0.04,${c}),$);
#34=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#31,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(80.),#33);
#35=IFCCARTESIANPOINT((80.,${z1}));
#36=IFCDIRECTION((${Math.sqrt(1 - gl * gl)},${gl}));
#37=IFCAXIS2PLACEMENT2D(#35,#36);
#38=IFCLINE(#1,#4);
#39=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#37,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(60.),#38);
#42=IFCCARTESIANPOINT((140.,${z1 + gl * 60}));
#43=IFCAXIS2PLACEMENT2D(#42,#36);
#44=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#43,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(60.),#38);
#40=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#43,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(0.),#38);
#41=IFCGRADIENTCURVE((#34,#39,#44,#40),.F.,#18,$);
`;
  const A = new AlignmentReader(new Geometry(parseStep(file(H + PV))));
  const B = A.basis(41);
  const want = (x) => (x <= 80 ? 10 + 0.04 * x + c * x * x : z1 + gl * (x - 80));
  for (const x of [0, 20, 40, 79.9, 80, 120, 199]) assert.ok(Math.abs(B.frame(x).p[2] - want(x)) < 1e-9, `z at ${x}: ${B.frame(x).p[2]} vs ${want(x)}`);
  assert.ok(Math.abs(B.frame(40).g - (0.04 + 2 * c * 40)) < 1e-9, "grade on the parabola");
  assert.equal(A.levelled, 1);
  assert.equal(A.runs, 3);
  // the IFC text's reading (a curve length, turned onto RefDirection) is kept where it meets the placements: V above
  const A2 = new AlignmentReader(new Geometry(parseStep(file(H + V))));
  assert.ok(Math.abs(A2.basis(26).frame(150).p[2] - (10 + g2 * 150)) < 1e-9);
  assert.equal(A2.runs ?? 0, 0);
  assert.equal(A2.levelled ?? 0, 0);
});

test("PGSuper's decks: cross-sections in absolute elevation on a gradient curve are moved down onto it", () => {
  const c = (-0.02 - 0.04) / (2 * 80);
  const z = (x) => 10 + 0.04 * x + c * x * x;
  const PV = `
#30=IFCCARTESIANPOINT((0.,10.));
#31=IFCAXIS2PLACEMENT2D(#30,#2);
#32=IFCAXIS2PLACEMENT2D(#1,#2);
#33=IFCPOLYNOMIALCURVE(#32,(0.,1.),(0.,0.04,${c}),$);
#34=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#31,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(80.),#33);
#35=IFCCARTESIANPOINT((80.,${z(80)}));
#36=IFCDIRECTION((${Math.sqrt(1 - 0.02 * 0.02)},-0.02));
#37=IFCAXIS2PLACEMENT2D(#35,#36);
#38=IFCLINE(#1,#4);
#39=IFCCURVESEGMENT(.CONTSAMEGRADIENT.,#37,IFCLENGTHMEASURE(0.),IFCLENGTHMEASURE(120.),#38);
#41=IFCGRADIENTCURVE((#34,#39),.F.,#18,$);
`;
  const deck = rect(8, 0.3).map(([x, y]) => [x, y - 0.3]);
  const at = (d) => deck.map(([x, y]) => [x, y + z(d)]);
  const rel = new Geometry(parseStep(file(H + PV + loft("#41", [deck, deck], [20, 60])))).item(1800);
  const abs = new Geometry(parseStep(file(H + PV + loft("#41", [at(20), at(60)], [20, 60])))).item(1800);
  assert.ok(Math.abs(abs.mesh / rel.mesh - 1) < 1e-12, `volume ${abs.mesh} vs ${rel.mesh}`);
  assert.ok(abs.notes.some((n) => /absolute elevation \(10\.\d\d to 11\.\d\d m\)/.test(n)), abs.notes.join("; "));
  assert.ok(!rel.notes.some((n) => /absolute elevation/.test(n)), rel.notes.join("; "));
});

test("sectioned solid: a section whose points meet (a haunch run to zero) is paired as written", () => {
  const a = [[-1, 0], [-0.2, -0.1], [0.2, -0.1], [1, 0], [1, 1], [-1, 1]];
  const b = [[-1, 0], [-0.2, 0], [-0.2 + 1e-12, 0], [1, 0], [1, 1], [-1, 1]];
  const area = (p) => Math.abs(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
  const mid = a.map((p, i) => [(p[0] + b[i][0]) / 2, (p[1] + b[i][1]) / 2]);
  const want = (20 / 6) * (area(a) + 4 * area(mid) + area(b));
  const body = `#50=IFCCARTESIANPOINT((0.,0.,0.));
#51=IFCCARTESIANPOINT((20.,0.,0.));
#52=IFCPOLYLINE((#50,#51));
${loft("#52", [a, b], [0, 20])}`;
  const s = new Geometry(parseStep(file(body))).item(1800);
  assert.ok(Math.abs(s.mesh / want - 1) < 1e-9, `volume ${s.mesh} vs ${want}`);
  assert.ok(s.notes.some((n) => /paired on their points as written/.test(n)), s.notes.join("; "));
});

test("a lofted deck's plan area is its top seen from above, crowned and climbing", () => {
  // a 2 m wide deck, crowned 0.05 m, 1 m deep under the crown, climbing 0.4 m over 30 m
  const crowned = [[-1, 0], [1, 0], [1, 0.95], [0, 1], [-1, 0.95]];
  const body = `#50=IFCCARTESIANPOINT((0.,0.,0.));
#51=IFCCARTESIANPOINT((30.,0.,0.4));
#52=IFCPOLYLINE((#50,#51));
${loft("#52", [crowned, crowned], [0, Math.hypot(30, 0.4)])}`;
  const s = new Geometry(parseStep(file(body))).item(1800);
  assert.equal(s.lofted, true);
  // the top (2 m x 30 m in plan, crown and climb whatever they are), plus the
  // far end face: square to the climbing tangent, it looks up by sin(climb)
  const plan = shellPlanArea(s, [0, 0, 1]);
  const want = 60 + 1.95 * (0.4 / Math.hypot(30, 0.4));
  assert.ok(Math.abs(plan - want) < 1e-9, `plan ${plan} vs ${want}`);
});
