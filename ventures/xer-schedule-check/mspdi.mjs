// Microsoft Project XML (MSPDI) reader. "File > Save As > XML" in Microsoft
// Project (2003 to 2024 and Project Online) writes this format; so do
// ProjectLibre, GanttProject, Asta and most converters. It is read into the
// same tables the XER reader returns (PROJECT, CALENDAR, PROJWBS, TASK,
// TASKPRED, SCHEDOPTIONS), so every check, the CPM engine, the comparison,
// the risk run and levelling work on Microsoft Project schedules unchanged.
//
// parseMspdi(text) -> { version, exportDate, tables, warnings, format: "mspdi" }
// parseSchedule(text) -> parseMspdi for XML, else parseXer
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
//   not a constraint in either tool; deadlines are counted in the warnings.
// - a manually scheduled task (Manual = 1) that has not started keeps its
//   typed start: it is read as start on or after that date (Project still
//   gives it late dates from the logic), and every one is named in the
//   warnings, since a reviewer wants them switched to auto scheduled.

import { parseXer } from "./xer.mjs";

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

// ---------- the project ----------

export function parseMspdi(text) {
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
  for (const uid of raw.keys()) {
    const c = resolveCalendar(raw, uid);
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
  let summaries = 0, deadlines = 0, inactive = 0, nulls = 0, elapsed = 0, external = 0;
  const durHours = new Map();
  for (const t of taskNodes) {
    const uid = val(t, "UID");
    if (!uid) continue;
    if (val(t, "IsNull") === "1") { nulls++; continue; }
    const level = Number(val(t, "OutlineLevel") || 1);
    if (level === 0) continue; // the project summary task
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
    const bl = kids(t, "Baseline").find((b) => val(b, "Number") === "0" || val(b, "Number") === "");
    let cstr = CSTR[Number(val(t, "ConstraintType"))] || "";
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
      reend_date: status === "TK_Complete" ? "" : date(val(t, "Finish")),
      target_start_date: bl ? date(val(bl, "Start")) : "",
      target_end_date: bl ? date(val(bl, "Finish")) : "",
      total_float_hr_cnt: slack("TotalSlack"),
      free_float_hr_cnt: slack("FreeSlack"),
      cstr_type: cstr,
      cstr_date: cstrDate,
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
      const type = LINK[val(l, "Type") === "" ? 1 : Number(val(l, "Type"))] || "PR_FS";
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
  if (manual.length) warnings.push(`${manual.length} manually scheduled task(s) do not move with their logic (switch them to auto scheduled before relying on the dates); each is read as start on or after its typed start: ${manual.slice(0, 12).join("; ")}${manual.length > 12 ? "; ..." : ""}`);
  if (deadlines) warnings.push(`${deadlines} task(s) carry a deadline; deadlines are not modelled, so their recomputed float can be larger than Project's`);
  if (inactive) warnings.push(`${inactive} inactive task(s) left out, as Project leaves them out of the schedule`);
  if (external) warnings.push(`${external} external (inserted-project) task(s) left out`);
  if (crossProject) warnings.push(`${crossProject} cross-project link(s) left out`);
  if (elapsed) warnings.push(`${elapsed} task(s) with an elapsed duration are scheduled on a 24-hour calendar`);
  if (elapsedLags) warnings.push(`${elapsedLags} elapsed lag(s) counted on a 24-hour clock`);
  if (pctLags) warnings.push(`${pctLags} percent lag(s) turned into hours of the predecessor's duration`);
  if (nulls) warnings.push(`${nulls} blank row(s) skipped`);
  if (!TASK.length) warnings.push("the file has no tasks");
  return {
    version: `MSPDI ${val(proj, "SaveVersion") || ""}`.trim(),
    exportDate: date(val(proj, "LastSaved")),
    tables: { PROJECT, CALENDAR, SCHEDOPTIONS, PROJWBS, TASK, TASKPRED },
    warnings,
    format: "mspdi",
  };
}

// An XML file (after a BOM and white space) is MSPDI; anything else is read as XER.
export function isXml(text) {
  return /^\uFEFF?\s*</.test(text);
}
export function parseSchedule(text) {
  return isXml(text) ? parseMspdi(text) : parseXer(text);
}
