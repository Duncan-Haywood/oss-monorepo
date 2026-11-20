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
  // its one slab is at the bottom of the model with nothing under it
  assert.ok(lines.some((l) => l.key[0] === "A1030 Slab on Grade"));
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

test("frame members are split by what they carry: floor, roof or slab on grade", () => {
  const fr = (o) => ({ ...row(o), box: o.box });
  const rows = [
    fr({ id: 1, cls: "IfcSlab", pdt: "FLOOR", box: [0, 0, 3.0, 10, 10, 3.25] }),
    fr({ id: 2, cls: "IfcSlab", pdt: "ROOF", box: [0, 0, 6.2, 10, 10, 6.5] }),
    fr({ id: 3, cls: "IfcSlab", pdt: "BASESLAB", box: [20, 0, -0.2, 30, 10, 0] }),
    fr({ id: 10, cls: "IfcBeam", box: [1, 1, 2.6, 5, 1.3, 3.25] }), // top flush with the floor's top
    fr({ id: 11, cls: "IfcColumn", box: [2, 2, 3.25, 2.3, 2.3, 6.2] }), // stops under the roof
    fr({ id: 12, cls: "IfcColumn", box: [2, 2, 0, 2.3, 2.3, 3.0] }), // stops under the floor
    fr({ id: 13, cls: "IfcBeam", box: [21, 1, -0.6, 25, 1.3, -0.2] }), // under the slab on grade
    fr({ id: 14, cls: "IfcBeam", box: [40, 1, 2.6, 45, 1.3, 3.0] }), // nothing over it
    fr({ id: 15, cls: "IfcBeam", box: [1, 1, 1.0, 5, 1.3, 1.4] }), // the floor is 1.6 m higher: too far to bear
    fr({ id: 16, cls: "IfcBeam", elev: -1, box: [1, 1, -1.0, 5, 1.3, 2.9] }), // footing beam on a foundation storey
    fr({ id: 17, cls: "IfcBeam", elev: -3, box: [1, 1, 2.5, 5, 1.3, 2.9] }), // basement ceiling beam
    fr({ id: 18, cls: "IfcBeam" }), // geometry not read
  ];
  assignUniformat(rows);
  const code = (id) => rows.find((r) => r.id === id).uniformat.code;
  assert.deepEqual([10, 11, 12, 13, 14, 15, 16, 17, 18].map(code), ["B1010", "B1020", "B1010", "A1010", "B10", "B10", "A1010", "B1010", "B10"]);
  assert.match(rows.find((r) => r.id === 11).uniformat.why, /under the roof/);
  assert.match(rows.find((r) => r.id === 18).uniformat.why, /geometry not read/);
});

test("curtain panels go with the curtain wall, stringers with the stair", () => {
  assert.equal(ruleCode(row({ cls: "IfcPlate", pdt: "CURTAIN_PANEL" }), none).code, "B2010");
  assert.equal(ruleCode(row({ cls: "IfcMember", pdt: "STRINGER" }), none).code, "C2010");
});

test("slabs typed FLOOR that are finishes, sun shades or roofs by their type name", () => {
  const slab = (type) => ruleCode(row({ cls: "IfcSlab", pdt: "FLOOR", type }), none);
  assert.equal(slab("Floor:FB 15.0 - Teppich").code, "C3020");
  assert.equal(slab("Floor:FB 15.0 - Holzdielen").code, "C3020");
  assert.equal(slab("Floor:Finish Floor - Ceramic Tile").code, "C3020");
  assert.equal(slab("IFC_dekvloer_zwevend 90").code, "C3020");
  assert.equal(slab("Floor:Flis - trapp").code, "C2020"); // tiles on a stair
  assert.equal(slab("Floor:Betongdekke 300 + avretting og flis").code, "B1010"); // a concrete deck naming its topping
  assert.equal(slab("Floor:Sonnenschutz").code, "B2010");
  assert.equal(slab("IFC_plat_dak_geisoleerd 171").code, "B1020");
  assert.equal(ruleCode(row({ cls: "IfcSlab", pdt: "FLOOR", name: "dakvloer" }), none).code, "B1020");
  assert.equal(slab("Floor:Garage Slab").code, "B1010");
  assert.equal(slab("Geschossdecke:STB 20.0").code, "B1010");
});

test("a top slab with walls under it and no storey on it is the roof, and so is the frame under it", () => {
  const fr = (o) => ({ ...row(o), box: o.box });
  const base = () => [
    fr({ id: 1, cls: "IfcSlab", pdt: "FLOOR", type: "STB 30.0", box: [0, 0, 3.0, 10, 10, 3.3] }),
    fr({ id: 2, cls: "IfcSlab", pdt: "FLOOR", type: "STB 30.0", box: [0, 0, 6.6, 10, 10, 6.9] }),
    fr({ id: 3, cls: "IfcWallStandardCase", ext: true, box: [0, 0, 3.3, 10, 0.3, 6.6] }), // stops under the top slab
    fr({ id: 4, cls: "IfcWallStandardCase", ext: true, box: [0, 0, 0, 10, 0.3, 3.0] }),
    fr({ id: 5, cls: "IfcColumn", box: [5, 5, 3.3, 5.3, 5.3, 6.6] }),
    fr({ id: 6, cls: "IfcWallStandardCase", ext: true, box: [0, 0, 6.9, 10, 0.2, 7.9] }), // a 1 m parapet
    fr({ id: 7, cls: "IfcSlab", pdt: "FLOOR", type: "Floor:Sonnenschutz", box: [10, 0, 6.6, 12, 10, 6.7] }), // nothing under it
  ];
  let rows = assignUniformat(base());
  const code = (id) => rows.find((r) => r.id === id).uniformat.code;
  assert.deepEqual([1, 2, 5, 7].map(code), ["B1010", "B1020", "B1020", "B2010"]);
  assert.match(rows.find((r) => r.id === 2).uniformat.why, /roof by geometry/);
  // a storey's walls standing on it: a floor with its roof not modelled, not a roof
  rows = assignUniformat([...base(), fr({ id: 8, cls: "IfcWallStandardCase", ext: true, box: [0, 9.7, 6.9, 10, 10, 9.9] })]);
  assert.equal(code(2), "B1010");
  // a roof whose geometry was not read may be the one over it: nothing is decided
  rows = assignUniformat([...base(), row({ id: 9, cls: "IfcRoof" })]);
  assert.equal(code(2), "B1010");
});

test("slabs on the ground are A1030, by name or by geometry; outside ones are paving", () => {
  const fr = (o) => ({ ...row(o), box: o.box });
  const base = () => [
    fr({ id: 1, cls: "IfcSlab", pdt: "FLOOR", type: "STB 30.0", box: [0, 0, -0.3, 10, 10, 0] }), // lowest, nothing under
    fr({ id: 2, cls: "IfcSlab", pdt: "FLOOR", type: "STB 30.0", box: [0, 0, 3.0, 10, 10, 3.3] }),
    fr({ id: 3, cls: "IfcWallStandardCase", ext: true, box: [0, 0, 0, 10, 0.3, 3.0] }),
    fr({ id: 4, cls: "IfcSlab", pdt: "FLOOR", type: "Floor:150mm Exterior Slab on Grade", box: [10, 0, -0.15, 14, 4, 0] }),
    fr({ id: 5, cls: "IfcSlab", pdt: "FLOOR", type: "Floor:127mm Slab on Grade", box: [0, 0, -0.13, 10, 10, 0] }),
    fr({ id: 6, cls: "IfcSlab", pdt: "FLOOR", type: "Concrete 200", box: [20, 0, -0.2, 24, 4, 0] }), // at grade, nothing over
  ];
  let rows = assignUniformat(base());
  const code = (id) => rows.find((r) => r.id === id).uniformat.code;
  assert.deepEqual([1, 2, 4, 5, 6].map(code), ["A1030", "B1020", "G2030", "A1030", "G2030"]); // 2 is the roof by geometry
  assert.match(rows.find((r) => r.id === 1).uniformat.why, /slab on grade by geometry/);
  // on beams (a hollow-core ground floor on foundation beams) it is suspended
  rows = assignUniformat([...base(), fr({ id: 7, cls: "IfcBeam", box: [4, 0, -0.9, 4.4, 10, -0.3] })]);
  assert.equal(code(1), "B1010");
  // a crawl space: the walls go down past it, so it is not at the bottom
  rows = assignUniformat([...base(), fr({ id: 8, cls: "IfcWallStandardCase", ext: true, box: [0, 0, -1.2, 10, 0.3, -0.3] })]);
  assert.equal(code(1), "B1010");
  assert.equal(code(5), "A1030"); // the name still says so
  // a roof whose geometry was not read: inside or outside cannot be told, so not paving
  rows = assignUniformat([...base(), row({ id: 9, cls: "IfcRoof" })]);
  assert.deepEqual([4, 6].map(code), ["G2030", "A1030"]);
  // nothing higher anywhere in the model (one slab): on grade, not paving
  rows = assignUniformat([fr({ id: 1, cls: "IfcSlab", pdt: "FLOOR", box: [0, 0, -0.25, 5, 4, 0] })]);
  assert.equal(code(1), "A1030");
});

test("gutters, downspouts and their framing are roof coverings; external railings exterior walls", () => {
  const ctx = () => null;
  assert.equal(ruleCode(row({ cls: "IfcFlowSegment", eff: "IfcPipeSegment", pdt: "GUTTER", type: "Gutter:Takrenne" }), ctx).code, "B3010");
  assert.equal(ruleCode(row({ cls: "IfcFlowSegment", eff: "IfcPipeSegment", type: "04 Zink", name: "hwa afvoer" }), ctx).code, "B3010");
  assert.equal(ruleCode(row({ cls: "IfcFlowSegment", eff: "IfcPipeSegment", type: "Pipe Types:Standard" }), ctx).code, "D");
  assert.equal(ruleCode(row({ cls: "IfcSlab", pdt: "FLOOR", type: "IFC_gootconstructie_rekwerk_ongeisoleerd 100" }), ctx).code, "B3010");
  assert.equal(ruleCode(row({ cls: "IfcRailing", ext: true }), ctx).code, "B2010");
  assert.equal(ruleCode(row({ cls: "IfcRailing", ext: false }), ctx).code, null);
});

test("railings by what they stand on: stair, storey-tall rise, outside or inside", () => {
  const fr = (o) => ({ ...row(o), box: o.box, railSide: o.side });
  const flight = () => fr({ id: 1, cls: "IfcStairFlight", box: [0, 0, 0, 1, 4, 3] });
  const rows = assignUniformat([
    flight(),
    fr({ id: 2, cls: "IfcRailing", ext: true, box: [1.05, 0, 0.9, 1.1, 4, 3.9] }), // handrail on the flight, flagged external: still the stair
    fr({ id: 3, cls: "IfcRailing", ext: false, box: [1.1, 2, 3.95, 1.12, 2.1, 4.05] }), // baluster piece 3.95 m up: not on the flight...
    fr({ id: 4, cls: "IfcRailing", ext: false, box: [1.1, 2.1, 3.0, 3.0, 2.12, 4.0] }), // ...but this rail along the head of the flight starts at its top
    fr({ id: 5, cls: "IfcRailing", ext: false, box: [5, 5, 3, 8, 5.05, 4], side: { exterior: false, open: 0, points: 9 } }), // a gallery guard far away
    fr({ id: 6, cls: "IfcRailing", ext: false, box: [20, 0, 0, 23, 1, 4.5] }), // rises a storey with no stair near: a stair railing
    fr({ id: 7, cls: "IfcRailing", ext: false, box: [20, 1, 4.5, 21, 1.02, 5.5] }), // joined to that one: the landing guard
    fr({ id: 8, cls: "IfcRailing", ext: false, box: [30, 0, 3, 33, 0.05, 4], side: { exterior: true, open: 9, points: 9 } }), // balcony
    fr({ id: 9, cls: "IfcRailing", ext: false, box: [40, 0, 3, 43, 0.05, 4] }), // no rays read
  ]);
  const code = (id) => rows.find((r) => r.id === id).uniformat.code;
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 9].map(code), ["C2010", "C2010", "C2010", "C1010", "C2010", "C2010", "B2010", null]);
  assert.match(rows.find((r) => r.id === 3).uniformat.why, /joined to a railing/);
  assert.match(rows.find((r) => r.id === 6).uniformat.why, /rising 4\.5 m/);
  // a level guard standing a storey above the flight's top is not the stair's
  const up = assignUniformat([flight(), fr({ id: 2, cls: "IfcRailing", box: [1.05, 0, 3.5, 1.1, 4, 4.5], side: { exterior: false, open: 0, points: 9 } })]);
  assert.equal(up[1].uniformat.code, "C1010");
});
