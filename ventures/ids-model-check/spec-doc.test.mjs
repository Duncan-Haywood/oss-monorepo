import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { docFromIds, docToMarkdown, docToHtml, sentenceText, classNamesFrom } from "./spec-doc.mjs";
import { parseIds } from "./ids.mjs";

const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const classNames = classNamesFrom(["ifc2x3", "ifc4", "ifc4x3"].map((v) => JSON.parse(file(`./schema/${v}.json`))));
const wrap = (specs) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>T</title></info><specifications>${specs}</specifications></ids>`;
const spec = (app, req, attrs = "") => `<specification name="S" ifcVersion="IFC4" ${attrs}><applicability minOccurs="1" maxOccurs="unbounded">${app}</applicability><requirements>${req}</requirements></specification>`;
const wall = `<entity><name><simpleValue>IFCWALL</simpleValue></name></entity>`;
const req = (xml) => docFromIds(wrap(spec(wall, xml)), { classNames }).specs[0].requirements.map((r) => sentenceText(r.sentence));

test("the starter IDS reads as sentences with every name verbatim and classes in schema case", () => {
  const d = docFromIds(file("./samples/coordination-basics.ids.xml"), { classNames });
  assert.equal(d.specs.length, 7);
  assert.equal(sentenceText(d.specs[0].applies), "Applies to every IfcWall or IfcWallStandardCase.");
  assert.equal(sentenceText(d.specs[0].requirements[0].sentence), "It must have the property IsExternal in the set Pset_WallCommon, of data type IFCBOOLEAN, with a value.");
  assert.equal(d.specs[6].optionality, "prohibited");
  assert.match(d.specs[6].optionalityText, /must not contain any/);
});

test("restrictions, cardinalities and units", () => {
  assert.deepEqual(req(`<property dataType="IFCLENGTHMEASURE" cardinality="required"><propertySet><simpleValue>Qto_WallBaseQuantities</simpleValue></propertySet><baseName><simpleValue>Width</simpleValue></baseName><value><xs:restriction base="xs:double"><xs:minInclusive value="0.1"/><xs:maxExclusive value="0.5"/></xs:restriction></value></property>`),
    ["It must have the property Width in the set Qto_WallBaseQuantities, of data type IFCLENGTHMEASURE, holding a value that is at least 0.1 and less than 0.5 (in metres, as IDS requires, whatever unit the model uses)."]);
  assert.deepEqual(req(`<attribute cardinality="optional"><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:enumeration value="A"/><xs:enumeration value="B"/></xs:restriction></value></attribute>`),
    ["If its attribute Name is filled in, it must hold a value that is one of A or B."]);
  assert.deepEqual(req(`<classification cardinality="prohibited"><system><simpleValue>Uniclass</simpleValue></system></classification>`), ["It must not be classified in the system Uniclass."]);
  assert.deepEqual(req(`<classification><system><simpleValue>Uniclass 2015</simpleValue></system><value><xs:restriction base="xs:string"><xs:pattern value="Pr_.*"/></xs:restriction></value></classification>`),
    ["It must be classified in the system Uniclass 2015 with a code matching the pattern Pr_.*."]);
  assert.deepEqual(req(`<partOf relation="IFCRELCONTAINEDINSPATIALSTRUCTURE"><entity><name><simpleValue>IFCBUILDINGSTOREY</simpleValue></name></entity></partOf>`),
    ["It must be contained in (IfcRelContainedInSpatialStructure) an IfcBuildingStorey."]);
  assert.deepEqual(req(`<material cardinality="required"/>`), ["It must have a material."]);
  assert.deepEqual(req(`<attribute><name><simpleValue>Description</simpleValue></name></attribute>`), ["Its attribute Description must be filled in (not empty)."]);
});

test("Markdown keeps backticks and table pipes in values; HTML escapes markup", () => {
  const x = wrap(spec(wall, `<attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>a\`b|&lt;script&gt;</simpleValue></value></attribute>`));
  const d = docFromIds(x, { classNames });
  const md = docToMarkdown(d);
  assert.match(md, /``a`b\|<script>``/);
  const html = docToHtml(d);
  assert.match(html, /<code>a`b\|&lt;script&gt;<\/code>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Not a design review, a code-compliance check or professional advice/);
  assert.match(md, /Not a design review/);
});

test("every sample IDS gets one sentence per facet", () => {
  const dir = new URL("./samples/", import.meta.url);
  for (const n of readdirSync(dir).filter((n) => /\.ids(\.xml)?$/.test(n))) {
    const text = file(`./samples/${n}`);
    const ids = parseIds(text);
    const d = docFromIds(text, { classNames });
    assert.equal(d.specs.length, ids.specs.length, n);
    d.specs.forEach((s, i) => {
      assert.equal(s.applicability.length, ids.specs[i].applicability.length, n);
      if (s.optionality !== "prohibited") assert.equal(s.requirements.length, ids.specs[i].requirements.length, n);
      for (const r of s.requirements) assert.match(sentenceText(r.sentence), /^[A-Z].*\.$/, n);
    });
    assert.ok(docToMarkdown(d).includes(`## ${d.specs.length}.`), n);
  }
});
