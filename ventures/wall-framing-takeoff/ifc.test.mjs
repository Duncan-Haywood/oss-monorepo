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
