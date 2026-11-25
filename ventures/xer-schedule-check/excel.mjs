// XER to an Excel workbook (.xlsx). The most common thing a person without a
// P6 seat wants from an XER is to see it as a table they can sort, filter and
// pivot: activities with their WBS, dates, float, codes and logic, and the
// resources and costs behind them. An XER is P6's database tables flattened
// to tab-separated text, keyed by internal ids (task_id 4183 follows
// task_id 4177), so opening it in Excel shows numbers no one can read. This
// file resolves every key to what P6 shows (activity IDs, WBS paths, calendar,
// resource and code names), writes durations and float in days of each
// activity's calendar, and dates as real Excel dates, so they sort and filter.
//
// Runs in Node and the browser; imports only this venture's own modules.
//
//   workbookSheets(xer, { projId, raw, result }) -> { sheets: [{ name, rows, widths, kinds }], summary, warnings }
//     rows: arrays of cells; a cell is a string, a number, null, or { date: minutes } (xer.mjs parseDate)
//   await xerToXlsx(xer, opts) -> { bytes: Uint8Array, summary, warnings }
//   await xlsxFromSheets(sheets, { deflate }) -> Uint8Array (deflate: async bytes -> raw-deflate bytes, or null to store)
//   xlsxSummary(summary) -> one line for the page and the CLI
//
// Sheets: Read me, Activities, Relationships, WBS, Resources, Assignments,
// Expenses (when the file has any), Calendars, Activity codes, and with
// { raw: true } every XER table as it is ("XER TASK", ...), one column per
// field, for someone who wants P6's own column names.

import { parseDate, num } from "./xer.mjs";
import { schedule } from "./cpm.mjs";

const TYPES = { TT_Task: "Task Dependent", TT_Rsrc: "Resource Dependent", TT_Mile: "Start Milestone", TT_FinMile: "Finish Milestone", TT_LOE: "Level of Effort", TT_WBS: "WBS Summary" };
const STATUS = { TK_NotStart: "Not Started", TK_Active: "In Progress", TK_Complete: "Completed" };
const CSTR = { CS_MSO: "Start On", CS_MSOB: "Start On or Before", CS_MSOA: "Start On or After", CS_MEO: "Finish On", CS_MEOB: "Finish On or Before", CS_MEOA: "Finish On or After", CS_ALAP: "As Late As Possible", CS_MANDSTART: "Mandatory Start", CS_MANDFIN: "Mandatory Finish" };
const REL = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
const RSRC = { RT_Labor: "Labor", RT_Equip: "Nonlabor", RT_Mat: "Material" };
const CALTYPE = { CA_Base: "Global", CA_Project: "Project", CA_Rsrc: "Resource" };
const PCT = { CP_Phys: "Physical", CP_Drtn: "Duration", CP_Units: "Units" };

// Excel's cell limit is 32,767 characters; a longer value (a notebook pasted
// into a UDF) is cut and the cut counted.
const CELL_MAX = 32767;
const round = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const lab = (map, v) => (v ? map[v] || v : "");
const d8 = (x) => (x === null ? null : { date: x });
const dateCell = (s) => d8(parseDate(s));

export function workbookSheets(xer, { projId = null, raw = false, result = undefined } = {}) {
  const T = xer.tables || {};
  const warnings = [];
  const projects = (T.PROJECT || []).filter((p) => !projId || p.proj_id === projId);
  const projCode = new Map((T.PROJECT || []).map((p) => [p.proj_id, p.proj_short_name || p.proj_id]));
  const inProj = (pid) => !projId || pid === projId;

  // calendars: hours per day turns P6's hour counts into the days P6 shows
  const cals = new Map((T.CALENDAR || []).map((c) => [c.clndr_id, c]));
  const defaultCal = (T.CALENDAR || []).find((c) => c.default_flag === "Y");
  const hpdOf = (calId) => {
    const c = cals.get(calId) || defaultCal;
    const h = c ? num(c.day_hr_cnt) : null;
    return h && h > 0 && h <= 24 ? h : 8;
  };
  const days = (hours, calId) => (hours === null ? null : round(hours / hpdOf(calId)));

  // WBS paths, as P6 shows them: short names joined with "." below the project node
  const wbs = new Map((T.PROJWBS || []).map((w) => [w.wbs_id, w]));
  const pathMemo = new Map();
  const wbsPath = (id) => {
    if (pathMemo.has(id)) return pathMemo.get(id);
    const parts = [], seen = new Set();
    let w = wbs.get(id);
    while (w && w.proj_node_flag !== "Y" && !seen.has(w.wbs_id)) {
      seen.add(w.wbs_id);
      parts.unshift(w.wbs_short_name || w.wbs_id);
      w = wbs.get(w.parent_wbs_id);
    }
    const p = parts.join(".");
    pathMemo.set(id, p);
    return p;
  };

  const allTasks = T.TASK || [];
  const tasks = allTasks.filter((t) => t.task_id && inProj(t.proj_id));
  const byId = new Map(allTasks.map((t) => [t.task_id, t]));

  // the recomputed dates, from the same engine as the checks (open activities only)
  let res = null;
  if (result !== null) {
    try { res = (result || schedule(xer)).tasks; } catch (e) { warnings.push(`the schedule could not be recomputed (${e.message}); the recomputed columns are empty`); }
  }

  // logic
  const preds = new Map(), succs = new Map();
  const relRows = [["Predecessor ID", "Predecessor Name", "Successor ID", "Successor Name", "Relationship Type", "Lag (d)", "Lag (h)", "Predecessor Project", "Successor Project", "Predecessor Status", "Successor Status"]];
  const lagText = (lagH, calId) => {
    if (!lagH) return "";
    const d = round(lagH / hpdOf(calId));
    return `${d > 0 ? "+" : ""}${d}d`;
  };
  for (const r of T.TASKPRED || []) {
    const s = byId.get(r.task_id), p = byId.get(r.pred_task_id);
    if (!(s && inProj(s.proj_id)) && !(p && inProj(p.proj_id))) continue;
    const lagH = num(r.lag_hr_cnt) ?? 0;
    const type = lab(REL, r.pred_type);
    const pc = p ? p.task_code : `(task ${r.pred_task_id}, not in the file)`;
    const sc = s ? s.task_code : `(task ${r.task_id}, not in the file)`;
    if (s) (preds.get(s.task_id) || preds.set(s.task_id, []).get(s.task_id)).push(`${pc} ${type}${lagText(lagH, s.clndr_id)}`);
    if (p) (succs.get(p.task_id) || succs.set(p.task_id, []).get(p.task_id)).push(`${sc} ${type}${lagText(lagH, s ? s.clndr_id : p.clndr_id)}`);
    relRows.push([pc, p ? p.task_name : "", sc, s ? s.task_name : "", type, days(lagH, s ? s.clndr_id : p?.clndr_id), round(lagH), projCode.get(p?.proj_id ?? r.pred_proj_id) || "", projCode.get(s?.proj_id ?? r.proj_id) || "", p ? lab(STATUS, p.status_code) : "", s ? lab(STATUS, s.status_code) : ""]);
  }

  // activity codes: one column per code type that this export's activities use
  const codeTypes = new Map((T.ACTVTYPE || []).map((c) => [c.actv_code_type_id, c]));
  const codeVals = new Map((T.ACTVCODE || []).map((c) => [c.actv_code_id, c]));
  const taskIds = new Set(tasks.map((t) => t.task_id));
  const taskCodes = new Map(); // task_id -> Map(typeId -> short name)
  const usedTypes = new Map(); // typeId -> count
  for (const a of T.TASKACTV || []) {
    if (!taskIds.has(a.task_id)) continue;
    const v = codeVals.get(a.actv_code_id);
    const typeId = a.actv_code_type_id || v?.actv_code_type_id;
    if (!typeId) continue;
    (taskCodes.get(a.task_id) || taskCodes.set(a.task_id, new Map()).get(a.task_id)).set(typeId, v ? v.short_name : a.actv_code_id);
    usedTypes.set(typeId, (usedTypes.get(typeId) || 0) + 1);
  }
  const typeOrder = [...usedTypes.keys()].sort((a, b) => (num(codeTypes.get(a)?.seq_num) ?? 0) - (num(codeTypes.get(b)?.seq_num) ?? 0) || String(codeTypes.get(a)?.actv_code_type ?? a).localeCompare(String(codeTypes.get(b)?.actv_code_type ?? b)));

  // activity user-defined fields
  const udfTypes = (T.UDFTYPE || []).filter((u) => u.table_name === "TASK");
  const udfCodes = new Map((T.UDFCODE || []).map((c) => [c.udf_code_id, c]));
  const udfVals = new Map(); // `${type}|${task}` -> cell
  const udfUsed = new Set();
  const udfById = new Map(udfTypes.map((u) => [u.udf_type_id, u]));
  const udfTypeIds = new Set(udfById.keys());
  for (const v of T.UDFVALUE || []) {
    if (!udfTypeIds.has(v.udf_type_id) || !taskIds.has(v.fk_id)) continue;
    const u = udfById.get(v.udf_type_id);
    const kind = u.logical_data_type || "";
    let cell;
    if (/DATE/.test(kind)) cell = dateCell(v.udf_date);
    else if (/INT|FLOAT|MONEY|NUM/.test(kind)) cell = num(v.udf_number);
    else if (kind === "FT_STATICTYPE") { const c = udfCodes.get(v.udf_code_id); cell = c ? c.short_name || c.udf_code_name : v.udf_code_id || ""; }
    else cell = v.udf_text ?? "";
    if (cell === null || cell === "") continue;
    udfVals.set(`${v.udf_type_id}|${v.fk_id}`, cell);
    udfUsed.add(v.udf_type_id);
  }
  const udfOrder = udfTypes.filter((u) => udfUsed.has(u.udf_type_id));

  // Activities
  const head = ["Project", "WBS Code", "WBS Name", "Activity ID", "Activity Name", "Activity Type", "Activity Status", "Calendar",
    "Original Duration (d)", "Remaining Duration (d)", "Activity % Complete", "% Complete Type",
    "Start", "Finish", "Actual Start", "Actual Finish", "Early Start", "Early Finish", "Late Start", "Late Finish", "Planned Start", "Planned Finish",
    "Total Float (d)", "Free Float (d)", "Longest Path", "Primary Constraint", "Primary Constraint Date", "Secondary Constraint", "Secondary Constraint Date",
    "Predecessors", "Successors",
    "Recomputed Early Start", "Recomputed Early Finish", "Recomputed Late Start", "Recomputed Late Finish", "Recomputed Total Float (d)", "Recomputed Free Float (d)", "Float Agrees",
    ...typeOrder.map((id) => codeTypes.get(id)?.actv_code_type || `Code type ${id}`),
    ...udfOrder.map((u) => u.udf_type_label || `UDF ${u.udf_type_id}`)];
  const act = [head];
  let recomputed = 0, compared = 0, agree = 0;
  for (const t of tasks) {
    const cal = t.clndr_id;
    const r = res ? res.get(t.task_id) : null;
    const has = r && r.lf !== undefined && t.status_code !== "TK_Complete" && t.task_type !== "TT_WBS";
    const storedTf = num(t.total_float_hr_cnt);
    let agrees = "";
    if (has) {
      recomputed++;
      if (storedTf !== null) { compared++; agrees = Math.abs(storedTf - r.tf) < 0.01 ? "yes" : "no"; if (agrees === "yes") agree++; }
    }
    const pctPhys = num(t.phys_complete_pct);
    const pct = t.complete_pct_type === "CP_Drtn" ? (() => { const o = num(t.target_drtn_hr_cnt), rem = num(t.remain_drtn_hr_cnt); return o ? round(Math.max(0, Math.min(100, (1 - (rem ?? o) / o) * 100)), 1) : t.status_code === "TK_Complete" ? 100 : 0; })() : pctPhys;
    const codes = taskCodes.get(t.task_id);
    act.push([
      projCode.get(t.proj_id) || t.proj_id, wbsPath(t.wbs_id), wbs.get(t.wbs_id)?.wbs_name || "", t.task_code, t.task_name,
      lab(TYPES, t.task_type), lab(STATUS, t.status_code), cals.get(cal)?.clndr_name || "",
      days(num(t.target_drtn_hr_cnt), cal), days(num(t.remain_drtn_hr_cnt), cal), pct, lab(PCT, t.complete_pct_type),
      dateCell(t.act_start_date || t.restart_date || t.early_start_date || t.target_start_date) ?? (has ? d8(r.remES ?? r.es) : null),
      dateCell(t.act_end_date || t.reend_date || t.early_end_date || t.target_end_date) ?? (has ? d8(r.ef) : null),
      dateCell(t.act_start_date), dateCell(t.act_end_date), dateCell(t.early_start_date), dateCell(t.early_end_date), dateCell(t.late_start_date), dateCell(t.late_end_date),
      dateCell(t.target_start_date), dateCell(t.target_end_date),
      days(storedTf, cal), days(num(t.free_float_hr_cnt), cal), t.driving_path_flag === "Y" ? "yes" : "",
      lab(CSTR, t.cstr_type), dateCell(t.cstr_date), lab(CSTR, t.cstr_type2), dateCell(t.cstr_date2),
      (preds.get(t.task_id) || []).join(", "), (succs.get(t.task_id) || []).join(", "),
      has ? d8(r.remES ?? r.es) : null, has ? d8(r.ef) : null, has ? d8(r.remLS ?? r.ls) : null, has ? d8(r.lf) : null,
      has ? days(r.tf, cal) : null, has && r.ff !== undefined ? days(r.ff, cal) : null, agrees,
      ...typeOrder.map((id) => codes?.get(id) ?? ""),
      ...udfOrder.map((u) => udfVals.get(`${u.udf_type_id}|${t.task_id}`) ?? null),
    ]);
  }

  // WBS
  const wbsCount = new Map();
  for (const t of tasks) wbsCount.set(t.wbs_id, (wbsCount.get(t.wbs_id) || 0) + 1);
  const wbsRows = [["Project", "WBS Code", "WBS Name", "Parent WBS Code", "Level", "Activities"]];
  for (const w of T.PROJWBS || []) {
    if (!inProj(w.proj_id) || w.proj_node_flag === "Y") continue;
    const p = wbsPath(w.wbs_id);
    wbsRows.push([projCode.get(w.proj_id) || w.proj_id, p, w.wbs_name || "", wbsPath(w.parent_wbs_id), p.split(".").length, wbsCount.get(w.wbs_id) || 0]);
  }

  // Resources
  const rsrc = new Map((T.RSRC || []).map((r) => [r.rsrc_id, r]));
  const rsrcRows = [["Resource ID", "Resource Name", "Resource Type", "Parent Resource ID", "Calendar", "Max Units / Hour", "Unit of Measure", "Active", "Assignments"]];
  const asgCount = new Map();
  const asg = (T.TASKRSRC || []).filter((a) => taskIds.has(a.task_id));
  for (const a of asg) asgCount.set(a.rsrc_id, (asgCount.get(a.rsrc_id) || 0) + 1);
  const units = new Map((T.UMEASURE || []).map((u) => [u.unit_id, u.unit_abbrev || u.unit_name]));
  for (const r of T.RSRC || []) {
    rsrcRows.push([r.rsrc_short_name || r.rsrc_id, r.rsrc_name || "", lab(RSRC, r.rsrc_type), rsrc.get(r.parent_rsrc_id)?.rsrc_short_name || "", cals.get(r.clndr_id)?.clndr_name || "",
      num(r.def_qty_per_hr), units.get(r.unit_id) || "", r.active_flag === "N" ? "no" : "yes", asgCount.get(r.rsrc_id) || 0]);
  }

  // Assignments
  const sum = (...xs) => { const v = xs.map(num).filter((x) => x !== null); return v.length ? round(v.reduce((a, b) => a + b, 0)) : null; };
  const asgRows = [["Activity ID", "Activity Name", "Resource ID", "Resource Name", "Budgeted Units", "Actual Units", "Remaining Units", "At Completion Units", "Budgeted Cost", "Actual Cost", "Remaining Cost", "At Completion Cost", "Start", "Finish", "Resource Curve"]];
  const curves = new Map((T.RSRCCURVDATA || []).map((c) => [c.curv_id, c.curv_name]));
  for (const a of asg) {
    const t = byId.get(a.task_id), r = rsrc.get(a.rsrc_id);
    const actU = sum(a.act_reg_qty, a.act_ot_qty), actC = sum(a.act_reg_cost, a.act_ot_cost);
    asgRows.push([t.task_code, t.task_name, r?.rsrc_short_name || a.rsrc_id || "", r?.rsrc_name || "",
      round(num(a.target_qty)), actU, round(num(a.remain_qty)), sum(actU, a.remain_qty),
      round(num(a.target_cost)), actC, round(num(a.remain_cost)), sum(actC, a.remain_cost),
      dateCell(a.act_start_date || a.restart_date || a.target_start_date), dateCell(a.act_end_date || a.reend_date || a.target_end_date), a.curv_id ? curves.get(a.curv_id) || a.curv_id : ""]);
  }

  // Expenses
  const costTypes = new Map((T.COSTTYPE || []).map((c) => [c.cost_type_id, c.cost_type]));
  const expRows = [["Activity ID", "Activity Name", "Expense Item", "Cost Category", "Budgeted Cost", "Actual Cost", "Remaining Cost", "At Completion Cost", "Accrual Type"]];
  for (const e of T.PROJCOST || []) {
    if (!taskIds.has(e.task_id)) continue;
    const t = byId.get(e.task_id);
    expRows.push([t.task_code, t.task_name, e.cost_name || "", costTypes.get(e.cost_type_id) || "", round(num(e.target_cost)), round(num(e.act_cost)), round(num(e.remain_cost)), sum(e.act_cost, e.remain_cost), (e.cost_load_type || "").replace(/^CL_/, "")]);
  }

  // Calendars
  const calUse = new Map();
  for (const t of tasks) calUse.set(t.clndr_id, (calUse.get(t.clndr_id) || 0) + 1);
  const calRows = [["Calendar", "Type", "Hours / Day", "Hours / Week", "Default", "Activities"]];
  for (const c of T.CALENDAR || []) calRows.push([c.clndr_name || c.clndr_id, lab(CALTYPE, c.clndr_type), num(c.day_hr_cnt), num(c.week_hr_cnt), c.default_flag === "Y" ? "yes" : "", calUse.get(c.clndr_id) || 0]);

  // Activity codes
  const valUse = new Map();
  for (const m of taskCodes.values()) for (const [, v] of m) valUse.set(v, (valUse.get(v) || 0) + 1);
  const valCount = new Map();
  for (const a of T.TASKACTV || []) if (taskIds.has(a.task_id)) valCount.set(a.actv_code_id, (valCount.get(a.actv_code_id) || 0) + 1);
  const codeRows = [["Code Type", "Code Value", "Description", "Parent Code Value", "Activities"]];
  for (const c of T.ACTVCODE || []) {
    const ty = codeTypes.get(c.actv_code_type_id);
    if (ty && ty.proj_id && projId && ty.proj_id !== projId) continue;
    codeRows.push([ty?.actv_code_type || c.actv_code_type_id, c.short_name || "", c.actv_code_name || "", codeVals.get(c.parent_actv_code_id)?.short_name || "", valCount.get(c.actv_code_id) || 0]);
  }

  const summary = {
    projects: projects.map((p) => projCode.get(p.proj_id)), activities: tasks.length, relationships: relRows.length - 1, wbs: wbsRows.length - 1,
    resources: rsrcRows.length - 1, assignments: asgRows.length - 1, expenses: expRows.length - 1, calendars: calRows.length - 1,
    codeTypes: typeOrder.length, udfs: udfOrder.length, recomputed, floatCompared: compared, floatAgrees: agree, rawTables: 0, cut: 0,
  };

  const dataDates = projects.map((p) => `${projCode.get(p.proj_id)}: data date ${p.last_recalc_date || "not stored"}`);
  const readme = [
    ["XER Schedule Check: this workbook"],
    [`Made from a Primavera P6 XER export${xer.version ? ` (P6 version ${xer.version}` : ""}${xer.exportDate ? `${xer.version ? ", " : " ("}exported ${xer.exportDate})` : xer.version ? ")" : ""}. ${dataDates.join("; ")}.`],
    [`${summary.activities} activities, ${summary.relationships} relationships, ${summary.wbs} WBS elements, ${summary.resources} resources, ${summary.assignments} resource assignments${summary.expenses ? `, ${summary.expenses} expenses` : ""}, ${summary.calendars} calendars, ${summary.codeTypes} activity code types and ${summary.udfs} activity user-defined fields as columns.`],
    [""],
    ["Activities: one row per activity, with its WBS path, the dates and float P6 stored at its last schedule run, constraints, every predecessor and successor (\"A1010 FS+2d\"), one column per activity code type and per activity user-defined field."],
    ["Durations, float and lags are in working days of the activity's own calendar (its hours per day, from the Calendars sheet), as P6 shows them by default. Lags use the successor's calendar. The Relationships sheet also gives each lag in hours."],
    ["Start is the actual start once the activity has started, else its early start; Finish likewise (from the recomputed run when the file stores no date, as some converter files do). Dates are Excel dates (sort and filter work); the time of day is kept."],
    ["The Recomputed columns are this tool's own critical path run from the logic, calendars, constraints and progress in the file (open activities only). Float Agrees says whether P6's stored total float matches it: a \"no\" usually means a duration, lag or link was edited after P6 last scheduled the file."],
    ["Relationships, WBS, Resources, Assignments, Expenses, Calendars and Activity codes are the file's other tables with every internal id replaced by the name P6 shows."],
    ...(raw ? [["Sheets named \"XER <table>\" are the file's tables as they are, one column per field, under P6's own field names."]] : []),
    [""],
    ["Made by XER Schedule Check (FSL-1.1-MIT licence): https://marisstella.app/xer-schedule-check/ . Nothing was uploaded: the file was read on your computer."],
    ["Not scheduling, contractual or legal advice. Not affiliated with or endorsed by Oracle. Check figures against P6 before relying on them."],
  ];
  if (warnings.length) readme.push([""], ...warnings.map((w) => [`Note: ${w}`]));

  const sheets = [
    { name: "Read me", rows: readme, widths: [140], header: false },
    { name: "Activities", rows: act },
    { name: "Relationships", rows: relRows },
    { name: "WBS", rows: wbsRows },
    { name: "Resources", rows: rsrcRows },
    { name: "Assignments", rows: asgRows },
    ...(expRows.length > 1 ? [{ name: "Expenses", rows: expRows }] : []),
    { name: "Calendars", rows: calRows },
    { name: "Activity codes", rows: codeRows },
  ];
  if (raw) {
    for (const [name, rows] of Object.entries(T)) {
      const fields = [];
      for (const r of rows) for (const k of Object.keys(r)) if (!fields.includes(k)) fields.push(k);
      sheets.push({ name: sheetName(`XER ${name}`, sheets), rows: [fields, ...rows.map((r) => fields.map((f) => r[f] ?? ""))], text: true });
      summary.rawTables++;
    }
  }
  return { sheets, summary, warnings };
}

// Excel's sheet-name rules: at most 31 characters, none of : \ / ? * [ ], unique.
function sheetName(s, taken) {
  let n = s.replace(/[:\\/?*[\]]/g, "_").slice(0, 31);
  const names = new Set(taken.map((x) => x.name.toLowerCase()));
  for (let i = 2; names.has(n.toLowerCase()); i++) n = `${s.slice(0, 31 - String(i).length - 1)}~${i}`;
  return n;
}

export const xlsxSummary = (s) =>
  `${s.activities} activities, ${s.relationships} relationships, ${s.wbs} WBS elements, ${s.resources} resources, ${s.assignments} assignments${s.expenses ? `, ${s.expenses} expenses` : ""}; ${s.codeTypes} code type and ${s.udfs} user-defined field columns${s.floatCompared ? `; P6's stored total float matches the recomputed float on ${s.floatAgrees} of ${s.floatCompared} open activities` : ""}${s.rawTables ? `; ${s.rawTables} raw XER tables` : ""}${s.cut ? `; ${s.cut} cells longer than Excel's 32,767 characters were cut` : ""}`;

export async function xerToXlsx(xer, opts = {}) {
  const wb = workbookSheets(xer, opts);
  const stats = { cut: 0 };
  const bytes = await xlsxFromSheets(wb.sheets, { deflate: opts.deflate, stats });
  wb.summary.cut = stats.cut;
  if (stats.cut) wb.warnings.push(`${stats.cut} cell${stats.cut === 1 ? "" : "s"} longer than Excel's 32,767-character limit ${stats.cut === 1 ? "was" : "were"} cut`);
  return { bytes, summary: wb.summary, warnings: wb.warnings };
}

// ------------------------------------------------------------- xlsx writer

const maxLen = (rows) => { let m = 1; for (const r of rows) if (r.length > m) m = r.length; return m; };
const colName = (i) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
// XML 1.0 forbids most C0 controls even as references; P6 memos can carry them
const xmlText = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlAttr = (s) => xmlText(s).replace(/"/g, "&quot;");
// minutes since 1970 (wall clock) -> Excel's 1900 date serial
const serial = (min) => min / 1440 + 25569;

// styles: 0 general, 1 bold header, 2 date and time, 3 text (raw tables)
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function cellXml(v, ref, header, text, stats) {
  if (v === null || v === undefined || v === "") return "";
  if (header) return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${xmlText(v)}</t></is></c>`;
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : "";
  if (typeof v === "object" && "date" in v) return Number.isFinite(v.date) ? `<c r="${ref}" s="2"><v>${serial(v.date)}</v></c>` : "";
  let s = String(v);
  if (s.length > CELL_MAX) { s = s.slice(0, CELL_MAX); stats.cut++; }
  return `<c r="${ref}" t="inlineStr"${text ? ` s="3"` : ""}><is><t xml:space="preserve">${xmlText(s)}</t></is></c>`;
}

function widthsOf(rows) {
  const n = rows.length ? rows[0].length : 0;
  const w = [];
  for (let i = 0; i < n; i++) {
    let m = 6;
    for (const r of rows.slice(0, 300)) {
      const v = r[i];
      const len = v === null || v === undefined ? 0 : typeof v === "object" ? 16 : String(v).length;
      if (len > m) m = len;
    }
    w.push(Math.min(60, m + 2));
  }
  return w;
}

function sheetXml(sh, stats) {
  const header = sh.header !== false;
  const rows = sh.rows;
  const widths = sh.widths || widthsOf(rows);
  const ncol = maxLen(rows);
  const parts = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`];
  if (header && rows.length > 1) parts.push(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`);
  if (widths.length) parts.push(`<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`);
  parts.push("<sheetData>");
  const cols = Array.from({ length: ncol }, (_, i) => colName(i));
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    let row = `<row r="${ri + 1}">`;
    for (let ci = 0; ci < r.length; ci++) row += cellXml(r[ci], cols[ci] + (ri + 1), header && ri === 0, sh.text, stats);
    parts.push(row + "</row>");
  }
  parts.push("</sheetData>");
  if (header && rows.length > 1) parts.push(`<autoFilter ref="A1:${cols[ncol - 1]}${rows.length}"/>`);
  parts.push("</worksheet>");
  return parts.join("");
}

export async function xlsxFromSheets(sheets, { deflate = defaultDeflate(), stats = { cut: 0 } } = {}) {
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const filters = sheets.map((sh, i) => (sh.header !== false && sh.rows.length > 1 ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${sh.name.replace(/'/g, "''")}'!$A$1:$${colName(maxLen(sh.rows) - 1)}$${sh.rows.length}</definedName>` : "")).join("");
  const files = [
    { name: "[Content_Types].xml", data: ct },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="${sheets.length > 1 ? 1 : 0}"/></bookViews><sheets>${sheets.map((sh, i) => `<sheet name="${xmlAttr(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ""}</workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: STYLES },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh, stats) })),
  ];
  return zip(files, deflate);
}

// --------------------------------------------------------------- zip writer

function defaultDeflate() {
  if (typeof CompressionStream !== "function") return null;
  return async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// a zip of { name, data } (data: string or bytes), each entry deflated when
// that makes it smaller, else stored; no zip64 (an XER large enough to need it
// would exceed Excel's own limits first)
async function zip(files, deflate) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const le = (n, v) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (v >>> (8 * i)) & 0xff; return a; };
  const cat = (...xs) => { const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of xs) { out.set(x, p); p += x.length; } return out; };
  // a fixed DOS date (2026-01-01 00:00), so the same input gives the same bytes
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    let body = data, method = 0;
    if (deflate && data.length > 64) {
      const z = await deflate(data);
      if (z.length < data.length) { body = z; method = 8; }
    }
    const head = cat(le(4, 0x04034b50), le(2, 20), le(2, 0x0800), le(2, method), le(2, dosTime), le(2, dosDate), le(4, crc), le(4, body.length), le(4, data.length), le(2, name.length), le(2, 0));
    parts.push(head, name, body);
    central.push(cat(le(4, 0x02014b50), le(2, 20), le(2, 20), le(2, 0x0800), le(2, method), le(2, dosTime), le(2, dosDate), le(4, crc), le(4, body.length), le(4, data.length), le(2, name.length), le(2, 0), le(2, 0), le(2, 0), le(2, 0), le(4, 0), le(4, offset)), name);
    offset += head.length + name.length + body.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = cat(le(4, 0x06054b50), le(2, 0), le(2, 0), le(2, files.length), le(2, files.length), le(4, cdSize), le(4, offset), le(2, 0));
  return cat(...parts, ...central, end);
}
