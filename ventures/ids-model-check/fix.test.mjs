import { test } from "node:test";
import assert from "node:assert/strict";
import { fixStructure } from "./fix.mjs";
import { parseIds } from "./ids.mjs";

const NS = "http://standards.buildingsmart.org/IDS";
const wrap = (specs, rootAttrs = `xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"`, info = "<info><title>t</title></info>") =>
  `<?xml version="1.0"?>\n<ids ${rootAttrs}>\n  ${info}\n  <specifications>\n${specs}\n  </specifications>\n</ids>\n`;
const SPEC = (attrs, body) => `    <specification name="s" ${attrs}>\n${body}\n    </specification>`;
const APP = `      <applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>`;

test("a valid file comes back byte for byte with no fixes", () => {
  const t = wrap(SPEC(`ifcVersion="IFC4"`, APP));
  const r = fixStructure(t);
  assert.equal(r.text, t);
  assert.deepEqual(r.fixes, []);
  assert.deepEqual(r.remaining, []);
});

test("IDS 0.9 minOccurs/maxOccurs move from specification to applicability, the reading unchanged", () => {
  const t = wrap(SPEC(`ifcVersion="IFC4" minOccurs="0" maxOccurs="unbounded"`, `      <!-- keep me -->\n${APP}`));
  const r = fixStructure(t);
  assert.match(r.text, /<specification name="s" ifcVersion="IFC4">/);
  assert.match(r.text, /<applicability minOccurs="0" maxOccurs="unbounded">/);
  assert.match(r.text, /<!-- keep me -->/);
  assert.deepEqual(r.remaining, []);
  assert.equal(parseIds(r.text).specs[0].optionality, "optional");
  assert.equal(parseIds(t).specs[0].optionality, "optional");
  assert.equal(r.fixes[0].line, 5);
});

test("ifcVersion IFC4X3 and lower case become IDS 1.0 names", () => {
  const r = fixStructure(wrap(SPEC(`ifcVersion="ifc4 IFC4X3"`, APP)));
  assert.match(r.text, /ifcVersion="IFC4 IFC4X3_ADD2"/);
  assert.deepEqual(r.remaining, []);
  // an unknown version is left for a person
  const u = fixStructure(wrap(SPEC(`ifcVersion="IFC5"`, APP)));
  assert.deepEqual(u.fixes, []);
  assert.equal(u.remaining.length, 1);
});

test("the schema URL as namespace, no namespace, and an undeclared xs: prefix", () => {
  const body = SPEC(`ifcVersion="IFC4"`, `      <applicability><entity><name><xs:restriction base="xs:string"><xs:enumeration value="IFCWALL"/></xs:restriction></name></entity></applicability>`);
  for (const attrs of [`xmlns="${NS}/1.0/ids.xsd"`, ``]) {
    const r = fixStructure(wrap(body, attrs));
    assert.ok(r.text.includes(`<ids xmlns:xs="http://www.w3.org/2001/XMLSchema"`) || r.text.includes(`xmlns="${NS}"`), r.text);
    assert.deepEqual(r.remaining, [], attrs);
    assert.deepEqual(parseIds(r.text).specs, parseIds(wrap(body)).specs);
  }
});

test("IDS 0.9 property facets: <name>, datatype and minOccurs become baseName, dataType and cardinality", () => {
  const req = `      <requirements>\n        <property datatype="IfcLabel" minOccurs="0" maxOccurs="unbounded"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><name><simpleValue>FireRating</simpleValue></name></property>\n      </requirements>`;
  const t = wrap(SPEC(`ifcVersion="IFC4"`, APP + "\n" + req));
  const r = fixStructure(t);
  assert.match(r.text, /<property cardinality="optional" dataType="IFCLABEL">/);
  assert.match(r.text, /<baseName><simpleValue>FireRating<\/simpleValue><\/baseName>/);
  assert.deepEqual(r.remaining, []);
  // the checker already reads the 0.9 forms the way the repaired file says
  const [a, b] = [parseIds(t).specs[0].requirements[0], parseIds(r.text).specs[0].requirements[0]];
  assert.equal(a.baseName.simple, "FireRating");
  assert.equal(a.dataType, "IFCLABEL");
  assert.equal(a.cardinality, "optional");
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
});

test("bare text values are wrapped in simpleValue and read as that value, not as any", () => {
  const t = wrap(SPEC(`ifcVersion="IFC4"`, `      <applicability><entity><name>IFCWALL</name></entity></applicability>`));
  assert.equal(parseIds(t).specs[0].applicability[0].name.simple, "IFCWALL");
  const r = fixStructure(t);
  assert.match(r.text, /<name><simpleValue>IFCWALL<\/simpleValue><\/name>/);
  assert.deepEqual(r.remaining, []);
});

test("an unprefixed <restriction> becomes xs:restriction with its facets", () => {
  const t = wrap(SPEC(`ifcVersion="IFC4"`, `      <applicability><entity><name><restriction base="xs:string"><enumeration value="IFCWALL"/><enumeration value="IFCSLAB"/></restriction></name></entity></applicability>`), `xmlns="${NS}"`);
  const r = fixStructure(t);
  assert.match(r.text, /<xs:restriction base="xs:string"><xs:enumeration value="IFCWALL"\/><xs:enumeration value="IFCSLAB"\/><\/xs:restriction>/);
  assert.match(r.text, /xmlns:xs="http:\/\/www.w3.org\/2001\/XMLSchema"/);
  assert.deepEqual(r.remaining, []);
  assert.deepEqual(parseIds(r.text).specs[0].applicability[0].name.r.enumeration, ["IFCWALL", "IFCSLAB"]);
});

test("children out of order are reordered, nested faults fixed on the next pass", () => {
  const body = `      <applicability>\n        <property><baseName><simpleValue>IsExternal</simpleValue></baseName><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet></property>\n        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>\n      </applicability>`;
  const r = fixStructure(wrap(SPEC(`ifcVersion="IFC4"`, body)));
  assert.deepEqual(r.remaining, []);
  assert.ok(r.text.indexOf("<entity>") < r.text.indexOf("<property>"));
  assert.ok(r.text.indexOf("<propertySet>") < r.text.indexOf("<baseName>"));
  assert.equal(r.fixes.filter((x) => x.code === "xsd-order").length, 2);
  // a comment between the children: left alone rather than moved
  const c = fixStructure(wrap(SPEC(`ifcVersion="IFC4"`, body.replace("\n        <entity>", "\n        <!-- why -->\n        <entity>"))));
  assert.ok(c.remaining.some((x) => x.code === "xsd-order"));
});

test("a bare ampersand, a date with a time, and wrong-case attribute values", () => {
  const info = "<info><title>Walls & doors</title><date>2024-03-05T10:00:00Z</date></info>";
  const req = `      <requirements><attribute cardinality="Required"><name><simpleValue>Name</simpleValue></name></attribute><partOf relation="IfcRelAggregates"><entity><name><simpleValue>IFCBUILDING</simpleValue></name></entity></partOf></requirements>`;
  const r = fixStructure(wrap(SPEC(`ifcVersion="IFC4"`, APP + "\n" + req), undefined, info));
  assert.match(r.text, /Walls &amp; doors/);
  assert.match(r.text, /<date>2024-03-05<\/date>/);
  assert.match(r.text, /cardinality="required"/);
  assert.match(r.text, /relation="IFCRELAGGREGATES"/);
  assert.deepEqual(r.remaining, []);
});

test("faults with no single right answer are left and listed", () => {
  const info = "<info><title>t</title><author>AI Assistant</author></info>";
  const r = fixStructure(wrap(SPEC(`ifcVersion="IFC4"`, APP), undefined, info));
  assert.deepEqual(r.fixes, []);
  assert.equal(r.remaining.length, 1);
  assert.match(r.remaining[0].message, /e-mail/);
});

test("a file that is not XML returns an error and the text unchanged", () => {
  const r = fixStructure("<ids><info>");
  assert.ok(r.error);
  assert.equal(r.text, "<ids><info>");
});
