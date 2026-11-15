// Reads a folder of Gusto-style "Payroll Journal Report" CSVs (title, company
// block, "Pay day" line above the table, one row per employee, a "Payroll
// Totals" row) and checks every run the reader books against the file's own
// totals row, column by column. The totals row is skipped by the reader, so it
// is an independent check. Then books every run into one set of books and
// prints the quarter's Form 941 worksheet figures and the year's W-2 totals.
//
//   node ventures/ai-bookkeeper/eval/payroll-journal-report.mjs DIR [--json]
//
// The files are not in this repository (no licence on the source); the README
// ("A Gusto-style payroll journal with the pay day above the table") says
// where the set measured on 2026-11-15 came from.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, parseCents } from "../bank.mjs";
import { readPayrollRegister, addPayroll, form941, w2Summary } from "../payroll.mjs";
import { newBooks } from "../engine.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: payroll-journal-report.mjs DIR [--json]"); process.exit(2); }
const files = readdirSync(dir).filter((f) => f.endsWith(".csv")).sort();

// Report column -> run field, for the comparison only.
const CHECK = {
  "Gross Earnings": "gross", "Net Pay": "net", "Federal Income Tax (Employee)": "fed",
  "Social Security (Employee)": "ss", "Social Security (Employer)": "erSs", "FUTA (Employer)": "futa",
};
const out = { files: files.length, runs: 0, rows: 0, problems: [], mismatches: [], notes: new Set() };
let books = newBooks();
for (const f of files) {
  const text = readFileSync(join(dir, f), "utf8");
  const table = parseCsv(text);
  const header = table.find((r) => r[0] === "Last Name");
  const totals = table.find((r) => r[0] === "Payroll Totals");
  const T = (name) => { const j = header.indexOf(name); return j < 0 ? 0 : parseCents(totals[j] || "0"); };
  let read;
  try { read = readPayrollRegister(text); } catch (e) { out.problems.push(`${f}: ${e.message}`); continue; }
  read.problems.forEach((p) => out.problems.push(`${f}: ${p}`));
  read.notes.forEach((n) => out.notes.add(n.replace(/\(\d{4}-\d\d-\d\d\)/, "(date)")));
  for (const run of read.runs) {
    out.runs += 1; out.rows += run.employees;
    const want = {
      ...Object.fromEntries(Object.entries(CHECK).map(([col, k]) => [k, T(col)])),
      med: T("Medicare (Employee)") + T("Additional Medicare (Employee)"),
      erMed: T("Medicare (Employer)"),
      state: T("NC State Tax (Employee)"), suta: T("NC Unemployment Tax (Employer)"),
      employerTaxes: T("Employer Taxes"),
    };
    const got = { ...run, employerTaxes: run.erSs + run.erMed + run.futa + run.suta + run.erOther };
    for (const [k, v] of Object.entries(want)) if (got[k] !== v) out.mismatches.push(`${f} ${run.date} ${k}: read ${got[k]} vs totals row ${v}`);
  }
  books = addPayroll(books, text).books;
}
const years = [...new Set((books?.payroll ?? []).map((r) => r.date.slice(0, 4)))];
const quarters = [];
for (const y of years) for (const q of [1, 2, 3, 4]) {
  const w = form941(books, +y, q);
  if (w.runs) quarters.push({ year: y, quarter: q, runs: w.runs, wages: w.wages, federalWithheld: w.federalWithheld, socialSecurityTax: w.socialSecurityTax, medicareTax: w.medicareTax, totalTaxes: w.totalTaxes, warnings: w.warnings });
}
const w2 = years.map((y) => { const s = w2Summary(books, +y); return { year: y, employees: s.employees.map((e) => ({ employee: e.employee, box1: e.box1, box2: e.box2, box4: e.box4, box6: e.box6 })), warnings: s.warnings }; });
const result = { ...out, notes: [...out.notes], quarters, w2 };
if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`${result.files} files, ${result.runs} runs, ${result.rows} employee rows read`);
  console.log(`problems: ${result.problems.length}`); result.problems.slice(0, 10).forEach((p) => console.log("  " + p));
  console.log(`mismatches against the totals rows: ${result.mismatches.length}`); result.mismatches.slice(0, 10).forEach((p) => console.log("  " + p));
  console.log("notes:"); result.notes.forEach((n) => console.log("  " + n));
  console.log("Form 941 quarters:", JSON.stringify(quarters));
  console.log("W-2:", JSON.stringify(w2));
}
