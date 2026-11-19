// An IDS as a spreadsheet and back (sheet.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { idsToRows, rowsToIds, rowsToCsv, csvToRows, rowsToXlsx, xlsxToRows, canonicalIds, sheetFromIds, cellXml, COLUMNS } from "./sheet.mjs";
import { zipStore } from "./bcf.mjs";
import { parseIds } from "./ids.mjs";
import { check } from "./node.mjs";

const here = new URL(".", import.meta.url).pathname;
const inflate = (b) => inflateRawSync(b);
const samples = ["coordination-basics.ids.xml", "quantities-and-naming.ids.xml", "infrastructure-and-mep.ids.xml"];

test("the starter IDS files come back with the same content through CSV and xlsx", async () => {
  for (const f of samples) {
    const text = readFileSync(here + "samples/" + f, "utf8");
    const rows = idsToRows(text);
    assert.deepEqual(rows[0], COLUMNS);
    const viaCsv = rowsToIds(csvToRows(rowsToCsv(rows)));
    assert.deepEqual(viaCsv.errors, []);
    assert.equal(canonicalIds(viaCsv.text), canonicalIds(text), f + " via CSV");
    const viaXlsx = rowsToIds(await xlsxToRows(rowsToXlsx(rows), inflate));
    assert.equal(canonicalIds(viaXlsx.text), canonicalIds(text), f + " via xlsx");
  }
});

test("a table written by hand: semicolons, spaced headers, any case, spec numbers left blank", () => {
  const csv = [
    "Spec;Section;Facet;Name;IFC Version;Entity;Property Set;Property;Data Type;Value;Cardinality",
    ";info;title;;;;;;;Fire doors;",
    "1;Specification;;Doors are fire rated;IFC2X3 IFC4;;;;;;Required",
    ";applicability;entity;;;IFCDOOR;;;;;",
    ";requirements;property;;;;Pset_DoorCommon;FireRating;IFCLABEL;one of: EI30 | EI60 | EI90;",
    "2;specification;;No proxies;IFC4;;;;;;prohibited",
    ";applicability;entity;;;IFCBUILDINGELEMENTPROXY;;;;;",
    "3;specification;;Spaces have an area;IFC4;;;;;;",
    ";applicability;entity;;;IFCSPACE;;;;;",
    ";requirements;property;;;;Qto_SpaceBaseQuantities;NetFloorArea;IFCAREAMEASURE;>= 1;; < 1000;OPTIONAL",
  ].join("\n");
  const rows = csvToRows(csv);
  // A ";" inside a clause would split the cell in a semicolon file; the last
  // row's value is quoted below to keep it whole.
  rows[rows.length - 1] = rows[rows.length - 1].slice(0, 9).concat([">= 1; < 1000", "OPTIONAL"]);
  const r = rowsToIds(rows);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  const ids = parseIds(r.text);
  assert.equal(ids.specs.length, 3);
  assert.equal(ids.specs[0].optionality, "required");
  assert.equal(ids.specs[1].optionality, "prohibited");
  assert.deepEqual(ids.specs[0].requirements[0].value.r.enumeration, ["EI30", "EI60", "EI90"]);
  const area = ids.specs[2].requirements[0];
  assert.equal(area.value.r.base, "double");
  assert.equal(area.value.r.minInclusive, "1");
  assert.equal(area.value.r.maxExclusive, "1000");
  assert.match(r.text, /cardinality="optional"/);
  assert.deepEqual(ids.structure, [], "the IDS written from a table is valid against ids.xsd");
  // And it checks a model.
  const report = check(r.text, readFileSync(here + "samples/tiny-house.ifc", "utf8"));
  assert.equal(report.specs.length, 3);
});

test("cells that look like a restriction, formulas and empty values stay literal", async () => {
  const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
<specification name="=HYPERLINK(1)" ifcVersion="IFC4" instructions=""><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>one of: x</simpleValue></value></attribute>
<attribute><name><simpleValue>Description</simpleValue></name><value><simpleValue></simpleValue></value></attribute>
<attribute><name><simpleValue>Tag</simpleValue></name><value><simpleValue>\\back</simpleValue></value></attribute>
<attribute><name><simpleValue>ObjectType</simpleValue></name><value><xs:restriction base="xs:string"><xs:enumeration value="a;b"/><xs:enumeration value="c|d"/><xs:pattern value="[A-Z];x"/></xs:restriction></value></attribute>
<attribute><name><simpleValue>LongName</simpleValue></name><value><xs:restriction base="xs:integer"><xs:minInclusive value="-5"/></xs:restriction></value></attribute>
<attribute><name><simpleValue>GlobalId</simpleValue></name><value><xs:restriction base="xs:string"><xs:annotation><xs:documentation>22 characters</xs:documentation></xs:annotation><xs:length value="22"/></xs:restriction></value></attribute>
</requirements></specification></specifications></ids>`;
  const rows = idsToRows(ids);
  const col = (r, c) => r[COLUMNS.indexOf(c)];
  const vals = rows.filter((r) => col(r, "facet") === "attribute").map((r) => col(r, "value"));
  assert.deepEqual(vals, ["\\one of: x", "\\", "\\\\back", "one of: a;;b | c||d; pattern: [A-Z];;x", "base: integer; >= -5", "note: 22 characters; length: 22"]);
  const csv = rowsToCsv(rows);
  assert.match(csv, /,\\=HYPERLINK\(1\),/, "a formula is written with the table's backslash, so Excel shows it as text");
  for (const back of [rowsToIds(csvToRows(csv)), rowsToIds(await xlsxToRows(rowsToXlsx(rows), inflate))]) {
    assert.deepEqual(back.errors, []);
    assert.equal(canonicalIds(back.text), canonicalIds(ids));
  }
});

test("rows that cannot become IDS are named by their row number", () => {
  const rows = [
    ["section", "facet", "entity", "value"],
    ["applicability", "entity", "IFCWALL", ""],
    ["specification", "", "", ""],
    ["applicability", "door", "IFCDOOR", ""],
    ["requirements", "attribute", "", "pattern: x; maybe"],
    ["chapter", "", "", ""],
  ];
  const r = rowsToIds(rows);
  assert.equal(r.text, null);
  const at = (n) => r.errors.filter((e) => e.row === n).map((e) => e.message).join(" | ");
  assert.match(at(2), /before any specification/);
  assert.match(at(4), /facet "door"/);
  assert.match(at(5), /"maybe" is not a restriction clause/);
  assert.match(at(5), /needs its name/);
  assert.match(at(6), /section "chapter"/);
  assert.match(rowsToIds([["a", "b"], ["c", "d"]]).errors[0].message, /at least "section" and "facet"/);
});

test("restriction cells: bases inferred from the bounds, written when they differ", () => {
  assert.equal(cellXml(">= 2024-01-01; <= 2030-12-31").xml, '<xs:restriction base="xs:date"><xs:minInclusive value="2024-01-01"/><xs:maxInclusive value="2030-12-31"/></xs:restriction>');
  assert.equal(cellXml("> 0").xml, '<xs:restriction base="xs:double"><xs:minExclusive value="0"/></xs:restriction>');
  assert.equal(cellXml("min length: 1; max length: 12").xml, '<xs:restriction base="xs:string"><xs:minLength value="1"/><xs:maxLength value="12"/></xs:restriction>');
  assert.equal(cellXml("base: boolean").xml, '<xs:restriction base="xs:boolean"/>');
  assert.equal(cellXml("IFCWALL").xml, "<simpleValue>IFCWALL</simpleValue>");
  assert.match(cellXml(">= 1; >= 2").error, /written twice/);
});

test("an xlsx saved by a spreadsheet: shared strings, rich text runs, cells without references, the IDS sheet picked", async () => {
  const sst = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>section</t></si><si><t>facet</t></si><si><r><t>enti</t></r><r><rPr><b/></rPr><t>ty</t></r><rPh><t>x</t></rPh></si><si><t>specification</t></si><si><t>applicability</t></si><si><t>IFCWALL</t></si><si><t>name</t></si><si><t>Walls</t></si></sst>`;
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>6</v></c></row>
<row r="3"><c r="A3" t="s"><v>3</v></c><c r="D3" t="s"><v>7</v></c></row>
<row r="4"><c t="s"><v>4</v></c><c t="s"><v>2</v></c><c t="s"><v>5</v></c></row></sheetData></worksheet>`;
  const other = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>notes</t></is></c></row></sheetData></worksheet>`;
  const bytes = zipStore([
    { name: "xl/workbook.xml", data: `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Notes" sheetId="1" r:id="rId1"/><sheet name="IDS" sheetId="2" r:id="rId7"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Type="worksheet" Target="/xl/worksheets/data.xml"/></Relationships>` },
    { name: "xl/sharedStrings.xml", data: sst },
    { name: "xl/worksheets/sheet1.xml", data: other },
    { name: "xl/worksheets/data.xml", data: sheet },
  ]);
  const rows = await xlsxToRows(bytes, inflate);
  assert.deepEqual(rows, [["section", "facet", "entity", "name"], [], ["specification", "", "", "Walls"], ["applicability", "entity", "IFCWALL"]]);
  const r = rowsToIds(rows);
  assert.deepEqual(r.errors, []);
  assert.match(r.text, /<specification name="Walls">/);
});

test("IDS 0.9 forms are repaired before the sheet is made", () => {
  const ids = `<ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>t</title></info><specifications><specification name="s" ifcVersion="IFC4" minOccurs="1" maxOccurs="unbounded"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability></specification></specifications></ids>`;
  assert.ok(idsToRows(ids, { notes: true }).notes.some((n) => /minOccurs is not kept/.test(n)));
  const r = sheetFromIds(ids);
  assert.ok(r.fixes.length >= 1);
  assert.deepEqual(r.notes, []);
  const spec = r.rows.find((x) => x[COLUMNS.indexOf("section")] === "specification");
  assert.equal(spec[COLUMNS.indexOf("cardinality")], "required");
});

test("CSV reader: quotes, doubled quotes, line breaks in a cell, tabs, a byte-order mark", () => {
  assert.deepEqual(csvToRows('\ufeffa,b\r\n"x, ""y""","line1\nline2"\r\n'), [["a", "b"], ['x, "y"', "line1\nline2"]]);
  assert.deepEqual(csvToRows("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  assert.throws(() => csvToRows('a,b\n"open'), /inside a quoted cell/);
});

// A table may list applicability facets in any order; ids.xsd fixes it
// (entity, partOf, classification, attribute, property, material). Found when
// an Excel2IDS category with both a property and an attribute was written in
// the template's column order (eval/excel2ids-sidebyside-2026-11-19.md).
test("applicability facets are written in ids.xsd's order, whatever the row order", async () => {
  const { parseXml } = await import("./xml.mjs");
  const { structureIssues } = await import("./structure.mjs");
  const csv = [
    "Spec,Section,Facet,Name,IFC Version,Entity,Property Set,Property,Attribute,System,Value",
    "1,specification,,Outdoor spaces,IFC4,,,,,,",
    ",applicability,material,,,,,,,,concrete",
    ",applicability,property,,,,P,Kind,,,",
    ",applicability,attribute,,,,,,Name,,",
    ",applicability,classification,,,,,,,NL-SfB,",
    ",applicability,entity,,,IFCSPACE,,,,,",
    ",requirements,attribute,,,,,,Description,,",
  ].join("\n");
  const { text, errors } = rowsToIds(csvToRows(csv));
  assert.deepEqual(errors, []);
  const app = /<applicability>([\s\S]*?)<\/applicability>/.exec(text)[1];
  const order = [...app.matchAll(/^\s*<(\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(order, ["entity", "classification", "attribute", "property", "material"]);
  assert.deepEqual(structureIssues(parseXml(text, { spans: true }), text), []);
});
