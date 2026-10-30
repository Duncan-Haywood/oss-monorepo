import { test } from "node:test";
import assert from "node:assert/strict";
import { planFromIfc } from "./ifc.mjs";

// Hand-written IFC4 fragment (metres): a 10 m x 6 m house, the front wall placed
// with a rotated, offset storey placement; one partition; one door, one window.
const wallEnt = (n, x, y, rx, ry, len, name = "Wall") =>
  `#${n}0=IFCCARTESIANPOINT((${x},${y},0.));\n#${n}1=IFCDIRECTION((${rx},${ry},0.));\n#${n}2=IFCAXIS2PLACEMENT3D(#${n}0,$,#${n}1);\n#${n}3=IFCLOCALPLACEMENT(#900,#${n}2);\n` +
  `#${n}4=IFCCARTESIANPOINT((0.,0.));\n#${n}5=IFCCARTESIANPOINT((${len},0.));\n#${n}6=IFCPOLYLINE((#${n}4,#${n}5));\n#${n}7=IFCSHAPEREPRESENTATION(#1,'Axis','Curve2D',(#${n}6));\n#${n}8=IFCPRODUCTDEFINITIONSHAPE($,$,(#${n}7));\n` +
  `#${n}9=IFCWALLSTANDARDCASE('g${n}',#2,'${name}',$,$,#${n}3,#${n}8,$,.STANDARD.);\n`;
const ifc = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,$,$);
#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#800=IFCCARTESIANPOINT((2.,3.,0.));
#801=IFCAXIS2PLACEMENT3D(#800,$,$);
#900=IFCLOCALPLACEMENT($,#801);
${wallEnt(10, 0, 0, 1, 0, 10)}${wallEnt(11, 10, 0, 0, 1, 6)}${wallEnt(12, 10, 6, -1, 0, 10)}${wallEnt(13, 0, 6, 0, -1, 6)}${wallEnt(14, 4, 0, 0, 1, 6)}
#200=IFCCARTESIANPOINT((6.,0.,0.));
#201=IFCAXIS2PLACEMENT3D(#200,$,$);
#202=IFCLOCALPLACEMENT(#900,#201);
#203=IFCDOOR('d1',#2,'Door',$,$,#202,$,$,2.1,0.9,.DOOR.,.SINGLE_SWING_LEFT.,$);
#210=IFCCARTESIANPOINT((1.,6.,0.));
#211=IFCAXIS2PLACEMENT3D(#210,$,#212);
#212=IFCDIRECTION((1.,0.,0.));
#213=IFCLOCALPLACEMENT(#900,#211);
#214=IFCWINDOW('w1',#2,'Window',$,$,#213,$,$,1.2,1.8,.WINDOW.,.SINGLE_PANEL.,$);
ENDSEC;
END-ISO-10303-21;
`;

test("walls, a tee and openings come out of an IFC with a nested placement", () => {
  const r = planFromIfc(ifc);
  assert.ok(r.ok, r.errors?.join());
  assert.equal(r.stats.exterior, 4);
  assert.equal(r.stats.interior, 1);
  const lens = r.plan.walls.map((w) => Math.round(w.length));
  assert.deepEqual(lens.slice(0, 4).sort(), [236, 236, 394, 394].sort());
  const ops = r.plan.walls.flatMap((w) => w.openings ?? []);
  assert.deepEqual(ops.map((o) => o.kind).sort(), ["door", "window"]);
  assert.ok(ops.every((o) => o.width > 30));
});

test("a file that is not IFC, or has no readable walls, is refused with a reason", () => {
  assert.equal(planFromIfc("hello").ok, false);
  const r = planFromIfc("ISO-10303-21;\nDATA;\n#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);\nENDSEC;");
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /No IfcWall/);
});

test("feet from IfcConversionBasedUnit scale to inches", () => {
  const f = ifc.replace("#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", "#3=IFCCONVERSIONBASEDUNIT(#4,.LENGTHUNIT.,'FOOT',#5);");
  const r = planFromIfc(f);
  assert.ok(r.ok, r.errors?.join());
  assert.equal(Math.max(...r.plan.walls.map((w) => w.length)), 120);
});

const stepWall = (n, place, a, b) =>
  `#${n}0=IFCCARTESIANPOINT((${a}));#${n}1=IFCCARTESIANPOINT((${b}));#${n}2=IFCPOLYLINE((#${n}0,#${n}1));#${n}3=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#${n}2));#${n}4=IFCPRODUCTDEFINITIONSHAPE($,$,(#${n}3));#${n}5=IFCWALL('g',$,'W; x',$,$,${place},#${n}4,$,$);`;
const head = "ISO-10303-21;DATA;#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);#800=IFCCARTESIANPOINT((0.,0.,0.));#801=IFCDIRECTION((0.,1.,0.));#802=IFCAXIS2PLACEMENT3D(#800,$,#801);#900=IFCLOCALPLACEMENT($,#802);#901=IFCLOCALPLACEMENT($,$);";

test("a file written on one line (and a ';' inside a name) still reads every wall", () => {
  const r = planFromIfc(head + stepWall(10, "#901", "3.,4.", "3.,0.") + stepWall(20, "#900", "4.,0.", "4.,-3.") + "ENDSEC;END-ISO-10303-21;");
  assert.ok(r.ok, r.errors?.join());
  assert.equal(r.plan.walls.length, 2);
});

test("a rotated placement turns local y the right way, so the walls meet at the corner", () => {
  const r = planFromIfc(head + stepWall(10, "#901", "3.,4.", "3.,0.") + stepWall(20, "#900", "4.,0.", "4.,-3.") + "ENDSEC;");
  assert.deepEqual(r.plan.walls.map((w) => w.freeEnds), [1, 1]);
});

test("a rectangle profile with no position is centred on the placement origin", () => {
  const rect = (n, place, x) => `#${n}0=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${x},0.2);#${n}1=IFCEXTRUDEDAREASOLID(#${n}0,$,$,3.,2.8);#${n}2=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${n}1));#${n}3=IFCPRODUCTDEFINITIONSHAPE($,$,(#${n}2));#${n}4=IFCWALL('g',$,'R',$,$,${place},#${n}3,$,$);`;
  const r = planFromIfc(head + rect(10, "#901", "4.") + stepWall(20, "#901", "2.,0.", "2.,-3.") + "ENDSEC;");
  assert.ok(r.ok, r.errors?.join());
  assert.deepEqual(r.plan.walls.map((w) => w.freeEnds), [1, 1]);
  assert.ok(r.plan.walls.some((w) => Math.abs(w.length - 4 * 100 / 2.54) < 0.2));
});

test("opt.units overrides the unit in the file", () => {
  const r = planFromIfc(head + stepWall(10, "#901", "0.,0.", "400.,0.") + "ENDSEC;", { units: "cm" });
  assert.ok(r.ok, r.errors?.join());
  assert.ok(Math.abs(r.plan.walls[0].length - 400 / 2.54) < 0.2);
});

// Real files: buildingSMART's Simple-Scene house (CC BY 4.0, fixtures/BSI-LICENSE.md). Its four
// walls have no Axis and no extrusion: IFC 2x3 writes faceted B-reps, IFC 4.3 a triangulated face
// set. Both are 1.8 m, 4.2 m, 6.0 m and 3.8 m long in the file's millimetres. The 4.3 file also
// holds a second IfcSIUnit (metre, no prefix) outside the IfcUnitAssignment, which once made
// every length read 1000 times too long.
import { readFileSync } from "node:fs";
for (const f of ["ifc2x3", "ifc43"]) {
  test(`buildingSMART Simple-Scene (${f}): mesh walls read from their bounding box`, () => {
    const r = planFromIfc(readFileSync(new URL(`./fixtures/bsi-simple-scene-architecture-${f}.ifc`, import.meta.url), "utf8"));
    assert.ok(r.ok, r.errors?.join());
    const mm = r.plan.walls.map((w) => Math.round(w.length * 25.4)).sort((a, b) => a - b);
    assert.deepEqual(mm.map((v) => Math.round(v / 10) * 10), [1800, 3800, 4200, 6000]);
    assert.ok(r.notes.some((n) => /bounding box of the body mesh/.test(n)));
  });
}

test("buildingSMART's wall-with-opening-and-window: window size, offset and sill come from the file", () => {
  const r = planFromIfc(readFileSync(new URL("./fixtures/bsi-wall-with-opening-and-window-ifc4.ifc", import.meta.url), "utf8"));
  assert.ok(r.ok, r.errors?.join());
  assert.equal(r.plan.walls.length, 1);
  assert.ok(Math.abs(r.plan.walls[0].length - 3000 / 25.4) < 0.1);
  const [o] = r.plan.walls[0].openings;
  assert.equal(o.kind, "window");
  assert.ok(Math.abs(o.offset - 1000 / 25.4) < 0.1, "x = 1000 mm");
  assert.ok(Math.abs(o.width - 1000 / 25.4) < 0.1);
  assert.ok(Math.abs(o.height - 1000 / 25.4) < 0.1, "OverallHeight 1000 mm, not the 48 in default");
  assert.ok(Math.abs(o.headerHeight - o.height - 500 / 25.4) < 0.1, "sill 500 mm from the opening element's z");
  assert.ok(!r.notes.some((n) => /heights are defaults/.test(n)));
});

// Two storeys over one footprint: the upper walls duplicate the lower ones and must not merge into them.
const twoStorey = ifc.replace("ENDSEC;\nEND-ISO", () => `${wallEnt(30, 0, 0, 1, 0, 10)}${wallEnt(31, 10, 0, 0, 1, 6)}${wallEnt(32, 10, 6, -1, 0, 10)}${wallEnt(33, 0, 6, 0, -1, 6)}
#700=IFCBUILDINGSTOREY('s1',#2,'Ground',$,$,#900,$,$,.ELEMENT.,0.);
#701=IFCBUILDINGSTOREY('s2',#2,'Upper',$,$,#900,$,$,.ELEMENT.,2.7);
#710=IFCRELCONTAINEDINSPATIALSTRUCTURE('r1',#2,$,$,(#109,#119,#129,#139,#149,#203),#700);
#711=IFCRELCONTAINEDINSPATIALSTRUCTURE('r2',#2,$,$,(#309,#319,#329,#339,#214),#701);
ENDSEC;
END-ISO`);

test("a multi-storey IFC is read one storey at a time", () => {
  const all = planFromIfc(ifc);
  const g = planFromIfc(twoStorey);
  const u = planFromIfc(twoStorey, { storey: 2 });
  assert.ok(g.ok && u.ok);
  assert.equal(g.plan.walls.length, all.plan.walls.length);
  assert.equal(g.stats.openings, 1, "ground");
  assert.equal(u.plan.walls.length, 4);
  assert.equal(u.stats.openings, 1, "upper");
  assert.ok(g.notes.some((n) => /2 storeys/.test(n)));
  assert.equal(planFromIfc(twoStorey, { storey: "upper" }).plan.walls.length, 4);
  assert.equal(planFromIfc(twoStorey, { storey: 3 }).ok, false);
});
