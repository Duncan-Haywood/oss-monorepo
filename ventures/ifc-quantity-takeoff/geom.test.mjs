// Unit tests for geom.mjs pieces the end-to-end engine tests reach only
// through whole files: section profiles, 2D transformation operators, the
// ear clipper and loop clean-up. Added by the 2026-11-21 red-team run, each
// one for a seeded fault the suite let through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStep } from "./step.mjs";
import { Geometry, Unresolved, apply, earClip, signedArea } from "./geom.mjs";

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
