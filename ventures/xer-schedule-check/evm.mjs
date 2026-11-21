// Earned value and the cost (or hours) S-curve from a P6 XER's resource
// assignments, plus the cost-loading faults an owner's reviewer looks for
// before trusting a pay application built on the schedule.
//
// earnedValue(xer, { projId, result }) -> {
//   measure: "cost" | "hours" | null,   null: nothing loaded
//   currency, dataDate, plannedStart, plannedFinish, forecastFinish,
//   totals: { bac, pv, ev, ac, etc, eac, sv, cv, spi, cpi, eacCpi, eacCpiSpi,
//             vac, tcpi, pctPlanned, pctEarned, pctSpent },
//   earnedSchedule: { es, at, spit, svt, pd, ieacDate } (days) or null,
//   curve: [{ date, pv, ac, forecast }] cumulative at each month end,
//   wbs: [{ wbs, bac, pv, ev, ac, eac, spi, cpi }],
//   activities: [{ code, name, wbs, status, pct, bac, pv, ev, ac, etc, eac, sv, cv }],
//   findings: [{ id, name, note, items: [...] }],
//   notes: [string]
// }
//
// What each figure is, in P6's own terms:
//   budget (BAC)   TASKRSRC.target_cost (P6 "Budgeted Cost") plus project
//                  expenses (PROJCOST.target_cost);
//   actual (AC)    act_reg_cost + act_ot_cost (+ PROJCOST.act_cost);
//   to complete    remain_cost (+ PROJCOST.remain_cost); EAC = AC + ETC,
//                  the at-completion cost P6 shows;
//   earned (EV)    budget x the activity's percent complete, P6's default
//                  "activity percent complete" technique: physical %, the
//                  duration % (1 - remaining / original duration) or the
//                  units % (actual / (actual + remaining) units), by the
//                  activity's percent complete type; 100% once finished.
//                  A project whose PROJECT row carries ev_compute_type
//                  (EC_0_100, EC_50_50, EC_PCT_CUSTOM with ev_user_pct) is
//                  earned that way instead;
//   planned (PV)   each assignment's budget spread evenly over the working
//                  time of its planned dates (target_start_date to
//                  target_end_date, the activity's when the assignment has
//                  none) on the activity's calendar, summed to the data date.
//                  P6 sets planned dates to the scheduled dates until work
//                  starts; many schedulers keep them as the baseline. A file
//                  carries no timephased baseline, so this is the curve the
//                  planned dates imply, said aloud in `notes`. An
//                  assignment on a P6 resource curve (TASKRSRC.curv_id,
//                  RSRCCURVDATA) is spread by that curve's twenty slices of
//                  working time instead of evenly (curves.mjs); so is the
//                  remaining of an assignment with nothing spent yet.
// Actual cost is drawn evenly from actual start to actual finish (the data
// date while the work runs); the remaining cost evenly over the remaining
// dates the CPM engine recomputes (cpm.mjs), so the forecast curve follows
// the logic, not dates P6 last stored.
// No cost in the file but labour hours: the same in hours (target_qty,
// act_reg_qty + act_ot_qty, remain_qty on RT_Labor assignments).
//
// Earned schedule (Lipke): ES is when the planned curve reached today's
// earned value; SPI(t) = ES / AT, which, unlike SPI, does not drift back to
// 1.0 at the end of a late job. IEAC(t) = planned duration / SPI(t).

import { schedule } from "./cpm.mjs";
import { parseDate, formatDate, num } from "./xer.mjs";
import { readCurves, isEven, spreadCurve, curvePartBefore } from "./curves.mjs";

const DAY = 1440;
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const div = (a, b) => (b ? a / b : null);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Spread `amount` evenly over the working minutes of [s, e) on `cal`, into a
// daily array (`add(dayIndex, part, minuteInDayEnd)`); also returns the part
// before `cut`. A span with no working time puts the whole amount at its end.
function spread(cal, s, e, amount, add, cut) {
  if (!amount) return 0;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  if (e < s) [s, e] = [e, s];
  const total = e > s && cal ? cal.workBetween(s, e) : 0;
  if (!(total > 0)) {
    add(Math.floor(e / DAY), amount);
    return e <= cut ? amount : 0;
  }
  let before = 0;
  for (let d = Math.floor(s / DAY), last = Math.floor((e - 1) / DAY); d <= last; d++) {
    const base = d * DAY;
    let dayMin = 0;
    for (const [a, b] of cal.day(d)) {
      const x = Math.max(base + a, s), y = Math.min(base + b, e);
      if (y <= x) continue;
      dayMin += y - x;
      if (y <= cut) before += y - x;
      else if (x < cut) before += cut - x;
    }
    if (dayMin) add(d, (amount * dayMin) / total);
  }
  return (amount * before) / total;
}

function wbsNames(xer) {
  const rows = new Map((xer.tables.PROJWBS || []).map((w) => [w.wbs_id, w]));
  const memo = new Map();
  // the first level below the project node: the breakdown a cost report uses
  const top = (id) => {
    if (memo.has(id)) return memo.get(id);
    let w = rows.get(id), prev = null;
    const seen = new Set();
    while (w && w.proj_node_flag !== "Y" && w.parent_wbs_id && rows.has(w.parent_wbs_id) && !seen.has(w.wbs_id)) {
      seen.add(w.wbs_id);
      prev = w;
      w = rows.get(w.parent_wbs_id);
    }
    const node = w && w.proj_node_flag === "Y" ? prev : w;
    const name = node ? node.wbs_name || node.wbs_short_name || node.wbs_id : "(no WBS)";
    memo.set(id, name);
    return name;
  };
  return top;
}

// The share of the activity's work done, as P6's earned value reads it.
export function percentComplete(row, evType = null, evUserPct = null) {
  const status = row.status_code;
  if (status === "TK_Complete") return 1;
  if (evType === "EC_0_100") return 0;
  if (evType === "EC_50_50") return status === "TK_Active" ? 0.5 : 0;
  if (evType === "EC_PCT_CUSTOM") return status === "TK_Active" ? clamp01((num(evUserPct) ?? 0) / 100) : 0;
  const type = row.complete_pct_type || "CP_Drtn";
  if (type === "CP_Phys") return clamp01((num(row.phys_complete_pct) ?? 0) / 100);
  if (type === "CP_Units") {
    const act = (num(row.act_work_qty) ?? 0) + (num(row.act_equip_qty) ?? 0);
    const rem = (num(row.remain_work_qty) ?? 0) + (num(row.remain_equip_qty) ?? 0);
    return act + rem > 0 ? clamp01(act / (act + rem)) : 0;
  }
  if (status !== "TK_Active") return 0;
  const od = num(row.target_drtn_hr_cnt) ?? 0, rd = num(row.remain_drtn_hr_cnt) ?? 0;
  return od > 0 ? clamp01(1 - rd / od) : 0;
}

// The part of `amount`, spread evenly over the working time of [s, e), that
// falls before `cut`.
function partBefore(cal, s, e, amount, cut) {
  if (!amount || !Number.isFinite(s) || !Number.isFinite(e)) return 0;
  if (e < s) [s, e] = [e, s];
  const total = e > s && cal ? cal.workBetween(s, e) : 0;
  if (!(total > 0)) return e <= cut ? amount : 0;
  if (cut <= s) return 0;
  if (cut >= e) return amount;
  return (amount * cal.workBetween(s, cut)) / total;
}

// pvCuts: [minutes]: also return the planned value at each of those dates
// (pvAt, same order), from this file's planned dates: how a series of updates
// holds the first update's planned curve as its baseline (evmseries.mjs).
// measure: "cost" or "hours" to choose (hours gives the manpower curve on a
// cost-loaded file); by default cost when any is loaded, else labour hours.
// curves: false spreads every assignment evenly, ignoring P6 resource curves.
export function earnedValue(xer, { projId = null, result = null, pvCuts = null, measure: want = null, curves: useCurves = true } = {}) {
  result = result || schedule(xer);
  const model = result.model;
  const T = xer.tables;
  const proj = model.projects.get(projId) || [...model.projects.values()][0];
  const pid = proj?.id ?? null;
  const projRow = (T.PROJECT || []).find((p) => p.proj_id === pid) || {};
  const dd = proj?.dataDate ?? null;
  const notes = [];
  const rows = new Map((T.TASK || []).filter((r) => r.proj_id === pid || pid === null).map((r) => [r.task_id, r]));
  const rsrcType = new Map((T.RSRC || []).map((r) => [r.rsrc_id, r.rsrc_type]));
  const assigns = (T.TASKRSRC || []).filter((a) => rows.has(a.task_id));
  const expenses = (T.PROJCOST || []).filter((c) => rows.has(c.task_id));
  const costOf = (a) => (num(a.target_cost) ?? 0) + (num(a.act_reg_cost) ?? 0) + (num(a.act_ot_cost) ?? 0) + (num(a.remain_cost) ?? 0);
  const anyCost = assigns.some((a) => costOf(a) > 0) || expenses.some((c) => (num(c.target_cost) ?? 0) + (num(c.act_cost) ?? 0) + (num(c.remain_cost) ?? 0) > 0);
  const labour = assigns.filter((a) => rsrcType.get(a.rsrc_id) === "RT_Labor" && (num(a.target_qty) ?? 0) + (num(a.act_reg_qty) ?? 0) + (num(a.remain_qty) ?? 0) > 0);
  const measure = want === "hours" ? (labour.length ? "hours" : null) : want === "cost" ? (anyCost ? "cost" : null) : anyCost ? "cost" : labour.length ? "hours" : null;
  const empty = { measure, currency: null, dataDate: formatDate(dd), project: proj?.code ?? null, totals: null, earnedSchedule: null, curve: [], wbs: [], activities: [], findings: [], notes };
  if (!measure) {
    if (want === "hours" && assigns.length) notes.push("No labour hours are loaded on the resource assignments (RT_Labor budgeted, actual or remaining units).");
    else if (want === "cost" && assigns.length) notes.push("No cost is loaded on the resource assignments or expenses.");
    else notes.push(assigns.length ? "The resource assignments carry no budgeted, actual or remaining cost and no labour hours, so there is nothing to earn against." : "The file has no resource assignments (TASKRSRC) or expenses (PROJCOST): the schedule is not cost or resource loaded.");
    return empty;
  }
  const currency = measure === "cost" ? (xer.currency || (T.CURRTYPE || []).length === 1 && T.CURRTYPE[0].curr_short_name || (T.CURRTYPE || []).find((c) => c.base_exch_rate === "1")?.curr_short_name || null) : "h";
  if (measure === "hours") notes.push(anyCost ? "Earned value in labour hours, as asked (RT_Labor assignments: budgeted, actual and remaining units); the file also carries cost." : "No cost is loaded, so earned value is in labour hours (RT_Labor assignments: budgeted, actual and remaining units).");
  const items = [];
  // P6 resource curves: an assignment naming one is spread by it
  const curves = useCurves ? readCurves(xer) : new Map();
  const curveUse = new Map();
  let curveMissing = 0;
  const curveOf = (a) => {
    if (!a.curv_id || !useCurves) return null;
    const c = curves.get(a.curv_id);
    if (!c) { curveMissing++; return null; }
    if (isEven(c.slices)) return null;
    curveUse.set(c.name, (curveUse.get(c.name) || 0) + 1);
    return c.slices;
  };
  // per assignment: budget, actual, remaining, planned span, actual span
  if (measure === "cost") {
    for (const a of assigns) items.push({ task: a.task_id, bac: num(a.target_cost) ?? 0, ac: (num(a.act_reg_cost) ?? 0) + (num(a.act_ot_cost) ?? 0), etc: num(a.remain_cost) ?? 0, ps: parseDate(a.target_start_date), pf: parseDate(a.target_end_date), as: parseDate(a.act_start_date), af: parseDate(a.act_end_date), curve: curveOf(a) });
    for (const c of expenses) items.push({ task: c.task_id, bac: num(c.target_cost) ?? 0, ac: num(c.act_cost) ?? 0, etc: num(c.remain_cost) ?? 0, ps: null, pf: null, as: null, af: null, expense: true });
  } else {
    for (const a of labour) items.push({ task: a.task_id, bac: num(a.target_qty) ?? 0, ac: (num(a.act_reg_qty) ?? 0) + (num(a.act_ot_qty) ?? 0), etc: num(a.remain_qty) ?? 0, ps: parseDate(a.target_start_date), pf: parseDate(a.target_end_date), as: parseDate(a.act_start_date), af: parseDate(a.act_end_date), curve: curveOf(a) });
  }
  // the day range of the curve
  let lo = Infinity, hi = -Infinity;
  const see = (t) => { if (Number.isFinite(t)) { lo = Math.min(lo, t); hi = Math.max(hi, t); } };
  const evType = projRow.ev_compute_type || null;
  if (evType && evType !== "EC_Cmp_pct") notes.push(`The project earns value by ${({ EC_0_100: "0/100 (nothing until finished)", EC_50_50: "50/50 (half at the start, half at the finish)", EC_PCT_CUSTOM: `a fixed ${num(projRow.ev_user_pct) ?? 0}% at the start` })[evType] || evType}, as its earned value setting says.`);
  const per = new Map();
  const getAct = (id) => {
    if (!per.has(id)) {
      const r = rows.get(id), t = model.tasks.get(id), c = result.tasks.get(id);
      const pct = percentComplete(r, evType, projRow.ev_user_pct);
      per.set(id, { id, row: r, t, c, pct, bac: 0, ac: 0, etc: 0, pv: 0 });
    }
    return per.get(id);
  };
  const daily = { pv: new Map(), ac: new Map(), fc: new Map() };
  const adder = (m) => (d, v) => m.set(d, (m.get(d) || 0) + v);
  let missingPlan = 0, acAfterDd = 0;
  const pvAt = (pvCuts || []).map(() => 0);
  for (const it of items) {
    const A = getAct(it.task);
    const r = A.row, cal = A.t?.cal || proj?.cal;
    A.bac += it.bac; A.ac += it.ac; A.etc += it.etc;
    // planned dates: the assignment's, else the activity's planned dates,
    // else its actual or early dates (a file that never set planned dates)
    let ps = it.ps ?? parseDate(r.target_start_date), pf = it.pf ?? parseDate(r.target_end_date);
    if (it.expense || ps === null || pf === null) {
      if (!it.expense && it.bac && (ps === null || pf === null)) missingPlan++;
      const es = A.c && Number.isFinite(A.c.es) ? A.c.es : null, ef = A.c && Number.isFinite(A.c.ef) ? A.c.ef : null;
      ps = ps ?? parseDate(r.target_start_date) ?? parseDate(r.act_start_date) ?? parseDate(r.early_start_date) ?? es;
      pf = pf ?? parseDate(r.target_end_date) ?? parseDate(r.act_end_date) ?? parseDate(r.early_end_date) ?? ef ?? ps;
      if (pf !== null && ps !== null && pf < ps) pf = ps;
    }
    see(ps); see(pf);
    A.pv += it.curve ? spreadCurve(cal, ps, pf, it.bac, it.curve, adder(daily.pv), dd ?? Infinity) : spread(cal, ps, pf, it.bac, adder(daily.pv), dd ?? Infinity);
    if (pvCuts) for (let k = 0; k < pvCuts.length; k++) pvAt[k] += it.curve ? curvePartBefore(cal, ps, pf, it.bac, it.curve, pvCuts[k]) : partBefore(cal, ps, pf, it.bac, pvCuts[k]);
    // actual: actual start to actual finish, or to the data date
    if (it.ac) {
      let as = it.as ?? parseDate(r.act_start_date) ?? dd ?? ps;
      // an actual start after the data date (an invalid date, DCMA check 9)
      // is drawn at the data date, so the spending stays on the curve: past
      // the data date the forecast line adds no actuals
      if (dd !== null && as > dd) { as = dd; acAfterDd++; }
      let af = it.af ?? parseDate(r.act_end_date) ?? dd ?? as;
      if (dd !== null && af > dd) af = dd;
      see(as); see(af);
      spread(cal, as, Math.max(as, af), it.ac, adder(daily.ac), Infinity);
    }
    // remaining: over the recomputed remaining dates
    if (it.etc) {
      let rs, rf;
      if (A.c && Number.isFinite(A.c.es) && Number.isFinite(A.c.ef)) { rs = A.c.es; rf = A.c.ef; }
      else { rs = parseDate(r.restart_date) ?? parseDate(r.early_start_date) ?? dd; rf = parseDate(r.reend_date) ?? parseDate(r.early_end_date) ?? rs; }
      if (dd !== null) { rs = Math.max(rs ?? dd, dd); rf = Math.max(rf ?? rs, rs); }
      see(rs); see(rf);
      // a curved assignment with nothing spent keeps its curve over the
      // remaining dates; once work is booked the rest is spread evenly
      if (it.curve && !it.ac) spreadCurve(cal, rs, rf, it.etc, it.curve, adder(daily.fc), Infinity);
      else spread(cal, rs, rf, it.etc, adder(daily.fc), Infinity);
    }
  }
  if (acAfterDd) notes.push(`${acAfterDd} assignment${acAfterDd === 1 ? " has" : "s have"} actual ${measure} on an actual start after the data date (an invalid date); ${acAfterDd === 1 ? "it is" : "they are"} drawn at the data date.`);
  if (missingPlan) notes.push(`${missingPlan} budgeted assignment${missingPlan === 1 ? " has" : "s have"} no planned dates of ${missingPlan === 1 ? "its" : "their"} own; the activity's planned dates were used, else its actual dates, else the early dates (stored, then recomputed): planned value then follows the forecast for that work.`);
  if (dd !== null) see(dd);
  const top = wbsNames(xer);
  const acts = [];
  const tot = { bac: 0, pv: 0, ev: 0, ac: 0, etc: 0 };
  for (const A of per.values()) {
    const ev = A.bac * A.pct;
    tot.bac += A.bac; tot.pv += A.pv; tot.ev += ev; tot.ac += A.ac; tot.etc += A.etc;
    acts.push({ code: A.row.task_code, name: A.row.task_name, wbs: top(A.row.wbs_id), status: A.row.status_code, type: A.row.task_type, pctType: A.row.complete_pct_type || null, pct: r3(A.pct), bac: r2(A.bac), pv: r2(A.pv), ev: r2(ev), ac: r2(A.ac), etc: r2(A.etc), eac: r2(A.ac + A.etc), sv: r2(ev - A.pv), cv: r2(ev - A.ac) });
  }
  acts.sort((a, b) => (a.cv ?? 0) - (b.cv ?? 0) || (a.code < b.code ? -1 : 1));
  // totals and indices
  const eac = tot.ac + tot.etc;
  const spi = div(tot.ev, tot.pv), cpi = div(tot.ev, tot.ac);
  const totals = {
    bac: r2(tot.bac), pv: r2(tot.pv), ev: r2(tot.ev), ac: r2(tot.ac), etc: r2(tot.etc), eac: r2(eac),
    sv: r2(tot.ev - tot.pv), cv: r2(tot.ev - tot.ac), spi: r3(spi), cpi: r3(cpi),
    eacCpi: cpi ? r2(tot.ac + (tot.bac - tot.ev) / cpi) : null,
    eacCpiSpi: cpi && spi ? r2(tot.ac + (tot.bac - tot.ev) / (cpi * spi)) : null,
    vac: r2(tot.bac - eac),
    tcpi: tot.bac - tot.ac > 0 ? r3((tot.bac - tot.ev) / (tot.bac - tot.ac)) : null,
    pctPlanned: r3(div(tot.pv, tot.bac)), pctEarned: r3(div(tot.ev, tot.bac)), pctSpent: r3(div(tot.ac, tot.bac)),
  };
  // daily cumulative planned curve, for earned schedule and the S-curve
  const d0 = Math.floor(lo / DAY), d1 = Math.floor(hi / DAY);
  const n = Number.isFinite(d0) && Number.isFinite(d1) && d1 >= d0 ? d1 - d0 + 1 : 0;
  const cum = (m) => { const out = new Float64Array(n); let s = 0; for (let i = 0; i < n; i++) { s += m.get(d0 + i) || 0; out[i] = s; } return out; };
  const PV = cum(daily.pv), AC = cum(daily.ac), FC = cum(daily.fc);
  // earned schedule, in calendar days from the planned start
  let earnedSchedule = null;
  const firstPv = PV.findIndex((v) => v > 0);
  if (n && dd !== null && tot.bac > 0 && firstPv >= 0) {
    const start = d0 + firstPv;
    const endIdx = PV.findIndex((v) => v >= tot.bac * (1 - 1e-9));
    const pd = (endIdx >= 0 ? d0 + endIdx + 1 : d1 + 1) - start;
    // the day the planned curve reaches EV, interpolated within the day
    let es = 0;
    if (tot.ev > 0) {
      const k = PV.findIndex((v) => v >= tot.ev - 1e-9);
      if (k < 0) es = pd;
      else {
        const prev = k > 0 ? PV[k - 1] : 0;
        const frac = PV[k] > prev ? (tot.ev - prev) / (PV[k] - prev) : 1;
        es = d0 + k + frac - start;
      }
    }
    // whole days before the data date's day: a data date is a day's start
    const at = Math.floor(dd / DAY) - start;
    if (at > 0) {
      const spit = es / at;
      earnedSchedule = { start: formatDate(start * DAY), es: Math.round(es * 10) / 10, at: Math.round(at * 10) / 10, spit: r3(spit), svt: Math.round((es - at) * 10) / 10, pd: r2(pd), ieacDays: spit > 0 ? Math.round(pd / spit) : null, ieacDate: spit > 0 ? new Date(Math.round(start + pd / spit) * 86400000).toISOString().slice(0, 10) : null };
    }
  }
  // the S-curve at month ends (and the data date)
  const curve = [];
  if (n) {
    const acAtDd = dd !== null ? (Math.floor(dd / DAY) - d0 >= 0 ? AC[Math.min(n - 1, Math.floor(dd / DAY) - d0)] : 0) : null;
    // the curve starts from nothing the day before the first planned or actual day
    curve.push({ date: new Date((d0 - 1) * 86400000).toISOString().slice(0, 10), pv: 0, ac: dd === null || d0 * DAY <= dd ? 0 : null, forecast: null });
    for (let i = 0; i < n; i++) {
      const day = d0 + i, dt = new Date(day * 86400000), next = new Date((day + 1) * 86400000);
      const isMonthEnd = next.getUTCDate() === 1 || i === n - 1;
      // the data-date point: the end of the day before the data date's day
      const isDd = dd !== null && day === Math.floor(dd / DAY) - 1;
      if (!isMonthEnd && !isDd) continue;
      const past = dd === null || (day + 1) * DAY <= dd;
      curve.push({ date: dt.toISOString().slice(0, 10), pv: r2(PV[i]), ac: past ? r2(AC[i]) : null, forecast: past ? null : r2((acAtDd ?? 0) + FC[i]), dataDate: isDd || undefined });
    }
  }
  // per top-level WBS
  const byWbs = new Map();
  for (const a of acts) {
    const w = byWbs.get(a.wbs) || { wbs: a.wbs, bac: 0, pv: 0, ev: 0, ac: 0, eac: 0 };
    w.bac += a.bac; w.pv += a.pv; w.ev += a.ev; w.ac += a.ac; w.eac += a.eac;
    byWbs.set(a.wbs, w);
  }
  const wbs = [...byWbs.values()].map((w) => ({ wbs: w.wbs, bac: r2(w.bac), pv: r2(w.pv), ev: r2(w.ev), ac: r2(w.ac), eac: r2(w.eac), spi: r3(div(w.ev, w.pv)), cpi: r3(div(w.ev, w.ac)), vac: r2(w.bac - w.eac) })).sort((a, b) => b.bac - a.bac);
  // cost-loading faults
  const findings = [];
  const add = (id, name, note, list) => findings.push({ id, name, note, items: list.slice(0, 2000), count: list.length });
  const pick = (a) => ({ code: a.code, name: a.name, status: a.status, pct: a.pct, bac: a.bac, ev: a.ev, ac: a.ac, etc: a.etc });
  const loaded = new Set([...per.values()].filter((A) => A.bac || A.ac || A.etc).map((A) => A.id));
  const open = [...rows.values()].filter((r) => r.status_code !== "TK_Complete" && !["TT_Mile", "TT_FinMile", "TT_LOE", "TT_WBS"].includes(r.task_type));
  const unloaded = open.filter((r) => !loaded.has(r.task_id));
  const big = (x) => Math.abs(x) > (measure === "cost" ? 1 : 0.1);
  add("unloaded", `Open activities with no ${measure === "cost" ? "budget" : "budgeted hours"}`, `Work that carries no ${measure === "cost" ? "cost" : "hours"} earns nothing when it is done, so the total misses its value and progress on it is invisible to earned value. A cost-loaded schedule is usually required to sum to the contract value.`, unloaded.map((r) => ({ code: r.task_code, name: r.task_name, status: r.status_code })));
  add("actual-not-started", `${measure === "cost" ? "Cost" : "Hours"} spent on activities not started`, "Actuals booked against work the schedule says has not begun: the start date or the booking is wrong.", acts.filter((a) => a.status === "TK_NotStart" && big(a.ac)).map(pick));
  add("remaining-finished", `Finished activities still carrying ${measure === "cost" ? "cost" : "hours"} to complete`, "A finished activity's remaining should be zero; what is left inflates the estimate at completion.", acts.filter((a) => a.status === "TK_Complete" && big(a.etc)).map(pick));
  add("progress-no-cost", `Progress with no ${measure === "cost" ? "cost" : "hours"} spent`, "Percent complete earned with nothing booked: either actuals are not being recorded, or progress is claimed ahead of the work. Ask for the cost records before paying on it.", tot.ac > 0 ? acts.filter((a) => a.pct > 0 && a.status !== "TK_Complete" && !big(a.ac) && big(a.ev)).map(pick) : []);
  add("earned-ahead", "Earned well ahead of spending (more than 1.5 times)", "Value earned outruns what was spent by half again or more. On a lump-sum job this is how a front-loaded pay claim shows: check the percent complete on site.", acts.filter((a) => a.status !== "TK_Complete" && big(a.ac) && a.ev > 1.5 * a.ac).map(pick));
  add("overrun", "Spent more than the budget", `Actual ${measure === "cost" ? "cost" : "hours"} already past the budget: the estimate at completion is over before the work ends.`, acts.filter((a) => big(a.ac) && a.ac > a.bac * 1.0001 && a.bac >= 0).map(pick).sort((x, y) => (y.ac - y.bac) - (x.ac - x.bac)));
  // actuals P6 computed from percent complete ("auto compute actuals", or
  // costs entered as budget x percent): actual equals earned on nearly every
  // activity, so the cost index measures nothing
  const withAc = acts.filter((a) => big(a.ac));
  const mirrored = withAc.filter((a) => Math.abs(a.ev - a.ac) <= Math.max(1e-6, 0.001 * Math.abs(a.ac)));
  const actualsFromProgress = withAc.length >= 5 && mirrored.length >= 0.9 * withAc.length;
  add("actuals-from-progress", "Actuals equal earned value", `On ${mirrored.length} of ${withAc.length} activities with actuals, the actual equals the budget times percent complete to within 0.1%. Actuals were computed from progress (P6's auto-compute actuals, or costs entered as budget x percent), so the CPI of ${totals.cpi ?? "-"} says nothing about cost performance: ask for the cost ledger.`, actualsFromProgress ? mirrored.map(pick) : []);
  add("eac-under-actual", "Estimate at completion below what is still to do", "Unstarted or running activities whose remaining is less than the budget not yet earned (by more than 25%): the forecast assumes the rest will cost much less than planned.", acts.filter((a) => a.status !== "TK_Complete" && a.bac - a.ev > 0 && a.etc < 0.75 * (a.bac - a.ev) && big(a.bac - a.ev - a.etc)).map(pick));
  // plain-language notes
  if (dd === null) notes.push("The file has no data date, so planned value is not cut at a date.");
  if (actualsFromProgress) notes.push(`Actual ${measure} equals earned value on ${mirrored.length} of ${withAc.length} activities with actuals: they were computed from percent complete, not booked, so CPI and the CPI-based estimates are not cost evidence.`);
  const nCurved = [...curveUse.values()].reduce((a, b) => a + b, 0);
  if (nCurved) notes.push(`${nCurved} assignment${nCurved === 1 ? " follows" : "s follow"} a P6 resource curve (${[...curveUse].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(", ")}): ${nCurved === 1 ? "its" : "their"} planned value is spread by the curve's twenty slices of working time, not evenly.`);
  if (curveMissing) notes.push(`${curveMissing} assignment${curveMissing === 1 ? " names" : "s name"} a resource curve the file does not carry (no RSRCCURVDATA row for its curv_id), so ${curveMissing === 1 ? "it is" : "they are"} spread evenly.`);
  notes.push(`Planned value follows the planned dates stored in the file (P6's planned start and finish), spread ${nCurved ? "evenly over working time unless a resource curve says otherwise" : "evenly over working time"}. If the scheduler re-baselined, planned dates may have moved too; a baseline export gives a firmer curve.`);
  return { ...empty, currency, totals, earnedSchedule, ...(pvCuts ? { pvAt: pvAt.map(r2) } : {}), curve, wbs, activities: acts, findings, plannedStart: n ? formatDate(d0 * DAY) : null, forecastFinish: formatDate(proj ? result.projects.get(proj.id)?.finish ?? null : null) };
}

const money = (v, unit) => (v === null || v === undefined ? "-" : unit === "h" ? `${Math.round(v).toLocaleString("en-US")} h` : `${unit ? unit + " " : ""}${Math.round(v).toLocaleString("en-US")}`);
const pct = (v) => (v === null || v === undefined ? "-" : `${(v * 100).toFixed(1)}%`);

export function earnedValueText(r) {
  const out = [];
  if (!r.measure) return `Earned value: ${r.notes.join(" ")}\n`;
  const t = r.totals, u = r.currency;
  out.push(`Earned value at ${r.dataDate} (${r.measure}${u && u !== "h" ? `, ${u}` : ""})`);
  out.push(`  Budget at completion   ${money(t.bac, u)}`);
  out.push(`  Planned value (PV)     ${money(t.pv, u)}  (${pct(t.pctPlanned)} of budget)`);
  out.push(`  Earned value (EV)      ${money(t.ev, u)}  (${pct(t.pctEarned)})`);
  out.push(`  Actual (AC)            ${money(t.ac, u)}  (${pct(t.pctSpent)})`);
  out.push(`  Schedule variance      ${money(t.sv, u)}   SPI ${t.spi ?? "-"}`);
  out.push(`  Cost variance          ${money(t.cv, u)}   CPI ${t.cpi ?? "-"}`);
  out.push(`  At completion (file)   ${money(t.eac, u)}   variance ${money(t.vac, u)}`);
  out.push(`  At completion at CPI   ${money(t.eacCpi, u)};  at CPI x SPI ${money(t.eacCpiSpi, u)};  TCPI ${t.tcpi ?? "-"}`);
  if (r.earnedSchedule) {
    const e = r.earnedSchedule;
    out.push(`  Earned schedule        ${e.es} of ${e.at} days elapsed (SPI(t) ${e.spit}, ${e.svt} days); at this rate the planned ${e.pd} days take ${e.ieacDays} (finish about ${e.ieacDate}; the logic says ${r.forecastFinish ?? "-"})`);
  }
  if (r.wbs.length > 1) {
    out.push("", "By WBS (largest budget first):");
    for (const w of r.wbs.slice(0, 15)) out.push(`  ${String(w.wbs).slice(0, 34).padEnd(34)} BAC ${money(w.bac, u).padStart(16)}  SPI ${String(w.spi ?? "-").padStart(5)}  CPI ${String(w.cpi ?? "-").padStart(5)}  VAC ${money(w.vac, u)}`);
  }
  const f = r.findings.filter((x) => x.count);
  out.push("", f.length ? "Cost-loading checks:" : "Cost-loading checks: none failed.");
  for (const x of f) {
    out.push(`  ${x.name}: ${x.count}`);
    for (const a of x.items.slice(0, 5)) out.push(`    ${a.code}  ${a.name}${a.bac !== undefined ? `  (budget ${money(a.bac, u)}, earned ${money(a.ev, u)}, actual ${money(a.ac, u)}, to go ${money(a.etc, u)})` : ""}`);
    if (x.count > 5) out.push(`    ... ${x.count - 5} more (--csv)`);
  }
  out.push("", ...r.notes.map((s) => `Note: ${s}`));
  return out.join("\n") + "\n";
}

const q = (v) => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function earnedValueCsv(r) {
  const rows = [["Activity ID", "Activity name", "WBS", "Status", "Percent complete", "Budget (BAC)", "Planned value", "Earned value", "Actual", "To complete", "At completion", "Schedule variance", "Cost variance"]];
  for (const a of r.activities) rows.push([a.code, a.name, a.wbs, a.status, a.pct, a.bac, a.pv, a.ev, a.ac, a.etc, a.eac, a.sv, a.cv]);
  return rows.map((x) => x.map(q).join(",")).join("\n") + "\n";
}

export function sCurveCsv(r) {
  const rows = [["Date", "Planned (cumulative)", "Actual (cumulative)", "Forecast (cumulative)"]];
  for (const p of r.curve) rows.push([p.date, p.pv, p.ac, p.forecast]);
  return rows.map((x) => x.map(q).join(",")).join("\n") + "\n";
}

// An inline SVG of the S-curve: planned, actual to the data date, forecast
// after it, and earned value as a point at the data date.
export function sCurveSvg(r, { width = 720, height = 280 } = {}) {
  if (!r.curve.length) return "";
  const pad = { l: 64, r: 12, t: 12, b: 28 };
  const pts = r.curve;
  const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts[pts.length - 1].date);
  const ymax = Math.max(1, ...pts.map((p) => Math.max(p.pv ?? 0, p.ac ?? 0, p.forecast ?? 0)), r.totals?.ev ?? 0);
  const x = (d) => pad.l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (width - pad.l - pad.r);
  const y = (v) => height - pad.b - (v / ymax) * (height - pad.t - pad.b);
  const line = (key) => pts.filter((p) => p[key] !== null && p[key] !== undefined).map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const ddPt = pts.find((p) => p.dataDate);
  const acLast = [...pts].reverse().find((p) => p.ac !== null);
  // the forecast starts where the actual ends
  const fc = acLast ? `M${x(acLast.date).toFixed(1)},${y(acLast.ac).toFixed(1)}` + pts.filter((p) => p.forecast !== null).map((p) => `L${x(p.date).toFixed(1)},${y(p.forecast).toFixed(1)}`).join("") : line("forecast");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => { const v = ymax * f; return `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="currentColor" stroke-opacity=".12"/><text x="${pad.l - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor">${v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : Math.round(v)}</text>`; }).join("");
  const years = [];
  for (let yr = new Date(t0).getUTCFullYear() + 1; Date.UTC(yr, 0, 1) <= t1; yr++) { const d = new Date(Date.UTC(yr, 0, 1)).toISOString().slice(0, 10); years.push(`<text x="${x(d).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="11" fill="currentColor">${yr}</text>`); }
  const ev = ddPt && r.totals ? `<circle cx="${x(ddPt.date).toFixed(1)}" cy="${y(r.totals.ev).toFixed(1)}" r="5" fill="#2e8b57"><title>Earned value ${Math.round(r.totals.ev)}</title></circle><line x1="${x(ddPt.date).toFixed(1)}" x2="${x(ddPt.date).toFixed(1)}" y1="${pad.t}" y2="${height - pad.b}" stroke="currentColor" stroke-dasharray="3 3" stroke-opacity=".5"/>` : "";
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="S-curve: planned, actual, forecast and earned value" style="max-width:${width}px">${ticks}${years}<path d="${line("pv")}" fill="none" stroke="#4a78c2" stroke-width="2"/><path d="${line("ac")}" fill="none" stroke="#c0392b" stroke-width="2"/><path d="${fc}" fill="none" stroke="#c0392b" stroke-width="2" stroke-dasharray="6 4"/>${ev}</svg>`;
}
