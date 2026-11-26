// Float the late dates miss across calendars ("calendar slack").
//
// P6's backward pass counts an FF or SF lag back from the successor's late
// finish, a period end such as Thursday 16:00. The forward pass is looser:
// a finish pushed by such a link may land anywhere up to the successor's next
// work start (Saturday 08:00 on a Friday-off calendar) without delaying
// anything. When the lag runs on another calendar that works in that gap (a
// 7-day curing calendar), the predecessor can finish that much later than
// P6's late finish says, and so can everything driving it. P6 stores, and
// cpm.mjs reproduces by default, the tighter dates; calendarSlack: true counts
// the gap (cpm.mjs). This module lists the links where it enters and the
// activities whose total float grows, so a scheduler knows which near-critical
// work is less critical than P6 shows. Checked by forward what-ifs on the
// public hotel file (eval/calendar-slack-2026-11-20.md).
import { schedule, buildModel, lagCalendar } from "./cpm.mjs";
import { formatDate } from "./xer.mjs";

const r2 = (x) => Math.round(x * 100) / 100;

export function calendarSlack(xer, { projId = null, model = null, base = null } = {}) {
  model = model || base?.model || buildModel(xer);
  base = base || schedule(xer, { model });
  const cs = schedule(xer, { model, calendarSlack: true });
  const inProj = (t) => projId === null || t.proj === projId;
  const open = [...model.tasks.values()].filter((t) => inProj(t) && !t.span && t.status !== "TK_Complete" && base.tasks.get(t.id)?.lf !== undefined);
  const activities = [];
  for (const t of open) {
    const b = base.tasks.get(t.id), c = cs.tasks.get(t.id);
    const gain = r2(c.tf - b.tf);
    if (gain > 0) activities.push({ code: t.code, name: t.name, calendar: t.cal.name, tfP6: r2(b.tf), tf: r2(c.tf), gain, lateFinishP6: formatDate(b.lf), lateFinish: formatDate(c.lf) });
  }
  activities.sort((a, b) => a.tfP6 - b.tfP6 || b.gain - a.gain || (a.code < b.code ? -1 : 1));
  const links = [];
  for (const t of open) {
    const c = cs.tasks.get(t.id);
    if (c.lfAbs === undefined || c.lfAbs === c.lf) continue;
    for (const rel of t.preds) {
      if (rel.type !== "PR_FF" && rel.type !== "PR_SF") continue;
      const p = model.tasks.get(rel.predId);
      if (p.span || p.status === "TK_Complete") continue;
      // what the link allows the predecessor, counted back from each finish
      // the way the backward pass does (lag calendar, then the predecessor's
      // own calendar: with no lag, a 7-day predecessor gains the weekend too)
      const lc = lagCalendar(model, rel);
      const back = (v) => p.cal.prevEnd(lc.subWork(v, rel.lag));
      const gap = p.cal.workBetween(back(c.lf), back(c.lfAbs));
      if (gap > 0) links.push({ pred: p.code, succ: t.code, type: rel.type.slice(3), lag: rel.lag / 60, lagCalendar: lc.name, predCalendar: p.cal.name, succCalendar: t.cal.name, succLateFinish: formatDate(c.lf), succMayFinish: formatDate(c.lfAbs), gap: r2(gap / 60) });
    }
  }
  const crit = (tf) => tf <= 0;
  return {
    open: open.length,
    activities,
    links,
    leavesCritical: activities.filter((a) => crit(a.tfP6) && !crit(a.tf)).length,
    maxGain: activities.reduce((m, a) => Math.max(m, a.gain), 0),
  };
}

export function calendarSlackText(r) {
  const out = [];
  if (!r.activities.length) {
    out.push(`Calendar slack: none. No FF or SF link among the ${r.open} open activities lets a predecessor use a successor's non-work time, so no float is added to what P6 shows.`);
    return out.join("\n") + "\n";
  }
  out.push(`Calendar slack: ${r.activities.length} of ${r.open} open activities have more total float than P6 shows (up to ${r.maxGain} h), because a successor's finish may fall in its own non-work time, which the predecessor's (or the lag's) calendar works.${r.leavesCritical ? ` ${r.leavesCritical} that P6 marks critical are not.` : ""}`);
  out.push("", `Where it enters (${r.links.length} link${r.links.length === 1 ? "" : "s"}):`);
  for (const l of r.links.slice(0, 20)) out.push(`  ${l.pred} ("${l.predCalendar}") -${l.type}${l.lag ? ` ${l.lag} h on "${l.lagCalendar}"` : ""}-> ${l.succ} ("${l.succCalendar}"): the successor may finish at ${l.succMayFinish}, not only ${l.succLateFinish}, which gives ${l.pred} ${l.gap} h more`);
  if (r.links.length > 20) out.push(`  ... ${r.links.length - 20} more (--csv)`);
  out.push("", "Least float first (hours on each activity's calendar):");
  for (const a of r.activities.slice(0, 25)) out.push(`  ${a.code.padEnd(16)} TF ${String(a.tfP6).padStart(7)} -> ${String(a.tf).padStart(7)}  (+${a.gain})  ${a.name}`);
  if (r.activities.length > 25) out.push(`  ... ${r.activities.length - 25} more (--csv)`);
  out.push("", "P6's figures are not wrong by its own rules; they are the tighter reading. They differ where an FF or SF link joins two calendars with different working days; aligning them (or putting the predecessor and the lag on the successor's calendar) makes the two readings agree.");
  return out.join("\n") + "\n";
}

export function calendarSlackCsv(r) {
  // a cell a spreadsheet would run as a formula (an activity name from the
  // contractor's file starting with =, +, - or @) is written as text
  const q = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Activity ID", "Activity name", "Calendar", "Total float P6 (h)", "Total float with calendar slack (h)", "Gain (h)", "Late finish P6", "Late finish"]];
  for (const a of r.activities) rows.push([a.code, a.name, a.calendar, a.tfP6, a.tf, a.gain, a.lateFinishP6, a.lateFinish]);
  return rows.map((x) => x.map(q).join(",")).join("\n") + "\n";
}
