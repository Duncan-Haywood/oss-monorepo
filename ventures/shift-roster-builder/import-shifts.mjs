// Switching from a paid scheduler: turn a published-schedule CSV export (one row per scheduled shift:
// date, start, end, position, optionally employee) into this tool's shift-requirement lines.
// Rows are counted per weekday, start, end and position; with several weeks in the file the busiest
// week's count is used (so a holiday week does not shrink the need, and a one-off does not widen it
// past what was ever scheduled). Column names are matched by synonym. Until 2026-11-13 they were written
// from memory; since then they are also checked on two real exports (eval/real-schedule-exports.mjs): a Deputy
// timesheet export that carries the rostered shift beside the worked one ("Schedule Start Time" beside
// "Timesheet Start Time", the position in "Area Name", leave rows mixed in, dates day first), and a retail
// workforce-management export with the first-published and the final shift side by side ("Initial Shift ..." and
// "Final Shift ..."). Such files name one shift several ways, so headers are read in families by their first word
// (schedule, final, initial, timesheet ...) and one family is used for every row. Unknown columns are listed and
// unreadable rows are skipped with a reason. Nothing leaves the browser.
import { splitCsvRow, csvLines } from "./import-staff.mjs";
import { parseTime, DAYS, dayIndex } from "./calc.mjs";

const SYN = {
  date: ["date", "shift date", "day", "start date", "scheduled date", "work date", "shift day", "scheduled day"],
  start: ["start", "start time", "shift start", "begin", "from", "starts", "clock in", "scheduled start", "shift start time", "time in", "scheduled in", "in", "start datetime", "start date time", "starts at", "clock in time", "scheduled start time"],
  end: ["end", "end time", "shift end", "finish", "to", "ends", "clock out", "scheduled end", "shift end time", "time out", "scheduled out", "out", "end datetime", "end date time", "ends at", "clock out time", "scheduled end time"],
  range: ["shift", "shift time", "shift times", "hours", "time", "times", "scheduled time"],
  role: ["position", "role", "job", "job title", "department", "station", "location position", "position name", "role name", "job name", "area", "area name", "work role", "worker role", "shift work role", "shift worker role", "shift role", "shift position", "operational unit"],
  who: ["employee", "name", "employee name", "team member", "staff", "assigned to", "user", "display name"],
  where: ["location", "location name", "site", "site name", "store", "store name", "branch", "venue", "location code"],
};
// A header's first word can say which version of the shift it describes. Order is preference: the rostered shift
// (what the manager planned) first, the final published one next, plain headers, the first draft, and the worked
// time last (a timesheet records who turned up, not who was needed).
const FAMILIES = [
  ["schedule", ["schedule", "scheduled", "roster", "rostered", "planned"]],
  ["final", ["final", "published", "current"]],
  ["", []],
  ["initial", ["initial", "original", "first"]],
  ["timesheet", ["timesheet", "actual", "worked", "punch", "clocked"]],
];
const SKIP_IF_TRUE = { leave: ["is leave", "leave", "on leave"], discarded: ["discarded", "deleted", "is deleted", "cancelled", "canceled", "is cancelled", "is canceled", "void"] };
const TRUE = /^(true|yes|y|1)$/i;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s) => String(s || "").replace(/[,;\t]/g, " ").replace(/\s+/g, " ").trim();

// Returns {y,m,d} or null. ISO (2026-11-02 or 2026/11/02), then d/m/y or m/d/y: `order` "dmy" or "mdy" is the
// file's own order when its other rows settle it; otherwise a first part above 12 means day first, else US order.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthOf = (w) => MONTHS.indexOf(String(w).slice(0, 3).toLowerCase());
function parseDate(tok, order = "") {
  // A leading weekday ("Mon, 11/2/2026", "Monday Nov 2 2026") is dropped; the date itself decides the day.
  let s = String(tok || "").trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(?=\d|[a-z]{3})/i, "");
  let m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})/.exec(s))) {
    y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const dayFirst = order ? order === "dmy" : +m[1] > 12;
    if (dayFirst) { d = +m[1]; mo = +m[2]; } else { mo = +m[1]; d = +m[2]; }
  } else if ((m = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(s)) && monthOf(m[1]) >= 0) {
    y = +m[3]; mo = monthOf(m[1]) + 1; d = +m[2]; // Nov 2, 2026
  } else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})/i.exec(s)) && monthOf(m[2]) >= 0) {
    y = +m[3]; mo = monthOf(m[2]) + 1; d = +m[1]; // 2 Nov 2026
  } else return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { t, day: (t.getUTCDay() + 6) % 7, week: Math.floor((t.getTime() / 86400000 + 3) / 7) };
}

// Which order a file writes its numeric dates in, from every date in it: "dmy" when some first part is above 12
// (13/05/2026), "mdy" when some second part is, "" when no row settles it (or rows disagree).
export function dateOrder(tokens) {
  let dmy = false, mdy = false;
  for (const t of tokens) {
    const m = /^(?:[a-z]+\.?,?\s+)?(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{2,4}/i.exec(String(t || "").trim());
    if (!m) continue;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  return dmy && !mdy ? "dmy" : mdy && !dmy ? "mdy" : "";
}

// "2026-11-02 07:00", "2026-11-02T07:00:00", "7:00 AM" -> {date tok (maybe ""), time tok}
function splitStamp(tok) {
  const s = String(tok || "").trim();
  const m = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})[T\s]+(\d{1,2}(?::\d{2})?(?::\d{2})?\s*[ap]?m?)/i.exec(s);
  const rawT = m ? m[2] : s;
  return { date: m ? m[1] : "", time: rawT.replace(/^(\d{1,2}:\d{2}):\d{2}/, "$1").trim() };
}

// Header -> [{key, fam}] candidates: the whole header first, then with a family word (and a following "shift")
// taken off: "Initial Shift Start Time" -> start (initial), "Schedule Date" -> date (schedule).
function readHeader(h) {
  const keys = (x) => Object.keys(SYN).filter((k) => SYN[k].includes(x));
  const whole = keys(h);
  if (whole.length) {
    // "scheduled start" names the rostered shift even without a family word of its own.
    const fam = /^(scheduled?|rostered?|planned) /.test(h) ? "schedule" : "";
    return whole.map((key) => ({ key, fam }));
  }
  const [first, ...rest] = h.split(" ");
  for (const [fam, words] of FAMILIES) {
    if (!words.includes(first) || !rest.length) continue;
    const tail = rest.join(" ");
    const got = keys(tail);
    if (got.length) return got.map((key) => ({ key, fam }));
  }
  return [];
}

// opts.location: keep only rows at that location (matched without case or punctuation) when the file has several.
// opts.use: a family to read ("schedule", "final", "initial", "timesheet", or "plain" for unprefixed headers)
// instead of the preferred one. The result lists `locations` ([{name, rows}]) and `families` (those with start
// and end columns) so a page or CLI can offer the choice.
export function importShiftsCsv(text, opts = {}) {
  const lines = csvLines(text).filter((l) => l.trim());
  const notes = [], skipped = [];
  const fail = (msg, unknown = []) => ({ shiftsText: "", rows: 0, shifts: 0, notes: [msg], skipped, unknown, locations: [], families: [] });
  if (lines.length < 2) return fail("Needs a header row and at least one scheduled shift.");
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const head = splitCsvRow(lines[0], sep).map(norm);
  const data = lines.slice(1).map((l) => splitCsvRow(l, sep));
  const filled = (i) => data.reduce((n, c) => n + (String(c[i] || "").trim() ? 1 : 0), 0);
  // cols[key][fam] = column indexes, in header order
  const cols = {};
  head.forEach((h, i) => { for (const { key, fam } of readHeader(h)) ((cols[key] ||= {})[fam] ||= []).push(i); });
  // The column for a key in a family: the most filled one (a Deputy file has both "Position", nearly empty, and
  // "Area Name"); ties go to the synonym listed first, then to header order.
  const pick = (key, fam) => {
    const c = cols[key]?.[fam];
    if (!c?.length) return -1;
    const rank = (i) => SYN[key].indexOf(head[i]);
    return [...c].sort((a, b) => filled(b) - filled(a) || rank(a) - rank(b) || a - b)[0];
  };
  const hasTimes = (fam) => (pick("start", fam) >= 0 && pick("end", fam) >= 0) || pick("range", fam) >= 0;
  const families = FAMILIES.map(([f]) => f).filter(hasTimes);
  if (!families.length) return fail("No start and end time columns found (looked for Start, Start time, End, End time, and the same after Schedule, Final, Initial or Timesheet).", head);
  const want = opts.use === "plain" ? "" : opts.use;
  let fam = families[0];
  if (want !== undefined && want !== null) {
    if (!families.includes(want)) return fail(`No ${want || "plain"} start and end columns in this file; it has: ${families.map((f) => f || "plain").join(", ")}.`, head);
    fam = want;
  }
  // Role, location and employee may sit in the family ("Final Shift Worker Role") or be plain ("Area Name").
  const own = (key) => (pick(key, fam) >= 0 ? pick(key, fam) : pick(key, ""));
  const ix = {
    start: pick("start", fam), end: pick("end", fam), range: pick("range", fam),
    // A date belongs to its family: a plain "Start Date" beside "Schedule Date" is an employee's hire date.
    date: pick("date", fam) >= 0 ? pick("date", fam) : pick("date", ""),
    role: own("role"), who: own("who"), where: own("where"),
  };
  const flagCols = Object.fromEntries(Object.entries(SKIP_IF_TRUE).map(([k, names]) => [k, head.findIndex((h) => names.includes(h))]));
  const used = new Set([...Object.values(ix), ...Object.values(flagCols)].filter((i) => i >= 0));
  // Columns of the families not read are known, not unknown: list them apart.
  const otherFam = new Set();
  for (const byFam of Object.values(cols)) for (const [f, c] of Object.entries(byFam)) if (f !== fam) for (const i of c) if (!used.has(i)) otherFam.add(i);
  const unknown = head.filter((h, i) => h && !used.has(i) && !otherFam.has(i));
  const famName = (f) => (f ? f[0].toUpperCase() + f.slice(1) : "plain");
  if (families.length > 1) notes.push(`This file has ${families.map(famName).join(", ")} shift columns; read ${famName(fam)}${fam === families[0] ? " (order of preference: rostered, final, plain, first draft, worked); pick another to compare" : ""}.`);

  const at = (c, i) => (i >= 0 ? c[i] || "" : "");
  // Locations, before any filter, so the caller can offer them.
  const locCount = new Map();
  if (ix.where >= 0) for (const c of data) { const v = clean(at(c, ix.where)); if (v) locCount.set(v, (locCount.get(v) || 0) + 1); }
  const locations = [...locCount].map(([name, rows]) => ({ name, rows })).sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
  const wantLoc = opts.location ? norm(opts.location) : "";
  if (wantLoc && !locations.some((l) => norm(l.name) === wantLoc)) return { ...fail(`No rows at location "${opts.location}". Locations in the file: ${locations.map((l) => l.name).join("; ") || "none"}.`, unknown), locations, families };

  const timeToks = (c) => {
    let startTok = at(c, ix.start), endTok = at(c, ix.end);
    if (ix.start < 0 || ix.end < 0) { // one column such as "7:00 AM - 3:00 PM" or "7am to 3pm"
      const parts = at(c, ix.range).split(/\s+(?:-|–|—|to)\s+|\s*[–—]\s*|(?<=[ap]m|\d)-(?=\d)/i);
      if (parts.length !== 2) return null;
      [startTok, endTok] = parts;
    }
    return [startTok, endTok];
  };
  const order = dateOrder(data.map((c) => at(c, ix.date) || splitStamp((timeToks(c) || [""])[0]).date));
  const dropped = { leave: 0, discarded: 0, empty: 0, elsewhere: 0 };
  const counts = new Map(); // key -> Map(week -> n)
  let rows = 0;
  data.forEach((c, n) => {
    const where = `Row ${n + 2}`;
    if (flagCols.leave >= 0 && TRUE.test(at(c, flagCols.leave).trim())) return dropped.leave++;
    if (flagCols.discarded >= 0 && TRUE.test(at(c, flagCols.discarded).trim())) return dropped.discarded++;
    if (wantLoc && norm(at(c, ix.where)) !== wantLoc) return dropped.elsewhere++;
    const toks = timeToks(c);
    // A row with nothing in the family read: in a two-version file, a shift that exists only in the other version.
    if (families.length > 1 && !at(c, ix.start).trim() && !at(c, ix.end).trim() && !at(c, ix.range).trim()) return dropped.empty++;
    if (!toks) return skipped.push(`${where}: could not split the shift "${at(c, ix.range)}" into a start and an end`);
    const [startTok, endTok] = toks;
    const a = splitStamp(startTok), b = splitStamp(endTok);
    const dateTok = at(c, ix.date) || a.date;
    const dt = parseDate(dateTok, order);
    let day, week = null;
    if (dt) { day = dt.day; week = Math.round(dt.t.getTime() / 86400000); } // a day number until the weeks are anchored below
    else if (dayIndex(dateTok) >= 0) day = dayIndex(dateTok);
    else return skipped.push(`${where}: could not read the date "${dateTok}"`);
    const s = parseTime(a.time), e = parseTime(b.time);
    if (Number.isNaN(s) || Number.isNaN(e)) return skipped.push(`${where}: could not read the times "${startTok}" and "${endTok}"`);
    if (s === e) return skipped.push(`${where}: start and end are the same`);
    const role = clean(at(c, ix.role)).toLowerCase();
    const key = [day, s, e, role].join("|");
    const byWeek = counts.get(key) || new Map();
    byWeek.set(week, (byWeek.get(week) || 0) + 1);
    counts.set(key, byWeek);
    rows++;
  });
  const plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  if (dropped.leave) notes.push(`${plural(dropped.leave, "leave row")} left out (time off, not a shift).`);
  if (dropped.discarded) notes.push(`${plural(dropped.discarded, "discarded row")} left out.`);
  if (dropped.empty) notes.push(`${plural(dropped.empty, "row")} had no ${famName(fam)} shift (only ${families.filter((f) => f !== fam).map(famName).join(" or ")}) and ${dropped.empty === 1 ? "was" : "were"} left out.`);
  if (wantLoc) notes.push(`Only ${locations.find((l) => norm(l.name) === wantLoc).name}: ${plural(dropped.elsewhere, "row")} at other locations left out.`);
  else if (locations.length > 1) notes.push(`The file has ${locations.length} locations (${locations.slice(0, 6).map((l) => `${l.name}: ${l.rows}`).join("; ")}${locations.length > 6 ? "; ..." : ""}); they were planned as one. Pick one location to plan it alone.`);
  if (order === "dmy") notes.push("Dates were read day first (the file has dates such as 13/05).");
  if (!rows) return { shiftsText: "", rows: 0, shifts: 0, notes: [...notes, "No readable shifts in the file."], skipped, unknown, locations, families };
  const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  // Weeks run seven days from the file's first date (a Sunday-to-Saturday export is one week, not two).
  let first = Infinity;
  for (const w of counts.values()) for (const k of w.keys()) if (k !== null) first = Math.min(first, k);
  for (const [key, w] of counts) {
    const byWeek = new Map();
    for (const [k, n] of w) { const wk = k === null ? 0 : Math.floor((k - first) / 7); byWeek.set(wk, (byWeek.get(wk) || 0) + n); }
    counts.set(key, byWeek);
  }
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
  if (unknown.length) notes.push(`Columns not used: ${unknown.slice(0, 12).join(", ")}${unknown.length > 12 ? ` and ${unknown.length - 12} more` : ""}.`);
  notes.push("Check the people-needed counts: a published schedule shows who was scheduled, not who was needed.");
  return { shiftsText: out.join("\n"), rows, shifts: items.length, notes, skipped, unknown, locations, families };
}
