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
// left in progress with that much remaining; one not yet started stays
// unstarted, its remaining and original durations that much longer): planted
// progress delay, for
// checking a windows analysis against a known answer. It is also the
// "what if we hold to the plan" baseline for a forecast.
//
// Costs and units move with the work (as P6's actuals would, posted at the
// planned rate): for each statused activity the share g of its remaining work
// done in the period (worked time over the remaining duration, plus any slip)
// moves from remaining to actual on the activity's units (act_work_qty,
// remain_work_qty), its physical percent, and each resource assignment's
// units; the cost spent is the remaining cost's share of the time worked
// (time worked over the remaining duration, without the slip), so a slipped
// activity spends at its planned rate but earns less. overruns:
// [{ code, factor }] multiplies the cost an activity spends in the period
// (planted cost overrun with no schedule effect). costs: false leaves every
// cost and unit as it was (the behaviour before 2026-11-20).

import { schedule } from "./cpm.mjs";
import { formatDate, num } from "./xer.mjs";

const SPAN = new Set(["TT_LOE", "TT_WBS"]);
const hrs = (m) => String(Math.round((m / 60) * 1000) / 1000);

export function cloneXer(xer) {
  return { ...xer, tables: Object.fromEntries(Object.entries(xer.tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))])) };
}

const q = (v) => String(Math.round(v * 1e6) / 1e6);

// move share `g` of the remaining units to actual, and spend share `s` of the
// remaining cost (times `factor`), on the activity and its assignments
function progressCosts(row, assigns, g, s, factor) {
  if (g <= 0 && s <= 0) return;
  for (const [a, r] of [["act_work_qty", "remain_work_qty"], ["act_equip_qty", "remain_equip_qty"]]) {
    if (!(r in row)) continue;
    const rem = num(row[r]) ?? 0;
    row[a] = q((num(row[a]) ?? 0) + rem * g);
    row[r] = q(rem * (1 - g));
  }
  if ("phys_complete_pct" in row) {
    const p = num(row.phys_complete_pct) ?? 0;
    row.phys_complete_pct = q(p + (100 - p) * g);
  }
  for (const a of assigns) {
    const rc = num(a.remain_cost) ?? 0;
    if (rc) { a.act_reg_cost = q((num(a.act_reg_cost) ?? 0) + rc * s * factor); a.remain_cost = q(rc * (1 - g)); }
    const rq = num(a.remain_qty) ?? 0;
    if (rq) { a.act_reg_qty = q((num(a.act_reg_qty) ?? 0) + rq * g); a.remain_qty = q(rq * (1 - g)); }
  }
}

export function statusAsPlanned(xer, projId, dd, { slips = [], overruns = [], costs = true } = {}) {
  const res = schedule(xer);
  const x = cloneXer(xer);
  const slipBy = new Map(slips.map((s) => [s.code, Math.round(s.hours * 60)]));
  const overBy = new Map(overruns.map((o) => [o.code, o.factor]));
  const assignsOf = new Map();
  if (costs) for (const a of x.tables.TASKRSRC || []) { if (!assignsOf.has(a.task_id)) assignsOf.set(a.task_id, []); assignsOf.get(a.task_id).push(a); }
  for (const row of x.tables.TASK || []) {
    if (row.proj_id !== projId || SPAN.has(row.task_type) || row.status_code === "TK_Complete") continue;
    const t = res.model.tasks.get(row.task_id), r = res.tasks.get(row.task_id);
    if (!t || !r || r.ef === undefined) continue;
    const es = r.remES ?? r.es, ef = r.ef;
    const slip = slipBy.get(row.task_code) || 0;
    if (es >= dd) {
      // not started by the data date: a planted slip makes it longer, never
      // starts it (an actual start ahead of its predecessors is out of sequence)
      if (slip) for (const f of ["remain_drtn_hr_cnt", "target_drtn_hr_cnt"]) if (f in row) row[f] = hrs(Math.round((num(row[f]) ?? 0) * 60) + slip);
      continue;
    }
    const start = t.actStart ?? Math.min(es, dd);
    // remaining work before the period, and the part of it done by dd
    const rem = ef > es ? t.cal.workBetween(es, ef) : 0;
    const worked = ef > es ? t.cal.workBetween(es, Math.max(es, Math.min(dd, ef))) : 0;
    const factor = overBy.get(row.task_code) ?? 1;
    if (ef <= dd && !slip) {
      if (costs) progressCosts(row, assignsOf.get(row.task_id) || [], 1, 1, factor);
      row.status_code = "TK_Complete";
      row.act_start_date = formatDate(start);
      row.act_end_date = formatDate(ef);
      row.remain_drtn_hr_cnt = "0";
      if ("phys_complete_pct" in row) row.phys_complete_pct = "100";
      continue;
    }
    // in progress at the new data date (or held there by a planted slip)
    const left = ef > dd ? t.cal.workBetween(Math.max(dd, es), ef) : 0;
    if (costs) progressCosts(row, assignsOf.get(row.task_id) || [], rem + slip > 0 ? worked / (rem + slip) : 0, rem > 0 ? worked / rem : 0, factor);
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
