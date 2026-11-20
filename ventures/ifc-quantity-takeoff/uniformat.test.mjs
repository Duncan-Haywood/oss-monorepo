import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUniformat, ruleCode, assignUniformat, uniformatLabel, uniformatSummary, UNIFORMAT } from "./uniformat.mjs";
import { parseStep } from "./step.mjs";
import { takeoff, boq, boqCsv } from "./qto.mjs";

test("model codes are cut to level 3 and checked against the table", () => {
  assert.equal(parseUniformat("B2020100"), "B2020");
  assert.equal(parseUniformat("C1020"), "C1020");
  assert.equal(parseUniformat("B10"), "B10");
  assert.equal(parseUniformat("d2010400"), "D2010");
  assert.equal(parseUniformat("E30"), null); // a fire rating, not E30 (no such element)
  assert.equal(parseUniformat("EI 60 EI 60"), null);
  assert.equal(parseUniformat("21.12"), null); // NL/SfB
  assert.equal(parseUniformat("B9999"), null);
  assert.equal(parseUniformat(""), null);
});

const row = (o) => ({ id: o.id ?? 1, ifcClass: o.cls ?? "IfcWall", ifcType: (o.cls ?? "IfcWall").toUpperCase(), effectiveClass: (o.eff ?? o.cls ?? "IfcWall").toUpperCase(), predefinedType: o.pdt ?? null, isExternal: o.ext ?? null, storeyElevation: o.elev ?? 0, storey: "L", name: o.name ?? null, type: o.type ?? null, parent: o.parent ?? null, host: o.host ?? null, uniformatCodes: o.codes ?? [], isAssembly: false });
const none = () => null;

test("walls: IsExternal decides exterior wall, partition or basement wall", () => {
  assert.equal(ruleCode(row({ ext: true }), none).code, "B2010");
  assert.equal(ruleCode(row({ ext: false }), none).code, "C1010");
  assert.equal(ruleCode(row({ ext: true, elev: -3 }), none).code, "A2020");
  assert.equal(ruleCode(row({}), none).code, null);
});

test("doors follow their own flag, else the wall they fill", () => {
  const walls = new Map([[10, row({ id: 10, ext: true })], [11, row({ id: 11, ext: false })]]);
  const ctx = (id) => walls.get(id);
  assert.equal(ruleCode(row({ cls: "IfcDoor", ext: false, host: 10 }), ctx).code, "C1020");
  assert.equal(ruleCode(row({ cls: "IfcDoor", host: 10 }), ctx).code, "B2030");
  assert.equal(ruleCode(row({ cls: "IfcDoor", host: 11 }), ctx).code, "C1020");
  assert.equal(ruleCode(row({ cls: "IfcDoor" }), ctx).code, "C10");
});

test("windows are exterior even when flagged interior; in a roof they are roof openings", () => {
  const hosts = new Map([[20, row({ id: 20, cls: "IfcRoof" })]]);
  assert.equal(ruleCode(row({ cls: "IfcWindow", ext: false }), none).code, "B2020");
  assert.equal(ruleCode(row({ cls: "IfcWindow", host: 20 }), (id) => hosts.get(id)).code, "B3020");
});

test("slabs, coverings and parts", () => {
  assert.equal(ruleCode(row({ cls: "IfcSlab", pdt: "BASESLAB" }), none).code, "A1030");
  assert.equal(ruleCode(row({ cls: "IfcSlab", pdt: "ROOF" }), none).code, "B1020");
  assert.equal(ruleCode(row({ cls: "IfcSlab", pdt: "FLOOR", elev: -3 }), none).code, "A1030");
  assert.equal(ruleCode(row({ cls: "IfcCovering", pdt: "CEILING" }), none).code, "C3030");
  const parent = row({ id: 30, cls: "IfcCurtainWall" });
  assert.equal(ruleCode(row({ cls: "IfcPlate", parent: 30 }), () => parent).code, "B2010");
  const wall = row({ id: 31, ext: false });
  assert.equal(ruleCode(row({ cls: "IfcBuildingElementPart", parent: 31 }), () => wall).code, "C1010");
});

test("names tell generic terminals and accessories apart", () => {
  assert.equal(ruleCode(row({ cls: "IfcFlowTerminal", name: "WC-GBG-Nautic_1522-Wall_Mounted" }), none).code, "D2010");
  assert.equal(ruleCode(row({ cls: "IfcFlowTerminal", eff: "IfcSanitaryTerminal", name: "M_Grab Bars:8370-001300" }), none).code, "C1030");
  assert.equal(ruleCode(row({ cls: "IfcFlowTerminal", eff: "IfcSanitaryTerminal", name: "M_Toilet-Commercial" }), none).code, "D2010");
  assert.equal(ruleCode(row({ cls: "IfcBuildingElementProxy", name: "Refrigerator:Ref" }), none).code, "E1090");
  assert.equal(ruleCode(row({ cls: "IfcBuildingElementProxy", name: "Generic Model 1" }), none).code, null);
});

test("the model's own code wins and is compared with the rule", () => {
  const rows = [row({ ext: false, codes: [{ code: "B2010100", from: "Assembly Code" }] }), row({ id: 2, ext: true })];
  assignUniformat(rows);
  assert.deepEqual([rows[0].uniformat.code, rows[0].uniformat.source, rows[0].uniformat.rule], ["B2010", "model", "C1010"]);
  assert.equal(rows[1].uniformat.source, "rule");
  const s = uniformatSummary(rows);
  assert.equal(s.compared, 1); assert.equal(s.agree1, 0); assert.equal(s.agree3, 0);
  assert.equal(uniformatLabel(rows[1], 2), "B20 Exterior Enclosure");
  assert.equal(UNIFORMAT.B2010, "Exterior Walls");
});

test("sample: the bill of quantities groups by Uniformat element", () => {
  const res = takeoff(parseStep(readFileSync(new URL("./samples/sample-office.ifc", import.meta.url))), {});
  const lines = boq(res.rows, ["uniformat"]);
  const walls = lines.find((l) => l.key[0] === "B2010 Exterior Walls");
  assert.equal(walls.count, 4);
  assert.ok(Math.abs(walls.volume - 8.18) < 1e-6);
  assert.ok(lines.some((l) => l.key[0] === "B1010 Floor Construction"));
  assert.match(boqCsv(lines, ["uniformat"]), /^Uniformat II element,Count/);
});

// red team 2026-11-20: wrong answers found by hand, and the escaped mutants
test("a malformed code is not read as its first three characters", () => {
  assert.equal(parseUniformat("B201"), null); // was B20
  assert.equal(parseUniformat("B20"), "B20");
  assert.equal(parseUniformat("B2010.10"), "B2010");
  assert.equal(parseUniformat("B 2010"), "B2010");
});

test("a door that is part of a curtain wall is a door, not wall", () => {
  const cw = row({ id: 40, cls: "IfcCurtainWall" });
  const icw = row({ id: 41, cls: "IfcCurtainWall", ext: false });
  const ctx = (id) => ({ 40: cw, 41: icw })[id];
  assert.equal(ruleCode(row({ cls: "IfcDoor", ext: true, parent: 40 }), ctx).code, "B2030");
  assert.equal(ruleCode(row({ cls: "IfcDoor", ext: false, parent: 40 }), ctx).code, "C1020");
  assert.equal(ruleCode(row({ cls: "IfcDoor", parent: 40 }), ctx).code, "B2030"); // the curtain wall is taken as exterior
  assert.equal(ruleCode(row({ cls: "IfcDoor", parent: 41 }), ctx).code, "C1020");
});

test("coverings in a roof or stair are roof coverings and stair finishes", () => {
  const roof = row({ id: 50, cls: "IfcRoof" }), stair = row({ id: 51, cls: "IfcStair" });
  const ctx = (id) => ({ 50: roof, 51: stair })[id];
  assert.equal(ruleCode(row({ cls: "IfcCovering", pdt: "ROOFING", parent: 50 }), ctx).code, "B3010");
  assert.equal(ruleCode(row({ cls: "IfcCovering", pdt: "ROOFING" }), none).code, "B3010");
  assert.equal(ruleCode(row({ cls: "IfcCovering", parent: 50 }), ctx).code, "B3010");
  assert.equal(ruleCode(row({ cls: "IfcCovering", pdt: "INSULATION", parent: 50 }), ctx).code, "B3010");
  assert.equal(ruleCode(row({ cls: "IfcCovering", pdt: "CEILING", parent: 50 }), ctx).code, "C3030");
  assert.equal(ruleCode(row({ cls: "IfcCovering", pdt: "FLOORING" }), none).code, "C3020");
  assert.equal(ruleCode(row({ cls: "IfcCovering", pdt: "FLOORING", parent: 51 }), ctx).code, "C2020");
  assert.equal(ruleCode(row({ cls: "IfcSlab", pdt: "BASESLAB", parent: 50 }), ctx).code, "B1020"); // a slab in a roof is still roof construction
});

test("members, transport elements and paving", () => {
  assert.equal(ruleCode(row({ cls: "IfcMember", pdt: "MULLION" }), none).code, "B2010");
  assert.equal(ruleCode(row({ cls: "IfcMember" }), none).code, "B10");
  assert.equal(ruleCode(row({ cls: "IfcTransportElement", pdt: "ELEVATOR" }), none).code, "D1010");
  assert.equal(ruleCode(row({ cls: "IfcTransportElement", pdt: "ESCALATOR" }), none).code, "D1020");
  assert.equal(ruleCode(row({ cls: "IfcTransportElement" }), none).code, "D10");
  for (const cls of ["IfcKerb", "IfcPavement", "IfcCourse"]) assert.equal(ruleCode(row({ cls }), none).code, "G20", cls);
});

test("the summary counts every source from zero", () => {
  const rows = [row({ ext: true }), row({ id: 2, codes: [{ code: "C1010", from: "Assembly Code" }] }), row({ id: 3 })];
  assignUniformat(rows);
  const s = uniformatSummary(rows);
  assert.deepEqual([s.rows, s.model, s.rule, s.none, s.level3, s.compared, s.ruleSilent], [3, 1, 1, 1, 2, 1, 1]);
});
