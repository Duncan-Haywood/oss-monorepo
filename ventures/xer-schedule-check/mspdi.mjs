// Microsoft Project XML (MSPDI) reader. "File > Save As > XML" in Microsoft
// Project (2003 to 2024 and Project Online) writes this format; so do
// ProjectLibre, GanttProject, Asta and most converters. It is read into the
// same tables the XER reader returns (PROJECT, CALENDAR, PROJWBS, TASK,
// TASKPRED, SCHEDOPTIONS), so every check, the CPM engine, the comparison,
// the risk run and levelling work on Microsoft Project schedules unchanged.
//
// parseMspdi(text, { textUdf }) -> { version, exportDate, tables, warnings, format: "mspdi" }
//   textUdf (optional): (title) => true for a task Text field to read as a
//   text user-defined field instead of an activity code. p6xer.mjs passes one
//   from the original XER ({ typesFrom }), so a P6 text UDF sent through
//   Project comes back as a text UDF (eval/udf-type-hints-2026-11-22.md).
//   interim (optional): "keep" (default) or "skip". Project's interim plans
//   (Project > Set Baseline > Interim plan) copy each task's Start and Finish
//   into a Start1..10 / Finish1..10 pair. A pair that looks like one (no alias
//   on either field, both set on the same tasks, start never after finish:
//   interimPairs below) is named in a warning; "skip" leaves it out of the
//   user-defined fields, so an XER for P6 does not carry it as date UDFs.
//   skipFields (optional): field names ("Start1", "Finish1", "Number3") to
//   leave out whatever they hold (CLI --skip-fields).
// parseSchedule(text, opts) -> parseMspdi(text, opts) for XML, else parseXer
// interimPairs(text or parsed project node) -> [{ k, start, finish, tasks, sameSpan }]
//
// How Microsoft Project's terms land in P6's:
// - activity ID (task_code) is the task's Unique ID, which Project never
//   renumbers, so two updates still match after rows are inserted (the row
//   number is kept as ms_id).
// - summary tasks become WBS nodes (PROJWBS) and are left out of the network,
//   as P6 does with WBS summary activities; links to or from a summary task
//   are reported, because Project lets them drive the summary's children and
//   P6-style logic does not.
// - the project's status date is the data date (P6's last_recalc_date); with
//   none, the project start, and a warning.
// - baseline 0 start and finish are the planned (target) dates the DCMA
//   missed-task and BEI checks read; with no baseline they are left empty.
// - total and free slack (tenths of a minute) become total and free float
//   hours; durations (PT8H0M0S, working time) become hours.
// - lags are counted on the successor's calendar, as Project does; an
//   elapsed lag (format "ed", "eh", ...) on a 24-hour clock; a percent lag
//   as that share of the predecessor's duration.
// - constraints: must start on -> start on, must finish on -> finish on,
//   start/finish no later than -> on or before, start/finish no earlier than
//   -> on or after, as late as possible -> as late as possible. A deadline is
//   not a constraint: it moves no date, but Project works total slack out
//   from it when it falls before the late finish (Microsoft's "Show slack in
//   your project" page), so an open task's deadline is kept as
//   deadline_date (not a P6 column) and cpm.mjs takes it as a late finish
//   cap, as Project does. p6xer.mjs can write it as a P6 constraint.
// - a manually scheduled task (Manual = 1) that has not started keeps its
//   typed start: it is read as start on or after that date (Project still
//   gives it late dates from the logic), and every one is named in the
//   warnings, since a reviewer wants them switched to auto scheduled.
// - task text fields Text1 to Text30 that hold values become activity codes
//   (ACTVTYPE, ACTVCODE, TASKACTV), named by the field's Alias (else Text5,
//   ...), so a Project schedule groups by its custom fields in the Gantt and
//   the review, and the codes msproject.mjs writes from an XER come back. A
//   field whose values are all different (a note per task) is not a code
//   and is skipped; the Text1 msproject.mjs names "Activity ID" is read as
//   the activity ID's own field, not a code.
// - task Outline Code1..10 become activity codes too, with their lookup
//   table's hierarchy (parent values) and descriptions, so a Project file's
//   own outline codes, and the ones msproject.mjs writes with
//   { outlineCodes: true }, read back as P6's tree of codes.
// - task Number1..20, Cost1..10 and Date1..10 fields that hold values become
//   activity user-defined fields (UDFTYPE, UDFVALUE), titled by the field's
//   Alias (else Number3, ...): whole numbers as integer UDFs, others as
//   decimals, costs (stored in hundredths) as cost UDFs, dates as date UDFs.
//   So the UDFs msproject.mjs writes from an XER come back, and a Project
//   file's own Number fields (optimistic and pessimistic durations, say) feed
//   the risk run's ranges as a P6 file's numeric UDFs do.
// - task notes become notebook entries (MEMOTYPE, TASKMEMO; a summary task's
//   WBSMEMO on its WBS node), one per "[Topic]" section as msproject.mjs
//   writes them, else one entry under the topic "Notes" (notebook.mjs).

import { isPmxml, parsePmxml } from "./pmxml.mjs";
import { parseXer } from "./xer.mjs";
import { parseNotes, memoHtml } from "./notebook.mjs";

// Number1..20, Cost1..10, Date1..10, Start1..10, Finish1..10 (the same tables are in msproject.mjs)
export const UDF_FIELD_IDS = [
  ...["188743767", "188743768", "188743769", "188743770", "188743771", ...Array.from({ length: 15 }, (_, k) => String(188743982 + k))].map((id, k) => [id, "number", `Number${k + 1}`]),
  ...["188743786", "188743787", "188743788", ...Array.from({ length: 7 }, (_, k) => String(188743938 + k))].map((id, k) => [id, "cost", `Cost${k + 1}`]),
  ...Array.from({ length: 10 }, (_, k) => [String(188743945 + k), "date", `Date${k + 1}`]),
  // Start1..10 and Finish1..10 (msproject.mjs writes finish-date UDFs to the Finish ones)
  ...[52, 55, 58, 61, 64, 282, 284, 286, 288, 290].map((i, k) => [String(188743680 + i), "date", `Start${k + 1}`]),
  ...[53, 56, 59, 62, 65, 283, 285, 287, 289, 291].map((i, k) => [String(188743680 + i), "finish", `Finish${k + 1}`]),
];
// Outline Code1..10 (the same table is in msproject.mjs)
export const TASK_OUTLINE_IDS = Array.from({ length: 10 }, (_, k) => String(188744096 + 2 * k));
export const TASK_TEXT_IDS = ["188743731", "188743734", "188743737", "188743740", "188743743", "188743746", "188743747", "188743748", "188743749", "188743750",
  ...Array.from({ length: 20 }, (_, k) => String(188743997 + k))];

// ---------- a small XML reader (elements, text, CDATA, entities) ----------

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescape(s) {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return Object.hasOwn(ENT, e) ? ENT[e] : m;
  });
}

// -> { name, children: [nodes], text }. Attributes are not needed by MSPDI
// and are skipped; namespace prefixes are dropped from names.
export function parseXml(s) {
  const root = { name: "#root", children: [], text: "" };
  const stack = [root];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const lt = s.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (lt < 0) { top.text += unescape(s.slice(i)); break; }
    if (lt > i) top.text += unescape(s.slice(i, lt));
    if (s.startsWith("<!--", lt)) { const e = s.indexOf("-->", lt + 4); if (e < 0) throw new Error("XML: unclosed comment"); i = e + 3; continue; }
    if (s.startsWith("<![CDATA[", lt)) { const e = s.indexOf("]]>", lt + 9); if (e < 0) throw new Error("XML: unclosed CDATA"); top.text += s.slice(lt + 9, e); i = e + 3; continue; }
    if (s.startsWith("<?", lt)) { const e = s.indexOf("?>", lt + 2); if (e < 0) throw new Error("XML: unclosed declaration"); i = e + 2; continue; }
    if (s.startsWith("<!", lt)) { const e = s.indexOf(">", lt + 2); if (e < 0) throw new Error("XML: unclosed declaration"); i = e + 1; continue; }
    // a tag: find its end outside quoted attribute values
    let j = lt + 1, q = null;
    for (; j < n; j++) {
      const c = s[j];
      if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === ">") break;
    }
    if (j >= n) throw new Error("XML: unclosed tag");
    const body = s.slice(lt + 1, j);
    i = j + 1;
    if (body[0] === "/") {
      const name = local(body.slice(1).trim());
      const open = stack.pop();
      if (!open || open === root || open.name !== name) throw new Error(`XML: </${name}> does not close <${open && open.name}>`);
      continue;
    }
    const selfClose = body.endsWith("/");
    const name = local(body.replace(/\/$/, "").trim().split(/\s/)[0]);
    const node = { name, children: [], text: "" };
    top.children.push(node);
    if (!selfClose) stack.push(node);
  }
  if (stack.length !== 1) throw new Error(`XML: <${stack[stack.length - 1].name}> is never closed`);
  return root;
}
const local = (q) => q.slice(q.indexOf(":") + 1);

const kid = (node, name) => node && node.children.find((c) => c.name === name);
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const val = (node, name) => { const k = kid(node, name); return k ? k.text.trim() : ""; };

// ---------- value conversions ----------

// "PT8H30M0S" (also "P2DT4H", "PT-8H0M0S") -> hours; "" -> null
export function durationHours(s) {
  if (!s) return null;
  const m = /^(-)?P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(-?\d+(?:\.\d+)?H)?(-?\d+(?:\.\d+)?M)?(-?\d+(?:\.\d+)?S)?)?$/.exec(s.trim());
  if (!m) return null;
  const f = (x) => (x ? parseFloat(x) : 0);
  // a day in an MSPDI duration is 24 h of clock time; Project itself writes hours
  const h = f(m[4]) * 24 + f(m[5]) + f(m[6]) / 60 + f(m[7]) / 3600;
  return (m[1] ? -1 : 1) * h;
}

// "2024-03-04T08:00:00" -> "2024-03-04 08:00" (xer.mjs's form); "" -> ""
function date(s) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s || "");
  return m ? `${m[1]} ${m[2]}` : "";
}

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);
const serialDay = (ymd) => Math.round((Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) - SERIAL_EPOCH) / 86400000);
const dayFromSerial = (n) => new Date(SERIAL_EPOCH + n * 86400000);

// duration and lag formats: 3 m, 4 em, 5 h, 6 eh, 7 d, 8 ed, 9 w, 10 ew,
// 11 mo, 12 emo, 19 %, 20 e%; 35 to 52 are the same with "?" (estimated),
// so the elapsed ones are the even codes; 53 is "no format"
const ELAPSED_FORMATS = new Set([4, 6, 8, 10, 12, 36, 38, 40, 42, 44]);
const PERCENT_FORMATS = new Set([19, 20, 51, 52]);

const LINK = { 0: "PR_FF", 1: "PR_FS", 2: "PR_SF", 3: "PR_SS" };
const CSTR = { 1: "CS_ALAP", 2: "CS_MSO", 3: "CS_MEO", 4: "CS_MSOA", 5: "CS_MSOB", 6: "CS_MEOA", 7: "CS_MEOB" };

// ---------- calendars ----------

// periods: [["08:00","12:00"], ...] -> "(0||0(s|08:00|f|12:00)())(0||1(...)())"
const periodsData = (ps) => ps.map((p, k) => `(0||${k}(s|${p[0]}|f|${p[1]})())`).join("");
const hhmm = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
};
function workingTimes(node) {
  const out = [];
  for (const wt of kids(kid(node, "WorkingTimes"), "WorkingTime")) {
    const a = hhmm(val(wt, "FromTime"));
    let b = hhmm(val(wt, "ToTime"));
    if (a === null || b === null) continue;
    if (b === "00:00") b = "24:00"; // Project writes a period ending at midnight as 00:00
    out.push([a, b]);
  }
  return out;
}
function hoursOf(ps) {
  let m = 0;
  for (const [a, b] of ps) m += (+b.slice(0, 2) * 60 + +b.slice(3)) - (+a.slice(0, 2) * 60 + +a.slice(3));
  return m / 60;
}

// Read every <Calendar> into { uid, name, base, week: [7 x periods|null], exceptions: Map(serial -> periods), workWeeks }
function readCalendars(proj, warnings) {
  const raw = new Map();
  for (const c of kids(kid(proj, "Calendars"), "Calendar")) {
    const uid = val(c, "UID");
    const week = [null, null, null, null, null, null, null];
    const exceptions = new Map();
    for (const wd of kids(kid(c, "WeekDays"), "WeekDay")) {
      const t = Number(val(wd, "DayType"));
      const working = val(wd, "DayWorking") === "1";
      const ps = working ? workingTimes(wd) : [];
      if (t >= 1 && t <= 7) week[t - 1] = ps;
      else if (t === 0) {
        const tp = kid(wd, "TimePeriod");
        addRange(exceptions, val(tp, "FromDate"), val(tp, "ToDate"), () => ps);
      }
    }
    if (!exceptions.size && kids(kid(c, "Exceptions"), "Exception").length) {
      // Project 2007+ also writes each exception's days as DayType 0 above;
      // only a file from another tool leaves them out
      let recurring = 0;
      for (const e of kids(kid(c, "Exceptions"), "Exception")) {
        const type = Number(val(e, "Type") || 1);
        const ps = val(e, "DayWorking") === "1" ? workingTimes(e) : [];
        const tp = kid(e, "TimePeriod");
        if (type === 1 && !val(e, "Period")) addRange(exceptions, val(tp, "FromDate"), val(tp, "ToDate"), () => ps);
        else recurring++;
      }
      if (recurring) warnings.push(`calendar ${val(c, "Name") || uid}: ${recurring} recurring exception(s) without their days listed were not read`);
    }
    const workWeeks = [];
    for (const ww of kids(kid(c, "WorkWeeks"), "WorkWeek")) {
      const tp = kid(ww, "TimePeriod");
      const wk = [null, null, null, null, null, null, null];
      for (const wd of kids(kid(ww, "WeekDays"), "WeekDay")) {
        const t = Number(val(wd, "DayType"));
        if (t >= 1 && t <= 7) wk[t - 1] = val(wd, "DayWorking") === "1" ? workingTimes(wd) : [];
      }
      workWeeks.push({ from: val(tp, "FromDate"), to: val(tp, "ToDate"), week: wk });
    }
    raw.set(uid, { uid, name: val(c, "Name"), base: val(c, "BaseCalendarUID"), isBase: val(c, "IsBaseCalendar") === "1", week, exceptions, workWeeks });
  }
  return raw;
}

// add one entry per day from..to (inclusive, at most ten years)
function addRange(map, from, to, periodsFor) {
  const a = /^(\d{4}-\d{2}-\d{2})/.exec(from || ""), b = /^(\d{4}-\d{2}-\d{2})/.exec(to || from || "");
  if (!a || !b) return;
  const s = serialDay(a[1]), e = Math.min(serialDay(b[1]), s + 3660);
  for (let d = s; d <= e; d++) map.set(d, periodsFor(d));
}

// A derived calendar takes each weekday and exception its base calendar
// has and it does not; work weeks become exceptions on the days they cover.
function resolveCalendar(raw, uid, seen = new Set()) {
  const c = raw.get(uid);
  if (!c) return null;
  if (seen.has(uid)) return c; // a base-calendar loop: stop here
  seen.add(uid);
  const base = c.base && c.base !== "-1" && c.base !== uid && raw.has(c.base) ? resolveCalendar(raw, c.base, seen) : null;
  const week = c.week.map((d, k) => d ?? (base ? base.week[k] : null));
  const exceptions = new Map(base ? base.exceptions : []);
  for (const ww of c.workWeeks) {
    addRange(exceptions, ww.from, ww.to, (d) => {
      const dow = dayFromSerial(d).getUTCDay();
      return ww.week[dow] ?? week[dow] ?? [];
    });
  }
  for (const [d, ps] of c.exceptions) exceptions.set(d, ps);
  return { ...c, week, exceptions };
}

function clndrData(cal) {
  const days = cal.week.map((ps, k) => `(0||${k + 1}()(${periodsData(ps || [])}))`).join("");
  const exc = [...cal.exceptions].sort((a, b) => a[0] - b[0]).map(([d, ps], k) => `(0||${k}(d|${d})(${periodsData(ps)}))`).join("");
  return `(0||CalendarData()((0||DaysOfWeek()(${days}))(0||Exceptions()(${exc}))))`;
}

const ALL_DAY = { week: Array.from({ length: 7 }, () => [["00:00", "24:00"]]), exceptions: new Map() };

// Working periods as minute intervals, and back.
const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
const toHhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function mergePeriods(lists) {
  const iv = lists.flat().map(([a, b]) => [toMin(a), toMin(b)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of iv) { const l = out[out.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else out.push([a, b]); }
  return out.map(([a, b]) => [toHhmm(a), toHhmm(b)]);
}
function crossPeriods(x, y) {
  const out = [];
  for (const [a, b] of x) for (const [c, d] of y) { const lo = Math.max(toMin(a), toMin(c)), hi = Math.min(toMin(b), toMin(d)); if (hi > lo) out.push([toHhmm(lo), toHhmm(hi)]); }
  return mergePeriods([out]);
}
const dayPeriods = (cal, d) => (cal.exceptions.has(d) ? cal.exceptions.get(d) : cal.week[dayFromSerial(d).getUTCDay()] || []);
// Day by day: the time any of the calendars works (union) or all of them do
// (cross), weekdays and every day any of them has an exception on.
function combineCalendars(cals, op) {
  const week = Array.from({ length: 7 }, (_, k) => cals.map((c) => c.week[k] || []).reduce((a, b) => op(a, b)));
  const exceptions = new Map();
  for (const d of new Set(cals.flatMap((c) => [...c.exceptions.keys()]))) exceptions.set(d, cals.map((c) => dayPeriods(c, d)).reduce((a, b) => op(a, b)));
  return { week, exceptions };
}
const unionCalendars = (cals) => combineCalendars(cals, (a, b) => mergePeriods([a, b]));
const crossCalendars = (cals) => combineCalendars(cals, crossPeriods);

// ---------- the project ----------

export function parseMspdi(text, { textUdf, interim = "keep", skipFields = [] } = {}) {
  if (interim !== "keep" && interim !== "skip") throw new Error(`interim must be "keep" or "skip", not ${JSON.stringify(interim)}`);
  if (typeof text !== "string") throw new TypeError("parseMspdi expects text");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const doc = parseXml(text);
  const proj = kid(doc, "Project");
  if (!proj) throw new Error("not a Microsoft Project XML file: no <Project> element");
  const warnings = [];
  const minutesPerDay = Number(val(proj, "MinutesPerDay")) || 480;

  // calendars
  const raw = readCalendars(proj, warnings);
  const CALENDAR = [];
  const projCal = val(proj, "CalendarUID");
  const resolved = new Map();
  for (const uid of raw.keys()) {
    const c = resolveCalendar(raw, uid);
    resolved.set(uid, c);
    if (c.week.every((d) => d === null) && !c.exceptions.size) continue;
    const week = c.week.map((d) => d || []);
    const weekHours = week.reduce((a, d) => a + hoursOf(d), 0);
    const workDays = week.filter((d) => d.length).length || 1;
    CALENDAR.push({
      clndr_id: uid,
      clndr_name: c.name || `calendar ${uid}`,
      default_flag: uid === projCal ? "Y" : "N",
      // P6's hours per day turns hours into days in every report; Project's
      // own setting (MinutesPerDay) does the same job there
      day_hr_cnt: String(minutesPerDay / 60 || weekHours / workDays),
      clndr_data: clndrData({ week, exceptions: c.exceptions }),
    });
  }
  const calIds = new Set(CALENDAR.map((c) => c.clndr_id));
  const projCalId = calIds.has(projCal) ? projCal : CALENDAR[0]?.clndr_id ?? "";
  if (!calIds.has(projCal)) warnings.push(projCal ? `the project calendar ${projCal} is not in the file` : "the file names no project calendar");
  const ensure24 = () => {
    if (!calIds.has("mspdi-24h")) {
      calIds.add("mspdi-24h");
      CALENDAR.push({ clndr_id: "mspdi-24h", clndr_name: "24 hour (elapsed)", default_flag: "N", day_hr_cnt: "24", clndr_data: clndrData(ALL_DAY) });
    }
    return "mspdi-24h";
  };

  // Resource calendars. Project counts a task's duration as the working time
  // in which any of its work resources works, each on its own calendar (and
  // within the task's calendar, when the task has one), unless the task
  // ignores resource calendars. So a task whose resources work a night shift
  // or a 24-hour week runs on that time, not the project calendar's; with a
  // day-shift and a night-shift resource it runs on both
  // (eval/resource-calendars-2026-11-21.md).
  const resCal = new Map();
  for (const r of kids(kid(proj, "Resources"), "Resource")) {
    const uid = val(r, "UID"), cal = val(r, "CalendarUID");
    // Type 1 is a work resource (0 material, 2 cost); older files omit it
    if (uid && cal && resolved.has(cal) && (val(r, "Type") === "" || val(r, "Type") === "1") && val(r, "IsNull") !== "1") resCal.set(uid, cal);
  }
  const taskRes = new Map();
  for (const a of kids(kid(proj, "Assignments"), "Assignment")) {
    const cal = resCal.get(val(a, "ResourceUID"));
    if (!cal) continue;
    const tu = val(a, "TaskUID");
    if (!taskRes.has(tu)) taskRes.set(tu, new Set());
    taskRes.get(tu).add(cal);
  }
  // Split tasks: Project stores a split (a stretch inside a task with no
  // work) only in the assignments' timephased rows, as rows of remaining work
  // (Type 1) whose value is zero between rows with work. A gap is time no
  // assignment of the task has work in; moved with the task, it keeps its
  // length in working time (eval/split-tasks-2026-11-21.md). Rows with no
  // value are non-working time and are not gaps.
  const splitGaps = new Map(); // task UID -> [[start, finish], ...]
  {
    const byTask = new Map();
    for (const a of kids(kid(proj, "Assignments"), "Assignment")) {
      const tu = val(a, "TaskUID");
      for (const r of kids(a, "TimephasedData")) {
        const type = val(r, "Type");
        if (type !== "1" && type !== "2") continue;
        const v = val(r, "Value");
        if (v === "") continue;
        const s = date(val(r, "Start")), f = date(val(r, "Finish"));
        if (!s || !f || f <= s) continue;
        const h = durationHours(v);
        if (h === null) continue;
        if (!byTask.has(tu)) byTask.set(tu, { work: [], zero: [] });
        const e = byTask.get(tu);
        if (h > 0) e.work.push([s, f]);
        else if (type === "1") e.zero.push([s, f]);
      }
    }
    for (const [tu, e] of byTask) {
      if (!e.zero.length || !e.work.length) continue;
      const first = e.work.reduce((m, w) => (w[0] < m ? w[0] : m), e.work[0][0]);
      const last = e.work.reduce((m, w) => (w[1] > m ? w[1] : m), e.work[0][1]);
      const gaps = [];
      for (let [s, f] of e.zero.sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
        if (s < first) s = first;
        if (f > last) f = last;
        if (f <= s) continue;
        // a zero row another assignment works in is not a gap
        if (e.work.some((w) => w[0] < f && w[1] > s)) continue;
        if (gaps.length && gaps[gaps.length - 1][1] >= s) { if (f > gaps[gaps.length - 1][1]) gaps[gaps.length - 1][1] = f; }
        else gaps.push([s, f]);
      }
      if (gaps.length) splitGaps.set(tu, gaps);
    }
  }
  const plain = (c) => ({ week: c.week.map((d) => d || []), exceptions: c.exceptions });
  const combined = new Map();
  let onResources = 0, noCommon = 0;
  const resourceCalendar = (t, uid, clndr) => {
    const cals = taskRes.get(uid);
    if (!cals || val(t, "IgnoreResourceCalendar") === "1") return clndr;
    const own = val(t, "CalendarUID");
    const hasOwn = own && own !== "-1" && resolved.has(own);
    const key = `${hasOwn ? own : ""}|${[...cals].sort().join("+")}`;
    if (!combined.has(key)) {
      const list = [...cals].sort().map((c) => plain(resolved.get(c)));
      const cal = unionCalendars(hasOwn ? list.map((c) => crossCalendars([plain(resolved.get(own)), c])) : list);
      const data = clndrData(cal);
      const same = CALENDAR.find((c) => c.clndr_data === data);
      let id = same?.clndr_id;
      // no time the task's calendar and any resource's share: Project warns
      // and the task stays on its own calendar
      if (!cal.week.some((d) => d.length)) { id = clndr; noCommon++; }
      else if (!id) {
        id = `mspdi-res-${combined.size + 1}`;
        CALENDAR.push({ clndr_id: id, clndr_name: `resources ${[...cals].sort().map((c) => resolved.get(c).name || c).join(" + ")}${hasOwn ? ` within ${resolved.get(own).name || own}` : ""}`, default_flag: "N", day_hr_cnt: String(minutesPerDay / 60), clndr_data: data });
        calIds.add(id);
      }
      combined.set(key, id);
    }
    const id = combined.get(key);
    if (id !== clndr) onResources++;
    return id;
  };

  // project
  const statusDate = date(val(proj, "StatusDate"));
  const start = date(val(proj, "StartDate"));
  const title = val(proj, "Title") || val(proj, "Name").replace(/\.xml$/i, "") || "Microsoft Project schedule";

  const fromFinish = val(proj, "ScheduleFromStart") === "0";
  if (fromFinish) warnings.push("the project is scheduled from its finish date; it is checked forward from the start like P6, so early dates can differ from Project's");
  const PROJECT = [{
    proj_id: "1",
    proj_short_name: title,
    last_recalc_date: statusDate || start,
    plan_start_date: start,
    // a project scheduled from its finish has a fixed finish; one scheduled
    // from its start has no must-finish date
    plan_end_date: fromFinish ? date(val(proj, "FinishDate")) : "",
    scd_end_date: date(val(proj, "FinishDate")),
    clndr_id: projCalId,
    critical_drtn_hr_cnt: String((Number(val(proj, "CriticalSlackLimit")) || 0) * minutesPerDay / 60),
    critical_path_type: "CT_TotFloat",
  }];
  const SCHEDOPTIONS = [{
    proj_id: "1",
    // Project's total slack is the smaller of start and finish slack
    sched_float_type: "FT_SmallestFloat",
    sched_calendar_on_relationship_lag: "rcal_Successor",
    // Project's default ("split in-progress tasks" on) keeps the logic of
    // out-of-sequence work much as P6's retained logic does
    sched_retained_logic: "Y",
    sched_progress_override: "N",
    sched_use_project_end_date_for_float: "Y",
  }];

  // tasks
  const PROJWBS = [], TASK = [], TASKPRED = [];
  const taskNodes = kids(kid(proj, "Tasks"), "Task");
  const byUid = new Map();
  const outline = []; // summary UID at each outline level
  const manual = [];
  let splits = 0;
  let summaries = 0, deadlines = 0, inactive = 0, nulls = 0, elapsed = 0, external = 0;
  const durHours = new Map();
  // task notes -> P6 notebook entries, one per bracketed topic (notebook.mjs);
  // a summary task's notes go on its WBS node, the project summary task's on
  // the project's own node (wbs_id "")
  const MEMOTYPE = [], TASKMEMO = [], WBSMEMO = [];
  const topicId = new Map();
  const after = new Map(); // topic -> topics a note put after it
  const addNotes = (t, table, owner) => {
    let prev = null;
    for (const x of parseNotes(kid(t, "Notes")?.text ?? "")) {
      const key = x.topic.toLowerCase();
      if (!topicId.has(key)) { topicId.set(key, String(MEMOTYPE.length + 1)); MEMOTYPE.push({ memo_type_id: topicId.get(key), seq_num: "", memo_type: x.topic }); }
      if (prev !== null && prev !== key) { if (!after.has(prev)) after.set(prev, new Set()); after.get(prev).add(key); }
      prev = key;
      const id = topicId.get(key);
      if (table === "TASKMEMO") TASKMEMO.push({ memo_id: String(TASKMEMO.length + 1), task_id: owner, memo_type_id: id, proj_id: "1", task_memo: memoHtml(x.text) });
      else WBSMEMO.push({ wbs_memo_id: String(WBSMEMO.length + 1), proj_id: "1", memo_type_id: id, wbs_id: owner, wbs_memo: memoHtml(x.text) });
    }
  };
  for (const t of taskNodes) {
    const uid = val(t, "UID");
    if (!uid) continue;
    if (val(t, "IsNull") === "1") { nulls++; continue; }
    const level = Number(val(t, "OutlineLevel") || 1);
    if (level === 0) { addNotes(t, "WBSMEMO", ""); continue; } // the project summary task: its notes are the project's
    if (val(t, "Active") === "0") { inactive++; continue; }
    if (val(t, "ExternalTask") === "1") { external++; continue; }
    outline.length = Math.max(0, level - 1);
    const parent = outline[level - 2] ?? "";
    const isSummary = val(t, "Summary") === "1";
    byUid.set(uid, { node: t, summary: isSummary });
    if (isSummary) {
      summaries++;
      outline[level - 1] = uid;
      PROJWBS.push({ wbs_id: uid, proj_id: "1", parent_wbs_id: parent, wbs_short_name: val(t, "WBS") || val(t, "OutlineNumber"), wbs_name: val(t, "Name") });
      addNotes(t, "WBSMEMO", uid);
      continue;
    }
    const dur = durationHours(val(t, "Duration")) ?? 0;
    const remain = durationHours(val(t, "RemainingDuration"));
    durHours.set(uid, dur);
    const actStart = date(val(t, "ActualStart")), actEnd = date(val(t, "ActualFinish"));
    const pctDone = Number(val(t, "PercentComplete") || 0);
    const status = actEnd || pctDone >= 100 ? "TK_Complete" : actStart || pctDone > 0 ? "TK_Active" : "TK_NotStart";
    let clndr = val(t, "CalendarUID");
    if (!clndr || clndr === "-1" || !calIds.has(clndr)) clndr = projCalId;
    const fmt = Number(val(t, "DurationFormat"));
    if (ELAPSED_FORMATS.has(fmt)) { clndr = ensure24(); elapsed++; }
    else clndr = resourceCalendar(t, uid, clndr);
    const bl = kids(t, "Baseline").find((b) => val(b, "Number") === "0" || val(b, "Number") === "");
    const ct = Number(val(t, "ConstraintType"));
    let cstr = (Object.hasOwn(CSTR, ct) && CSTR[ct]) || "";
    let cstrDate = cstr && cstr !== "CS_ALAP" ? date(val(t, "ConstraintDate")) : "";
    if (val(t, "Manual") === "1" && status === "TK_NotStart") {
      // Project keeps a manual task's start where it was typed but still
      // works out its late dates from the logic: a start-on-or-after at its
      // own start does the same (unless a predecessor now runs past it, when
      // the task is pushed and Project would show the clash instead)
      manual.push(`${uid} ${val(t, "Name")}`.trim());
      cstr = "CS_MSOA";
      cstrDate = date(val(t, "Start"));
    }
    if (val(t, "Deadline")) deadlines++;
    if (splitGaps.has(uid) && status !== "TK_Complete") splits++;
    addNotes(t, "TASKMEMO", uid);
    const isMile = val(t, "Milestone") === "1";
    const slack = (k) => { const v = val(t, k); return v === "" ? "" : String(Number(v) / 600); };
    TASK.push({
      task_id: uid,
      proj_id: "1",
      wbs_id: parent,
      clndr_id: clndr,
      task_code: uid,
      task_name: val(t, "Name"),
      // a milestone with no predecessor is a start milestone, as in P6
      task_type: isMile ? (kids(t, "PredecessorLink").length ? "TT_FinMile" : "TT_Mile") : "TT_Task",
      status_code: status,
      target_drtn_hr_cnt: String(dur),
      remain_drtn_hr_cnt: String(status === "TK_Complete" ? 0 : remain ?? dur * (1 - pctDone / 100)),
      act_start_date: actStart,
      act_end_date: actEnd,
      early_start_date: date(val(t, "EarlyStart")) || date(val(t, "Start")),
      early_end_date: date(val(t, "EarlyFinish")) || date(val(t, "Finish")),
      late_start_date: date(val(t, "LateStart")),
      late_end_date: date(val(t, "LateFinish")),
      // P6's "remaining" dates: Project's Start/Finish (actual dates once progressed)
      restart_date: status === "TK_NotStart" ? date(val(t, "Start")) : "",
      // where Project restarts the remaining work of a task in progress
      // (eval/resource-calendars-2026-11-21.md, "Resume")
      resume_date: status === "TK_Active" ? date(val(t, "Resume")) : "",
      reend_date: status === "TK_Complete" ? "" : date(val(t, "Finish")),
      // split gaps (start|finish;...), not a P6 column: cpm.mjs adds their
      // working time to the task's span
      ...(splitGaps.has(uid) && status !== "TK_Complete" ? { split_gaps: splitGaps.get(uid).map((g) => g.join("|")).join(";") } : {}),
      target_start_date: bl ? date(val(bl, "Start")) : "",
      target_end_date: bl ? date(val(bl, "Finish")) : "",
      total_float_hr_cnt: slack("TotalSlack"),
      free_float_hr_cnt: slack("FreeSlack"),
      cstr_type: cstr,
      cstr_date: cstrDate,
      // Project's deadline (not a P6 column): a late finish cap in cpm.mjs
      ...(val(t, "Deadline") && status !== "TK_Complete" ? { deadline_date: date(val(t, "Deadline")) } : {}),
      priority_type: "",
      ms_id: val(t, "ID"),
    });
  }
  // With no status date nothing has been reported, so the data date is the
  // earliest a task starts (a manual or must-start-on task can sit before the
  // project start, and Project leaves it there)
  if (!statusDate) {
    let first = start;
    for (const r of TASK) { const d = r.restart_date || r.act_start_date; if (d && (!first || d < first)) first = d; }
    PROJECT[0].last_recalc_date = PROJECT[0].plan_start_date = first;
    warnings.push(`no status date in the file (Project, Status Date): ${first || "no date"}, the ${first && first < start ? "earliest task start" : "project start"}, is used as the data date, so any progress recorded is not checked against it`);
  }
  const textCodes = readTextCodes(proj, taskNodes, new Set(TASK.map((r) => r.task_id)), warnings, textUdf);
  const oc = readOutlineCodes(proj, taskNodes, new Set(TASK.map((r) => r.task_id)), warnings);
  // outline codes first (they hold the most assigned types when msproject.mjs wrote them)
  const codes = oc.ACTVTYPE.length || textCodes.ACTVTYPE
    ? { ACTVTYPE: [...oc.ACTVTYPE, ...(textCodes.ACTVTYPE || [])].map((r, k) => ({ ...r, seq_num: String(k + 1) })), ACTVCODE: [...oc.ACTVCODE, ...(textCodes.ACTVCODE || [])], TASKACTV: [...oc.TASKACTV, ...(textCodes.TASKACTV || [])] }
    : {};
  // interim plans in Start/Finish pairs, and fields the caller leaves out
  const pairs = interimPairs(proj);
  const skip = new Set(skipFields.map((f) => String(f).trim().toLowerCase()).filter(Boolean));
  const known = new Set(UDF_FIELD_IDS.map(([, , n]) => n.toLowerCase()));
  const unknown = [...skip].filter((f) => !known.has(f));
  if (unknown.length) warnings.push(`--skip-fields: ${unknown.join(", ")} not a Number, Cost, Date, Start or Finish field name (Number1..20, Cost1..10, Date1..10, Start1..10, Finish1..10); ignored`);
  if (pairs.length) {
    const names = pairs.map((p) => `Start${p.k}/Finish${p.k} (${p.tasks} task(s), ${p.sameSpan} with the task's own start-to-finish span)`).join("; ");
    if (interim === "skip") { for (const p of pairs) { skip.add(`start${p.k}`); skip.add(`finish${p.k}`); } warnings.push(`interim plan(s) left out (--no-interim): ${names}`); }
    else warnings.push(`${pairs.length} Start/Finish pair(s) look like a Project interim plan (Set Baseline > Interim plan; no alias, set on the same tasks, start never after finish): ${names}. They are read as date user-defined fields; leave them out with --no-interim (on the page, "leave out interim plans"), or give the fields an alias in Project if they are your own`);
  }
  const udfs = readUdfFields(proj, taskNodes, new Set(TASK.map((r) => r.task_id)), "TASK", skip);
  // task Text fields the original XER names as text UDFs (textUdf)
  if (textCodes.UDFTYPE) { udfs.UDFTYPE = [...(udfs.UDFTYPE || []), ...textCodes.UDFTYPE]; udfs.UDFVALUE = [...(udfs.UDFVALUE || []), ...textCodes.UDFVALUE]; }
  // the same fields on summary tasks -> WBS user-defined fields (with text)
  const wbsUdfs = readUdfFields(proj, taskNodes, new Set(PROJWBS.map((w) => w.wbs_id)), "PROJWBS", skip);
  if (wbsUdfs.UDFTYPE) { udfs.UDFTYPE = [...(udfs.UDFTYPE || []), ...wbsUdfs.UDFTYPE]; udfs.UDFVALUE = [...(udfs.UDFVALUE || []), ...wbsUdfs.UDFVALUE]; }

  // relationships, after every task is known
  let summaryLinks = 0, pctLags = 0, elapsedLags = 0, crossProject = 0;
  let relId = 0;
  for (const t of taskNodes) {
    const succ = val(t, "UID");
    const s = byUid.get(succ);
    for (const l of kids(t, "PredecessorLink")) {
      if (val(l, "CrossProject") === "1") { crossProject++; continue; }
      const pred = val(l, "PredecessorUID");
      const p = byUid.get(pred);
      if (!s || !p) continue; // to an inactive, null, external or project-summary task
      if (s.summary || p.summary) { summaryLinks++; continue; }
      const lt = val(l, "Type") === "" ? 1 : Number(val(l, "Type"));
      const type = (Object.hasOwn(LINK, lt) && LINK[lt]) || "PR_FS";
      const fmt = Number(val(l, "LagFormat"));
      const linkLag = Number(val(l, "LinkLag") || 0);
      let lagH = linkLag / 600;
      const row = { task_pred_id: String(++relId), task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: "" };
      if (PERCENT_FORMATS.has(fmt)) {
        // LinkLag is the percent itself; the lag is that share of the predecessor's duration
        lagH = (linkLag / 100) * (durHours.get(pred) || 0);
        if (linkLag) pctLags++;
      } else if (ELAPSED_FORMATS.has(fmt) && linkLag) {
        row.lag_calendar = "24h";
        elapsedLags++;
      }
      row.lag_hr_cnt = String(lagH);
      TASKPRED.push(row);
    }
  }
  if (summaries && summaryLinks) warnings.push(`${summaryLinks} link(s) to or from a summary task were left out: Project lets them drive every task under the summary, which hides the real logic (move them to the tasks themselves)`);
  // topic order (P6 shows a notebook's topics in MEMOTYPE seq_num order): one
  // that agrees with the order of the topics in every note, first seen first
  // where the notes do not say (where they disagree, a cycle is broken at the
  // first-seen topic)
  {
    const keys = MEMOTYPE.map((m) => m.memo_type.toLowerCase());
    const before = new Map(keys.map((k) => [k, 0]));
    for (const [, s] of after) for (const k of s) before.set(k, before.get(k) + 1);
    const done = new Set();
    let seq = 0;
    while (done.size < keys.length) {
      const k = keys.find((x) => !done.has(x) && before.get(x) === 0) ?? keys.find((x) => !done.has(x));
      done.add(k);
      MEMOTYPE[keys.indexOf(k)].seq_num = String(++seq * 10);
      for (const n of after.get(k) || []) if (!done.has(n)) before.set(n, before.get(n) - 1);
    }
  }
  if (manual.length) warnings.push(`${manual.length} manually scheduled task(s) do not move with their logic (switch them to auto scheduled before relying on the dates); each is read as start on or after its typed start: ${manual.slice(0, 12).join("; ")}${manual.length > 12 ? "; ..." : ""}`);
  if (deadlines) warnings.push(`${deadlines} task(s) carry a deadline: as in Project, a deadline before a task's late finish sets its late finish, so its total float counts down to the deadline (negative once the task is forecast past it)`);
  if (inactive) warnings.push(`${inactive} inactive task(s) left out, as Project leaves them out of the schedule`);
  if (external) warnings.push(`${external} external (inserted-project) task(s) left out`);
  if (crossProject) warnings.push(`${crossProject} cross-project link(s) left out`);
  if (splits) warnings.push(`${splits} split task(s): the working time in each split is added to the task's span, so its finish lands where Project's does; P6 has no splits, so an XER written from this file loses them`);
  if (elapsed) warnings.push(`${elapsed} task(s) with an elapsed duration are scheduled on a 24-hour calendar`);
  if (noCommon) warnings.push(`${noCommon} task calendar(s) share no working time with their resources' calendars; those tasks stay on their own calendar (Project warns about the same)`);
  if (onResources) warnings.push(`${onResources} task(s) scheduled on their resources' calendars, as Project does, not the task or project calendar`);
  if (elapsedLags) warnings.push(`${elapsedLags} elapsed lag(s) counted on a 24-hour clock`);
  if (pctLags) warnings.push(`${pctLags} percent lag(s) turned into hours of the predecessor's duration`);
  if (nulls) warnings.push(`${nulls} blank row(s) skipped`);
  if (!TASK.length) warnings.push("the file has no tasks");
  return {
    version: `MSPDI ${val(proj, "SaveVersion") || ""}`.trim(),
    exportDate: date(val(proj, "LastSaved")),
    tables: { PROJECT, CALENDAR, SCHEDOPTIONS, PROJWBS, TASK, TASKPRED, ...codes, ...udfs, ...(MEMOTYPE.length ? { MEMOTYPE } : {}), ...(TASKMEMO.length ? { TASKMEMO } : {}), ...(WBSMEMO.length ? { WBSMEMO } : {}) },
    warnings,
    format: "mspdi",
  };
}

// Task text fields -> activity code tables. A value "C - Civil" splits into
// code C and description Civil when no code in the field carries two
// different descriptions (msproject.mjs writes that form with codeNames, and
// a value with no description as the bare code).
function readTextCodes(proj, taskNodes, taskIds, warnings, textUdf) {
  const defs = new Map();
  for (const d of kids(kid(proj, "ExtendedAttributes"), "ExtendedAttribute")) defs.set(val(d, "FieldID"), { name: val(d, "FieldName"), alias: val(d, "Alias") });
  const fields = new Map(); // field id -> Map(task uid -> value)
  for (const t of taskNodes) {
    const uid = val(t, "UID");
    if (!taskIds.has(uid)) continue;
    for (const e of kids(t, "ExtendedAttribute")) {
      const id = val(e, "FieldID"), v = val(e, "Value").trim();
      if (!v || !TASK_TEXT_IDS.includes(id)) continue;
      if (!fields.has(id)) fields.set(id, new Map());
      fields.get(id).set(uid, v);
    }
  }
  const ACTVTYPE = [], ACTVCODE = [], TASKACTV = [];
  const UDFTYPE = [], UDFVALUE = [];
  const skipped = [];
  for (const id of TASK_TEXT_IDS) {
    const vals = fields.get(id);
    if (!vals) continue;
    const def = defs.get(id) || {};
    const label = def.alias || def.name || `Text${TASK_TEXT_IDS.indexOf(id) + 1}`;
    if (def.alias === "Activity ID") continue;
    if (textUdf?.(label)) {
      const typeId = `mspdi-text${TASK_TEXT_IDS.indexOf(id) + 1}`;
      UDFTYPE.push({ udf_type_id: typeId, table_name: "TASK", udf_type_name: `user_text${TASK_TEXT_IDS.indexOf(id) + 1}`, udf_type_label: label, logical_data_type: "FT_TEXT" });
      for (const [uid, v] of vals) UDFVALUE.push({ udf_type_id: typeId, fk_id: uid, proj_id: "1", udf_date: "", udf_number: "", udf_text: v, udf_code_id: "" });
      continue;
    }
    const distinct = new Set(vals.values());
    if (vals.size > 20 && distinct.size === vals.size) { skipped.push(label); continue; }
    // "code - description" when the split is consistent for the whole field
    // (a value with no description is written as the bare code)
    const desc = new Map();
    let split = false;
    for (const v of distinct) {
      const k = v.indexOf(" - ");
      if (k <= 0) continue;
      const code = v.slice(0, k), d = v.slice(k + 3);
      if (desc.has(code) && desc.get(code) !== d) { split = false; break; }
      desc.set(code, d);
      split = true;
    }
    const typeId = `mspdi-${TASK_TEXT_IDS.indexOf(id) + 1}`;
    ACTVTYPE.push({ actv_code_type_id: typeId, actv_code_type: label, actv_code_type_scope: "AS_Project", proj_id: "1", seq_num: String(ACTVTYPE.length + 1) });
    const codeId = new Map();
    const sorted = [...distinct].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const v of sorted) {
      const k = v.indexOf(" - ");
      const code = split && k > 0 ? v.slice(0, k) : v;
      if (codeId.has(code)) { codeId.set(v, codeId.get(code)); continue; }
      const cid = `${typeId}-${codeId.size + 1}`;
      codeId.set(code, cid);
      codeId.set(v, cid);
      ACTVCODE.push({ actv_code_id: cid, actv_code_type_id: typeId, parent_actv_code_id: "", short_name: code, actv_code_name: split && desc.has(code) ? desc.get(code) : v, seq_num: String(ACTVCODE.length + 1) });
    }
    for (const [uid, v] of vals) TASKACTV.push({ task_id: uid, actv_code_type_id: typeId, actv_code_id: codeId.get(v), proj_id: "1" });
  }
  if (skipped.length) warnings.push(`text field(s) with a different value on every task are not read as activity codes: ${skipped.join(", ")}`);
  return { ...(ACTVTYPE.length ? { ACTVTYPE, ACTVCODE, TASKACTV } : {}), ...(UDFTYPE.length ? { UDFTYPE, UDFVALUE } : {}) };
}

// Task Outline Code1..10 -> activity code tables, with the hierarchy and
// descriptions of each field's lookup table (<OutlineCodes>): a value's
// parent becomes its code's parent, its description the code's name. A task's
// value is found by Project 2003's <OutlineCode><ValueID>, else Project 2007's
// <ExtendedAttribute> by ValueGUID, else by its path (the codes joined by the
// mask's separators). A field with no lookup table, or a path the table does
// not hold, reads as flat codes named by the path.
function readOutlineCodes(proj, taskNodes, taskIds, warnings) {
  const defs = new Map();
  for (const d of kids(kid(proj, "ExtendedAttributes"), "ExtendedAttribute")) defs.set(val(d, "FieldID"), { name: val(d, "FieldName"), alias: val(d, "Alias") });
  const tables = new Map(); // field id -> { byVid, byGuid, byPath, items }
  for (const oc of kids(kid(proj, "OutlineCodes"), "OutlineCode")) {
    const id = val(oc, "FieldID");
    if (!TASK_OUTLINE_IDS.includes(id) || tables.has(id)) continue;
    const seps = kids(kid(oc, "Masks"), "Mask").map((m) => [Number(val(m, "Level")), kid(m, "Separator") ? kid(m, "Separator").text : "."]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const items = kids(kid(oc, "Values"), "Value").map((v) => ({ vid: val(v, "ValueID"), parent: val(v, "ParentValueID"), guid: val(v, "FieldGUID").toUpperCase(), code: val(v, "Value"), desc: val(v, "Description") }));
    const byVid = new Map(items.map((it) => [it.vid, it]));
    const pathAt = (it) => { const chain = []; for (let x = it, n = 0; x && n <= items.length; x = byVid.get(x.parent), n++) { chain.unshift(x); if (x.parent === x.vid) break; } return chain.map((x, k) => (k ? (seps[k - 1] ?? seps[seps.length - 1] ?? ".") : "") + x.code).join(""); };
    const byGuid = new Map(), byPath = new Map();
    for (const it of items) { it.path = pathAt(it); if (it.guid) byGuid.set(it.guid, it); if (!byPath.has(it.path)) byPath.set(it.path, it); }
    tables.set(id, { byVid, byGuid, byPath, items, guid: val(oc, "Guid"), alias: val(oc, "Alias") });
  }
  const got = new Map(); // field id -> Map(task uid -> { item } | { path })
  for (const t of taskNodes) {
    const uid = val(t, "UID");
    if (!taskIds.has(uid)) continue;
    const set = (id, v) => { if (!got.has(id)) got.set(id, new Map()); if (!got.get(id).has(uid)) got.get(id).set(uid, v); };
    for (const o of kids(t, "OutlineCode")) {
      const id = val(o, "FieldID"), it = tables.get(id)?.byVid.get(val(o, "ValueID"));
      if (TASK_OUTLINE_IDS.includes(id) && it) set(id, { item: it });
    }
    for (const e of kids(t, "ExtendedAttribute")) {
      const id = val(e, "FieldID");
      if (!TASK_OUTLINE_IDS.includes(id)) continue;
      const tb = tables.get(id), g = val(e, "ValueGUID").toUpperCase(), v = val(e, "Value");
      const it = tb && ((g && tb.byGuid.get(g)) || tb.byPath.get(v));
      if (it) set(id, { item: it });
      else if (v) set(id, { path: v });
    }
  }
  const ACTVTYPE = [], ACTVCODE = [], TASKACTV = [];
  let loose = 0;
  for (const id of TASK_OUTLINE_IDS) {
    const vals = got.get(id), tb = tables.get(id);
    if (!vals && !tb) continue;
    const n = TASK_OUTLINE_IDS.indexOf(id) + 1;
    const def = defs.get(id) || {};
    const typeId = `mspdi-oc-${n}`;
    ACTVTYPE.push({ actv_code_type_id: typeId, actv_code_type: def.alias || tb?.alias || def.name || `Outline Code${n}`, actv_code_type_scope: "AS_Project", proj_id: "1", seq_num: String(n) });
    const cid = (it) => `${typeId}-${it.vid}`;
    for (const it of tb ? tb.items : []) {
      const parent = tb.byVid.get(it.parent);
      ACTVCODE.push({ actv_code_id: cid(it), actv_code_type_id: typeId, parent_actv_code_id: parent && parent !== it ? cid(parent) : "", short_name: it.code, actv_code_name: it.desc || it.code, seq_num: String(ACTVCODE.length + 1) });
    }
    const flat = new Map();
    for (const [uid, v] of vals || []) {
      let code = v.item ? cid(v.item) : null;
      if (!code) {
        loose++;
        if (!flat.has(v.path)) {
          flat.set(v.path, `${typeId}-p${flat.size + 1}`);
          ACTVCODE.push({ actv_code_id: flat.get(v.path), actv_code_type_id: typeId, parent_actv_code_id: "", short_name: v.path, actv_code_name: v.path, seq_num: String(ACTVCODE.length + 1) });
        }
        code = flat.get(v.path);
      }
      TASKACTV.push({ task_id: uid, actv_code_type_id: typeId, actv_code_id: code, proj_id: "1" });
    }
  }
  if (loose) warnings.push(`${loose} outline code value(s) are not in their field's lookup table and are read as flat codes named by the whole value`);
  return { ACTVTYPE, ACTVCODE, TASKACTV };
}

// Task Number, Cost and Date fields -> activity user-defined fields. With
// table "PROJWBS" (taskIds then the summary tasks' UIDs, which are the WBS
// ids) the same fields and the Text fields (not the Activity ID one, which
// holds the WBS code) -> WBS user-defined fields: msproject.mjs writes WBS
// UDFs onto the summary tasks.
function readUdfFields(proj, taskNodes, taskIds, table = "TASK", skip = new Set()) {
  const defs = new Map();
  for (const d of kids(kid(proj, "ExtendedAttributes"), "ExtendedAttribute")) defs.set(val(d, "FieldID"), { name: val(d, "FieldName"), alias: val(d, "Alias") });
  const wbs = table === "PROJWBS";
  const fieldList = wbs ? [...UDF_FIELD_IDS, ...TASK_TEXT_IDS.filter((id) => !/^activity id$/i.test(defs.get(id)?.alias || "")).map((id) => [id, "text", `Text${TASK_TEXT_IDS.indexOf(id) + 1}`])] : UDF_FIELD_IDS;
  const known = new Set(fieldList.filter(([, kind, name]) => kind === "text" || !skip.has(name.toLowerCase())).map(([id]) => id));
  const fields = new Map(); // field id -> Map(task uid -> value)
  for (const t of taskNodes) {
    const uid = val(t, "UID");
    if (!taskIds.has(uid)) continue;
    for (const e of kids(t, "ExtendedAttribute")) {
      const id = val(e, "FieldID"), v = val(e, "Value").trim();
      if (!v || !known.has(id)) continue;
      if (!fields.has(id)) fields.set(id, new Map());
      fields.get(id).set(uid, v);
    }
  }
  const UDFTYPE = [], UDFVALUE = [];
  for (const [id, kind, name] of fieldList) {
    const vals = fields.get(id);
    if (!vals) continue;
    const rows = [];
    for (const [uid, v] of vals) {
      if (kind === "text") { rows.push({ uid, udf_date: "", udf_number: "", udf_text: v }); continue; }
      if (kind === "date" || kind === "finish") { const d = date(v); if (d) rows.push({ uid, udf_date: d, udf_number: "" }); continue; }
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      rows.push({ uid, udf_date: "", udf_number: String(kind === "cost" ? n / 100 : n) });
    }
    if (!rows.length) continue;
    const def = defs.get(id) || {};
    const typeId = `mspdi-${wbs ? "wbs-" : ""}${name.toLowerCase()}`;
    const type = kind === "text" ? "FT_TEXT" : kind === "date" ? "FT_START_DATE" : kind === "finish" ? "FT_END_DATE" : kind === "cost" ? "FT_MONEY" : rows.every((r) => Number.isInteger(Number(r.udf_number))) ? "FT_INT" : "FT_FLOAT_2_DECIMALS";
    UDFTYPE.push({ udf_type_id: typeId, table_name: table, udf_type_name: `user_${wbs ? "wbs_" : ""}${name.toLowerCase()}`, udf_type_label: def.alias || def.name || name, logical_data_type: type });
    for (const r of rows) UDFVALUE.push({ udf_type_id: typeId, fk_id: r.uid, proj_id: "1", udf_date: r.udf_date, udf_number: r.udf_number, udf_text: r.udf_text || "", udf_code_id: "" });
  }
  return UDFTYPE.length ? { UDFTYPE, UDFVALUE } : {};
}

// Start k / Finish k pairs that look like a Project interim plan. Set
// Baseline > Interim plan copies Start and Finish (or a baseline's, or another
// pair's) into Start1..10 / Finish1..10 on every task, or on the selected
// ones, and gives the fields no alias. So a pair is named when neither field
// has an alias, it is set on at least two tasks, at least 90% of the tasks
// holding either field hold both, and the start is never after the finish.
// sameSpan counts the tasks whose pair spans exactly the task's own Start to
// Finish (true of a fresh copy; less so once the schedule has moved). A
// planner's own unnamed "Start1 = permit start, Finish1 = permit finish" pair
// passes the same test: the warning says so, and nothing is dropped unless
// the caller asks (interim: "skip").
const START_IDS = UDF_FIELD_IDS.filter(([, , n]) => /^Start\d/.test(n)).map(([id]) => id);
const FINISH_IDS = UDF_FIELD_IDS.filter(([, , n]) => /^Finish\d/.test(n)).map(([id]) => id);
export function interimPairs(input) {
  const proj = typeof input === "string" ? kid(parseXml(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input), "Project") : input;
  if (!proj) return [];
  const alias = new Map();
  for (const d of kids(kid(proj, "ExtendedAttributes"), "ExtendedAttribute")) alias.set(val(d, "FieldID"), val(d, "Alias"));
  const out = [];
  const tasks = kids(kid(proj, "Tasks"), "Task").map((t) => {
    const ea = new Map();
    for (const e of kids(t, "ExtendedAttribute")) { const v = val(e, "Value"); if (v) ea.set(val(e, "FieldID"), v); }
    return { start: date(val(t, "Start")), finish: date(val(t, "Finish")), ea };
  });
  for (let k = 0; k < 10; k++) {
    const sid = START_IDS[k], fid = FINISH_IDS[k];
    if (alias.get(sid) || alias.get(fid)) continue;
    let either = 0, both = 0, ordered = true, sameSpan = 0;
    for (const t of tasks) {
      const a = date(t.ea.get(sid)), b = date(t.ea.get(fid));
      if (!a && !b) continue;
      either++;
      if (!a || !b) continue;
      both++;
      if (a > b) ordered = false;
      if (t.start && t.finish && a === t.start && b === t.finish) sameSpan++;
      else if (t.start && t.finish) {
        const span = (x, y) => Date.parse(`${y.replace(" ", "T")}Z`) - Date.parse(`${x.replace(" ", "T")}Z`);
        if (span(a, b) === span(t.start, t.finish)) sameSpan++;
      }
    }
    if (both >= 2 && both >= 0.9 * either && ordered) out.push({ k: k + 1, start: `Start${k + 1}`, finish: `Finish${k + 1}`, tasks: both, sameSpan });
  }
  return out;
}

// An XML file (after a BOM and white space) is P6 XML when its root is
// <APIBusinessObjects> (pmxml.mjs), else MSPDI; anything else is read as XER.
export function isXml(text) {
  return /^\uFEFF?\s*</.test(text);
}
export function parseSchedule(text, opts = {}) {
  if (!isXml(text)) return parseXer(text);
  return isPmxml(text) ? parsePmxml(text) : parseMspdi(text, opts);
}
