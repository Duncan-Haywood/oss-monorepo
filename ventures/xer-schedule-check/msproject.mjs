// Primavera P6 XER -> Microsoft Project XML (MSPDI). The file opens in
// Microsoft Project (File > Open, choose the .xml; Project 2007 to 2024 and
// Project Online read it), ProjectLibre, GanttProject and anything else that
// reads MSPDI, so someone who receives an XER and holds Project, not P6, can
// work on the schedule. Nothing is uploaded: this runs in the browser tab.
//
// mspdiText(xer, { projId }) -> { xml, project, counts, warnings }
//
// What is carried, and how P6's terms land in Project's (the inverse of
// mspdi.mjs, which reads MSPDI into P6's tables, so a converted file reads
// straight back into this tool; eval/msproject-check-2026-11-21.md):
// - the WBS becomes summary tasks in P6's order (seq_num, then code); each
//   activity sits under its WBS node with its activity ID in Text1 (named
//   "Activity ID") and, as the WBS field, the WBS path.
// - durations are working hours. Not started: the remaining duration. In
//   progress: actual (actual start to the data date, on the activity's
//   calendar) plus remaining, with Resume at P6's remaining start so the
//   remaining work restarts where P6 has it. Complete: actual start to
//   actual finish. % complete is Project's duration % from those.
// - relationships keep their type and lag (in hours); links to activities in
//   another project are left out and counted.
// - calendars: each P6 calendar's working week and every exception day
//   (holidays and changed days), both as Project 2003 writes them (DayType 0)
//   and as Project 2007+ does (Exceptions), grouped into runs of days.
// - constraints: start on -> must start on, finish on -> must finish on,
//   on or after / on or before -> no earlier / no later than, as late as
//   possible; mandatory start / finish become must start / finish on (and are
//   counted); a secondary finish-on-or-before becomes a deadline.
// - the data date is the status date; the planned (target) dates and planned
//   duration are baseline 0; stored early and late dates and total and free
//   float are written as Project stores them (Project recomputes on open).
// - resources and assignments with units, budgeted, actual and remaining
//   hours and cost. Every task ignores resource calendars, because a P6
//   task-dependent activity runs on its own calendar.
// - level of effort and WBS summary activities have no Project equivalent:
//   they are written as manually scheduled tasks on their P6 dates and
//   counted, so they keep their bars but do not move with the logic.
//
// Scheduling differences that remain are named in the warnings (the lag
// calendar, progress override, expected finish dates, resource-dependent
// activities, the must-finish-by date); steps are not carried and are
// counted. Expenses (PROJCOST) become cost resources and their assignments
// (one cost resource per expense name, the category as its Group). Activity and WBS notebook entries become the task's and
// the summary task's notes, each under its topic's name in brackets, as
// plain text (notebook.mjs; mspdi.mjs and p6xer.mjs read them back). Activity user-defined fields are carried as
// Project's Number, Cost, Date and spare Text fields (udfFields, below), and
// resource user-defined fields as Project's resource Text, Number, Cost and
// Date fields on the resources written. WBS user-defined fields go into the
// same task fields on the summary tasks (a WBS UDF titled like an activity UDF
// of its kind shares its column), so mspdi.mjs and p6xer.mjs read them back
// as WBS UDFs.
//
// Activity codes become Project's spare text fields, Text2 to Text30, one per
// code type, each renamed (Alias) to the code type's name, so a Project user
// can group, filter and sort by Phase, Area or Responsibility as in P6. A
// task's field holds its value's code (the short name P6 shows in the column);
// with { codeNames: true } it holds "code - description". Hierarchical values
// keep their leaf code, as P6 shows them, unless the same leaf code sits
// under two parents (001 under two areas): then the type writes the whole
// path, parent.child, so the two values do not merge in Project. A file with more than 29 code types
// carries the 29 most assigned (P6's order breaks ties) and counts the rest.
// mspdi.mjs reads the fields back as activity codes
// (eval/msproject-codes-2026-11-21.md).
//
// With { outlineCodes: true } the 10 most assigned code types are written as
// Project's Outline Code1..10 instead (outlineCodeFields, below): each with
// its own lookup table holding the type's whole P6 dictionary, parents and
// descriptions included, so Project shows the hierarchy (Area A > 001) and
// the description of every value, and its group-by can roll up a level. Both
// task forms are written, Project 2003's <OutlineCode><ValueID> and Project
// 2007's <ExtendedAttribute> with the value's path and GUID; MPXJ reads each
// (eval/msproject-outline-2026-11-21.md). The other code types stay text
// fields.

import { Calendar } from "./calendar.mjs";
import { parseDate, num } from "./xer.mjs";
import { readCurves, isEven, curveRows, matchContour } from "./curves.mjs";
import { contourSlices } from "./contours.mjs";
import { notebookSections, notesText, memoText, CONVERSION_TOPIC } from "./notebook.mjs";

const DAY = 1440;
const SERIAL_EPOCH_DAY = Date.UTC(1899, 11, 30) / 86400000;
const TEXT1 = "188743731"; // Text1's field ID in Project
// Project's task text fields Text1..Text30 (PjField pjTaskText1..30); the
// same table is in mspdi.mjs, which reads them back
export const TASK_TEXT_IDS = ["188743731", "188743734", "188743737", "188743740", "188743743", "188743746", "188743747", "188743748", "188743749", "188743750",
  ...Array.from({ length: 20 }, (_, k) => String(188743997 + k))];
export const CODE_NAME_SEP = " - ";
// Project's task Outline Code1..10 (PjField ids, checked against MPXJ 16.10's
// FieldTypeHelper; the same table is in mspdi.mjs, which reads them back)
export const TASK_OUTLINE_IDS = Array.from({ length: 10 }, (_, k) => String(188744096 + 2 * k));
// the separators Project's code mask offers; a type takes the first none of
// its codes contains, so a value's path splits back into its levels
export const OUTLINE_SEPS = [".", "-", "+", "/"];

// A fixed GUID for a name, so the same XER always writes the same XML
// (FNV-1a over the parts, four seeds, version 4 and variant bits set).
export function guidOf(...parts) {
  const s = parts.join("\u0001");
  let hex = "";
  for (let seed = 0; seed < 4; seed++) {
    let h = (0x811c9dc5 ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
    hex += (h >>> 0).toString(16).padStart(8, "0");
  }
  const x = hex.split("");
  x[12] = "4";
  x[16] = "89ab"[parseInt(x[16], 16) & 3];
  const j = x.join("").toUpperCase();
  return `${j.slice(0, 8)}-${j.slice(8, 12)}-${j.slice(12, 16)}-${j.slice(16, 20)}-${j.slice(20)}`;
}

const esc = (s) => String(s ?? "")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Names as read: parseXer already turns P6's "" back into one quote.
const nm = (s) => String(s ?? "");
const p2 = (n) => String(n).padStart(2, "0");
// minutes since 1970 (wall clock) -> "2024-03-04T08:00:00"
export function isoDate(min) {
  if (min === null || min === undefined || !Number.isFinite(min)) return "";
  const d = new Date(min * 60000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`;
}
// hours -> "PT8H30M0S" (to the second: work such as 0.16 h is 9 min 36 s)
export function ptHours(h) {
  const sec = Math.round((Number(h) || 0) * 3600);
  const neg = sec < 0 ? "-" : "";
  const a = Math.abs(sec);
  return `PT${neg}${Math.floor(a / 3600)}H${Math.floor((a % 3600) / 60)}M${a % 60}S`;
}
const hhmmss = (m) => (m >= DAY ? "00:00:00" : `${p2(Math.floor(m / 60))}:${p2(m % 60)}:00`);
const r4 = (x) => Math.round(x * 1e4) / 1e4;

const CSTR = { CS_ALAP: 1, CS_MSO: 2, CS_MEO: 3, CS_MSOA: 4, CS_MSOB: 5, CS_MEOA: 6, CS_MEOB: 7, CS_MANDSTART: 2, CS_MANDFIN: 3 };
const LINK = { PR_FF: 0, PR_FS: 1, PR_SF: 2, PR_SS: 3 };
const own = (map, k, dflt) => (Object.hasOwn(map, k) ? map[k] : dflt);

// Pick the project to write: the one asked for, else the one with the most activities.
function pickProject(T, projId) {
  const projects = T.PROJECT || [];
  if (projId) return projects.find((p) => p.proj_id === projId) || null;
  const count = new Map();
  for (const t of T.TASK || []) count.set(t.proj_id, (count.get(t.proj_id) || 0) + 1);
  let best = null;
  for (const p of projects) if (!best || (count.get(p.proj_id) || 0) > (count.get(best.proj_id) || 0)) best = p;
  if (!best && (T.TASK || []).length) best = { proj_id: T.TASK[0].proj_id, proj_short_name: `project ${T.TASK[0].proj_id}` };
  return best;
}

// One calendar as <Calendar>: week days, then exception days grouped into
// runs of consecutive days with the same periods.
function calendarXml(uid, name, cal, out) {
  const wt = (ps) => (ps.length ? `<WorkingTimes>${ps.map(([a, b]) => `<WorkingTime><FromTime>${hhmmss(a)}</FromTime><ToTime>${hhmmss(b)}</ToTime></WorkingTime>`).join("")}</WorkingTimes>` : "");
  const key = (ps) => ps.map(([a, b]) => `${a}-${b}`).join(",");
  const runs = [];
  for (const d of [...cal.exceptions.keys()].sort((a, b) => a - b)) {
    const ps = cal.exceptions.get(d);
    const last = runs[runs.length - 1];
    if (last && last.to === d - 1 && last.key === key(ps)) last.to = d;
    else runs.push({ from: d, to: d, key: key(ps), ps });
  }
  const dayIso = (d, end) => isoDate(d * DAY + (end ? DAY - 1 : 0)).replace(/:00$/, end ? ":59" : ":00");
  out.push(`<Calendar><UID>${uid}</UID><Name>${esc(name)}</Name><IsBaseCalendar>1</IsBaseCalendar><IsBaselineCalendar>0</IsBaselineCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>`);
  // DayType 1 = Sunday ... 7 = Saturday, as in P6
  for (let k = 0; k < 7; k++) {
    const ps = cal.week[k] || [];
    out.push(`<WeekDay><DayType>${k + 1}</DayType><DayWorking>${ps.length ? 1 : 0}</DayWorking>${wt(ps)}</WeekDay>`);
  }
  for (const r of runs) {
    out.push(`<WeekDay><DayType>0</DayType><DayWorking>${r.ps.length ? 1 : 0}</DayWorking><TimePeriod><FromDate>${dayIso(r.from)}</FromDate><ToDate>${dayIso(r.to, true)}</ToDate></TimePeriod>${wt(r.ps)}</WeekDay>`);
  }
  out.push("</WeekDays>");
  if (runs.length) {
    out.push("<Exceptions>");
    for (const r of runs) {
      const n = r.to - r.from + 1;
      out.push(`<Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>${dayIso(r.from)}</FromDate><ToDate>${dayIso(r.to, true)}</ToDate></TimePeriod><Occurrences>${n}</Occurrences><Name>${r.ps.length ? "Changed day" : "Non-working"}</Name><Type>1</Type><DayWorking>${r.ps.length ? 1 : 0}</DayWorking>${wt(r.ps)}</Exception>`);
    }
    out.push("</Exceptions>");
  }
  out.push("</Calendar>");
}

export function mspdiText(xer, { projId = null, codeNames = false, outlineCodes = false, allResources = false } = {}) {
  const T = xer.tables || {};
  const warnings = [];
  const proj = pickProject(T, projId);
  if (!proj) throw new Error(projId ? `project ${projId} is not in the file` : "the file has no project to convert");
  const pid = proj.proj_id;
  const others = (T.PROJECT || []).filter((p) => p.proj_id !== pid);
  if (others.length) warnings.push(`the file holds ${others.length + 1} projects; ${proj.proj_short_name || pid} is converted (choose another with the project picker or --project)`);

  const tasks = (T.TASK || []).filter((t) => t.proj_id === pid && t.task_id);
  const opts = (T.SCHEDOPTIONS || []).find((o) => o.proj_id === pid) || (T.SCHEDOPTIONS || [])[0] || {};
  const dataDate = parseDate(proj.last_recalc_date) ?? parseDate(proj.plan_start_date);

  // calendars: every one a task, the project or a resource uses
  const calRows = new Map((T.CALENDAR || []).map((c) => [c.clndr_id, c]));
  const cals = new Map();
  const calOf = (id) => {
    if (cals.has(id)) return cals.get(id);
    const row = calRows.get(id);
    let cal = null;
    if (row && (row.clndr_data || "").trim()) {
      try { cal = Calendar.fromXer(row); } catch (e) { warnings.push(`calendar ${id} (${row.clndr_name || "no name"}): ${e.message}; written as Monday to Friday, 8 h`); }
    }
    if (row && !cal) cal = Calendar.weekdays(num(row.day_hr_cnt) || 8, id, row.clndr_name || "");
    cals.set(id, cal);
    return cal;
  };
  const defaultRow = (T.CALENDAR || []).find((c) => c.default_flag === "Y");
  const projCalId = calRows.has(proj.clndr_id) ? proj.clndr_id : defaultRow ? defaultRow.clndr_id : (T.CALENDAR || [])[0]?.clndr_id;
  const projCal = projCalId ? calOf(projCalId) : Calendar.weekdays(8, "standard", "Standard");
  const calUid = new Map();
  const useCal = (id) => {
    if (!id || !calRows.has(id)) id = projCalId;
    if (!id) return { uid: "1", cal: projCal };
    if (!calUid.has(id)) calUid.set(id, String(calUid.size + 1));
    return { uid: calUid.get(id), cal: calOf(id) };
  };
  if (projCalId) useCal(projCalId);
  const hoursPerDay = num(calRows.get(projCalId)?.day_hr_cnt) || projCal.hoursPerDay || 8;

  // WBS tree in P6's order
  const wbsRows = (T.PROJWBS || []).filter((w) => w.proj_id === pid);
  const wbsById = new Map(wbsRows.map((w) => [w.wbs_id, w]));
  let root = null;
  const kids = new Map();
  for (const w of wbsRows) {
    if (w.proj_node_flag === "Y" && !root) { root = w.wbs_id; continue; }
    const par = wbsById.has(w.parent_wbs_id) && w.parent_wbs_id !== root ? w.parent_wbs_id : "";
    if (!kids.has(par)) kids.set(par, []);
    kids.get(par).push(w);
  }
  const seq = (w) => num(w.seq_num) ?? 0;
  for (const list of kids.values()) list.sort((a, b) => seq(a) - seq(b) || String(a.wbs_short_name || "").localeCompare(String(b.wbs_short_name || "")) || (a.wbs_id < b.wbs_id ? -1 : 1));
  const wbsCode = new Map();
  const codeOf = (w, seen = new Set()) => {
    if (wbsCode.has(w.wbs_id)) return wbsCode.get(w.wbs_id);
    seen.add(w.wbs_id);
    const par = wbsById.get(w.parent_wbs_id);
    const pre = par && par.wbs_id !== root && !seen.has(par.wbs_id) ? codeOf(par, seen) + "." : "";
    const c = pre + (w.wbs_short_name || w.wbs_id);
    wbsCode.set(w.wbs_id, c);
    return c;
  };

  // activities grouped by WBS node, each list by start then activity ID
  const startOf = (t) => parseDate(t.act_start_date) ?? parseDate(t.restart_date) ?? parseDate(t.early_start_date) ?? parseDate(t.target_start_date) ?? dataDate ?? 0;
  const byWbs = new Map();
  for (const t of tasks) {
    const key = t.wbs_id && wbsById.has(t.wbs_id) && t.wbs_id !== root ? t.wbs_id : "";
    if (!byWbs.has(key)) byWbs.set(key, []);
    byWbs.get(key).push(t);
  }
  for (const list of byWbs.values()) list.sort((a, b) => startOf(a) - startOf(b) || String(a.task_code).localeCompare(String(b.task_code)));

  // the outline: [{ kind, row, level }], depth first
  const outline = [];
  const visited = new Set();
  const walk = (key, level) => {
    for (const t of byWbs.get(key) || []) outline.push({ kind: "task", row: t, level });
    for (const w of kids.get(key) || []) {
      if (visited.has(w.wbs_id)) continue;
      visited.add(w.wbs_id);
      outline.push({ kind: "wbs", row: w, level });
      walk(w.wbs_id, level + 1);
    }
  };
  walk("", 1);
  // a WBS loop or a node whose parent is missing would never be reached
  for (const w of wbsRows) if (!visited.has(w.wbs_id) && w.wbs_id !== root) { visited.add(w.wbs_id); outline.push({ kind: "wbs", row: w, level: 1 }); walk(w.wbs_id, 2); }

  // UIDs: 0 is the project summary; then in outline order
  const taskUid = new Map();
  let nextUid = 1;
  for (const o of outline) { o.uid = nextUid++; if (o.kind === "task") taskUid.set(o.row.task_id, o.uid); }
  // outline numbers
  const counters = [];
  for (const o of outline) {
    counters.length = o.level;
    counters[o.level - 1] = (counters[o.level - 1] || 0) + 1;
    o.outlineNumber = counters.join(".");
  }

  // relationships into each task, within this project
  const preds = new Map();
  let crossProject = 0, lagLinks = 0, lagCalDiffers = 0;
  const taskRow = new Map(tasks.map((t) => [t.task_id, t]));
  const isSpanRow = (t) => t && (t.task_type === "TT_LOE" || t.task_type === "TT_WBS");
  const spanNotes = new Map(); // LOE / WBS summary task_id -> ["SS from A100", ...]
  let spanLinks = 0;
  const LTXT = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
  const note = (id, s) => { if (!spanNotes.has(id)) spanNotes.set(id, []); spanNotes.get(id).push(s); };
  for (const r of T.TASKPRED || []) {
    if (!taskRow.has(r.task_id)) continue;
    if (!taskRow.has(r.pred_task_id)) { crossProject++; continue; }
    const succ = taskRow.get(r.task_id), pred = taskRow.get(r.pred_task_id);
    if (isSpanRow(succ) || isSpanRow(pred)) {
      // Project has no level of effort: a manual task's links would drive its
      // successors from a bar that never moves, which P6 never does. The link
      // is written into the task's notes instead, so it is not lost.
      const lag = num(r.lag_hr_cnt) || 0;
      const lagTxt = lag ? `${lag > 0 ? "+" : ""}${lag}h` : "";
      if (isSpanRow(succ)) note(succ.task_id, `${own(LTXT, r.pred_type, r.pred_type)}${lagTxt} from ${pred.task_code}`);
      if (isSpanRow(pred)) note(pred.task_id, `${own(LTXT, r.pred_type, r.pred_type)}${lagTxt} to ${succ.task_code}`);
      spanLinks++;
      continue;
    }
    if (!preds.has(r.task_id)) preds.set(r.task_id, []);
    preds.get(r.task_id).push(r);
    const lag = num(r.lag_hr_cnt) || 0;
    if (lag) {
      lagLinks++;
      const sCal = taskRow.get(r.task_id).clndr_id, pCal = taskRow.get(r.pred_task_id).clndr_id;
      if (sCal !== pCal) lagCalDiffers++;
    }
  }

  // activity codes -> Text2..Text30, one field per code type; when codes and
  // text UDFs together need more than the 29 fields, the ones that fill the
  // most activities get them (a code type wins a tie)
  const textRoom = TASK_TEXT_IDS.length - 1;
  // with outlineCodes, the most assigned code types go to Outline Code1..10 first
  const ocf = outlineCodes ? outlineCodeFields(T, taskRow, { projId: pid }) : { fields: [], typeIds: new Set(), written: 0, warnings: [] };
  const skip = ocf.typeIds, takenAliases = ocf.fields.map((f) => f.alias);
  const codeSizes = activityCodeFields(T, taskRow, codeNames, { room: Infinity, skip, takenAliases }).fields.map((f) => f.values.size);
  const textSizes = udfFields(T, taskRow, { textFrom: 1 }).fields.filter((f) => f.kind === "text").map((f) => f.values.size);
  let codeRoom = textRoom;
  if (codeSizes.length + textSizes.length > textRoom) {
    const pool = [...codeSizes.map((n) => ({ n, code: 1 })), ...textSizes.map((n) => ({ n, code: 0 }))].sort((a, b) => b.n - a.n || b.code - a.code);
    codeRoom = Math.min(codeSizes.length, pool.slice(0, textRoom).filter((x) => x.code).length);
  }
  const codeFields = activityCodeFields(T, taskRow, codeNames, { room: codeRoom, shared: Math.min(textSizes.length, textRoom - codeRoom), skip, takenAliases });
  // activity user-defined fields -> Number, Cost, Date and the free Text fields
  const udf = udfFields(T, taskRow, { textFrom: codeFields.fields.length + 1, takenAliases: [...takenAliases, ...codeFields.fields.map((f) => f.alias)] });
  const extFields = [...codeFields.fields, ...udf.fields];
  // WBS user-defined fields -> the same task fields on the summary tasks: a
  // WBS UDF titled like an activity UDF of its kind shares that field (one
  // column in Project), the rest take the fields still free
  const wbsRow = new Map(outline.filter((o) => o.kind === "wbs").map((o) => [o.row.wbs_id, o.uid]));
  const wbsUdf = udfFields(T, wbsRow, { table: "PROJWBS", textFrom: 1, usedIds: new Set(extFields.map((f) => f.fieldId)), shareWith: udf.fields, ownRows: new Set((T.PROJWBS || []).filter((w) => w.proj_id === pid).map((w) => w.wbs_id)), takenAliases: [...takenAliases, ...extFields.map((f) => f.alias)] });
  // notebooks: activity and WBS notebook entries as task notes (notebook.mjs)
  const notebooks = notebookSections(T);
  const wbsNotes = (wbsId) => {
    const sec = notebooks.wbs.get(wbsId);
    if (!sec) return "";
    counts.notebookWbs++; counts.notebookWbsEntries += sec.length;
    return `<Notes>${esc(notesText(sec))}</Notes>`;
  };
  const wbsXml = (wbsId) => wbsUdf.fields.map((f) => (f.values.has(wbsId) ? `<ExtendedAttribute><FieldID>${f.fieldId}</FieldID><Value>${esc(f.values.get(wbsId))}</Value></ExtendedAttribute>` : "")).join("");
  const codeXml = (taskId) => ocf.fields.map((f) => (f.task.has(taskId) ? `<ExtendedAttribute><FieldID>${f.fieldId}</FieldID><Value>${esc(f.task.get(taskId).path)}</Value><ValueGUID>${f.task.get(taskId).guid}</ValueGUID></ExtendedAttribute>` : "")).join("")
    + extFields.map((f) => (f.values.has(taskId) ? `<ExtendedAttribute><FieldID>${f.fieldId}</FieldID><Value>${esc(f.values.get(taskId))}</Value></ExtendedAttribute>` : "")).join("");
  // Project 2003's form: the value's ID in the field's lookup table (after Baseline, as the schema orders it)
  const outlineXml = (taskId) => ocf.fields.map((f) => (f.task.has(taskId) ? `<OutlineCode><FieldID>${f.fieldId}</FieldID><ValueID>${f.task.get(taskId).vid}</ValueID></OutlineCode>` : "")).join("");

  // tasks
  const counts = { activities: tasks.length, wbs: outline.filter((o) => o.kind === "wbs").length, links: 0, calendars: 0, resources: 0, assignments: 0, manual: 0, mandatory: 0, deadlines: 0, external: 0, crossProject, notebookTasks: 0, notebookEntries: 0, notebookWbs: 0, notebookWbsEntries: 0, rsrcNotes: 0, rsrcGroups: 0 };
  let rsrcDependent = 0, expected = 0, secondaryDropped = 0, startMilestones = 0;
  const span = new Map(); // uid -> [start, finish] for summary roll-up
  const taskCal = new Map(); // uid -> the task's Calendar, for curved spreads
  const taskXml = new Map();
  for (const o of outline) {
    if (o.kind !== "task") continue;
    const t = o.row;
    const { uid: cUid, cal } = useCal(t.clndr_id);
    taskCal.set(o.uid, cal);
    const status = t.status_code || "TK_NotStart";
    const isMile = t.task_type === "TT_Mile" || t.task_type === "TT_FinMile";
    const isSpan = t.task_type === "TT_LOE" || t.task_type === "TT_WBS";
    if (t.task_type === "TT_Rsrc") rsrcDependent++;
    if (t.expect_end_date) expected++;
    const as = parseDate(t.act_start_date), af = parseDate(t.act_end_date);
    const rs = parseDate(t.restart_date) ?? parseDate(t.early_start_date);
    const rf = parseDate(t.reend_date) ?? parseDate(t.early_end_date);
    const remainH = isMile ? 0 : Math.max(0, num(t.remain_drtn_hr_cnt) ?? num(t.target_drtn_hr_cnt) ?? 0);
    let start, finish, durH, actualH = 0, remH, pct;
    const work = (a, b) => (a !== null && b !== null && b > a ? cal.workBetween(a, b) / 60 : 0);
    if (status === "TK_Complete" && as !== null) {
      start = as; finish = af ?? as;
      durH = isMile ? 0 : work(as, finish);
      actualH = durH; remH = 0; pct = 100;
    } else if (status === "TK_Active" && as !== null) {
      start = as;
      const stop = dataDate !== null && dataDate > as ? dataDate : as;
      actualH = isMile ? 0 : work(as, stop);
      remH = remainH;
      durH = actualH + remH;
      finish = rf ?? (rs !== null ? cal.addWork(rs, remH * 60) : cal.addWork(stop, remH * 60));
      pct = durH > 0 ? Math.min(99, Math.floor((actualH / durH) * 100)) : 0;
    } else {
      remH = remainH; durH = remH; pct = 0;
      start = rs ?? (dataDate !== null ? cal.nextStart(dataDate) : 0);
      finish = rf ?? cal.addWork(start, durH * 60);
    }
    if (isSpan && !(status === "TK_Complete")) { durH = work(start, finish); remH = status === "TK_Active" ? Math.max(0, durH - actualH) : durH; }
    if (isMile && (t.task_type === "TT_Mile") && (preds.get(t.task_id) || []).length && status === "TK_NotStart") startMilestones++;
    span.set(o.uid, [start, finish]);
    let cType = own(CSTR, t.cstr_type, 0);
    let cDate = cType && cType !== 1 ? parseDate(t.cstr_date) : null;
    if (cType && cType !== 1 && cDate === null) cType = 0;
    if (t.cstr_type === "CS_MANDSTART" || t.cstr_type === "CS_MANDFIN") counts.mandatory++;
    // external dates (from links to projects not in the file): P6 holds the
    // early start no earlier and the late finish no later than them; Project
    // does the same with a start-no-earlier-than and a deadline
    const extES = parseDate(t.external_early_start_date), extLF = parseDate(t.external_late_end_date);
    const extStart = extES !== null && !cType && status === "TK_NotStart";
    if (extStart) { cType = 4; cDate = extES; }
    let deadline = extLF !== null && status !== "TK_Complete" ? extLF : null;
    if (extStart || deadline !== null) counts.external++;
    if (t.cstr_type2) {
      if (t.cstr_type2 === "CS_MEOB" && parseDate(t.cstr_date2) !== null) { deadline = deadline === null ? parseDate(t.cstr_date2) : Math.min(deadline, parseDate(t.cstr_date2)); counts.deadlines++; }
      else secondaryDropped++;
    }
    const tf = num(t.total_float_hr_cnt), ff = num(t.free_float_hr_cnt);
    const L = [];
    L.push(`<Task><UID>${o.uid}</UID><ID>${o.uid}</ID><Name>${esc(nm(t.task_name))}</Name><Active>1</Active><Manual>${isSpan ? 1 : 0}</Manual><Type>1</Type><IsNull>0</IsNull>`);
    L.push(`<WBS>${esc(t.wbs_id && wbsById.has(t.wbs_id) && t.wbs_id !== root ? codeOf(wbsById.get(t.wbs_id)) : "")}</WBS><OutlineNumber>${o.outlineNumber}</OutlineNumber><OutlineLevel>${o.level}</OutlineLevel><Priority>500</Priority>`);
    L.push(`<Start>${isoDate(start)}</Start><Finish>${isoDate(finish)}</Finish><Duration>${ptHours(durH)}</Duration>`);
    if (isSpan) { L.push(`<ManualStart>${isoDate(start)}</ManualStart><ManualFinish>${isoDate(finish)}</ManualFinish><ManualDuration>${ptHours(durH)}</ManualDuration>`); counts.manual++; }
    L.push("<DurationFormat>7</DurationFormat>");
    if (status === "TK_Active" && as !== null) {
      const resume = rs ?? dataDate;
      L.push(`<Stop>${isoDate(dataDate ?? as)}</Stop><Resume>${isoDate(resume)}</Resume><ResumeValid>1</ResumeValid>`);
    }
    L.push(`<EffortDriven>0</EffortDriven><Milestone>${isMile ? 1 : 0}</Milestone><Summary>0</Summary>`);
    const es = parseDate(t.early_start_date), ef = parseDate(t.early_end_date), ls = parseDate(t.late_start_date), lf = parseDate(t.late_end_date);
    if (es !== null) L.push(`<EarlyStart>${isoDate(es)}</EarlyStart>`);
    if (ef !== null) L.push(`<EarlyFinish>${isoDate(ef)}</EarlyFinish>`);
    if (ls !== null) L.push(`<LateStart>${isoDate(ls)}</LateStart>`);
    if (lf !== null) L.push(`<LateFinish>${isoDate(lf)}</LateFinish>`);
    if (ff !== null) L.push(`<FreeSlack>${Math.round(ff * 600)}</FreeSlack>`);
    if (tf !== null) L.push(`<TotalSlack>${Math.round(tf * 600)}</TotalSlack>`);
    L.push(`<PercentComplete>${pct}</PercentComplete>`);
    if (as !== null && status !== "TK_NotStart") L.push(`<ActualStart>${isoDate(as)}</ActualStart>`);
    if (af !== null && status === "TK_Complete") L.push(`<ActualFinish>${isoDate(af)}</ActualFinish>`);
    L.push(`<ActualDuration>${ptHours(actualH)}</ActualDuration><RemainingDuration>${ptHours(remH)}</RemainingDuration>`);
    L.push(`<ConstraintType>${cType}</ConstraintType><CalendarUID>${cUid}</CalendarUID>`);
    if (cDate !== null) L.push(`<ConstraintDate>${isoDate(cDate)}</ConstraintDate>`);
    if (deadline !== null) L.push(`<Deadline>${isoDate(deadline)}</Deadline>`);
    L.push("<IgnoreResourceCalendar>1</IgnoreResourceCalendar>");
    {
      // the activity's notebook entries, topic by topic (notebook.mjs); a
      // level of effort or WBS summary activity adds this tool's own note
      const sec = [...(notebooks.task.get(t.task_id) || [])];
      if (sec.length) { counts.notebookTasks++; counts.notebookEntries += sec.length; }
      if (isSpan) sec.push({ topic: CONVERSION_TOPIC, text: `P6 ${t.task_type === "TT_LOE" ? "level of effort" : "WBS summary"} activity ${t.task_code}${spanNotes.has(t.task_id) ? `; its P6 relationships: ${spanNotes.get(t.task_id).join(", ")}` : ""}` });
      if (sec.length) L.push(`<Notes>${esc(notesText(sec))}</Notes>`);
    }
    if (t.phys_complete_pct !== undefined && t.phys_complete_pct !== "") L.push(`<PhysicalPercentComplete>${Math.round(num(t.phys_complete_pct) || 0)}</PhysicalPercentComplete>`);
    for (const r of preds.get(t.task_id) || []) {
      const lag = num(r.lag_hr_cnt) || 0;
      L.push(`<PredecessorLink><PredecessorUID>${taskUid.get(r.pred_task_id)}</PredecessorUID><Type>${own(LINK, r.pred_type, 1)}</Type><CrossProject>0</CrossProject><LinkLag>${Math.round(lag * 600)}</LinkLag><LagFormat>${lag % hoursPerDay === 0 ? 7 : 5}</LagFormat></PredecessorLink>`);
      counts.links++;
    }
    L.push(`<ExtendedAttribute><FieldID>${TEXT1}</FieldID><Value>${esc(t.task_code)}</Value></ExtendedAttribute>${codeXml(t.task_id)}`);
    const bs = parseDate(t.target_start_date), bf = parseDate(t.target_end_date);
    if (bs !== null && bf !== null) L.push(`<Baseline><Number>0</Number><Start>${isoDate(bs)}</Start><Finish>${isoDate(bf)}</Finish><Duration>${ptHours(isMile ? 0 : num(t.target_drtn_hr_cnt) ?? 0)}</Duration><DurationFormat>7</DurationFormat></Baseline>`);
    L.push(outlineXml(t.task_id));
    L.push("</Task>");
    taskXml.set(o.uid, L.join(""));
  }

  // summary roll-up, bottom up
  const summarySpan = new Map();
  for (let k = outline.length - 1; k >= 0; k--) {
    const o = outline[k];
    if (o.kind !== "wbs") continue;
    let a = Infinity, b = -Infinity;
    for (let j = k + 1; j < outline.length && outline[j].level > o.level; j++) {
      const s = outline[j].kind === "task" ? span.get(outline[j].uid) : summarySpan.get(outline[j].uid);
      if (s) { a = Math.min(a, s[0]); b = Math.max(b, s[1]); }
    }
    if (a <= b) summarySpan.set(o.uid, [a, b]);
  }
  let pa = Infinity, pb = -Infinity;
  for (const s of span.values()) { pa = Math.min(pa, s[0]); pb = Math.max(pb, s[1]); }
  const projStart = parseDate(proj.plan_start_date) ?? (Number.isFinite(pa) ? pa : dataDate ?? 0);
  const projFinish = Number.isFinite(pb) ? pb : parseDate(proj.scd_end_date) ?? projStart;

  const body = [];
  body.push(`<Task><UID>0</UID><ID>0</ID><Name>${esc(nm(proj.proj_short_name || pid))}</Name><Active>1</Active><Manual>0</Manual><Type>1</Type><IsNull>0</IsNull><WBS>0</WBS><OutlineNumber>0</OutlineNumber><OutlineLevel>0</OutlineLevel><Start>${isoDate(Math.min(projStart, Number.isFinite(pa) ? pa : projStart))}</Start><Finish>${isoDate(projFinish)}</Finish><Summary>1</Summary><CalendarUID>-1</CalendarUID>${root ? wbsNotes(root) : ""}</Task>`);
  for (const o of outline) {
    if (o.kind === "task") { body.push(taskXml.get(o.uid)); continue; }
    const w = o.row;
    const s = summarySpan.get(o.uid) || [projStart, projStart];
    body.push(`<Task><UID>${o.uid}</UID><ID>${o.uid}</ID><Name>${esc(nm(w.wbs_name || w.wbs_short_name))}</Name><Active>1</Active><Manual>0</Manual><Type>1</Type><IsNull>0</IsNull><WBS>${esc(codeOf(w))}</WBS><OutlineNumber>${o.outlineNumber}</OutlineNumber><OutlineLevel>${o.level}</OutlineLevel><Start>${isoDate(s[0])}</Start><Finish>${isoDate(s[1])}</Finish><Summary>1</Summary>${wbsNotes(w.wbs_id)}<ExtendedAttribute><FieldID>${TEXT1}</FieldID><Value>${esc(w.wbs_short_name)}</Value></ExtendedAttribute>${wbsXml(w.wbs_id)}</Task>`);
  }

  // resources and assignments
  const assigns = (T.TASKRSRC || []).filter((a) => taskUid.has(a.task_id));
  const usedRsrc = new Set(assigns.map((a) => a.rsrc_id));
  const rsrcUid = new Map();
  const res = [];
  // By default only the resources this project's activities use are written,
  // as P6 shows them in the project's Resource Assignments. With
  // { allResources: true } every RSRC row goes in (the file's whole resource
  // dictionary), so resources with no assignment keep their notes, calendar
  // and fields on a Project -> XER -> Project trip (p6xer.mjs writes every
  // Project resource to RSRC, assigned or not).
  let unassigned = 0;
  // P6's resource hierarchy (RSRC.parent_rsrc_id: a crew under a trade under
  // "Labor") as Project's resource Group: the parents' resource IDs from the
  // top down, joined by "/" ("LAB/CARP"), so Project can group and filter by
  // it. Project has no resource outline, and the parents are seldom assigned
  // (0 of 33 parent resources in the six public files), so without this the
  // tree was lost. p6xer.mjs reads the path back into parent resources.
  const rsrcById = new Map((T.RSRC || []).map((r) => [r.rsrc_id, r]));
  const groupOf = (r) => {
    const path = [];
    const seen = new Set([r.rsrc_id]);
    for (let p = rsrcById.get(r.parent_rsrc_id); p && !seen.has(p.rsrc_id); p = rsrcById.get(p.parent_rsrc_id)) {
      seen.add(p.rsrc_id);
      path.unshift(p.rsrc_short_name || p.rsrc_name || p.rsrc_id);
    }
    return path.join("/");
  };
  for (const r of T.RSRC || []) {
    if (!usedRsrc.has(r.rsrc_id)) {
      if (!allResources || !r.rsrc_id) continue;
      unassigned++;
    }
    const uid = rsrcUid.size + 1;
    rsrcUid.set(r.rsrc_id, uid);
    const material = r.rsrc_type === "RT_Mat";
    const cal = !material && calRows.has(r.clndr_id) ? useCal(r.clndr_id).uid : null;
    // the resource's notes (RSRC.rsrc_notes, P6's rich text) as Project's
    // resource Notes, plain text (notebook.mjs's memoText); Notes follows
    // CalendarUID and comes before ExtendedAttribute in Project's schema
    const rnote = memoText(r.rsrc_notes);
    if (rnote) counts.rsrcNotes++;
    const group = groupOf(r);
    if (group) counts.rsrcGroups++;
    res.push({ id: r.rsrc_id, head: `<Resource><UID>${uid}</UID><ID>${uid}</ID><Name>${esc(nm(r.rsrc_name || r.rsrc_short_name || r.rsrc_id))}</Name><Type>${material ? 0 : 1}</Type><IsNull>0</IsNull><Initials>${esc(r.rsrc_short_name || "")}</Initials>${material ? `<MaterialLabel>${esc(r.unit_of_measure || "")}</MaterialLabel>` : ""}${group ? `<Group>${esc(group)}</Group>` : ""}${cal ? `<CalendarUID>${cal}</CalendarUID>` : ""}${rnote ? `<Notes>${esc(rnote)}</Notes>` : ""}` });
  }
  // resource user-defined fields -> Project's resource custom fields, on the
  // resources written (each resource's ExtendedAttribute after its calendar)
  const rsrcUdf = udfFields(T, rsrcUid, { table: "RSRC" });
  const resXml = res.map((r) => `${r.head}${rsrcUdf.fields.map((f) => (f.values.has(r.id) ? `<ExtendedAttribute><FieldID>${f.fieldId}</FieldID><Value>${esc(f.values.get(r.id))}</Value></ExtendedAttribute>` : "")).join("")}</Resource>`);
  const asg = [];
  let unknownRsrc = 0;
  // P6 resource curves (TASKRSRC.curv_id, RSRCCURVDATA) as Project's
  // timephased work. Project has no curve table: its built-in contours are
  // fixed shapes of their own (contours.mjs), so an assignment's spread is
  // written out as rows of remaining work (TimephasedData Type 1) cut by
  // curves.mjs's curveRows, with WorkContour 8 ("contoured", Project's word
  // for an edited spread). A curve that is one of Project's contours (as
  // p6xer.mjs writes them, "MS Project Back Loaded") goes back as that
  // contour number, with the same rows. Only assignments with no actual
  // units are curved: P6 re-fits a started assignment's curve to what is
  // left in a way no public file shows, so those stay even, as in evm.mjs.
  const curves = readCurves(xer);
  let curved = 0, curvedStarted = 0, curveMissing = 0;
  const curveNames = new Map();
  for (const a of assigns) {
    const ru = rsrcUid.get(a.rsrc_id);
    if (!ru) { unknownRsrc++; continue; }
    const actQ = (num(a.act_reg_qty) || 0) + (num(a.act_ot_qty) || 0);
    const remQ = num(a.remain_qty) ?? 0;
    const tgtQ = num(a.target_qty) ?? actQ + remQ;
    // P6's at-completion units are actual plus remaining (a finished
    // assignment with no actuals has none); the budget only stands in when
    // the file stores no remaining units at all
    const blank = (v) => v === undefined || v === "";
    const atComplete = blank(a.remain_qty) && !actQ ? tgtQ : actQ + remQ;
    const actC = (num(a.act_reg_cost) || 0) + (num(a.act_ot_cost) || 0);
    const remC = num(a.remain_cost) ?? 0;
    const cost = blank(a.remain_cost) && !actC ? num(a.target_cost) || 0 : actC + remC;
    const units = num(a.target_qty_per_hr) ?? num(a.remain_qty_per_hr) ?? 1;
    const pctW = atComplete > 0 ? Math.round((actQ / atComplete) * 100) : 0;
    const s = span.get(taskUid.get(a.task_id));
    const uid = asg.length + 1;
    let contour = "", tp = "";
    if (a.curv_id) {
      const c = curves.get(a.curv_id);
      if (!c) curveMissing++;
      else if (!isEven(c.slices)) {
        if (actQ > 0) curvedStarted++;
        else if (s && remQ > 0 && s[1] > s[0]) {
          const rows = curveRows(taskCal.get(taskUid.get(a.task_id)), s[0], s[1], remQ, c.slices);
          if (rows.length) {
            curved++;
            curveNames.set(c.name, (curveNames.get(c.name) || 0) + 1);
            contour = `<WorkContour>${matchContour(c.slices, contourSlices) || 8}</WorkContour>`;
            // each row's work to the second, rounded on the running total so
            // the rows still sum to the remaining work
            let cum = 0, done = 0;
            tp = rows.map((r) => {
              cum += r.work;
              const sec = Math.round(cum * 3600) - done;
              done += sec;
              return `<TimephasedData><Type>1</Type><UID>${uid}</UID><Start>${isoDate(r.start)}</Start><Finish>${isoDate(r.finish)}</Finish><Unit>${r.finish - r.start >= DAY ? 2 : 1}</Unit>${sec > 0 ? `<Value>${ptHours(sec / 3600)}</Value>` : ""}</TimephasedData>`;
            }).join("");
          }
        }
      }
    }
    asg.push(`<Assignment><UID>${uid}</UID><TaskUID>${taskUid.get(a.task_id)}</TaskUID><ResourceUID>${ru}</ResourceUID><PercentWorkComplete>${pctW}</PercentWorkComplete><ActualCost>${Math.round(actC * 100)}</ActualCost><ActualWork>${ptHours(actQ)}</ActualWork><Cost>${Math.round(cost * 100)}</Cost>${s ? `<Finish>${isoDate(s[1])}</Finish>` : ""}<RemainingCost>${Math.round(remC * 100)}</RemainingCost><RemainingWork>${ptHours(remQ)}</RemainingWork>${s ? `<Start>${isoDate(s[0])}</Start>` : ""}<Units>${r4(units)}</Units><Work>${ptHours(atComplete)}</Work>${contour}<Baseline><Number>0</Number><Work>${ptHours(tgtQ)}</Work><Cost>${Math.round((num(a.target_cost) || 0) * 100)}</Cost></Baseline>${tp}</Assignment>`);
  }
  // expenses (PROJCOST) -> cost resources. Project has no expense item; a
  // cost on a task with no work is a cost resource's assignment. So each
  // expense name becomes a cost resource (Type 2), its Group the expense's
  // cost category (COSTTYPE) and its accrual the expense's (CL_Start 1,
  // CL_End 2, CL_Uniform 3 prorated), and each expense an assignment of it:
  // cost actual plus remaining (the budget when the file stores neither),
  // the budget as baseline cost, and the vendor, PO number, quantity and
  // description in the assignment's notes, as lines p6xer.mjs reads back.
  // Category and accrual belong to the resource in Project, so a name used
  // with a second category or accrual gets a resource of its own, named with
  // them ("Rebar (Subcontract, at start)"), and its assignments carry the
  // expense's own name in an "Expense: " line. Project allows one assignment
  // of a resource per task, so two expenses of one name, category and
  // accrual on one activity are added together (counted).
  const expenses = (T.PROJCOST || []).filter((c) => taskUid.has(c.task_id));
  const costCat = new Map((T.COSTTYPE || []).map((c) => [c.cost_type_id, c.cost_type || ""]));
  const ACCRUE = { CL_Start: 1, CL_End: 2, CL_Uniform: 3 };
  const takenNames = new Set(res.map((r) => (/<Name>(.*?)<\/Name>/.exec(r.head)?.[1] || "").toLowerCase()));
  const costRes = new Map(); // expense name|category|accrual -> { uid, name, group, accrue, renamed }
  const firstOf = new Map(); // expense name -> its first cost resource
  const expAsg = new Map(); // task uid|resource uid -> summed expense
  const ACCRUE_WORD = { 1: "at start", 2: "at end", 3: "prorated" };
  let expMerged = 0, expVariants = 0;
  for (const c of expenses) {
    const ename = (c.cost_name || "").trim() || "Expense";
    const group = costCat.get(c.cost_type_id) || "";
    const accrue = own(ACCRUE, c.cost_load_type, 3);
    const key = `${ename}\u0000${group}\u0000${accrue}`;
    let r = costRes.get(key);
    if (!r) {
      const first = firstOf.get(ename);
      let base = ename;
      if (first) {
        expVariants++;
        base = `${ename} (${[group !== first.group ? group || "no category" : "", accrue !== first.accrue ? ACCRUE_WORD[accrue] : ""].filter(Boolean).join(", ")})`;
      }
      let name = nm(base);
      for (let k = 2; takenNames.has(esc(name).toLowerCase()); k++) name = nm(`${base} (expense${k > 2 ? ` ${k - 1}` : ""})`);
      takenNames.add(esc(name).toLowerCase());
      r = { uid: res.length + costRes.size + 1, name, group, accrue, renamed: name !== ename ? ename : "" };
      costRes.set(key, r);
      if (!first) firstOf.set(ename, r);
    }
    const act = num(c.act_cost) || 0, rem = num(c.remain_cost);
    const atc = (rem === null || rem === undefined) && !act ? num(c.target_cost) || 0 : act + (rem || 0);
    const notes = [r.renamed ? `Expense: ${r.renamed}` : "", c.vendor_name ? `Vendor: ${c.vendor_name}` : "", c.po_number ? `PO: ${c.po_number}` : "", num(c.target_qty) && (num(c.target_qty) !== 1 || c.qty_name) ? `Quantity: ${c.target_qty}${c.qty_name ? ` ${c.qty_name}` : ""}` : "", c.cost_descr || ""].filter(Boolean);
    const k = `${taskUid.get(c.task_id)}|${r.uid}`;
    const e = expAsg.get(k);
    if (e) { expMerged++; e.act += act; e.rem += rem || 0; e.atc += atc; e.budget += num(c.target_cost) || 0; e.notes.push(...notes.filter((x) => !e.notes.includes(x))); continue; }
    expAsg.set(k, { task: taskUid.get(c.task_id), ru: r.uid, act, rem: rem || 0, atc, budget: num(c.target_cost) || 0, notes });
  }
  for (const r of costRes.values()) resXml.push(`<Resource><UID>${r.uid}</UID><ID>${r.uid}</ID><Name>${esc(r.name)}</Name><Type>2</Type><IsNull>0</IsNull>${r.group ? `<Group>${esc(r.group)}</Group>` : ""}<AccrueAt>${r.accrue}</AccrueAt></Resource>`);
  for (const e of expAsg.values()) {
    const s = span.get(e.task);
    asg.push(`<Assignment><UID>${asg.length + 1}</UID><TaskUID>${e.task}</TaskUID><ResourceUID>${e.ru}</ResourceUID><ActualCost>${Math.round(e.act * 100)}</ActualCost><Cost>${Math.round(e.atc * 100)}</Cost>${s ? `<Finish>${isoDate(s[1])}</Finish>` : ""}<RemainingCost>${Math.round(e.rem * 100)}</RemainingCost>${s ? `<Start>${isoDate(s[0])}</Start>` : ""}<Units>1</Units><Work>PT0H0M0S</Work>${e.notes.length ? `<Notes>${esc(e.notes.join("\n"))}</Notes>` : ""}<Baseline><Number>0</Number><Cost>${Math.round(e.budget * 100)}</Cost></Baseline></Assignment>`);
  }
  counts.expenses = expenses.length;
  counts.costResources = costRes.size;
  counts.unassignedResources = unassigned;
  const skipped = allResources ? 0 : (T.RSRC || []).filter((r) => r.rsrc_id && !usedRsrc.has(r.rsrc_id)).length;
  counts.resourcesLeftOut = skipped;
  if (unassigned) warnings.push(`${unassigned} resource(s) with no assignment in this project written too (the whole resource dictionary)`);
  else if (skipped) warnings.push(`${skipped} resource(s) with no assignment in this project left out (only the resources its activities use are written; the "every resource" option or --all-resources writes the whole dictionary)`);
  if (expenses.length) warnings.push(`${expenses.length} expense(s) written as assignments of ${costRes.size} cost resource(s), one per expense name${costCat.size && [...costRes.values()].some((r) => r.group) ? ", the cost category as the resource's Group" : ""}; vendor, PO number, quantity and description in the assignment's notes`);
  if (expMerged) warnings.push(`${expMerged} expense(s) added to another of the same name on the same activity (Project allows one assignment of a resource per task)`);
  if (expVariants) warnings.push(`${expVariants} expense name(s) used with a second category or accrual written as cost resources of their own, named with them (Project keeps both on the resource); their assignments' notes keep the expense name`);
  counts.resources = res.length + costRes.size;
  counts.assignments = asg.length;
  counts.curved = curved;
  if (curved) warnings.push(`${curved} assignment(s) on a P6 resource curve (${[...curveNames].map(([n, k]) => `${n} ${k}`).join(", ")}) written as Project timephased work in the curve's shape (contour "Contoured", or the Project contour the curve came from)`);
  if (curvedStarted) warnings.push(`${curvedStarted} started assignment(s) on a resource curve written with their remaining work spread evenly (P6's re-fit of a curve to the remaining units is not in the file)`);
  if (curveMissing) warnings.push(`${curveMissing} assignment(s) name a resource curve the file does not carry; written spread evenly`);

  // calendars last, once every user is known
  const calXml = [];
  for (const [id, uid] of calUid) calendarXml(uid, calRows.get(id)?.clndr_name || `calendar ${id}`, calOf(id) || projCal, calXml);
  counts.calendars = calUid.size;

  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    "<SaveVersion>14</SaveVersion>",
    `<Name>${esc(proj.proj_short_name || pid)}.xml</Name>`,
    `<Title>${esc(proj.proj_short_name || pid)}</Title>`,
    "<ScheduleFromStart>1</ScheduleFromStart>",
    `<StartDate>${isoDate(projStart)}</StartDate>`,
    `<FinishDate>${isoDate(projFinish)}</FinishDate>`,
    `<CriticalSlackLimit>${Math.round((num(proj.critical_drtn_hr_cnt) || 0) / hoursPerDay)}</CriticalSlackLimit>`,
    `<CalendarUID>${projCalId ? calUid.get(projCalId) : 1}</CalendarUID>`,
    `<MinutesPerDay>${Math.round(hoursPerDay * 60)}</MinutesPerDay>`,
    `<MinutesPerWeek>${Math.round(projCal.weekMinutes || hoursPerDay * 300)}</MinutesPerWeek>`,
    "<DefaultTaskType>1</DefaultTaskType>",
    "<DurationFormat>7</DurationFormat>",
    // P6's "make open-ended activities critical" is Project's "calculate
    // multiple critical paths": both set a task with no successor's late
    // finish to its early finish
    `<MultipleCriticalPaths>${opts.sched_open_critical_flag === "Y" ? 1 : 0}</MultipleCriticalPaths>`,
    "<NewTasksEffortDriven>0</NewTasksEffortDriven>",
    dataDate !== null ? `<StatusDate>${isoDate(dataDate)}</StatusDate>` : "",
    "<NewTasksAreManual>0</NewTasksAreManual>",
    ocf.fields.length ? `<OutlineCodes>${ocf.fields.map(outlineTableXml).join("")}</OutlineCodes>` : "",
    `<ExtendedAttributes><ExtendedAttribute><FieldID>${TEXT1}</FieldID><FieldName>Text1</FieldName><Alias>Activity ID</Alias></ExtendedAttribute>${ocf.fields.map((f) => `<ExtendedAttribute><FieldID>${f.fieldId}</FieldID><FieldName>${f.fieldName}</FieldName><Alias>${esc(f.alias)}</Alias><Ltuid>${f.guid}</Ltuid></ExtendedAttribute>`).join("")}${[...extFields, ...wbsUdf.fields.filter((f) => !f.shared), ...rsrcUdf.fields].map((f) => `<ExtendedAttribute><FieldID>${f.fieldId}</FieldID><FieldName>${f.fieldName}</FieldName><Alias>${esc(f.alias)}</Alias></ExtendedAttribute>`).join("")}</ExtendedAttributes>`,
    "<Calendars>", ...calXml, "</Calendars>",
    "<Tasks>", ...body, "</Tasks>",
    "<Resources>", ...resXml, "</Resources>",
    "<Assignments>", ...asg, "</Assignments>",
    "</Project>",
  ].filter((x) => x !== "").join("\n") + "\n";

  // what Project will do differently, and what is not carried
  const lagCal = opts.sched_calendar_on_relationship_lag || "rcal_Predecessor";
  if (lagCalDiffers && lagCal !== "rcal_Successor") warnings.push(`${lagCalDiffers} lag(s) join activities on different calendars: P6 counts them on the ${lagCal.replace("rcal_", "").replace("24Hour", "24-hour").toLowerCase()} calendar, Project on the successor's, so their successors can move`);
  if (opts.sched_progress_override === "Y") warnings.push("the project schedules with progress override; Project keeps the logic of out-of-sequence work (as P6's retained logic does), so those successors can move later");
  if (expected && opts.sched_use_expect_end_flag === "Y") warnings.push(`${expected} expected finish date(s) are not carried (Project has none); the remaining durations P6 stored are written instead`);
  if (rsrcDependent) warnings.push(`${rsrcDependent} resource-dependent activit${rsrcDependent === 1 ? "y is" : "ies are"} written on the activity's calendar`);
  if (counts.manual) warnings.push(`${counts.manual} level of effort or WBS summary activit${counts.manual === 1 ? "y is" : "ies are"} written as manually scheduled tasks on their P6 dates (Project has no level of effort), so they do not move with the logic`);
  if (spanLinks) warnings.push(`${spanLinks} relationship(s) to or from those activities are written into each one's notes rather than as links, so they drive nothing in Project, as in P6`);
  if (startMilestones) warnings.push(`${startMilestones} start milestone(s) have predecessors: Project places a milestone at its predecessor's finish (the end of the previous working day) where P6 places a start milestone at the next working start, so they can show a day earlier`);
  counts.spanLinks = spanLinks;
  if (counts.mandatory) warnings.push(`${counts.mandatory} mandatory start or finish constraint(s) written as must start on / must finish on`);
  if (counts.deadlines) warnings.push(`${counts.deadlines} secondary finish-on-or-before constraint(s) written as deadlines`);
  if (secondaryDropped) warnings.push(`${secondaryDropped} other secondary constraint(s) left out (Project allows one constraint per task)`);
  if (counts.external) warnings.push(`${counts.external} activit${counts.external === 1 ? "y has" : "ies have"} external dates from links to projects not in the file: the external early start is written as a start-no-earlier-than constraint (where the activity has no constraint of its own) and the external late finish as a deadline`);
  if (crossProject) warnings.push(`${crossProject} relationship(s) to activities in other projects left out`);
  if (parseDate(proj.plan_end_date) !== null) warnings.push(`the must-finish-by date (${proj.plan_end_date}) is not carried: Project scheduled from the start has none; add it as a deadline on the finish milestone if you need it`);
  // P6 (cpm.mjs, bwRsrcRemain) rolls an assignment's late dates up to its
  // activity: a started activity with no remaining duration whose labour row
  // still runs from restart to reend gets a late start that much before its
  // late finish. Project keeps an assignment inside its task's dates and has
  // no such rule, so those late starts (and the float of what precedes them)
  // move later in Project: the 4 CCA activities in
  // eval/msproject-check-2026-11-21.md, traced 2026-11-22.
  const rollUp = new Set(), byId = new Map(tasks.map((t) => [t.task_id, t]));
  for (const a of assigns) {
    const t = byId.get(a.task_id);
    if (!t || t.status_code !== "TK_Active" || (num(t.remain_drtn_hr_cnt) ?? 0) !== 0 || t.task_type === "TT_LOE" || t.task_type === "TT_WBS") continue;
    const rs = parseDate(a.restart_date), re = parseDate(a.reend_date);
    if (rs !== null && re !== null && re > rs) rollUp.add(t.task_id);
  }
  counts.rsrcRollUp = rollUp.size;
  if (rollUp.size) warnings.push(`${rollUp.size} started activit${rollUp.size === 1 ? "y has" : "ies have"} no remaining duration but an assignment still running past the data date (restart to reend): P6 sets ${rollUp.size === 1 ? "its" : "their"} late start that much before the late finish, Project has no such rule, so ${rollUp.size === 1 ? "its" : "their"} late start and the total float of ${rollUp.size === 1 ? "its" : "their"} predecessors can come out later in Project (${[...rollUp].slice(0, 5).map((id) => byId.get(id).task_code).join(", ")}${rollUp.size > 5 ? ` and ${rollUp.size - 5} more` : ""})`);
  if (unknownRsrc) warnings.push(`${unknownRsrc} assignment(s) name a resource the file does not list and were left out`);
  const notCarried = [];
  counts.codeTypes = codeFields.fields.length;
  counts.codeAssignments = codeFields.written;
  counts.outlineCodeTypes = ocf.fields.length;
  counts.outlineCodeAssignments = ocf.written;
  counts.outlineCodeValues = ocf.fields.reduce((n, f) => n + f.items.length, 0);
  warnings.push(...ocf.warnings, ...codeFields.warnings);
  const nCodes = codeFields.dropped;
  counts.udfFields = udf.fields.length;
  counts.udfValues = udf.written;
  warnings.push(...udf.warnings);
  counts.wbsUdfFields = wbsUdf.fields.length;
  counts.wbsUdfValues = wbsUdf.written;
  warnings.push(...wbsUdf.warnings);
  counts.rsrcUdfFields = rsrcUdf.fields.length;
  counts.rsrcUdfValues = rsrcUdf.written;
  warnings.push(...rsrcUdf.warnings);
  const nUdf = udf.dropped, nRsrcUdf = rsrcUdf.dropped, nWbsUdf = wbsUdf.dropped + wbsUdf.offOutline;
  const nProc = (T.TASKPROC || []).filter((r) => taskUid.has(r.task_id)).length;
  if (nCodes) notCarried.push(`${nCodes} activity code assignment(s) of the ${codeFields.droppedTypes} code type(s) past Project's 29 spare text fields`);
  if (nUdf) notCarried.push(`${nUdf} user-defined field value(s) of ${udf.droppedTypes} field(s) with no room or no Project equivalent`);
  if (nWbsUdf) notCarried.push(`${nWbsUdf} WBS user-defined field value(s)${wbsUdf.offOutline ? ` (${wbsUdf.offOutline} on the project node or a WBS the file does not write)` : ""} with no room or no Project equivalent`);
  if (nRsrcUdf) notCarried.push(`${nRsrcUdf} resource user-defined field value(s) of ${rsrcUdf.droppedTypes} field(s) with no room or no Project equivalent`);
  if (counts.notebookEntries || counts.notebookWbsEntries) warnings.push(`${counts.notebookEntries + counts.notebookWbsEntries} notebook entr${counts.notebookEntries + counts.notebookWbsEntries === 1 ? "y" : "ies"} written into the notes of ${counts.notebookTasks} task(s)${counts.notebookWbs ? ` and ${counts.notebookWbs} summary task(s)` : ""}, each under its topic in brackets (plain text: P6's formatting is not kept)`);
  if (counts.rsrcGroups) warnings.push(`${counts.rsrcGroups} resource(s) carry P6's resource hierarchy as their Group (parent resource IDs from the top, "/" between them)`);
  if (counts.rsrcNotes) warnings.push(`${counts.rsrcNotes} resource note(s) written as the resource's notes (plain text: P6's formatting is not kept)`);
  if (nProc) notCarried.push(`${nProc} step(s)`);
  if (notCarried.length) warnings.push(`not carried: ${notCarried.join(", ")}`);

  return { xml, project: { id: pid, name: proj.proj_short_name || pid, dataDate: proj.last_recalc_date || "" }, counts, warnings, taskUid, codeFields, outlineFields: ocf, udfFields: udf, wbsUdfFields: wbsUdf, wbsUid: wbsRow, rsrcUdfFields: rsrcUdf };
}

export const msprojectSummary = (r) =>
  `${r.counts.activities} activities, ${r.counts.wbs} WBS summary tasks, ${r.counts.links} relationships, ${r.counts.calendars} calendar${r.counts.calendars === 1 ? "" : "s"}, ${r.counts.resources} resources, ${r.counts.assignments} assignments${r.counts.outlineCodeTypes ? `, ${r.counts.outlineCodeAssignments} activity code values in ${r.counts.outlineCodeTypes} outline code${r.counts.outlineCodeTypes === 1 ? "" : "s"} (${r.counts.outlineCodeValues} lookup values)` : ""}${r.counts.codeTypes ? ` and ${r.counts.codeAssignments} activity code values in ${r.counts.codeTypes} text field${r.counts.codeTypes === 1 ? "" : "s"}` : ""}${r.counts.udfFields ? `, ${r.counts.udfValues} user-defined field values in ${r.counts.udfFields} custom field${r.counts.udfFields === 1 ? "" : "s"}` : ""}${r.counts.wbsUdfFields ? `, ${r.counts.wbsUdfValues} WBS user-defined field values on summary tasks in ${r.counts.wbsUdfFields} field${r.counts.wbsUdfFields === 1 ? "" : "s"}` : ""}${r.counts.rsrcUdfFields ? `, ${r.counts.rsrcUdfValues} resource user-defined field values in ${r.counts.rsrcUdfFields} resource field${r.counts.rsrcUdfFields === 1 ? "" : "s"}` : ""} written`;

// The code types this project's activities use, as text fields. Returns
// { fields: [{ fieldId, fieldName, alias, typeId, values: Map(task_id -> text) }],
//   written, dropped, droppedTypes, warnings }.
export function activityCodeFields(T, taskRow, codeNames = false, { room = TASK_TEXT_IDS.length - 1, shared = 0, skip = new Set(), takenAliases = [] } = {}) {
  const warnings = [];
  const typeRows = new Map((T.ACTVTYPE || []).map((r) => [r.actv_code_type_id, r]));
  const codeRows = new Map((T.ACTVCODE || []).map((r) => [r.actv_code_id, r]));
  const byType = new Map(); // type id -> Map(task_id -> code row)
  let dangling = 0, twice = 0;
  for (const a of T.TASKACTV || []) {
    if (!taskRow.has(a.task_id)) continue;
    const c = codeRows.get(a.actv_code_id);
    if (!c) { dangling++; continue; }
    const typeId = a.actv_code_type_id || c.actv_code_type_id;
    if (skip.has(typeId)) continue;
    if (!byType.has(typeId)) byType.set(typeId, new Map());
    const m = byType.get(typeId);
    if (m.has(a.task_id)) { twice++; continue; }
    m.set(a.task_id, c);
  }
  const ORDER = { AS_Global: 0, AS_EPS: 1, AS_Project: 2 };
  // Project formulas name fields in brackets, so a field name holds none
  const nameOf = (id) => nm(typeRows.get(id)?.actv_code_type || `code type ${id}`).replace(/\[/g, "(").replace(/\]/g, ")").trim() || `code type ${id}`;
  const types = [...byType.keys()].map((id) => ({ id, n: byType.get(id).size, scope: own(ORDER, typeRows.get(id)?.actv_code_type_scope, 3), seq: num(typeRows.get(id)?.seq_num) ?? 0 }));
  types.sort((a, b) => a.scope - b.scope || a.seq - b.seq || nameOf(a.id).localeCompare(nameOf(b.id)) || (a.id < b.id ? -1 : 1));
  let kept = types;
  let dropped = 0, droppedTypes = 0;
  if (types.length > room) {
    // keep the most-used types, in P6's order
    const rank = [...types].sort((a, b) => b.n - a.n || types.indexOf(a) - types.indexOf(b));
    const keep = new Set(rank.slice(0, room).map((t) => t.id));
    kept = types.filter((t) => keep.has(t.id));
    for (const t of types) if (!keep.has(t.id)) { dropped += t.n; droppedTypes++; }
    warnings.push(`${types.length} activity code types are used and Project has 29 spare text fields${shared ? `, ${shared} of them taken by text user-defined fields that fill more activities` : ""}: the ${room} most assigned are written; left out: ${types.filter((t) => !keep.has(t.id)).map((t) => `${nameOf(t.id)} (${t.n})`).join(", ")}`);
  }
  // Project's field names must be unique: a repeated code type name gets its id
  const seen = new Map([["activity id", 1]]);
  for (const a of takenAliases) seen.set(a.toLowerCase(), (seen.get(a.toLowerCase()) || 0) + 1);
  for (const t of kept) seen.set(nameOf(t.id).toLowerCase(), (seen.get(nameOf(t.id).toLowerCase()) || 0) + 1);
  let written = 0;
  const leaf = (c) => nm(c.short_name || c.actv_code_name || c.actv_code_id);
  const pathOf = (c) => {
    const parts = [];
    const seenIds = new Set();
    for (let x = c; x && !seenIds.has(x.actv_code_id); x = codeRows.get(x.parent_actv_code_id)) { seenIds.add(x.actv_code_id); parts.unshift(leaf(x)); }
    return parts.join(".");
  };
  let pathTypes = 0;
  const fields = kept.map((t, k) => {
    const values = new Map();
    // a leaf code used under two parents (001 under Area A and under Area B)
    // would merge two values in Project: that type writes the whole path
    const leafOf = new Map();
    let ambiguous = false;
    for (const c of byType.get(t.id).values()) {
      const l = leaf(c);
      if (leafOf.has(l) && leafOf.get(l) !== c.actv_code_id) { ambiguous = true; break; }
      leafOf.set(l, c.actv_code_id);
    }
    if (ambiguous) pathTypes++;
    for (const [taskId, c] of byType.get(t.id)) {
      const code = ambiguous ? pathOf(c) : leaf(c);
      const desc = nm(c.actv_code_name || "");
      values.set(taskId, (codeNames && desc && desc !== code ? `${code}${CODE_NAME_SEP}${desc}` : code).slice(0, 255));
      written++;
    }
    const base = nameOf(t.id);
    return { fieldId: TASK_TEXT_IDS[k + 1], fieldName: `Text${k + 2}`, alias: (seen.get(base.toLowerCase()) > 1 ? `${base} (${t.id})` : base).slice(0, 50), typeId: t.id, values };
  });
  if (pathTypes) warnings.push(`${pathTypes} code type(s) use the same code under different parents: their fields hold the whole path (parent.child), so the values stay apart`);
  if (dangling) warnings.push(`${dangling} activity code assignment(s) name a value the file does not carry and were left out`);
  if (twice) warnings.push(`${twice} activit${twice === 1 ? "y holds" : "ies hold"} a second value of one code type; the first in the file is written`);
  return { fields, written, dropped, droppedTypes, warnings };
}

// The code types this project's activities use, as Project's Outline Code1..10:
// the `room` most assigned (P6's order breaks ties, and lists the fields).
// Each field's lookup table holds the type's whole dictionary from ACTVCODE,
// used or not, in P6's tree order (seq_num, then code), each value with its
// parent and description; a task's value is its code's path, the codes from
// the top level down joined by the type's separator. Returns
// { fields: [{ fieldId, fieldName, alias, typeId, guid, sep, depth,
//   items: [{ vid, parentVid, code, desc, guid, path, row }],
//   task: Map(task_id -> item) }], typeIds, written, warnings }.
export function outlineCodeFields(T, taskRow, { room = TASK_OUTLINE_IDS.length, projId = "" } = {}) {
  const warnings = [];
  const typeRows = new Map((T.ACTVTYPE || []).map((r) => [r.actv_code_type_id, r]));
  const codeRows = new Map((T.ACTVCODE || []).map((r) => [r.actv_code_id, r]));
  const byType = new Map();
  for (const a of T.TASKACTV || []) {
    if (!taskRow.has(a.task_id)) continue;
    const c = codeRows.get(a.actv_code_id);
    if (!c) continue; // counted by activityCodeFields
    const typeId = a.actv_code_type_id || c.actv_code_type_id;
    if (!byType.has(typeId)) byType.set(typeId, new Map());
    const m = byType.get(typeId);
    if (!m.has(a.task_id)) m.set(a.task_id, c);
  }
  const ORDER = { AS_Global: 0, AS_EPS: 1, AS_Project: 2 };
  const nameOf = (id) => nm(typeRows.get(id)?.actv_code_type || `code type ${id}`).replace(/\[/g, "(").replace(/\]/g, ")").trim() || `code type ${id}`;
  const types = [...byType.keys()].map((id) => ({ id, n: byType.get(id).size, scope: own(ORDER, typeRows.get(id)?.actv_code_type_scope, 3), seq: num(typeRows.get(id)?.seq_num) ?? 0 }));
  types.sort((a, b) => a.scope - b.scope || a.seq - b.seq || nameOf(a.id).localeCompare(nameOf(b.id)) || (a.id < b.id ? -1 : 1));
  const rank = [...types].sort((a, b) => b.n - a.n || types.indexOf(a) - types.indexOf(b));
  const keep = new Set(rank.slice(0, room).map((t) => t.id));
  const kept = types.filter((t) => keep.has(t.id));
  if (types.length > room) warnings.push(`${types.length} activity code types are used and Project has ${room} outline codes: the ${room} most assigned are outline codes and the other ${types.length - room} go to the spare text fields`);
  const seen = new Map([["activity id", 1]]);
  for (const t of kept) seen.set(nameOf(t.id).toLowerCase(), (seen.get(nameOf(t.id).toLowerCase()) || 0) + 1);
  const leaf = (c) => nm(c.short_name || c.actv_code_name || c.actv_code_id);
  let written = 0, cycles = 0, twins = 0, noSep = 0;
  const fields = kept.map((t, k) => {
    // the dictionary: every value of the type, plus any assigned value filed under another type id
    const rows = new Map();
    for (const c of T.ACTVCODE || []) if (c.actv_code_type_id === t.id) rows.set(c.actv_code_id, c);
    for (const c of byType.get(t.id).values()) rows.set(c.actv_code_id, c);
    // a parent outside the type makes a top-level value (and so does a loop,
    // found below as the values the walk from the top never reaches)
    const kids = new Map();
    for (const c of rows.values()) {
      const p = rows.has(c.parent_actv_code_id) && c.parent_actv_code_id !== c.actv_code_id ? c.parent_actv_code_id : "";
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(c);
    }
    const bySeq = (a, b) => (num(a.seq_num) ?? 0) - (num(b.seq_num) ?? 0) || leaf(a).localeCompare(leaf(b), undefined, { numeric: true }) || (a.actv_code_id < b.actv_code_id ? -1 : 1);
    const codes = [...rows.values()].map(leaf);
    const sep = OUTLINE_SEPS.find((s) => !codes.some((c) => c.includes(s))) || OUTLINE_SEPS[0];
    if (!OUTLINE_SEPS.some((s) => !codes.some((c) => c.includes(s)))) noSep++;
    const guid = guidOf("lookup", projId, t.id);
    const items = [], itemOf = new Map();
    let depth = 0;
    const walk = (p, parentItem, level) => {
      const list = (kids.get(p) || []).sort(bySeq);
      const names = new Set();
      for (const c of list) {
        if (itemOf.has(c.actv_code_id)) continue; // back round a loop
        const code = leaf(c);
        if (names.has(code)) twins++;
        names.add(code);
        const it = { vid: items.length + 1, parentVid: parentItem ? parentItem.vid : null, code, desc: nm(c.actv_code_name || ""), guid: guidOf("value", projId, t.id, c.actv_code_id), path: (parentItem ? parentItem.path + sep : "") + code, row: c };
        items.push(it);
        itemOf.set(c.actv_code_id, it);
        depth = Math.max(depth, level);
        walk(c.actv_code_id, it, level + 1);
      }
    };
    walk("", null, 1);
    for (const c of [...rows.values()].sort(bySeq)) {
      if (itemOf.has(c.actv_code_id)) continue;
      cycles++;
      kids.set(`loop:${c.actv_code_id}`, [c]);
      walk(`loop:${c.actv_code_id}`, null, 1);
    }
    const task = new Map();
    for (const [taskId, c] of byType.get(t.id)) { task.set(taskId, itemOf.get(c.actv_code_id)); written++; }
    const base = nameOf(t.id);
    return { fieldId: TASK_OUTLINE_IDS[k], fieldName: `Outline Code${k + 1}`, alias: (seen.get(base.toLowerCase()) > 1 ? `${base} (${t.id})` : base).slice(0, 50), typeId: t.id, guid, sep, depth, items, task };
  });
  if (cycles) warnings.push(`${cycles} activity code value(s) sit under a parent that loops back to them; each is written as a top-level value`);
  if (twins) warnings.push(`${twins} activity code value(s) repeat a code under the same parent: Project's lookup table keeps both, but their paths read alike`);
  if (noSep) warnings.push(`${noSep} code type(s) use every separator Project offers (. - + /) inside codes; their paths use "." and may not split back into levels`);
  return { fields, typeIds: new Set(kept.map((t) => t.id)), written, warnings };
}

// One field's <OutlineCode> lookup table, in the form Project writes and MPXJ
// reads: values with parent IDs and descriptions, a character mask per level.
function outlineTableXml(f) {
  const vals = f.items.map((it) => `<Value><ValueID>${it.vid}</ValueID>${it.parentVid ? `<ParentValueID>${it.parentVid}</ParentValueID>` : ""}<FieldGUID>${it.guid}</FieldGUID><Type>21</Type><IsCollapsed>0</IsCollapsed><Value>${esc(it.code)}</Value><Description>${esc(it.desc)}</Description></Value>`).join("");
  const masks = Array.from({ length: Math.max(1, f.depth) }, (_, k) => `<Mask><Level>${k + 1}</Level><Type>3</Type><Length>0</Length><Separator>${esc(f.sep)}</Separator></Mask>`).join("");
  return `<OutlineCode><Guid>${f.guid}</Guid><FieldID>${f.fieldId}</FieldID><FieldName>${f.fieldName}</FieldName><Alias>${esc(f.alias)}</Alias><Values>${vals}</Values><Enterprise>0</Enterprise><ResourceSubstitutionEnabled>0</ResourceSubstitutionEnabled><LeafOnly>0</LeafOnly><AllLevelsRequired>0</AllLevelsRequired><OnlyTableValuesAllowed>1</OnlyTableValuesAllowed><ShowIndent>1</ShowIndent><Masks>${masks}</Masks></OutlineCode>`;
}

// Project's spare task Number1..20, Date1..10 and Cost1..10 fields (PjField
// ids, checked against MPXJ 16.10's FieldTypeHelper; the same tables are in
// mspdi.mjs, which reads them back)
export const TASK_NUMBER_IDS = ["188743767", "188743768", "188743769", "188743770", "188743771", ...Array.from({ length: 15 }, (_, k) => String(188743982 + k))];
export const TASK_DATE_IDS = Array.from({ length: 10 }, (_, k) => String(188743945 + k));
export const TASK_COST_IDS = ["188743786", "188743787", "188743788", ...Array.from({ length: 7 }, (_, k) => String(188743938 + k))];
// Project's task Start1..10 and Finish1..10 custom fields (MPXJ 16.10's
// MPPTaskField: index 52/53, 55/56 ... 64/65 for 1..5, 282/283 ... 290/291
// for 6..10, on the task base 0x0B400000). Finish-date UDFs go to Finish
// fields so they come back as finish-date UDFs (eval/finish-udfs-2026-11-22.md).
export const TASK_START_IDS = [...[52, 55, 58, 61, 64], ...[282, 284, 286, 288, 290]].map((k) => String(188743680 + k));
export const TASK_FINISH_IDS = [...[53, 56, 59, 62, 65], ...[283, 285, 287, 289, 291]].map((k) => String(188743680 + k));
const UDF_KIND = { FT_INT: "number", FT_FLOAT: "number", FT_FLOAT_2_DECIMALS: "number", FT_MONEY: "cost", FT_START_DATE: "date", FT_END_DATE: "finish", FT_TEXT: "text" };
const udfKind = (t) => (Object.hasOwn(UDF_KIND, t) ? UDF_KIND[t] : undefined);
const KIND_FIELDS = { number: ["Number", TASK_NUMBER_IDS], date: ["Date", TASK_DATE_IDS], cost: ["Cost", TASK_COST_IDS], finish: ["Finish", TASK_FINISH_IDS] };
// Project's resource Text1..30, Number1..20, Cost1..10 and Date1..10 fields
// (PjField ids from MPXJ 16.10's FieldTypeHelper for ResourceField.TEXT1 and
// the rest; p6xer.mjs reads them back as resource UDFs)
const rng = (a, n) => Array.from({ length: n }, (_, k) => String(a + k));
export const RSRC_TEXT_IDS = ["205520904", "205520905", ...rng(205520926, 3), ...rng(205520993, 5), ...rng(205521121, 20)];
export const RSRC_NUMBER_IDS = [...rng(205521008, 5), ...rng(205521101, 15)];
export const RSRC_COST_IDS = [...rng(205521019, 3), ...rng(205521062, 7)];
export const RSRC_DATE_IDS = rng(205521069, 10);
// resource Start1..10 and Finish1..10 (MPPResourceField: 102-106 and
// 220-224, 107-111 and 190-194, on the resource base 0x0C400000)
export const RSRC_START_IDS = [...rng(205520998, 5), ...rng(205521116, 5)];
export const RSRC_FINISH_IDS = [...rng(205521003, 5), ...rng(205521086, 5)];
const RSRC_KIND_FIELDS = { number: ["Number", RSRC_NUMBER_IDS], date: ["Date", RSRC_DATE_IDS], cost: ["Cost", RSRC_COST_IDS], finish: ["Finish", RSRC_FINISH_IDS] };

// The activity user-defined fields (UDFTYPE table TASK, values in UDFVALUE)
// of this project's activities, as Project's spare custom fields: integer and
// decimal UDFs as Number1..20, cost UDFs as Cost1..10, start-date UDFs as
// Date1..10, finish-date UDFs as Finish1..10 (more than ten spill into the
// Date fields start-date UDFs leave free, and come back as start dates), and text UDFs in the Text fields activity codes left
// free (textFrom is the first free index into TASK_TEXT_IDS). Each field is
// renamed (Alias) to the UDF's title. A kind with more UDFs than fields keeps
// the most-filled (P6's order breaks ties) and counts the rest. Indicator
// UDFs (traffic lights) and code UDFs have no Project field and are counted.
// Values are written as MPXJ writes them: numbers as decimals, dates as
// date-times, costs in cents (Project stores a cost field in hundredths).
// Returns { fields: [{ fieldId, fieldName, alias, kind, typeId, values: Map(task_id -> xml value) }],
//   written, dropped, droppedTypes, warnings }.
//
// With { table: "RSRC" } the same for resource UDFs (UDFTYPE table RSRC, fk_id
// a rsrc_id; taskRow is then the resources written), as Project's resource
// fields: all 30 resource Text fields are free.
//
// With { table: "PROJWBS" } the same for WBS UDFs (fk_id a wbs_id; taskRow is
// then the WBS nodes written as summary tasks), in the task fields: usedIds
// are the fields activity codes and UDFs already hold, and a WBS UDF with the
// title and kind of a field in shareWith writes into that field (shared: true)
// instead of taking a new one. offOutline counts values on ownRows (the
// project's WBS nodes) that are not written, such as the project node.
export function udfFields(T, taskRow, { textFrom = TASK_TEXT_IDS.length, takenAliases = [], table = "TASK", usedIds = new Set(), shareWith = [], ownRows = new Set() } = {}) {
  const warnings = [];
  const rsrc = table === "RSRC";
  const textIds = rsrc ? RSRC_TEXT_IDS : TASK_TEXT_IDS;
  const kindFields = rsrc ? RSRC_KIND_FIELDS : KIND_FIELDS;
  if (rsrc) textFrom = 0;
  const who = rsrc ? "resource " : table === "PROJWBS" ? "WBS " : ""; // activity warnings keep their wording
  const types = new Map((T.UDFTYPE || []).filter((u) => u.table_name === table).map((u) => [u.udf_type_id, u]));
  const byType = new Map(); // type id -> Map(task_id -> value text)
  let unreadable = 0, offOutline = 0;
  for (const v of T.UDFVALUE || []) {
    const u = types.get(v.udf_type_id);
    if (!u) continue;
    if (!taskRow.has(v.fk_id)) { if (ownRows.has(v.fk_id)) offOutline++; continue; }
    const kind = udfKind(u.logical_data_type);
    let x = "";
    if (kind === "number" || kind === "cost") {
      const n = num(v.udf_number);
      if (n === null || v.udf_number === "") { if ((v.udf_number || "").trim()) unreadable++; continue; }
      x = kind === "cost" ? String(Math.round(n * 100)) : String(n);
    } else if (kind === "date" || kind === "finish") {
      const d = parseDate(v.udf_date);
      if (d === null) { if ((v.udf_date || "").trim()) unreadable++; continue; }
      x = isoDate(d);
    } else if (kind === "text") {
      x = nm(v.udf_text).slice(0, 255);
      if (!x.trim()) continue;
    } else x = "\u0000"; // indicator or code: counted below
    if (!byType.has(u.udf_type_id)) byType.set(u.udf_type_id, new Map());
    byType.get(u.udf_type_id).set(v.fk_id, x);
  }
  const label = (u) => (nm(u.udf_type_label || u.udf_type_name || `UDF ${u.udf_type_id}`).replace(/\[/g, "(").replace(/\]/g, ")").trim() || `UDF ${u.udf_type_id}`);
  const seq = (u) => num(u.udf_type_id) ?? 0;
  const seen = new Map(rsrc ? [] : [["activity id", 1]]);
  for (const a of takenAliases) seen.set(a.toLowerCase(), 1);
  const fields = [];
  let written = 0, dropped = 0, droppedTypes = 0, noField = 0;
  const noFieldTypes = [];
  const slots = (kind) => (kind === "text" ? textIds.slice(textFrom).map((id, k) => [id, `Text${textFrom + k + 1}`]) : kindFields[kind][1].map((id, k) => [id, `${kindFields[kind][0]}${k + 1}`])).filter(([id]) => !usedIds.has(id));
  const shareOf = (u, kind) => shareWith.find((f) => f.kind === kind && f.alias.toLowerCase() === label(u).slice(0, 50).toLowerCase());
  for (const kind of ["number", "cost", "date", "finish", "text"]) {
    let list = [...byType.keys()].map((id) => types.get(id)).filter((u) => udfKind(u.logical_data_type) === kind)
      .sort((a, b) => seq(a) - seq(b) || (a.udf_type_id < b.udf_type_id ? -1 : 1));
    if (!list.length) continue;
    for (const u of list.filter((x) => shareOf(x, kind))) {
      const f = shareOf(u, kind), values = byType.get(u.udf_type_id);
      written += values.size;
      fields.push({ fieldId: f.fieldId, fieldName: f.fieldName, alias: f.alias, kind, typeId: u.udf_type_id, values, table, shared: true });
    }
    list = list.filter((x) => !shareOf(x, kind));
    if (!list.length) continue;
    const room = kind === "finish" ? [...slots("finish"), ...slots("date").filter(([id]) => !fields.some((f) => f.fieldId === id))] : slots(kind);
    let kept = list;
    if (list.length > room.length) {
      const rank = [...list].sort((a, b) => byType.get(b.udf_type_id).size - byType.get(a.udf_type_id).size || list.indexOf(a) - list.indexOf(b));
      const keep = new Set(rank.slice(0, room.length).map((u) => u.udf_type_id));
      kept = list.filter((u) => keep.has(u.udf_type_id));
      const left = list.filter((u) => !keep.has(u.udf_type_id));
      for (const u of left) { dropped += byType.get(u.udf_type_id).size; droppedTypes++; }
      const left2 = table === "PROJWBS" ? " activity codes and UDFs leave free" : rsrc ? "" : " activity codes leave free";
      const where = kind === "finish" ? `${room.length} ${rsrc ? "resource " : ""}Finish and free Date field${room.length === 1 ? "" : "s"}${table === "PROJWBS" ? " activity UDFs leave free" : ""}` : kind === "text" ? `${room.length} ${rsrc ? "resource " : ""}Text field${room.length === 1 ? "" : "s"}${left2}` : `${room.length} ${rsrc ? "resource " : ""}${kindFields[kind][0]} field${room.length === 1 ? "" : "s"}${table === "PROJWBS" ? " activity UDFs leave free" : ""}`;
      warnings.push(`${list.length} ${kind === "finish" ? "finish-date" : kind} ${who}user-defined fields are used and Project has ${where}: ${room.length ? "the most filled are written; " : ""}left out: ${left.map((u) => `${label(u)} (${byType.get(u.udf_type_id).size})`).join(", ")}`);
    }
    kept.forEach((u, k) => {
      let alias = label(u);
      if (seen.has(alias.toLowerCase())) alias = `${alias} (UDF ${u.udf_type_id})`;
      seen.set(alias.toLowerCase(), 1);
      const values = byType.get(u.udf_type_id);
      written += values.size;
      fields.push({ fieldId: room[k][0], fieldName: room[k][1], alias: alias.slice(0, 50), kind, typeId: u.udf_type_id, values, table });
    });
    const spilled = kind === "finish" ? fields.filter((f) => f.kind === "finish" && !f.shared && f.fieldName.startsWith("Date")) : [];
    if (spilled.length) warnings.push(`${spilled.length} finish-date ${who}user-defined field(s) are past Project's ten Finish fields and are written to Date fields, which come back as start-date UDFs: ${spilled.map((f) => f.alias).join(", ")}`);
  }
  for (const id of byType.keys()) {
    const u = types.get(id);
    if (udfKind(u.logical_data_type)) continue;
    noField += byType.get(id).size;
    noFieldTypes.push(`${label(u)} (${u.logical_data_type || "no type"})`);
  }
  if (noField) warnings.push(`${noField} value(s) of ${noFieldTypes.length} indicator or code ${who}user-defined field(s) have no Project field and are not carried: ${noFieldTypes.join(", ")}`);
  if (unreadable) warnings.push(`${unreadable} ${who}user-defined field value(s) could not be read as a number or date and were left out`);
  return { fields, written, dropped: dropped + noField, droppedTypes: droppedTypes + noFieldTypes.length, warnings, offOutline };
}
