// Builds the free machining quote template (Excel), with the same arithmetic as
// quote.mjs and the same customer-quote rounding as quote-doc.mjs.
//
// Two sheets:
//   "Quote worksheet"  the shop's internal costing: rates, the part, up to six
//                      other operations, and six quantity breaks, each priced
//                      by the formulas in quote.mjs (material with scrap, setup
//                      and programming once per lot, programming spread over
//                      the lots expected, cycle time at the machine rate, other
//                      operations, markup on cost, optional calibration factors).
//   "Customer quote"   what goes to the buyer: shop, customer, RFQ reference,
//                      part number and revision, price each rounded UP to the
//                      cent and extended price per quantity, lead time,
//                      validity with its expiry date, terms, notes; never the
//                      cost lines. A check row lists what a buyer would send
//                      back (the main items of reviewQuote() in quote-doc.mjs).
//
// The template ships no rate, price, markup or lead time: every input cell is
// empty (README, "Honesty rules"). quote-template.test.mjs fills invented
// numbers in memory only, recalculates in LibreOffice where installed, and
// checks every figure against costLot() and the customer rounding.
//
// No library: SpreadsheetML in a zip with stored entries and fixed
// timestamps, so the same input gives the same bytes and the committed file
// can be checked against this code.
//
//   node quote-template.mjs          rewrites machining-quote-template.xlsx
//   node quote-template.mjs --check  exits 1 if the committed file is stale

import { crc32 } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const WS = "'Quote worksheet'";
export const FILE = "machining-quote-template.xlsx";

// Input cells on the worksheet (column C), keyed like quote.mjs's input object.
export const INPUTS = [
  ["setupRate", "Setup rate ($ per hour)", 4],
  ["programRate", "Programming rate ($ per hour)", 5],
  ["machineRate", "Machine rate ($ per hour)", 6],
  ["markupPct", "Markup on cost (%)", 7],
  ["scrapPct", "Scrap allowance on material (%)", 8],
  ["partNumber", "Part number", 11],
  ["revision", "Revision", 12],
  ["materialPerPart", "Material per part ($, before scrap)", 13],
  ["setupHours", "Setup hours per lot", 14],
  ["programHours", "Programming hours (once per program)", 15],
  ["lotsOverProgramLife", "Lots expected over the program's life (blank = 1)", 16],
  ["cycleMinutes", "Cycle time per part (minutes)", 17],
  ["setupFactor", "Setup calibration factor (blank = 1)", 18],
  ["cycleFactor", "Cycle-time calibration factor (blank = 1)", 19],
];
export const CELL = Object.fromEntries(INPUTS.map(([k, , r]) => [k, `$C$${r}`]));

export const OPS_FIRST = 23, OPS_ROWS = 6, OPS_LAST = OPS_FIRST + OPS_ROWS - 1;
export const BREAK_COLS = ["C", "D", "E", "F", "G", "H"];
export const QTY_ROW = 31;           // quantities typed by the user
export const LINE_ROWS = {           // computed rows, one column per break
  quantity: 32, material: 33, setup: 34, programming: 35, machining: 36, ops: 37,
  cost: 38, price: 39, costEach: 40, priceEach: 41, fixedShareEach: 42, quotedEach: 43, extended: 44,
};

const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Style ids, in cellXfs order in STYLES below.
const S = { text: 0, title: 1, head: 2, money: 3, input: 4, inputMoney: 5, totalMoney: 6, bold: 7, flag: 8, note: 9, inputNum: 10, inputDate: 11, date: 12, wrapInput: 13, num: 14 };

function cell(ref, v, style = S.text) {
  if (v == null || v === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  if (typeof v === "number") return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  if (typeof v === "object" && v.f) return `<c r="${ref}" s="${style}"><f>${xml(v.f)}</f></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}
const row = (r, cells) => `<row r="${r}">${cells.join("")}</row>`;
const numOrBlank = (v) => (v === "" || v == null ? "" : Number.isFinite(Number(v)) ? Number(v) : String(v));

// A blank, zero or negative factor counts as 1, as factorOf() in quote.mjs.
const factor = (ref) => `IF(N(${ref})>0,${ref},1)`;

export function lineFormula(line, col) {
  const q = `${col}$${LINE_ROWS.quantity}`, c = CELL;
  const guard = (f) => `IF(${q}="","",${f})`;
  const ref = (name) => `${col}${LINE_ROWS[name]}`;
  switch (line) {
    case "quantity": return `IF(${col}${QTY_ROW}="","",MAX(1,INT(N(${col}${QTY_ROW}))))`;
    case "material": return guard(`${q}*N(${c.materialPerPart})*(1+N(${c.scrapPct})/100)`);
    case "setup": return guard(`N(${c.setupHours})*${factor(c.setupFactor)}*N(${c.setupRate})`);
    case "programming": return guard(`N(${c.programHours})*N(${c.programRate})/MAX(1,N(${c.lotsOverProgramLife}))`);
    case "machining": return guard(`${q}*N(${c.cycleMinutes})*${factor(c.cycleFactor)}/60*N(${c.machineRate})`);
    case "ops": return guard(`${q}*SUMPRODUCT($B$${OPS_FIRST}:$B$${OPS_LAST},$C$${OPS_FIRST}:$C$${OPS_LAST})/60+SUM($D$${OPS_FIRST}:$D$${OPS_LAST})`);
    case "cost": return guard(`${ref("material")}+${ref("setup")}+${ref("programming")}+${ref("machining")}+${ref("ops")}`);
    case "price": return guard(`${ref("cost")}*(1+N(${c.markupPct})/100)`);
    case "costEach": return guard(`${ref("cost")}/${q}`);
    case "priceEach": return guard(`${ref("price")}/${q}`);
    case "fixedShareEach": return guard(`(${ref("setup")}+${ref("programming")})/${q}`);
    // quote-doc.mjs: Math.ceil(Math.round(priceEach * 1e6) / 1e4) / 100
    case "quotedEach": return guard(`ROUNDUP(ROUND(${ref("priceEach")}*1000000,0)/10000,0)/100`);
    case "extended": return guard(`ROUND(${ref("quotedEach")}*${q},2)`);
  }
  throw new Error(`unknown line ${line}`);
}

const LINE_LABELS = {
  quantity: "Quantity priced (whole parts, at least 1)",
  material: "Material (with scrap)", setup: "Setup (once per lot)", programming: "Programming (share for this lot)",
  machining: "Machining", ops: "Other operations", cost: "Cost of the lot", price: "Price of the lot (cost + markup)",
  costEach: "Cost each", priceEach: "Price each", fixedShareEach: "Setup and programming in each part",
  quotedEach: "Price each on the quote (rounded up to the cent)", extended: "Extended price on the quote",
};

function worksheet(data = {}) {
  const inputs = data.inputs || {};
  const rows = [];
  rows.push(row(1, [cell("A1", "Machining quote worksheet (internal: the cost lines stay here)", S.title)]));
  rows.push(row(2, [cell("A2", "Shaded cells are yours. The template ships no rate, price or markup: use your own, from your books. The Customer quote sheet shows only the prices.", S.note)]));
  rows.push(row(3, [cell("A3", "Your rates", S.bold)]));
  for (const [k, label, r] of INPUTS) {
    if (r === 11) rows.push(row(10, [cell("A10", "The part", S.bold)]));
    const style = k === "partNumber" || k === "revision" ? S.input : k.endsWith("Pct") || k.endsWith("Factor") || k.endsWith("Hours") || k === "cycleMinutes" || k === "lotsOverProgramLife" ? S.inputNum : S.inputMoney;
    rows.push(row(r, [cell(`A${r}`, label), cell(`C${r}`, numOrBlank(inputs[k]), style)]));
  }
  rows.push(row(21, [cell("A21", "Other operations (deburr, inspection, heat treat, anodize, plating, an outside vendor's lot minimum)", S.bold)]));
  rows.push(row(22, ["Operation", "Minutes per part", "Rate ($ per hour)", "Flat charge per lot ($)"].map((h, i) => cell(`${"ABCD"[i]}22`, h, S.head))));
  for (let i = 0; i < OPS_ROWS; i++) {
    const r = OPS_FIRST + i, op = (data.ops || [])[i] || {};
    rows.push(row(r, [cell(`A${r}`, op.name ?? "", S.input), cell(`B${r}`, numOrBlank(op.minutesPerPart), S.inputNum), cell(`C${r}`, numOrBlank(op.rate), S.inputMoney), cell(`D${r}`, numOrBlank(op.lotCharge), S.inputMoney)]));
  }
  rows.push(row(30, [cell("A30", "Quantity breaks: each column is the whole quote re-run at that quantity, so a break is setup and programming spread over more parts, not a discount", S.bold)]));
  const breaks = data.breaks || [];
  rows.push(row(QTY_ROW, [cell(`A${QTY_ROW}`, "Quantity", S.bold), ...BREAK_COLS.map((c, i) => cell(`${c}${QTY_ROW}`, numOrBlank(breaks[i]), S.inputNum))]));
  for (const [line, r] of Object.entries(LINE_ROWS)) {
    const total = line === "cost" || line === "price" || line === "quotedEach";
    const style = line === "quantity" ? S.num : total ? S.totalMoney : S.money;
    rows.push(row(r, [cell(`A${r}`, LINE_LABELS[line], total ? S.bold : S.text), ...BREAK_COLS.map((c) => cell(`${c}${r}`, { f: lineFormula(line, c) }, style))]));
  }
  rows.push(row(46, [cell("A46", { f: `IF(OR(N(${CELL.setupFactor})<0,N(${CELL.cycleFactor})<0,AND(${CELL.setupFactor}<>"",N(${CELL.setupFactor})=0),AND(${CELL.cycleFactor}<>"",N(${CELL.cycleFactor})=0)),"A calibration factor of 0 or below counts as 1: leave it blank or type a number above 0.","")` }, S.flag)]));
  rows.push(row(47, [cell("A47", { f: `IF(COUNTIF(C13:C19,"<0")+COUNTIF(C4:C8,"<0")+COUNTIF(B${OPS_FIRST}:D${OPS_LAST},"<0")>0,"A negative rate, price, hour or minute: check the shaded cells.","")` }, S.flag)]));
  rows.push(row(49, [cell("A49", "Factors come from your own finished jobs (median actual ÷ quoted per machine): https://marisstella.app/machine-shop-guides/quote-vs-actual.html. Same arithmetic in the browser: https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html", S.note)]));
  const cols = [[1, 46], [2, 16], [3, 16], [4, 16], [5, 16], [6, 16], [7, 16], [8, 16]].map(([c, w]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`).join("");
  return sheetXml(rows, cols);
}

export const META = [
  ["shopName", "Your shop", 3], ["shopAddress", "Shop address", 4], ["shopContact", "Quoted by", 5], ["shopEmail", "Email", 6], ["shopPhone", "Phone", 7],
  ["customer", "Customer", 9], ["customerContact", "Attention", 10], ["rfqRef", "Customer RFQ or reference", 11],
  ["quoteNumber", "Quote number", 13], ["date", "Quote date", 14], ["validDays", "Valid for (days)", 15],
  ["description", "Description", 19], ["material", "Material", 20], ["finish", "Finish", 21], ["leadTime", "Lead time", 22], ["paymentTerms", "Payment terms", 23], ["shippingTerms", "Shipping terms", 24],
];
const M = Object.fromEntries(META.map(([k, , r]) => [k, `$B$${r}`]));
export const PRICE_FIRST = 27;
const NOTES_ROW = PRICE_FIRST + BREAK_COLS.length + 2;
export const CHECK_ROW = NOTES_ROW + 2;

export const CHECKS = [
  [`${M.shopName}=""`, "Your shop's name is not on the quote."],
  [`${M.customer}=""`, "No customer named."],
  [`${M.quoteNumber}=""`, "No quote number: the buyer's PO has nothing to reference."],
  [`$B$17=""`, "No part number (fill it in on the Quote worksheet)."],
  [`$B$18=""`, "No drawing revision: a quote that does not name the revision it priced can be held to a later one."],
  [`${M.leadTime}=""`, "No lead time."],
  [`${M.validDays}=""`, "No validity period: material prices move, so say how long the price holds."],
  [`${M.date}=""`, "No quote date."],
  [`${M.material}=""`, "No material stated: say what you priced, or that it is per the drawing."],
  [`COUNT(B${PRICE_FIRST}:B${PRICE_FIRST + BREAK_COLS.length - 1})=0`, "No prices yet: fill in the Quote worksheet."],
];

function customerSheet(data = {}) {
  const meta = data.meta || {};
  const rows = [row(1, [cell("A1", "Quotation", S.title)])];
  rows.push(row(2, [cell("A2", "Shaded cells are yours. Prices come from the Quote worksheet; the cost lines never appear here.", S.note)]));
  for (const [k, label, r] of META) {
    const style = k === "date" ? S.inputDate : k === "validDays" ? S.inputNum : k === "shopAddress" ? S.wrapInput : S.input;
    rows.push(row(r, [cell(`A${r}`, label, S.bold), cell(`B${r}`, numOrBlank(meta[k]), style)]));
    if (k === "validDays") rows.push(row(16, [cell("A16", "Valid until", S.bold), cell("B16", { f: `IF(OR(${M.date}="",${M.validDays}=""),"",${M.date}+${M.validDays})` }, S.date)]));
  }
  rows.push(row(17, [cell("A17", "Part number", S.bold), cell("B17", { f: `IF(${WS}!$C$11="","",${WS}!$C$11)` })]));
  rows.push(row(18, [cell("A18", "Revision", S.bold), cell("B18", { f: `IF(${WS}!$C$12="","",${WS}!$C$12)` })]));
  rows.push(row(PRICE_FIRST - 1, ["Quantity", "Price each", "Extended price"].map((h, i) => cell(`${"ABC"[i]}${PRICE_FIRST - 1}`, h, S.head))));
  BREAK_COLS.forEach((c, i) => {
    const r = PRICE_FIRST + i;
    rows.push(row(r, [
      cell(`A${r}`, { f: `IF(${WS}!${c}${LINE_ROWS.quantity}="","",${WS}!${c}${LINE_ROWS.quantity})` }, S.num),
      cell(`B${r}`, { f: `IF(${WS}!${c}${LINE_ROWS.quantity}="","",${WS}!${c}${LINE_ROWS.quotedEach})` }, S.money),
      cell(`C${r}`, { f: `IF(${WS}!${c}${LINE_ROWS.quantity}="","",${WS}!${c}${LINE_ROWS.extended})` }, S.money),
    ]));
  });
  rows.push(row(NOTES_ROW, [cell(`A${NOTES_ROW}`, "Notes and exclusions", S.bold), cell(`B${NOTES_ROW}`, meta.notes ?? "", S.wrapInput)]));
  const missing = CHECKS.map(([cond, text]) => `IF(${cond},"${text.replace(/"/g, '""')} ","")`).join("&");
  const p = (i) => `C${PRICE_FIRST + i}`;
  // A larger lot cheaper in total than the smaller lot in the column before it (quote-doc.mjs
  // compares neighbours after sorting; here the columns are compared as typed, larger after smaller).
  const cheaper = BREAK_COLS.slice(1).map((_, j) => `IF(AND(ISNUMBER(${p(j)}),ISNUMBER(${p(j + 1)})),IF(AND(A${PRICE_FIRST + j + 1}>A${PRICE_FIRST + j},${p(j + 1)}<${p(j)}),"Buying "&A${PRICE_FIRST + j + 1}&" costs less in total than buying "&A${PRICE_FIRST + j}&"; a buyer will order the larger lot. ",""),"")`).join("&");
  rows.push(row(CHECK_ROW, [cell(`A${CHECK_ROW}`, "Before you send it", S.bold), cell(`B${CHECK_ROW}`, { f: `${missing}&${cheaper}` }, S.flag)]));
  rows.push(row(CHECK_ROW + 2, [cell(`A${CHECK_ROW + 2}`, "Check every figure before you send it. Not legal, tax or financial advice. Free template from https://marisstella.app/machine-shop-guides/machining-quote-template.html", S.note)]));
  const cols = [[1, 30], [2, 44], [3, 18]].map(([c, w]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`).join("");
  return sheetXml(rows, cols);
}

function sheetXml(rows, cols) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

// Fills: 2 = shaded input, 3 = header. numFmt 164 = money, 165 = up to 4 decimals, 14 = date (built in).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00;-#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.####"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF54503F"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4ECE7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDAD6C8"/></left><right style="thin"><color rgb="FFDAD6C8"/></right><top style="thin"><color rgb="FFDAD6C8"/></top><bottom style="thin"><color rgb="FFDAD6C8"/></bottom><diagonal/></border><border><left/><right/><top style="medium"/><bottom style="double"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="15"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="165" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="166" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Quote worksheet" sheetId="1" r:id="rId1"/><sheet name="Customer quote" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Minimal zip writer: stored entries, DOS date 1980-01-01 00:00 (the same writer
// as ventures/pay-app-guides/template.mjs, copied so this venture stands alone).
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

/** data: { inputs: {quote.mjs keys}, ops: [{name, minutesPerPart, rate, lotCharge}], breaks: [q...], meta: {...} } */
export function buildWorkbook(data = {}) {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", WORKBOOK],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", worksheet(data)],
    ["xl/worksheets/sheet2.xml", customerSheet(data)],
  ]);
}

// The blank template only: quantity breaks are pre-filled (the calculator's
// DEFAULT_BREAKS), and nothing else, so it carries no cost figure of ours.
export const TEMPLATE = { breaks: [1, 5, 10, 25, 50, 100] };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = new URL(`./${FILE}`, import.meta.url), bytes = buildWorkbook(TEMPLATE);
  if (process.argv.includes("--check")) {
    let same = false;
    try { same = readFileSync(path).equals(bytes); } catch {}
    if (!same) { console.error(`${FILE} is stale: run node quote-template.mjs`); process.exit(1); }
  } else { writeFileSync(path, bytes); console.log(`wrote ${FILE} (${bytes.length} bytes)`); }
}
