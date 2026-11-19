// What Microsoft Excel does to a typed table when it saves .xlsx, read back
// as the text a person sees (sheet.mjs; eval/excel-workbooks-2026-11-19.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { xlsxToRows, sheetToRows, formatKind, serialToIso, excelNumber, unescapeXstring, rowsToIds } from "./sheet.mjs";
import { zipStore } from "./bcf.mjs";

const inflate = (b) => inflateRawSync(b);
const NS = `xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function book({ sheets = [["Sheet1", "worksheet", ""]], sst = null, styles = null, workbookPr = "", sep = "/" } = {}) {
  const files = [
    { name: `xl${sep}workbook.xml`, data: `<workbook ${NS}>${workbookPr}<sheets>${sheets.map(([n], i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: `xl${sep}_rels${sep}workbook.xml.rels`, data: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map(([, type], i) => `<Relationship Id="rId${i + 1}" Type="${REL}/${type}" Target="${type}s/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rS" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rT" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
  ];
  sheets.forEach(([, type, body], i) => files.push({ name: `xl${sep}${type}s${sep}sheet${i + 1}.xml`, data: type === "worksheet" ? `<worksheet ${NS}><sheetData>${body}</sheetData></worksheet>` : `<chartsheet ${NS}/>` }));
  if (sst) files.push({ name: `xl${sep}sharedStrings.xml`, data: `<sst ${NS}>${sst.map((s) => `<si><t xml:space="preserve">${s}</t></si>`).join("")}</sst>` });
  if (styles) files.push({ name: `xl${sep}styles.xml`, data: `<styleSheet ${NS}>${styles}</styleSheet>` });
  return zipStore(files);
}

test("number formats: which show a date, a time or both", () => {
  for (const [code, kind] of [["yyyy-mm-dd", "date"], ["DD.MM.YYYY", "date"], ["[$-409]mmmm\\ d\\,\\ yyyy;@", "date"], ["mmm-yy", "date"], ["d-mmm", "date"],
    ["h:mm AM/PM", "time"], ["mm:ss.0", "time"], ["hh:mm:ss", "time"], ["yyyy-mm-dd h:mm", "dateTime"], ["m/d/yy h:mm", "dateTime"],
    ["General", null], ["0.00", null], ["0.0%", null], ["0.00E+00", null], ["#,##0 \"days\"", null], ["[h]:mm:ss", null], ["[Red]0.00;[Blue]-0.00", null], ["@", null]]) {
    assert.equal(formatKind(code), kind, code);
  }
});

test("serial days as ISO 8601: the 1900 leap-year slip, the 1904 system, rounding to the second", () => {
  assert.equal(serialToIso(45292, "date"), "2024-01-01");
  assert.equal(serialToIso(1, "date"), "1900-01-01");
  assert.equal(serialToIso(59, "date"), "1900-02-28");
  assert.equal(serialToIso(60, "date"), "1900-02-29");
  assert.equal(serialToIso(61, "date"), "1900-03-01");
  assert.equal(serialToIso(43830, "date", true), "2024-01-01");
  assert.equal(serialToIso(0.64604166, "time"), "15:30:18");
  assert.equal(serialToIso(45292.5, "dateTime"), "2024-01-01T12:00:00");
  assert.equal(serialToIso(45292.99999999, "dateTime"), "2024-01-02T00:00:00");
});

test("numbers as Excel's General format shows them: 15 significant digits", () => {
  assert.equal(excelNumber("0.93827160493827155"), "0.938271604938272");
  assert.equal(excelNumber("6.1728395061728392E-2"), "0.0617283950617284");
  assert.equal(excelNumber("0.30000000000000004"), "0.3");
  assert.equal(excelNumber("30"), "30");
  assert.equal(excelNumber("1E-7"), "0.0000001");
  assert.equal(excelNumber("-1.5E-8"), "-0.000000015");
  assert.equal(excelNumber("1E+21"), "1E21");
  assert.equal(excelNumber("1.0000000000000001E-30"), "1E-30");
  assert.equal(excelNumber("#N/A"), "#N/A");
});

test("_xHHHH_ escapes in strings, and _x005F_ for a literal one", () => {
  assert.equal(unescapeXstring("a_x000D_\nb"), "a\r\nb");
  assert.equal(unescapeXstring("Rich Text_x000d_"), "Rich Text\r");
  assert.equal(unescapeXstring("_x005F_x0041_"), "_x0041_");
  assert.equal(unescapeXstring("Pset_x"), "Pset_x");
});

test("a sheet as Excel saves a typed table: dates, booleans, long fractions, escaped CRs", async () => {
  const styles = `<numFmts count="1"><numFmt numFmtId="164" formatCode="DD.MM.YYYY"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="22"/></cellXfs>`;
  const body = `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" s="1"><v>45292</v></c><c r="D1" s="2"><v>43990</v></c><c r="E1" s="3"><v>45292.75</v></c></row>
<row r="2"><c r="A2" t="b"><v>1</v></c><c r="B2" t="b"><v>0</v></c><c r="C2"><v>0.93827160493827155</v></c><c r="D2" t="str"><v>x_x000D_y</v></c><c r="E2" t="e"><v>#N/A</v></c></row>`;
  const rows = await xlsxToRows(book({ sheets: [["Sheet1", "worksheet", body]], sst: ["Fire_x000D_\r\nrating", "_x005F_x000D_"], styles }), inflate);
  assert.deepEqual(rows, [["Fire\r\nrating", "_x000D_", "2024-01-01", "2020-06-08", "2024-01-01T18:00:00"], ["true", "false", "0.938271604938272", "x\ry", "#N/A"]]);
});

test("a literal CR LF inside a part reads as LF, as any XML parser reads it", async () => {
  const rows = await xlsxToRows(book({ sheets: [["Sheet1", "worksheet", `<row r="1"><c r="A1" t="inlineStr"><is><t>a\r\nb</t></is></c></row>`]] }), inflate);
  assert.deepEqual(rows, [["a\nb"]]);
});

test("the 1904 date system", async () => {
  const rows = await xlsxToRows(book({ sheets: [["S", "worksheet", `<row r="1"><c r="A1" s="1"><v>43830</v></c></row>`]], styles: `<cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs>`, workbookPr: `<workbookPr date1904="1"/>` }), inflate);
  assert.deepEqual(rows, [["2024-01-01"]]);
});

test("a chart sheet first is passed over; part names with backslashes are read", async () => {
  const rows = await xlsxToRows(book({ sheets: [["Chart1", "chartsheet", ""], ["Data", "worksheet", `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`]], sst: ["section"], sep: "\\" }), inflate);
  assert.deepEqual(rows, [["section"]]);
});

test("an .xls or a password-protected workbook is named, not read as CSV", async () => {
  const ole = new Uint8Array(512);
  ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  await assert.rejects(sheetToRows(ole, inflate), /Excel 97-2003 \.xls, or a workbook saved with a password/);
});

test("a boolean value typed in Excel lands in the IDS as true, which matches an IfcBoolean", async () => {
  const header = ["section", "facet", "spec", "name", "entity", "propertySet", "property", "dataType", "value"].map((_, i) => `<c r="${String.fromCharCode(65 + i)}1" t="s"><v>${i}</v></c>`).join("");
  const sst = ["section", "facet", "spec", "name", "entity", "propertySet", "property", "dataType", "value", "specification", "applicability", "requirements", "entity", "property", "IFCWALL", "Pset_WallCommon", "LoadBearing", "IFCBOOLEAN", "Walls", "1"];
  const s = (i) => `t="s"><v>${i}</v>`;
  const body = `<row r="1">${header}</row>
<row r="2"><c r="A2" ${s(9)}</c><c r="C2" ${s(19)}</c><c r="D2" ${s(18)}</c></row>
<row r="3"><c r="A3" ${s(10)}</c><c r="B3" ${s(12)}</c><c r="C3" ${s(19)}</c><c r="E3" ${s(14)}</c></row>
<row r="4"><c r="A4" ${s(11)}</c><c r="B4" ${s(13)}</c><c r="C4" ${s(19)}</c><c r="F4" ${s(15)}</c><c r="G4" ${s(16)}</c><c r="H4" ${s(17)}</c><c r="I4" t="b"><v>1</v></c></row>`;
  const rows = await xlsxToRows(book({ sheets: [["IDS", "worksheet", body]], sst }), inflate);
  const r = rowsToIds(rows);
  assert.deepEqual(r.errors, []);
  assert.match(r.text, /<simpleValue>true<\/simpleValue>/);
});

test("our own workbook keeps a CR LF and a literal _x000D_ in a cell", async () => {
  const { rowsToXlsx } = await import("./sheet.mjs");
  const rows = [["section", "facet", "instructions"], ["specification", "", "line one\r\nline two _x000D_ kept"]];
  assert.deepEqual(await xlsxToRows(rowsToXlsx(rows), inflate), rows);
});
