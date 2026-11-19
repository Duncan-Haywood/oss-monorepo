// The editor repairs an IDS's one-answer ids.xsd faults as it opens the file
// (repairOnOpen, eval/editor-open-repair-2026-11-18.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIds } from "./ids.mjs";
import { parseXml } from "./xml.mjs";
import { structureIssues } from "./structure.mjs";
import { resources } from "./node.mjs";
import { importIds, stateToDoc, buildIds, repairOnOpen } from "./editor.mjs";

const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const writeBack = (text) => { const imp = importIds(parseIds(text), loadFor); const L = loadFor(imp.state.schema); return buildIds(stateToDoc(imp.state, L), L.S); };
const faults = (t) => structureIssues(parseXml(t, { spans: true }), t);
const NS = `xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"`;
const INFO = `<info><title>T</title></info>`;

test("a valid IDS opens exactly as written", () => {
  const t = `<?xml version="1.0"?><ids ${NS}>${INFO}<specifications><specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name></attribute></requirements></specification></specifications></ids>`;
  const r = repairOnOpen(t, parseIds);
  assert.equal(r.text, t);
  assert.deepEqual(r.fixes, []);
});

test("a pattern written for another regex engine is written back in XML Schema regex", () => {
  // A kept-as-written attribute pattern with ^...$: an XSD engine reads ^ and $ as literal characters.
  const t = `<?xml version="1.0"?><ids ${NS}>${INFO}<specifications><specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCSPACE</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="^\\d{2}\\.\\d{3}$"/></xs:restriction></value></attribute></requirements></specification></specifications></ids>`;
  assert.match(writeBack(t), /\^/);
  const r = repairOnOpen(t, parseIds);
  assert.ok(r.fixes.some((x) => x.code === "pattern-xsd"));
  const back = writeBack(r.text);
  assert.doesNotMatch(back, /value="\^/);
  assert.match(back, /value="\\d\{2\}\\\.\\d\{3\}"/);
});

test("an IDS 0.9 file and a bare & open repaired and write back valid", () => {
  const t = `<?xml version="1.0"?><ids ${NS}>${INFO}<specifications><specification name="R&D walls" ifcVersion="IFC4X3" minOccurs="1" maxOccurs="unbounded"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><property datatype="IFCBOOLEAN"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><name><simpleValue>IsExternal</simpleValue></name></property></requirements></specification></specifications></ids>`;
  const r = repairOnOpen(t, parseIds);
  const codes = new Set(r.fixes.map((x) => x.code));
  assert.ok(codes.has("xml-ampersand"));
  assert.deepEqual(r.remaining, []);
  const parsed = parseIds(r.text);
  assert.equal(parsed.specs[0].name, "R&D walls");
  assert.equal(parsed.specs[0].requirements[0].dataType, "IFCBOOLEAN");
  assert.deepEqual(faults(writeBack(r.text)), []);
});

test("text that is not XML comes back unchanged with no fixes", () => {
  const r = repairOnOpen("not xml <", parseIds);
  assert.equal(r.text, "not xml <");
  assert.deepEqual(r.fixes, []);
});
