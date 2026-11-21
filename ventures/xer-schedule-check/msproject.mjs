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
// activities, the must-finish-by date); activity codes, UDFs, notes, steps
// and expenses are not carried and are counted.

import { Calendar } from "./calendar.mjs";
import { parseDate, num } from "./xer.mjs";

const DAY = 1440;
const SERIAL_EPOCH_DAY = Date.UTC(1899, 11, 30) / 86400000;
const TEXT1 = "188743731"; // Text1's field ID in Project

const esc = (s) => String(s ?? "")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// P6 writes a double quote inside a field as "" (MPXJ reads it back as one)
const nm = (s) => String(s ?? "").replace(/""/g, '"');
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

export function mspdiText(xer, { projId = null } = {}) {
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

  // tasks
  const counts = { activities: tasks.length, wbs: outline.filter((o) => o.kind === "wbs").length, links: 0, calendars: 0, resources: 0, assignments: 0, manual: 0, mandatory: 0, deadlines: 0, external: 0, crossProject };
  let rsrcDependent = 0, expected = 0, secondaryDropped = 0, startMilestones = 0;
  const span = new Map(); // uid -> [start, finish] for summary roll-up
  const taskXml = new Map();
  for (const o of outline) {
    if (o.kind !== "task") continue;
    const t = o.row;
    const { uid: cUid, cal } = useCal(t.clndr_id);
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
    if (isSpan) L.push(`<Notes>${esc(`P6 ${t.task_type === "TT_LOE" ? "level of effort" : "WBS summary"} activity ${t.task_code}${spanNotes.has(t.task_id) ? `; its P6 relationships: ${spanNotes.get(t.task_id).join(", ")}` : ""}`)}</Notes>`);
    if (t.phys_complete_pct !== undefined && t.phys_complete_pct !== "") L.push(`<PhysicalPercentComplete>${Math.round(num(t.phys_complete_pct) || 0)}</PhysicalPercentComplete>`);
    for (const r of preds.get(t.task_id) || []) {
      const lag = num(r.lag_hr_cnt) || 0;
      L.push(`<PredecessorLink><PredecessorUID>${taskUid.get(r.pred_task_id)}</PredecessorUID><Type>${own(LINK, r.pred_type, 1)}</Type><CrossProject>0</CrossProject><LinkLag>${Math.round(lag * 600)}</LinkLag><LagFormat>${lag % hoursPerDay === 0 ? 7 : 5}</LagFormat></PredecessorLink>`);
      counts.links++;
    }
    L.push(`<ExtendedAttribute><FieldID>${TEXT1}</FieldID><Value>${esc(t.task_code)}</Value></ExtendedAttribute>`);
    const bs = parseDate(t.target_start_date), bf = parseDate(t.target_end_date);
    if (bs !== null && bf !== null) L.push(`<Baseline><Number>0</Number><Start>${isoDate(bs)}</Start><Finish>${isoDate(bf)}</Finish><Duration>${ptHours(isMile ? 0 : num(t.target_drtn_hr_cnt) ?? 0)}</Duration><DurationFormat>7</DurationFormat></Baseline>`);
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
  body.push(`<Task><UID>0</UID><ID>0</ID><Name>${esc(nm(proj.proj_short_name || pid))}</Name><Active>1</Active><Manual>0</Manual><Type>1</Type><IsNull>0</IsNull><WBS>0</WBS><OutlineNumber>0</OutlineNumber><OutlineLevel>0</OutlineLevel><Start>${isoDate(Math.min(projStart, Number.isFinite(pa) ? pa : projStart))}</Start><Finish>${isoDate(projFinish)}</Finish><Summary>1</Summary><CalendarUID>-1</CalendarUID></Task>`);
  for (const o of outline) {
    if (o.kind === "task") { body.push(taskXml.get(o.uid)); continue; }
    const w = o.row;
    const s = summarySpan.get(o.uid) || [projStart, projStart];
    body.push(`<Task><UID>${o.uid}</UID><ID>${o.uid}</ID><Name>${esc(nm(w.wbs_name || w.wbs_short_name))}</Name><Active>1</Active><Manual>0</Manual><Type>1</Type><IsNull>0</IsNull><WBS>${esc(codeOf(w))}</WBS><OutlineNumber>${o.outlineNumber}</OutlineNumber><OutlineLevel>${o.level}</OutlineLevel><Start>${isoDate(s[0])}</Start><Finish>${isoDate(s[1])}</Finish><Summary>1</Summary><ExtendedAttribute><FieldID>${TEXT1}</FieldID><Value>${esc(w.wbs_short_name)}</Value></ExtendedAttribute></Task>`);
  }

  // resources and assignments
  const assigns = (T.TASKRSRC || []).filter((a) => taskUid.has(a.task_id));
  const usedRsrc = new Set(assigns.map((a) => a.rsrc_id));
  const rsrcUid = new Map();
  const res = [];
  for (const r of T.RSRC || []) {
    if (!usedRsrc.has(r.rsrc_id)) continue;
    const uid = rsrcUid.size + 1;
    rsrcUid.set(r.rsrc_id, uid);
    const material = r.rsrc_type === "RT_Mat";
    const cal = !material && calRows.has(r.clndr_id) ? useCal(r.clndr_id).uid : null;
    res.push(`<Resource><UID>${uid}</UID><ID>${uid}</ID><Name>${esc(nm(r.rsrc_name || r.rsrc_short_name || r.rsrc_id))}</Name><Type>${material ? 0 : 1}</Type><IsNull>0</IsNull><Initials>${esc(r.rsrc_short_name || "")}</Initials>${material ? `<MaterialLabel>${esc(r.unit_of_measure || "")}</MaterialLabel>` : ""}${cal ? `<CalendarUID>${cal}</CalendarUID>` : ""}</Resource>`);
  }
  const asg = [];
  let unknownRsrc = 0;
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
    asg.push(`<Assignment><UID>${asg.length + 1}</UID><TaskUID>${taskUid.get(a.task_id)}</TaskUID><ResourceUID>${ru}</ResourceUID><PercentWorkComplete>${pctW}</PercentWorkComplete><ActualCost>${Math.round(actC * 100)}</ActualCost><ActualWork>${ptHours(actQ)}</ActualWork><Cost>${Math.round(cost * 100)}</Cost>${s ? `<Finish>${isoDate(s[1])}</Finish>` : ""}<RemainingCost>${Math.round(remC * 100)}</RemainingCost><RemainingWork>${ptHours(remQ)}</RemainingWork>${s ? `<Start>${isoDate(s[0])}</Start>` : ""}<Units>${r4(units)}</Units><Work>${ptHours(atComplete)}</Work><Baseline><Number>0</Number><Work>${ptHours(tgtQ)}</Work><Cost>${Math.round((num(a.target_cost) || 0) * 100)}</Cost></Baseline></Assignment>`);
  }
  counts.resources = res.length;
  counts.assignments = asg.length;

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
    "<NewTasksEffortDriven>0</NewTasksEffortDriven>",
    dataDate !== null ? `<StatusDate>${isoDate(dataDate)}</StatusDate>` : "",
    "<NewTasksAreManual>0</NewTasksAreManual>",
    `<ExtendedAttributes><ExtendedAttribute><FieldID>${TEXT1}</FieldID><FieldName>Text1</FieldName><Alias>Activity ID</Alias></ExtendedAttribute></ExtendedAttributes>`,
    "<Calendars>", ...calXml, "</Calendars>",
    "<Tasks>", ...body, "</Tasks>",
    "<Resources>", ...res, "</Resources>",
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
  if (unknownRsrc) warnings.push(`${unknownRsrc} assignment(s) name a resource the file does not list and were left out`);
  const notCarried = [];
  const nCodes = (T.TASKACTV || []).filter((r) => taskUid.has(r.task_id)).length;
  const nUdf = (T.UDFVALUE || []).filter((r) => taskUid.has(r.fk_id)).length;
  const nMemo = (T.TASKMEMO || []).filter((r) => taskUid.has(r.task_id)).length;
  const nProc = (T.TASKPROC || []).filter((r) => taskUid.has(r.task_id)).length;
  const nCost = (T.PROJCOST || []).filter((r) => taskUid.has(r.task_id)).length;
  if (nCodes) notCarried.push(`${nCodes} activity code assignment(s)`);
  if (nUdf) notCarried.push(`${nUdf} user-defined field value(s)`);
  if (nMemo) notCarried.push(`${nMemo} notebook entr${nMemo === 1 ? "y" : "ies"}`);
  if (nProc) notCarried.push(`${nProc} step(s)`);
  if (nCost) notCarried.push(`${nCost} expense(s)`);
  if (notCarried.length) warnings.push(`not carried: ${notCarried.join(", ")}`);

  return { xml, project: { id: pid, name: proj.proj_short_name || pid, dataDate: proj.last_recalc_date || "" }, counts, warnings, taskUid };
}

export const msprojectSummary = (r) =>
  `${r.counts.activities} activities, ${r.counts.wbs} WBS summary tasks, ${r.counts.links} relationships, ${r.counts.calendars} calendar${r.counts.calendars === 1 ? "" : "s"}, ${r.counts.resources} resources and ${r.counts.assignments} assignments written`;
