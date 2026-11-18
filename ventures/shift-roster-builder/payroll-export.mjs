// Fill the payroll provider's own blank template from a week's timesheet (2026-11-17).
//
// Every payroll service (Gusto, ADP, Paychex, QuickBooks, OnPay, ...) imports hours from a CSV, and each wants its own
// columns. Rather than guess any provider's layout from memory, the manager uploads the blank template their provider
// gives them (or pastes its header row) once; the hub reads the column names, matches each one to a number it already
// has (regular, overtime and double-time hours from payrules.mjs, leave hours used, the regular rate, the gross
// estimate, names and payroll IDs), and each week fills the same columns in the same order. Columns it cannot match stay
// empty and are listed, and the manager can name the field for any column, or fix a value for it (ADP's company code
// and batch ID, for example) with a "Column = field" or `Column = "value"` line.
//
// No Node built-ins, so the Worker build can use it. Nothing here claims what a provider requires: the template does.

// The fields a column can be filled from, with the header spellings that mean them (compared after normalising case,
// punctuation and spaces). Order matters for the fallback "contains" match: more specific first.
export const FIELDS = {
  employee_id: { label: "Payroll ID", names: ["employee id", "employee number", "employee no", "emp id", "emp no", "emp number", "emp", "file", "file number", "file no", "id", "payroll id", "badge", "badge number", "worker id", "staff id", "employee code", "external id"] },
  first_name: { label: "First name", names: ["first name", "first", "given name", "employee first name", "fname"] },
  last_name: { label: "Last name", names: ["last name", "last", "surname", "family name", "employee last name", "lname"] },
  full_name: { label: "Full name", names: ["name", "employee", "employee name", "full name", "worker", "worker name", "staff", "staff name", "team member"] },
  regular_hours: { label: "Regular hours", names: ["regular hours", "reg hours", "regular", "reg", "reg hrs", "regular hrs", "hours regular", "regular time", "rt hours", "hours worked", "hours"] },
  overtime_hours: { label: "Overtime hours (1.5x)", names: ["overtime hours", "overtime", "ot hours", "ot", "o t hours", "o t", "ot hrs", "overtime hrs", "overtime 1 5x", "time and a half"] },
  double_hours: { label: "Double-time hours (2x)", names: ["double overtime hours", "double overtime", "double time hours", "double time", "doubletime", "dt hours", "dt", "dot hours", "dt hrs", "double ot"] },
  leave_hours: { label: "Leave hours used", names: ["sick hours", "sick", "sick time", "sick time hours", "sick leave", "sick leave hours", "pto", "pto hours", "paid time off", "paid time off hours", "paid sick leave", "paid leave", "leave hours", "leave"] },
  meal_premium_hours: { label: "Meal premium hours", names: ["meal premium", "meal premium hours", "meal penalty", "meal penalty hours", "missed meal", "missed meal hours", "meal break premium"] },
  total_hours: { label: "Total hours worked", names: ["total hours", "total", "total hrs", "hours total"] },
  regular_rate: { label: "Regular rate", names: ["rate", "pay rate", "hourly rate", "regular rate", "rate of pay", "wage rate"] },
  gross: { label: "Estimated gross", names: ["gross", "gross pay", "gross wages", "gross earnings", "estimated gross"] },
  period_start: { label: "Week start (YYYY-MM-DD)", names: ["period start", "pay period start", "period start date", "pay period start date", "start date", "week start", "week of"] },
  period_end: { label: "Week end (YYYY-MM-DD)", names: ["period end", "pay period end", "period end date", "pay period end date", "end date", "week end", "week ending"] },
  blank: { label: "Leave empty", names: [] },
};
const HOUR_FIELDS = new Set(["regular_hours", "overtime_hours", "double_hours", "leave_hours", "meal_premium_hours", "total_hours"]);

export const norm = (s) => String(s ?? "").toLowerCase().replace(/#/g, " number ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const GENERIC = new Set(["hours", "total", "rate", "id", "name", "first", "last", "employee", "file", "emp", "reg", "ot", "dt", "staff", "worker", "leave", "regular"]);
const NAME_INDEX = new Map();
for (const [k, f] of Object.entries(FIELDS)) for (const n of f.names) if (!NAME_INDEX.has(norm(n))) NAME_INDEX.set(norm(n), k);

// One CSV line into cells (quotes, doubled quotes, commas, tabs or semicolons as the template uses them).
export function splitCsvLine(line, sep = ",") {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// The header row of an uploaded template: the first non-empty line, with its separator (comma, tab or semicolon,
// whichever splits it into the most cells). A UTF-8 byte-order mark is dropped.
export function readTemplate(text) {
  const line = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).find((l) => l.trim() !== "");
  if (!line) return { error: "The template is empty: upload your payroll provider's blank CSV template or paste its first row." };
  let best = { sep: ",", cells: splitCsvLine(line, ",") };
  for (const sep of ["\t", ";"]) { const cells = splitCsvLine(line, sep); if (cells.length > best.cells.length) best = { sep, cells }; }
  const headers = best.cells;
  if (headers.length > 200) return { error: `The first row has ${headers.length} columns; a payroll template has far fewer. Paste only the header row.` };
  if (headers.every((h) => h === "")) return { error: "The first row has no column names." };
  return { headers, sep: best.sep };
}

// Manager overrides, one per line: `Column = field` (a key of FIELDS or its label) or `Column = "fixed value"`.
export function parseOverrides(text) {
  const map = new Map(), errors = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.lastIndexOf("=");
    if (i < 1) { errors.push(`"${line}": write Column = field or Column = "value".`); continue; }
    const col = line.slice(0, i).trim(), rhs = line.slice(i + 1).trim();
    const lit = rhs.match(/^"(.*)"$/);
    if (lit) { map.set(norm(col), { value: lit[1] }); continue; }
    const key = Object.keys(FIELDS).find((k) => k === rhs.toLowerCase().replace(/[\s-]+/g, "_") || norm(FIELDS[k].label) === norm(rhs));
    if (!key) { errors.push(`"${line}": "${rhs}" is not a field (${Object.keys(FIELDS).join(", ")}).`); continue; }
    map.set(norm(col), { field: key });
  }
  return { map, errors };
}

// Each header's source: an override first, then an exact spelling, then a word match (the first field whose spelling
// appears as whole words inside the header, most specific first). `how` says which, for the preview table.
export function matchColumns(headers, overrides = new Map()) {
  const order = ["double_hours", "overtime_hours", "meal_premium_hours", "leave_hours", "total_hours", "regular_hours", "regular_rate", "gross", "employee_id", "first_name", "last_name", "full_name", "period_start", "period_end"];
  return headers.map((h) => {
    const n = norm(h);
    if (overrides.has(n)) { const o = overrides.get(n); return o.value != null ? { header: h, value: o.value, how: "fixed value" } : { header: h, field: o.field, how: "you chose" }; }
    if (NAME_INDEX.has(n)) return { header: h, field: NAME_INDEX.get(n), how: "name" };
    // A guess never comes from a generic word alone ("Hours 3 Amount" is not regular hours), nor for a code column.
    const words = ` ${n} `;
    if (!/\b(code|type|description|memo|department|job)\b/.test(n))
      for (const k of order) for (const s of FIELDS[k].names) { const ns = norm(s); if (!GENERIC.has(ns) && ns.length >= 3 && words.includes(` ${ns} `)) return { header: h, field: k, how: "guess" }; }
    return { header: h, field: null, how: "no match" };
  });
}

// "Name = ID" (or "Name, ID" / "Name<TAB>ID") lines into a Map. The ID is kept as typed: leading zeros matter.
export function parseIds(text) {
  const ids = new Map();
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*(?:=|,|\t)\s*(.+)$/);
    if (m) ids.set(m[1].trim(), m[2].trim());
  }
  return ids;
}

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const splitName = (s) => { const t = String(s).trim().split(/\s+/); return t.length < 2 ? { first: t[0] || "", last: "" } : { first: t.slice(0, -1).join(" "), last: t[t.length - 1] }; };

// One row per person: pay rows from payrules.mjs `payForTimesheet` plus anyone with leave recorded inside the week.
export function payrollRows(pay, { weekStart, leaveUses = [], ids = new Map() } = {}) {
  const end = addDays(weekStart, 6);
  const leave = new Map();
  for (const u of leaveUses) if (u.date >= weekStart && u.date <= end) leave.set(u.person, (leave.get(u.person) || 0) + Number(u.hours || 0));
  const names = [...new Set([...pay.map((r) => r.name), ...leave.keys()])].sort((a, b) => a.localeCompare(b));
  return names.map((name) => {
    const r = pay.find((x) => x.name === name) || { regularH: 0, overtimeH: 0, doubleH: 0, mealPremiumDays: 0, regularRate: null, gross: null };
    const { first, last } = splitName(name);
    return {
      name, id: ids.has(name) ? ids.get(name) : "",
      values: {
        employee_id: ids.has(name) ? ids.get(name) : "", first_name: first, last_name: last, full_name: name,
        regular_hours: r.regularH, overtime_hours: r.overtimeH, double_hours: r.doubleH, leave_hours: leave.get(name) || 0,
        meal_premium_hours: r.mealPremiumDays || 0, total_hours: r.regularH + r.overtimeH + r.doubleH,
        regular_rate: r.regularRate, gross: r.gross, period_start: weekStart, period_end: end, blank: "",
      },
    };
  });
}

// CSV formula-injection guard and quoting (as timesheetCsv): a name typed "=HYPERLINK(..)" must not run in a spreadsheet.
const q = (v, sep) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cell = (field, v, zeros) => {
  if (v == null) return "";
  if (HOUR_FIELDS.has(field)) return v === 0 && zeros !== "zero" ? "" : Number(v).toFixed(2);
  if (field === "regular_rate" || field === "gross") return Number(v).toFixed(2);
  return String(v);
};

// The filled file: the template's own header row, then one row per person, in the template's separator.
// Returns { csv, columns, warnings }. `zeros`: "blank" (default) leaves zero hours empty, "zero" writes 0.00.
export function fillTemplate(template, rows, { overrides = new Map(), zeros = "blank" } = {}) {
  const t = typeof template === "string" ? readTemplate(template) : template;
  if (t.error) return { error: t.error };
  const columns = matchColumns(t.headers, overrides);
  const warnings = [];
  const unmatched = columns.filter((c) => c.field == null && c.value == null && c.header !== "");
  if (unmatched.length) warnings.push(`Left empty (no match): ${unmatched.map((c) => c.header).join(", ")}. Name a field for any of these below if it should be filled.`);
  const used = new Set(columns.map((c) => c.field).filter(Boolean));
  if (!["regular_hours", "total_hours"].some((f) => used.has(f))) warnings.push("No column was matched to regular or total hours: check the template is the hours import, not the employee import.");
  if (used.has("employee_id")) { const miss = rows.filter((r) => !r.id).map((r) => r.name); if (miss.length) warnings.push(`No payroll ID for ${miss.join(", ")}: add "Name = ID" lines, or the import may not find them.`); }
  if (!["employee_id", "full_name", "first_name", "last_name"].some((f) => used.has(f))) warnings.push("No column names the employee (ID or name): the provider cannot tell the rows apart.");
  if (rows.some((r) => r.values.overtime_hours > 0) && !used.has("overtime_hours")) warnings.push("Someone has overtime hours but no column was matched to overtime: they would be missing from the file.");
  if (rows.some((r) => r.values.double_hours > 0) && !used.has("double_hours")) warnings.push("Someone has double-time hours but no column was matched to double time.");
  if (rows.some((r) => r.values.leave_hours > 0) && !used.has("leave_hours")) warnings.push("Leave was recorded this week but no column was matched to sick or PTO hours.");
  const sep = t.sep;
  const lines = [t.headers.map((h) => q(h, sep)).join(sep)];
  for (const r of rows) lines.push(columns.map((c) => q(c.value != null ? c.value : c.field ? cell(c.field, r.values[c.field], zeros) : "", sep)).join(sep));
  return { csv: lines.join("\r\n") + "\r\n", columns, warnings, sep };
}
