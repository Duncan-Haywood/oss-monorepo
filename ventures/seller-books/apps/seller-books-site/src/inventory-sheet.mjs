// The free reseller inventory spreadsheet (Excel), built with the site: one row per purchase, the
// columns the app's sourcing-sheet import reads (apps/seller-books/src/worker/services/importers/
// inventory-sheet.ts), profit per sale, and a "Year summary" sheet with the Schedule C Part III figures
// those rows give (purchases less personal use, items sold, written off, still in stock on December 31).
//
// No library: SpreadsheetML in a zip (deflated entries, fixed timestamps), so the same input gives the
// same bytes on one Node version. The approach follows ventures/pay-app-guides/template.mjs (same owner).
// build.mjs writes both files into dist/; test/inventory-sheet.test.mjs checks the headers against the
// importer and, where LibreOffice is installed, recalculates the example and reads it back.
import { crc32, deflateRawSync } from "node:zlib";

export const TEMPLATE_FILE = "reseller-inventory-spreadsheet.xlsx";
export const EXAMPLE_FILE = "reseller-inventory-spreadsheet-example.xlsx";

export const FIRST = 2; // first item row (row 1 is the header, so the sheet saves as a clean CSV)
export const ROWS = 500; // item rows with formulas
export const LAST = FIRST + ROWS - 1;

/** The status list offered in column I. The import reads Kept, Donated and Lost (with a date removed). */
export const STATUSES = ["In stock", "Listed", "Sold", "Kept", "Donated", "Lost"];

/**
 * Columns, in order. `imported`: the app's import reads it (the header must be one of the importer's
 * names); `formula`: worked out by the sheet, never typed. `about` is printed on the page and in Read me.
 */
export const COLUMNS = [
  {
    key: "item",
    header: "Item",
    kind: "text",
    imported: true,
    width: 30,
    about: "What you bought: a short name you will recognise.",
  },
  {
    key: "sku",
    header: "SKU",
    kind: "text",
    imported: true,
    width: 12,
    about:
      "Your own code for the item. Put the same code in the listing's SKU or custom label field, so a sale can be matched to the item.",
  },
  {
    key: "qty",
    header: "Qty",
    kind: "int",
    imported: true,
    width: 6,
    about: "How many of the same thing on this row. Blank means 1.",
  },
  {
    key: "unit",
    header: "Unit Cost",
    kind: "money",
    imported: true,
    width: 11,
    about: "What you paid for each one.",
  },
  {
    key: "total",
    header: "Total Cost",
    kind: "money",
    imported: true,
    width: 11,
    about:
      "For a lot, bin haul or mystery box bought for one price: the price for the whole row. Used instead of Unit Cost when both are filled.",
  },
  {
    key: "bought",
    header: "Date Bought",
    kind: "date",
    imported: true,
    width: 12,
    about: "The day you bought it.",
  },
  {
    key: "source",
    header: "Where Bought",
    kind: "text",
    imported: false,
    width: 18,
    about: "The thrift store, estate sale or website. For your own records.",
  },
  {
    key: "platform",
    header: "Platform",
    kind: "text",
    imported: false,
    width: 12,
    about: "Where it is listed or sold.",
  },
  {
    key: "status",
    header: "Status",
    kind: "status",
    imported: true,
    width: 10,
    about: `One of ${STATUSES.join(", ")}. Kept, Donated and Lost need a Date Removed.`,
  },
  {
    key: "removed",
    header: "Date Removed",
    kind: "date",
    imported: true,
    width: 12,
    about:
      "The day an item left your stock without being sold: kept for yourself, donated, lost or thrown away.",
  },
  {
    key: "sold",
    header: "Date Sold",
    kind: "date",
    imported: false,
    width: 12,
    about:
      "The day it sold. The app does not read this column: it takes sales from your marketplace reports instead.",
  },
  {
    key: "price",
    header: "Sold For",
    kind: "money",
    imported: false,
    width: 10,
    about: "What the buyer paid for the item, before fees.",
  },
  {
    key: "fees",
    header: "Fees",
    kind: "money",
    imported: false,
    width: 9,
    about: "The platform's fees on that sale, from the order page.",
  },
  {
    key: "ship",
    header: "Shipping Paid",
    kind: "money",
    imported: false,
    width: 10,
    about: "The label or postage you paid for that sale, if you paid it.",
  },
  {
    key: "cost",
    header: "Row Cost",
    kind: "formula",
    imported: false,
    width: 10,
    about: "Worked out: Total Cost, or Unit Cost times Qty.",
  },
  {
    key: "profit",
    header: "Profit",
    kind: "formula",
    imported: false,
    width: 10,
    about: "Worked out once Sold For is filled: Sold For less Fees, Shipping Paid and Row Cost.",
  },
  {
    key: "days",
    header: "Days to Sell",
    kind: "formula",
    imported: false,
    width: 9,
    about: "Worked out: Date Sold less Date Bought.",
  },
  {
    key: "age",
    header: "Days in Stock",
    kind: "formula",
    imported: false,
    width: 9,
    about: "Worked out for an item still on hand: days since Date Bought, as of today.",
  },
];

const COL = Object.fromEntries(COLUMNS.map((c, i) => [c.key, String.fromCharCode(65 + i)]));
const INV = "Inventory";
const rng = (key) => `${INV}!$${COL[key]}$${FIRST}:$${COL[key]}$${LAST}`;

const xml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

// Style ids, in cellXfs order (STYLES below).
export const S = {
  text: 0,
  title: 1,
  head: 2,
  money: 3,
  input: 4,
  inputMoney: 5,
  inputDate: 6,
  inputInt: 7,
  totalMoney: 8,
  bold: 9,
  note: 10,
  flag: 11,
  int: 12,
  date: 13,
};

function cell(ref, v, style = S.text) {
  if (v == null || v === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  if (typeof v === "number") return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  if (typeof v === "object" && v.f) return `<c r="${ref}" s="${style}"><f>${xml(v.f)}</f></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}
const row = (r, cells) => `<row r="${r}">${cells.join("")}</row>`;

/** An ISO date as an Excel date serial (days since 1899-12-30). */
export function serial(iso) {
  if (!iso) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`not an ISO date: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}
// Plain decimals only; the example's inputs are fixed, so a bad one is a bug.
const num = (s) => {
  if (s === "" || s == null) return "";
  if (!/^-?\d+(\.\d+)?$/.test(String(s))) throw new Error(`not a plain number: ${s}`);
  return Number(s);
};

function formula(key, r) {
  const c = (k) => `${COL[k]}${r}`;
  switch (key) {
    case "cost":
      return `IF(${c("total")}<>"",${c("total")},IF(${c("unit")}="","",${c("unit")}*IF(${c("qty")}="",1,${c("qty")})))`;
    case "profit":
      return `IF(OR(${c("price")}="",${c("cost")}=""),"",${c("price")}-N(${c("fees")})-N(${c("ship")})-${c("cost")})`;
    case "days":
      return `IF(OR(${c("bought")}="",${c("sold")}=""),"",${c("sold")}-${c("bought")})`;
    case "age":
      return `IF(OR(${c("bought")}="",${c("sold")}<>"",${c("removed")}<>""),"",TODAY()-${c("bought")})`;
    default:
      throw new Error(key);
  }
}

function styleFor(col) {
  return {
    text: S.input,
    status: S.input,
    int: S.inputInt,
    money: S.inputMoney,
    date: S.inputDate,
  }[col.kind];
}

function inventorySheet(items = []) {
  const rows = [
    row(
      1,
      COLUMNS.map((c, i) => cell(`${String.fromCharCode(65 + i)}1`, c.header, S.head)),
    ),
  ];
  for (let i = 0; i < ROWS; i++) {
    const r = FIRST + i;
    const it = items[i] || {};
    rows.push(
      row(
        r,
        COLUMNS.map((c) => {
          const ref = `${COL[c.key]}${r}`;
          if (c.kind === "formula") {
            const style = c.key === "days" || c.key === "age" ? S.int : S.money;
            return cell(ref, { f: formula(c.key, r) }, style);
          }
          const v = it[c.key];
          const value =
            c.kind === "date"
              ? serial(v)
              : c.kind === "money" || c.kind === "int"
                ? num(v)
                : (v ?? "");
          return cell(ref, value, styleFor(c));
        }),
      ),
    );
  }
  const cols = COLUMNS.map(
    (c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`,
  ).join("");
  const statusCol = COL.status;
  const validation = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Status" error="Pick one from the list: ${STATUSES.join(", ")}." sqref="${statusCol}${FIRST}:${statusCol}${LAST}"><formula1>"${STATUSES.join(",")}"</formula1></dataValidation></dataValidations>`;
  return sheetXml(
    rows,
    cols,
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>`,
    {
      autoFilter: `A1:${String.fromCharCode(64 + COLUMNS.length)}${LAST}`,
      validation,
    },
  );
}

/**
 * The year summary, line by line. Each `f` is a formula over the Inventory sheet, with $B$3 the first
 * day of the year and $B$4 the last. `line` is the Schedule C Part III line the figure feeds, if any.
 */
export function summaryLines() {
  const inYear = (key) => `(${rng(key)}>=$B$3)*(${rng(key)}<=$B$4)`;
  const status = (...names) => `(${names.map((n) => `(${rng("status")}="${n}")`).join("+")})`;
  const cost = rng("cost");
  const onHand = (day) =>
    `SUMPRODUCT((${rng("bought")}<>"")*(${rng("bought")}<=${day})*((${rng("sold")}="")+(${rng("sold")}>${day}))*((${rng("removed")}="")+(${rng("removed")}>${day})),${cost})`;
  return [
    {
      label: "On hand January 1, at cost",
      line: "35",
      f: onHand("$B$3-1"),
      note: "Bought before the year, not yet sold or removed on January 1. Compare with last year's line 41.",
    },
    {
      label: "Bought during the year, at cost",
      line: null,
      f: `SUMPRODUCT(${inYear("bought")},${cost})`,
      note: "Rows dated in the year.",
    },
    {
      label: "Kept for yourself during the year, at cost",
      line: null,
      f: `SUMPRODUCT(${inYear("removed")}*${status("Kept")},${cost})`,
      note: "Status Kept, with a Date Removed in the year.",
    },
    {
      label: "Purchases less items kept for yourself",
      line: "36",
      f: "B8-B9",
      note: "Bought during the year, less kept.",
    },
    {
      label: "Sold during the year, at cost",
      line: null,
      f: `SUMPRODUCT(${inYear("sold")},${cost})`,
      note: "Rows with a Date Sold in the year.",
    },
    {
      label: "Donated, lost or thrown away during the year, at cost",
      line: null,
      f: `SUMPRODUCT(${inYear("removed")}*${status("Donated", "Lost")},${cost})`,
      note: "Status Donated or Lost, with a Date Removed in the year.",
    },
    {
      label: "Still in stock December 31, at cost",
      line: "41",
      f: onHand("$B$4"),
      note: "Bought by December 31, not sold or removed by then.",
    },
    {
      label: "Check: should be zero",
      line: null,
      f: "ROUND(B7+B8-B9-B11-B12-B13,2)",
      note: "January 1 plus bought, less kept, sold, written off and December 31. Not zero: a row has both a Date Sold and a Date Removed, a Date Removed with no Kept, Donated or Lost status, or a date sold or removed before the date bought.",
    },
  ];
}

function summarySheet(year) {
  const rows = [row(1, [cell("A1", "Year summary", S.title)])];
  rows.push(
    row(2, [
      cell("A2", "Tax year", S.bold),
      cell("B2", year, S.inputInt),
      cell(
        "C2",
        "Type the year. Every figure below is worked out from the Inventory sheet.",
        S.note,
      ),
    ]),
  );
  rows.push(row(3, [cell("A3", "From", S.text), cell("B3", { f: "DATE(B2,1,1)" }, S.date)]));
  rows.push(row(4, [cell("A4", "To", S.text), cell("B4", { f: "DATE(B2,12,31)" }, S.date)]));
  rows.push(
    row(6, [
      cell("A6", "At cost", S.head),
      cell("B6", "Amount", S.head),
      cell("C6", "Schedule C Part III", S.head),
      cell("D6", "What it counts", S.head),
    ]),
  );
  summaryLines().forEach((l, i) => {
    const r = 7 + i;
    const check = i === 7;
    rows.push(
      row(r, [
        cell(`A${r}`, l.label, check ? S.bold : S.text),
        cell(`B${r}`, { f: l.f }, check ? S.totalMoney : S.money),
        cell(`C${r}`, l.line ? `Line ${l.line}` : "", S.text),
        cell(`D${r}`, l.note, S.note),
      ]),
    );
  });
  const sold = `(${rng("sold")}>=$B$3)*(${rng("sold")}<=$B$4)`;
  rows.push(
    row(16, [
      cell("A16", "Sales during the year", S.head),
      cell("B16", "Amount", S.head),
      cell("C16", "", S.head),
      cell("D16", "", S.head),
    ]),
  );
  const sales = [
    [
      "Items sold",
      `SUMPRODUCT(${sold}*(${rng("price")}<>""))`,
      S.int,
      "Rows with a Date Sold in the year and a Sold For.",
    ],
    ["Sold for", `SUMPRODUCT(${sold},${rng("price")})`, S.money, "Before fees."],
    ["Fees", `SUMPRODUCT(${sold},${rng("fees")})`, S.money, ""],
    ["Shipping paid", `SUMPRODUCT(${sold},${rng("ship")})`, S.money, ""],
    [
      "Profit on those sales",
      `SUMPRODUCT(${sold},${rng("profit")})`,
      S.totalMoney,
      "Sold for, less fees, shipping paid and what the items cost. Other costs (supplies, miles, a storage unit) are not in this sheet.",
    ],
  ];
  sales.forEach(([label, f, style, note], i) => {
    const r = 17 + i;
    rows.push(
      row(r, [
        cell(`A${r}`, label, i === 4 ? S.bold : S.text),
        cell(`B${r}`, { f }, style),
        cell(`C${r}`, ""),
        cell(`D${r}`, note, S.note),
      ]),
    );
  });
  const named = `((${rng("item")}<>"")+(${rng("sku")}<>"")>0)`;
  rows.push(
    row(23, [
      cell(
        "A23",
        {
          f: `IF(SUMPRODUCT(${named}*(${rng("cost")}=""))>0,SUMPRODUCT(${named}*(${rng("cost")}=""))&" row(s) have no cost: the import skips them.","")`,
        },
        S.flag,
      ),
    ]),
  );
  rows.push(
    row(24, [
      cell(
        "A24",
        {
          f: `IF(SUMPRODUCT(${named}*(${rng("bought")}=""))>0,SUMPRODUCT(${named}*(${rng("bought")}=""))&" row(s) have no date bought: the import skips them.","")`,
        },
        S.flag,
      ),
    ]),
  );
  rows.push(
    row(26, [
      cell(
        "A26",
        "Figures to check with your tax preparer, not a tax return and not tax advice. Free template from https://marisstella.app/seller-books/reseller-inventory-spreadsheet",
        S.note,
      ),
    ]),
  );
  const cols = [
    [1, 46],
    [2, 14],
    [3, 18],
    [4, 90],
  ]
    .map(([c, w]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`)
    .join("");
  return sheetXml(rows, cols, "", {});
}

export const READ_ME = [
  "Reseller inventory spreadsheet: how to use it",
  "One row per purchase. Shaded cells are yours to fill in; Row Cost, Profit, Days to Sell and Days in Stock are worked out.",
  "A lot, bin haul or mystery box bought for one price: put the number of items in Qty and the price in Total Cost, or give each item its own row and cost.",
  "An item you keep, donate, lose or throw away: set Status to Kept, Donated or Lost and fill in Date Removed. Its cost then leaves your stock that year.",
  "The Year summary sheet adds up the year you type: what was on hand on January 1, bought, kept, sold, written off and still in stock on December 31, at cost.",
  "Moving to Seller Books: with the Inventory sheet open, save as CSV (File > Save As > CSV) and import it on the Inventory page under 'Import your sourcing sheet'. It reads Item, SKU, Qty, Unit Cost, Total Cost, Date Bought, Status and Date Removed, shows a preview first, and importing the same sheet again adds only new rows.",
  "Sales come into Seller Books from your marketplace reports, matched to these items by SKU, so the Date Sold, Sold For, Fees and Shipping Paid columns are for this sheet only.",
  "Not tax advice. Check the figures with your tax preparer. Free template from https://marisstella.app/seller-books/reseller-inventory-spreadsheet",
];

function readMeSheet() {
  const rows = READ_ME.map((t, i) =>
    row(i + 1, [cell(`A${i + 1}`, t, i === 0 ? S.title : S.text)]),
  );
  rows.push(row(READ_ME.length + 2, [cell(`A${READ_ME.length + 2}`, "Columns", S.bold)]));
  COLUMNS.forEach((c, i) => {
    const r = READ_ME.length + 3 + i;
    rows.push(row(r, [cell(`A${r}`, `${c.header}: ${c.about}`, S.text)]));
  });
  return sheetXml(rows, `<col min="1" max="1" width="150" customWidth="1"/>`, "", {});
}

function sheetXml(rows, cols, pane, { autoFilter, validation } = {}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData>${autoFilter ? `<autoFilter ref="${autoFilter}"/>` : ""}${validation ?? ""}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;-#,##0.00"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF54503F"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFE8D8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDAD6C8"/></left><right style="thin"><color rgb="FFDAD6C8"/></right><top style="thin"><color rgb="FFDAD6C8"/></top><bottom style="thin"><color rgb="FFDAD6C8"/></bottom><diagonal/></border><border><left/><right/><top style="medium"/><bottom style="double"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="166" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="1" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const SHEETS = [INV, "Year summary", "Read me"];
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${SHEETS.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${SHEETS.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${INV}!$A$1:$${String.fromCharCode(64 + COLUMNS.length)}$${LAST}</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${SHEETS.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${SHEETS.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Minimal zip writer: deflated entries, DOS date 1980-01-01 00:00.
function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text, "utf8");
    const data = deflateRawSync(raw, { level: 9 });
    const fname = Buffer.from(name, "utf8");
    const crc = crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(fname.length, 26);
    local.push(h, fname, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(fname.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, fname);
    offset += 30 + fname.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

/** The workbook as bytes. `items`: rows for the Inventory sheet (ISO dates, plain-decimal money). */
export function buildWorkbook({ items = [], year = 2026 } = {}) {
  if (items.length > ROWS) throw new Error(`at most ${ROWS} rows`);
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", WORKBOOK],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", inventorySheet(items)],
    ["xl/worksheets/sheet2.xml", summarySheet(year)],
    ["xl/worksheets/sheet3.xml", readMeSheet()],
  ]);
}

/**
 * The invented example, a year of a small clothing and homewares reseller. Its year-summary figures are
 * worked out by hand in EXAMPLE_SUMMARY, and test/inventory-sheet.test.mjs checks the sheet agrees.
 */
export const EXAMPLE_ITEMS = [
  {
    item: "Wool coat",
    sku: "COAT-01",
    unit: "12.00",
    bought: "2025-11-08",
    source: "Thrift store",
    platform: "eBay",
    status: "Sold",
    sold: "2026-01-14",
    price: "68.00",
    fees: "8.97",
    ship: "9.40",
  },
  {
    item: "Denim jacket",
    sku: "DEN-02",
    unit: "9.00",
    bought: "2025-12-03",
    source: "Estate sale",
    platform: "Poshmark",
    status: "Listed",
  },
  {
    item: "Jeans, bin haul",
    sku: "JEANS-03",
    qty: "5",
    total: "20.00",
    bought: "2026-02-10",
    source: "Goodwill bins",
    platform: "Mercari",
    status: "Listed",
  },
  {
    item: "Pyrex bowl set",
    sku: "PYR-04",
    unit: "15.00",
    bought: "2026-03-02",
    source: "Garage sale",
    platform: "eBay",
    status: "Sold",
    sold: "2026-03-30",
    price: "55.00",
    fees: "7.30",
    ship: "14.25",
  },
  {
    item: "Leather boots",
    sku: "BOOT-05",
    unit: "18.00",
    bought: "2026-04-19",
    source: "Thrift store",
    platform: "Poshmark",
    status: "Sold",
    sold: "2026-06-02",
    price: "80.00",
    fees: "16.00",
  },
  {
    item: "Table lamp",
    sku: "LAMP-06",
    unit: "7.50",
    bought: "2026-05-11",
    source: "Garage sale",
    status: "Kept",
    removed: "2026-07-01",
  },
  {
    item: "Kids' jacket",
    sku: "KID-07",
    unit: "4.00",
    bought: "2026-06-20",
    source: "Thrift store",
    status: "Donated",
    removed: "2026-10-15",
  },
  {
    item: "Vintage band tee",
    sku: "TEE-08",
    unit: "6.00",
    bought: "2026-08-08",
    source: "Flea market",
    platform: "Depop",
    status: "Sold",
    sold: "2026-08-21",
    price: "45.00",
    fees: "4.95",
    ship: "5.20",
  },
  {
    item: "Cashmere sweater",
    sku: "CASH-09",
    unit: "10.00",
    bought: "2026-11-22",
    source: "Thrift store",
    platform: "eBay",
    status: "Listed",
  },
  {
    item: "Ski jacket",
    sku: "SKI-10",
    unit: "25.00",
    bought: "2026-12-05",
    source: "Online auction",
    platform: "eBay",
    status: "Sold",
    sold: "2027-01-09",
    price: "120.00",
    fees: "15.84",
    ship: "12.60",
  },
];

/** The example's 2026 Year summary, worked out by hand from EXAMPLE_ITEMS. */
export const EXAMPLE_SUMMARY = {
  onHandJan1: 21.0, // coat 12 + denim jacket 9 (both bought in 2025, unsold on January 1)
  bought: 105.5, // 20 + 15 + 18 + 7.5 + 4 + 6 + 10 + 25
  kept: 7.5, // lamp
  line36: 98.0, // 105.5 - 7.5
  soldAtCost: 51.0, // coat 12 + Pyrex 15 + boots 18 + tee 6
  writtenOff: 4.0, // kids' jacket
  onHandDec31: 64.0, // denim 9 + jeans 20 + sweater 10 + ski jacket 25 (sold in 2027)
  check: 0,
  itemsSold: 4,
  soldFor: 248.0, // 68 + 55 + 80 + 45
  fees: 37.22, // 8.97 + 7.30 + 16.00 + 4.95
  shipping: 28.85, // 9.40 + 14.25 + 5.20
  profit: 130.93, // 248 - 37.22 - 28.85 - 51
};

export const OUTPUTS = {
  [TEMPLATE_FILE]: () => buildWorkbook({}),
  [EXAMPLE_FILE]: () => buildWorkbook({ items: EXAMPLE_ITEMS }),
};
