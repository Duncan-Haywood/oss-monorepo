// Switching from a paid scheduler: turn a published-schedule CSV export (one row per scheduled shift:
// date, start, end, position, optionally employee) into this tool's shift-requirement lines.
// Rows are counted per weekday, start, end and position; with several weeks in the file the busiest
// week's count is used (so a holiday week does not shrink the need, and a one-off does not widen it
// past what was ever scheduled). Column names are matched by synonym and were written from memory,
// not from real exports: unknown columns are listed and unreadable rows are skipped with a reason.
// Nothing leaves the browser.
import { splitCsvRow } from "./import-staff.mjs";
import { parseTime, DAYS, dayIndex } from "./calc.mjs";

const SYN = {
  date: ["date", "shift date", "day", "start date", "scheduled date", "work date"],
  start: ["start", "start time", "shift start", "begin", "from", "starts", "clock in", "scheduled start"],
  end: ["end", "end time", "shift end", "finish", "to", "ends", "clock out", "scheduled end"],
  role: ["position", "role", "job", "job title", "department", "station", "location position"],
  who: ["employee", "name", "employee name", "team member", "staff", "assigned to", "user"],
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s) => String(s || "").replace(/[,;\t]/g, " ").replace(/\s+/g, " ").trim();

// Returns {y,m,d} or null. ISO, then d/m/y or m/d/y (a first part above 12 means day first; otherwise US order).
function parseDate(tok) {
  const s = String(tok || "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})/.exec(s))) {
    y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (+m[1] > 12) { d = +m[1]; mo = +m[2]; } else { mo = +m[1]; d = +m[2]; }
  } else return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { t, day: (t.getUTCDay() + 6) % 7, week: Math.floor((t.getTime() / 86400000 + 3) / 7) };
}

// "2026-11-02 07:00", "2026-11-02T07:00:00", "7:00 AM" -> {date tok (maybe ""), time tok}
function splitStamp(tok) {
  const s = String(tok || "").trim();
  const m = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})[T\s]+(\d{1,2}(?::\d{2})?(?::\d{2})?\s*[ap]?m?)/i.exec(s);
  const rawT = m ? m[2] : s;
  return { date: m ? m[1] : "", time: rawT.replace(/^(\d{1,2}:\d{2}):\d{2}/, "$1").trim() };
}

export function importShiftsCsv(text) {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const notes = [], skipped = [];
  const fail = (msg, unknown = []) => ({ shiftsText: "", rows: 0, shifts: 0, notes: [msg], skipped, unknown });
  if (lines.length < 2) return fail("Needs a header row and at least one scheduled shift.");
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const head = splitCsvRow(lines[0], sep).map(norm);
  const find = (key) => head.findIndex((h) => SYN[key].includes(h));
  const ix = Object.fromEntries(Object.keys(SYN).map((k) => [k, find(k)]));
  if (ix.start < 0 || ix.end < 0) return fail("No start and end time columns found (looked for Start, Start time, End, End time).", head);
  const used = new Set(Object.values(ix).filter((i) => i >= 0));
  const unknown = head.filter((h, i) => h && !used.has(i));
  const counts = new Map(); // key -> Map(week -> n)
  let rows = 0;
  lines.slice(1).forEach((line, n) => {
    const c = splitCsvRow(line, sep), at = (i) => (i >= 0 ? c[i] || "" : "");
    const where = `Row ${n + 2}`;
    const a = splitStamp(at(ix.start)), b = splitStamp(at(ix.end));
    const dateTok = at(ix.date) || a.date;
    const dt = parseDate(dateTok);
    let day, week = 0;
    if (dt) { day = dt.day; week = dt.week; }
    else if (dayIndex(dateTok) >= 0) day = dayIndex(dateTok);
    else return skipped.push(`${where}: could not read the date "${dateTok}"`);
    const s = parseTime(a.time), e = parseTime(b.time);
    if (Number.isNaN(s) || Number.isNaN(e)) return skipped.push(`${where}: could not read the times "${at(ix.start)}" and "${at(ix.end)}"`);
    if (s === e) return skipped.push(`${where}: start and end are the same`);
    const role = clean(at(ix.role)).toLowerCase();
    const key = [day, s, e, role].join("|");
    const byWeek = counts.get(key) || new Map();
    byWeek.set(week, (byWeek.get(week) || 0) + 1);
    counts.set(key, byWeek);
    rows++;
  });
  if (!rows) return { shiftsText: "", rows: 0, shifts: 0, notes: ["No readable shifts in the file."], skipped, unknown };
  const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const weeks = new Set();
  for (const w of counts.values()) for (const k of w.keys()) weeks.add(k);
  const out = ["day, start, end, people needed, label, role"];
  const items = [...counts].map(([k, w]) => {
    const [day, s, e, role] = k.split("|");
    return { day: +day, s: +s, e: +e, role, n: Math.max(...w.values()) };
  }).sort((p, q) => p.day - q.day || p.s - q.s || p.e - q.e || p.role.localeCompare(q.role));
  for (const it of items) out.push([DAYS[it.day], clock(it.s), clock(it.e), it.n, "", it.role].join(", ").replace(/, $/, ""));
  if (weeks.size > 1) notes.push(`The file covers ${weeks.size} weeks: each shift's people-needed is the most scheduled in any one week.`);
  if (ix.who >= 0) notes.push("Employee names were not used: this tool assigns people itself.");
  if (unknown.length) notes.push(`Columns not used: ${unknown.join(", ")}.`);
  notes.push("Check the people-needed counts: a published schedule shows who was scheduled, not who was needed.");
  return { shiftsText: out.join("\n"), rows, shifts: items.length, notes, skipped, unknown };
}
