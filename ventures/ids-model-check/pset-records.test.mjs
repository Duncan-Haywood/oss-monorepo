// Property sets read once into a compact record, their and their properties'
// arguments not kept (ids.mjs psetRecord, the Model's keep policy;
// eval/pset-records-2026-11-18.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { psetRecord, psetInfo, psetsOf, PropertyFacet } from "./ids.mjs";
import { check, parseModel, resources } from "./node.mjs";

const HEAD = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('','',(),(),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n";
const ifc = (lines) => HEAD + lines.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
const ids = (specs) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;
const PS_ROOTS = ["IFCPROPERTYABSTRACTION", "IFCPROPERTYSETDEFINITION"];

const MODEL = ifc([
  "#1=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI30'),$);",
  "#2=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);",
  "#3=IFCPROPERTYSINGLEVALUE($,$,IFCLABEL('no name'),$);",
  "#4=IFCPROPERTYBOUNDEDVALUE('Load',$,IFCFORCEMEASURE(5000.),IFCFORCEMEASURE(10.),#9,IFCFORCEMEASURE(200.));",
  "#5=IFCPROPERTYSET('0aaaaaaaaaaaaaaaaaaaa1',$,'Pset_WallCommon',$,(#1,#2,#3,#4));",
  "#6=IFCQUANTITYLENGTH('Width',$,$,200.,$);",
  "#7=IFCELEMENTQUANTITY('0aaaaaaaaaaaaaaaaaaaa2',$,'Qto_WallBaseQuantities',$,$,(#6));",
  "#8=IFCPROPERTYSET('0aaaaaaaaaaaaaaaaaaaa3',$,$,$,(#1));",
  "#9=IFCSIUNIT(*,.FORCEUNIT.,.KILO.,.NEWTON.);",
  "#10=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);",
  "#11=IFCUNITASSIGNMENT((#10));",
  "#12=IFCPROJECT('0aaaaaaaaaaaaaaaaaaaa4',$,'P',$,$,$,$,$,#11);",
  "#20=IFCWALL('0aaaaaaaaaaaaaaaaaaaa5',$,'W1',$,$,$,$,$,$);",
  "#21=IFCRELDEFINESBYPROPERTIES('0aaaaaaaaaaaaaaaaaaaa6',$,$,$,(#20),#5);",
  "#22=IFCRELDEFINESBYPROPERTIES('0aaaaaaaaaaaaaaaaaaaa7',$,$,$,(#20),#7);",
  "#23=IFCRELDEFINESBYPROPERTIES('0aaaaaaaaaaaaaaaaaaaa8',$,$,$,(#20),#8);",
]);

test("a set's record: its name, then each named property in order, read once and shared", () => {
  const m = parseModel(MODEL);
  const ps = m.entities.get(5);
  const r = psetRecord(m, ps);
  assert.deepEqual(r.map((x) => (x && x.id ? "#" + x.id : x)), ["Pset_WallCommon", "FireRating", "#1", "FireRating", "#2", "Load", "#4"]);
  assert.equal(psetRecord(m, ps), r, "read once per model");
  assert.equal(psetRecord(m, m.entities.get(8))[0], null, "a set with no name");
  assert.deepEqual(psetRecord(m, m.entities.get(7)).slice(0, 2), ["Qto_WallBaseQuantities", "Width"]);
  // psetInfo hands out a new Map each time (psetsOf changes it); a later
  // property of the same name wins.
  const a = psetInfo(m, ps), b = psetInfo(m, ps);
  assert.notEqual(a.props, b.props);
  assert.equal(a.props.get("FireRating").id, 2);
  assert.deepEqual([...psetsOf(m, m.entities.get(20)).keys()], ["Pset_WallCommon", "Qto_WallBaseQuantities"]);
});

test("sets and properties are not kept once read, and their values read the same each time", () => {
  const m = parseModel(MODEL);
  const f = { values: (m, p) => PropertyFacet.prototype.values.call(null, m, p) };
  m.measureUnits = resources().measureUnits; // as checkIds sets it
  const load = m.entities.get(4);
  const first = f.values(m, load);
  assert.deepEqual(first.lo.v, 10000);
  assert.deepEqual(first.hi.v, 5000000);
  assert.deepEqual(first.sp.v, 200000);
  assert.deepEqual(f.values(m, load), first, "read again from the text");
  assert.equal(f.values(m, m.entities.get(6)).values[0].v, 0.2, "a quantity in the project's millimetres");
  void psetsOf(m, m.entities.get(20));
  for (const e of m.entities.values()) {
    if (PS_ROOTS.some((r) => m.schema.isA(e.type, r))) assert.equal(typeof e._a, "number", `#${e.id} ${e.type} not kept`);
  }
  void m.entities.get(20).args;
  assert.notEqual(typeof m.entities.get(20)._a, "number", "the wall's arguments are kept");
});

test("reports are the same as with every argument kept, on the bundled models and IDS", () => {
  const samples = ["coordination-basics", "infrastructure-and-mep", "quantities-and-naming"].map((n) => readFileSync(new URL(`samples/${n}.ids.xml`, import.meta.url), "utf8"));
  const inline = ids(`<specification name="s" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements>
    <property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName><value><simpleValue>EI60</simpleValue></value></property>
    <property><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>Load</simpleValue></baseName><value><xs:restriction base="xs:double"><xs:minInclusive value="10000"/></xs:restriction></value></property>
    <property><propertySet><simpleValue>Qto_WallBaseQuantities</simpleValue></propertySet><baseName><simpleValue>Width</simpleValue></baseName><value><simpleValue>0.2</simpleValue></value></property>
  </requirements></specification>`);
  const cases = [[MODEL, [inline]], [readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8"), samples]];
  for (const [text, idsFiles] of cases) {
    const lazy = parseModel(text);
    // The same model with every argument read up front and kept.
    const kept = parseModel(text);
    for (const e of kept.entities.values()) e.args = e.args;
    for (const x of idsFiles) {
      const a = check(x, lazy), b = check(x, kept);
      delete a.seconds; delete b.seconds;
      assert.deepEqual(a, b);
    }
  }
  const r = check(inline, parseModel(MODEL));
  assert.equal(r.specs[0].status, "pass", JSON.stringify(r.specs[0].failed));
});
