// Builds the free contractor WIP (work-in-progress) schedule template (Excel):
// one row per open job, cost-to-cost percent complete, earned revenue, over-
// and underbilling, gross profit to date with a losing job's whole expected
// loss booked now, backlog, and the totals a bank or surety reads.
//
// Same arithmetic as the free contractor-wip-schedule tool (its calc.mjs
// `evaluate`); wip-template.test.mjs checks the example's figures against it.
// Same approach as invoice-template.mjs: SpreadsheetML in a stored zip with
// fixed timestamps, so the same input gives the same bytes.
//
//   node wip-template.mjs          rewrites the two .xlsx files next to it
//   node wip-template.mjs --check  exits 1 if either committed file is stale

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cell, row, zip } from "./template.mjs";
import { S, STYLES, num, serial } from "./invoice-template.mjs";

export const FIRST = 8;             // first job row
export const JOBS = 30;             // job rows in the template
export const LAST = FIRST + JOBS - 1;
export const TOTAL = LAST + 1;      // totals row
export const SUM0 = TOTAL + 2;      // first summary line

export const HEADERS = [
  "Job", "Contract amount (with approved change orders)", "Estimated total cost", "Cost to date", "Billed to date (before retainage)",
  "Estimated gross profit", "% complete (cost to date / estimated cost)", "Earned revenue", "Overbilled (billings in excess)", "Underbilled (costs in excess)",
  "Gross profit to date (loss jobs: whole loss)", "Provision for loss not yet in cost", "Backlog: revenue left to earn", "Cost to complete", "Check",
];
const COLS = "ABCDEFGHIJKLMNO";

function jobRow(r, j = {}) {
  const blank = `AND(B${r}="",C${r}="",D${r}="",E${r}="")`;
  const f = (expr) => ({ f: `IF(${blank},"",${expr})` });
  return row(r, [
    cell(`A${r}`, j.name ?? "", S.input),
    cell(`B${r}`, num(j.contract), S.inputMoney),
    cell(`C${r}`, num(j.est), S.inputMoney),
    cell(`D${r}`, num(j.cost), S.inputMoney),
    cell(`E${r}`, num(j.billed), S.inputMoney),
    cell(`F${r}`, f(`N(B${r})-N(C${r})`), S.money),
    // Held at 100% when cost has passed the estimate (the Check column says so).
    cell(`G${r}`, f(`IF(N(C${r})<=0,"",MIN(1,N(D${r})/C${r}))`), S.pct),
    cell(`H${r}`, f(`IF(G${r}="","",ROUND(G${r}*N(B${r}),2))`), S.money),
    cell(`I${r}`, f(`IF(H${r}="","",MAX(0,N(E${r})-H${r}))`), S.money),
    cell(`J${r}`, f(`IF(H${r}="","",MAX(0,H${r}-N(E${r})))`), S.money),
    cell(`K${r}`, f(`IF(H${r}="","",IF(F${r}<0,F${r},H${r}-N(D${r})))`), S.money),
    cell(`L${r}`, f(`IF(H${r}="","",IF(F${r}<0,MAX(0,-F${r}-MAX(0,N(D${r})-H${r})),0))`), S.money),
    cell(`M${r}`, f(`IF(H${r}="","",N(B${r})-H${r})`), S.money),
    cell(`N${r}`, f(`MAX(0,N(C${r})-N(D${r}))`), S.money),
    cell(`O${r}`, f(`IF(OR(N(B${r})<=0,N(C${r})<=0),"Contract and estimated cost are both needed.",IF(N(D${r})>N(C${r}),"Cost is past the estimate: raise the estimate if work remains.",IF(N(E${r})>N(B${r}),"Billed more than the contract: a change order missing?",IF(F${r}<0,"Losing job: whole loss booked now.",""))))`), S.flag),
  ]);
}

function wipSheet({ jobs = [], settings = {} }) {
  const rows = [];
  rows.push(row(1, [cell("A1", "Work-in-progress (WIP) schedule", S.title)]));
  rows.push(row(2, [cell("A2", "Company", S.bold), cell("B2", settings.company ?? "", S.input)]));
  rows.push(row(3, [cell("A3", "As of (period end)", S.bold), cell("B3", serial(settings.asOf), S.inputDate)]));
  rows.push(row(4, [cell("A4", "Shaded cells are yours: one row per open job, figures as of the same date. Billed to date is before retainage is taken off. Update each job's estimated total cost before you fill this in; every other column depends on it.", S.note)]));
  rows.push(row(5, [cell("A5", "Cost-to-cost method: % complete = cost to date / estimated total cost. A job expected to lose money shows its whole expected loss now, not as it is spent.", S.note)]));
  rows.push(row(7, HEADERS.map((h, i) => cell(`${COLS[i]}7`, h, S.head))));
  for (let i = 0; i < JOBS; i++) rows.push(jobRow(FIRST + i, jobs[i]));
  const sum = (c) => cell(`${c}${TOTAL}`, { f: `SUM(${c}${FIRST}:${c}${LAST})` }, S.totalMoney);
  rows.push(row(TOTAL, [
    cell(`A${TOTAL}`, "Totals", S.bold),
    ...[..."BCDEF"].map(sum),
    cell(`G${TOTAL}`, { f: `IF(N(C${TOTAL})<=0,"",N(D${TOTAL})/C${TOTAL})` }, S.totalPct),
    ...[..."HIJKLMN"].map(sum),
    cell(`O${TOTAL}`, { f: `IF(COUNTIF(O${FIRST}:O${LAST},"?*")>0,COUNTIF(O${FIRST}:O${LAST},"?*")&" job(s) to check","")` }, S.flag),
  ]));
  const line = (k, label, f, style = S.totalMoney) => rows.push(row(SUM0 + k, [cell(`A${SUM0 + k}`, label, S.bold), cell(`B${SUM0 + k}`, { f }, style)]));
  line(0, "Net over (+) or under (-) billed", `I${TOTAL}-J${TOTAL}`);
  line(1, "Gross profit recognised to date", `K${TOTAL}`);
  line(2, "Gross profit left in backlog", `F${TOTAL}-K${TOTAL}`);
  line(3, "Backlog gross margin, %", `IF(N(M${TOTAL})<=0,"",(F${TOTAL}-K${TOTAL})/M${TOTAL})`, S.totalPct);
  line(4, "Jobs expected to lose money", `COUNTIF(F${FIRST}:F${LAST},"<0")`, S.bold);
  rows.push(row(SUM0 + 6, [cell(`A${SUM0 + 6}`, "A losing job's gross profit to date is its whole expected loss; the provision column is the part of that loss its costs and earned revenue do not yet show, the figure an accountant books as a provision. Overbilled is a liability on the balance sheet and underbilled an asset; your accountant books the entry and may use another method (units, labour hours) or a tax method that ignores this. Arithmetic on your figures, not accounting, tax or bonding advice. Free template from https://marisstella.app/pay-app-guides/wip-schedule-template.html", S.note)]));
  const widths = [28, 15, 15, 14, 15, 14, 12, 14, 14, 14, 15, 14, 15, 14, 40];
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="7" topLeftCell="B8" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="WIP schedule" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'WIP schedule'!$7:$7</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

export function buildWip(data = {}) {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", WORKBOOK],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", wipSheet(data)],
  ]);
}

// The page's worked example: a small electrical subcontractor's four open jobs.
// Hand figures are on the page and pinned in wip-template.test.mjs.
export const EXAMPLE = {
  jobs: [
    { name: "Clinic fit-out", contract: "480000", est: "400000", cost: "240000", billed: "312000" },
    { name: "Warehouse lighting retrofit", contract: "150000", est: "120000", cost: "90000", billed: "97500" },
    { name: "School gym (bid low)", contract: "300000", est: "330000", cost: "165000", billed: "150000" },
    { name: "Retail shell", contract: "220000", est: "176000", cost: "22000", billed: "44000" },
  ],
  settings: { company: "Example Electric LLC", asOf: "2026-10-31" },
};

export const OUTPUTS = {
  "wip-schedule-template.xlsx": () => buildWip({}),
  "wip-schedule-example.xlsx": () => buildWip(EXAMPLE),
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [name, build] of Object.entries(OUTPUTS)) {
    const path = new URL(`./${name}`, import.meta.url), bytes = build();
    if (check) {
      let same = false;
      try { same = readFileSync(path).equals(bytes); } catch {}
      if (!same) { stale++; console.error(`${name} is stale: run node wip-template.mjs`); }
    } else { writeFileSync(path, bytes); console.log(`wrote ${name} (${bytes.length} bytes)`); }
  }
  process.exit(stale ? 1 : 0);
}
