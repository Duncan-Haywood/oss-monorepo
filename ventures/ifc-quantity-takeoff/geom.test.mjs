// Unit tests for geom.mjs pieces the end-to-end engine tests reach only
// through whole files: section profiles, 2D transformation operators, the
// ear clipper and loop clean-up. Added by the 2026-11-21 red-team run, each
// one for a seeded fault the suite let through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStep } from "./step.mjs";
import { Geometry, Unresolved, apply, earClip, signedArea, solidVolume } from "./geom.mjs";

const file = (body) => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;\n${body}\nENDSEC;END-ISO-10303-21;`;
const geometry = (body) => new Geometry(parseStep(file(body)));
const area = (loops) => loops.reduce((x, l) => x + l.s * Math.abs(signedArea(l.pts)), 0);

test("Z section: two flanges and the web between them, point symmetric about the centre", () => {
  // depth 200, flange width 80, web 6, flange 10
  const g = geometry("#1=IFCZSHAPEPROFILEDEF(.AREA.,$,$,200.,80.,6.,10.,$,$);");
  const [loop] = g.profile(1);
  assert.equal(area([loop]), 2 * 80 * 10 + (200 - 2 * 10) * 6);
  // a Z is symmetric under a half turn: every point's opposite is a point too
  for (const [x, y] of loop.pts) assert.ok(loop.pts.some((q) => q[0] === -x && q[1] === -y), `no opposite for (${x}, ${y})`);
});

test("a 2D transformation operator scales z by its one scale, like x and y", () => {
  // a mapped item may place 3D geometry with a 2D operator: z has to stay a unit axis
  const g = geometry(`#1=IFCCARTESIANPOINT((10.,20.));
#2=IFCCARTESIANTRANSFORMATIONOPERATOR2D($,$,#1,1.);
#3=IFCCARTESIANTRANSFORMATIONOPERATOR2D($,$,#1,2.);`);
  assert.deepEqual(apply(g.operator(2), [1, 1, 1]), [11, 21, 1]);
  assert.deepEqual(apply(g.operator(3), [1, 1, 1]), [12, 22, 2]);
});

test("a derived or composite profile that refers to itself is unresolved, not a stack overflow", () => {
  const g = geometry(`#1=IFCDERIVEDPROFILEDEF(.AREA.,$,#1,#2,$);
#2=IFCCARTESIANTRANSFORMATIONOPERATOR2D($,$,#3,1.);
#3=IFCCARTESIANPOINT((0.,0.));
#4=IFCCOMPOSITEPROFILEDEF(.AREA.,$,(#4),$);`);
  for (const ref of [1, 4]) assert.throws(() => g.profile(ref), (e) => e instanceof Unresolved && /profile nesting/.test(e.message));
  assert.deepEqual(g.sectionVariants(1), []);
});

test("earClip: the triangles of a concave polygon away from the origin cover it exactly, all counter-clockwise", () => {
  // an L of area 5 (3 x 1 foot, 1 x 2 upright) placed off the diagonal, so x and y differ at every point
  const P = [[10, 1], [13, 1], [13, 2], [11, 2], [11, 4], [10, 4]];
  const tris = earClip(P);
  assert.equal(tris.length, P.length - 2);
  let sum = 0;
  for (const t of tris) {
    const a = signedArea(t.map((i) => P[i]));
    assert.ok(a > 0, `triangle ${t} has signed area ${a}`);
    sum += a;
  }
  assert.ok(Math.abs(sum - 5) < 1e-12, `triangles sum to ${sum}`);
});

test("an arbitrary profile drops a point written twice in a row, even below one unit from the origin", () => {
  // metre files keep most profile points under 1: the repeat must still go
  const g = geometry(`#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCCARTESIANPOINT((0.5,0.));
#3=IFCCARTESIANPOINT((0.5,0.));
#4=IFCCARTESIANPOINT((0.5,0.25));
#5=IFCCARTESIANPOINT((0.,0.25));
#6=IFCPOLYLINE((#1,#2,#3,#4,#5,#1));
#7=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#6);`);
  const [loop] = g.profile(7);
  assert.deepEqual(loop.pts, [[0, 0], [0.5, 0], [0.5, 0.25], [0, 0.25]]);
});

test("every entity that can refer to itself (placement, curve, profile, mapped item, boolean) ends unresolved, never a stack overflow", () => {
  // a malformed or hostile file can close any of these loops; each recursive
  // reader needs its own depth guard, and a new one should join this list
  const g = geometry(`#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCREPRESENTATIONMAP(#1,#3);
#3=IFCSHAPEREPRESENTATION($,'Body','MappedRepresentation',(#4));
#4=IFCMAPPEDITEM(#2,#5);
#5=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#1,1.,$);
#6=IFCLOCALPLACEMENT(#6,#7);
#7=IFCAXIS2PLACEMENT3D(#1,$,$);
#8=IFCBOOLEANRESULT(.DIFFERENCE.,#8,#8);
#9=IFCCOMPOSITECURVE((#10),.F.);
#10=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#9);
#11=IFCDERIVEDPROFILEDEF(.AREA.,$,#11,#12,$);
#12=IFCCARTESIANTRANSFORMATIONOPERATOR2D($,$,#13,1.);
#13=IFCCARTESIANPOINT((0.,0.));`);
  for (const [what, read] of [
    ["object placement", () => g.objectPlacement(6)],
    ["composite curve", () => g.curve(9)],
    ["derived profile", () => g.profile(11)],
    ["mapped item", () => g.representation(3)],
    ["boolean", () => g.item(8)],
  ]) assert.throws(read, (e) => e instanceof Unresolved, what);
});

// Branches the 2026-11-22 quality audit found untested (seeded mutants
// survived): an ellipse's semi-axis ratio, a revolve axis that does not pass
// through the origin, and the CENTI length prefix.
test("audit 2026-11-22: ellipse profile, offset revolve axis and centimetre units", async () => {
  const { parseStep } = await import("./step.mjs");
  const { takeoff } = await import("./qto.mjs");
  const file = (unit, body) => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCSIUNIT(*,.LENGTHUNIT.,${unit},.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCAXIS2PLACEMENT2D(#10,$);
#16=IFCDIRECTION((0.,0.,1.));
#17=IFCDIRECTION((0.,1.,0.));
${body}
#22=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#21));
#23=IFCPRODUCTDEFINITIONSHAPE($,$,(#22));
#24=IFCCOLUMN('1YvctVUKr0kugbFTf53O9A',$,'c',$,$,#12,#23,'C1');
ENDSEC;END-ISO-10303-21;`;
  const vol = (unit, body) => takeoff(parseStep(file(unit, body))).rows[0].computed.gross;
  // ellipse, semi-axes 2 and 1, extruded 1: pi x 2 x 1
  const ell = vol("$", "#20=IFCELLIPSEPROFILEDEF(.AREA.,'e',#13,2.,1.);\n#21=IFCEXTRUDEDAREASOLID(#20,#11,#16,1.);");
  assert.ok(Math.abs(ell - 2 * Math.PI) / (2 * Math.PI) < 1e-3, `ellipse ${ell}`);
  // a 1 x 1 square centred 3 from the origin, revolved a full turn about the
  // y axis moved to x = 1: radius 2, so 1 x 2 x 2 pi (about the origin: 6 pi)
  const rev = vol("$", `#18=IFCCARTESIANPOINT((3.,0.));
#19=IFCAXIS2PLACEMENT2D(#18,$);
#20=IFCRECTANGLEPROFILEDEF(.AREA.,'r',#19,1.,1.);
#25=IFCCARTESIANPOINT((1.,0.,0.));
#26=IFCAXIS1PLACEMENT(#25,#17);
#21=IFCREVOLVEDAREASOLID(#20,#11,#26,6.283185307179586);`);
  assert.ok(Math.abs(rev - 4 * Math.PI) < 1e-6, `revolve ${rev}`);
  // a 100 x 100 x 100 cm block is a cubic metre
  const cm = vol(".CENTI.", "#20=IFCRECTANGLEPROFILEDEF(.AREA.,'r',#13,100.,100.);\n#21=IFCEXTRUDEDAREASOLID(#20,#11,#16,100.);");
  assert.ok(Math.abs(cm - 1) < 1e-9, `centimetre ${cm}`);
});

// 2026-11-24 red-team run: five seeded faults in geom.mjs escaped the suite.
test("earClip: a comb with three teeth is cut into triangles that cover it", () => {
  // three 1-wide teeth 2 high on a 5 x 1 base: area 5 + 3 x 2 = 11
  const P = [[0, 0], [5, 0], [5, 3], [4, 3], [4, 1], [3, 1], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]];
  const tris = earClip(P);
  assert.equal(tris.length, P.length - 2);
  let sum = 0;
  for (const t of tris) {
    const a = signedArea(t.map((i) => P[i]));
    assert.ok(a > 0, `triangle ${t} has signed area ${a}`);
    sum += a;
  }
  assert.ok(Math.abs(sum - 11) < 1e-12, `triangles sum to ${sum}`);
});

test("a line trimmed by parameters runs from origin + t1 x vector to origin + t2 x vector", () => {
  const g = geometry(`#1=IFCCARTESIANPOINT((1.,2.));
#2=IFCDIRECTION((1.,0.));
#3=IFCVECTOR(#2,2.);
#4=IFCLINE(#1,#3);
#5=IFCTRIMMEDCURVE(#4,(IFCPARAMETERVALUE(2.)),(IFCPARAMETERVALUE(5.)),.T.,.PARAMETER.);`);
  assert.deepEqual(g.curve(5), [[5, 2], [11, 2]]);
});

test("an indexed poly curve's arc through three points stays on their circle", () => {
  // centre (1, 1), radius 1: from (2, 1) through (1, 2) to (0, 1)
  const g = geometry(`#1=IFCCARTESIANPOINTLIST2D(((2.,1.),(1.,2.),(0.,1.)));
#2=IFCINDEXEDPOLYCURVE(#1,(IFCARCINDEX((1,2,3))),.F.);`);
  const pts = g.curve(2);
  assert.ok(pts.length > 3);
  for (const [x, y] of pts) assert.ok(Math.abs(Math.hypot(x - 1, y - 1) - 1) < 1e-9, `(${x}, ${y}) is off the circle`);
  assert.ok(pts.every(([, y]) => y >= 1 - 1e-9), "the arc goes over the top, through (1, 2)");
});

test("T section: the flange and the web below it", () => {
  // depth 300, flange width 200, web 10, flange 20
  const g = geometry("#1=IFCTSHAPEPROFILEDEF(.AREA.,$,$,300.,200.,10.,20.,$,$,$,$,$);");
  const [loop] = g.profile(1);
  assert.equal(area([loop]), 200 * 20 + (300 - 20) * 10);
  for (const [x, y] of loop.pts) assert.ok(loop.pts.some((q) => q[0] === -x && q[1] === y), `no mirror for (${x}, ${y})`);
});

test("a polygonal bounded half space placed off the origin cuts only inside its boundary's prism", () => {
  // a 10 x 10 x 10 block less the part below z = 5 inside a 2 x 2 square centred at (3, 0)
  const g = geometry(`#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,10.,10.);
#4=IFCDIRECTION((0.,0.,1.));
#5=IFCEXTRUDEDAREASOLID(#3,#2,#4,10.);
#6=IFCCARTESIANPOINT((0.,0.,5.));
#7=IFCAXIS2PLACEMENT3D(#6,$,$);
#8=IFCPLANE(#7);
#9=IFCCARTESIANPOINT((3.,0.,0.));
#10=IFCAXIS2PLACEMENT3D(#9,$,$);
#11=IFCCARTESIANPOINT((-1.,-1.));
#12=IFCCARTESIANPOINT((1.,-1.));
#13=IFCCARTESIANPOINT((1.,1.));
#14=IFCCARTESIANPOINT((-1.,1.));
#15=IFCPOLYLINE((#11,#12,#13,#14,#11));
#16=IFCPOLYGONALBOUNDEDHALFSPACE(#8,.T.,#10,#15);
#17=IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#5,#16);`);
  assert.ok(Math.abs(solidVolume(g.item(17)) - (1000 - 2 * 2 * 5)) < 1e-9);
});

// Toe (edge) radii on parametric steel sections, 2026-11-24
// (eval/edge-radii-2026-11-24.md). A 90-degree corner rounded by radius r
// loses (or, at a re-entrant root, gains) r^2 (1 - pi/4); the arcs are drawn as
// chords, so allow a little under 0.1 mm2.
const q = 1 - Math.PI / 4;
const near = (a, b, tol = 0.1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("L section: EdgeRadius rounds each leg's toe on its inner side, not the outer corners", () => {
  // Mini Project's L200/100/10: root 15, toes 7.5; EN 10056-1 lists 29.2 cm2
  const g = geometry("#1=IFCLSHAPEPROFILEDEF(.AREA.,'L200/100/10',$,200.,100.,10.,15.,7.5,$,$,$);");
  const [loop] = g.profile(1);
  near(area([loop]), 200 * 10 + 90 * 10 + 15 ** 2 * q - 2 * 7.5 ** 2 * q);
  near(area([loop]) / 100, 29.24, 0.01);
  // the heel and the two outer toe corners stay sharp
  for (const p of [[-50, -100], [50, -100], [-50, 100]]) assert.ok(loop.pts.some((x) => x[0] === p[0] && x[1] === p[1]), `no corner at ${p}`);
  // the inner toe corners are rounded away
  for (const p of [[50, -90], [-40, 100]]) assert.ok(!loop.pts.some((x) => Math.hypot(x[0] - p[0], x[1] - p[1]) < 1e-9), `sharp toe at ${p}`);
  // "no edge radii" is offered as a simplified section (root kept, toes square)
  const v = g.sectionVariants(1).find((x) => x.label === "no edge radii");
  assert.ok(v);
  near(v.ratio * area([loop]), 2900 + 225 * q);
});

test("I, U, T and Z sections round their toes by their edge radii", () => {
  // I: 4 flange tips (FlangeEdgeRadius 4), root 10
  let g = geometry("#1=IFCISHAPEPROFILEDEF(.AREA.,$,$,100.,200.,6.,10.,10.,4.,$);");
  near(area(g.profile(1)), 2 * 100 * 10 + 180 * 6 + 4 * 100 * q - 4 * 16 * q);
  // U: 2 flange toes (EdgeRadius 5), root 8
  g = geometry("#1=IFCUSHAPEPROFILEDEF(.AREA.,$,$,200.,75.,8.,11.,8.,5.,$);");
  near(area(g.profile(1)), 2 * 75 * 11 + 178 * 8 + 2 * 64 * q - 2 * 25 * q);
  // T: 2 flange tips (6), both corners of the web's foot (3), root 10
  g = geometry("#1=IFCTSHAPEPROFILEDEF(.AREA.,$,$,300.,200.,10.,20.,10.,6.,3.,$,$);");
  near(area(g.profile(1)), 200 * 20 + 280 * 10 + 2 * 100 * q - 2 * 36 * q - 2 * 9 * q);
  // Z: roots (FilletRadius 8) and toes (EdgeRadius 4) were both left out before
  g = geometry("#1=IFCZSHAPEPROFILEDEF(.AREA.,$,$,200.,80.,6.,10.,8.,4.);");
  near(area(g.profile(1)), 2 * 80 * 10 + 180 * 6 + 2 * 64 * q - 2 * 16 * q);
});

test("a notched L200/100/10 (Mini Project's KOKER #10087) has the exact volume, toes included", () => {
  // the angle 2630 long, less a 100 x 150 notch 515 long that takes the top
  // 50 mm of the long leg over the last 455.85 mm: IfcOpenShell 0.00747 m3
  const g = geometry(`#1=IFCCARTESIANPOINT((0.,0.));
#2=IFCDIRECTION((1.,0.));
#3=IFCAXIS2PLACEMENT2D(#1,#2);
#4=IFCLSHAPEPROFILEDEF(.AREA.,'L200/100/10',#3,200.,100.,10.,15.,7.5,$,$,$);
#5=IFCCARTESIANPOINT((2630.,0.,0.));
#6=IFCDIRECTION((-1.,0.,0.));
#7=IFCDIRECTION((0.,-1.,0.));
#8=IFCAXIS2PLACEMENT3D(#5,#6,#7);
#9=IFCDIRECTION((0.,0.,1.));
#10=IFCEXTRUDEDAREASOLID(#4,#8,#9,2630.);
#11=IFCRECTANGLEPROFILEDEF(.AREA.,'PL150*100',#3,100.,150.);
#12=IFCCARTESIANPOINT((2689.14889348392,0.,125.));
#13=IFCAXIS2PLACEMENT3D(#12,#6,#7);
#14=IFCEXTRUDEDAREASOLID(#11,#13,#9,515.);
#15=IFCBOOLEANRESULT(.DIFFERENCE.,#10,#14);`);
  const section = 2900 + 225 * q - 2 * 56.25 * q;
  const notch = (50 * 10 - 56.25 * q) * (2630 - (2689.14889348392 - 515));
  const v = solidVolume(g.item(15));
  assert.ok(Math.abs(v - (section * 2630 - notch)) < 40, `${v} vs ${section * 2630 - notch}`);
});
