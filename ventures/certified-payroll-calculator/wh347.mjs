// Weekly certified payroll report in the column layout of DOL form WH-347 (payroll sheet, front page): daily hours, total hours, rate, gross earned on
// this project, deductions and net pay, plus a per-worker prevailing-wage check. Pure functions, no network, no storage.
//
// Overtime follows calc.mjs: on a covered contract the time-and-a-half premium goes on base pay plus any cash fringe, never on a contribution to a bona
// fide plan. Hours over 40 in the workweek are overtime (CWHSSA, 29 CFR 5.32). Hours the worker put in elsewhere that week are entered as `otherHours`
// and are assumed to have come first, so overtime lands on this project's hours last. Change that and the split changes: check it against your own
// timekeeping. This is the arithmetic that fills the form, not the signed form or the Statement of Compliance on its back page.

import { calculateCertifiedPayroll } from "./calc.mjs";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;

function nonNeg(v, label) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a plain number that is not negative.`);
  return n;
}

export function buildWorker(w, index = 0) {
  const who = w.name && String(w.name).trim() ? String(w.name).trim() : `Worker ${index + 1}`;
  const label = (s) => `${who}: ${s}`;
  const flags = [];
  const id = String(w.idLast4 ?? "").trim();
  // WH-347 asks for the last four digits only. A longer entry is refused rather than echoed into a printout or a share link.
  if (id.length > 4) throw new Error(label("enter only the last four digits of the ID or SSN, never the whole number."));
  if (id && !/^\d{1,4}$/.test(id)) throw new Error(label("the ID field takes digits only, up to four."));
  if (id.length !== 4) flags.push("ID: the form wants the last four digits.");

  const days = DAYS.map((d, i) => nonNeg(Array.isArray(w.days) ? w.days[i] : w[d], label(`${d} hours`)));
  for (let i = 0; i < 7; i++) if (days[i] > 24) throw new Error(label(`${DAYS[i]} hours cannot be more than 24.`));
  const projectHours = days.reduce((a, b) => a + b, 0);
  const otherHours = nonNeg(w.otherHours, label("hours on other jobs"));
  const weekHours = projectHours + otherHours;
  const otAll = Math.max(0, weekHours - 40);
  const otHours = Math.min(projectHours, otAll);
  const straightHours = projectHours - otHours;

  const input = {
    requiredBaseRate: nonNeg(w.requiredBase, label("required base rate")),
    requiredFringeRate: nonNeg(w.requiredFringe, label("required fringe rate")),
    actualBaseRate: nonNeg(w.actualBase, label("base rate paid")),
    bonaFideFringePerHour: nonNeg(w.planFringe, label("fringe paid to a plan")),
    cashFringePerHour: nonNeg(w.cashFringe, label("fringe paid in cash")),
    straightHours,
    overtimeHours: otHours,
  };
  const c = calculateCertifiedPayroll(input);

  const fica = nonNeg(w.fica, label("FICA"));
  const withholding = nonNeg(w.withholding, label("withholding"));
  const otherDed = nonNeg(w.otherDeductions, label("other deductions"));
  const deductions = fica + withholding + otherDed;
  const gross = c.totalCashWagesPaid;
  const net = gross - deductions;

  if (!String(w.classification ?? "").trim()) flags.push("Classification is blank: the form needs the work classification from the wage determination.");
  if (projectHours === 0) flags.push("No hours on this project this week.");
  if (c.underpaymentTotal > 0.005) flags.push(`Underpaid against the wage determination by $${round2(c.underpaymentTotal).toFixed(2)} for the week.`);
  if (c.otUnderpaymentIfCashFringeExcluded > 0.005) flags.push(`Cash fringe counted in the overtime rate: $${round2(c.otUnderpaymentIfCashFringeExcluded).toFixed(2)} more than a system that pays overtime on base only.`);
  if (net < -0.005) flags.push("Deductions are more than gross pay.");
  if (input.bonaFideFringePerHour + input.cashFringePerHour < input.requiredFringeRate - 1e-9) flags.push("Fringe paid is below the required fringe rate; base pay must make up the difference, which the underpayment check above already tests.");

  return {
    name: who, idLast4: id, classification: String(w.classification ?? "").trim(), days, projectHours: round2(projectHours), otherHours: round2(otherHours),
    straightHours: round2(straightHours), overtimeHours: round2(otHours),
    ratePaid: round2(c.straightRatePerHour + input.bonaFideFringePerHour), otRate: round2(c.otRatePerHour),
    gross: round2(gross), planFringeDue: round2(c.totalBonaFideFringeDue),
    fica: round2(fica), withholding: round2(withholding), otherDeductions: round2(otherDed), deductions: round2(deductions), net: round2(net),
    requiredGross: round2(c.requiredGrossAtPrevailingWage), underpayment: round2(c.underpaymentTotal), compliant: c.compliant, flags,
  };
}

export function buildReport(input) {
  const h = input.header ?? {};
  const header = {
    contractor: String(h.contractor ?? "").trim(), project: String(h.project ?? "").trim(), contractNo: String(h.contractNo ?? "").trim(),
    payrollNo: String(h.payrollNo ?? "").trim(), weekEnding: String(h.weekEnding ?? "").trim(),
  };
  if (header.weekEnding && !/^\d{4}-\d{2}-\d{2}$/.test(header.weekEnding)) throw new Error("Week ending must be a date.");
  const list = Array.isArray(input.workers) ? input.workers : [];
  if (list.length === 0) throw new Error("Add at least one worker.");
  if (list.length > 60) throw new Error("This sheet takes up to 60 workers.");
  const workers = list.map((w, i) => buildWorker(w, i));
  const sum = (k) => round2(workers.reduce((a, w) => a + w[k], 0));
  const totals = {
    projectHours: round1(workers.reduce((a, w) => a + w.projectHours, 0)), overtimeHours: round1(workers.reduce((a, w) => a + w.overtimeHours, 0)),
    gross: sum("gross"), deductions: sum("deductions"), net: sum("net"), underpayment: sum("underpayment"),
  };
  const missing = [];
  if (!header.contractor) missing.push("contractor name");
  if (!header.project) missing.push("project and location");
  if (!header.weekEnding) missing.push("week ending date");
  if (!header.payrollNo) missing.push("payroll number");
  const flagged = workers.filter((w) => w.flags.length > 0).length;
  const advice = [];
  advice.push(`${workers.length} worker${workers.length === 1 ? "" : "s"}, ${totals.projectHours} hours on this project, $${totals.gross.toFixed(2)} gross, $${totals.net.toFixed(2)} net.`);
  if (totals.underpayment > 0.005) advice.push(`Underpayment against the wage determination totals $${totals.underpayment.toFixed(2)}. Pay it before you submit, and note it on the payroll.`);
  else advice.push("No underpayment against the rates you entered.");
  if (flagged) advice.push(`${flagged} worker row${flagged === 1 ? "" : "s"} carry a flag. Fix or understand each before you sign.`);
  if (missing.length) advice.push(`The form header still needs: ${missing.join(", ")}.`);
  return { header, workers, totals, advice, ready: totals.underpayment <= 0.005 && missing.length === 0 && flagged === 0 };
}

const csvCell = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

export function toCsv(report) {
  const head = ["name", "id_last4", "classification", ...DAYS.map((d) => d.toLowerCase()), "project_hours", "overtime_hours", "rate_paid", "gross", "fica", "withholding", "other_deductions", "total_deductions", "net", "underpayment", "flags"];
  const rows = report.workers.map((w) => [w.name, w.idLast4, w.classification, ...w.days, w.projectHours, w.overtimeHours, w.ratePaid, w.gross, w.fica, w.withholding, w.otherDeductions, w.deductions, w.net, w.underpayment, w.flags.join(" | ")]);
  const t = report.totals;
  rows.push(["TOTAL", "", "", "", "", "", "", "", "", "", t.projectHours, t.overtimeHours, "", t.gross, "", "", "", t.deductions, t.net, t.underpayment, ""]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

// Pasted from a spreadsheet: one worker per line, tab or comma separated.
// name, last4, classification, Mon..Sun hours (7), otherHours, requiredBase, requiredFringe, actualBase, planFringe, cashFringe, fica, withholding, otherDeductions
export const PASTE_COLUMNS = ["name", "idLast4", "classification", ...DAYS, "otherHours", "requiredBase", "requiredFringe", "actualBase", "planFringe", "cashFringe", "fica", "withholding", "otherDeductions"];

export function parsePaste(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.includes("\t") ? line.split("\t") : line.split(",");
    const w = {};
    PASTE_COLUMNS.forEach((k, i) => { w[k] = (cells[i] ?? "").trim(); });
    if (/^name$/i.test(w.name)) continue;
    w.days = DAYS.map((d) => w[d]);
    out.push(w);
  }
  return out;
}

export function sampleReport() {
  return {
    header: { contractor: "Example Electric LLC (made up)", project: "Municipal Library Wiring, Springfield", contractNo: "DB-0000 (example)", payrollNo: "7", weekEnding: "2026-10-04" },
    workers: [
      { name: "A. Journeyman", idLast4: "1234", classification: "Electrician", days: [10, 10, 10, 10, 6, 0, 0], otherHours: 0, requiredBase: 38.5, requiredFringe: 14.2, actualBase: 38.5, planFringe: 9.2, cashFringe: 5, fica: 215.4, withholding: 330, otherDeductions: 0 },
      { name: "B. Apprentice", idLast4: "5678", classification: "Electrician apprentice (60%)", days: [8, 8, 8, 8, 8, 0, 0], otherHours: 0, requiredBase: 23.1, requiredFringe: 14.2, actualBase: 23.1, planFringe: 14.2, cashFringe: 0, fica: 106.4, withholding: 120, otherDeductions: 25 },
      { name: "C. Laborer", idLast4: "9012", classification: "Laborer", days: [8, 8, 8, 0, 0, 0, 0], otherHours: 20, requiredBase: 27, requiredFringe: 11, actualBase: 26, planFringe: 11, cashFringe: 0, fica: 70, withholding: 60, otherDeductions: 0 },
    ],
  };
}
