// Reinforcing bars swept along indexed curves with arcs, grid placements and
// fixed-reference sweeps (buildingSMART IFC4.3.x-sample-models,
// eval/bsi-samples-2026-11-22.md). Every expected figure is worked by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStep } from "./step.mjs";
import { takeoff, rowQuantities, prettyClass } from "./qto.mjs";
import { arcLength3 } from "./geom.mjs";

const file = (body, schema = "IFC4X3_ADD2") => `ISO-10303-21;HEADER;FILE_SCHEMA(('${schema}'));ENDSEC;DATA;\n${body}\nENDSEC;END-ISO-10303-21;`;
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("arcLength3: the arc from p through q to r", () => {
  // quarter circle of radius 2 about the origin, in a tilted plane
  const s = Math.SQRT1_2;
  close(arcLength3([2, 0, 0], [2 * s, 2 * s * s, 2 * s * s], [0, 2 * s, 2 * s]), Math.PI);
  // three quarters: through the far side
  close(arcLength3([1, 0, 0], [-1, 0, 0], [0, -1, 0]), 1.5 * Math.PI);
  // a semicircle
  close(arcLength3([1, 0, 0], [0, 1, 0], [-1, 0, 0]), Math.PI);
  // three points in a line: the straight run
  close(arcLength3([0, 0, 0], [1, 0, 0], [3, 0, 0]), 3);
});

// a U-bar: 1 m out, a 180 degree bend of radius 0.1 m, 1 m back; a 12 mm bar
const bar = (material) => `
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
#4=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(1.1,0.1,0.),(1.,0.2,0.),(0.,0.2,0.)),$);
#5=IFCINDEXEDPOLYCURVE(#4,(IFCLINEINDEX((1,2)),IFCARCINDEX((2,3,4)),IFCLINEINDEX((4,5))),.F.);
#6=IFCSWEPTDISKSOLID(#5,0.006,$,$,$);
#7=IFCSHAPEREPRESENTATION($,'Body','AdvancedSweptSolid',(#6));
#8=IFCPRODUCTDEFINITIONSHAPE($,$,(#7));
#9=IFCREINFORCINGBAR('0WUveBtSTDbunNjDLsuRn$',$,'U12',$,$,#3,#8,$,$,$,$,$,$,$);
#10=IFCMATERIAL('${material}',$,$);
#11=IFCRELASSOCIATESMATERIAL('3gfVO40P5EfQyKZ_bF0R$6',$,$,$,(#9),#10);`;

test("a reinforcing bar along line and arc segments: cut length and mass from the directrix", () => {
  const L = 2 + Math.PI * 0.1;
  const [r] = takeoff(parseStep(file(bar("ReinforcingSteel")))).rows;
  assert.equal(r.computed.status, "ok");
  close(r.computed.gross, Math.PI * 0.006 ** 2 * L);
  close(r.computed.length, L);
  const q = rowQuantities(r);
  close(q.length, L);
  assert.equal(q.lengthSource, "computed");
  // 12 mm bar: 0.888 kg/m in the bar tables (pi x 6^2 mm2 x 7,850 kg/m3)
  close(q.weight, Math.PI * 0.006 ** 2 * 7850 * L);
  close(q.weight / L, 0.888, 1e-3);
  assert.equal(q.weightSource, "density");
  // a glass-fibre bar is not given steel's density
  const [g] = takeoff(parseStep(file(bar("GFRP rebar")))).rows;
  assert.equal(rowQuantities(g).weight, null);
});

// a grid placed at (100, 0, 0): U axis "1" running east along y = 0, V axis
// "A" running north along x = 5; a 1 x 1 x 2 column on their crossing
const grid = (gridPlacement) => `
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
#4=IFCCARTESIANPOINT((100.,0.,0.));
#5=IFCAXIS2PLACEMENT3D(#4,$,$);
#6=IFCLOCALPLACEMENT(#3,#5);
#10=IFCCARTESIANPOINT((0.,0.));
#11=IFCCARTESIANPOINT((10.,0.));
#12=IFCPOLYLINE((#10,#11));
#13=IFCGRIDAXIS('1',#12,.T.);
#14=IFCCARTESIANPOINT((5.,-5.));
#15=IFCCARTESIANPOINT((5.,5.));
#16=IFCPOLYLINE((#14,#15));
#17=IFCGRIDAXIS('A',#16,.T.);
#18=IFCGRID('0fuUMCx0jFggWzjspLeC2b',$,$,$,$,#6,$,(#13),(#17),$,$);
#20=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1.,1.);
#21=IFCDIRECTION((0.,0.,1.));
#22=IFCEXTRUDEDAREASOLID(#20,#2,#21,2.);
#23=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#22));
#24=IFCPRODUCTDEFINITIONSHAPE($,$,(#23));
${gridPlacement}
#40=IFCCOLUMN('1YvctVUKr0kugbFTf53O9L',$,'c',$,$,#31,#24,$,$);`;

test("IfcGridPlacement: on the crossing of two grid axes, in the grid's placement", () => {
  // IFC4X3: PlacementRelTo first; no offsets
  let [r] = takeoff(parseStep(file(grid(`#30=IFCVIRTUALGRIDINTERSECTION((#13,#17),(0.,0.,0.));
#31=IFCGRIDPLACEMENT(#6,#30,$);`)))).rows;
  assert.equal(r.computed.status, "ok");
  close(r.computed.gross, 2);
  assert.deepEqual(r.box.map((x) => +x.toFixed(9)), [104.5, -0.5, 0, 105.5, 0.5, 2]);
  // IFC4 (no PlacementRelTo): the grid's own placement is found from the axis;
  // offsets: 1 to the left of axis 1 (north), 2 to the left of axis A (west), 3 up
  [r] = takeoff(parseStep(file(grid(`#30=IFCVIRTUALGRIDINTERSECTION((#13,#17),(1.,2.,3.));
#31=IFCGRIDPLACEMENT(#30,$);`), "IFC4"))).rows;
  assert.equal(r.computed.status, "ok");
  assert.deepEqual(r.box.map((x) => +x.toFixed(9)), [102.5, 0.5, 3, 103.5, 1.5, 5]);
  // RefDirection: x toward a second crossing turns the column
  [r] = takeoff(parseStep(file(grid(`#30=IFCVIRTUALGRIDINTERSECTION((#13,#17),(0.,0.,0.));
#32=IFCVIRTUALGRIDINTERSECTION((#13,#17),(3.,0.,0.));
#31=IFCGRIDPLACEMENT(#6,#30,#32);
#33=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4.,1.);
#34=IFCEXTRUDEDAREASOLID(#33,#2,#21,2.);
#35=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#34));
#36=IFCPRODUCTDEFINITIONSHAPE($,$,(#35));
#41=IFCCOLUMN('2YvctVUKr0kugbFTf53O9L',$,'turned',$,$,#31,#36,$,$);`)))).rows.filter((x) => x.name === "turned");
  // x points north (toward the crossing 3 m up axis A): the 4 m side runs north
  assert.deepEqual(r.box.map((x) => +x.toFixed(9)), [104.5, -2, 0, 105.5, 2, 2]);
});

test("IfcFixedReferenceSweptAreaSolid: the profile's x axis held toward FixedReference", () => {
  // a 2 x 1 profile in its first quadrant swept 10 m east along a polyline,
  // x held up: profile x runs up, profile y along T x X = east x up = south
  const ifc = file(`
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
#4=IFCCARTESIANPOINT((10.,0.,0.));
#5=IFCPOLYLINE((#1,#4));
#6=IFCCARTESIANPOINTLIST2D(((0.,0.),(2.,0.),(2.,1.),(0.,1.)),$);
#7=IFCINDEXEDPOLYCURVE(#6,$,$);
#8=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#7);
#9=IFCDIRECTION((0.,0.,1.));
#10=IFCFIXEDREFERENCESWEPTAREASOLID(#8,#2,#5,IFCLENGTHMEASURE(2.),IFCLENGTHMEASURE(8.),#9);
#11=IFCSHAPEREPRESENTATION($,'Body','AdvancedSweptSolid',(#10));
#12=IFCPRODUCTDEFINITIONSHAPE($,$,(#11));
#13=IFCBUILTELEMENT('2SHUdmA2r5V9jMd4cdzKgL',$,'kerb',$,$,#3,#12,$,$);`);
  const [r] = takeoff(parseStep(ifc)).rows;
  assert.equal(r.computed.status, "ok");
  close(r.computed.gross, 2 * 1 * 6);
  assert.deepEqual(r.box.map((x) => +x.toFixed(9)), [2, -1, 0, 8, 0, 2]);
  assert.equal(r.ifcClass, "IfcBuiltElement");
});

test("IFC4X3 class names read word by word", () => {
  assert.equal(prettyClass("IFCBUILTELEMENT"), "IfcBuiltElement");
  assert.equal(prettyClass("IFCGEOTECHNICALSTRATUM"), "IfcGeotechnicalStratum");
  assert.equal(prettyClass("IFCELEMENTASSEMBLY"), "IfcElementAssembly");
});
