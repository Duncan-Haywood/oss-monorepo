// IFC4X3 alignment curves and IfcLinearPlacement (alignment.mjs, geom.mjs
// objectPlacement). Checked on a real bridge too: eval/linear-placement-2026-11-22.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStep } from "./step.mjs";
import { Geometry, Unresolved, apply } from "./geom.mjs";
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
#4=IFCSEGMENTEDREFERENCECURVE((),.F.,$,$);
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
  assert.match(beam.computed.reason, /^placement: basis curve IFCSEGMENTEDREFERENCECURVE/);
});
