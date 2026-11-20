// Earned value across a series of P6 updates of one project, window by
// window: what each period earned, against what the previous update's own
// forecast said it would earn, against the first update's planned curve held
// as the baseline, and against what was spent.
//
// earnedValueSeries([{ xer, label }], { projectName }) -> report (plain JSON)
//
// The updates go in data-date order; each consecutive pair is one window, as
// in windows.mjs. For each update: budget (BAC), planned value from its own
// planned dates (P6 moves the planned dates of work not started with the
// schedule, so this curve drifts), planned value from the first update's
// planned dates (the baseline held), earned and actual, SPI both ways, CPI.
//
// For each window:
//   earned    the change in earned value, activity by activity (matched by
//             activity ID), so the windows add up to the series;
//   promised  what the previous update's forecast would have earned by the
//             new data date: each open activity worked from its recomputed
//             remaining start (cpm.mjs) for the working time up to the new
//             data date, its percent complete then read the way evm.mjs reads
//             it (duration, units or physical percent, or the project's
//             0/100, 50/50 or custom technique). Earned / promised is the
//             period's performance against the contemporaneous plan, which a
//             re-planned baseline cannot hide: 1.000 when the work went exactly
//             as the last update said;
//   baseline  the period's planned value on the first update's planned dates;
//   spent     the change in actual cost (or hours), and earned / spent (CPI).
// And per activity: work that earned less than promised (or more), budgets
// that changed between the updates (a revision, not performance), earned value
// taken back (percent complete went down), actuals that went down, activities
// added or removed.
//
// Earned value cannot say why a period fell short; the windows analysis
// (windows.mjs) says what that did to the finish date. The two together are
// what an owner's reviewer reads before a pay application.

import { schedule } from "./cpm.mjs";
import { parseDate, formatDate, num } from "./xer.mjs";
import { earnedValue, percentComplete } from "./evm.mjs";
import { pickProject, matchingProject } from "./compare.mjs";

const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const div = (a, b) => (b ? a / b : null);
const SPAN = new Set(["TT_LOE", "TT_WBS"]);

function header(xer, name) {
  const rows = xer.tables.PROJECT || [];
  const res = schedule(xer);
  let row = name ? rows.find((r) => r.proj_short_name === name) : null;
  if (!row) {
    const p = pickProject(xer, res.model, null);
    row = rows.find((r) => r.proj_id === p?.id) || rows[0] || {};
  }
  const proj = res.model.projects.get(row.proj_id);
  return { res, projId: row.proj_id, projRow: row, name: row.proj_short_name || "", dataDate: proj?.dataDate ?? parseDate(row.last_recalc_date) ?? parseDate(row.plan_start_date) };
}

// The percent complete the previous update's forecast reaches by `to`.
function promisedPct(row, t, c, to, evType, evUserPct) {
  const pct0 = percentComplete(row, evType, evUserPct);
  if (row.status_code === "TK_Complete" || !c || !Number.isFinite(c.ef)) return pct0;
  const es = c.remES ?? c.es, ef = c.ef;
  if (!Number.isFinite(es) || es >= to) return pct0;
  if (ef <= to) return 1;
  const rem = t.cal.workBetween(es, ef), worked = t.cal.workBetween(es, to);
  const g = rem > 0 ? worked / rem : 0;
  const f = { ...row, status_code: "TK_Active", remain_drtn_hr_cnt: String((rem - worked) / 60) };
  for (const [a, r] of [["act_work_qty", "remain_work_qty"], ["act_equip_qty", "remain_equip_qty"]]) {
    const rq = num(row[r]) ?? 0;
    f[a] = String((num(row[a]) ?? 0) + rq * g);
    f[r] = String(rq * (1 - g));
  }
  const p = num(row.phys_complete_pct) ?? 0;
  f.phys_complete_pct = String(p + (100 - p) * g);
  return Math.max(pct0, percentComplete(f, evType, evUserPct));
}

export function earnedValueSeries(updates, opts = {}) {
  if (!Array.isArray(updates) || updates.length < 2) throw new Error("earned value across updates needs at least two updates of the project");
  const warnings = [];
  const name = opts.projectName || header(updates[updates.length - 1].xer).name;
  const items = updates.map((u, i) => {
    const h = header(u.xer, name);
    const label = u.label || `update ${i + 1}`;
    if (name && h.name && h.name !== name) warnings.push(`${label}: holds no project with ID ${name}; used ${h.name}.`);
    return { ...u, label, ...h };
  });
  items.sort((a, b) => (a.dataDate ?? 0) - (b.dataDate ?? 0));
  const cuts = items.map((it) => it.dataDate);
  // each update's earned value; the first update's planned value at every data date
  for (const [i, it] of items.entries()) {
    it.ev = earnedValue(it.xer, { projId: it.projId, result: it.res, pvCuts: i === 0 ? cuts : null });
  }
  const base = items[0].ev;
  const measure = items.find((it) => it.ev.measure)?.ev.measure ?? null;
  const currency = items.find((it) => it.ev.currency)?.ev.currency ?? null;
  for (const it of items) if (it.ev.measure !== measure) warnings.push(`${it.label}: earned value is in ${it.ev.measure ?? "nothing (not loaded)"}, the series in ${measure}; its figures are left out.`);
  const out = {
    project: name || null,
    measure,
    currency,
    baseline: items[0].label,
    updates: [],
    windows: [],
    total: null,
    warnings,
    notes: [],
  };
  if (!measure) {
    out.notes.push("None of the updates is cost or resource loaded, so there is no earned value to follow.");
    return out;
  }
  const byCode = (it) => new Map(it.ev.activities.map((a) => [a.code, a]));
  for (const [i, it] of items.entries()) {
    const t = it.ev.totals;
    if (!t || it.ev.measure !== measure) { out.updates.push({ label: it.label, dataDate: formatDate(it.dataDate), missing: true }); continue; }
    const pvB = base.pvAt?.[i] ?? null;
    out.updates.push({
      label: it.label, dataDate: formatDate(it.dataDate), bac: t.bac, pv: t.pv, pvBaseline: pvB, ev: t.ev, ac: t.ac, eac: t.eac,
      spi: t.spi, spiBaseline: r3(div(t.ev, pvB)), cpi: t.cpi, spit: it.ev.earnedSchedule?.spit ?? null, forecastFinish: it.ev.forecastFinish,
    });
  }
  let sum = { earned: 0, promised: 0, spent: 0, baseline: 0 };
  for (let i = 1; i < items.length; i++) {
    const A = items[i - 1], B = items[i];
    if (A.ev.measure !== measure || B.ev.measure !== measure) continue;
    const a = byCode(A), b = byCode(B);
    const T = A.xer.tables;
    const prevPid = matchingProject(A.xer, B.name, B.projId) ?? A.projId;
    const rowByCode = new Map((T.TASK || []).filter((r) => r.proj_id === prevPid).map((r) => [r.task_code, r]));
    const projRowA = (T.PROJECT || []).find((p) => p.proj_id === prevPid) || {};
    const evType = projRowA.ev_compute_type || null;
    const TB = B.xer.tables, projRowB = (TB.PROJECT || []).find((p) => p.proj_id === B.projId) || {};
    const rowByCodeB = new Map((TB.TASK || []).filter((r) => r.proj_id === B.projId).map((r) => [r.task_code, r]));
    const tol = measure === "cost" ? 1 : 0.1;
    const behind = [], ahead = [], budget = [], takenBack = [], reversed = [], added = [], removed = [], span = [], costlier = [];
    let earned = 0, promised = 0, earnedJudged = 0, spent = 0;
    for (const [code, x] of a) {
      const y = b.get(code);
      if (!y) { if (x.bac || x.ac) removed.push({ code, name: x.name, bac: x.bac, ev: x.ev, ac: x.ac }); continue; }
      const de = y.ev - x.ev, da = y.ac - x.ac;
      earned += de; spent += da;
      if (Math.abs(y.bac - x.bac) > tol) budget.push({ code, name: y.name, was: x.bac, now: y.bac, change: r2(y.bac - x.bac) });
      if (de < -tol) takenBack.push({ code, name: y.name, was: x.ev, now: y.ev, pctWas: x.pct, pctNow: y.pct });
      if (da < -tol) reversed.push({ code, name: y.name, was: x.ac, now: y.ac });
      // spent in the period well past what the period earned (period CPI under 0.9)
      if (da > tol && da - de > tol && de < 0.9 * da) costlier.push({ code, name: y.name, earned: r2(de), spent: r2(da), cpi: r3(div(de, da)) });
      const row = rowByCode.get(code);
      if (!row || SPAN.has(row.task_type)) { if (Math.abs(de) > tol) span.push({ code, name: y.name, earned: r2(de) }); continue; }
      const t = A.res.model.tasks.get(row.task_id), c = A.res.tasks.get(row.task_id);
      // promised on the previous budget: a budget change is a revision, not progress
      const p = t ? x.bac * (promisedPct(row, t, c, B.dataDate, evType, projRowA.ev_user_pct) - percentComplete(row, evType, projRowA.ev_user_pct)) : 0;

      const pctA = percentComplete(row, evType, projRowA.ev_user_pct);
      const rowB = rowByCodeB.get(code);
      const pctB = rowB ? percentComplete(rowB, projRowB.ev_compute_type || null, projRowB.ev_user_pct) : y.pct;
      const eAtOld = x.bac * (pctB - pctA);
      promised += p; earnedJudged += eAtOld;
      const gap = eAtOld - p;
      if (Math.abs(gap) > Math.max(tol, 0.01 * Math.abs(p))) {
        const rec = { code, name: y.name, promised: r2(p), earned: r2(eAtOld), gap: r2(gap), pctWas: x.pct, pctNow: y.pct, status: y.status, forecastFinish: c && Number.isFinite(c.ef) ? formatDate(c.ef) : null };
        (gap < 0 ? behind : ahead).push(rec);
      }
    }
    for (const [code, y] of b) if (!a.has(code) && (y.bac || y.ac)) { added.push({ code, name: y.name, bac: y.bac, ev: y.ev, ac: y.ac }); earned += y.ev; spent += y.ac; }
    behind.sort((x, y) => x.gap - y.gap); ahead.sort((x, y) => y.gap - x.gap);
    budget.sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
    costlier.sort((x, y) => (x.earned - x.spent) - (y.earned - y.spent));
    const ua = out.updates[i - 1], ub = out.updates[i];
    const baseline = (ub.pvBaseline ?? 0) - (ua.pvBaseline ?? 0);
    sum.earned += earned; sum.promised += promised; sum.spent += spent; sum.baseline += baseline;
    out.windows.push({
      n: i, from: A.label, to: B.label, dataDateFrom: formatDate(A.dataDate), dataDateTo: formatDate(B.dataDate),
      earned: r2(earned), promised: r2(promised), earnedOnPromised: r2(earnedJudged), performance: r3(div(earnedJudged, promised)),
      baseline: r2(baseline), spiBaseline: r3(div(earned, baseline)),
      spent: r2(spent), cpi: r3(div(earned, spent)),
      budgetChange: r2(ub.bac - ua.bac), eacChange: r2(ub.eac - ua.eac),
      behind, ahead, costlier, budgetChanged: budget, earnedTakenBack: takenBack, actualReversed: reversed, added, removed, levelOfEffort: span,
    });
  }
  const first = out.updates[0], last = out.updates[out.updates.length - 1];
  out.total = {
    earned: r2(sum.earned), promised: r2(sum.promised), baseline: r2(sum.baseline), spent: r2(sum.spent),
    spiBaseline: r3(div(sum.earned, sum.baseline)), cpi: r3(div(sum.earned, sum.spent)),
    budgetChange: first.missing || last.missing ? null : r2(last.bac - first.bac),
    eacChange: first.missing || last.missing ? null : r2(last.eac - first.eac),
    // how far each update's own planned curve has drifted from the baseline at its data date
    plannedDrift: out.updates.filter((u) => !u.missing && u.pvBaseline !== null).map((u) => ({ label: u.label, pv: u.pv, pvBaseline: u.pvBaseline, drift: r2(u.pv - u.pvBaseline) })),
  };
  out.notes.push(`Baseline: the planned dates of the earliest update (${items[0].label}), held for the whole series. A file carries no timephased baseline, so if the scheduler moved planned dates before that update, so did this baseline.`);
  out.notes.push("Promised: what the previous update's own forecast would have earned by the next data date, read activity by activity on the previous budget. Earned / promised below 1 says the period fell short of what that update said would happen.");
  if (out.windows.some((w) => w.levelOfEffort.length)) out.notes.push("Level of effort and WBS summary activities earn with the work around them; their earned value is counted but not judged against a forecast.");
  if (out.windows.some((w) => w.budgetChanged.length)) out.notes.push("Budgets changed between updates on some activities: a change of budget moves earned value without any work, so promised and earned are both read on the earlier budget.");
  return out;
}

const fmt = (v, unit) => (v === null || v === undefined ? "-" : unit === "h" ? `${Math.round(v).toLocaleString("en-US")} h` : `${unit ? unit + " " : ""}${Math.round(v).toLocaleString("en-US")}`);
const idx = (v) => (v === null || v === undefined ? "-" : v.toFixed(3));

export function earnedValueSeriesText(rep, { limit = 8 } = {}) {
  const u = rep.measure === "hours" ? "h" : rep.currency;
  const L = [];
  L.push(`Earned value across ${rep.updates.length} updates${rep.project ? ` of ${rep.project}` : ""} (${rep.measure ?? "not loaded"}; baseline: ${rep.baseline})`);
  for (const w of rep.warnings) L.push(`  warning: ${w}`);
  if (!rep.measure) { for (const n of rep.notes) L.push(n); return L.join("\n") + "\n"; }
  L.push("");
  L.push("Update                      data date    budget          planned (own)   planned (base)  earned          actual          SPI base  CPI");
  for (const x of rep.updates) {
    if (x.missing) { L.push(`${x.label.padEnd(28)}${x.dataDate.slice(0, 10)}   (not loaded)`); continue; }
    L.push(`${x.label.slice(0, 27).padEnd(28)}${x.dataDate.slice(0, 10)}   ${fmt(x.bac, u).padEnd(16)}${fmt(x.pv, u).padEnd(16)}${fmt(x.pvBaseline, u).padEnd(16)}${fmt(x.ev, u).padEnd(16)}${fmt(x.ac, u).padEnd(16)}${idx(x.spiBaseline).padEnd(10)}${idx(x.cpi)}`);
  }
  for (const w of rep.windows) {
    L.push("");
    L.push(`Window ${w.n}: ${w.from} to ${w.to} (${w.dataDateFrom.slice(0, 10)} to ${w.dataDateTo.slice(0, 10)})`);
    L.push(`  earned ${fmt(w.earned, u)}; promised by the previous update ${fmt(w.promised, u)} (earned / promised ${idx(w.performance)}); baseline planned ${fmt(w.baseline, u)} (SPI ${idx(w.spiBaseline)}); spent ${fmt(w.spent, u)} (CPI ${idx(w.cpi)})`);
    if (w.budgetChange) L.push(`  budget changed by ${fmt(w.budgetChange, u)} (${w.budgetChanged.length} activities)`);
    const list = (title, rows, f) => { if (!rows.length) return; L.push(`  ${title} (${rows.length}):`); for (const r of rows.slice(0, limit)) L.push(`    ${r.code} ${r.name}: ${f(r)}`); if (rows.length > limit) L.push(`    ... ${rows.length - limit} more`); };
    list("Earned less than promised", w.behind, (r) => `promised ${fmt(r.promised, u)}, earned ${fmt(r.earned, u)}`);
    list("Earned more than promised", w.ahead, (r) => `promised ${fmt(r.promised, u)}, earned ${fmt(r.earned, u)}`);
    list("Spent well past what it earned (period CPI under 0.9)", w.costlier, (r) => `earned ${fmt(r.earned, u)}, spent ${fmt(r.spent, u)}`);
    list("Budget changed", w.budgetChanged, (r) => `${fmt(r.was, u)} to ${fmt(r.now, u)}`);
    list("Earned value taken back", w.earnedTakenBack, (r) => `${fmt(r.was, u)} to ${fmt(r.now, u)}`);
    list("Actuals went down", w.actualReversed, (r) => `${fmt(r.was, u)} to ${fmt(r.now, u)}`);
    list("Added", w.added, (r) => `budget ${fmt(r.bac, u)}`);
    list("Removed", w.removed, (r) => `budget ${fmt(r.bac, u)}, had earned ${fmt(r.ev, u)}`);
  }
  L.push("");
  for (const n of rep.notes) L.push(n);
  return L.join("\n") + "\n";
}

export function earnedValueSeriesCsv(rep) {
  const esc = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [["window", "from", "to", "kind", "code", "name", "promised", "earned", "gap", "was", "now"]];
  for (const w of rep.windows) {
    rows.push([w.n, w.dataDateFrom, w.dataDateTo, "window", "", "", w.promised, w.earned, r2((w.earnedOnPromised ?? 0) - (w.promised ?? 0)), "", ""]);
    for (const r of w.behind) rows.push([w.n, w.dataDateFrom, w.dataDateTo, "behind", r.code, r.name, r.promised, r.earned, r.gap, r.pctWas, r.pctNow]);
    for (const r of w.ahead) rows.push([w.n, w.dataDateFrom, w.dataDateTo, "ahead", r.code, r.name, r.promised, r.earned, r.gap, r.pctWas, r.pctNow]);
    for (const r of w.costlier) rows.push([w.n, w.dataDateFrom, w.dataDateTo, "costlier", r.code, r.name, "", r.earned, "", "", r.spent]);
    for (const r of w.budgetChanged) rows.push([w.n, w.dataDateFrom, w.dataDateTo, "budget", r.code, r.name, "", "", "", r.was, r.now]);
    for (const r of w.earnedTakenBack) rows.push([w.n, w.dataDateFrom, w.dataDateTo, "earned-taken-back", r.code, r.name, "", "", "", r.was, r.now]);
    for (const r of w.actualReversed) rows.push([w.n, w.dataDateFrom, w.dataDateTo, "actual-reversed", r.code, r.name, "", "", "", r.was, r.now]);
    for (const r of w.added) rows.push([w.n, w.dataDateFrom, w.dataDateTo, "added", r.code, r.name, "", r.ev, "", "", r.bac]);
    for (const r of w.removed) rows.push([w.n, w.dataDateFrom, w.dataDateTo, "removed", r.code, r.name, "", r.ev, "", r.bac, ""]);
  }
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
