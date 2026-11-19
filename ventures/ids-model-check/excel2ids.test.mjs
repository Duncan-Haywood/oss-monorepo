// Excel2IDS requirement matrices read as IDS, and IDS written as one (excel2ids.mjs).
// The workbooks here are built in the test, laid out as the Excel2IDS template
// is (labels in column Q, categories from R, requirements from row 19); no
// file of the Excel2IDS project is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { sheetsToXlsx, xlsxToRows } from "./sheet.mjs";
import { isExcel2Ids, excel2idsToIds, readRequirementSheet, idsToExcel2Ids, excel2IdsToXlsx } from "./excel2ids.mjs";
import { parseXml } from "./xml.mjs";
import { structureIssues } from "./structure.mjs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { resources } from "./node.mjs";

const here = new URL(".", import.meta.url).pathname;
const inflate = (b) => inflateRawSync(b);

// A grid in the template's layout. cols: one object per category (column R on);
// reqs: one object per requirement row (row 19 on), with marks: { colIndex: "X" | value }.
function book({ meta = {}, cols, reqs }) {
  const g = [];
  const put = (r, c, v) => { while (g.length <= r) g.push([]); g[r][c] = v; };
  put(0, 8, "METADATA");
  [["Title", "title"], ["Author email", "author"], ["Date", "date"], ["Version", "version"], ["Copyright", "copyright"], ["IFC version", "ifc"], ["Description", "description"]].forEach(([l, k], i) => { put(i + 1, 8, l); if (meta[k] !== undefined) put(i + 1, 9, meta[k]); });
  // The template's own spelling of the classification-code label.
  const labels = ["Specification name", "Description", "Instructions", "Identifier", "Cardinality", "IFC entity", "IFC predefined type", "Property set", "Property name", "Property value", "Property data type", "Classification system", "Classifciation code", "Attribute name", "Attribute value", "Material", "Purpose (discipline)", "Toggle on/off\n(TRUE/FALSE)"];
  const keys = ["name", "description", "instructions", "identifier", "cardinality", "entity", "predefinedType", "pset", "pname", "pvalue", "dtype", "system", "code", "aname", "avalue", "material", "purpose", "on"];
  labels.forEach((l, i) => put(i, 16, l));
  ["Instructions", "Cardinality", "IFC entity", "IFC predefined type", "Property set", "Property name", "Property value", "Property data type", "Property identifier (URI)", "Classification system", "Classification code", "Classification identifier (URI)", "Attribute name", "Attribute value", "Material", "Milestone (phase)"].forEach((l, i) => put(17, i, l));
  cols.forEach((c, j) => keys.forEach((k, i) => { const v = k === "on" ? (c.on ?? "true") : c[k]; if (v !== undefined) put(i, 17 + j, v); }));
  const rk = ["instructions", "cardinality", "entity", "predefinedType", "pset", "pname", "pvalue", "dtype", "uri", "system", "code", "classUri", "aname", "avalue", "material", "phase"];
  reqs.forEach((q, n) => {
    rk.forEach((k, i) => { if (q[k] !== undefined) put(18 + n, i, q[k]); });
    put(18 + n, 16, q.on ?? "true");
    for (const [j, m] of Object.entries(q.marks || {})) put(18 + n, 17 + Number(j), m);
  });
  for (const row of g) for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = "";
  return g;
}

const SAMPLE = book({
  meta: { title: "Fit-out requirements", author: "bim@example.com", date: "2026-11-19", version: "1.2", ifc: "IFC4" },
  cols: [
    { name: "Doors", description: "Every door", cardinality: "required", entity: "IFCDOOR", purpose: "ARC, MEP" },
    { name: "External walls", cardinality: "optional", entity: "IfcWall", pset: "Pset_WallCommon", pname: "IsExternal", pvalue: "true", dtype: " IFCBOOLEAN  ", purpose: "ARC" },
    { name: "No proxies", cardinality: "prohibited", entity: "IFCBUILDINGELEMENTPROXY", purpose: "ARC" },
    { name: "Switched off", entity: "IFCSLAB", purpose: "ARC", on: "false" },
  ],
  reqs: [
    { instructions: "Rated by the fire engineer", cardinality: "required", pset: "Pset_DoorCommon", pname: "FireRating", pvalue: "EI30, EI60;EI90", dtype: "IFCLABEL", uri: "https://identifier.buildingsmart.org/x", phase: "LOD300", marks: { 0: "X" } },
    { cardinality: "required", pset: "Pset_WallCommon", pname: "REPLACEME", dtype: "IFCLABEL", pvalue: '"[A-Z]{2}\\d+"', marks: { 1: "AcousticRating" } },
    { cardinality: "required", system: "Uniclass", code: '"Pr_\\d{2}.*"', phase: "LOD200, LOD300", marks: { 0: "X", 1: "X" } },
    { cardinality: "optional", aname: "Name", marks: { 0: "X" }, on: "false" },
    { cardinality: "required", marks: { 0: "X" } },
    { cardinality: "required", aname: "Description", marks: { 1: "maybe" } },
  ],
});

test("the template layout is found by its labels; a table of facets is not it", () => {
  assert.equal(isExcel2Ids(SAMPLE), true);
  assert.equal(isExcel2Ids([["spec", "section", "facet"], ["1", "specification", ""]]), false);
});

test("one IDS per purpose, with the categories, X marks and REPLACEME values read as the template says", () => {
  const r = excel2idsToIds(SAMPLE);
  assert.deepEqual(r.files.map((f) => f.suffix), ["ARC", "MEP"]);
  assert.deepEqual(r.phases, ["LOD300", "LOD200"]);
  for (const f of r.files) assert.deepEqual(f.errors, [], f.suffix);
  const arc = parseXml(r.files[0].text);
  const specs = arc.children.find((c) => c.local === "specifications").children.filter((c) => c.local);
  assert.deepEqual(specs.map((s) => s.attrs.name), ["Doors", "External walls", "No proxies"]);
  const t = r.files[0].text;
  // A comma/semicolon list is an enumeration; quotes are a pattern; data types trimmed and upper case.
  assert.match(t, /<xs:enumeration value="EI30"\/><xs:enumeration value="EI60"\/><xs:enumeration value="EI90"\/>/);
  assert.match(t, /<property dataType="IFCLABEL" cardinality="required" uri="https:\/\/identifier.buildingsmart.org\/x" instructions="Rated by the fire engineer">/);
  // REPLACEME takes the column's value, and the row's value and data type stay.
  assert.match(t, /<baseName><simpleValue>AcousticRating<\/simpleValue><\/baseName><value><xs:restriction base="xs:string"><xs:pattern value="\[A-Z\]\{2\}\\d\+"\/>/);
  // A class typed IfcWall is written upper case, with a warning; booleans stay lower case.
  assert.match(t, /<simpleValue>IFCWALL<\/simpleValue>/);
  assert.match(t, /dataType="IFCBOOLEAN"><propertySet><simpleValue>Pset_WallCommon<\/simpleValue><\/propertySet><baseName><simpleValue>IsExternal<\/simpleValue><\/baseName><value><simpleValue>true<\/simpleValue>/);
  assert.ok(r.warnings.some((w) => /IfcWall.*IFCWALL/.test(w.message)));
  // Applicability cardinality: required, optional, prohibited (a prohibited category needs no requirement).
  assert.match(t, /name="Doors"[^>]*>\s*<applicability minOccurs="1" maxOccurs="unbounded">/);
  assert.match(t, /name="External walls"[^>]*>\s*<applicability minOccurs="0" maxOccurs="unbounded">/);
  assert.match(t, /name="No proxies"[^>]*>\s*<applicability minOccurs="0" maxOccurs="0">/);
  // A row switched off is not read; a column switched off is not written.
  assert.doesNotMatch(t, /<simpleValue>Name<\/simpleValue>/);
  assert.doesNotMatch(t, /IFCSLAB/);
  // An X on a row that names no facet, and a mark that is neither X nor a REPLACEME value, are named.
  assert.ok(r.warnings.some((w) => w.row === 23 && /names no facet/.test(w.message)));
  assert.ok(r.warnings.some((w) => w.row === 24 && /"maybe"/.test(w.message)));
  // The MEP file holds only the category whose purpose lists MEP.
  assert.match(r.files[1].text, /<purpose>MEP<\/purpose>/);
  assert.equal((r.files[1].text.match(/<specification /g) || []).length, 1);
  // Info in ids.xsd's order.
  assert.match(t, /<title>Fit-out requirements<\/title>\s*<version>1.2<\/version>\s*<author>bim@example.com<\/author>\s*<date>2026-11-19<\/date>\s*<purpose>ARC<\/purpose>/);
});

test("every file it writes breaks ids.xsd nowhere and audits clean", () => {
  const res = resources();
  for (const f of excel2idsToIds(SAMPLE).files.concat(excel2idsToIds(SAMPLE, { byPhase: true }).files)) {
    assert.deepEqual(structureIssues(parseXml(f.text), f.text), [], f.suffix);
    const errs = auditIds(parseIds(f.text), res).filter((x) => x.level === "error");
    assert.deepEqual(errs.map((x) => x.message), [], f.suffix);
  }
});

test("with byPhase, one IDS per purpose and phase; a row with no phase is in every phase", () => {
  const r = excel2idsToIds(SAMPLE, { byPhase: true });
  assert.deepEqual(r.files.map((f) => f.suffix).sort(), ["ARC_LOD200", "ARC_LOD300", "MEP_LOD200", "MEP_LOD300"]);
  const arc200 = r.files.find((f) => f.suffix === "ARC_LOD200").text;
  assert.match(arc200, /<milestone>LOD200<\/milestone>/);
  // FireRating is LOD300 only; the REPLACEME row names no phase, so it is in both.
  assert.doesNotMatch(arc200, /FireRating/);
  assert.match(arc200, /AcousticRating/);
  assert.match(r.files.find((f) => f.suffix === "ARC_LOD300").text, /FireRating/);
});

test("a workbook whose Requirements sheet is not the first is still found", async () => {
  const bytes = sheetsToXlsx([{ name: "Notes", rows: [["read me"]] }, { name: "Requirements", rows: SAMPLE }]);
  const r = await readRequirementSheet(bytes, inflate);
  assert.equal(r.format, "excel2ids");
  assert.equal(r.files.length, 2);
  assert.equal(r.files[0].text, excel2idsToIds(SAMPLE).files[0].text);
});

test("a facet table still reads as one IDS", async () => {
  const bytes = sheetsToXlsx([{ name: "IDS", rows: [["spec", "section", "facet", "name", "ifcVersion", "entity", "value"], ["", "info", "title", "", "", "", "T"], ["1", "specification", "", "S", "IFC4", "", ""], ["1", "applicability", "entity", "", "", "IFCWALL", ""]] }]);
  const r = await readRequirementSheet(bytes, inflate);
  assert.equal(r.format, "table");
  assert.match(r.files[0].text, /<specification name="S" ifcVersion="IFC4">/);
});

test("the starter IDS files: what fits the template comes back the same, and the rest is named", async () => {
  const expect = { "coordination-basics.ids.xml": [5, 7], "quantities-and-naming.ids.xml": [3, 7], "infrastructure-and-mep.ids.xml": [7, 18] };
  for (const [f, [kept, total]] of Object.entries(expect)) {
    const text = readFileSync(here + "samples/" + f, "utf8");
    const w = idsToExcel2Ids(text);
    assert.deepEqual([w.kept, w.total], [kept, total], f);
    assert.equal(w.notes.length, total - kept, f);
    const back = excel2idsToIds(await xlsxToRows(excel2IdsToXlsx(w.rows), inflate));
    assert.equal(back.files.length, 1, f);
    // Written again from what came back, the workbook is the same: nothing drifts.
    const again = idsToExcel2Ids(back.files[0].text);
    assert.deepEqual(again.rows, w.rows, f);
    assert.deepEqual(again.notes, [], f);
  }
});

test("what the template cannot say is left out with the reason, not changed", () => {
  const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
    <specification name="Range" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCSPACE</simpleValue></name></entity></applicability>
      <requirements><property><propertySet><simpleValue>Q</simpleValue></propertySet><baseName><simpleValue>A</simpleValue></baseName><value><xs:restriction base="xs:double"><xs:minInclusive value="1"/></xs:restriction></value></property></requirements></specification>
    <specification name="Comma" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></applicability>
      <requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>a,b</simpleValue></value></attribute></requirements></specification>
    <specification name="Fine" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></applicability>
      <requirements><attribute cardinality="optional"><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:enumeration value="D1"/></xs:restriction></value></attribute></requirements></specification>
  </specifications></ids>`;
  const w = idsToExcel2Ids(ids);
  assert.equal(w.kept, 1);
  assert.match(w.notes[0], /"Range" left out: .*range/);
  assert.match(w.notes[1], /"Comma" left out: .*comma/);
  // A one-item list is written as its value; no applicability occurs reads as required.
  const g = w.rows;
  assert.equal(g[18][13], "D1");
  assert.equal(g[4][17], "required");
  assert.equal(g[0][17], "Fine");
});
