// Excel2IDS requirement matrices read as IDS, and IDS written as one (excel2ids.mjs).
// The workbooks here are built in the test, laid out as the Excel2IDS template
// is (labels in column Q, categories from R, requirements from row 19); no
// file of the Excel2IDS project is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { sheetsToXlsx, xlsxToRows } from "./sheet.mjs";
import { isExcel2Ids, excel2idsToIds, readRequirementSheet, idsToExcel2Ids, excel2IdsToXlsx, excel2idsToolNotes } from "./excel2ids.mjs";
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

// Where Excel2IDS's own tool (Excel2IDS.py at 4eb7575) would read a workbook
// differently: the rules are the tool's behaviour as its source shows it.
const typed = (rows, cells) => { Object.defineProperty(rows, "cellTypes", { value: new Map(cells) }); Object.defineProperty(rows, "sheetName", { value: "Requirements" }); return rows; };
const msgs = (t) => [...t.stops.map((x) => "STOP " + x.message), ...t.notes.map((x) => x.message)];

test("tool notes: the template sample's differences are named, cell by cell", () => {
  const t = excel2idsToolNotes(typed(SAMPLE.map((r) => r.slice()), []));
  const m = msgs(t);
  assert.ok(m.some((x) => /LOD400/.test(x)));
  // Text "false" is on for the tool: the switched-off column and row are read there.
  assert.ok(t.notes.some((x) => x.row === 18 && x.col === 21 && /column U toggle "false" is text/.test(x.message)));
  assert.ok(t.notes.some((x) => x.row === 22 && x.col === 17 && /requirement row toggle "false" is text/.test(x.message)));
  // Typed as IfcWall: the tool writes it so.
  assert.ok(t.notes.some((x) => x.row === 6 && x.col === 19 && /IfcWall/.test(x.message)));
  // The REPLACEME row (20): its value goes onto column S's applicability property; the
  // instructions the tool carries are row 23's (the last X it read, in column R), none, as
  // this row's are, so no note. The "maybe" row (24) adds row 20's facet again.
  assert.ok(t.notes.some((x) => x.row === 20 && /writes it onto the property facet from column S's applicability/.test(x.message)));
  assert.ok(!t.notes.some((x) => x.row === 20 && /instructions/.test(x.message)));
  assert.ok(t.notes.some((x) => x.row === 24 && /adds the REPLACEME facet from row 20 again/.test(x.message)));
  assert.deepEqual(t.stops, []);
});

test("tool notes: typed booleans and numbers, and what stops the tool", () => {
  const g = book({
    meta: { title: "t", ifc: "IFC4 IFC2X3" },
    cols: [
      { name: "A", cardinality: "Prohibited", entity: "IFCDOOR", pvalue: "true", pset: "P", pname: "X", purpose: "" },
      { name: "B", entity: "IFCWALL", purpose: "ARC", on: "false" },
      { name: "C", entity: "IFCSLAB", purpose: "ARC" },
    ],
    reqs: [
      { cardinality: "Required", pset: "P", pname: "REPLACEME", pvalue: "5", uri: "https://x", dtype: "IfcLabel", marks: { 0: "Width", 2: "X" } },
      { cardinality: "required", aname: "Name", marks: { 2: "30" } },
    ],
  });
  // B's toggle a typed FALSE (off for both), A's property value a typed TRUE, C's mark on row 20 a number.
  const t = excel2idsToolNotes(typed(g, [["17,18", "b"], ["9,17", "b"], ["19,19", "n"]]));
  const m = msgs(t);
  // A REPLACEME value before any X: the tool has no instructions yet.
  assert.ok(m.some((x) => /^STOP row 19, column R fills a REPLACEME before any X/.test(x)));
  assert.ok(m.some((x) => /^STOP row 20, column T holds the number 30/.test(x)));
  // "Prohibited" is not "prohibited" to the tool; the empty purpose stops it.
  assert.ok(m.some((x) => /column R cardinality "Prohibited": the tool compares it with "prohibited" exactly/.test(x)));
  assert.ok(m.some((x) => /^STOP column R has no purpose/.test(x)));
  assert.ok(m.some((x) => /column R's value is a typed TRUE: the tool writes "True"/.test(x)));
  assert.ok(m.some((x) => /IFC version "IFC4 IFC2X3": the tool writes IFC4X3_ADD2.*this reader writes IFC4 IFC2X3/.test(x)));
  assert.ok(m.some((x) => /cardinality "Required"/.test(x)));
  assert.ok(m.some((x) => /data type "IfcLabel"/.test(x)));
  // A typed FALSE toggle is off for both: column S is not mentioned.
  assert.ok(!m.some((x) => /column S/.test(x)));
});

test("tool notes: a REPLACEME property row's value goes to the earlier property facet", () => {
  const g = book({
    cols: [{ name: "A", entity: "IFCDOOR", purpose: "ARC" }],
    reqs: [
      { cardinality: "required", pset: "P", pname: "Q", marks: { 0: "X" } },
      { cardinality: "required", pset: "P", pname: "REPLACEME", pvalue: "EI60", marks: { 0: "FireRating" } },
      { cardinality: "required", pset: " REPLACEME", pname: "Z", marks: { 0: "S" } },
    ],
  });
  const t = excel2idsToolNotes(typed(g, []));
  assert.ok(t.notes.some((x) => x.row === 20 && /drops this row's value from the facet and writes it onto the property facet from row 19 instead/.test(x.message)));
  assert.ok(t.notes.some((x) => x.row === 21 && /spaces around REPLACEME/.test(x.message)));
  assert.deepEqual(t.stops, []);
});

test("tool notes: a moved layout is named and nothing else is guessed", () => {
  const g = SAMPLE.map((r) => ["", ...r]);
  const t = excel2idsToolNotes(typed(g, []));
  assert.equal(t.notes.length, 1);
  assert.match(t.notes[0].message, /layout has moved \(the category labels are in column R, not Q/);
  const other = excel2idsToolNotes(Object.defineProperty(SAMPLE.map((r) => r.slice()), "sheetName", { value: "IDS" }));
  assert.match(other.stops[0].message, /named exactly "Requirements"/);
});

test("the workbook this writes is one the tool reads: purpose filled, classes upper case", async () => {
  const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
    <specification name="Doors" ifcVersion="IFC4"><applicability><entity><name><simpleValue>IfcDoor</simpleValue></name></entity></applicability>
      <requirements><attribute><name><simpleValue>Name</simpleValue></name></attribute></requirements></specification></specifications></ids>`;
  const w = idsToExcel2Ids(ids);
  assert.equal(w.purposeFilled, true);
  assert.equal(w.rows[16][17], "General");
  assert.equal(w.rows[5][17], "IFCDOOR");
  assert.match(w.tool[0], /filled with General/);
  assert.deepEqual(w.notes, []);
  const rows = await xlsxToRows(excel2IdsToXlsx(w.rows), inflate, { sheet: "Requirements" });
  const t = excel2idsToolNotes(rows);
  assert.deepEqual(t.stops, []);
  // What remains is the tool's own: LOD400, and "None" for the empty version cell.
  assert.deepEqual(t.notes.map((x) => x.message).filter((x) => !/LOD400/.test(x)), [t.notes.find((x) => x.row === 5)?.message].filter(Boolean));
  assert.match(t.notes.find((x) => x.row === 5).message, /<version>None<\/version>/);
  // Read back here: the purpose is General.
  assert.match(excel2idsToIds(rows).files[0].text, /<purpose>General<\/purpose>/);
});

test("xlsxToRows records which cells Excel stored as booleans and numbers", async () => {
  const rows = await xlsxToRows(excel2IdsToXlsx([["a", "1"]]), inflate);
  // Every cell this venture writes is text.
  assert.equal(rows.cellTypes.size, 0);
});

// Found by running the tool itself (eval/excel2ids-sidebyside-2026-11-19.md).
test("tool notes: an empty version cell and a carriage return, as the tool run showed", async () => {
  const g = book({
    meta: { title: "t", version: "", ifc: "IFC4" },
    cols: [{ name: "A", entity: "IFCDOOR", purpose: "ARC", instructions: "line one\r\nline two" }],
    reqs: [{ cardinality: "required", aname: "Name", instructions: "ok", marks: { 0: "X" } }],
  });
  // Through a saved .xlsx, as a user's file arrives: the CR is stored as _x000D_ and read back.
  const rows = await xlsxToRows(excel2IdsToXlsx(g), inflate);
  Object.defineProperty(rows, "sheetName", { value: "Requirements" });
  const t = excel2idsToolNotes(rows);
  assert.ok(t.notes.some((x) => x.row === 5 && x.col === 10 && /<version>None<\/version>/.test(x.message)));
  assert.ok(t.notes.some((x) => x.row === 3 && x.col === 18 && /column R's instructions holds a carriage return: Excel stores it as _x000D_/.test(x.message)));
  // A version given: no note; a plain line break (LF) is not escaped by Excel: no note.
  const g2 = book({ meta: { title: "t", version: "1.0", ifc: "IFC4" }, cols: [{ name: "A", entity: "IFCDOOR", purpose: "ARC", instructions: "a\nb" }], reqs: [{ aname: "Name", marks: { 0: "X" } }] });
  const t2 = excel2idsToolNotes(typed(g2, []));
  assert.ok(!t2.notes.some((x) => /version|_x000D_/.test(x.message)));
  // This reader writes the text itself, CR included.
  assert.match(excel2idsToIds(rows).files[0].text, /instructions="line one&#13;/);
});
