// Time milestones hold back across calendars.
//
// A milestone has no duration, but P6 still places it on its own calendar:
// a start milestone after a Thursday 16:00 finish, on a calendar with Friday
// off, sits at Saturday 08:00, and a successor on a Monday-to-Friday
// calendar then cannot start until Monday. The Friday is lost to a
// zero-length activity's calendar, which is rarely what the scheduler meant.
// The same happens with a finish milestone, and with any working hours that
// differ (a calendar that starts at 07:00 behind one that starts at 08:00).
//
// This module schedules the file twice, as P6 does and with every milestone
// on a 24-hour calendar (cpm.mjs options.milestones24h), and lists the
// milestones that hold work back, the activities that could start earlier and
// the float they would gain. Putting those milestones on a 24-hour calendar
// (or on their successors' calendar) in P6 gives the second reading. Checked
// by forward what-ifs on the six public files
// (eval/milestone-calendars-2026-11-20.md).
import { schedule, buildModel, lagCalendar } from "./cpm.mjs";
import { formatDate } from "./xer.mjs";

const r2 = (x) => Math.round(x * 100) / 100;
const isMs = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";

export function milestoneCalendars(xer, { projId = null, model = null, base = null } = {}) {
  model = model || base?.model || buildModel(xer);
  base = base || schedule(xer, { model });
  const alt = schedule(xer, { model, milestones24h: true });
  const inProj = (t) => projId === null || t.proj === projId;
  const open = [...model.tasks.values()].filter((t) => inProj(t) && !t.span && t.status !== "TK_Complete" && base.tasks.get(t.id)?.lf !== undefined);
  const openIds = new Set(open.map((t) => t.id));

  // activities (not milestones) that could start or finish earlier
  const activities = [];
  let gainFloat = 0, maxGain = 0, leavesCritical = 0;
  for (const t of open) {
    const b = base.tasks.get(t.id), a = alt.tasks.get(t.id);
    if (!a || a.lf === undefined) continue;
    const gain = r2(a.tf - b.tf);
    if (gain > 0) {
      gainFloat++;
      if (gain > maxGain) maxGain = gain;
      if (b.tf <= 0 && a.tf > 0) leavesCritical++;
    }
    if (isMs(t)) continue;
    const startH = a.es < b.es ? r2(t.cal.workBetween(a.es, b.es) / 60) : 0;
    const finishH = a.ef < b.ef ? r2(t.cal.workBetween(a.ef, b.ef) / 60) : 0;
    if (startH > 0 || finishH > 0) activities.push({ code: t.code, name: t.name, calendar: t.cal.name, start: formatDate(b.es), couldStart: formatDate(a.es), hours: Math.max(startH, finishH), tf: r2(b.tf), tf24: r2(a.tf) });
  }
  activities.sort((x, y) => y.hours - x.hours || x.tf - y.tf || (x.code < y.code ? -1 : 1));

  // the milestones where it starts: a milestone that sits later than its
  // logic puts it, with a successor (not a milestone) on another calendar
  // that could start earlier, through this link, if it did not
  const milestones = [];
  for (const t of open) {
    if (!isMs(t)) continue;
    const b = base.tasks.get(t.id), a = alt.tasks.get(t.id);
    if (!a || a.es >= b.es) continue;
    const successors = [];
    for (const rel of t.succs) {
      const s = model.tasks.get(rel.succId);
      if (!openIds.has(s.id) || isMs(s)) continue;
      const sb = base.tasks.get(s.id), sa = alt.tasks.get(s.id);
      // only a successor this link drives (its start is the milestone's
      // date plus the lag, on the successor's calendar)
      // an activity under way: an FS link holds its remaining work
      // (retained logic), so read its remaining start instead
      const started = s.status === "TK_Active";
      if (rel.type !== "PR_FS" && (rel.type !== "PR_SS" || started)) continue;
      if (s.status !== "TK_NotStart" && !started) continue;
      const k = started ? "remES" : "es";
      if (sb[k] === undefined || sa[k] === undefined) continue;
      if (s.cal.nextStart(lagCalendar(model, rel).addWork(b.es, rel.lag)) !== sb[k]) continue;
      const h = sa[k] < sb[k] ? r2(s.cal.workBetween(sa[k], sb[k]) / 60) : 0;
      if (h > 0) successors.push({ code: s.code, calendar: s.cal.name, start: formatDate(sb[k]), couldStart: formatDate(sa[k]), hours: h, ...(started ? { remaining: true } : {}) });
    }
    if (!successors.length) continue;
    milestones.push({
      code: t.code, name: t.name, type: t.type === "TT_Mile" ? "start" : "finish", calendar: t.cal.name,
      sits: formatDate(b.es), logicGives: formatDate(a.es),
      hours: successors.reduce((m, s) => Math.max(m, s.hours), 0), successors,
    });
  }
  milestones.sort((x, y) => y.hours - x.hours || (x.code < y.code ? -1 : 1));

  const finishes = [];
  for (const [id, p] of base.projects) {
    if (projId !== null && id !== projId) continue;
    const q = alt.projects.get(id);
    if (p.finish === null || p.finish === undefined) continue;
    finishes.push({ project: p.code ?? String(id), finish: formatDate(p.finish), finish24: formatDate(q.finish), moved: q.finish !== p.finish });
  }
  return { open: open.length, milestones, activities, gainFloat, maxGain, leavesCritical, finishes };
}

export function milestoneCalendarsText(r) {
  const out = [];
  if (!r.milestones.length && !r.gainFloat) {
    out.push(`Milestone calendars: none. No milestone among the ${r.open} open activities is placed later than its logic by its own calendar in a way that holds work back.`);
    return out.join("\n") + "\n";
  }
  out.push(`Milestone calendars: ${r.milestones.length} milestone${r.milestones.length === 1 ? " holds" : "s hold"} work back by their own calendar's non-work time. On a 24-hour calendar, ${r.activities.length} ${r.activities.length === 1 ? "activity" : "activities"} could start or finish earlier and ${r.gainFloat} of ${r.open} open activities would have more total float (up to ${r.maxGain} h).${r.leavesCritical ? ` ${r.leavesCritical} that P6 marks critical would not be.` : ""}`);
  for (const f of r.finishes) out.push(`  Project ${f.project}: finish ${f.finish}${f.moved ? `, ${f.finish24} with milestones on a 24-hour calendar` : ", unchanged"}`);
  if (r.milestones.length) {
    out.push("", "Milestones that hold work back (largest first):");
    for (const m of r.milestones.slice(0, 20)) {
      const s = m.successors.slice(0, 3).map((x) => `${x.code}${x.remaining ? "'s remaining work" : ""} ("${x.calendar}") ${x.start} -> ${x.couldStart}, ${x.hours} h`).join("; ");
      out.push(`  ${m.code} (${m.type} milestone, "${m.calendar}") sits at ${m.sits}; on a 24-hour calendar, ${m.logicGives}. ${s}${m.successors.length > 3 ? `; ${m.successors.length - 3} more` : ""}`);
    }
    if (r.milestones.length > 20) out.push(`  ... ${r.milestones.length - 20} more (--csv)`);
  }
  out.push("", "P6's dates are right by its own rules: a milestone takes its calendar. If the milestones mark hand-overs rather than a crew's working day, put them on a 24-hour calendar (or their successors' calendar) and the time comes back.");
  return out.join("\n") + "\n";
}

export function milestoneCalendarsCsv(r) {
  const q = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Milestone ID", "Milestone name", "Type", "Milestone calendar", "Sits at", "On a 24-hour calendar", "Successor ID", "Successor calendar", "Successor start", "Could start", "Hours lost (successor calendar)"]];
  for (const m of r.milestones) for (const s of m.successors) rows.push([m.code, m.name, m.type, m.calendar, m.sits, m.logicGives, s.code, s.calendar, s.start, s.couldStart, s.hours]);
  return rows.map((x) => x.map(q).join(",")).join("\n") + "\n";
}
