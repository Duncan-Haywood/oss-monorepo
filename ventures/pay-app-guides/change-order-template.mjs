// Builds the free change order form template (Excel): the request a subcontractor
// sends the GC to turn extra (or deleted) work into a signed change order. The
// scope and its reason, priced lines (a deduct is a negative quantity or price),
// overhead and profit at the user's own rate, the contract sum before and after,
// the change in contract time and the completion date it gives, a checks line,
// and two signature blocks.
//
// Our own layout (it is not the AIA G701 form). Same approach as
// invoice-template.mjs, whose styles and date serials it reuses: SpreadsheetML
// in a stored zip with fixed timestamps, so the same input gives the same bytes
// and change-order-template.test.mjs can check the committed files.
//
//   node change-order-template.mjs          rewrites the two .xlsx files next to it
//   node change-order-template.mjs --check  exits 1 if either committed file is stale

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cell, row, zip } from "./template.mjs";
import { S, STYLES, num, serial } from "./invoice-template.mjs";

export const FIRST = 13;            // first priced line
export const LINES = 20;            // lines in the template
export const LAST = FIRST + LINES - 1;
const B = LAST + 2;                 // subtotal row; the rows below it follow in order
export const R = {
  subtotal: B, markup: B + 1, total: B + 2,
  original: B + 5, previous: B + 6, before: B + 7, thisCo: B + 8, after: B + 9,
  days: B + 12, completion: B + 13, newCompletion: B + 14,
  checks: B + 16,
  submitted: B + 18, accepted: B + 23,
};

export const HEADERS = ["Item", "Description (labor, material, equipment, lower-tier sub)", "Qty", "Unit", "Unit price", "Amount"];

function changeOrderSheet({ lines = [], settings = {} }) {
  const s = settings, rows = [];
  rows.push(row(1, [cell("A1", "Change order request", S.title)]));
  const field = (r, label, value, style = S.input) => rows.push(row(r, [cell(`A${r}`, label, S.bold), cell(`B${r}`, value ?? "", style)]));
  field(2, "From (company, address, licence no.)", s.from);
  field(3, "To (general contractor or owner)", s.to);
  field(4, "Project name and address", s.project);
  field(5, "Subcontract or job no.", s.subcontract);
  rows.push(row(6, [cell("A6", "Change order no.", S.bold), cell("B6", s.coNo ?? "", S.input), cell("D6", "Date sent", S.bold), cell("F6", serial(s.date), S.inputDate)]));
  field(7, "Reason (RFI, ASI or directive)", s.reason);
  field(8, "The change, in plain words", s.scope);
  field(9, "Not included", s.excluded);
  rows.push(row(10, [cell("A10", "Shaded cells are yours to fill in. A lump-sum line leaves Qty blank.", S.note)]));
  rows.push(row(11, [cell("A11", "A deduct (work taken out) is a negative quantity or unit price, so its total shows as a credit.", S.note)]));
  rows.push(row(12, HEADERS.map((h, i) => cell(`${"ABCDEF"[i]}12`, h, S.head))));
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
  const line = (r, label, extra, value, style = S.money, bold = false) => rows.push(row(r, [cell(`A${r}`, "", S.text), cell(`B${r}`, label, bold ? S.bold : S.text), ...extra, cell(`F${r}`, value, style)]));
  line(R.subtotal, "Subtotal, cost of the change", [], { f: `SUM(F${FIRST}:F${LAST})` });
  line(R.markup, "Overhead and profit, % (type your contract's rate)", [cell(`E${R.markup}`, num(s.markup), S.inputPct)], { f: `ROUND(F${R.subtotal}*N(E${R.markup})/100,2)` });
  line(R.total, "Total of this change order", [], { f: `F${R.subtotal}+F${R.markup}` }, S.totalMoney, true);

  rows.push(row(R.original - 1, [cell(`A${R.original - 1}`, "Contract sum", S.bold)]));
  line(R.original, "Original contract sum (type it)", [], num(s.original), S.inputMoney);
  line(R.previous, "Net change by change orders approved before this one (type it)", [], num(s.previous), S.inputMoney);
  line(R.before, "Contract sum before this change order", [], { f: `IF(F${R.original}="","",F${R.original}+N(F${R.previous}))` });
  line(R.thisCo, "This change order", [], { f: `F${R.total}` });
  line(R.after, "New contract sum, once signed", [], { f: `IF(F${R.original}="","",F${R.before}+F${R.thisCo})` }, S.totalMoney, true);

  rows.push(row(R.days - 1, [cell(`A${R.days - 1}`, "Contract time", S.bold)]));
  line(R.days, "Change in contract time, calendar days (0 = no schedule impact)", [], num(s.days), S.inputPct);
  line(R.completion, "Completion date before this change order (type it)", [], serial(s.completion), S.inputDate);
  line(R.newCompletion, "New completion date, once signed", [], { f: `IF(OR(F${R.completion}="",F${R.days}=""),"",F${R.completion}+F${R.days})` }, S.date);

  const blankPrice = `SUMPRODUCT((C${FIRST}:C${LAST}<>"")*(E${FIRST}:E${LAST}=""))`;
  rows.push(row(R.checks, [cell(`A${R.checks}`, "Checks", S.bold), cell(`B${R.checks}`, { f:
    `IF(N(E${R.markup})>100,"Overhead and profit is over 100%.",` +
    `IF(${blankPrice}>0,${blankPrice}&" line(s) have a quantity and no unit price.",` +
    `IF(AND(F${R.after}<>"",N(F${R.after})<0),"New contract sum is negative: check the deduct.",` +
    `IF(AND(F${R.total}<>0,F${R.original}=""),"Type the original contract sum to see the new one.",` +
    `IF(AND(F${R.total}<>0,F${R.days}=""),"Say the change in contract time, even if it is 0 days.","")))))` }, S.flag)]));

  const signer = (r, title, who) => {
    rows.push(row(r, [cell(`A${r}`, title, S.bold)]));
    rows.push(row(r + 1, [cell(`A${r + 1}`, "Name and title", S.text), cell(`B${r + 1}`, who ?? "", S.input)]));
    rows.push(row(r + 2, [cell(`A${r + 2}`, "Signature", S.text), cell(`B${r + 2}`, "", S.input)]));
    rows.push(row(r + 3, [cell(`A${r + 3}`, "Date", S.text), cell(`B${r + 3}`, "", S.inputDate)]));
  };
  signer(R.submitted, "Submitted by (subcontractor)", s.submittedBy);
  signer(R.accepted, "Accepted by (general contractor or owner)", "");
  const end = R.accepted + 5;
  [
    "Until both have signed, this is a request: track it in your change order log, do not bill it.",
    "Your subcontract's change and notice clauses decide what a request must contain and when it is due.",
    "Not an AIA document; not legal advice. Check every figure against your contract before you send it.",
    "Free template from https://marisstella.app/pay-app-guides/change-order-template.html",
  ].forEach((t, i) => rows.push(row(end + i, [cell(`A${end + i}`, t, S.note)])));
  const cols = [34, 54, 8, 7, 12, 14].map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="1"/></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Change order" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

export function buildChangeOrder(data = {}) {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", WORKBOOK],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", changeOrderSheet(data)],
  ]);
}

// The page's worked example, the same CO-1 the change-orders guide puts on the
// schedule of values: EV charger circuits on a $150,000 electrical subcontract.
// 44 h x 92.50 (4,070.00) + 3,207.27 material + 450.00 rental = 7,727.27;
// 10% overhead and profit 772.73; total 8,500.00; contract sum 150,000.00 to
// 158,500.00; 3 calendar days, completion 2027-03-31 to 2027-04-03.
export const EXAMPLE = {
  lines: [
    { item: "1", description: "Electrician labor: 4 EV charger circuits, garage level P1", qty: "44", unit: "HR", price: "92.50" },
    { item: "2", description: "Material: wire, conduit, 4 x 50 A breakers, boxes (quote attached)", qty: "", unit: "LS", price: "3207.27" },
    { item: "3", description: "Equipment: core drill rental", qty: "1", unit: "DAY", price: "450" },
  ],
  settings: {
    from: "Example Electric LLC", to: "Example General Contractor", project: "Example office building, garage level P1",
    subcontract: "SC-2026-204", coNo: "CO-1", date: "2026-10-12", reason: "ASI-07 (owner adds EV charging)",
    scope: "Add four 50 A EV charger circuits from panel P1-B to the four marked stalls.", excluded: "Chargers themselves (owner-furnished); utility upgrades.",
    markup: "10", original: "150000", previous: "0", days: "3", completion: "2027-03-31", submittedBy: "Pat Example, project manager",
  },
};

export const OUTPUTS = {
  "change-order-template.xlsx": () => buildChangeOrder({}),
  "change-order-example.xlsx": () => buildChangeOrder(EXAMPLE),
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [name, build] of Object.entries(OUTPUTS)) {
    const path = new URL(`./${name}`, import.meta.url), bytes = build();
    if (check) {
      let same = false;
      try { same = readFileSync(path).equals(bytes); } catch {}
      if (!same) { stale++; console.error(`${name} is stale: run node change-order-template.mjs`); }
    } else { writeFileSync(path, bytes); console.log(`wrote ${name} (${bytes.length} bytes)`); }
  }
  process.exit(stale ? 1 : 0);
}
