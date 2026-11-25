// Builds the free schedule-of-values / continuation-sheet Excel template.
//
// Our own layout with the same arithmetic as calc.mjs (it is not the AIA
// G703 form): one row per schedule-of-values line, formulas for total
// completed and stored, percent, balance to finish, per-line retainage and an
// over-billing check, and a summary sheet with the nine usual summary lines.
//
// No library: the .xlsx is SpreadsheetML in a zip written here with stored
// (uncompressed) entries and fixed timestamps, so the same input gives the
// same bytes and the committed files can be checked against this code.
//
//   node template.mjs          rewrites the two .xlsx files next to it
//   node template.mjs --check  exits 1 if either committed file is stale

import { crc32 } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SAMPLE } from "./calc.mjs";

export const FIRST = 10;        // first schedule-of-values row
export const ROWS = 40;         // lines in the template
export const LAST = FIRST + ROWS - 1;
export const TOTAL = LAST + 1;  // totals row
const CS = "'Continuation sheet'";

const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Style ids (cellXfs order in styles.xml below).
const S = { text: 0, title: 1, head: 2, money: 3, pct: 4, input: 5, inputMoney: 6, totalMoney: 7, totalPct: 8, bold: 9, flag: 10, note: 11, inputPct: 12 };

function cell(ref, v, style = S.text) {
  if (v == null || v === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  if (typeof v === "number") return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  if (typeof v === "object" && v.f) return `<c r="${ref}" s="${style}"><f>${xml(v.f)}</f></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}
const row = (r, cells) => `<row r="${r}">${cells.join("")}</row>`;
const num = (s) => (s === "" || s == null ? "" : Number(s));

export const HEADERS = ["Item", "Description of work", "Scheduled value", "Work completed: from previous application", "Work completed: this period", "Materials presently stored", "Total completed and stored to date", "% complete", "Balance to finish", "Retainage", "Check"];

function continuationSheet({ lines = [], settings = {} }) {
  const rows = [];
  rows.push(row(1, [cell("A1", "Continuation sheet (schedule of values)", S.title)]));
  rows.push(row(2, [cell("A2", "Project", S.bold), cell("C2", settings.project ?? "", S.input)]));
  rows.push(row(3, [cell("A3", "Application no.", S.bold), cell("C3", settings.applicationNo ?? "", S.input)]));
  rows.push(row(4, [cell("A4", "Period to", S.bold), cell("C4", settings.periodTo ?? "", S.input)]));
  rows.push(row(5, [cell("A5", "Retainage on work, %", S.bold), cell("C5", num(settings.workRetainage ?? "10"), S.inputPct)]));
  rows.push(row(6, [cell("A6", "Retainage on stored materials, %", S.bold), cell("C6", num(settings.storedRetainage ?? "10"), S.inputPct)]));
  rows.push(row(7, [cell("A7", "Shaded cells are yours to fill in. Change orders go on their own lines with CO in the item column (CO-1); a deductive change order is a negative scheduled value. Not the AIA G703 form; not affiliated with the AIA.", S.note)]));
  rows.push(row(8, HEADERS.map((h, i) => cell(`${"ABCDEFGHIJK"[i]}8`, h, S.head))));
  rows.push(row(9, [..."ABCDEFGHIJK"].map((c) => cell(`${c}9`, c, S.head))));
  for (let i = 0; i < ROWS; i++) {
    const r = FIRST + i, l = lines[i] || {};
    const blank = `AND(C${r}="",D${r}="",E${r}="",F${r}="")`;
    rows.push(row(r, [
      cell(`A${r}`, l.item ?? "", S.input),
      cell(`B${r}`, l.description ?? "", S.input),
      cell(`C${r}`, num(l.scheduled), S.inputMoney),
      cell(`D${r}`, num(l.previous), S.inputMoney),
      cell(`E${r}`, num(l.thisPeriod), S.inputMoney),
      cell(`F${r}`, num(l.stored), S.inputMoney),
      cell(`G${r}`, { f: `IF(${blank},"",N(D${r})+N(E${r})+N(F${r}))` }, S.money),
      cell(`H${r}`, { f: `IF(N(C${r})=0,"",G${r}/C${r})` }, S.pct),
      cell(`I${r}`, { f: `IF(${blank},"",N(C${r})-G${r})` }, S.money),
      cell(`J${r}`, { f: `IF(${blank},"",ROUND((N(D${r})+N(E${r}))*$C$5/100+N(F${r})*$C$6/100,2))` }, S.money),
      cell(`K${r}`, { f: `IF(${blank},"",IF(AND(N(C${r})=0,G${r}<>0),"No scheduled value",IF(AND(N(C${r})>0,G${r}>N(C${r})),"Over-billed","")))` }, S.flag),
    ]));
  }
  const T = TOTAL, sum = (c) => ({ f: `SUM(${c}${FIRST}:${c}${LAST})` });
  rows.push(row(T, [
    cell(`A${T}`, "", S.bold), cell(`B${T}`, "Totals", S.bold),
    cell(`C${T}`, sum("C"), S.totalMoney), cell(`D${T}`, sum("D"), S.totalMoney), cell(`E${T}`, sum("E"), S.totalMoney),
    cell(`F${T}`, sum("F"), S.totalMoney), cell(`G${T}`, sum("G"), S.totalMoney),
    cell(`H${T}`, { f: `IF(C${T}=0,"",G${T}/C${T})` }, S.totalPct),
    cell(`I${T}`, sum("I"), S.totalMoney), cell(`J${T}`, sum("J"), S.totalMoney),
    cell(`K${T}`, { f: `IF(SUMPRODUCT(--(LEN(K${FIRST}:K${LAST})>0))>0,SUMPRODUCT(--(LEN(K${FIRST}:K${LAST})>0))&" line(s) to check","")` }, S.flag),
  ]));
  const widths = [8, 34, 15, 15, 15, 15, 16, 10, 15, 13, 18];
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return sheetXml(rows, cols, `<pane ySplit="9" topLeftCell="A${FIRST}" activePane="bottomLeft" state="frozen"/>`, `$8:$9`);
}

export const SUMMARY = [
  ["1. Original contract sum", "input", "The base contract. Type it in; it never changes."],
  ["2. Net change by change orders", { f: "C6-C4" }, "Contract sum to date less the original sum: your CO lines."],
  ["3. Contract sum to date", { f: `${CS}!C${TOTAL}` }, "Total scheduled value on the continuation sheet."],
  ["4. Total completed and stored to date", { f: `${CS}!G${TOTAL}` }, "Column G total."],
  ["5. Retainage", { f: `${CS}!J${TOTAL}` }, "Column J total: work and stored-material retainage, rounded per line."],
  ["6. Total earned less retainage", { f: "C7-C8" }, "Line 4 less line 5."],
  ["7. Less previous certificates for payment", "input", "The payment-due amounts certified on earlier applications, summed. Not what you were paid, not what you billed."],
  ["8. Current payment due", { f: "C9-C10" }, "Line 6 less line 7."],
  ["9. Balance to finish, including retainage", { f: "C6-C9" }, "Line 3 less line 6."],
];

function summarySheet({ settings = {} }) {
  const rows = [row(1, [cell("A1", "Application summary", S.title)])];
  rows.push(row(2, [cell("A2", "Project", S.bold), cell("C2", { f: `IF(${CS}!C2="","",${CS}!C2)` }, S.text)]));
  rows.push(row(3, [cell("A3", "Application no. / period to", S.bold), cell("C3", { f: `IF(${CS}!C3="","",${CS}!C3)&IF(${CS}!C4="",""," / "&${CS}!C4)` }, S.text)]));
  SUMMARY.forEach(([label, v, note], i) => {
    const r = 4 + i;
    const value = v === "input" ? cell(`C${r}`, i === 0 ? num(settings.originalContract) : num(settings.previousCertificates), S.inputMoney) : cell(`C${r}`, v, r === 11 ? S.totalMoney : S.money);
    rows.push(row(r, [cell(`A${r}`, label, r === 11 ? S.bold : S.text), value, cell(`D${r}`, note, S.note)]));
  });
  rows.push(row(14, [cell("A14", "Checks", S.bold), cell("C14", { f: `IF(C4="","Enter the original contract sum on line 1.",IF(C8>C7,"Retainage is more than the work completed.",IF(C11<0,"Payment due is negative: check line 7.","")))` }, S.flag)]));
  rows.push(row(15, [cell("A15", { f: `IF(${CS}!K${TOTAL}="","",${CS}!K${TOTAL}&" on the continuation sheet (column K).")` }, S.flag)]));
  rows.push(row(17, [cell("A17", "Check every figure against your contract before you submit. Not legal, tax or accounting advice. Your contract and state law decide retainage terms. Free template from https://marisstella.app/pay-app-guides/schedule-of-values-template.html", S.note)]));
  const cols = [[1, 40], [2, 2], [3, 18], [4, 70]].map(([c, w]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`).join("");
  return sheetXml(rows, cols, "", null);
}

function sheetXml(rows, cols, pane, printTitles) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;-#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF54503F"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFE8D8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDAD6C8"/></left><right style="thin"><color rgb="FFDAD6C8"/></right><top style="thin"><color rgb="FFDAD6C8"/></top><bottom style="thin"><color rgb="FFDAD6C8"/></bottom><diagonal/></border><border><left/><right/><top style="medium"/><bottom style="double"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="13"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="165" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="0"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Continuation sheet" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">${CS}!$8:$9</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Minimal zip writer: stored entries, DOS date 1980-01-01 00:00.
export function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, "utf8"), fname = Buffer.from(name, "utf8"), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(fname.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, fname, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(fname.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, fname);
    offset += 30 + fname.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

export function buildWorkbook(data = {}) {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", WORKBOOK],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", continuationSheet(data)],
    ["xl/worksheets/sheet2.xml", summarySheet(data)],
  ]);
}

// The worked example used across the guides: $150,000 electrical subcontract,
// one $8,500 change order, application 3, 10% retainage, $31,500 certified before.
export const EXAMPLE = {
  lines: SAMPLE.lines,
  settings: { ...SAMPLE.settings, originalContract: "150000", project: "Example electrical subcontract", applicationNo: "3", periodTo: "2026-10-31" },
};

export const OUTPUTS = {
  "schedule-of-values-template.xlsx": () => buildWorkbook({}),
  "schedule-of-values-example.xlsx": () => buildWorkbook(EXAMPLE),
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [name, build] of Object.entries(OUTPUTS)) {
    const path = new URL(`./${name}`, import.meta.url), bytes = build();
    if (check) {
      let same = false;
      try { same = readFileSync(path).equals(bytes); } catch {}
      if (!same) { stale++; console.error(`${name} is stale: run node template.mjs`); }
    } else { writeFileSync(path, bytes); console.log(`wrote ${name} (${bytes.length} bytes)`); }
  }
  process.exit(stale ? 1 : 0);
}
