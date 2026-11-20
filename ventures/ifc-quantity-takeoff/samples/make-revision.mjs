// Writes samples/sample-office-rev2.ifc: the next revision of
// samples/sample-office.ifc, with one change of each kind the change report
// (diff.mjs) names, every one worked by hand (engine.test.mjs checks them).
// Run after make-sample.mjs: node samples/make-revision.mjs
//
//   Wall A   door opening widened 1000 -> 1200 mm: NetVolume 2.58 -> 3.0 -
//            1.2 x 0.2 x 2.1 = 2.496 m3, NetSideArea 12.9 -> 15 - 2.52 = 12.48
//            m2; its box is unchanged, so it is a quantity change only
//   Wall B   deleted (removed)
//   Slab     250 -> 300 mm thick, top kept at floor level: 5.0 -> 6.0 m3
//            (reshaped: its box grows 50 mm down)
//   Column   re-exported with a new GlobalId, Tag 4001 kept (matched by Tag,
//            otherwise unchanged)
//   Beam     moved 1000 mm along y (moved, same quantities)
//   Column 2 a second round column, Tag 4002, at (0, 4000) (added):
//            pi x 0.15^2 x 3 = 0.212058 m3

import { readFileSync, writeFileSync } from "node:fs";

let t = readFileSync(new URL("./sample-office.ifc", import.meta.url), "utf8");
const swap = (from, to) => {
  if (!t.includes(from)) throw new Error(`make-revision: not found: ${from}`);
  t = t.replace(from, to);
};
const line = (id) => {
  const m = t.match(new RegExp(`^#${id}=.*;$`, "m"));
  if (!m) throw new Error(`make-revision: no #${id}`);
  return m[0];
};

swap("FILE_NAME('sample-office.ifc','2026-11-19T00:00:00'", "FILE_NAME('sample-office-rev2.ifc','2026-11-20T00:00:00'");
// Wall A: wider door opening, stored net figures updated as an exporter would
swap("#117=IFCRECTANGLEPROFILEDEF(.AREA.,$,#118,1000.,400.);", "#117=IFCRECTANGLEPROFILEDEF(.AREA.,$,#118,1200.,400.);");
swap("#119=IFCCARTESIANPOINT((500.,0.));", "#119=IFCCARTESIANPOINT((600.,0.));");
swap("IFCQUANTITYVOLUME('NetVolume',$,$,2.58,$)", "IFCQUANTITYVOLUME('NetVolume',$,$,2.496,$)");
swap("IFCQUANTITYAREA('NetSideArea',$,$,12.9,$)", "IFCQUANTITYAREA('NetSideArea',$,$,12.48,$)");
// Wall B: gone, with its relationships
for (const id of [200, 234]) t = t.replace(line(id) + "\n", "");
t = t.replace(/#200,/g, "");
// Slab: 300 thick, top at 0
swap("#404=IFCCARTESIANPOINT((0.,0.,-250.));", "#404=IFCCARTESIANPOINT((0.,0.,-300.));");
swap("#406=IFCEXTRUDEDAREASOLID(#407,#21,#23,250.);", "#406=IFCEXTRUDEDAREASOLID(#407,#21,#23,300.);");
swap("IFCQUANTITYVOLUME('NetVolume',$,$,5.,$)", "IFCQUANTITYVOLUME('NetVolume',$,$,6.,$)");
// Column: a new GlobalId, the same Tag
const col = line(500);
t = t.replace(col, col.replace(/IFCCOLUMN\('[^']+'/, "IFCCOLUMN('2Rev2ColumnReExport001'"));
// Beam: 1 m along y
swap("#604=IFCCARTESIANPOINT((0.,2000.,2900.));", "#604=IFCCARTESIANPOINT((0.,3000.,2900.));");
// Column 2: added
const added = [
  "#700=IFCCOLUMN('2Rev2ColumnAdded000002',$,'Column 300',$,$,#701,#702,'4002',.COLUMN.);",
  "#701=IFCLOCALPLACEMENT(#51,#703);",
  "#703=IFCAXIS2PLACEMENT3D(#704,$,$);",
  "#704=IFCCARTESIANPOINT((0.,4000.,0.));",
  "#702=IFCPRODUCTDEFINITIONSHAPE($,$,(#705));",
  "#705=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#706));",
  "#706=IFCEXTRUDEDAREASOLID(#707,#21,#23,3000.);",
  "#707=IFCCIRCLEPROFILEDEF(.AREA.,$,#508,150.);",
].join("\n");
const cont = line(900);
t = t.replace(cont, cont.replace("#600)", "#600,#700)") + "\n" + added);
const mat = line(72);
t = t.replace(mat, mat.replace("#500)", "#500,#700)"));

writeFileSync(new URL("./sample-office-rev2.ifc", import.meta.url), t);
