// Construction daily report template: one report per job and day, as a subcontractor's foreman or PM
// fills it in on site, printed, emailed to the GC or saved as a CSV row for the job's log. Plus the
// "weekdays without a report" check over a list of report dates.
// The same rules as PayApps' own daily reports (ventures/payapps/apps/payapps/src/shared/
// daily-reports.ts): whole °F between -80 and 140, the low not above the high, hours lost and hours
// each in quarter hours from 0 to 24, crew lines with a trade and 1 to 999 workers, at most 40 lines;
// missing weekdays walk back from the "through" date to the first report, weekends and the holidays
// the user lists left out. Nothing is looked up: no weather service, no calendar of public holidays.
// Pure functions, no I/O. Dates are whole UTC days (colog.mjs parseDate). Every exported CSV cell goes
// through colog.mjs csvCell (the formula-injection guard).
import { parseCsv, parseDate, dayText, csvCell } from "./colog.mjs";

export const MAX_CREW_LINES = 40;
export const MAX_WORKERS_PER_LINE = 999;
export const MIN_TEMP_F = -80;
export const MAX_TEMP_F = 140;

// Printed under the report, as PayApps prints it.
export const NOTE =
  "A daily report records what the contractor saw and typed that day. It is not a notice of delay " +
  "or a claim: the subcontract says how and when those must be given, usually in writing to the GC.";

// The text sections, in the order they print. Keys are the form's field names.
export const SECTIONS = [
  ["work", "Work performed"],
  ["delays", "Delays and problems"],
  ["equipment", "Equipment on site"],
  ["deliveries", "Deliveries"],
  ["visitors", "Visitors and inspections"],
  ["safety", "Safety"],
  ["notes", "Notes"],
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Day number 0 (1970-01-01) was a Thursday.
export const weekday = (n) => (((n + 4) % 7) + 7) % 7;
export const isWeekend = (n) => weekday(n) === 0 || weekday(n) === 6;
export const dayLabel = (n) => `${DAY_NAMES[weekday(n)]} ${dayText(n)}`;

const round2 = (x) => Math.round(x * 100) / 100;
const isQuarter = (h) => Number.isFinite(h) && Math.abs(h * 4 - Math.round(h * 4)) < 1e-9;
export const hoursText = (h) => String(round2(h));

// A number as typed: "" is null (not stated), anything else must be a plain decimal.
function num(s) {
  const t = String(s ?? "").trim();
  if (t === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

// Crew lines, one per line: trade, workers, hours each, and optionally the company (blank or left off
// for your own crew). Commas or tabs; a header row starting "Trade" is skipped.
export function parseCrew(text) {
  const lines = [];
  const errors = [];
  const rows = parseCsv(String(text ?? "").replace(/\t/g, ",")).filter((r) => r.some((c) => String(c).trim() !== ""));
  rows.forEach((r, i) => {
    const cells = r.map((c) => String(c).trim());
    if (i === 0 && /^trade$/i.test(cells[0])) return;
    const n = `Crew line ${i + 1}`;
    const [trade = "", w = "", h = "", company = ""] = cells;
    if (!trade) { errors.push(`${n}: enter the trade.`); return; }
    const workers = num(w);
    if (!Number.isInteger(workers) || workers < 1 || workers > MAX_WORKERS_PER_LINE) { errors.push(`${n}: enter the number of workers (1 to ${MAX_WORKERS_PER_LINE}).`); return; }
    const hoursEach = num(h);
    if (hoursEach == null || !(hoursEach >= 0 && hoursEach <= 24) || !isQuarter(hoursEach)) { errors.push(`${n}: enter the hours each worked, 0 to 24 in quarter hours.`); return; }
    lines.push({ trade, workers, hoursEach, company, manHours: round2(workers * hoursEach) });
  });
  if (lines.length > MAX_CREW_LINES) errors.push(`A report holds up to ${MAX_CREW_LINES} crew lines.`);
  return { lines, errors };
}

export function crewTotals(lines) {
  let workers = 0, manHours = 0;
  for (const l of lines) { workers += l.workers; manHours += l.workers * l.hoursEach; }
  return { workers, manHours: round2(manHours) };
}

// The form's raw fields to a checked report. `latest` is the last date allowed (tomorrow, so a
// report can be written tonight in any US time zone); leave it out to allow any date.
export function buildReport(f = {}, { latest } = {}) {
  const errors = [];
  const date = parseDate(f.date ?? "");
  if (date == null) errors.push("Enter the report's date (YYYY-MM-DD or MM/DD/YYYY).");
  else if (latest != null && date > latest) errors.push("A daily report cannot be dated after today.");
  const temps = {};
  for (const [k, label] of [["high", "High temperature"], ["low", "Low temperature"]]) {
    const t = num(f[k]);
    if (t != null && (!Number.isInteger(t) || t < MIN_TEMP_F || t > MAX_TEMP_F)) errors.push(`${label}: enter whole degrees F between ${MIN_TEMP_F} and ${MAX_TEMP_F}.`);
    temps[k] = Number.isInteger(t) ? t : null;
  }
  if (temps.high != null && temps.low != null && temps.low > temps.high) errors.push("The low temperature is above the high.");
  const lost = num(f.lost);
  if (lost != null && !(lost >= 0 && lost <= 24 && isQuarter(lost))) errors.push("Hours lost: enter 0 to 24, in quarter hours.");
  const crew = parseCrew(f.crew);
  errors.push(...crew.errors);
  const text = (k) => String(f[k] ?? "").trim();
  const report = {
    date: date ?? null,
    project: text("project"), company: text("company"), gc: text("gc"), by: text("by"),
    weather: text("weather"), high: temps.high, low: temps.low,
    lost: lost != null && isQuarter(lost) ? lost : null,
    crew: crew.lines, totals: crewTotals(crew.lines),
  };
  for (const [k] of SECTIONS) report[k] = text(k);
  return { errors, report };
}

// "Clear, 61°/44°F", or whatever of it was typed; "" when nothing was.
export function weatherText(r) {
  const temps = r.high != null && r.low != null ? `${r.high}°/${r.low}°F` : r.high != null ? `high ${r.high}°F` : r.low != null ? `low ${r.low}°F` : "";
  return [r.weather, temps].filter(Boolean).join(", ");
}

const crewLineText = (l) => `${l.company ? `${l.company}, ` : ""}${l.trade}: ${l.workers} worker${l.workers === 1 ? "" : "s"} × ${hoursText(l.hoursEach)} h = ${hoursText(l.manHours)} man-hours`;

// The report as plain text: what prints and what the email carries. A blank report (no date) prints
// as the empty form, with lines to write on.
export function reportText(r) {
  const blank = "________________________________";
  const out = [];
  out.push(`DAILY REPORT${r.project ? `: ${r.project}` : ""}`);
  out.push(`Date: ${r.date != null ? dayLabel(r.date) : blank}`);
  out.push(`Contractor: ${r.company || blank}${r.gc ? `   GC: ${r.gc}` : ""}`);
  out.push(`Weather: ${weatherText(r) || blank}`);
  if (r.lost != null) out.push(`Hours lost to weather or delay: ${hoursText(r.lost)}`);
  out.push("");
  out.push("Crew on site");
  if (r.crew.length) {
    for (const l of r.crew) out.push(`  ${crewLineText(l)}`);
    out.push(`  Total: ${r.totals.workers} worker${r.totals.workers === 1 ? "" : "s"}, ${hoursText(r.totals.manHours)} man-hours`);
  } else if (r.date == null) {
    for (let i = 0; i < 4; i++) out.push("  Trade / company ____________  Workers ____  Hours each ____");
  } else out.push("  None entered.");
  for (const [k, label] of SECTIONS) {
    if (r[k]) { out.push("", label, ...r[k].split(/\r?\n/).map((s) => `  ${s}`)); }
    else if (r.date == null) out.push("", label, `  ${blank}${blank}`, `  ${blank}${blank}`);
  }
  out.push("", `Prepared by: ${r.by || blank}    Signature: ________________`);
  out.push("", NOTE);
  return out.join("\n");
}

const greeting = (name) => (String(name ?? "").trim() ? `Hi ${String(name).trim().split(/\s+/)[0]},` : "Hi,");

// The email to the GC: subject, the report, and one line on anything lost that day. It reports what
// happened; it does not give notice of a delay or claim anything.
export function reportEmail(r, { pm } = {}) {
  if (r.date == null) return "";
  const lines = [
    `Subject: ${r.project ? `${r.project}: ` : ""}daily report for ${dayLabel(r.date)}${r.company ? ` (${r.company})` : ""}`,
    "",
    greeting(pm),
    "",
    `Our daily report for ${dayLabel(r.date)} is below.${r.lost ? ` We lost ${hoursText(r.lost)} hour${r.lost === 1 ? "" : "s"} to weather or a delay; the details are under "Delays and problems".` : ""}`,
    "",
    reportText(r),
    "",
    "Thank you,",
    r.by || r.company || "",
  ];
  return lines.join("\n").trimEnd();
}

export const LOG_HEAD = ["Date", "Project", "Contractor", "Weather", "High F", "Low F", "Hours lost", "Workers", "Man-hours", "Crew", ...SECTIONS.map(([, l]) => l), "Prepared by"];

// One CSV row per report, the crew in one cell, so rows pasted under each other make the job's log.
export function logRow(r) {
  return [dayText(r.date), r.project, r.company, r.weather, r.high ?? "", r.low ?? "", r.lost ?? "", r.totals.workers, hoursText(r.totals.manHours), r.crew.map(crewLineText).join("; "), ...SECTIONS.map(([k]) => r[k]), r.by];
}

export const logCsv = (reports) => [LOG_HEAD, ...reports.map(logRow)].map((row) => row.map(csvCell).join(",")).join("\n");

// Dates from anything pasted: one per line or comma-separated, YYYY-MM-DD or MM/DD/YYYY; the first
// date-looking token on each line, so a pasted log column with text beside it still reads.
export function parseDates(text) {
  const days = [];
  const errors = [];
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const m = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/.exec(t);
    if (!m) { if (i > 0 || !/[a-z]/i.test(t)) errors.push(`Line ${i + 1}: no date found ("${t.slice(0, 40)}").`); return; }
    const d = parseDate(m[1]);
    if (d == null) { errors.push(`Line ${i + 1}: "${m[1]}" is not a real date.`); return; }
    days.push(d);
  });
  return { days, errors };
}

// Holidays, one per line: a date and optionally a name ("2026-11-26 Thanksgiving").
export function parseHolidays(text) {
  const map = new Map();
  const errors = [];
  String(text ?? "").replace(/\r\n?/g, "\n").split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const m = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})[\s,]*(.*)$/.exec(t);
    const d = m ? parseDate(m[1]) : null;
    if (d == null) { errors.push(`Holiday line ${i + 1}: start with a date ("2026-11-26 Thanksgiving").`); return; }
    map.set(d, m[2].trim() || "Holiday");
  });
  return { map, errors };
}

// Weekdays from the first report through `through` with no report, newest first (as PayApps' log
// lists them). Weekends are left out (a Saturday report still counts), and so are listed holidays.
export function missingWeekdays(days, through, holidays = new Map(), limit = 62) {
  if (!days.length || through == null) return { days: [], total: 0, holidays: [], first: null, reports: 0 };
  const have = new Set(days);
  const first = Math.min(...days);
  const out = [], skipped = [];
  let total = 0;
  for (let d = through, i = 0; d >= first && i < 3660; d--, i++) {
    if (isWeekend(d) || have.has(d)) continue;
    if (holidays.has(d)) { if (skipped.length < limit) skipped.push({ on: d, name: holidays.get(d) }); continue; }
    total++;
    if (out.length < limit) out.push(d);
  }
  return { days: out, total, holidays: skipped, first, reports: have.size };
}

export function gapsText(g) {
  if (!g.reports) return "Paste the dates of the reports you have.";
  const head = `${g.reports} report${g.reports === 1 ? "" : "s"} since ${dayText(g.first)}.`;
  if (!g.total) return `${head} No weekday is missing a report.`;
  return `${head} ${g.total} weekday${g.total === 1 ? " has" : "s have"} no report${g.total > g.days.length ? ` (the latest ${g.days.length} listed)` : ""}.`;
}

export const SAMPLE = {
  date: "2026-11-24", project: "Elm St Clinic", company: "Spark Electric", gc: "Hill Builders", by: "R. Diaz",
  weather: "Rain until 10 am, then cloudy", high: "52", low: "41", lost: "2",
  crew: ["Electrician, 4, 8", "Apprentice, 2, 8", "Low voltage, 2, 6, Example LV Co"].join("\n"),
  work: "Rough-in level 2, rooms 201-214: boxes, MC to panel LP-2.\nPulled feeders to MDP.",
  delays: "Rain until 10 am; no exterior trenching for site lighting (crew moved inside at 10).\nWaiting on RFI 7 (fixture type F3 mounting height).",
  equipment: "Scissor lift (1), wire cart",
  deliveries: "Lighting package, 14 boxes, delivery ticket 55120 (stored in room 108).",
  visitors: "City electrical inspector: level 1 rough-in passed.",
  safety: "Toolbox talk: ladder use. No incidents.",
  notes: "",
};

export const SAMPLE_DATES = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-23", "2026-11-24", "2026-11-25"].join("\n");
export const SAMPLE_HOLIDAYS = "2026-11-26 Thanksgiving\n2026-11-27 Day after Thanksgiving";
export const SAMPLE_THROUGH = "2026-11-27";
