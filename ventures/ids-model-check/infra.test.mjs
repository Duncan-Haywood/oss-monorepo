// IFC 4.3 infrastructure and MEP: samples/infrastructure-and-mep.ids.xml against
// three of buildingSMART's Simple-Scene models (samples/bsi-ifc43/, CC BY 4.0).
// Every count here is also IfcTester 0.8.0's (eval/infra-mep-crosscheck-2026-11-17.md),
// and was checked against the raw model data with IfcOpenShell.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check } from "./node.mjs";

const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const IDS = file("./samples/infrastructure-and-mep.ids.xml");
const run = (model) => Object.fromEntries(check(IDS, file(`./samples/bsi-ifc43/${model}.ifc`)).specs.map((s) => [s.name, s]));
const counts = (s) => [s.status, s.applicable, s.failed.length];

test("road: typed earthworks, road parts, courses, line markings", () => {
  const r = run("Infra-Road");
  assert.deepEqual(counts(r["Earthworks fill is typed"]), ["pass", 16, 0]);
  assert.deepEqual(counts(r["Road parts are carriageway, shoulder or segment"]), ["fail", 26, 2], "the two PARKINGBAY parts fail");
  assert.deepEqual([...new Set(r["Road parts are carriageway, shoulder or segment"].failed.map((f) => f.name))], ["road - parking"]);
  assert.deepEqual(counts(r["Courses sit in a road or railway part"]), ["pass", 16, 0]);
  assert.deepEqual(counts(r["Asphalt courses are bitumen"]), ["pass", 16, 0], "applicability on a Name pattern");
  assert.deepEqual(counts(r["Line markings are named and painted"]), ["pass", 20, 0], "IfcSurfaceFeature, LINEMARKING on the occurrence");
  assert.deepEqual(counts(r["Every road is classified"]), ["pass", 5, 0]);
});

test("rail: track elements and rails sit in a TRACK railway part", () => {
  const r = run("Infra-Rail");
  assert.deepEqual(counts(r["Track elements sit in a track"]), ["pass", 70, 0]);
  assert.deepEqual(counts(r["Courses sit in a road or railway part"]), ["pass", 2, 0]);
  assert.deepEqual(counts(r["Every road is classified"]), ["fail", 0, 0], "minOccurs 1 with no road fails");
});

test("HVAC: predefined type from the type object, storey and building reached", () => {
  const r = run("Building-Hvac");
  assert.deepEqual(counts(r["Duct segments are rigid and sit on a storey"]), ["pass", 1, 0], "RIGIDSEGMENT is on IfcDuctSegmentType only");
  assert.deepEqual(counts(r["Air terminals have a material and sit in a building"]), ["pass", 2, 0], "terminal in storey, storey in building");
  const cci = r["Services and chambers are classified in CCI"];
  assert.deepEqual(counts(cci), ["fail", 3, 3], "only the building carries the Molio reference");
});
