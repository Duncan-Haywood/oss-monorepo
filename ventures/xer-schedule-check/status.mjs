// Status a schedule "as planned" to a new data date: the next update a
// contractor would submit if every activity had gone exactly as the last one
// forecast. Work whose recomputed early start is before the new data date gets
// that actual start; work whose early finish is by then is complete on that
// finish; work under way keeps the remaining duration left to its early
// finish. The stored early and late dates and total float are then refreshed
// from a schedule run at the new data date, as P6 writes them on export.
//
// statusAsPlanned(xer, projId, dataDateMinutes, { slips }) -> new xer
//
// slips: [{ code, hours }] adds working hours to an activity's remaining
// duration after statusing (an activity forecast to finish in the period is
// left in progress with that much remaining): planted progress delay, for
// checking a windows analysis against a known answer. It is also the
// "what if we hold to the plan" baseline for a forecast.

import { schedule } from "./cpm.mjs";
import { formatDate } from "./xer.mjs";

const SPAN = new Set(["TT_LOE", "TT_WBS"]);
const hrs = (m) => String(Math.round((m / 60) * 1000) / 1000);

export function cloneXer(xer) {
  return { ...xer, tables: Object.fromEntries(Object.entries(xer.tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))])) };
}

export function statusAsPlanned(xer, projId, dd, { slips = [] } = {}) {
  const res = schedule(xer);
  const x = cloneXer(xer);
  const slipBy = new Map(slips.map((s) => [s.code, Math.round(s.hours * 60)]));
  for (const row of x.tables.TASK || []) {
    if (row.proj_id !== projId || SPAN.has(row.task_type) || row.status_code === "TK_Complete") continue;
    const t = res.model.tasks.get(row.task_id), r = res.tasks.get(row.task_id);
    if (!t || !r || r.ef === undefined) continue;
    const es = r.remES ?? r.es, ef = r.ef;
    const slip = slipBy.get(row.task_code) || 0;
    if (es >= dd && !slip) continue;
    const start = t.actStart ?? Math.min(es, dd);
    if (ef <= dd && !slip) {
      row.status_code = "TK_Complete";
      row.act_start_date = formatDate(start);
      row.act_end_date = formatDate(ef);
      row.remain_drtn_hr_cnt = "0";
      if ("phys_complete_pct" in row) row.phys_complete_pct = "100";
      continue;
    }
    // in progress at the new data date (or held there by a planted slip)
    const left = ef > dd ? t.cal.workBetween(Math.max(dd, es), ef) : 0;
    row.status_code = "TK_Active";
    row.act_start_date = formatDate(start);
    row.act_end_date = "";
    row.remain_drtn_hr_cnt = hrs(left + slip);
  }
  x.tables.PROJECT = (x.tables.PROJECT || []).map((p) => (p.proj_id === projId ? { ...p, last_recalc_date: formatDate(dd) } : p));
  // refresh the stored dates, as P6 does when it schedules before export
  const r2 = schedule(x);
  for (const row of x.tables.TASK || []) {
    if (row.proj_id !== projId) continue;
    const r = r2.tasks.get(row.task_id);
    if (!r || r.ef === undefined) continue;
    if (row.status_code !== "TK_Complete") {
      row.early_start_date = formatDate(r.remES ?? r.es);
      row.early_end_date = formatDate(r.ef);
      if (r.lf !== undefined) row.late_end_date = formatDate(r.lf);
      if (r.tf !== undefined && r.tf !== null) row.total_float_hr_cnt = String(r.tf);
    }
  }
  const p2 = r2.projects.get(projId);
  if (p2 && p2.finish !== null) x.tables.PROJECT = x.tables.PROJECT.map((p) => (p.proj_id === projId ? { ...p, scd_end_date: formatDate(p2.finish) } : p));
  return x;
}
