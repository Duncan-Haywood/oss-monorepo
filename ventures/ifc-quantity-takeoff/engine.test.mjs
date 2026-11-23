// Volumes and quantities checked against hand calculations and published
// section tables, never against this code's own earlier output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { takeoff, boq, boqCsv, rowsCsv, readUnits, explainChecks, checkSummary, unitRepairNote, rowQuantities } from "./qto.mjs";
import { prism, clipPoly, polyVolume, convexPieces, filletAll, signedArea } from "./geom.mjs";

const sample = () => takeoff(parseStep(readFileSync(new URL("./samples/sample-office.ifc", import.meta.url))));
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const byName = (res, name) => res.rows.filter((r) => r.name === name);

test("sample: every computed volume equals the hand calculation", () => {
  const res = sample();
  const [a] = byName(res, "Wall A");
  close(a.computed.gross, 5 * 0.2 * 3); // 3.0 m3
  close(a.computed.net, 3 - 1 * 0.2 * 2.1); // door 1000 x 2100 through a 200 wall: 2.58 m3
  const [b] = byName(res, "Wall B");
  close(b.computed.gross, 0.2 * 4 * (3 + 2) / 2); // top falls from 3 m to 2 m: 2.0 m3
  for (const c of byName(res, "Wall C")) close(c.computed.gross, 3 * 0.2 * 3); // 1.8 m3 a piece
  close(byName(res, "Floor slab")[0].computed.gross, 5 * 4 * 0.25);
  close(byName(res, "Column 300")[0].computed.gross, Math.PI * 0.15 ** 2 * 3, 1e-9);
  // IPE 200: 2 x 100 x 8.5 + (200 - 2 x 8.5) x 5.6 + (4 - pi) x 12^2 mm2
  const ipe = 2 * 100 * 8.5 + 183 * 5.6 + (4 - Math.PI) * 144;
  close(byName(res, "Beam IPE 200")[0].computed.gross, ipe * 1e-6 * 4, 1e-4);
});

test("IPE 200 section area matches the steel tables (28.48 cm2)", () => {
  const res = sample();
  const beam = byName(res, "Beam IPE 200")[0];
  const areaCm2 = (beam.computed.gross / 4) * 1e4;
  assert.ok(Math.abs(areaCm2 - 28.48) < 0.01, `${areaCm2}`);
});

test("sample: units, storeys, types, materials and classification are read", () => {
  const res = sample();
  assert.equal(res.units.LENGTHUNIT, 0.001);
  const [a] = byName(res, "Wall A");
  assert.equal(a.storey, "Level 1");
  assert.equal(a.type, "Basic Wall 200");
  assert.equal(a.material, "Concrete C30/37");
  assert.equal(a.classification, "B2010");
  close(a.stored.Length.value, 5);
  close(a.stored.NetSideArea.value, 12.9);
  assert.equal(byName(res, "Wall C").find((r) => r.storey === "Level 2").id, 320);
});

test("sample: the checks find the planted faults and name their causes", () => {
  const res = sample();
  const [a] = byName(res, "Wall A");
  assert.ok(a.check.gross.agree && a.check.net.agree);
  for (const c of byName(res, "Wall C")) {
    assert.equal(c.check.gross.agree, false);
    assert.equal(c.check.gross.reason, "split");
    assert.equal(c.trustStored, false);
  }
  const beam = byName(res, "Beam IPE 200")[0];
  assert.equal(beam.check.net.agree, false);
  assert.equal(beam.check.net.reason, "own-dimensions");
  assert.equal(beam.trustStored, false); // its own Length x CrossSectionArea (0.011392) agrees with the body
});

test("bill of quantities: split pieces are summed from geometry, not their repeated stored value", () => {
  const lines = boq(sample().rows, ["class"]);
  const walls = lines.find((l) => l.key[0] === "IfcWall");
  assert.equal(walls.count, 4);
  close(walls.volume, 2.58 + 2.0 + 1.8 + 1.8);
  assert.equal(walls.volumeStored, 2);
  assert.equal(walls.volumeComputed, 2);
  close(walls.length, 5 + 4 + 3 + 3);
  const col = lines.find((l) => l.key[0] === "IfcColumn");
  assert.equal(col.volumeComputed, 1);
  const slab = lines.find((l) => l.key[0] === "IfcSlab");
  close(slab.area, 20);
});

test("CSV: rates multiply out, and spreadsheet formulas in names are neutralised", () => {
  const lines = boq(sample().rows, ["class"]);
  const k = JSON.stringify(["IfcSlab"]);
  const csv = boqCsv(lines, ["class"], { [k]: { rate: 150, unit: "m3" } });
  const row = csv.split("\r\n").find((l) => l.startsWith("IfcSlab"));
  assert.match(row, /,150,m3,750,0,0,0,0$/);
  const res = sample();
  res.rows[0].name = "=HYPERLINK(\"x\")";
  assert.match(rowsCsv(res.rows), /"'=HYPERLINK\(""x""\)"/);
});

test("geometry: a unit cube clipped through its diagonal plane keeps half", () => {
  const cube = prism([[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, 1]);
  close(polyVolume(cube), 1);
  close(polyVolume(clipPoly(cube, [1, 1, 0], 1)), 0.5);
  close(polyVolume(clipPoly(cube, [1, 1, 1], 1)), 1 / 6); // corner tetrahedron
  close(polyVolume(clipPoly(cube, [-1, 0, 0], -2)), 0); // all cut away
});

test("geometry: a concave outline fans into signed pieces with the right area", () => {
  const L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]; // area 3
  const pieces = convexPieces(L);
  const area = pieces.reduce((s, p) => s + p.s * signedArea(p.pts), 0);
  close(area, 3);
  const prismVol = pieces.reduce((s, p) => s + p.s * polyVolume(prism(p.pts, [0, 0, 2])), 0);
  close(prismVol, 6);
});

test("geometry: a filleted corner removes (1 - pi/4) r^2 from a square", () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  close(signedArea(filletAll(sq, [0, 1, 2, 3], 2)), 100 - 4 * (1 - Math.PI / 4) * 4, 1e-4);
});

test("units: conversion-based feet are read to metres", () => {
  const ifc = `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCCONVERSIONBASEDUNIT(#4,.LENGTHUNIT.,'FOOT',#5);
#4=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);
#5=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#6);
#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
ENDSEC;END-ISO-10303-21;`;
  close(readUnits(parseStep(ifc)).LENGTHUNIT, 0.3048);
});

const unitFile = (name, factor, base = "IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)") => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCCONVERSIONBASEDUNIT(#4,.LENGTHUNIT.,'${name}',#5);
#4=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);
#5=IFCMEASUREWITHUNIT(IFCRATIOMEASURE(${factor}),#6);
#6=${base};
ENDSEC;END-ISO-10303-21;`;

test("units: Revit's 'INCH' declared as 3.6576 m is read as a real inch, and the repair is reported", () => {
  const u = readUnits(parseStep(unitFile("INCH", 3.6576)));
  close(u.LENGTHUNIT, 0.0254);
  assert.equal(u.repairs.length, 1);
  assert.deepEqual({ ...u.repairs[0], declared: +u.repairs[0].declared.toFixed(4) }, { type: "LENGTHUNIT", name: "INCH", declared: 3.6576, used: 0.0254 });
  assert.match(unitRepairNote(u), /'INCH' is declared as 3\.6576 m \(144 times the real inch\); the exact 0\.0254 m was used/);
  // trustDeclared keeps the file's factor
  const t = readUnits(parseStep(unitFile("INCH", 3.6576)), { trustDeclared: true });
  close(t.LENGTHUNIT, 3.6576);
  assert.equal(t.repairs.length, 0);
});

test("units: a named unit within 0.1% of its exact value, or with a name not in the table, is left alone", () => {
  // rounded factors are common ('square inch' as 0.0006452 in a public file)
  const a = readUnits(parseStep(unitFile("inch", 0.02540001)));
  assert.equal(a.repairs.length, 0);
  close(a.LENGTHUNIT, 0.02540001);
  // a millimetre base: 25.4 mm is an inch
  const b = readUnits(parseStep(unitFile("Inch", 25.4, "IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)")));
  assert.equal(b.repairs.length, 0);
  close(b.LENGTHUNIT, 0.0254);
  // a survey foot or any unknown name keeps its declared factor
  const c = readUnits(parseStep(unitFile("US SURVEY FOOT", 0.3048006)));
  assert.equal(c.repairs.length, 0);
  close(c.LENGTHUNIT, 0.3048006);
  assert.equal(unitRepairNote(c), null);
});

test("units: a takeoff in a faulty-inch file measures the element at its real size", () => {
  // a 10 x 4 x 100 inch block (0.254 x 0.1016 x 2.54 m)
  const ifc = `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCCONVERSIONBASEDUNIT(#4,.LENGTHUNIT.,'INCH',#5);
#4=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);
#5=IFCMEASUREWITHUNIT(IFCRATIOMEASURE(3.6576),#6);
#6=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCAXIS2PLACEMENT2D(#14,$);
#14=IFCCARTESIANPOINT((5.,2.));
#15=IFCRECTANGLEPROFILEDEF(.AREA.,$,#13,10.,4.);
#16=IFCDIRECTION((0.,0.,1.));
#17=IFCEXTRUDEDAREASOLID(#15,#11,#16,100.);
#18=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#17));
#19=IFCPRODUCTDEFINITIONSHAPE($,$,(#18));
#20=IFCCOLUMN('1YvctVUKr0kugbFTf53O9L',$,'c',$,$,#12,#19,$);
ENDSEC;END-ISO-10303-21;`;
  const vol = (o) => takeoff(parseStep(ifc), o).rows[0].computed.gross;
  close(vol(), 0.254 * 0.1016 * 2.54, 1e-9);
  close(vol({ trustDeclaredUnits: true }) / vol(), 144 ** 3, 1e-3);
});

test("explanations: a stored volume a power of ten off is a unit slip", () => {
  const row = (stored, computed) => ({ tag: null, ifcClass: "IfcSlab", stored: {}, computed: { gross: computed, net: computed, openings: 0 }, check: { gross: { computed, stored, rel: (computed - stored) / stored, agree: false } } });
  const rows = [row(354722.9, 354.7229), row(5, 3)];
  explainChecks(rows);
  assert.equal(rows[0].check.gross.reason, "unit-slip");
  assert.equal(rows[0].check.gross.factor, 1000);
  assert.equal(rows[0].trustStored, false);
  assert.equal(rows[1].check.gross.reason, "unexplained");
});

test("explanations: geometry with its openings already cut is body-is-net (schependomlaan #27645)", () => {
  const vol = (value) => ({ kind: "volume", value });
  const row = (sg, sn, computed, openings = 0) => ({ tag: null, ifcClass: "IfcWall", stored: { GrossVolume: vol(sg), NetVolume: vol(sn) }, computed: { gross: computed, net: computed, openings }, check: { gross: { computed, stored: sg, rel: (computed - sg) / sg, agree: false } } });
  // ArchiCAD: stored gross 1.8219, stored net 1.3573 = the faceted body; the
  // gap is (GrossSideArea - NetSideArea) x Width = 2.1711 x 0.214
  const rows = [row(1.82185, 1.35727, 1.35727), row(1.82185, 1.2, 1.35727), row(1.82185, 1.35727, 1.35727, 2)];
  explainChecks(rows);
  assert.equal(rows[0].check.gross.reason, "body-is-net");
  assert.equal(rows[0].trustStored, true); // the stored gross is the right gross
  assert.equal(rows[1].check.gross.reason, "unexplained"); // body is not the stored net
  assert.notEqual(rows[2].check.gross.reason, "body-is-net"); // the file has openings: not this cause
});

test("explanations: litres over the square-foot factor is a unit slip only when several share it", () => {
  const row = (stored, computed) => ({ tag: null, ifcClass: "IfcSlab", stored: {}, computed: { gross: computed, net: computed, openings: 0 }, check: { gross: { computed, stored, rel: (computed - stored) / stored, agree: false } } });
  const k = 1000 / 10.7639104; // skolebygg roofs: 20,911.71 stored for 225.09 m3
  const three = [row(225.0918 * k, 225.0918), row(150.4101 * k, 150.4101), row(7.728 * k, 7.728)];
  explainChecks(three);
  for (const r of three) { assert.equal(r.check.gross.reason, "unit-slip"); assert.equal(r.trustStored, false); }
  close(three[0].check.gross.factor, k, 1e-9);
  const two = [row(225.0918 * k, 225.0918), row(150.4101 * k, 150.4101)];
  explainChecks(two);
  for (const r of two) assert.equal(r.check.gross.reason, "unexplained"); // two could be chance
  // the volume the BoQ sums is the geometry's, not 92.9 times it
  const q = rowQuantities({ ...three[0], computed: { ...three[0].computed, status: "ok" }, stored: { GrossVolume: { kind: "volume", value: 225.0918 * k } } });
  close(q.volume, 225.0918, 1e-9);
});

// ---- areas cut from the geometry --------------------------------------------

test("sample: every area cut from the geometry equals the hand calculation", () => {
  const res = sample();
  const [a] = byName(res, "Wall A");
  close(a.computed.areas.side.gross, 5 * 3); // elevation of the middle plane: 15 m2
  close(a.computed.areas.side.net, 15 - 1 * 2.1); // less the 1000 x 2100 door: 12.9 m2
  close(a.computed.areas.side.width, 0.2);
  close(a.computed.areas.footprint.gross, 5 * 0.2); // plan at the base: 1.0 m2
  close(a.computed.areas.footprint.net, (5 - 1) * 0.2); // the door reaches the floor: 0.8 m2
  const [b] = byName(res, "Wall B");
  close(b.computed.areas.side.gross, 4 * (3 + 2) / 2); // a trapezoid, 3 m falling to 2 m: 10 m2
  for (const c of byName(res, "Wall C")) close(c.computed.areas.side.gross, 3 * 3);
  close(byName(res, "Floor slab")[0].computed.areas.plan.gross, 5 * 4);
  close(byName(res, "Column 300")[0].computed.areas.cross.gross, Math.PI * 0.15 ** 2, 1e-4); // circle sampled at 360 segments, area-preserving
  close(byName(res, "Beam IPE 200")[0].computed.areas.cross.gross, (2 * 100 * 8.5 + 183 * 5.6 + (4 - Math.PI) * 144) * 1e-6, 1e-4);
});

test("sample: stored areas are checked, and the split wall's whole-wall side area is named", () => {
  const res = sample();
  const [a] = byName(res, "Wall A");
  assert.equal(a.areaCheck.NetSideArea.agree, true);
  for (const c of byName(res, "Wall C")) {
    const k = c.areaCheck.GrossSideArea;
    assert.equal(k.agree, false);
    assert.equal(k.reason, "split");
    assert.equal(k.trust, false);
  }
  assert.equal(byName(res, "Floor slab")[0].areaCheck.GrossArea.agree, true);
  assert.equal(byName(res, "Beam IPE 200")[0].areaCheck.CrossSectionArea.agree, true);
});

test("bill of quantities: a wall area is the stored one, the computed one where the stored is wrong or missing", () => {
  const walls = boq(sample().rows, ["class"]).find((l) => l.key[0] === "IfcWall");
  // A stores NetSideArea 12.9 (right); B stores none (10 computed); C's pieces
  // store the whole wall's 18 each (9 each computed)
  close(walls.area, 12.9 + 10 + 9 + 9);
  assert.equal(walls.areaComputed, 3);
});

test("geometry: a section of a unit cube is 1 anywhere inside it, and 0 on a face", async () => {
  const { sectionArea, solid } = await import("./geom.mjs");
  const cube = solid([{ s: 1, faces: prism([[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, 1]) }]);
  close(sectionArea(cube, [0, 0, 1]), 1);
  close(sectionArea(cube, [1, 1, 0]), Math.SQRT2); // the diagonal plane through the middle
  close(sectionArea(cube, [0, 0, 1], 0.3), 1);
  assert.equal(sectionArea(cube, [0, 0, 1], 1), 0);
  // a cube with a hole: the signed term takes its section out
  const holed = solid([...cube.terms, { s: -1, faces: prism([[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]], [0, 0, 1]) }]);
  close(sectionArea(holed, [0, 0, 1]), 0.75);
  close(sectionArea(holed, [1, 0, 0]), 0.5);
  assert.equal(sectionArea(solid([], 1), [0, 0, 1]), null); // faceted: no section
});

test("explanations: an area off by the square-foot factor is a unit slip; a near-miss is not", async () => {
  const { unitSlip, SQFT } = await import("./qto.mjs");
  close(unitSlip(59.8815, 59.8815 / SQFT), 1 / SQFT); // kleine_Wohnung's roof GrossArea
  assert.equal(unitSlip(0.06031, 0.59611), null); // 10x but 1.2% off: chance, not a slip
  assert.equal(unitSlip(2, 2), null);
});

// An L-shaped prism as a closed mesh: two concave L faces and six side quads,
// counter-clockwise from outside. L = 3 x 2 less a 2 x 1 notch: area 4.
const L = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [0, 2]];
const lPrism = (h, at = [0, 0, 0]) => {
  const p = (x, y, z) => [x + at[0], y + at[1], z + at[2]];
  const loops = [L.map(([x, y]) => p(x, y, 0)).reverse(), L.map(([x, y]) => p(x, y, h))];
  for (let i = 0; i < L.length; i++) {
    const [a, b] = [L[i], L[(i + 1) % L.length]];
    loops.push([p(a[0], a[1], 0), p(b[0], b[1], 0), p(b[0], b[1], h), p(a[0], a[1], h)]);
  }
  return loops;
};

test("geometry: a faceted body is cut through its faces (concave faces, holes, voids, mirrors)", async () => {
  const { sectionArea, solid, shellSection, shellVolume, transformSolid, thinnestNormal } = await import("./geom.mjs");
  const loops = lPrism(2);
  close(shellVolume(loops), 8);
  close(shellSection(loops, [0, 0, 1], 0.7), 4); // the L itself
  close(shellSection(loops, [1, 0, 0], 0.5), 4); // x = 0.5 cuts the 2 x 2 leg
  close(shellSection(loops, [1, 0, 0], 2), 2); // x = 2 cuts the 1 x 2 arm
  close(shellSection(loops, [0, 1, 0], 1.5), 2); // y = 1.5: 1 wide, 2 high
  close(shellSection(loops.map((f) => f.slice().reverse()), [0, 0, 1], 0.7), -4); // inward faces: sign flips
  close(shellSection(loops, [0, 0, 1], 5), 0); // misses
  const mesh = solid([], 8, [], [{ s: 1, loops }]);
  close(sectionArea(mesh, [0, 0, 1]), 4);
  close(sectionArea(mesh, [1, 1, 0], 2 / Math.SQRT2), 2 * 2 * Math.SQRT2); // x + y = 2: 2*sqrt2 long, 2 high
  // a void: a 0.5 x 0.5 x 1 box inside the leg, subtracted
  const box = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
  const v = [box.map(([x, y]) => [x, y, 0.5]).reverse(), box.map(([x, y]) => [x, y, 1.5])];
  for (let i = 0; i < 4; i++) { const [a, b] = [box[i], box[(i + 1) % 4]]; v.push([[a[0], a[1], 0.5], [b[0], b[1], 0.5], [b[0], b[1], 1.5], [a[0], a[1], 1.5]]); }
  const voided = solid([], 8 - 0.25, [], [{ s: 1, loops }, { s: -1, loops: v }]);
  close(sectionArea(voided, [0, 0, 1], 1), 4 - 0.25);
  close(sectionArea(voided, [0, 0, 1], 0.2), 4);
  // two disjoint shells add; a mirror keeps the area
  const two = solid([], 16, [], [{ s: 1, loops }, { s: 1, loops: lPrism(2, [10, 0, 0]) }]);
  close(sectionArea(two, [0, 0, 1], 1), 8);
  const mirrored = transformSolid(mesh, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  close(sectionArea(mirrored, [0, 0, 1], 1), 4);
  close(thinnestNormal(mesh, () => true, true).width, 3); // longest along x
  // a faceted part whose faces are unknown (or that an opening skipped) still has no section
  assert.equal(sectionArea(solid([], 8), [0, 0, 1]), null);
});

test("sample: a slab written as a faceted brep or a triangulated face set gets its plan area", () => {
  const text = readFileSync(new URL("./samples/sample-office.ifc", import.meta.url), "latin1");
  // the floor slab (5 x 4 x 0.25 m, in mm) as a box of faces instead of an extrusion
  const P = [[0, 0, 0], [5000, 0, 0], [5000, 4000, 0], [0, 4000, 0], [0, 0, 250], [5000, 0, 250], [5000, 4000, 250], [0, 4000, 250]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pts = P.map((p, i) => `#${9000 + i}=IFCCARTESIANPOINT((${p.map((c) => c.toFixed(1)).join(",")}));`);
  const brep = [...pts, ...quads.flatMap((q, i) => [
    `#${9100 + i}=IFCPOLYLOOP((${q.map((j) => `#${9000 + j}`).join(",")}));`,
    `#${9200 + i}=IFCFACEOUTERBOUND(#${9100 + i},.T.);`,
    `#${9300 + i}=IFCFACE((#${9200 + i}));`,
  ]), `#9400=IFCCLOSEDSHELL((${quads.map((_, i) => `#${9300 + i}`).join(",")}));`, "#9401=IFCFACETEDBREP(#9400);"];
  const tris = quads.flatMap((q) => [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]);
  const tfs = [`#9500=IFCCARTESIANPOINTLIST3D((${P.map((p) => `(${p.map((c) => c.toFixed(1)).join(",")})`).join(",")}));`,
    `#9501=IFCTRIANGULATEDFACESET(#9500,$,.T.,(${tris.map((t) => `(${t.map((j) => j + 1).join(",")})`).join(",")}),$);`];
  for (const [item, extra] of [["#9401", brep], ["#9501", tfs]]) {
    const t = text.replace("#405=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#406));", `#405=IFCSHAPEREPRESENTATION(#20,'Body','Brep',(${item}));\n${extra.join("\n")}`);
    assert.notEqual(t, text);
    const [slab] = byName(takeoff(parseStep(Buffer.from(t, "latin1"))), "Floor slab");
    close(slab.computed.gross, 5);
    assert.ok(slab.computed.faceted);
    close(slab.computed.areas.plan.gross, 20);
    assert.ok(slab.areaCheck.GrossArea.agree);
  }
  // a void: a 1 x 1 m box from 50 to 200 mm up, inside the slab, written with
  // the same face order (so the reader must flip its sign, not trust it)
  const V = [[1000, 1000, 50], [2000, 1000, 50], [2000, 2000, 50], [1000, 2000, 50], [1000, 1000, 200], [2000, 1000, 200], [2000, 2000, 200], [1000, 2000, 200]];
  const vpts = V.map((p, i) => `#${9600 + i}=IFCCARTESIANPOINT((${p.map((c) => c.toFixed(1)).join(",")}));`);
  const vbrep = [...vpts, ...quads.flatMap((q, i) => [
    `#${9700 + i}=IFCPOLYLOOP((${q.map((j) => `#${9600 + j}`).join(",")}));`,
    `#${9710 + i}=IFCFACEOUTERBOUND(#${9700 + i},.T.);`,
    `#${9720 + i}=IFCFACE((#${9710 + i}));`,
  ]), `#9730=IFCCLOSEDSHELL((${quads.map((_, i) => `#${9720 + i}`).join(",")}));`, "#9731=IFCFACETEDBREPWITHVOIDS(#9400,(#9730));"];
  const t = text.replace("#405=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#406));", `#405=IFCSHAPEREPRESENTATION(#20,'Body','Brep',(#9731));\n${[...brep, ...vbrep].join("\n")}`);
  const [slab] = byName(takeoff(parseStep(Buffer.from(t, "latin1"))), "Floor slab");
  close(slab.computed.gross, 5 - 0.15);
  close(slab.computed.areas.plan.gross, 19); // the mid-thickness plane (125 mm) crosses the void
});

// ---- faceted bodies: closed shells cut by a plane --------------------------

/** A STEP file with one IfcFacetedBrep whose faces are given as point loops (outer first). */
function brepModelT(faces, { flip = [] } = {}) {
  const lines = [];
  let id = 100;
  const faceIds = [];
  faces.forEach((loops, fi) => {
    const bounds = [];
    loops.forEach((loop, li) => {
      const pts = loop.map((p) => { const pid = id++; lines.push(`#${pid}=IFCCARTESIANPOINT((${p.map((x) => x.toFixed(6)).join(",")}));`); return `#${pid}`; });
      const lid = id++;
      lines.push(`#${lid}=IFCPOLYLOOP((${(flip.includes(fi) ? pts.slice().reverse() : pts).join(",")}));`);
      const bid = id++;
      lines.push(`#${bid}=${li === 0 ? "IFCFACEOUTERBOUND" : "IFCFACEBOUND"}(#${lid},.T.);`);
      bounds.push(`#${bid}`);
    });
    const fid = id++;
    lines.push(`#${fid}=IFCFACE((${bounds.join(",")}));`);
    faceIds.push(`#${fid}`);
  });
  lines.push(`#${id}=IFCCLOSEDSHELL((${faceIds.join(",")}));`);
  lines.push(`#${id + 1}=IFCFACETEDBREP(#${id});`);
  const text = `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`;
  return { model: parseStep(text), id: id + 1 };
}

/** Faces of a prism over a simple polygon (counter-clockwise from +z), height h; holes as clockwise loops. */
function prismFacesT(outer, h, holes = []) {
  const up = (l, z) => l.map(([x, y]) => [x, y, z]);
  const faces = [[up(outer, h), ...holes.map((l) => up(l, h))], [up(outer, 0).reverse(), ...holes.map((l) => up(l, 0).reverse())]];
  for (const l of [outer, ...holes]) for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    faces.push([[[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], h], [a[0], a[1], h]]]);
  }
  return faces;
}

test("faceted: a face with a hole (a square tube) takes the hole out of the section", async () => {
  const { Geometry, sectionArea, solidVolume } = await import("./geom.mjs");
  const outer = [[0, 0], [3, 0], [3, 3], [0, 3]];
  const hole = [[1, 1], [1, 2], [2, 2], [2, 1]]; // clockwise
  const { model, id } = brepModelT(prismFacesT(outer, 5, [hole]));
  const s = new Geometry(model).item(id);
  close(solidVolume(s), (9 - 1) * 5);
  close(sectionArea(s, [0, 0, 1]), 8);
  close(sectionArea(s, [1, 0, 0], 1.5), 2 * 5); // two 1-wide walls, 5 high
});

test("faceted: faces turned the wrong way are turned back, for the volume and the section", async () => {
  const { Geometry, sectionArea, solidVolume, orientShell } = await import("./geom.mjs");
  const L = [[0, 0], [4, 0], [4, 1], [2, 1], [2, 3], [0, 3]];
  const faces = prismFacesT(L, 2);
  // Revit's surface models in HHS architect.ifc: a third of the faces reversed
  const { model, id } = brepModelT(faces, { flip: [0, 3, 5] });
  const s = new Geometry(model).item(id);
  close(solidVolume(s), 16);
  close(sectionArea(s, [0, 0, 1]), 8);
  assert.ok(s.notes.some((n) => /3 faces of a faceted body turned/.test(n)), s.notes.join("; "));
  // a shell with a face missing is not closed: volume kept as before, no section
  const open = orientShell(faces.slice(1));
  assert.equal(open.closed, false);
  const m2 = brepModelT(faces.slice(1));
  assert.equal(sectionArea(new Geometry(m2.model).item(m2.id), [0, 0, 1]), null);
});

test("faceted: a shell turned inside out as a whole still cuts a positive area", async () => {
  const { Geometry, sectionArea, solidVolume } = await import("./geom.mjs");
  const all = prismFacesT([[0, 0], [2, 0], [2, 2], [0, 2]], 1);
  const { model, id } = brepModelT(all, { flip: all.map((_, i) => i) });
  const s = new Geometry(model).item(id);
  close(solidVolume(s), 4);
  close(sectionArea(s, [0, 0, 1]), 4);
});

test("faceted: a stepped shell (a box on a face with a hole) is one solid, whichever way its faces are written", async () => {
  const { Geometry, solidVolume, sectionArea } = await import("./geom.mjs");
  // a 4 x 4 x 1 box, and on its top a 2 x 2 x 1 box: the big top is a face
  // with a hole whose edges belong to the small box's sides, so the faces
  // fall into two pieces joined only through that face (kleine_Wohnung's
  // stepped window openings: read loop by loop they came out 0.049 m3, not 3.45)
  const outer = [[0, 0], [4, 0], [4, 4], [0, 4]];
  const hole = [[1, 1], [1, 3], [3, 3], [3, 1]]; // clockwise
  const big = prismFacesT(outer, 1);
  big[0] = [big[0][0], hole.map(([x, y]) => [x, y, 1])]; // top: outer bound and the hole
  const small = prismFacesT(hole.slice().reverse(), 1).map((f) => f.map((l) => l.map(([x, y, z]) => [x, y, z + 1])));
  const faces = [...big, small[0], ...small.slice(2)]; // the small box has no bottom
  for (const flip of [[], faces.map((_, i) => i).filter((i) => i >= big.length), [0], [0, 1, 7]]) {
    const { model, id } = brepModelT(faces, { flip });
    const s = new Geometry(model).item(id);
    close(solidVolume(s), 16 + 4);
    close(sectionArea(s, [0, 0, 1], 1.5), 4);
  }
});

/** A STEP model of one IfcAdvancedBrep built from a small description (see the tests below). */
function advancedModelT(build) {
  const lines = [];
  let id = 100;
  const put = (s) => { const i = id++; lines.push(`#${i}=${s};`); return `#${i}`; };
  const pt = (p) => put(`IFCCARTESIANPOINT((${p.map((x) => x.toFixed(9)).join(",")}))`);
  const dir = (d) => put(`IFCDIRECTION((${d.map((x) => x.toFixed(9)).join(",")}))`);
  const place = (o, z = [0, 0, 1], x = [1, 0, 0]) => put(`IFCAXIS2PLACEMENT3D(${pt(o)},${dir(z)},${dir(x)})`);
  const vertex = (p) => put(`IFCVERTEXPOINT(${pt(p)})`);
  const line = (a, b) => put(`IFCLINE(${pt(a)},${put(`IFCVECTOR(${dir(b.map((x, i) => x - a[i]))},1.)`)})`);
  const circle = (o, r, z = [0, 0, 1]) => put(`IFCCIRCLE(${place(o, z)},${r})`);
  const edge = (v0, v1, curve) => put(`IFCEDGECURVE(${v0},${v1},${curve},.T.)`);
  const loop = (oes) => put(`IFCEDGELOOP((${oes.map(([e, fwd]) => put(`IFCORIENTEDEDGE(*,*,${e},${fwd ? ".T." : ".F."})`)).join(",")}))`);
  const face = (loops, surface) => put(`IFCADVANCEDFACE((${loops.map((l, i) => put(`${i ? "IFCFACEBOUND" : "IFCFACEOUTERBOUND"}(${l},.T.)`)).join(",")}),${surface},.T.)`);
  const plane = (o, z) => put(`IFCPLANE(${place(o, z, Math.abs(z[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0])})`);
  const cylinder = (o, r) => put(`IFCCYLINDRICALSURFACE(${place(o)},${r})`);
  const faces = build({ vertex, line, circle, edge, loop, face, plane, cylinder });
  const shell = put(`IFCCLOSEDSHELL((${faces.join(",")}))`);
  const brep = put(`IFCADVANCEDBREP(${shell})`);
  const text = `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`;
  return { model: parseStep(text), id: Number(brep.slice(1)) };
}

test("advanced brep: planar faces on edge loops give the box's volume and section", async () => {
  const { Geometry, solidVolume, sectionArea } = await import("./geom.mjs");
  const { model, id } = advancedModelT(({ vertex, line, edge, loop, face, plane }) => {
    const P = [[0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0], [0, 0, 1], [2, 0, 1], [2, 3, 1], [0, 3, 1]];
    const V = P.map(vertex);
    const E = new Map();
    // each edge written once, used forwards by one face and backwards by the other
    const e = (a, b) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!E.has(k)) E.set(k, { id: edge(V[Math.min(a, b)], V[Math.max(a, b)], line(P[Math.min(a, b)], P[Math.max(a, b)])), lo: Math.min(a, b) });
      const x = E.get(k);
      return [x.id, x.lo === a];
    };
    const quad = (q) => q.map((a, i) => e(a, q[(i + 1) % 4]));
    const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    return quads.map((q) => {
      const a = P[q[0]], b = P[q[1]], c = P[q[2]];
      const u = b.map((x, i) => x - a[i]), v = c.map((x, i) => x - a[i]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      return face([loop(quad(q))], plane(a, n));
    });
  });
  const s = new Geometry(model).item(id);
  close(solidVolume(s), 6);
  close(sectionArea(s, [0, 0, 1]), 6);
  close(sectionArea(s, [1, 0, 0]), 3);
});

test("advanced brep: a cylinder (a band face) and a half cylinder (a face cut at its seam) to 1e-4", async () => {
  const { Geometry, solidVolume, sectionArea } = await import("./geom.mjs");
  // r 0.5, h 2: the side face bounded by the two full circles
  const full = advancedModelT(({ vertex, circle, edge, loop, face, plane, cylinder }) => {
    const v0 = vertex([0.5, 0, 0]), v1 = vertex([0.5, 0, 2]);
    const c0 = edge(v0, v0, circle([0, 0, 0], 0.5)), c1 = edge(v1, v1, circle([0, 0, 2], 0.5));
    return [
      face([loop([[c0, false]])], plane([0, 0, 0], [0, 0, -1])),
      face([loop([[c1, true]])], plane([0, 0, 2], [0, 0, 1])),
      face([loop([[c1, false]]), loop([[c0, true]])], cylinder([0, 0, 0], 0.5)),
    ];
  });
  const s = new Geometry(full.model).item(full.id);
  close(solidVolume(s), Math.PI * 0.25 * 2, 1e-4);
  close(sectionArea(s, [0, 0, 1]), Math.PI * 0.25, 1e-4);
  close(sectionArea(s, [1, 0, 0]), 2 * 1 * 0.5 * 2, 1e-4); // through the axis: 2r x h
  // the x >= 0 half: the curved face is one loop (arc, seam line, arc, line)
  const half = advancedModelT(({ vertex, line, circle, edge, loop, face, plane, cylinder }) => {
    const A = [0, -0.5, 0], B = [0, 0.5, 0], C = [0, 0.5, 2], D = [0, -0.5, 2];
    const [a, b, c, d] = [A, B, C, D].map(vertex);
    const arc0 = edge(a, b, circle([0, 0, 0], 0.5)); // counter-clockwise from -y through +x to +y
    const arc1 = edge(d, c, circle([0, 0, 2], 0.5));
    const ab = edge(a, b, line(A, B)), dc = edge(d, c, line(D, C));
    const ad = edge(a, d, line(A, D)), bc = edge(b, c, line(B, C));
    return [
      face([loop([[arc0, false], [ab, true]])], plane([0, 0, 0], [0, 0, -1])),
      face([loop([[arc1, true], [dc, false]])], plane([0, 0, 2], [0, 0, 1])),
      face([loop([[ab, false], [ad, true], [dc, true], [bc, false]])], plane([0, 0, 0], [-1, 0, 0])),
      face([loop([[arc0, true], [bc, true], [arc1, false], [ad, false]])], cylinder([0, 0, 0], 0.5)),
    ];
  });
  const h = new Geometry(half.model).item(half.id);
  close(solidVolume(h), (Math.PI * 0.25 * 2) / 2, 1e-4);
  close(sectionArea(h, [0, 0, 1]), (Math.PI * 0.25) / 2, 1e-4);
});

test("faceted: a stepped (concave) opening is taken out of a wall as signed tetrahedra", async () => {
  const { Geometry, solidVolume, asTerms, subtractCutters, cuttersOf, sectionArea } = await import("./geom.mjs");
  // the stepped shell of the test above, as an opening
  const outer = [[0, 0], [4, 0], [4, 4], [0, 4]];
  const hole = [[1, 1], [1, 3], [3, 3], [3, 1]];
  const big = prismFacesT(outer, 1);
  big[0] = [big[0][0], hole.map(([x, y]) => [x, y, 1])];
  const small = prismFacesT(hole.slice().reverse(), 1).map((f) => f.map((l) => l.map(([x, y, z]) => [x, y, z + 1])));
  const { model, id } = brepModelT([...big, small[0], ...small.slice(2)]);
  const op = new Geometry(model).item(id);
  assert.ok(op.mesh && op.shells);
  const t = asTerms(op);
  assert.ok(t.terms.length > 1 && !t.mesh);
  close(solidVolume(t), 20);
  close(sectionArea(t, [0, 0, 1], 1.5), 4);
  // a 6 x 6 x 3 block around it, at (-1, -1, -0.5)
  const { model: wm, id: wid } = brepModelT(prismFacesT([[-1, -1], [5, -1], [5, 5], [-1, 5]], 3).map((f) => f.map((l) => l.map(([x, y, z]) => [x, y, z - 0.5]))));
  const wall = asTerms(new Geometry(wm).item(wid));
  assert.equal(wall.terms.length, 1); // convex: one term
  close(solidVolume(subtractCutters(wall, cuttersOf(t), "opening")), 108 - 20);
  assert.equal(asTerms(op, 3), null); // over the term limit: not taken
});

// Synthetic rows shaped like takeoff()'s, for the area explanations.
const wallRow = (id, { stored = {}, check = {}, pathJoins = [], box = [0, 0, 0, 18, 0.3, 2.7], side } = {}) => ({
  id, tag: `w${id}`, ifcClass: "IfcWall", type: null, stored, pathJoins, box, areaCheck: check,
  computed: { openings: 12, areas: { side: side ?? { gross: 48.6, net: 30.6, faces: { gross: [48.6, 48.6], net: [30.6, 30.6] }, width: 0.3 } } },
});
const sideCheck = (which, stored, computed) => ({ kind: "side", which, stored, computed, agree: false });

test("explanations: a side area with the T-joined walls' strips taken off (C20 #31190's shape)", async () => {
  const { explainAreas } = await import("./qto.mjs");
  // 18 x 2.7 m wall, two 0.5 m walls start on its path: one face loses 1.0 x 2.7
  const rows = [
    wallRow(1, { pathJoins: [2, 3], check: { NetSideArea: sideCheck("net", 30.6 - (1.0 * 2.7) / 2, 30.6), GrossSideArea: sideCheck("gross", 48.6 - 1.35, 48.6) } }),
    wallRow(2, { side: { width: 0.5 } }), wallRow(3, { side: { width: 0.5 } }),
    wallRow(4, { pathJoins: [2], check: { NetSideArea: sideCheck("net", 30.6 - 1.35, 30.6) } }), // one join covers half of that
  ];
  explainAreas(rows);
  assert.equal(rows[0].areaCheck.NetSideArea.reason, "joins-off");
  assert.equal(rows[0].areaCheck.GrossSideArea.reason, "joins-off");
  assert.equal(rows[0].areaCheck.NetSideArea.trust, true);
  assert.equal(rows[3].areaCheck.NetSideArea.reason, "unexplained");
});

test("explanations: ArchiCAD's mean of its own outside and inside face areas (C20 #31190's figures)", async () => {
  const { explainAreas } = await import("./qto.mjs");
  const a = (value) => ({ kind: "area", value, set: "ArchiCADQuantities" });
  const stored = {
    "Netto-Oberflächenbereich an der Außenseite": a(30.6), "Netto-Oberflächenbereich an der Innenseite": a(27.09),
    "Oberflächenbereich der Fenster in der Wand": a(18), "Oberflächenbereich der Türen in der Wand": a(0),
  };
  const rows = [wallRow(1, { stored, check: { NetSideArea: sideCheck("net", 28.845, 30.6), GrossSideArea: sideCheck("gross", 46.845, 48.6) } })];
  explainAreas(rows);
  assert.equal(rows[0].areaCheck.NetSideArea.reason, "faces-averaged");
  assert.equal(rows[0].areaCheck.GrossSideArea.reason, "faces-averaged");
});

test("explanations: one Length and CrossSectionArea copied onto members of different lengths is a host figure", async () => {
  const { explainAreas } = await import("./qto.mjs");
  const member = (id, len, sameLength = false) => ({
    id, tag: `m${id}`, ifcClass: "IfcMember", type: null, pathJoins: [],
    stored: { Length: { kind: "length", value: 20.858 }, CrossSectionArea: { kind: "area", value: 138.4225 } },
    box: [0, 0, 0, 0.05, 0.18, sameLength ? 1.5 : len],
    areaCheck: { CrossSectionArea: { kind: "cross", which: "gross", stored: 138.4225, computed: 0.01335, agree: false } },
    computed: { openings: 0, areas: { cross: { gross: 0.01335 } } },
  });
  const varied = [member(1, 1.554), member(2, 2.9), member(3, 3.3)];
  explainAreas(varied);
  for (const r of varied) { assert.equal(r.areaCheck.CrossSectionArea.reason, "host-figure"); assert.equal(r.areaCheck.CrossSectionArea.trust, false); }
  const alike = [member(1, 0, true), member(2, 0, true), member(3, 0, true)];
  explainAreas(alike);
  assert.equal(alike[0].areaCheck.CrossSectionArea.reason, "unexplained");
});

test("surfaceArea: a box's six faces, a face with a hole, and null for two pieces", async () => {
  const { surfaceArea } = await import("./geom.mjs");
  const box = { terms: [{ s: 1, faces: prism([[0, 0], [1, 0], [1, 2], [0, 2]], [0, 0, 3]) }], mesh: 0, shells: [] };
  assert.ok(Math.abs(surfaceArea(box) - 22) < 1e-9);
  // a 4 x 4 plate's top as an outer bound and a 1 x 1 inner bound running against it
  const outer = [[0, 0, 1], [4, 0, 1], [4, 4, 1], [0, 4, 1]], hole = [[1, 1, 1], [1, 2, 1], [2, 2, 1], [2, 1, 1]];
  assert.ok(Math.abs(surfaceArea({ terms: [], mesh: 1, shells: [{ s: 1, loops: [outer, hole] }] }) - 15) < 1e-9);
  assert.equal(surfaceArea({ terms: [box.terms[0], box.terms[0]], mesh: 0, shells: [] }), null);
  assert.equal(surfaceArea({ terms: [], mesh: 1, shells: null }), null);
});

test("prismAxis: a footing mitred at both ends runs along its sides; a box keeps its longest edge; a cube has none", async () => {
  const { prismAxis } = await import("./geom.mjs");
  // schependomlaan #3776 in metres: a 0.5 x 0.25 strip footing, 1.398 m on one side and 1.014 m on the other
  const plan = [[0, 0], [0, 1.39845], [-0.5, 1.20620], [-0.5, 0.19225]];
  const strip = { terms: [], mesh: 1, shells: [{ s: 1, loops: prism(plan, [0, 0, 0.25]) }] };
  const d = prismAxis(strip);
  assert.ok(Math.abs(Math.abs(d[1]) - 1) < 1e-9, `axis ${d}`);
  const long = { terms: [{ s: 1, faces: prism([[0, 0], [5, 0], [5, 0.3], [0, 0.3]], [0, 0, 0.4]) }], mesh: 0, shells: [] };
  assert.ok(Math.abs(Math.abs(prismAxis(long)[0]) - 1) < 1e-9);
  const cube = { terms: [{ s: 1, faces: prism([[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, 1]) }], mesh: 0, shells: [] };
  assert.equal(prismAxis(cube), null);
});

test("explanations: half the body's surface stored as a Revit mullion's CrossSectionArea (HHS architect #17161)", async () => {
  const { explainAreas } = await import("./qto.mjs");
  const row = (stored, surface) => ({
    id: 17161, tag: null, ifcClass: "IfcMember", type: null, pathJoins: [], box: [0, 0, 0, 0.06, 0.15, 2.04],
    stored: { CrossSectionArea: { kind: "area", value: stored } },
    areaCheck: { CrossSectionArea: { kind: "cross", which: "gross", stored, computed: 0.0095, agree: false } },
    computed: { openings: 0, areas: { cross: { gross: 0.0095, surface } } },
  });
  const rows = [row(0.6607201794, 1.321440357), row(0.9, 1.321440357)];
  explainAreas(rows);
  assert.equal(rows[0].areaCheck.CrossSectionArea.reason, "half-surface");
  assert.equal(rows[0].areaCheck.CrossSectionArea.trust, false);
  assert.equal(rows[1].areaCheck.CrossSectionArea.reason, "unexplained");
});

test("explanations: a short stub's stored section is its own width x height (schependomlaan #8123)", async () => {
  const { explainAreas } = await import("./qto.mjs");
  const len = (value) => ({ kind: "length", value });
  const row = (stored) => ({
    id: 8123, tag: null, ifcClass: "IfcBeam", type: null, pathJoins: [], box: [0, 0, 0, 0.35, 0.35, 0.66],
    stored: { Width: len(0.35), Height: len(0.66), CrossSectionArea: { kind: "area", value: stored } },
    areaCheck: { CrossSectionArea: { kind: "cross", which: "gross", stored, computed: 0.1225, agree: false } },
    computed: { openings: 0, areas: { cross: { gross: 0.1225 } } },
  });
  const rows = [row(0.231), row(0.3)];
  explainAreas(rows);
  assert.equal(rows[0].areaCheck.CrossSectionArea.reason, "own-profile");
  assert.equal(rows[0].areaCheck.CrossSectionArea.trust, true);
  assert.equal(rows[1].areaCheck.CrossSectionArea.reason, "unexplained");
});

// ---- red team 2026-11-20: escaped mutants in qto.mjs ------------------------

test("units: millimetre volumes, and money or time units in the assignment are skipped", () => {
  const ifc = `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3,#4,#5,#6));
#3=IFCSIUNIT(*,.VOLUMEUNIT.,.MILLI.,.CUBIC_METRE.);
#4=IFCMONETARYUNIT(.EUR.);
#5=IFCSIUNIT(*,.TIMEUNIT.,$,.SECOND.);
#6=IFCSIUNIT(*,.AREAUNIT.,.MILLI.,.SQUARE_METRE.);
ENDSEC;END-ISO-10303-21;`;
  const u = readUnits(parseStep(ifc));
  close(u.VOLUMEUNIT, 1e-9);
  close(u.AREAUNIT, 1e-6);
  assert.equal(u.LENGTHUNIT, 1);
  assert.equal("TIMEUNIT" in u, false);
});

const sampleText = () => readFileSync(new URL("./samples/sample-office.ifc", import.meta.url), "latin1");

test("stored quantities: the first set to name a quantity wins over a later one", () => {
  const extra = `#9001=IFCELEMENTQUANTITY('2g_f3pu0p7D2Ve$5QiOxje',$,'Qto_Other',$,$,(#9002,#9003));
#9002=IFCQUANTITYVOLUME('GrossVolume',$,$,99.,$);
#9003=IFCQUANTITYVOLUME($,$,$,7.,$);
#9004=IFCRELDEFINESBYPROPERTIES('25wyMybzobAMnUK9qkDe16',$,$,$,(#100),#9001);
ENDSEC;`;
  const res = takeoff(parseStep(sampleText().replace(/ENDSEC;\s*END-ISO/, `${extra}\nEND-ISO`)));
  const a = res.rows.find((r) => r.id === 100);
  assert.equal(a.stored.GrossVolume.value, 3);
  assert.equal(a.stored.GrossVolume.set, "Qto_WallBaseQuantities");
  assert.deepEqual(Object.keys(a.stored).filter((k) => !/^[A-Z]/.test(k)), []); // the nameless one is dropped
});

test("explanations: own dimensions are named only when the stored value is not their product", () => {
  const len = (value) => ({ kind: "length", value });
  const row = (stored, computed) => ({ tag: null, ifcClass: "IfcBeam", stored: { Length: len(4), Height: len(0.5), Width: len(0.25) }, computed: { gross: computed, net: computed, openings: 0 }, check: { gross: { computed, stored, rel: (computed - stored) / stored, agree: false } } });
  const rows = [row(0.7, 0.5), row(0.7, 0.3)];
  explainChecks(rows);
  assert.equal(rows[0].check.gross.reason, "own-dimensions"); // 4 x 0.5 x 0.25 = 0.5, the computed figure
  assert.equal(rows[1].check.gross.reason, "unexplained");
  assert.equal(rows[1].trustStored, true);
});

test("explanations: a member's stored volume is checked against its own stored length x cross-section area", () => {
  const q = (kind, value) => ({ kind, value });
  const row = (stored, computed, extra = {}) => ({ tag: null, ifcClass: "IfcBeam", stored: { Length: q("length", 4), CrossSectionArea: q("area", 0.002848), ...extra }, computed: { gross: computed, net: computed, openings: 0 }, check: { net: { computed, stored, rel: (computed - stored) / stored, agree: false } } });
  // 4 m x 0.002848 m2 = 0.011392 m3: the computed body agrees, the stored 0.0142 is the odd one out
  const rows = [row(0.0142, 0.011394), row(0.0142, 0.009), row(0.0142, 0.011394, { CrossSectionArea: q("area", 0) })];
  explainChecks(rows);
  assert.equal(rows[0].check.net.reason, "own-dimensions");
  assert.equal(rows[0].trustStored, false);
  assert.equal(rows[1].check.net.reason, "unexplained"); // the body disagrees with the product too
  assert.equal(rows[1].trustStored, true);
  assert.equal(rows[2].check.net.reason, "unexplained"); // a zero section names nothing
});

test("the sample office's IPE 200: stored NetVolume contradicts its length x section, so the BoQ weighs the body", () => {
  const res = takeoff(parseStep(sampleText()));
  const beam = res.rows.find((r) => r.ifcClass === "IfcBeam");
  assert.equal(beam.check.net.reason, "own-dimensions");
  const line = boq(res.rows).find((l) => l.key[0] === "IfcBeam");
  assert.ok(Math.abs(line.volume - 0.011394) < 1e-5, `BoQ volume ${line.volume}`);
  assert.equal(line.volumeComputed, 1);
  assert.ok(Math.abs(line.weight - 0.011394 * 7850) < 0.01, `BoQ weight ${line.weight}`); // 89.44 kg, not 111.47
});

test("areas: a wall whose opening cannot be read keeps its gross areas", () => {
  const res = takeoff(parseStep(sampleText().replace("#112=IFCPRODUCTDEFINITIONSHAPE($,$,(#115));", "#112=IFCPRODUCTDEFINITIONSHAPE($,$,());")));
  const a = res.rows.find((r) => r.id === 100);
  assert.equal(a.computed.net, null);
  assert.equal(a.computed.areas.error, undefined);
  assert.ok(a.computed.areas.side.gross > 0);
  assert.equal(a.computed.areas.side.net, null);
});

test("summary: area pairs are counted", () => {
  const s = checkSummary(sample().rows);
  assert.ok(s.areaPairs > 0);
  assert.ok(s.areaAgree > 0 && s.areaAgree <= s.areaPairs);
});

// Three Tekla-style steel parts, mm, each 1 m long, with the stored volume and
// weight computed by hand from a simplified section (Mini Project, Tekla):
// - L80x80x8, root radius 12: stored from 8 x (80 + 80 - 8) = 1,216 mm2,
//   the geometry has 1,216 + (1 - pi/4) x 144 = 1,246.90 mm2;
// - a 60 x 1 round tube stored as 16-sided polygons: the annulus
//   pi (30^2 - 29^2) = 185.35 mm2, as 16-gons 59 x 8 sin(pi/8) = 180.62 mm2;
// - an IPE240 clipped by a half-space at one end, stored from the section
//   without its four root radii (3,718.5 against 3,911.6 mm2).
const steelFile = (storedL, storedTube, storedOdd) => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCAXIS2PLACEMENT2D(#10,$);
#16=IFCDIRECTION((0.,0.,1.));
#20=IFCLSHAPEPROFILEDEF(.AREA.,'L80/80/8',#13,80.,80.,8.,12.,$,$,$,$);
#21=IFCEXTRUDEDAREASOLID(#20,#11,#16,1000.);
#22=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#21));
#23=IFCPRODUCTDEFINITIONSHAPE($,$,(#22));
#24=IFCBEAM('1YvctVUKr0kugbFTf53O9A',$,'angle',$,$,#12,#23,'M/1');
#25=IFCQUANTITYVOLUME('NetVolume',$,$,${storedL});
#26=IFCQUANTITYWEIGHT('NetWeight',$,$,${storedL * 8000});
#27=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53O9A',$,'BaseQuantities',$,$,(#25,#26));
#28=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53O9A',$,$,$,(#24),#27);
#30=IFCCIRCLEHOLLOWPROFILEDEF(.AREA.,'BUIS60/1',#13,30.,1.);
#31=IFCEXTRUDEDAREASOLID(#30,#11,#16,1000.);
#32=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#31));
#33=IFCPRODUCTDEFINITIONSHAPE($,$,(#32));
#34=IFCBEAM('1YvctVUKr0kugbFTf53O9B',$,'tube',$,$,#12,#33,'M/2');
#35=IFCQUANTITYVOLUME('NetVolume',$,$,${storedTube});
#37=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53O9B',$,'BaseQuantities',$,$,(#35));
#38=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53O9B',$,$,$,(#34),#37);
#40=IFCISHAPEPROFILEDEF(.AREA.,'IPE240',#13,120.,240.,6.2,9.8,15.);
#41=IFCEXTRUDEDAREASOLID(#40,#11,#16,1000.);
#42=IFCPLANE(#43);
#43=IFCAXIS2PLACEMENT3D(#44,#16,$);
#44=IFCCARTESIANPOINT((0.,0.,900.));
#45=IFCHALFSPACESOLID(#42,.F.);
#46=IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#41,#45);
#47=IFCSHAPEREPRESENTATION($,'Body','Clipping',(#46));
#48=IFCPRODUCTDEFINITIONSHAPE($,$,(#47));
#49=IFCBEAM('1YvctVUKr0kugbFTf53O9C',$,'ipe',$,$,#12,#48,'M/3');
#50=IFCQUANTITYVOLUME('NetVolume',$,$,${storedOdd});
#51=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53O9C',$,'BaseQuantities',$,$,(#50));
#52=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53O9C',$,$,$,(#49),#51);
ENDSEC;END-ISO-10303-21;`;

test("explanations: a stored volume from the section without fillets or with polygon tubes is simplified-section (Tekla)", async () => {
  const { Geometry } = await import("./geom.mjs");
  const plainL = 8 * 152 * 1e-6, tube16 = 59 * 8 * Math.sin(Math.PI / 8) * 1e-6; // m3 a metre
  const plainI = (2 * 120 * 9.8 + (240 - 19.6) * 6.2) * 0.9e-6; // clipped to 900 mm
  const res = takeoff(parseStep(steelFile(plainL, tube16, plainI)));
  const [L, T, I] = res.rows;
  close(L.computed.gross, (1216 + (1 - Math.PI / 4) * 144) * 1e-6, 1e-4);
  close(T.computed.gross, Math.PI * 59 * 1e-6, 1e-4);
  close(I.computed.gross, (3718.5 + (4 - Math.PI) * 225) * 0.9e-6, 1e-4);
  for (const r of [L, T, I]) { assert.equal(r.check.net.reason, "simplified-section", `${r.name}: ${r.check.net.reason}`); assert.equal(r.trustStored, false); }
  assert.equal(L.check.net.section, "no fillets");
  assert.equal(T.check.net.section, "16-gon circles");
  // the stored weight (8,000 kg/m3 on the plain section) is scaled to the geometry
  const q = rowQuantities(L);
  close(q.weight, L.computed.gross * 8000, 1e-6);
  assert.equal(q.volumeSource, "computed");
  // a ratio no simplification gives stays unexplained
  const odd = takeoff(parseStep(steelFile(plainL * 0.9, tube16, plainI))).rows[0];
  assert.equal(odd.check.net.reason, "unexplained");
  // the variants themselves, from the profile entities
  const g = new Geometry(parseStep(steelFile(1, 1, 1)));
  const v = Object.fromEntries(g.sectionVariants(20).map((x) => [x.label, x.ratio]));
  close(v["no fillets"], 1216 / (1216 + (1 - Math.PI / 4) * 144), 1e-4);
  const t = Object.fromEntries(g.sectionVariants(30).map((x) => [x.label, x.ratio]));
  close(t["8-gon circles"], (4 * Math.sin(Math.PI / 4)) / Math.PI, 1e-9); // 0.9003: Tekla's 20 x 1 tubes
  assert.equal(t["no fillets"], undefined); // a round tube has none
});

test("explanations: one stored volume on every piece of a stair, equal to the stair's total, is assembly-total (skolebygg)", () => {
  const vol = (value) => ({ kind: "volume", value });
  const row = (id, cls, computed, sn) => ({ id, tag: `t${id}`, ifcClass: cls, assembly: 9, stored: sn == null ? {} : { NetVolume: vol(sn) }, computed: { status: "ok", gross: computed, net: computed, openings: 0 }, check: sn == null ? null : { net: { computed, stored: sn, rel: (computed - sn) / sn, agree: Math.abs(computed - sn) <= 0.02 * sn } } });
  // flights 0.588, landings 0.665, stringers 0.0875 (railings left out) = 1.3401
  const rows = [row(1, "IfcStairFlight", 0.588), row(2, "IfcSlab", 0.665), row(3, "IfcMember", 0.05, 1.3401), row(4, "IfcMember", 0.0375, 1.3401), row(5, "IfcRailing", 0.116)];
  explainChecks(rows);
  for (const r of [rows[2], rows[3]]) { assert.equal(r.check.net.reason, "assembly-total"); assert.equal(r.trustStored, false); }
  assert.equal(rowQuantities(rows[2]).volume, 0.05); // the piece's own geometry, not the stair's
  // one piece alone carrying a figure is not this cause
  const lone = [row(1, "IfcStairFlight", 0.588), row(3, "IfcMember", 0.05, 0.638)];
  explainChecks(lone);
  assert.equal(lone[1].check.net.reason, "unexplained");
});

test("explanations: a stored 0 on an element with a body is not-stored, and the geometry is summed", () => {
  const row = { tag: null, ifcClass: "IfcWindow", stored: { NetVolume: { kind: "volume", value: 0 } }, computed: { status: "ok", gross: 0.18356, net: 0.18356, openings: 0 }, check: { net: { computed: 0.18356, stored: 0, rel: Infinity, agree: false } } };
  explainChecks([row]);
  assert.equal(row.check.net.reason, "not-stored");
  assert.equal(rowQuantities(row).volume, 0.18356);
});

// A window: a 1000 x 100 x 1000 frame block (0.1 m3) and a 900 x 20 x 900 pane
// (0.0162 m3) set 200 mm off it (the body is the union of its items, so a
// pane inside the block would add nothing), drawn in ArchiCAD's see-through "Glas - algemeen"; a second window
// whose pane is mapped in from a representation map at scale 2 (8 x the volume);
// a third whose "pane" is glass wool insulation, not glass.
const glazedFile = (stored1, stored2, stored3) => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53G9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCAXIS2PLACEMENT2D(#10,$);
#14=IFCCARTESIANPOINT((0.,200.,0.));
#15=IFCAXIS2PLACEMENT3D(#14,$,$);
#16=IFCDIRECTION((0.,0.,1.));
#20=IFCRECTANGLEPROFILEDEF(.AREA.,$,#13,1000.,100.);
#21=IFCEXTRUDEDAREASOLID(#20,#11,#16,1000.);
#22=IFCRECTANGLEPROFILEDEF(.AREA.,$,#13,900.,20.);
#23=IFCEXTRUDEDAREASOLID(#22,#15,#16,900.);
#30=IFCCOLOURRGB($,0.9,0.9,0.9);
#31=IFCSURFACESTYLERENDERING(#30,0.,$,$,$,$,$,$,.NOTDEFINED.);
#32=IFCSURFACESTYLE('RAL 9001',.BOTH.,(#31));
#33=IFCPRESENTATIONSTYLEASSIGNMENT((#32));
#34=IFCSTYLEDITEM(#21,(#33),$);
#35=IFCSURFACESTYLERENDERING(#30,0.49,$,$,$,$,$,$,.NOTDEFINED.);
#36=IFCSURFACESTYLE('Glas - algemeen',.BOTH.,(#35));
#37=IFCPRESENTATIONSTYLEASSIGNMENT((#36));
#38=IFCSTYLEDITEM(#23,(#37),$);
#40=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#21,#23));
#41=IFCPRODUCTDEFINITIONSHAPE($,$,(#40));
#42=IFCWINDOW('1YvctVUKr0kugbFTf53G9A',$,'R1 18',$,$,#12,#41,$,1000.,1000.);
#43=IFCQUANTITYVOLUME('Net Volume',$,$,${stored1});
#44=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53G9A',$,'ArchiCADQuantities',$,$,(#43));
#45=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53G9A',$,$,$,(#42),#44);
#50=IFCEXTRUDEDAREASOLID(#22,#15,#16,900.);
#51=IFCSTYLEDITEM(#50,(#37),$);
#52=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#50));
#53=IFCREPRESENTATIONMAP(#11,#52);
#54=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#10,2.,$);
#55=IFCMAPPEDITEM(#53,#54);
#56=IFCSHAPEREPRESENTATION($,'Body','MappedRepresentation',(#21,#55));
#57=IFCPRODUCTDEFINITIONSHAPE($,$,(#56));
#58=IFCWINDOW('1YvctVUKr0kugbFTf53G9B',$,'mapped',$,$,#12,#57,$,1000.,1000.);
#59=IFCQUANTITYVOLUME('Net Volume',$,$,${stored2});
#60=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53G9B',$,'ArchiCADQuantities',$,$,(#59));
#61=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53G9B',$,$,$,(#58),#60);
#70=IFCEXTRUDEDAREASOLID(#22,#15,#16,900.);
#71=IFCSURFACESTYLE('Isolatie - glaswol-steenwol',.BOTH.,(#31));
#72=IFCPRESENTATIONSTYLEASSIGNMENT((#71));
#73=IFCSTYLEDITEM(#70,(#72),$);
#74=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#21,#70));
#75=IFCPRODUCTDEFINITIONSHAPE($,$,(#74));
#76=IFCDOOR('1YvctVUKr0kugbFTf53G9C',$,'wool',$,$,#12,#75,$,1000.,1000.);
#77=IFCQUANTITYVOLUME('Net Volume',$,$,${stored3});
#78=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53G9C',$,'ArchiCADQuantities',$,$,(#77));
#79=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53G9C',$,$,$,(#76),#78);
ENDSEC;END-ISO-10303-21;`;

test("explanations: a stored window volume equal to the body less its glass panes is glazing-left-out (ArchiCAD)", () => {
  const frame = 0.1, pane = 0.9 * 0.02 * 0.9; // m3
  const res = takeoff(parseStep(glazedFile(frame, frame, frame)));
  const [w, m, d] = res.rows;
  close(w.computed.gross, frame + pane);
  close(w.computed.glazing, pane);
  assert.equal(w.computed.glazingPieces, 1);
  assert.equal(w.check.net.reason, "glazing-left-out");
  assert.equal(w.trustStored, false);
  assert.equal(rowQuantities(w).volume, w.computed.gross); // the BoQ sums the panes too
  // the mapped pane at scale 2 holds 8 times the volume
  close(m.computed.glazing, 8 * pane);
  assert.equal(m.check.net.reason, "glazing-left-out");
  // glass wool is not glass: nothing is left out, the stored figure stays unexplained
  assert.equal(d.computed.glazing, undefined);
  assert.equal(d.check.net.reason, "unexplained");
  // a stored figure 3% under the frame is not this cause
  const odd = takeoff(parseStep(glazedFile(frame * 0.97, frame, frame))).rows[0];
  assert.equal(odd.check.net.reason, "unexplained");
});

// A door with side lights: the 1000 x 100 x 1000 frame block, a leaf pane
// (900 x 20 x 900) at y = 200 and a side light (200 x 20 x 900) in another
// plane, at y = -200. ArchiCAD's "D2R 2zl 18" doors store the body less the
// side lights' glass only. A second door has two panes in one plane (x = -300
// and x = +300, both at y = 200): a stored figure leaving out just one of them
// is not a plane's glass, and stays unexplained.
const sideLightFile = (stored1, stored2) => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCAXIS2PLACEMENT2D(#10,$);
#14=IFCCARTESIANPOINT((0.,200.,0.));
#15=IFCAXIS2PLACEMENT3D(#14,$,$);
#16=IFCDIRECTION((0.,0.,1.));
#17=IFCCARTESIANPOINT((0.,-200.,0.));
#18=IFCAXIS2PLACEMENT3D(#17,$,$);
#20=IFCRECTANGLEPROFILEDEF(.AREA.,$,#13,1000.,100.);
#21=IFCEXTRUDEDAREASOLID(#20,#11,#16,1000.);
#22=IFCRECTANGLEPROFILEDEF(.AREA.,$,#13,900.,20.);
#23=IFCEXTRUDEDAREASOLID(#22,#15,#16,900.);
#24=IFCRECTANGLEPROFILEDEF(.AREA.,$,#13,200.,20.);
#25=IFCEXTRUDEDAREASOLID(#24,#18,#16,900.);
#35=IFCSURFACESTYLERENDERING(#30,0.49,$,$,$,$,$,$,.NOTDEFINED.);
#30=IFCCOLOURRGB($,0.9,0.9,0.9);
#36=IFCSURFACESTYLE('Glas - algemeen',.BOTH.,(#35));
#37=IFCPRESENTATIONSTYLEASSIGNMENT((#36));
#38=IFCSTYLEDITEM(#23,(#37),$);
#39=IFCSTYLEDITEM(#25,(#37),$);
#40=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#21,#23,#25));
#41=IFCPRODUCTDEFINITIONSHAPE($,$,(#40));
#42=IFCDOOR('1YvctVUKr0kugbFTf53S9A',$,'D2R 2zl',$,$,#12,#41,$,1000.,1000.);
#43=IFCQUANTITYVOLUME('Net Volume',$,$,${stored1});
#44=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53S9A',$,'ArchiCADQuantities',$,$,(#43));
#45=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53S9A',$,$,$,(#42),#44);
#50=IFCCARTESIANPOINT((-300.,200.,0.));
#51=IFCAXIS2PLACEMENT3D(#50,$,$);
#52=IFCCARTESIANPOINT((300.,200.,0.));
#53=IFCAXIS2PLACEMENT3D(#52,$,$);
#54=IFCRECTANGLEPROFILEDEF(.AREA.,$,#13,400.,20.);
#55=IFCEXTRUDEDAREASOLID(#54,#51,#16,900.);
#56=IFCEXTRUDEDAREASOLID(#24,#53,#16,900.);
#57=IFCSTYLEDITEM(#55,(#37),$);
#58=IFCSTYLEDITEM(#56,(#37),$);
#59=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#21,#55,#56));
#60=IFCPRODUCTDEFINITIONSHAPE($,$,(#59));
#61=IFCDOOR('1YvctVUKr0kugbFTf53S9B',$,'one plane',$,$,#12,#60,$,1000.,1000.);
#62=IFCQUANTITYVOLUME('Net Volume',$,$,${stored2});
#63=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53S9B',$,'ArchiCADQuantities',$,$,(#62));
#64=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53S9B',$,$,$,(#61),#63);
ENDSEC;END-ISO-10303-21;`;

test("explanations: a stored door volume equal to the body less one plane's panes (its side lights) is glazing-left-out", () => {
  const frame = 0.1, leaf = 0.9 * 0.02 * 0.9, side = 0.2 * 0.02 * 0.9, big = 0.4 * 0.02 * 0.9; // m3
  const [d, one] = takeoff(parseStep(sideLightFile(frame + leaf, frame + big))).rows;
  close(d.computed.gross, frame + leaf + side);
  assert.equal(d.computed.glazingPlanes.length, 2);
  assert.equal(d.check.net.reason, "glazing-left-out");
  close(d.check.net.glassLeftOut.volume, side);
  assert.equal(d.check.net.glassLeftOut.pieces, 1);
  assert.equal(rowQuantities(d).volume, d.computed.gross); // the BoQ sums every pane
  // two panes in one plane: one plane, so leaving out the smaller pane alone is no cause
  assert.equal(one.computed.glazingPlanes, undefined);
  assert.equal(one.check.net.reason, "unexplained");
  // the whole-glass rule still comes first
  const all = takeoff(parseStep(sideLightFile(frame, frame))).rows[0];
  assert.equal(all.check.net.reason, "glazing-left-out");
  assert.equal(all.check.net.glassLeftOut, undefined);
});

// A body of several items is their union: an IFC shape representation's items
// together make the element's shape, and where two run into each other (a
// cabinet's carcass and its doors, a door leaf set 10 mm into each post) the
// shared part is one piece of material, not two.
const itemsFile = (items) => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53G9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#16=IFCDIRECTION((0.,0.,1.));
${items.map(([x, y, w, d, h], i) => `#${100 + i * 10}=IFCCARTESIANPOINT((${x}.,${y}.));
#${101 + i * 10}=IFCAXIS2PLACEMENT2D(#${100 + i * 10},$);
#${102 + i * 10}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${101 + i * 10},${w}.,${d}.);
#${103 + i * 10}=IFCEXTRUDEDAREASOLID(#${102 + i * 10},#11,#16,${h}.);`).join("\n")}
#300=IFCCARTESIANPOINT((0.,0.));
#301=IFCCARTESIANPOINT((600.,0.));
#302=IFCCARTESIANPOINT((600.,200.));
#303=IFCCARTESIANPOINT((200.,200.));
#304=IFCCARTESIANPOINT((200.,600.));
#305=IFCCARTESIANPOINT((0.,600.));
#306=IFCPOLYLINE((#300,#301,#302,#303,#304,#305,#300));
#307=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#306);
#308=IFCEXTRUDEDAREASOLID(#307,#11,#16,100.);
#309=IFCCARTESIANPOINT((300.,300.));
#310=IFCAXIS2PLACEMENT2D(#309,$);
#311=IFCRECTANGLEPROFILEDEF(.AREA.,$,#310,200.,200.);
#312=IFCEXTRUDEDAREASOLID(#311,#11,#16,100.);
#40=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(${items.map((_, i) => `#${103 + i * 10}`).join(",")}));
#41=IFCPRODUCTDEFINITIONSHAPE($,$,(#40));
#42=IFCFURNISHINGELEMENT('1YvctVUKr0kugbFTf53G9A',$,'boxes',$,$,#12,#41,$);
#50=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#308,#312));
#51=IFCPRODUCTDEFINITIONSHAPE($,$,(#50));
#52=IFCFURNISHINGELEMENT('1YvctVUKr0kugbFTf53G9B',$,'L and square',$,$,#12,#51,$);
ENDSEC;END-ISO-10303-21;`;

test("a body's overlapping items are joined: the shared part counts once", () => {
  // door: two 80 x 80 posts at x = +-460, an 860 x 30 leaf between them that runs 10 mm into each
  const res = takeoff(parseStep(itemsFile([[460, 0, 80, 80, 2120], [-460, 0, 80, 80, 2120], [0, 0, 860, 30, 2120]])));
  const [door, ell] = res.rows;
  close(door.computed.gross, (2 * 80 * 80 * 2120 + 860 * 30 * 2120 - 2 * 10 * 30 * 2120) / 1e9);
  assert.ok(door.computed.notes.some((n) => /1 overlapping body item joined/.test(n)), door.computed.notes.join("; "));
  // the L (fanned into signed triangles, 600 x 600 less a 400 x 400 corner) and a
  // 200 x 200 square at (200..400, 200..400) touch along the inner corner only: no overlap
  close(ell.computed.gross, (600 * 600 - 400 * 400 + 200 * 200) * 100 / 1e9);
  assert.ok(!ell.computed.notes.some((n) => /joined/.test(n)));
  // items that only touch face to face are not changed
  const [side] = takeoff(parseStep(itemsFile([[0, 0, 100, 100, 100], [100, 0, 100, 100, 100]]))).rows;
  close(side.computed.gross, 2e-3);
  assert.ok(!side.computed.notes.some((n) => /joined/.test(n)));
  // one box inside another adds nothing
  const [nest] = takeoff(parseStep(itemsFile([[0, 0, 300, 300, 300], [0, 0, 100, 100, 100]]))).rows;
  close(nest.computed.gross, 0.027);
});

test("an element contained in a room takes the storey above the room, and keeps the room as its space", () => {
  const text = sampleText()
    .replace("(#320),#52);", "(#320),#990);")
    .replace("ENDSEC;\nEND-ISO", "#990=IFCSPACE('2kLm0itmV8LpeBgYN1hOY9',$,'01056',$,$,$,$,'Meeting room',.ELEMENT.,.INTERNAL.,$);\n#991=IFCRELAGGREGATES('3kLm0itmV8LpeBgYN1hOY9',$,$,$,#52,(#990));\nENDSEC;\nEND-ISO");
  assert.ok(text.includes("#990=IFCSPACE"), "fixture edit applied");
  const before = sample().rows.find((r) => r.id === 320);
  const r = takeoff(parseStep(Buffer.from(text, "latin1"))).rows.find((x) => x.id === 320);
  assert.equal(before.storey, "Level 2");
  assert.equal(r.storey, "Level 2");
  close(r.storeyElevation, before.storeyElevation);
  assert.equal(r.space, "01056 Meeting room"); // number and name, so two rooms both called "Office" stay apart
  assert.equal(r.spaceFrom, "contained");
  assert.equal(before.space, null);
});

// Steel length and weight from geometry (quality audit 2026-11-22): a beam
// with no quantity set prices per m and per kg from its body, a concrete one
// gets its length but no weight, and a stored figure still wins.
const bareBeams = `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCAXIS2PLACEMENT2D(#10,$);
#16=IFCDIRECTION((0.,0.,1.));
#20=IFCRECTANGLEPROFILEDEF(.AREA.,'100x200',#13,100.,200.);
#21=IFCEXTRUDEDAREASOLID(#20,#11,#16,6000.);
#22=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#21));
#23=IFCPRODUCTDEFINITIONSHAPE($,$,(#22));
#24=IFCBEAM('1YvctVUKr0kugbFTf53O9A',$,'steel',$,$,#12,#23,'B1');
#31=IFCEXTRUDEDAREASOLID(#20,#11,#16,4000.);
#32=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#31));
#33=IFCPRODUCTDEFINITIONSHAPE($,$,(#32));
#34=IFCBEAM('1YvctVUKr0kugbFTf53O9B',$,'concrete',$,$,#12,#33,'B2');
#41=IFCEXTRUDEDAREASOLID(#20,#11,#16,3000.);
#42=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#41));
#43=IFCPRODUCTDEFINITIONSHAPE($,$,(#42));
#44=IFCCOLUMN('1YvctVUKr0kugbFTf53O9C',$,'stored',$,$,#12,#43,'C1');
#45=IFCQUANTITYLENGTH('Length',$,$,2950.);
#46=IFCQUANTITYWEIGHT('NetWeight',$,$,470.);
#47=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53O9C',$,'BaseQuantities',$,$,(#45,#46));
#48=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53O9C',$,$,$,(#44),#47);
#60=IFCMATERIAL('S355JR');
#61=IFCRELASSOCIATESMATERIAL('4YvctVUKr0kugbFTf53O9A',$,$,$,(#24,#44),#60);
#62=IFCMATERIAL('Concrete C30/37');
#63=IFCRELASSOCIATESMATERIAL('4YvctVUKr0kugbFTf53O9B',$,$,$,(#34),#62);
ENDSEC;END-ISO-10303-21;`;

test("steel: a member with no quantity set gets its length from the body and its weight from steel's density", async () => {
  const { isSteel, STEEL_DENSITY } = await import("./qto.mjs");
  const res = takeoff(parseStep(bareBeams));
  const [S, C, K] = res.rows;
  close(S.computed.length, 6);
  const qs = rowQuantities(S);
  close(qs.length, 6); assert.equal(qs.lengthSource, "computed");
  close(qs.weight, 0.1 * 0.2 * 6 * STEEL_DENSITY); assert.equal(qs.weightSource, "density");
  const qc = rowQuantities(C);
  close(qc.length, 4); assert.equal(qc.weight, null);
  const qk = rowQuantities(K);
  assert.equal(qk.lengthSource, "stored"); close(qk.length, 2.95); close(qk.weight, 470); assert.equal(qk.weightSource, "stored");
  const lines = boq(res.rows, ["class", "material"]);
  const steel = lines.find((l) => l.key[0] === "IfcBeam" && l.key[1] === "S355JR");
  assert.equal(steel.lengthComputed, 1); assert.equal(steel.weightComputed, 1); assert.equal(steel.weightMissing, 0);
  const conc = lines.find((l) => l.key[1] === "Concrete C30/37");
  assert.equal(conc.lengthMissing, 0); assert.equal(conc.weightMissing, 1);
  // a per-kg rate now prices the bare steel beam
  const csv = boqCsv(lines, ["class", "material"], { [JSON.stringify(steel.key)]: { rate: 2, unit: "kg" } });
  const row = csv.split("\r\n").find((l) => l.includes("S355JR") && l.startsWith("IfcBeam"));
  assert.match(row, /,6,942,.*,2,kg,1884,1,1,0,0$/);
  for (const m of ["Steel", "STEEL/S235JR", "Stahl S235", "ASTM A992", "Structural Steel - S275", "05 Staal_bordes_hoeklijnen"]) assert.ok(isSteel(m), m);
  for (const m of [null, "Concrete / Steel", "STEEL/NEOPRENE", "Stainless steel", "Steel fibre concrete", "Timber", "Aluminium"]) assert.ok(!isSteel(m), String(m));
});

// ---- eval/curved-and-faces-2026-11-22.md -----------------------------------

const planRow = (id, { ifcClass = "IfcSlab", stored = {}, check = {}, plan } = {}) => ({
  id, tag: null, ifcClass, type: null, pathJoins: [], box: [0, 0, 0, 5, 3, 0.2], stored, areaCheck: check,
  computed: { openings: 0, areas: { plan } },
});
const planCheck = (which, stored, computed) => ({ kind: "plan", which, stored, computed, agree: false });
const ar = (value) => ({ kind: "area", value }), ln = (value) => ({ kind: "length", value });

test("explanations: ArchiCAD's slab GrossArea is its outline, the profile's holes added back (schependomlaan #700118)", async () => {
  const { explainAreas } = await import("./qto.mjs");
  const plan = { gross: 12.1992, net: 12.1992, faces: { gross: [12.1992, 12.1545], net: [12.1992, 12.1545] } };
  const rows = [
    planRow(1, { stored: { GrossArea: ar(13.1481), NetArea: ar(12.1992), "Holes Surface Area": ar(0.9488) }, check: { GrossArea: planCheck("gross", 13.1481, 12.1992) }, plan }),
    // a sloped roof slab: its stored NetArea is the top face, the gross that face plus the holes (#785682)
    planRow(2, { stored: { GrossArea: ar(12.5030), "Holes Surface Area": ar(1.7831) }, check: { GrossArea: planCheck("gross", 12.5030, 11.3869) }, plan: { gross: 11.3869, net: 11.3869, faces: { gross: [11.2730, 10.7199], net: [11.2730, 10.7199] } } }),
    // the same gap with no holes figure stays unexplained
    planRow(3, { stored: { GrossArea: ar(13.1481) }, check: { GrossArea: planCheck("gross", 13.1481, 12.1992) }, plan }),
  ];
  explainAreas(rows);
  assert.equal(rows[0].areaCheck.GrossArea.reason, "holes-added");
  assert.equal(rows[1].areaCheck.GrossArea.reason, "holes-added");
  assert.equal(rows[2].areaCheck.GrossArea.reason, "unexplained");
});

test("explanations: a side area that is the mean of the two faces cut from the geometry (schependomlaan's knee walls)", async () => {
  const { explainAreas } = await import("./qto.mjs");
  const side = { gross: 0.0449, net: 0.0449, faces: { gross: [0.0773, 0.0449], net: [0.0773, 0.0449] }, width: 0.049 };
  const rows = [
    wallRow(1, { side, check: { GrossSideArea: sideCheck("gross", 0.0611, 0.0449) } }),
    wallRow(2, { side, check: { GrossSideArea: sideCheck("gross", 0.0700, 0.0449) } }),
  ];
  explainAreas(rows);
  assert.equal(rows[0].areaCheck.GrossSideArea.reason, "faces-averaged");
  assert.equal(rows[1].areaCheck.GrossSideArea.reason, "unexplained");
});

test("explanations: a covering drawn with ArchiCAD's wall tool stores centre length x thickness (schependomlaan #62352)", async () => {
  const { explainAreas } = await import("./qto.mjs");
  const plan = { gross: 0.0967, net: 0.0967, faces: { gross: [0.0967, 0.0967], net: [0.0967, 0.0967] } };
  const stored = { GrossArea: ar(0.0885), "Length of the Wall at the Center": ln(1.1961), Thickness: ln(0.074) };
  const rows = [
    planRow(1, { ifcClass: "IfcCovering", stored, check: { GrossArea: planCheck("gross", 0.0885, 0.0967) }, plan }),
    planRow(2, { ifcClass: "IfcCovering", stored: { ...stored, Thickness: ln(0.09) }, check: { GrossArea: planCheck("gross", 0.0885, 0.0967) }, plan }),
  ];
  explainAreas(rows);
  assert.equal(rows[0].areaCheck.GrossArea.reason, "centre-line");
  assert.equal(rows[1].areaCheck.GrossArea.reason, "unexplained");
});

test("explanations: a stored area that is one plane's face of the body (schependomlaan's sill #868801)", async () => {
  const { explainAreas } = await import("./qto.mjs");
  const plan = (planes) => ({ gross: 0.0044, net: 0.0044, faces: { gross: [0.0044, 0.0044], net: [0.0044, 0.0044] }, planes });
  const rows = [
    planRow(1, { ifcClass: "IfcCovering", check: { GrossArea: planCheck("gross", 0.6777, 0.0044) }, plan: plan([0.67771, 0.06161, 0.0044]) }),
    planRow(2, { ifcClass: "IfcCovering", check: { GrossArea: planCheck("gross", 0.6777, 0.0044) }, plan: plan([0.7, 0.06161, 0.0044]) }),
  ];
  explainAreas(rows);
  assert.equal(rows[0].areaCheck.GrossArea.reason, "a-body-face");
  assert.equal(rows[1].areaCheck.GrossArea.reason, "unexplained");
});

test("explanations: a curved wall's side is not a plane cut (skolebygg's quarter-arc walls)", async () => {
  const { explainAreas } = await import("./qto.mjs");
  const side = (curved) => ({ gross: 0.7573, net: 0.7573, faces: { gross: [0.0002, 0.0427], net: [0.0002, 0.0427] }, width: 0.821, curved });
  const rows = [
    wallRow(1, { side: side(true), check: { GrossSideArea: sideCheck("gross", 2.5918, 0.7573) } }),
    wallRow(2, { side: side(undefined), check: { GrossSideArea: sideCheck("gross", 2.5918, 0.7573) } }),
    // measured on its facets (curvedFaces): the outer face is the stored figure
    wallRow(3, { side: { gross: 2.4445, net: 2.4445, faces: { gross: [2.5918, 2.2973], net: [2.5918, 2.2973] }, chord: { gross: 0.7573, net: 0.7573 }, width: 0.25, curved: true }, check: { GrossSideArea: sideCheck("gross", 2.5918, 2.4445) } }),
  ];
  explainAreas(rows);
  assert.equal(rows[2].areaCheck.GrossSideArea.reason, "curved-face");
  assert.equal(rows[2].areaCheck.GrossSideArea.trust, true);
  assert.equal(rows[0].areaCheck.GrossSideArea.reason, "curved");
  assert.equal(rows[0].areaCheck.GrossSideArea.trust, true);
  assert.equal(rows[1].areaCheck.GrossSideArea.reason, "unexplained");
});

test("bendsInPlan: a quarter-arc wall bends, a straight one and one with a rounded nib do not; planeAreas per plane", async () => {
  const { bendsInPlan, planeAreas } = await import("./geom.mjs");
  const arc = (r, n) => Array.from({ length: n + 1 }, (_, i) => [r * Math.cos((i * Math.PI) / 2 / n), r * Math.sin((i * Math.PI) / 2 / n)]);
  // 90 facets each side, 2.2 m outside and 1.95 m inside, 0.75 m high
  const plan = [...arc(2.2, 90), ...arc(1.95, 90).reverse()];
  const curved = { terms: [], mesh: 1, shells: [{ s: 1, loops: prism(plan, [0, 0, 0.75]) }] };
  assert.equal(bendsInPlan(curved, [0, 0, 1], [Math.SQRT1_2, Math.SQRT1_2, 0]), true);
  const box = { terms: [{ s: 1, faces: prism([[0, 0], [3, 0], [3, 0.25], [0, 0.25]], [0, 0, 2]) }], mesh: 0, shells: [] };
  assert.equal(bendsInPlan(box, [0, 0, 1], [0, 1, 0]), false);
  // a 3 m wall with a 20 mm half-round nib on one face: 12 small faces in 12 directions
  const nib = Array.from({ length: 13 }, (_, i) => [1.5 + 0.02 * Math.cos(Math.PI - (i * Math.PI) / 12), -0.02 * Math.sin((i * Math.PI) / 12)]);
  const nibbed = { terms: [], mesh: 1, shells: [{ s: 1, loops: prism([[0, 0], ...nib, [3, 0], [3, 0.07], [0, 0.07]], [0, 0, 2]) }] };
  assert.equal(bendsInPlan(nibbed, [0, 0, 1], [0, 1, 0]), false);
  // its faces on the facets: 90 chords of 1 degree on each radius, x 0.75 m
  const { curvedFaces } = await import("./geom.mjs");
  const chords = (r) => 90 * 2 * r * Math.sin(Math.PI / 360) * 0.75;
  const F = curvedFaces(curved, [0, 0, 1]);
  assert.ok(Math.abs(F.outer - chords(2.2)) < 1e-9 && Math.abs(F.inner - chords(1.95)) < 1e-9);
  // the facets stand at their apothems, r cos(0.5 degrees)
  assert.ok(Math.abs(F.rOuter - F.rInner - 0.25 * Math.cos(Math.PI / 360)) < 1e-9 && Math.hypot(...F.centre) < 1e-9);
  assert.equal(curvedFaces(box, [0, 0, 1]), null);
  const P = planeAreas(box).map((p) => p.area).sort((a, b) => a - b);
  assert.deepEqual(P.map((x) => +x.toFixed(9)), [0.5, 0.5, 0.75, 0.75, 6, 6]);
});

// skolebygg's #1455746 and #1457200 (eval/triangulated-arc-breps-2026-11-23.md):
// a quarter-ring wall with a duct along its foot, and curved faces
// triangulated between vertices at different angles, so the triangles lean
test("curvedFaces: a duct inside the wall is on neither face; the volume it leaves is still swept", async () => {
  const { curvedFaces, solidVolume } = await import("./geom.mjs");
  const N = 30, step = Math.PI / 2 / N;
  const at = (r, i) => [r * Math.cos(i * step), r * Math.sin(i * step)];
  const lift = (faces, z0) => faces.map((f) => f.map(([x, y, z]) => [x, y, z + z0]));
  // convex pieces per facet: outer skin 2.2-2.3 full height, inner skin
  // 1.877-1.95 under the duct, a block 1.877-2.2 over it (0.75 to 3.97)
  const piece = (r0, r1, i, z0, z1) => ({ s: 1, faces: lift(prism([at(r0, i), at(r1, i), at(r1, i + 1), at(r0, i + 1)], [0, 0, z1 - z0]), z0) });
  const terms = [];
  for (let i = 0; i < N; i++) terms.push(piece(2.2, 2.3, i, 0, 3.97), piece(1.877, 1.95, i, 0, 0.75), piece(1.877, 2.2, i, 0.75, 3.97));
  const wall = { terms, mesh: 0, shells: [] };
  const chords = (r, h) => N * 2 * r * Math.sin(step / 2) * h;
  const F = curvedFaces(wall, [0, 0, 1]);
  assert.ok(Math.abs(F.outer - chords(2.3, 3.97)) < 1e-9, `outer ${F.outer}`);
  assert.ok(Math.abs(F.inner - chords(1.877, 3.97)) < 1e-9, `inner ${F.inner}`);
  assert.ok(Math.abs(F.hidden - chords(1.95, 0.75) - chords(2.2, 0.75)) < 1e-9, `hidden ${F.hidden}`);
  const V = solidVolume(wall);
  assert.ok(Math.abs(F.swept - V) < 1e-9 * V, `swept ${F.swept} vs ${V}`);
  // the one-section check (mean face x width) misses it by 13%
  assert.ok(((F.outer + F.inner) / 2) * (F.rOuter - F.rInner) > 1.1 * V);
});

test("curvedFaces: triangles leaning off the vertical on a curved face are read", async () => {
  const { curvedFaces, shellVolume } = await import("./geom.mjs");
  // 20 facets of 4.5 degrees, 0.75 m high: the top ring sits half a facet
  // round from the bottom, so each triangle leans about 0.0024 off upright
  const N = 20, step = Math.PI / 2 / N, h = 0.75;
  const P = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];
  const bot = Array.from({ length: N + 1 }, (_, i) => i * step);
  const top = [0, ...Array.from({ length: N }, (_, i) => (i + 0.5) * step), N * step];
  // a strip between the two rings, triangles by the next lower angle
  const strip = (r, flip) => {
    const t = [];
    let i = 0, j = 0;
    while (i < bot.length - 1 || j < top.length - 1) {
      const nextBot = i < bot.length - 1 && (j === top.length - 1 || bot[i + 1] <= top[j + 1]);
      const tri = nextBot ? [P(r, bot[i], 0), P(r, bot[i + 1], 0), P(r, top[j], h)] : [P(r, bot[i], 0), P(r, top[j + 1], h), P(r, top[j], h)];
      if (nextBot) i++; else j++;
      t.push(flip ? tri.reverse() : tri);
    }
    return t;
  };
  const ro = 2.3, ri = 2.0;
  const outer = strip(ro, false), inner = strip(ri, true);
  const loops = [
    ...outer, ...inner,
    [...bot.map((a) => P(ro, a, 0)), ...bot.slice().reverse().map((a) => P(ri, a, 0))].reverse(),
    [...top.map((a) => P(ro, a, h)), ...top.slice().reverse().map((a) => P(ri, a, h))],
    [P(ri, 0, 0), P(ro, 0, 0), P(ro, 0, h), P(ri, 0, h)].reverse(),
    [P(ri, N * step, 0), P(ro, N * step, 0), P(ro, N * step, h), P(ri, N * step, h)],
  ];
  // a faceted body carries its volume as `mesh`
  const V = shellVolume(loops);
  const wall = { terms: [], mesh: V, shells: [{ s: 1, loops }] };
  assert.ok(V > 0);
  const area = (ts) => ts.reduce((s, [a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return s + Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }, 0);
  const lean = Math.max(...outer.map(([a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return Math.abs(n[2]) / Math.hypot(...n);
  }));
  assert.ok(lean > 1e-3 && lean < 0.01, `lean ${lean}`);
  const F = curvedFaces(wall, [0, 0, 1]);
  assert.ok(Math.abs(F.outer - area(outer)) < 1e-9 && Math.abs(F.inner - area(inner)) < 1e-9, JSON.stringify(F));
  assert.equal(F.hidden, 0);
  assert.ok(Math.abs(F.swept - V) < 1e-3 * V, `swept ${F.swept} vs ${V}`);
});

// ISSUE_129's #36735 and #148665 (eval/half-round-ends-2026-11-23.md): a
// half-ring wall extruded from a drawn profile, so its convex pieces are a
// signed fan; its two ends lie on one plane through the centre, and the cuts
// of two openings, one at each end, share two planes
test("curvedFaces: a half ring's coplanar ends and paired opening cuts are on neither face", async () => {
  const { curvedFaces, solidVolume, subtractCutters, cuttersOf } = await import("./geom.mjs");
  const N = 180, ro = 20.2, ri = 18.4, h = 1.55;
  const arc = (r, rev) => Array.from({ length: N + 1 }, (_, i) => { const a = -Math.PI / 2 + (Math.PI * (rev ? N - i : i)) / N; return [r * Math.cos(a), r * Math.sin(a)]; });
  const outerPts = arc(ro, false), innerPts = arc(ri, true);
  const pieces = convexPieces([...outerPts, ...innerPts]);
  assert.ok(pieces.some((q) => q.s < 0), "a signed fan, as the engine builds a drawn profile");
  const wall = { terms: pieces.map((q) => ({ s: q.s, faces: prism(q.pts, [0, 0, h]) })), mesh: 0, shells: [], notes: [] };
  const chain = (pts, x0 = -Infinity, x1 = Infinity) => {
    let L = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const lo = Math.max(x0, Math.min(a[0], b[0])), hi = Math.min(x1, Math.max(a[0], b[0]));
      L += a[0] === b[0] ? (a[0] >= x0 && a[0] <= x1 ? len : 0) : Math.max(0, hi - lo) / Math.abs(b[0] - a[0]) * len;
    }
    return L;
  };
  const F = curvedFaces(wall, [0, 0, 1]);
  // before: both ends (2 x 1.8 x 1.55 = 5.58) were read as outer face
  assert.ok(Math.abs(F.outer - chain(outerPts) * h) < 1e-9, `outer ${F.outer}`);
  assert.ok(Math.abs(F.inner - chain(innerPts) * h) < 1e-9, `inner ${F.inner}`);
  const V = Math.abs(solidVolume(wall));
  assert.ok(Math.abs(((F.outer + F.inner) / 2) * (F.rOuter - F.rInner) - V) < 2e-4 * V);
  // two openings through the ring near its ends, cut by the same planes x = 5.67 and 10.95
  const box = (y0, y1) => ({ terms: [{ s: 1, faces: prism([[5.67, y0], [10.95, y0], [10.95, y1], [5.67, y1]], [0, 0, h + 2]).map((f) => f.map(([x, y, z]) => [x, y, z - 1])) }] });
  let net = wall;
  for (const b of [box(12, 22), box(-22, -12)]) net = subtractCutters(net, cuttersOf(b), "opening");
  const G = curvedFaces(net, [0, 0, 1]);
  // both openings: the clip by x takes the chain north and south of the centre
  const off = (pts) => chain(pts, 5.67, 10.95) * h;
  assert.ok(Math.abs(G.outer - (F.outer - off(outerPts))) < 1e-6, `net outer ${G.outer} vs ${F.outer - off(outerPts)}`);
  assert.ok(Math.abs(G.inner - (F.inner - off(innerPts))) < 1e-6, `net inner ${G.inner} vs ${F.inner - off(innerPts)}`);
  const Vn = Math.abs(solidVolume(net));
  assert.ok(Math.abs(((G.outer + G.inner) / 2) * (G.rOuter - G.rInner) - Vn) < 1e-3 * Vn);
});

// ArchiCAD measures a drawn profile with its arcs as 45-degree chords and a
// round column as a circumscribed 20-gon (eval/archicad-polygon-sections-2026-11-23.md)
const polygonFile = (storedNotch, storedColumn) => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53P9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCAXIS2PLACEMENT2D(#10,$);
#16=IFCDIRECTION((0.,0.,1.));
#100=IFCCARTESIANPOINT((-20.,0.));
#101=IFCCARTESIANPOINT((20.,0.));
#102=IFCCARTESIANPOINT((20.,20.));
#103=IFCCARTESIANPOINT((10.,20.));
#104=IFCCARTESIANPOINT((-10.,20.));
#105=IFCCARTESIANPOINT((-20.,20.));
#106=IFCCARTESIANPOINT((0.,20.));
#107=IFCAXIS2PLACEMENT2D(#106,$);
#108=IFCCIRCLE(#107,10.);
#109=IFCPOLYLINE((#100,#101,#102,#103));
#110=IFCTRIMMEDCURVE(#108,(#103,IFCPARAMETERVALUE(0.)),(#104,IFCPARAMETERVALUE(180.)),.F.,.CARTESIAN.);
#111=IFCPOLYLINE((#104,#105,#100));
#112=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#109);
#113=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#110);
#114=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#111);
#115=IFCCOMPOSITECURVE((#112,#113,#114),.F.);
#116=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'sill with a round groove',#115);
#117=IFCEXTRUDEDAREASOLID(#116,#11,#16,1000.);
#118=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#117));
#119=IFCPRODUCTDEFINITIONSHAPE($,$,(#118));
#120=IFCCOVERING('1YvctVUKr0kugbFTf53P9A',$,'sill',$,$,#12,#119,$,$);
#121=IFCQUANTITYVOLUME('Net Volume',$,$,${storedNotch});
#122=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53P9A',$,'ArchiCADQuantities',$,$,(#121));
#123=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53P9A',$,$,$,(#120),#122);
#130=IFCCIRCLEPROFILEDEF(.AREA.,'',#13,100.);
#131=IFCEXTRUDEDAREASOLID(#130,#11,#16,2700.);
#132=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#131));
#133=IFCPRODUCTDEFINITIONSHAPE($,$,(#132));
#134=IFCCOLUMN('1YvctVUKr0kugbFTf53P9B',$,'D200',$,$,#12,#133,$);
#135=IFCQUANTITYVOLUME('NetVolume',$,$,${storedColumn});
#136=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53P9B',$,'BaseQuantities',$,$,(#135));
#137=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53P9B',$,$,$,(#134),#136);
ENDSEC;END-ISO-10303-21;`;

test("explanations: a stored volume on arcs as 45-degree chords or a circumscribed 20-gon is polygon-section, inside or outside the 2% (ArchiCAD)", () => {
  // the groove (half circle r 10) as 4 chords: 800 - 4 x 50 sin 45 deg, against 800 - 50 pi
  const exactNotch = (800 - 50 * Math.PI) * 1e-6, chordNotch = (800 - 200 * Math.sin(Math.PI / 4)) * 1e-6;
  // C20's D200: 20 x 0.1^2 x tan 9 deg x 2.7, stored as 0.0855275977753
  const column = 20 * 0.01 * Math.tan(Math.PI / 20) * 2.7;
  close(column, 0.0855275977753, 1e-12);
  const [sill, col] = takeoff(parseStep(polygonFile(chordNotch, column))).rows;
  for (const r of [sill, col]) {
    assert.equal(r.check.net.agree, r === col, r.name); // 2.4% and 0.8%: the groove is outside, the column inside the 2%
    assert.equal(r.check.net.reason, "polygon-section", r.name);
    assert.equal(r.trustStored, false);
    assert.equal(rowQuantities(r).volumeSource, "computed");
  }
  assert.equal(sill.check.net.section, "arcs as 45-degree chords");
  assert.equal(col.check.net.section, "circles as circumscribed 20-gons");
  close(sill.computed.gross / exactNotch, 1, 1e-4); // the engine draws arcs as 1-degree chords
  // a stored figure near but not on the polygon (0.05% off it) is a plain agreement
  const [s2, c2] = takeoff(parseStep(polygonFile(exactNotch * 1.0005, column * 1.0005))).rows;
  for (const r of [s2, c2]) { assert.equal(r.check.net.agree, true); assert.equal(r.check.net.reason, undefined); assert.equal(r.trustStored, true); }
});

// dental_clinic's partition #1674 as written: an arc profile between circles
// of 4.9354 and 5.0594 m, ends cut square to the plan axes (not along a
// radius), 0.668 m high, and here a 0.8 x 0.3 m opening through its middle
// (eval/curved-side-area-2026-11-23.md)
const arcWallFile = (storedSide) => `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53P9L',$,'p',$,$,$,$,$,#2);
#2=IFCUNITASSIGNMENT((#3,#5));
#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#4=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#5=IFCCONVERSIONBASEDUNIT(#6,.PLANEANGLEUNIT.,'DEGREE',#7);
#6=IFCDIMENSIONALEXPONENTS(0,0,0,0,0,0,0);
#7=IFCMEASUREWITHUNIT(IFCPLANEANGLEMEASURE(0.0174532925199433),#4);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#16=IFCDIRECTION((0.,0.,1.));
#20=IFCCARTESIANPOINT((3.91471628788658,-3.106318873909782));
#21=IFCDIRECTION((1.,0.));
#22=IFCAXIS2PLACEMENT2D(#20,#21);
#23=IFCCIRCLE(#22,4.935421391182919);
#24=IFCCIRCLE(#22,5.059421391182918);
#25=IFCTRIMMEDCURVE(#23,(IFCPARAMETERVALUE(141.5680761427487)),(IFCPARAMETERVALUE(218.9441241541247)),.T.,.PARAMETER.);
#26=IFCTRIMMEDCURVE(#24,(IFCPARAMETERVALUE(142.6739435505508)),(IFCPARAMETERVALUE(217.8181222408535)),.T.,.PARAMETER.);
#27=IFCCARTESIANPOINT((0.04856752930165641,-0.03853822903991245));
#28=IFCCARTESIANPOINT((-0.1085245361905843,-0.03853822903991245));
#29=IFCCARTESIANPOINT((-0.0820298744579635,-6.208538229039827));
#30=IFCCARTESIANPOINT((0.07614632223498968,-6.208538229039827));
#31=IFCPOLYLINE((#27,#28));
#32=IFCPOLYLINE((#29,#30));
#33=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.F.,#25);
#34=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#31);
#35=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#26);
#36=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#32);
#37=IFCCOMPOSITECURVE((#33,#34,#35,#36),.F.);
#38=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#37);
#39=IFCEXTRUDEDAREASOLID(#38,#11,#16,0.668);
#40=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#39));
#41=IFCPRODUCTDEFINITIONSHAPE($,$,(#40));
#42=IFCWALLSTANDARDCASE('2Ynk$BaAz6sA1QNF3FzSDF',$,'Basic Wall:Interior - Partition (92mm Stud)',$,$,#12,#41,$);
#43=IFCQUANTITYAREA('GrossSideArea',$,$,${storedSide});
#44=IFCELEMENTQUANTITY('2YvctVUKr0kugbFTf53P9A',$,'BaseQuantities',$,$,(#43));
#45=IFCRELDEFINESBYPROPERTIES('3YvctVUKr0kugbFTf53P9A',$,$,$,(#42),#44);
#50=IFCCARTESIANPOINT((-1.3,-3.506318873909782,0.2));
#51=IFCAXIS2PLACEMENT3D(#50,$,$);
#52=IFCCARTESIANPOINT((0.,0.));
#53=IFCAXIS2PLACEMENT2D(#52,$);
#54=IFCRECTANGLEPROFILEDEF(.AREA.,$,#53,0.4,0.8);
#55=IFCAXIS2PLACEMENT2D(#56,$);
#56=IFCCARTESIANPOINT((0.2,0.4));
#57=IFCRECTANGLEPROFILEDEF(.AREA.,$,#55,0.4,0.8);
#58=IFCEXTRUDEDAREASOLID(#57,#51,#16,0.3);
#59=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#58));
#60=IFCPRODUCTDEFINITIONSHAPE($,$,(#59));
#61=IFCOPENINGELEMENT('1YvctVUKr0kugbFTf53P9C',$,'hole',$,$,#12,#60,$);
#62=IFCRELVOIDSELEMENT('4YvctVUKr0kugbFTf53P9A',$,$,$,#42,#61);
ENDSEC;END-ISO-10303-21;`;

test("a wall on an arc is measured on its facets: outer and inner faces, their mean as the side, the opening off both (dental_clinic #1674)", async () => {
  const H = 0.668, deg = Math.PI / 180;
  const inner = 4.935421391182919 * (218.9441241541247 - 141.5680761427487) * deg * H;
  const outer = 5.059421391182918 * (217.8181222408535 - 142.6739435505508) * deg * H;
  const r = takeoff(parseStep(arcWallFile(outer.toFixed(4)))).rows.find((x) => x.ifcClass === "IfcWallStandardCase");
  const S = r.computed.areas.side;
  assert.equal(S.curved, true);
  const near = (a, b, tol) => assert.ok(Math.abs(a / b - 1) < tol, `${a} vs ${b}`);
  near(S.faces.gross[0], outer, 1e-4);
  near(S.faces.gross[1], inner, 1e-4);
  near(S.gross, (outer + inner) / 2, 1e-4);
  near(S.width, 0.124, 1e-3);
  near(S.radius.outer, 5.0594, 1e-3);
  // the opening's 0.8 x 0.3 m comes off each face (0.8 m of arc within
  // 0.1% at this radius), not the chord cut's
  near(S.faces.gross[0] - S.faces.net[0], 0.24, 2e-3);
  near(S.faces.gross[1] - S.faces.net[1], 0.24, 2e-3);
  assert.ok(S.chord.gross < 0.5, "the plane cut is a chord's elevation");
  // a thin wall: the mean is within 2% of the outer face Revit stores, so the
  // pair agrees, where the chord cut (0.37 m2) called it 92% off
  assert.equal(r.areaCheck.GrossSideArea.agree, true);
});
