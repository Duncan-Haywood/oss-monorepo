// Builds the free construction invoice template (Excel), for a contractor who
// bills by invoice rather than by pay application: lump-sum and unit-price
// lines, retainage held on the invoice, a deposit applied, the amount due, the
// due date from the payment terms, and retainage held on the job to date.
//
// Same approach as template.mjs (whose zip writer and cell styles it reuses):
// SpreadsheetML in a stored zip with fixed timestamps, so the same input gives
// the same bytes and invoice-template.test.mjs can check the committed files.
//
//   node invoice-template.mjs          rewrites the two .xlsx files next to it
//   node invoice-template.mjs --check  exits 1 if either committed file is stale

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { S as BASE, STYLES as BASE_STYLES, cell, row, zip } from "./template.mjs";

export const FIRST = 12;            // first invoice line
export const LINES = 25;            // lines in the template
export const LAST = FIRST + LINES - 1;
export const SUB = LAST + 2;        // subtotal row; the rows below it follow in order
export const R = { subtotal: SUB, retainage: SUB + 1, tax: SUB + 2, deposit: SUB + 3, due: SUB + 4, prior: SUB + 6, toDate: SUB + 7, checks: SUB + 9 };

// Two date styles added after template.mjs's 13 (ids 13 and 14).
export const S = { ...BASE, inputDate: 13, date: 14 };
const STYLES = BASE_STYLES
  .replace('<numFmts count="2">', '<numFmts count="3">')
  .replace("</numFmts>", '<numFmt numFmtId="166" formatCode="yyyy-mm-dd"/></numFmts>')
  .replace('<cellXfs count="13">', '<cellXfs count="15">')
  .replace("</cellXfs>", '<xf numFmtId="166" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs>');

// Plain decimals only (Number() alone would read "1e1" or "0x7"); the inputs here are fixed, so a bad one is a bug.
const num = (s) => {
  if (s === "" || s == null) return "";
  if (!/^-?\d+(\.\d+)?$/.test(String(s))) throw new Error(`not a plain number: ${s}`);
  return Number(s);
};
// An ISO date as an Excel date serial (days since 1899-12-30), so the due-date formula can add to it.
export function serial(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

export const HEADERS = ["Item", "Description of work", "Qty", "Unit", "Unit price", "Amount"];

function invoiceSheet({ lines = [], settings = {} }) {
  const s = settings, rows = [];
  rows.push(row(1, [cell("A1", "Invoice", S.title)]));
  const field = (r, label, value, style = S.input) => rows.push(row(r, [cell(`A${r}`, label, S.bold), cell(`B${r}`, value ?? "", style)]));
  field(2, "From (company, address, licence no.)", s.from);
  field(3, "Bill to", s.billTo);
  field(4, "Job name and address", s.job);
  field(5, "Subcontract or PO no.", s.po);
  field(6, "Work through (period ending)", serial(s.periodTo), S.inputDate);
  rows.push(row(7, [cell("A7", "Invoice no.", S.bold), cell("B7", s.invoiceNo ?? "", S.input), cell("D7", "Invoice date", S.bold), cell("F7", serial(s.invoiceDate), S.inputDate)]));
  rows.push(row(8, [cell("A8", "Payment terms, days", S.bold), cell("B8", num(s.termsDays), S.inputPct), cell("D8", "Due date", S.bold), cell("F8", { f: `IF(OR(F7="",B8=""),"",F7+B8)` }, S.date)]));
  rows.push(row(9, [cell("A9", "Shaded cells are yours to fill in. A lump-sum line leaves Qty blank and puts the price in Unit price. A change order goes on its own line with its number in Item (CO-1).", S.note)]));
  rows.push(row(11, HEADERS.map((h, i) => cell(`${"ABCDEF"[i]}11`, h, S.head))));
  for (let i = 0; i < LINES; i++) {
    const r = FIRST + i, l = lines[i] || {};
    rows.push(row(r, [
      cell(`A${r}`, l.item ?? "", S.input),
      cell(`B${r}`, l.description ?? "", S.input),
      cell(`C${r}`, num(l.qty), S.inputPct),
      cell(`D${r}`, l.unit ?? "", S.input),
      cell(`E${r}`, num(l.price), S.inputMoney),
      cell(`F${r}`, { f: `IF(E${r}="","",ROUND(IF(C${r}="",1,C${r})*E${r},2))` }, S.money),
    ]));
  }
  const line = (r, label, extra, value, style = S.money) => rows.push(row(r, [cell(`A${r}`, "", S.text), cell(`B${r}`, label, r === R.due ? S.bold : S.text), ...extra, cell(`F${r}`, value, style)]));
  line(R.subtotal, "Subtotal, work this invoice", [], { f: `SUM(F${FIRST}:F${LAST})` });
  line(R.retainage, "Less retainage held, % (type the rate)", [cell(`E${R.retainage}`, num(s.retainage), S.inputPct)], { f: `-ROUND(F${R.subtotal}*N(E${R.retainage})/100,2)` });
  line(R.tax, "Sales tax, if any (type the amount)", [], num(s.tax), S.inputMoney);
  line(R.deposit, "Less deposit or advance applied (type it)", [], num(s.deposit), S.inputMoney);
  line(R.due, "Amount due", [], { f: `F${R.subtotal}+F${R.retainage}+N(F${R.tax})-N(F${R.deposit})` }, S.totalMoney);
  line(R.prior, "Retainage held on this job before this invoice (type it)", [], num(s.priorRetainage), S.inputMoney);
  line(R.toDate, "Retainage held on this job to date", [], { f: `N(F${R.prior})-F${R.retainage}` }, S.money);
  const blankPrice = `SUMPRODUCT((C${FIRST}:C${LAST}<>"")*(E${FIRST}:E${LAST}=""))`;
  rows.push(row(R.checks, [cell(`A${R.checks}`, "Checks", S.bold), cell(`B${R.checks}`, { f: `IF(N(E${R.retainage})>100,"Retainage rate is over 100%.",IF(F${R.due}<0,"Amount due is negative: check the deposit applied.",IF(${blankPrice}>0,${blankPrice}&" line(s) have a quantity and no unit price.","")))` }, S.flag)]));
  rows.push(row(R.checks + 2, [cell(`A${R.checks + 2}`, "Check every figure against your contract before you send it. Your contract decides retainage and payment terms; your state decides sales tax on construction work. Not legal, tax or accounting advice. Free template from https://marisstella.app/pay-app-guides/construction-invoice-template.html", S.note)]));
  const cols = [26, 40, 9, 7, 13, 15].map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="1"/></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Invoice" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

export function buildInvoice(data = {}) {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", WORKBOOK],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", invoiceSheet(data)],
  ]);
}

// The page's worked example: a drywall subcontractor's first invoice on a tenant
// improvement. 8,400.00 + 6,200 x 1.85 (11,470.00) + 1,250.00 = 21,120.00;
// 10% retainage 2,112.00; 3,000.00 deposit applied; amount due 16,008.00.
export const EXAMPLE = {
  lines: [
    { item: "1", description: "Metal stud framing, suite 200", qty: "", unit: "LS", price: "8400" },
    { item: "2", description: "Hang and finish 5/8 in. Type X board, level 4", qty: "6200", unit: "SF", price: "1.85" },
    { item: "CO-1", description: "Change order 1: soffit at reception (signed)", qty: "", unit: "LS", price: "1250" },
  ],
  settings: {
    from: "Example Drywall LLC", billTo: "Example General Contractor", job: "Suite 200 tenant improvement", po: "SC-2026-118",
    periodTo: "2026-11-30", invoiceNo: "1042", invoiceDate: "2026-11-30", termsDays: "30",
    retainage: "10", tax: "", deposit: "3000", priorRetainage: "0",
  },
};

export const OUTPUTS = {
  "construction-invoice-template.xlsx": () => buildInvoice({ settings: { termsDays: "30", retainage: "" } }),
  "construction-invoice-example.xlsx": () => buildInvoice(EXAMPLE),
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [name, build] of Object.entries(OUTPUTS)) {
    const path = new URL(`./${name}`, import.meta.url), bytes = build();
    if (check) {
      let same = false;
      try { same = readFileSync(path).equals(bytes); } catch {}
      if (!same) { stale++; console.error(`${name} is stale: run node invoice-template.mjs`); }
    } else { writeFileSync(path, bytes); console.log(`wrote ${name} (${bytes.length} bytes)`); }
  }
  process.exit(stale ? 1 : 0);
}
