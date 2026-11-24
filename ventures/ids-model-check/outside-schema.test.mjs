// A record whose class the model's schema does not have: IfcOpenShell's test
// files hold an IFC4X3 model of 18 IFCBEAMSTANDARDCASE beams (a class IFC4X3
// removed) and an IFC4 file with IFC4X3's IFCBUILTELEMENT
// (eval/ifcopenshell-test-files-2026-11-24.md). IfcOpenShell drops such
// records and IfcTester counts no beams, so an IDS on IFCBEAM passed while
// checking none of them, in both tools. The reader now notes each such class
// and the specification counts the elements it did not check.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Model } from "./ids.mjs";
import { check, parseModel, resources } from "./node.mjs";

const IFC = readFileSync(new URL("./samples/edge/outside-schema.ifc", import.meta.url), "utf8");
const IDS = readFileSync(new URL("./samples/edge/outside-schema.ids.xml", import.meta.url), "utf8");

test("a class the schema lacks gets one reader note, with its parent from the schema that has it", () => {
  const m = parseModel(IFC);
  assert.deepEqual(m.outsideSchema, [{ type: "IFCBEAMSTANDARDCASE", count: 2, first: 11, from: "IFC4", parent: "IFCBEAM" }]);
  assert.equal(m.parseErrors.length, 1);
  assert.match(m.parseErrors[0], /^#11: IFCBEAMSTANDARDCASE is not an IFC4X3_ADD2 class \(2 records from #11; an IFC4 class, there a subclass of IFCBEAM\)/);
  assert.match(m.parseErrors[0], /re-export it as IFCBEAM/);
});

test("with only the model's own schema loaded (the page), the StandardCase rule finds the parent", () => {
  const m = new Model(IFC, { IFC4X3: resources().schemas.IFC4X3 });
  assert.deepEqual(m.outsideSchema, [{ type: "IFCBEAMSTANDARDCASE", count: 2, first: 11, from: null, parent: "IFCBEAM" }]);
  assert.match(m.parseErrors[0], /\(2 records from #11\)\. .*re-export it as IFCBEAM/);
});

test("a specification on the parent class counts the unchecked elements and says why", () => {
  const rep = check(IDS, IFC);
  const [beams, walls] = rep.specs;
  // The verdict stays as IDS reads it (IfcTester agrees: 1 beam, pass) ...
  assert.equal(beams.status, "pass");
  assert.equal(beams.applicable, 1);
  // ... but #12, a beam with no Name, was never checked, and the report says so.
  assert.deepEqual(beams.skippedSubclasses, [{ type: "IFCBEAMSTANDARDCASE", via: "IFCBEAM", count: 2, outside: "IFC4X3_ADD2" }]);
  assert.match(beams.hint, /2 IFCBEAMSTANDARDCASE \(not in IFC4X3_ADD2; another schema's subclass of IFCBEAM\).*IfcOpenShell and IfcTester do not see it at all: re-export as IFCBEAM/);
  // IFCWALLSTANDARDCASE is still an IFC4X3 class: the ordinary subclass warning.
  assert.deepEqual(walls.skippedSubclasses, [{ type: "IFCWALLSTANDARDCASE", via: "IFCWALL", count: 1 }]);
});

test("an abstract parent gets other advice than re-exporting as it", () => {
  const m = parseModel(`ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;
#1=IFCBUILTELEMENT('2CbOYFeCHBku9$oytmyQ2e',$,$,$,$,$,$,$);
ENDSEC;END-ISO-10303-21;`);
  assert.deepEqual(m.outsideSchema, [{ type: "IFCBUILTELEMENT", count: 1, first: 1, from: "IFC4X3", parent: "IFCELEMENT" }]);
  assert.match(m.parseErrors[0], /IFCELEMENT is abstract: write the file as IFC4X3, or use a concrete IFC4 class/);
});

test("a class no loaded schema knows is noted with no parent", () => {
  const m = parseModel(`ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;
#5=IFCNOSUCHTHING('x');
ENDSEC;END-ISO-10303-21;`);
  assert.deepEqual(m.outsideSchema, [{ type: "IFCNOSUCHTHING", count: 1, first: 5, from: null, parent: null }]);
  assert.match(m.parseErrors[0], /only an IDS entity facet naming it exactly finds it/);
});

test("a model with only its own schema's classes has no such note", () => {
  const m = parseModel(readFileSync(new URL("./samples/edge/msvc-inf-nan.ifc", import.meta.url), "utf8"));
  assert.deepEqual(m.outsideSchema, []);
  assert.ok(!m.parseErrors.some((e) => /is not an? IFC/.test(e)));
});
