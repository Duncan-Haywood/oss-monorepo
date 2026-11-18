// structure.mjs: the IDS file against ids.xsd. The full comparison with
// IfcTester's validator is eval/ids-structure.mjs (eval/ids-structure-2026-11-18.md);
// these pin one case of each kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXml } from "./xml.mjs";
import { structureIssues } from "./structure.mjs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { resources, check } from "./node.mjs";
import { readFileSync } from "node:fs";

const NS = 'xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"';
const doc = (specs, info = "<title>t</title>", rootAttrs = NS) => `<?xml version="1.0"?>\n<ids ${rootAttrs}>\n<info>${info}</info>\n<specifications>\n${specs}\n</specifications>\n</ids>`;
const ent = (n) => `<entity><name><simpleValue>${n}</simpleValue></name></entity>`;
const spec = (app, req = "", attrs = 'name="s" ifcVersion="IFC4"', appAttrs = "") => `<specification ${attrs}><applicability${appAttrs}>${app}</applicability>${req === null ? "" : `<requirements>${req}</requirements>`}</specification>`;
const run = (text) => structureIssues(parseXml(text, { spans: true }), text);
const codes = (text) => run(text).map((x) => x.code);

test("a valid file and the samples raise nothing", () => {
  assert.deepEqual(run(doc(spec(ent("IFCWALL"), `<property dataType="IFCLABEL" cardinality="optional" instructions="i"><propertySet><simpleValue>P</simpleValue></propertySet><baseName><simpleValue>B</simpleValue></baseName><value><xs:restriction base="xs:string"><xs:annotation><xs:documentation>d</xs:documentation></xs:annotation><xs:enumeration value="a"/><xs:pattern value="b.*"/></xs:restriction></value></property>`, 'name="s" ifcVersion="IFC2X3 IFC4X3_ADD2" identifier="1"', ' minOccurs="0" maxOccurs="unbounded"'), "<title>t</title><author>a@b.co</author><date>2026-11-18</date>")), []);
  for (const f of ["coordination-basics", "quantities-and-naming", "infrastructure-and-mep"]) {
    const text = readFileSync(new URL(`./samples/${f}.ids.xml`, import.meta.url), "utf8");
    assert.deepEqual(run(text), [], f);
  }
});

test("IDS 0.9's minOccurs on <specification> is named, with where it goes now", () => {
  const xs = run(doc(spec(ent("IFCWALL"), "", 'name="s" ifcVersion="IFC4" minOccurs="1"')));
  assert.equal(xs.length, 1);
  assert.equal(xs[0].code, "xsd-attribute");
  assert.equal(xs[0].spec, 0);
  assert.equal(xs[0].line, 5);
  assert.match(xs[0].message, /goes on <applicability>/);
});

test("element order, missing and doubled elements, stray text", () => {
  assert.deepEqual(codes(doc(`<specification name="s" ifcVersion="IFC4"><requirements/><applicability>${ent("IFCWALL")}</applicability></specification>`)), ["xsd-order"]);
  assert.deepEqual(codes(doc(spec(`<entity><predefinedType><simpleValue>X</simpleValue></predefinedType><name><simpleValue>IFCWALL</simpleValue></name></entity>`))), ["xsd-order"]);
  assert.deepEqual(codes(doc(spec(`<entity><predefinedType><simpleValue>X</simpleValue></predefinedType></entity>`))), ["xsd-missing"]);
  assert.deepEqual(codes(doc(spec(ent("IFCWALL") + ent("IFCDOOR")))), ["xsd-count"]);
  assert.deepEqual(codes(doc(spec(`<entity><name>IFCWALL</name></entity>`))), ["xsd-text", "xsd-missing"]);
  assert.deepEqual(codes(doc("")), ["xsd-missing"]);
  // requirements take their facets in any order and number
  assert.deepEqual(codes(doc(spec(ent("IFCWALL"), `<material/>${ent("IFCWALL")}<material/>`))), []);
});

test("attribute values: cardinality, relation, ifcVersion, dataType", () => {
  const partOf = (a) => `<partOf ${a}><entity><name><simpleValue>IFCBUILDINGSTOREY</simpleValue></name></entity></partOf>`;
  assert.deepEqual(codes(doc(spec(ent("IFCWALL"), partOf('cardinality="optional"')))), ["xsd-attribute-value"]);
  assert.deepEqual(codes(doc(spec(partOf('cardinality="required"')))), ["xsd-attribute"]);
  assert.deepEqual(codes(doc(spec(ent("IFCWALL"), partOf('relation="IFCRELFILLSELEMENT"')))), ["xsd-attribute-value"]);
  assert.match(run(doc(spec(ent("IFCWALL"), "", 'name="s" ifcVersion="IFC4X3"')))[0].message, /IFC4X3_ADD2/);
  assert.deepEqual(codes(doc(spec(ent("IFCWALL"), "", 'ifcVersion="IFC4"'))), ["xsd-attribute-missing"]);
  assert.deepEqual(codes(doc(spec(ent("IFCWALL"), `<property datatype="IFCLABEL"><propertySet><simpleValue>P</simpleValue></propertySet><baseName><simpleValue>B</simpleValue></baseName></property>`))), ["xsd-attribute"]);
});

test("restrictions: XSD 1.0 facets only, values in attributes", () => {
  const val = (r) => doc(spec(`<entity><name><xs:restriction base="xs:string">${r}</xs:restriction></name></entity>`));
  assert.deepEqual(codes(val('<xs:enumeration value="IFCWALL"/>')), []);
  assert.deepEqual(codes(val('<xs:assertion test="true()"/>')), ["xsd-element"]);
  assert.deepEqual(codes(val("<xs:enumeration>IFCWALL</xs:enumeration>")), ["xsd-text", "xsd-attribute-missing"]);
  assert.deepEqual(codes(val('<xs:length value="-1"/>')), ["xsd-attribute-value"]);
});

test("root namespace, info fields and a bare ampersand", () => {
  assert.deepEqual(codes(doc(spec(ent("IFCWALL")), "<title>t</title>", 'xmlns="http://standards.buildingsmart.org/IDS/1.0/ids.xsd"')), ["xsd-root"]);
  assert.deepEqual(codes(doc(spec(ent("IFCWALL")), "<title>t</title><author>AI Assistant</author>")), ["xsd-text"]);
  assert.deepEqual(codes(doc(spec(ent("IFCWALL")), "<date>2026-02-30</date>")), ["xsd-missing", "xsd-text"]);
  assert.deepEqual(codes(doc(spec(ent("IFCWALL")), "<title>A & B</title>")), ["xml-ampersand"]);
});

test("the audit reports structure once; a model check runs the specification and warns", () => {
  const text = doc(spec(ent("IFCWALL"), `<partOf relation="IFCRELFILLSELEMENT"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></partOf>`, 'name="s" ifcVersion="IFC4" minOccurs="1"'));
  const issues = auditIds(parseIds(text), resources());
  assert.deepEqual(issues.map((x) => x.code), ["xsd-attribute", "relation-voids-fills"]);
  assert.equal(issues[0].facet, "line 5");
  const ok = doc(spec(ent("IFCWALL"), "", 'name="s" ifcVersion="IFC4" minOccurs="1"'));
  const model = readFileSync(new URL("./samples/tiny-house.ifc", import.meta.url), "utf8");
  const r = check(ok, model);
  assert.notEqual(r.specs[0].status, "invalid");
  assert.match(r.specs[0].auditWarnings[0], /^not valid IDS 1.0/);
  // parseIds output serialises as before: the findings are not enumerable
  assert.equal(JSON.stringify(parseIds(ok)).includes("structure"), false);
});
