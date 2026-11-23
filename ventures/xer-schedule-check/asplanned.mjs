// As-planned vs. as-built: the observational, static method of AACE
// International Recommended Practice 29R-03, MIP 3.1 (gross) and 3.2
// (periodic, here one period: the plan against the final as-built). Where the
// collapsed as-built (collapse.mjs) and the time impact analysis (tia.mjs)
// change a schedule and recompute it, this changes nothing: it lays the plan
// beside what happened and measures where, along the path that actually drove
// the finish, the difference grew.
//
// 1. The plan. A baseline XER (the accepted baseline, or the first update),
//    recomputed with this tool's CPM engine; activities it shows finished keep
//    their actual dates. Without a baseline file the final file's own Planned
//    Start and Planned Finish columns (TASK target_start_date /
//    target_end_date) stand in, which P6 keeps as the dates the activity was
//    first scheduled for unless someone reset them.
//
// 2. The as-built critical path. Not a judgement: the as-built model of
//    collapse.mjs lands every activity on its actual dates with the file's
//    own logic, and the driving path of that model (cpm.mjs drivingPath) is
//    the chain of activities and links that leaves no slack into the actual
//    finish.
//
// 3. The variance along it. Every point on the path has a variance: actual
//    minus planned, in working days of the project calendar, at the
//    activity's start or finish. Walking the path from its first activity to
//    the last, each step adds to the variance in one of two ways:
//      wait      between the driving point of the predecessor (its finish on
//                an FS or FF link, its start on SS or SF) and the point it
//                drives (this activity's start on FS or SS, its finish on FF
//                or SF): the gap grew, a late start the logic does not
//                explain
//      duration  between this activity's entry point and the point that
//                drives the next one (start to finish on an FS chain): it
//                took longer than planned
//    The steps add up exactly to the variance at the path's last finish; the
//    float the plan gave that last activity against the planned project
//    finish is the one remaining term, so the rows add up to the project's
//    delay. Activities added after the plan have no planned dates; the step
//    across them is reported on the next planned activity, with their IDs.
//
// asPlannedVsAsBuilt(finalXer, planXer | null, { projId, planProjId })
//   -> { project, plan: { source, start, finish }, asBuilt: { start, finish,
//   reproduced, activities }, delayDays, path: [rows], floatTerm, sum,
//   plannedCritical, milestones, overruns, late, added, deleted, warnings }
//
// It measures; it does not say who caused a delay or what the contract
// allows for it.

import { schedule, drivingPath, lagCalendar } from "./cpm.mjs";
import { pickProject, matchingProject } from "./compare.mjs";
import { asBuiltModel } from "./collapse.mjs";
import { parseDate, formatDate } from "./xer.mjs";

const r1 = (x) => Math.round(x * 10) / 10;
const isMile = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
const START = new Set(["PR_FS", "PR_SS"]); // links that drive the successor's start
const FROM_FINISH = new Set(["PR_FS", "PR_FF"]); // links that leave the predecessor's finish

// The driving path into the as-built finish. cpm.mjs drivingPath ends on one
// activity finishing on the finish date; where that is an as-late-as-possible
// finish milestone (placed by the finish, not driving it) the walk stops at
// once. Here every activity finishing on the finish date is tried and the
// longest chain kept.
function walkFrom(result, start, score) {
  const { model, tasks: res } = result;
  const path = [], seen = new Set();
  let cur = start;
  let exit = "finish"; // the point of cur that drives what comes after it
  while (cur && !seen.has(cur.id)) {
    path.push(cur.id); seen.add(cur.id);
    const r = res.get(cur.id);
    // every tight link into cur; of those, one into the point that drives
    // the rest of the path: an activity whose finish a finish-to-finish
    // link held (it ran longer than its duration because it could not
    // finish first) is driven at its finish, even if a start link is tight
    // too
    const tight = [], near = [];
    for (const rel of cur.preds) {
      const pr = model.tasks.get(rel.predId);
      if (!pr || pr.span || pr.proj !== cur.proj) continue;
      const pv = res.get(rel.predId);
      if (!pv) continue;
      const lc = lagCalendar(model, rel);
      const from = FROM_FINISH.has(rel.type) ? pv.ef : pv.remES ?? pv.es;
      const target = START.has(rel.type) ? r.remES ?? r.es : r.ef;
      const reach = lc.addWork(from, rel.lag);
      if (cur.cal.workBetween(reach, target) === 0) tight.push(rel);
      else if (reach < target) near.push({ rel, slack: cur.cal.workBetween(reach, target) });
    }
    // an as-late-as-possible activity sits at its late dates, so no link
    // into it is tight; the chain it waited behind is the predecessor with
    // the least slack into it
    if (!tight.length && near.length && cur.cstr.some((c) => c.type === "CS_ALAP")) {
      const least = Math.min(...near.map((x) => x.slack));
      tight.push(...near.filter((x) => x.slack === least).map((x) => x.rel));
    }
    const want = exit === "finish" ? (x) => !START.has(x.type) : (x) => START.has(x.type);
    // of several tight links, the one from the predecessor that slipped
    // most against the plan: the chain that pushed, not one that merely
    // kept pace
    // an as-late-as-possible predecessor is placed by this activity, not
    // the other way round: it is passed over when another link is tight
    const isAlap = (x) => model.tasks.get(x.predId).cstr.some((c) => c.type === "CS_ALAP");
    const firm = tight.filter((x) => !isAlap(x));
    const cands = firm.length ? firm : tight;
    const pool = cands.filter(want).length ? cands.filter(want) : cands;
    let rel = pool[0];
    if (score) for (const x of pool) if (score(x) > score(rel)) rel = x;
    if (!rel) break;
    exit = FROM_FINISH.has(rel.type) ? "finish" : "start";
    cur = model.tasks.get(rel.predId);
  }
  return path.reverse();
}
function asBuiltPath(result, projId, score) {
  const p = result.projects.get(projId);
  if (!p || p.finish === null) return [];
  let best = [];
  for (const t of result.model.tasks.values()) {
    if (t.proj !== projId || t.span) continue;
    const r = result.tasks.get(t.id);
    if (!r || r.ef !== p.finish) continue;
    const path = walkFrom(result, t, score);
    if (path.length > best.length) best = path;
  }
  return best.length ? best : drivingPath(result, projId);
}

// planned dates by activity ID: from a baseline file, or from the final
// file's own Planned Start / Planned Finish
function planOf(finalXer, planXer, finalProj, planProjId) {
  const out = new Map();
  const warnings = [];
  if (planXer) {
    const run = schedule(planXer);
    const pid = planProjId ?? matchingProject(planXer, finalProj.name, null);
    const p = pickProject(planXer, run.model, pid);
    if (!p) throw new Error("no project in the baseline file");
    let start = Infinity, finish = -Infinity;
    for (const t of run.model.tasks.values()) {
      if (t.proj !== p.id || t.span) continue;
      const r = run.tasks.get(t.id);
      const s = t.actStart ?? (r ? r.remES ?? r.es : null);
      let f = t.actEnd ?? (r ? r.ef : null);
      if (!Number.isFinite(s) || !Number.isFinite(f)) continue;
      if (f < s) f = s;
      out.set(String(t.code), { s, f, tf: r && Number.isFinite(r.tf) ? r.tf / (t.cal.hoursPerDay || 8) : null, days: isMile(t) ? 0 : r1(t.cal.workBetween(s, f) / 60 / (t.cal.hoursPerDay || 8)), name: t.name });
      start = Math.min(start, s); finish = Math.max(finish, f);
    }
    const pf = run.projects.get(p.id)?.finish;
    if (Number.isFinite(pf)) finish = Math.max(finish, pf);
    const crit = new Set(drivingPath(run, p.id).map((id) => String(run.model.tasks.get(id).code)));
    if (p.dataDate !== null && p.dataDate !== undefined && start < p.dataDate) warnings.push(`the baseline file has progress (data date ${formatDate(p.dataDate).slice(0, 10)}): activities it shows started or finished keep those actual dates as the plan`);
    return { out, start, finish, crit, source: `baseline file, project ${p.code || p.id}`, warnings };
  }
  const model = schedule(finalXer).model;
  let start = Infinity, finish = -Infinity;
  for (const t of model.tasks.values()) {
    if (t.proj !== finalProj.id || t.span) continue;
    const s = parseDate(t.row.target_start_date);
    if (!Number.isFinite(s)) continue;
    // a file without the Planned Finish column: the planned start plus the
    // original duration on the activity's calendar
    let f0 = parseDate(t.row.target_end_date);
    if (!Number.isFinite(f0)) f0 = isMile(t) ? s : t.cal.addWork(t.cal.nextStart(s), t.orig);
    const f = Math.max(s, f0);
    out.set(String(t.code), { s, f, tf: null, days: isMile(t) ? 0 : r1(t.cal.workBetween(s, f) / 60 / (t.cal.hoursPerDay || 8)), name: t.name });
    start = Math.min(start, s); finish = Math.max(finish, f);
  }
  warnings.push("no baseline file: the final file's own Planned Start and Planned Finish stand in for the plan; P6 resets them when an activity's planned dates are reset, so open the accepted baseline for a claim");
  return { out, start, finish, crit: null, source: "planned dates in the final file", warnings };
}

export function asPlannedVsAsBuilt(finalXer, planXer = null, { projId = null, planProjId = null } = {}) {
  const m = asBuiltModel(finalXer, { projId });
  const p = m.p;
  const warnings = m.warnings.map((w) => w.replace("a collapsed as-built is normally run on the final update", "the comparison is normally run on the final update"));
  const plan = planOf(finalXer, planXer, p, planProjId);
  warnings.push(...plan.warnings);
  if (!plan.out.size) throw new Error("no activity in the plan has planned dates");
  const cal = p.cal;
  const pday = (cal.hoursPerDay || 8) * 60;
  // signed working days from a to b on the project calendar
  const wd = (a, b) => (!Number.isFinite(a) || !Number.isFinite(b) ? null : r1((b >= a ? cal.workBetween(a, b) : -cal.workBetween(b, a)) / pday));
  const T = (id) => m.model.tasks.get(id);
  const days = (t, a, b) => (isMile(t) ? 0 : r1(t.cal.workBetween(a, b) / 60 / (t.cal.hoursPerDay || 8)));

  // a link's score: the variance at the predecessor's point it leaves from
  const score = (rel) => {
    const pt = m.model.tasks.get(rel.predId), pl = pt && plan.out.get(String(pt.code)), w = m.when.get(rel.predId);
    if (!pl || !w) return -Infinity;
    return FROM_FINISH.has(rel.type) ? wd(pl.f, w.f) : wd(pl.s, w.s);
  };
  const ids = asBuiltPath(m.ab, p.id, score);
  if (!ids.length) throw new Error("the as-built model has no driving path to its finish");
  const path = [];
  let known = 0; // variance at the last point of the path with a planned date
  let through = []; // added activities since that point
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k], t = T(id), w = m.when.get(id), pl = plan.out.get(String(t.code));
    // the link from the previous path activity, and to the next
    const linkIn = k ? t.preds.find((rel) => rel.predId === ids[k - 1]) : null;
    const nextT = k + 1 < ids.length ? T(ids[k + 1]) : null;
    const linkOut = nextT ? nextT.preds.find((rel) => rel.predId === id) : null;
    const entry = !linkIn || START.has(linkIn.type) ? "start" : "finish";
    const exit = !linkOut || FROM_FINISH.has(linkOut.type) ? "finish" : "start";
    const row = {
      code: t.code, name: t.name, link: linkIn ? `${linkIn.type.replace(/^PR_/, "")}${linkIn.lag ? (linkIn.lag > 0 ? "+" : "") + r1(linkIn.lag / 60 / (lagCalendar(m.model, linkIn).hoursPerDay || 8)) + "d" : ""}` : "",
      actualStart: formatDate(w.s), actualFinish: formatDate(w.f), actualDays: days(t, w.s, w.f), actual: w.actual,
      plannedStart: pl ? formatDate(pl.s) : null, plannedFinish: pl ? formatDate(pl.f) : null, plannedDays: pl ? pl.days : null,
      startVariance: pl ? wd(pl.s, w.s) : null, finishVariance: pl ? wd(pl.f, w.f) : null,
      plannedFloat: pl && pl.tf !== null ? r1(pl.tf) : null,
      plannedCritical: plan.crit ? plan.crit.has(String(t.code)) : null,
      waitDays: null, durationDays: null, calendarDays: 0, heldBy: null, through: [], added: !pl,
    };
    if (!pl) { through.push(t.code); path.push(row); continue; }
    const vIn = entry === "start" ? row.startVariance : row.finishVariance;
    const vOut = exit === "start" ? row.startVariance : row.finishVariance;
    row.waitDays = r1(vIn - known);
    // the same step as the link sees it: how much longer this activity
    // waited past the earliest its link allowed (the predecessor's point plus
    // the lag, moved on to this activity's next working time) than it did in
    // the plan. When the two work different calendars, a link that is tight
    // in both can still measure a day apart on the project calendar (a
    // seven-day predecessor finishing on a day the five-day successor does
    // not work); that remainder is reported as a calendar step, not as a late
    // start
    const prevPl = k ? plan.out.get(String(T(ids[k - 1]).code)) : null;
    if (linkIn && prevPl && !through.length) {
      const lc = lagCalendar(m.model, linkIn);
      const ff = FROM_FINISH.has(linkIn.type), ts = START.has(linkIn.type);
      const sw = (a, b) => (b >= a ? t.cal.workBetween(a, b) : -t.cal.workBetween(b, a));
      const wait = (from, to) => {
        const at = lc.addWork(from, linkIn.lag);
        const earliest = ts ? t.cal.nextStart(at) : at;
        return Math.abs(to - earliest) <= 1 ? 0 : sw(earliest, to);
      };
      const pw = m.when.get(ids[k - 1]);
      const grew = wait(ff ? pw.f : pw.s, ts ? w.s : w.f) - wait(ff ? prevPl.f : prevPl.s, ts ? pl.s : pl.f);
      const own = r1(grew / 60 / (t.cal.hoursPerDay || 8));
      if (Math.abs(own - row.waitDays) >= 0.05) { row.calendarDays = r1(row.waitDays - own); row.waitDays = own; }
    }
    row.durationDays = r1(vOut - vIn);
    // the duration step on the activity's own calendar: a crew working
    // 08:00-17:00 that starts at 16:00 after a predecessor on an 08:00-16:00
    // calendar has an hour the project calendar does not count; the
    // difference is a calendar step, not a longer duration
    if (row.durationDays) {
      const sw = (a, b) => (b >= a ? t.cal.workBetween(a, b) : -t.cal.workBetween(b, a));
      const pt = (x, e) => (e === "start" ? x.s : x.f);
      const own = r1((sw(pt(w, entry), pt(w, exit)) - sw(pt(pl, entry), pt(pl, exit))) / 60 / (t.cal.hoursPerDay || 8));
      if (Math.abs(own - row.durationDays) >= 0.05) { row.calendarDays = r1(row.calendarDays + row.durationDays - own); row.durationDays = own; }
    }
    // a longer duration that a finish-to-finish (or start-to-finish) link
    // explains: on the actual dates, a predecessor's finish plus the lag
    // reaches this finish, so it could not have finished sooner; the step is
    // named with that predecessor
    // (also a late start: an activity that kept its duration behind a held
    // finish started late because of the finish, not a wait before it)
    if ((row.durationDays > 0 && entry === "start" && exit === "finish") || row.waitDays > 0) {
      for (const rel of t.preds) {
        if (rel.type !== "PR_FF" && rel.type !== "PR_SF") continue;
        const pw = m.when.get(rel.predId);
        if (!pw) continue;
        const at = lagCalendar(m.model, rel).addWork(rel.type === "PR_FF" ? pw.f : pw.s, rel.lag);
        if (at >= w.f || t.cal.workBetween(at, w.f) === 0) { row.heldBy = `${T(rel.predId).code} (${rel.type.replace(/^PR_/, "")})`; break; }
      }
    }
    row.through = through;
    through = [];
    known = vOut;
    path.push(row);
  }
  const last = ids[ids.length - 1];
  const lastPlan = plan.out.get(String(T(last).code));
  const asBuiltFinish = m.ab.projects.get(p.id)?.finish ?? m.finish;
  const delayDays = wd(plan.finish, asBuiltFinish);
  // the variance at the path's end, and the float the plan gave its last point
  // against the planned project finish: together the project's delay
  let floatTerm;
  if (lastPlan) floatTerm = r1(delayDays - known);
  else { floatTerm = null; warnings.push(`the last activity on the as-built critical path (${T(last).code}) is not in the plan, so the step across the added work at the end is not split from the planned float`); }
  const tail = through.length ? r1(delayDays - known) : null;
  const sum = r1(path.reduce((s, r) => s + (r.waitDays || 0) + (r.durationDays || 0) + (r.calendarDays || 0), 0) + (floatTerm ?? tail ?? 0));
  if (m.reproduced < m.total) warnings.push(`the as-built model lands ${m.total - m.reproduced} of ${m.total} activities off their actual dates; the path is read from the model`);

  // every activity in both: who finished late, who ran long
  const late = [], overruns = [], milestones = [];
  const finalCodes = new Set();
  for (const [id, w] of m.when) {
    const t = T(id);
    finalCodes.add(String(t.code));
    const pl = plan.out.get(String(t.code));
    if (!pl) continue;
    const fv = wd(pl.f, w.f), ad = days(t, w.s, w.f);
    if (fv > 0) late.push({ code: t.code, finishVariance: fv });
    if (!isMile(t) && ad - pl.days >= 0.5) overruns.push({ code: t.code, name: t.name, plannedDays: pl.days, actualDays: ad, overDays: r1(ad - pl.days), pct: pl.days ? Math.round((ad / pl.days - 1) * 100) : null, onPath: ids.includes(id) });
    if (isMile(t)) { const at = t.type === "TT_FinMile" ? w.f : w.s, pt = t.type === "TT_FinMile" ? pl.f : pl.s; milestones.push({ code: t.code, name: t.name, planned: formatDate(pt), actual: formatDate(at), varianceDays: wd(pt, at), actual_: w.actual }); }
  }
  overruns.sort((a, b) => b.overDays - a.overDays);
  milestones.sort((a, b) => (a.actual < b.actual ? -1 : a.actual > b.actual ? 1 : 0));
  const added = [...m.when.keys()].map(T).filter((t) => !plan.out.has(String(t.code))).map((t) => ({ code: t.code, name: t.name, onPath: ids.includes(t.id) }));
  const deleted = [...plan.out.entries()].filter(([c]) => !finalCodes.has(c)).map(([c, v]) => ({ code: c, name: v.name }));
  const matched = m.when.size - added.length;
  if (matched < m.when.size * 0.5) warnings.push(`only ${matched} of ${m.when.size} activities of the final file are in the plan by activity ID: check the baseline is the same project`);
  const onPath = path.filter((r) => !r.added);
  const plannedCritical = plan.crit ? { onBoth: onPath.filter((r) => r.plannedCritical).length, of: onPath.length } : null;
  return {
    project: { id: p.id, code: p.code },
    plan: { source: plan.source, start: formatDate(plan.start), finish: formatDate(plan.finish) },
    asBuilt: { start: formatDate(m.start), finish: formatDate(asBuiltFinish), reproduced: m.reproduced, activities: m.total },
    delayDays,
    path,
    floatTerm,
    tail,
    sum,
    plannedCritical,
    milestones,
    overruns,
    late: { count: late.length, of: matched },
    added,
    deleted,
    warnings,
  };
}

// the steps that grew the delay, largest first
export function delaySteps(r) {
  const out = [];
  for (const x of r.path) {
    if (x.added) continue;
    // a gap that shrank is slack the plan had between the two, used up
    if (x.waitDays) out.push({ code: x.code, name: x.name, kind: x.through.length ? "wait, across added work" : x.waitDays > 0 ? (x.heldBy ? `late start, finish held by ${x.heldBy}` : "late start") : "planned gap used up", days: x.waitDays, through: x.through });
    if (x.durationDays) out.push({ code: x.code, name: x.name, kind: x.durationDays < 0 ? "shorter duration" : x.heldBy && !(x.waitDays > 0) ? `longer duration, finish held by ${x.heldBy}` : "longer duration", days: x.durationDays, through: [] });
    if (x.calendarDays) out.push({ code: x.code, name: x.name, kind: "calendar difference", days: x.calendarDays, through: [] });
  }
  return out.sort((a, b) => b.days - a.days);
}

const sg = (x) => (x === null || x === undefined ? "-" : x > 0 ? `+${x}` : String(x));
export function asPlannedText(r, { limit = 15 } = {}) {
  const L = [];
  L.push(`As-planned vs as-built (AACE 29R-03 MIP 3.1/3.2), project ${r.project.code || r.project.id}`);
  L.push(`Plan (${r.plan.source}): ${r.plan.start} to ${r.plan.finish}`);
  L.push(`As built: ${r.asBuilt.start} to ${r.asBuilt.finish}; delay ${sg(r.delayDays)} working days`);
  L.push(`As-built critical path: ${r.path.length} activities (model lands ${r.asBuilt.reproduced} of ${r.asBuilt.activities} on their actual dates)${r.plannedCritical ? `; ${r.plannedCritical.onBoth} of ${r.plannedCritical.of} were on the plan's critical path` : ""}`);
  L.push("Where the delay grew, largest first:");
  for (const s of delaySteps(r).slice(0, limit)) L.push(`  ${sg(s.days).padStart(6)} d  ${s.code}  ${s.kind}${s.through.length ? ` (${s.through.join(", ")})` : ""}  ${s.name}`);
  if (r.floatTerm !== null && r.floatTerm !== 0) L.push(`  ${sg(r.floatTerm).padStart(6)} d  float the plan gave the path's last activity against the planned finish`);
  if (r.tail !== null) L.push(`  ${sg(r.tail).padStart(6)} d  added work at the end of the path`);
  L.push(`  Sum ${sg(r.sum)} d = delay ${sg(r.delayDays)} d`);
  L.push("Path:");
  for (const x of r.path) L.push(`  ${String(x.code).padEnd(10)} ${x.link.padEnd(7)} planned ${x.plannedStart ? `${x.plannedStart.slice(0, 10)}..${x.plannedFinish.slice(0, 10)}` : "(added)".padEnd(22)} actual ${x.actualStart.slice(0, 10)}..${x.actualFinish.slice(0, 10)}  wait ${sg(x.waitDays)}  duration ${sg(x.durationDays)}${x.plannedFloat !== null ? `  planned float ${x.plannedFloat}` : ""}`);
  L.push(`Finished later than planned: ${r.late.count} of ${r.late.of}; added since the plan: ${r.added.length}; in the plan but not built: ${r.deleted.length}`);
  if (r.overruns.length) { L.push("Longest overruns:"); for (const o of r.overruns.slice(0, 10)) L.push(`  ${o.code}  ${o.plannedDays} -> ${o.actualDays} d${o.onPath ? "  (as-built critical)" : ""}  ${o.name}`); }
  for (const w of r.warnings) L.push(`Note: ${w}`);
  return L.join("\n");
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function asPlannedCsv(r) {
  const L = [["section", "activity id", "name", "link in", "planned start", "planned finish", "actual start", "actual finish", "planned days", "actual days", "start variance", "finish variance", "wait days", "duration days", "planned float", "planned critical", "across added"].join(",")];
  for (const x of r.path) L.push(["path", x.code, x.name, x.link, x.plannedStart, x.plannedFinish, x.actualStart, x.actualFinish, x.plannedDays, x.actualDays, x.startVariance, x.finishVariance, x.waitDays, x.durationDays, x.plannedFloat, x.plannedCritical === null ? "" : x.plannedCritical ? "yes" : "no", x.through.join(" ")].map(csvCell).join(","));
  L.push(["total", "", "planned float at the path's end", "", "", "", "", "", "", "", "", "", r.floatTerm ?? r.tail, "", "", "", ""].map(csvCell).join(","));
  L.push(["total", "", "delay", "", r.plan.start, r.plan.finish, r.asBuilt.start, r.asBuilt.finish, "", "", "", r.delayDays, "", "", "", "", ""].map(csvCell).join(","));
  for (const m of r.milestones) L.push(["milestone", m.code, m.name, "", "", m.planned, "", m.actual, "", "", "", m.varianceDays, "", "", "", "", ""].map(csvCell).join(","));
  for (const o of r.overruns) L.push(["overrun", o.code, o.name, "", "", "", "", "", o.plannedDays, o.actualDays, "", "", "", o.overDays, "", "", ""].map(csvCell).join(","));
  for (const a of r.added) L.push(["added", a.code, a.name, ...Array(14).fill("")].map(csvCell).join(","));
  for (const d of r.deleted) L.push(["not built", d.code, d.name, ...Array(14).fill("")].map(csvCell).join(","));
  return L.join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const d10 = (s) => (s ? esc(s.slice(0, 10)) : "");
export function asPlannedTableHtml(r, { limit = 12 } = {}) {
  const parts = [];
  parts.push(`<p><b>Plan</b> (${esc(r.plan.source)}): ${d10(r.plan.start)} to ${d10(r.plan.finish)}. <b>As built:</b> ${d10(r.asBuilt.start)} to ${d10(r.asBuilt.finish)}. <b>Delay ${esc(sg(r.delayDays))} working days.</b> The as-built critical path has ${esc(r.path.length)} activities${r.plannedCritical ? `, ${esc(r.plannedCritical.onBoth)} of ${esc(r.plannedCritical.of)} of them on the plan's critical path` : ""}.</p>`);
  const steps = delaySteps(r);
  if (steps.length) parts.push(`<p><b>Where the delay grew</b> (largest first; negative steps are time made up):</p><table><thead><tr><th>Activity</th><th>Name</th><th>How</th><th class="n">Working days</th></tr></thead><tbody>${steps.slice(0, limit).map((s) => `<tr><td>${esc(s.code)}</td><td>${esc(s.name)}</td><td>${esc(s.kind)}${s.through.length ? ` (${esc(s.through.join(", "))})` : ""}</td><td class="n">${esc(sg(s.days))}</td></tr>`).join("")}${r.floatTerm ? `<tr><td></td><td>Float the plan gave the path's last activity</td><td>planned float</td><td class="n">${esc(sg(r.floatTerm))}</td></tr>` : ""}<tr><td></td><td><b>Sum</b> (= the delay)</td><td></td><td class="n"><b>${esc(sg(r.sum))}</b></td></tr></tbody></table>`);
  parts.push(`<p><b>The as-built critical path</b>, plan beside actual:</p><table><thead><tr><th>Activity</th><th>Link</th><th>Planned</th><th>Actual</th><th class="n">Planned d</th><th class="n">Actual d</th><th class="n">Wait</th><th class="n">Duration</th><th class="n">Planned float</th></tr></thead><tbody>${r.path.map((x) => `<tr><td title="${esc(x.name)}">${esc(x.code)}</td><td>${esc(x.link)}</td><td>${x.plannedStart ? `${d10(x.plannedStart)} &ndash; ${d10(x.plannedFinish)}` : "<i>added</i>"}</td><td>${d10(x.actualStart)} &ndash; ${d10(x.actualFinish)}</td><td class="n">${esc(x.plannedDays ?? "")}</td><td class="n">${esc(x.actualDays)}</td><td class="n">${esc(x.waitDays === null ? "" : sg(x.waitDays))}</td><td class="n">${esc(x.durationDays === null ? "" : sg(x.durationDays))}</td><td class="n">${esc(x.plannedFloat ?? "")}</td></tr>`).join("")}</tbody></table>`);
  if (r.milestones.length) parts.push(`<p><b>Milestones</b>:</p><table><thead><tr><th>Milestone</th><th>Name</th><th>Planned</th><th>Actual</th><th class="n">Variance</th></tr></thead><tbody>${r.milestones.slice(0, 25).map((m) => `<tr><td>${esc(m.code)}</td><td>${esc(m.name)}</td><td>${d10(m.planned)}</td><td>${d10(m.actual)}</td><td class="n">${esc(sg(m.varianceDays))}</td></tr>`).join("")}</tbody></table>`);
  parts.push(`<p class="note">${esc(r.late.count)} of ${esc(r.late.of)} activities finished later than planned; ${esc(r.added.length)} were added after the plan, ${esc(r.deleted.length)} planned activities were not built. The CSV lists every overrun, addition and deletion.</p>`);
  if (r.warnings.length) parts.push(`<ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`);
  return parts.join("\n");
}
