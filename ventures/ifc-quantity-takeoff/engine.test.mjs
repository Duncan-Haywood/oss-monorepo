// Volumes and quantities checked against hand calculations and published
// section tables, never against this code's own earlier output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { takeoff, boq, boqCsv, rowsCsv, readUnits, explainChecks } from "./qto.mjs";
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
  assert.equal(beam.check.net.reason, "unexplained");
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
  assert.match(row, /,150,m3,750$/);
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

test("explanations: a stored volume a power of ten off is a unit slip", () => {
  const row = (stored, computed) => ({ tag: null, ifcClass: "IfcSlab", stored: {}, computed: { gross: computed, net: computed, openings: 0 }, check: { gross: { computed, stored, rel: (computed - stored) / stored, agree: false } } });
  const rows = [row(354722.9, 354.7229), row(5, 3)];
  explainChecks(rows);
  assert.equal(rows[0].check.gross.reason, "unit-slip");
  assert.equal(rows[0].check.gross.factor, 1000);
  assert.equal(rows[0].trustStored, false);
  assert.equal(rows[1].check.gross.reason, "unexplained");
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
