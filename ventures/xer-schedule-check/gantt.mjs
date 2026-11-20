// A Gantt chart of the schedule, the view a P6 user opens first and the one
// an owner, lender or subcontractor without a P6 seat cannot get from an XER:
// the project's WBS as a tree with a summary bar per node, one bar per
// activity (actual, remaining, critical, milestone), the data date, and
// optionally the bar each activity had in a baseline file or the planned
// dates the file keeps, with the finish variance in working days.
//
// spanDates(result, xer) -> Map(task id -> { es, ef, rule: "loe" | "wbs" })
//   Dates for the activities cpm.mjs leaves out of the network: level of
//   effort (TT_LOE) and WBS summary (TT_WBS) activities. P6 computes them
//   from the network after scheduling; the rules below were each found from
//   a mismatch with P6's stored dates on the public files
//   (eval/gantt-check-2026-11-20.md):
//   LOE  start: the earliest date an FS (predecessor's finish + lag) or SS
//        (predecessor's start + lag; a started predecessor's actual start)
//        predecessor allows, never before the data date; with none, the
//        data date. A started LOE keeps its actual start as its start and
//        the date above as its remaining start.
//        finish: the latest date an FS successor (its start - lag), an FF
//        successor (its finish - lag) or an FF predecessor (its finish +
//        lag) asks for, snapped back to the end of a working period on the
//        LOE's calendar; with none, the remaining duration from the start.
//        A finish before the start (successors already past it) leaves a
//        started LOE's remaining start at the data date and a not-started
//        one as a point at its start.
//        LOEs tied to other LOEs are resolved in turn until nothing moves.
//   WBS  the earliest start and latest finish of every activity in the
//        summary's WBS node and the nodes under it (actual dates for work
//        done or started, other WBS summaries left out).
//
// gantt(xer, { projId, result, baseline }) -> {
//   project: { id, code, name, dataDate, finish, mustFinish },
//   rows: [ { kind: "wbs", key, parent, depth, code, name, start, finish, count, critical }
//         | { kind: "task", key, parent, depth, id, code, name, type, status, start, finish,
//             actualTo, remStart, milestone, span, tf, critical, longest, pct, preds: [{ code, type, lag }],
//             baseStart, baseFinish, variance } ],
//   from, to (minutes, the chart's span), baseline: "file" | "planned" | null,
//   summary: { activities, wbs, critical, criticalBy, longestPath, milestones, loe, wbsSummary, complete, active, notStarted, late },
//   warnings }
//   `baseline` is a second parsed schedule (the baseline or an earlier
//   update): its activities are matched by activity ID, and its bars are its
//   own actual dates, else its recomputed early dates. Without one, the
//   planned dates the file stores stand in (P6 moves an unstarted
//   activity's planned dates to its early dates at every schedule run, so
//   they are a baseline only for work already started; said in a warning).
//   variance = baseline finish to current finish, in working days on the
//   activity's calendar (positive = later than the baseline).
//
// ganttSvg(g, view) draws it; ganttHtml(g, view, meta) wraps the SVG in a
// printable page; ganttCsv(g) lists every row. view = { collapsed: Set of
// WBS keys, expanded: Set, level (WBS rows above this depth start open),
// critical (only critical rows and their WBS), longest (critical means on the
// longest path, P6's other definition; every activity driving the finish),
// search, links (draw the relationships between rows on screen), width }.
// `critical` on a row follows the project's own setting: total float at or
// below its critical threshold, or the longest path when the project says so.

import { schedule, lagCalendar } from "./cpm.mjs";
import { formatDate } from "./xer.mjs";
import { longestPath } from "./floatpaths.mjs";

const DAY = 1440;
const LINK = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
const own = (map, k, fallback) => (Object.hasOwn(map, k) ? map[k] : fallback);
const r2 = (v) => (v === undefined || v === null ? null : Math.round(v * 100) / 100);
const isMile = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
const fin = (v) => v !== null && v !== undefined && Number.isFinite(v);

export function spanDates(result, xer = null) {
  const { model, tasks: res } = result;
  const out = new Map();
  const loes = [...model.tasks.values()].filter((t) => t.type === "TT_LOE" && t.status !== "TK_Complete");
  // a predecessor's or successor's dates: the network's, or an LOE's own
  const dates = (id) => {
    const t = model.tasks.get(id);
    if (!t) return null;
    if (t.span) {
      const s = out.get(id);
      return s ? { es: s.es, rem: s.rem, ef: s.ef } : null;
    }
    const v = res.get(id);
    if (!v || !fin(v.ef)) return null;
    return { es: v.es, rem: v.remES ?? v.es, ef: v.ef };
  };
  for (let pass = 0; pass < 20; pass++) {
    let moved = false;
    for (const t of loes) {
      const p = result.projects.get(t.proj);
      const dd = p ? p.dataDate : model.anchor;
      const S = [], E = [];
      for (const rel of t.preds) {
        const d = dates(rel.predId);
        if (!d) continue;
        const lc = lagCalendar(model, rel);
        if (rel.type === "PR_FS") S.push(lc.addWork(d.ef, rel.lag));
        else if (rel.type === "PR_SS") S.push(lc.addWork(d.es, rel.lag));
        else if (rel.type === "PR_FF") E.push(lc.addWork(d.ef, rel.lag));
      }
      for (const rel of t.succs) {
        const d = dates(rel.succId);
        if (!d) continue;
        const lc = lagCalendar(model, rel);
        if (rel.type === "PR_FS") E.push(lc.subWork(d.rem, rel.lag));
        else if (rel.type === "PR_FF") E.push(lc.subWork(d.ef, rel.lag));
      }
      let rem = t.cal.nextStart(Math.max(S.length ? Math.min(...S) : dd, dd));
      let ef = E.length ? t.cal.prevEnd(Math.max(...E)) : t.cal.addWork(rem, t.remain);
      if (ef < rem) {
        if (t.status === "TK_Active") rem = t.cal.nextStart(dd);
        if (ef < rem) ef = rem;
      }
      const es = t.status === "TK_Active" && fin(t.actStart) ? t.actStart : rem;
      const prev = out.get(t.id);
      if (!prev || prev.es !== es || prev.ef !== ef || prev.rem !== rem) moved = true;
      out.set(t.id, { es, rem, ef, rule: "loe" });
    }
    if (!moved) break;
  }
  // WBS summary activities: the span of their WBS branch
  const wbsSum = [...model.tasks.values()].filter((t) => t.type === "TT_WBS" && t.status !== "TK_Complete");
  if (wbsSum.length) {
    const parent = new Map();
    for (const w of (xer && xer.tables.PROJWBS) || []) parent.set(w.wbs_id, w.parent_wbs_id);
    const under = (wbs, top) => {
      const seen = new Set();
      for (let w = wbs; w && !seen.has(w); w = parent.get(w)) { if (w === top) return true; seen.add(w); }
      return false;
    };
    for (const t of wbsSum) {
      let es = null, ef = null;
      for (const o of model.tasks.values()) {
        if (o === t || o.type === "TT_WBS" || o.proj !== t.proj || !under(o.wbs, t.wbs)) continue;
        const d = barOf(o, res, out);
        if (!d) continue;
        if (es === null || d.start < es) es = d.start;
        if (ef === null || d.finish > ef) ef = d.finish;
      }
      if (es === null) continue;
      // a started summary's remaining start is the data date, as for any
      // started activity; its start is the earliest actual start under it
      const p = result.projects.get(t.proj);
      const rem = t.status === "TK_Active" && p ? t.cal.nextStart(p.dataDate) : es;
      out.set(t.id, { es: t.status === "TK_Active" && fin(t.actStart) ? Math.min(es, t.actStart) : es, rem, ef, rule: "wbs" });
    }
  }
  return out;
}

// the bar an activity draws: start, finish, and the part done by the data date
function barOf(t, res, spans) {
  if (t.status === "TK_Complete") {
    if (!fin(t.actStart) && !fin(t.actEnd)) return null;
    const s = fin(t.actStart) ? t.actStart : t.actEnd, f = fin(t.actEnd) ? t.actEnd : s;
    return { start: s, finish: f, remStart: null, actualTo: f };
  }
  const v = t.span ? spans.get(t.id) : res.get(t.id);
  if (!v || !fin(v.ef)) return null;
  const rem = t.span ? v.rem : (v.remES ?? v.es);
  const started = t.status === "TK_Active" && fin(t.actStart);
  return { start: started ? t.actStart : rem, finish: v.ef, remStart: started ? rem : null, actualTo: started ? Math.min(rem, v.ef) : null };
}

function pickProject(result, projId) {
  if (projId && result.projects.has(projId)) return result.projects.get(projId);
  const counts = new Map();
  for (const t of result.model.tasks.values()) if (t.status !== "TK_Complete") counts.set(t.proj, (counts.get(t.proj) || 0) + 1);
  let best = null;
  for (const p of result.projects.values()) if (!best || (counts.get(p.id) || 0) > (counts.get(best.id) || 0)) best = p;
  return best;
}

export function gantt(xer, opts = {}) {
  const result = opts.result || schedule(xer);
  const { model, tasks: res } = result;
  const warnings = [];
  const p = pickProject(result, opts.projId);
  if (!p) return { project: null, rows: [], summary: null, warnings: ["no project in the file"] };
  const spans = spanDates(result, xer);
  const projRow = (xer.tables.PROJECT || []).find((r) => r.proj_id === p.id) || {};

  // baseline: a second file matched by activity ID, else the planned dates
  let base = null, baseKind = null;
  if (opts.baseline) {
    const br = schedule(opts.baseline);
    const bs = spanDates(br, opts.baseline);
    base = new Map();
    for (const t of br.model.tasks.values()) {
      const b = barOf(t, br.tasks, bs);
      if (b && t.code && !base.has(t.code)) base.set(t.code, b);
    }
    baseKind = "file";
  } else {
    baseKind = "planned";
    warnings.push("no baseline file: the planned dates stored in the file stand in, and P6 moves an unstarted activity's planned dates to its early dates whenever it schedules, so the variance means something only for work already started");
  }

  // the WBS tree of this project, in P6's order (seq_num, then short name)
  const wbsRows = (xer.tables.PROJWBS || []).filter((w) => w.proj_id === p.id);
  const wbsById = new Map(wbsRows.map((w) => [w.wbs_id, w]));
  const kids = new Map();
  let root = null;
  for (const w of wbsRows) {
    if (w.proj_node_flag === "Y" && !root) { root = w.wbs_id; continue; }
    const par = wbsById.has(w.parent_wbs_id) ? w.parent_wbs_id : "";
    if (!kids.has(par)) kids.set(par, []);
    kids.get(par).push(w);
  }
  // nodes hanging from the project node sit at the top level
  if (root && kids.has(root)) { kids.set("", [...(kids.get("") || []), ...kids.get(root)]); kids.delete(root); }
  const seq = (w) => { const n = Number(w.seq_num); return Number.isFinite(n) ? n : 0; };
  for (const list of kids.values()) list.sort((a, b) => seq(a) - seq(b) || String(a.wbs_short_name || "").localeCompare(String(b.wbs_short_name || "")) || (a.wbs_id < b.wbs_id ? -1 : 1));

  const longest = longestPath(result, p.id);
  const byLongest = p.criticalType === "CT_LongPath";
  const tasksBy = new Map();
  const isTop = (w) => !w || w === root || !wbsById.has(w);
  let noBar = 0;
  for (const t of model.tasks.values()) {
    if (t.proj !== p.id) continue;
    const key = isTop(t.wbs) ? "" : t.wbs;
    const b = barOf(t, res, spans);
    if (!b) { noBar++; continue; }
    const v = res.get(t.id);
    const tf = t.span || t.status === "TK_Complete" || !v ? null : r2(v.tf);
    let baseStart = null, baseFinish = null, variance = null;
    if (base) {
      const bb = base.get(t.code);
      if (bb) { baseStart = bb.start; baseFinish = bb.finish; }
    } else {
      const ps = t.row.target_start_date ? Date.parse(t.row.target_start_date.replace(" ", "T") + "Z") / 60000 : NaN;
      const pf = t.row.target_end_date ? Date.parse(t.row.target_end_date.replace(" ", "T") + "Z") / 60000 : NaN;
      if (Number.isFinite(ps) && Number.isFinite(pf)) { baseStart = ps; baseFinish = pf; }
    }
    if (fin(baseFinish)) {
      const hpd = (t.cal.hoursPerDay || 8) * 60;
      const w = b.finish >= baseFinish ? t.cal.workBetween(baseFinish, b.finish) : -t.cal.workBetween(b.finish, baseFinish);
      variance = r2(w / hpd);
    }
    const row = {
      kind: "task", key: `t:${t.id}`, parent: key, depth: 0, id: t.id, code: t.code, name: t.name, type: t.type,
      status: t.status === "TK_Complete" ? "complete" : t.status === "TK_Active" ? "in progress" : "not started",
      start: b.start, finish: b.finish, remStart: b.remStart, actualTo: b.actualTo, milestone: isMile(t),
      span: t.type === "TT_LOE" ? "LOE" : t.type === "TT_WBS" ? "WBS summary" : null,
      tf, longest: longest.has(t.id), critical: byLongest ? longest.has(t.id) : tf !== null && tf <= (p.criticalHours || 0) + 0.005,
      pct: t.row.phys_complete_pct !== undefined && t.row.phys_complete_pct !== "" ? Number(t.row.phys_complete_pct) : null,
      preds: t.preds.map((rel) => ({ code: model.tasks.get(rel.predId)?.code, type: own(LINK, rel.type, rel.type), lag: r2(rel.lag / 60) })),
      baseStart, baseFinish, variance,
    };
    if (!tasksBy.has(key)) tasksBy.set(key, []);
    tasksBy.get(key).push(row);
  }
  if (noBar) warnings.push(`${noBar} ${noBar === 1 ? "activity has" : "activities have"} no dates to draw (never scheduled and not progressed) and ${noBar === 1 ? "is" : "are"} left off the chart`);
  for (const list of tasksBy.values()) list.sort((a, b) => a.start - b.start || a.finish - b.finish || String(a.code).localeCompare(String(b.code)));

  // depth-first: a WBS row, its activities, then its children; each WBS
  // row spans everything under it
  const rows = [];
  const seen = new Set();
  const walk = (parentKey, depth) => {
    const agg = { start: null, finish: null, count: 0, critical: false, longest: false };
    const take = (s, f) => {
      if (fin(s) && (agg.start === null || s < agg.start)) agg.start = s;
      if (fin(f) && (agg.finish === null || f > agg.finish)) agg.finish = f;
    };
    for (const w of kids.get(parentKey) || []) {
      if (seen.has(w.wbs_id)) continue;
      seen.add(w.wbs_id);
      const row = { kind: "wbs", key: w.wbs_id, parent: parentKey, depth, code: w.wbs_short_name || "", name: w.wbs_name || w.wbs_short_name || "", start: null, finish: null, count: 0, critical: false, longest: false };
      const at = rows.length;
      rows.push(row);
      const mine = tasksBy.get(w.wbs_id) || [];
      for (const t of mine) { t.depth = depth + 1; rows.push(t); }
      const sub = walk(w.wbs_id, depth + 1);
      for (const t of mine) {
        if (fin(t.start) && (row.start === null || t.start < row.start)) row.start = t.start;
        if (fin(t.finish) && (row.finish === null || t.finish > row.finish)) row.finish = t.finish;
        row.critical ||= t.critical;
        row.longest ||= t.longest;
      }
      if (fin(sub.start) && (row.start === null || sub.start < row.start)) row.start = sub.start;
      if (fin(sub.finish) && (row.finish === null || sub.finish > row.finish)) row.finish = sub.finish;
      row.critical ||= sub.critical;
      row.longest ||= sub.longest;
      row.count = mine.length + sub.count;
      if (!row.count) { rows.length = at; continue; } // an empty branch draws nothing
      take(row.start, row.finish);
      agg.count += row.count;
      agg.critical ||= row.critical;
      agg.longest ||= row.longest;
    }
    return agg;
  };
  // activities filed straight under the project node come first
  for (const t of tasksBy.get("") || []) rows.push(t);
  walk("", 0);

  let from = null, to = null;
  for (const r of rows) {
    if (r.kind !== "task") continue;
    for (const v of [r.start, r.finish, r.baseStart, r.baseFinish]) if (fin(v)) { if (from === null || v < from) from = v; if (to === null || v > to) to = v; }
  }
  if (fin(p.dataDate)) { if (from === null || p.dataDate < from) from = p.dataDate; if (to === null || p.dataDate > to) to = p.dataDate; }
  const tasks = rows.filter((r) => r.kind === "task");
  const n = (f) => tasks.filter(f).length;
  return {
    project: { id: p.id, code: p.code, name: projRow.proj_name || "", dataDate: p.dataDate, finish: p.finish ?? null, mustFinish: p.mustFinish ?? null },
    rows, from, to, baseline: baseKind,
    summary: {
      activities: tasks.length, wbs: rows.length - tasks.length, critical: n((r) => r.critical), longestPath: n((r) => r.longest), criticalBy: byLongest ? "longest path" : `total float <= ${p.criticalHours || 0} h`, milestones: n((r) => r.milestone),
      loe: n((r) => r.span === "LOE"), wbsSummary: n((r) => r.span === "WBS summary"),
      complete: n((r) => r.status === "complete"), active: n((r) => r.status === "in progress"), notStarted: n((r) => r.status === "not started"),
      late: n((r) => r.variance !== null && r.variance > 0.005 && r.status !== "complete"),
    },
    warnings,
  };
}

// The rows a view shows: WBS levels open to `level`, nodes the user folded
// closed or opened (`collapsed` / `expanded`), critical only, a text search.
export function visibleRows(g, view = {}) {
  const level = view.level ?? 99;
  const collapsed = view.collapsed || new Set(), expanded = view.expanded || new Set();
  const q = (view.search || "").trim().toLowerCase();
  const filtered = view.critical || q;
  const keep = new Set();
  if (filtered) {
    const byKey = new Map(g.rows.map((r) => [r.key, r]));
    for (const r of g.rows) {
      if (r.kind !== "task") continue;
      if (view.critical && !(view.longest ? r.longest : r.critical)) continue;
      if (q && !`${r.code} ${r.name}`.toLowerCase().includes(q)) continue;
      keep.add(r.key);
      for (let k = r.parent; k && !keep.has(k); k = byKey.get(k)?.parent) keep.add(k);
    }
  }
  const out = [];
  let hideBelow = Infinity;
  for (const r of g.rows) {
    if (r.depth > hideBelow) continue;
    hideBelow = Infinity;
    if (filtered && !keep.has(r.key)) continue;
    out.push(r);
    if (r.kind === "wbs") {
      const open = expanded.has(r.key) || (!collapsed.has(r.key) && (filtered || r.depth < level));
      if (!open) hideBelow = r.depth;
    }
  }
  return out;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dOnly = (m) => (fin(m) ? formatDate(m).slice(0, 10) : "");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// timescale ticks: weeks, months, quarters or years, the finest unit that
// leaves room for a label at this width (pxPerDay)
function ticks(from, to, pxPerDay = 4) {
  const days = (to - from) / DAY;
  const out = [];
  const d0 = new Date(from * 60000);
  if (pxPerDay * 7 >= 40 || days <= 21) {
    // Mondays
    const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()));
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1);
    for (; d.getTime() / 60000 <= to; d.setUTCDate(d.getUTCDate() + 7)) out.push({ at: d.getTime() / 60000, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, major: d.getUTCDate() <= 7 });
    return { unit: "week", ticks: out };
  }
  const step = pxPerDay * 30.4 >= 34 ? 1 : pxPerDay * 91 >= 46 ? 3 : 12;
  const d = new Date(Date.UTC(d0.getUTCFullYear(), step === 12 ? 0 : d0.getUTCMonth() - (d0.getUTCMonth() % step), 1));
  for (; d.getTime() / 60000 <= to; d.setUTCMonth(d.getUTCMonth() + step)) { // month-overflow: ok (always day 1)
    const m = d.getUTCMonth(), y = d.getUTCFullYear();
    out.push({ at: d.getTime() / 60000, label: step === 12 ? String(y) : step === 3 ? `Q${m / 3 + 1} ${y}` : `${MONTHS[m]}${m === 0 || out.length === 0 ? ` ${y}` : ""}`, major: m === 0 });
  }
  return { unit: step === 12 ? "year" : step === 3 ? "quarter" : "month", ticks: out };
}

export function ganttSvg(g, view = {}) {
  if (!g.project) return "";
  const rows = view.rows || visibleRows(g, view);
  const RH = 20, HEAD = 38;
  const W = Math.max(640, Math.round(view.width || 1200));
  const LEFT = Math.min(460, Math.round(W * 0.42));
  const pad = Math.max(DAY, (g.to - g.from) * 0.02);
  const from = (view.from ?? g.from) - pad, to = (view.to ?? g.to) + pad;
  const span = Math.max(DAY, to - from);
  const X = (m) => LEFT + ((m - from) / span) * (W - LEFT - 8);
  const H = HEAD + rows.length * RH + 6;
  const tk = ticks(from, to, (W - LEFT - 8) / (span / DAY));
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="gantt" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="11" role="img" aria-label="Gantt chart: ${esc(g.project.code)}">`);
  parts.push(`<style>.gantt text{fill:#1b1f24}.gantt .wbs text{font-weight:600}.gantt .tg{fill:#5b6573}.gantt .row:hover rect.bg{fill:#fff6d6}</style>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);
  // timescale
  for (let i = 0; i < tk.ticks.length; i++) {
    const t = tk.ticks[i], x = X(t.at);
    if (x < LEFT || x > W) continue;
    parts.push(`<line x1="${x.toFixed(1)}" y1="${HEAD - 14}" x2="${x.toFixed(1)}" y2="${H}" stroke="${t.major ? "#c3c9d2" : "#e6e9ee"}"/>`);
    const nx = i + 1 < tk.ticks.length ? X(tk.ticks[i + 1].at) : W;
    if (nx - x > 24) parts.push(`<text class="tg" x="${(x + 3).toFixed(1)}" y="${HEAD - 18}">${esc(t.label)}</text>`);
  }
  parts.push(`<text x="6" y="${HEAD - 18}" font-weight="600">Activity</text><text x="${LEFT - 150}" y="${HEAD - 18}" font-weight="600">Start</text><text x="${LEFT - 78}" y="${HEAD - 18}" font-weight="600">Finish</text>`);
  parts.push(`<line x1="0" y1="${HEAD - 6}" x2="${W}" y2="${HEAD - 6}" stroke="#9aa3ae"/><line x1="${LEFT - 4}" y1="${HEAD - 32}" x2="${LEFT - 4}" y2="${H}" stroke="#9aa3ae"/>`);
  const crit = (r) => (view.longest ? r.longest : r.critical);
  const yOf = new Map();
  rows.forEach((r, i) => yOf.set(r.key, HEAD + i * RH));
  rows.forEach((r, i) => {
    const y = HEAD + i * RH, mid = y + RH / 2;
    const indent = 6 + r.depth * 12;
    const label = r.kind === "wbs" ? `${r.code && r.code !== r.name ? r.code + " " : ""}${r.name}` : `${r.code}  ${r.name}`;
    const maxChars = Math.max(6, Math.floor((LEFT - 160 - indent) / 6.1));
    const text = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
    const open = r.kind === "wbs" ? (view.isOpen ? view.isOpen(r) : true) : null;
    parts.push(`<g class="row ${r.kind}" data-key="${esc(r.key)}"${r.kind === "wbs" ? ` style="cursor:pointer"` : ""}><rect class="bg" x="0" y="${y}" width="${W}" height="${RH}" fill="${r.kind === "wbs" ? "#eef1f5" : i % 2 ? "#fafbfc" : "#fff"}"/>`);
    parts.push(`<title>${esc(label)}\n${dOnly(r.start)} to ${dOnly(r.finish)}${r.kind === "task" ? `\n${r.status}${r.tf !== null ? `, total float ${r.tf} h` : ""}${r.span ? `, ${r.span}` : ""}${r.variance !== null ? `\nfinish variance ${r.variance > 0 ? "+" : ""}${r.variance} working days against the ${g.baseline === "file" ? "baseline" : "planned dates"}` : ""}` : `\n${r.count} activities`}</title>`);
    parts.push(`<text x="${indent}" y="${mid + 4}">${r.kind === "wbs" ? (open ? "▾ " : "▸ ") : ""}${esc(text)}</text>`);
    parts.push(`<text class="tg" x="${LEFT - 150}" y="${mid + 4}">${dOnly(r.start)}</text><text class="tg" x="${LEFT - 78}" y="${mid + 4}">${dOnly(r.finish)}</text>`);
    if (fin(r.start) && fin(r.finish)) {
      const x1 = X(r.start), x2 = Math.max(X(r.finish), x1 + 1.5);
      if (r.kind === "wbs") {
        parts.push(`<path d="M${x1.toFixed(1)} ${y + 6}H${x2.toFixed(1)}V${y + 14}L${(x2 - 4).toFixed(1)} ${y + 11}H${(x1 + 4).toFixed(1)}L${x1.toFixed(1)} ${y + 14}Z" fill="${(view.longest ? r.longest : r.critical) ? "#7a2018" : "#36404d"}"/>`);
      } else {
        if (fin(r.baseStart) && fin(r.baseFinish)) {
          const b1 = X(r.baseStart), b2 = Math.max(X(r.baseFinish), b1 + 1.5);
          parts.push(`<rect x="${b1.toFixed(1)}" y="${y + 14}" width="${(b2 - b1).toFixed(1)}" height="4" fill="#e0b84a"/>`);
        }
        if (r.milestone) {
          const mx = r.type === "TT_Mile" ? x1 : X(r.finish);
          parts.push(`<path d="M${mx.toFixed(1)} ${y + 3}l6 6.5-6 6.5-6-6.5z" fill="${r.status === "complete" ? "#5b6573" : crit(r) ? "#c0392b" : "#1f4f99"}"/>`);
        } else if (r.span) {
          parts.push(`<rect x="${x1.toFixed(1)}" y="${y + 7}" width="${(x2 - x1).toFixed(1)}" height="6" fill="#8e6cc4" opacity="0.85"/>`);
        } else {
          const color = crit(r) ? "#c0392b" : "#4a78c2";
          if (r.status === "complete") parts.push(`<rect x="${x1.toFixed(1)}" y="${y + 4}" width="${(x2 - x1).toFixed(1)}" height="10" fill="#7d8794"/>`);
          else if (fin(r.actualTo)) {
            const xa = Math.max(x1, Math.min(X(r.actualTo), x2));
            parts.push(`<rect x="${x1.toFixed(1)}" y="${y + 4}" width="${(xa - x1).toFixed(1)}" height="10" fill="#7d8794"/><rect x="${xa.toFixed(1)}" y="${y + 4}" width="${Math.max(1.5, x2 - xa).toFixed(1)}" height="10" fill="${color}"/>`);
          } else parts.push(`<rect x="${x1.toFixed(1)}" y="${y + 4}" width="${(x2 - x1).toFixed(1)}" height="10" fill="${color}"/>`);
        }
      }
    }
    parts.push(`</g>`);
  });
  // relationships between rows on screen
  if (view.links && rows.length <= 600) {
    const byCode = new Map();
    for (const r of rows) if (r.kind === "task") byCode.set(r.code, r);
    for (const r of rows) {
      if (r.kind !== "task") continue;
      for (const l of r.preds) {
        const pr = byCode.get(l.code);
        if (!pr) continue;
        const fromX = X(l.type === "SS" || l.type === "SF" ? pr.start : pr.finish), toX = X(l.type === "FF" || l.type === "SF" ? r.finish : r.start);
        const y1 = yOf.get(pr.key) + RH / 2, y2 = yOf.get(r.key) + RH / 2;
        const drive = crit(r) && crit(pr);
        parts.push(`<path d="M${fromX.toFixed(1)} ${y1}h4V${y2}H${toX.toFixed(1)}" fill="none" stroke="${drive ? "#c0392b" : "#8a94a3"}" stroke-width="0.8" opacity="0.8"/>`);
      }
    }
  }
  // data date and must-finish lines
  for (const [m, color, label] of [[g.project.dataDate, "#1a7f37", "data date"], [g.project.mustFinish, "#a3530b", "must finish"]]) {
    if (!fin(m)) continue;
    const x = X(m);
    if (x < LEFT || x > W) continue;
    parts.push(`<line x1="${x.toFixed(1)}" y1="${HEAD - 6}" x2="${x.toFixed(1)}" y2="${H}" stroke="${color}" stroke-width="1.4" stroke-dasharray="4 3"/><text x="${(x + 3).toFixed(1)}" y="${HEAD - 8}" fill="${color}" font-size="10">${label}</text>`);
  }
  parts.push(`</svg>`);
  return parts.join("");
}

const LEGEND = `<span style="display:inline-block;width:18px;height:8px;background:#4a78c2"></span> remaining &nbsp; <span style="display:inline-block;width:18px;height:8px;background:#c0392b"></span> critical &nbsp; <span style="display:inline-block;width:18px;height:8px;background:#7d8794"></span> actual &nbsp; <span style="display:inline-block;width:18px;height:4px;background:#e0b84a"></span> baseline or planned &nbsp; <span style="display:inline-block;width:18px;height:6px;background:#8e6cc4"></span> level of effort or WBS summary &nbsp; &#9670; milestone`;
export const ganttLegend = LEGEND;

export function ganttHtml(g, view = {}, meta = {}) {
  const title = `Gantt chart: ${g.project ? g.project.code || g.project.id : ""}`;
  if (!g.project) return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><p>No project in the file.</p>`;
  const s = g.summary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>:root{color-scheme:light}body{font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1f24;background:#fff;margin:16px}h1{font-size:18px;margin:0 0 4px}p{margin:4px 0}.note{color:#555}svg{max-width:100%;height:auto}.warn{color:#a3530b}@media print{@page{size:landscape;margin:8mm}body{margin:0}}</style></head><body>
<h1>${esc(title)}</h1>
<p>${[g.project.name, `data date ${dOnly(g.project.dataDate)}`, g.project.finish ? `forecast finish ${dOnly(g.project.finish)}` : "", meta.by ? `prepared by ${meta.by}` : ""].filter(Boolean).map(esc).join(" &middot; ")}</p>
<p>${s.activities} activities in ${s.wbs} WBS nodes: ${s.complete} complete, ${s.active} in progress, ${s.notStarted} not started; ${s.critical} critical, ${s.milestones} milestones${s.loe ? `, ${s.loe} level of effort` : ""}${s.wbsSummary ? `, ${s.wbsSummary} WBS summary` : ""}${g.baseline === "file" ? `; ${s.late} open activities finish later than the baseline` : ""}.</p>
<p class="note">${LEGEND}</p>
${ganttSvg(g, view)}
${g.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join("")}
<p class="note">Bars use the dates recomputed from the file's logic, durations and calendars (early dates), actual dates for work done. Made with XER Schedule Check (MIT). Not professional advice: check dates against the scheduling software of record before acting on them.</p>
</body></html>`;
}

export function ganttText(g, view = {}) {
  if (!g.project) return "No project in the file.\n";
  const s = g.summary;
  const out = [`Gantt chart: ${g.project.code}${g.project.name ? ` (${g.project.name})` : ""}, data date ${dOnly(g.project.dataDate)}, forecast finish ${dOnly(g.project.finish)}`,
    `${s.activities} activities in ${s.wbs} WBS nodes: ${s.complete} complete, ${s.active} in progress, ${s.notStarted} not started; ${s.critical} critical, ${s.milestones} milestones, ${s.loe} level of effort, ${s.wbsSummary} WBS summary.`, ""];
  const rows = visibleRows(g, { level: view.level ?? 2, critical: view.critical, search: view.search });
  for (const r of rows) {
    const pad = "  ".repeat(r.depth);
    if (r.kind === "wbs") out.push(`${pad}${r.code && r.code !== r.name ? r.code + " " : ""}${r.name}  [${dOnly(r.start)} to ${dOnly(r.finish)}, ${r.count} activities${r.critical ? ", critical work" : ""}]`);
    else out.push(`${pad}${r.code}  ${r.name}  [${dOnly(r.start)} to ${dOnly(r.finish)}, ${r.status}${r.tf !== null ? `, TF ${r.tf} h` : ""}${r.critical ? ", critical" : ""}${r.span ? `, ${r.span}` : ""}${r.variance ? `, ${r.variance > 0 ? "+" : ""}${r.variance} d` : ""}]`);
  }
  const late = g.rows.filter((r) => r.kind === "task" && r.status !== "complete" && r.variance !== null && r.variance > 0.005).sort((a, b) => b.variance - a.variance);
  if (g.baseline === "file") {
    out.push("", `${late.length} open activities finish later than the baseline${late.length ? "; the 15 furthest:" : "."}`);
    for (const r of late.slice(0, 15)) out.push(`  +${r.variance} d  ${r.code}  ${r.name}  (baseline ${dOnly(r.baseFinish)}, now ${dOnly(r.finish)})`);
  }
  for (const w of g.warnings) out.push(`warning: ${w}`);
  return out.join("\n") + "\n";
}

export function ganttCsv(g) {
  const q = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const F = (m) => (fin(m) ? formatDate(m) : "");
  const head = ["level", "kind", "code", "name", "status", "start", "finish", "remaining start", "total float (h)", "critical", "longest path", "type", "baseline start", "baseline finish", "finish variance (working days)", "activities"];
  const lines = [head.map(q).join(",")];
  for (const r of g.rows) {
    if (r.kind === "wbs") lines.push([r.depth, "WBS", r.code, r.name, "", F(r.start), F(r.finish), "", "", r.critical ? "Y" : "N", r.longest ? "Y" : "N", "", "", "", "", r.count].map(q).join(","));
    else lines.push([r.depth, "activity", r.code, r.name, r.status, F(r.start), F(r.finish), F(r.remStart), r.tf, r.critical ? "Y" : "N", r.longest ? "Y" : "N", r.span || (r.milestone ? "milestone" : "task"), F(r.baseStart), F(r.baseFinish), r.variance, ""].map(q).join(","));
  }
  return lines.join("\n") + "\n";
}
