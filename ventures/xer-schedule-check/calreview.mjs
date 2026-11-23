// Calendar review: the faults in a P6 schedule's work calendars that move
// dates without showing up in any logic, float or DCMA check.
//
// A schedule's dates are only as right as the calendars they are counted
// on, and calendars are the part of an XER a reviewer reads least: P6 shows
// them in a dialog, one at a time, and the DCMA 14 points never open them.
// The faults found on real files (eval/calendar-review-2026-11-23.md):
//
//   holidays-run-out  a calendar that lists holidays for earlier years and
//                     none for a year its open work still runs through.
//                     Someone built a holiday list once and never extended
//                     it, so the late years count Christmas, New Year and
//                     every public holiday as working days and the forecast
//                     finish is too early. The what-if copies the calendar's
//                     last full year of holidays (same month and day) into
//                     each missing year and reschedules, to say how far the
//                     finish would move.
//   no-holidays       a calendar that works fewer than seven days a week, is
//                     used by open work, and lists no holiday at all.
//   hours-per-day     the calendar's stored Hours per Day differs from the
//                     hours its working days actually hold. P6 stores every
//                     duration in hours and shows it in days by dividing by
//                     an hours-per-day figure (the calendar's, or the admin
//                     default), so a 9-hour calendar labelled 8 shows a
//                     10-day activity that really takes 8.9 of its days.
//   hours-per-week    the same for Hours per Week (weeks shown in a layout).
//   name-days         a calendar named for a number of days a week ("5 Day
//                     Workweek") whose pattern works a different number: the
//                     activities a scheduler put on it by name do not work
//                     the week they think.
//   no-work           a calendar with no working time at all, used by work.
//   every-day         open critical activities with a duration on calendars
//                     that work all seven days: legitimate for curing or
//                     round-the-clock work, but each one is worth a question.
//   duplicate         calendars whose week and exceptions are identical
//                     under different names (a reviewer reads two, P6
//                     schedules one).
//   unused            global or project calendars no activity or project uses.
//
// An exception day counts as a holiday when it removes working time the
// week pattern would give that day (a "holiday" on a Sunday of a Monday to
// Friday calendar changes nothing and is not counted). Days an exception
// adds work to are counted apart.
//
// calendarReview(xer, { model, result, projId, whatIf }) -> {
//   calendars: [...], findings: [...], whatIf, summary, warnings, ms
// }

import { buildModel, schedule } from "./cpm.mjs";
import { formatDate } from "./xer.mjs";

const DAY = 1440;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const dow = (d) => (((d + 4) % 7) + 7) % 7; // day number -> 0 = Sunday
const mins = (ps) => ps.reduce((a, p) => a + p[1] - p[0], 0);
const yearOf = (d) => new Date(d * 86400000).getUTCFullYear();
const dayOf = (y, m, dd) => Date.UTC(y, m, dd) / 86400000;
// a missing year is flagged when the open work covers at least this many
// days of it (a forecast that ends in the first weeks of January needs no
// holiday list for that year)
export const MIN_YEAR_COVER_DAYS = 60;
const SEVERITY = { "holidays-run-out": "fault", "no-work": "fault", "hours-per-day": "fault", "no-holidays": "check", "hours-per-week": "note", "every-day": "check", "name-days": "check", duplicate: "note", unused: "note" };

// per-calendar facts from the week pattern and the exceptions
function describe(cal) {
  const dayMin = cal.week.map(mins);
  const workDays = dayMin.filter((m) => m > 0).length;
  // the typical working day: the most common non-zero day length (ties: longer)
  const freq = new Map();
  for (const m of dayMin) if (m > 0) freq.set(m, (freq.get(m) || 0) + 1);
  let typical = 0, best = 0;
  for (const [m, n] of freq) if (n > best || (n === best && m > typical)) { typical = m; best = n; }
  const holidays = [], added = [];
  for (const [d, ps] of cal.exceptions) {
    const normal = dayMin[dow(d)], got = mins(ps);
    if (got < normal) holidays.push({ d, lostMin: normal - got, full: got === 0 });
    else if (got > normal) added.push({ d, addedMin: got - normal });
  }
  holidays.sort((a, b) => a.d - b.d);
  const byYear = new Map();
  for (const h of holidays) byYear.set(yearOf(h.d), (byYear.get(yearOf(h.d)) || 0) + 1);
  return { dayMin, workDays, typicalHours: typical / 60, weekHours: cal.weekMinutes / 60, holidays, added, byYear };
}

const keyOf = (cal) => JSON.stringify([cal.week, [...cal.exceptions.entries()].sort((a, b) => a[0] - b[0])]);

export function calendarReview(xer, { model = null, result = null, projId = null, whatIf = true } = {}) {
  const t0 = Date.now();
  model = model || result?.model || buildModel(xer);
  const warnings = [];
  if (!result) {
    try { result = schedule(xer, { model }); } catch (e) { warnings.push(`schedule could not be computed (${e.message}); usage is counted without dates`); }
  }
  const inProj = (t) => projId === null || t.proj === projId;
  const rows = new Map((xer.tables.CALENDAR || []).map((r) => [r.clndr_id, r]));
  const crit = (t, r) => {
    const p = model.projects.get(t.proj);
    return r && Number.isFinite(r.tf) && r.tf <= (p?.criticalHours ?? 0) + 1e-9;
  };
  // usage per calendar object
  const use = new Map();
  const u = (cal) => {
    if (!use.has(cal)) use.set(cal, { all: 0, open: [], openWork: [], critical: [], lastFinish: null, firstDD: null });
    return use.get(cal);
  };
  for (const t of model.tasks.values()) {
    if (!inProj(t)) continue;
    const x = u(t.cal);
    x.all++;
    if (t.status === "TK_Complete") continue;
    x.open.push(t);
    const r = result?.tasks.get(t.id);
    const dd = model.projects.get(t.proj)?.dataDate ?? model.anchor;
    if (dd !== null && (x.firstDD === null || dd < x.firstDD)) x.firstDD = dd;
    if (r && Number.isFinite(r.ef) && (x.lastFinish === null || r.ef > x.lastFinish)) x.lastFinish = r.ef;
    const hasWork = !t.span && t.type !== "TT_Mile" && t.type !== "TT_FinMile" && t.remain > 0;
    if (hasWork) x.openWork.push(t);
    if (hasWork && t.remain > 0 && crit(t, r)) x.critical.push(t);
  }
  const projCals = new Set([...model.projects.values()].filter((p) => projId === null || p.id === projId).map((p) => p.cal));

  const calendars = [];
  const findings = [];
  const add = (kind, c, text, acts = [], extra = {}) => findings.push({ kind, severity: Object.hasOwn(SEVERITY, kind) ? SEVERITY[kind] : "note", calendar: c.name, calendarId: c.id, text, activities: acts.map((t) => ({ code: t.code, name: t.name })), ...extra });
  const missingFill = new Map(); // cal -> [{ year, from }]
  const seen = new Map();

  for (const cal of model.cals.values()) {
    const row = rows.get(cal.id) || {};
    const d = describe(cal);
    const x = use.get(cal) || { all: 0, open: [], openWork: [], critical: [], lastFinish: null, firstDD: null };
    const type = row.clndr_type || "";
    const storedHpd = cal.hoursPerDay;
    const storedWeek = row.week_hr_cnt === undefined || row.week_hr_cnt === "" ? null : Number(row.week_hr_cnt);
    const c = {
      id: cal.id, name: cal.name || `calendar ${cal.id}`, type, isDefault: row.default_flag === "Y", projectCalendar: projCals.has(cal),
      workDays: d.workDays, typicalHours: r2(d.typicalHours), weekHours: r2(d.weekHours), storedHoursPerDay: storedHpd, storedHoursPerWeek: storedWeek,
      holidays: d.holidays.length, addedWorkDays: d.added.length, firstHoliday: d.holidays.length ? formatDate(d.holidays[0].d * DAY).slice(0, 10) : null,
      lastHoliday: d.holidays.length ? formatDate(d.holidays.at(-1).d * DAY).slice(0, 10) : null,
      holidaysByYear: Object.fromEntries([...d.byYear].sort((a, b) => a[0] - b[0])),
      activities: x.all, open: x.open.length, openCritical: x.critical.length,
      openFrom: x.firstDD === null ? null : formatDate(x.firstDD).slice(0, 10), openTo: x.lastFinish === null ? null : formatDate(x.lastFinish).slice(0, 10),
      missingYears: [],
    };
    calendars.push(c);
    const used = x.open.length > 0;

    if (!cal.works && x.all) add("no-work", c, `${c.name} has no working time at all, and ${x.all} activit${x.all === 1 ? "y uses" : "ies use"} it: nothing on it can be scheduled.`, x.open);

    // holidays that stop before the work does
    if (used && x.openWork.length && d.holidays.length && x.firstDD !== null && x.lastFinish !== null) {
      const y0 = yearOf(Math.floor(x.firstDD / DAY)), y1 = yearOf(Math.floor(x.lastFinish / DAY));
      const fullYears = [...d.byYear.keys()].filter((y) => d.byYear.get(y) > 0).sort((a, b) => a - b);
      for (let y = y0; y <= y1; y++) {
        if (d.byYear.get(y)) continue;
        const from = Math.max(dayOf(y, 0, 1), Math.floor(x.firstDD / DAY));
        const to = Math.min(dayOf(y + 1, 0, 1), Math.ceil(x.lastFinish / DAY));
        if (to - from < MIN_YEAR_COVER_DAYS) continue;
        // the latest earlier year with holidays, else the earliest later one
        const src = [...fullYears].reverse().find((k) => k < y) ?? fullYears.find((k) => k > y);
        c.missingYears.push(y);
        if (!missingFill.has(cal)) missingFill.set(cal, []);
        missingFill.get(cal).push({ year: y, from: src });
      }
      if (c.missingYears.length) {
        const ys = c.missingYears;
        const typ = median([...d.byYear.values()]);
        add("holidays-run-out", c, `${c.name} lists holidays up to ${c.lastHoliday} (about ${typ} a year) but none in ${listYears(ys)}, while ${x.open.length} open activit${x.open.length === 1 ? "y" : "ies"} on it run${x.open.length === 1 ? "s" : ""} to ${c.openTo}: those years count every public holiday as a working day, so the forecast is early.`, x.critical.length ? x.critical : x.openWork, { years: ys, perYear: typ, listed: x.critical.length ? "critical" : "open" });
      }
    }
    if (used && x.openWork.length && !d.holidays.length && d.workDays > 0 && d.workDays < 7) {
      add("no-holidays", c, `${c.name} works ${d.workDays} days a week and lists no holiday at all; ${x.openWork.length} open activit${x.openWork.length === 1 ? "y" : "ies"} with work use it${c.openTo ? ` (to ${c.openTo})` : ""}. Unless the site truly works through every public holiday, add them.`, x.critical.length ? x.critical : x.openWork, { listed: x.critical.length ? "critical" : "open" });
    }
    // hours per day and per week, as stored against the pattern
    if (used && cal.works && storedHpd !== null && Number.isFinite(storedHpd) && d.typicalHours > 0 && Math.abs(storedHpd - d.typicalHours) > 0.05) {
      const ten = r1((10 * storedHpd) / d.typicalHours);
      add("hours-per-day", c, `${c.name} says ${storedHpd} hours per day, but its working days hold ${r2(d.typicalHours)} hours. P6 shows durations in days by dividing hours by the hours-per-day figure, so a duration shown as 10 days takes ${ten} of this calendar's working days.`, x.openWork, { stored: storedHpd, actual: r2(d.typicalHours) });
    }
    if (used && cal.works && storedWeek !== null && Number.isFinite(storedWeek) && Math.abs(storedWeek - d.weekHours) > 0.05) {
      add("hours-per-week", c, `${c.name} says ${storedWeek} hours per week, but its week holds ${r2(d.weekHours)} hours (${d.workDays} days); durations shown in weeks are off by the same ratio.`, [], { stored: storedWeek, actual: r2(d.weekHours) });
    }
    const named = /(?:^|[^\d])([1-7])[\s-]*days?\b/i.exec(c.name);
    if (used && named && +named[1] !== d.workDays && cal.works) {
      add("name-days", c, `${c.name} is named for ${named[1]} days a week but its pattern works ${d.workDays} (${d.dayMin.map((m, i) => (m ? "SMTWTFS"[i] : "-")).join("")}); the ${x.open.length} open activit${x.open.length === 1 ? "y" : "ies"} on it work ${d.workDays > +named[1] ? "more" : "fewer"} days than the name says.`, x.openWork, { named: +named[1], works: d.workDays });
    }
    if (d.workDays === 7 && x.critical.length) {
      add("every-day", c, `${x.critical.length} open critical activit${x.critical.length === 1 ? "y works" : "ies work"} on ${c.name}, which works all seven days${d.holidays.length ? "" : " with no holidays"}. Right for curing, dewatering or round-the-clock work; for anything else it shortens the critical path.`, x.critical);
    }
    if (cal.works) {
      const k = keyOf(cal);
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(c);
    }
    if (!x.all && !projCals.has(cal) && type !== "CA_Rsrc") add("unused", c, `${c.name} is not used by any activity or project in the file.`);
  }
  for (const group of seen.values()) {
    if (group.length < 2 || !group.some((c) => c.activities || c.projectCalendar)) continue;
    add("duplicate", group[0], `${group.map((c) => c.name).join(", ")} have the same week and the same exceptions: ${group.length} names for one calendar.`, [], { calendars: group.map((c) => c.name) });
  }

  // what-if: the missing years filled from the calendar's own last full year
  let wi = null;
  if (whatIf && missingFill.size && result) {
    try {
      const m2 = buildModel(xer);
      let added = 0;
      for (const [cal, fills] of missingFill) {
        const c2 = m2.cals.get(cal.id);
        if (!c2) continue;
        const desc = describe(cal);
        for (const { year, from } of fills) {
          if (from === undefined) continue;
          for (const h of desc.holidays) {
            if (yearOf(h.d) !== from) continue;
            const dt = new Date(h.d * 86400000);
            const nd = dayOf(year, dt.getUTCMonth(), dt.getUTCDate());
            if (new Date(nd * 86400000).getUTCMonth() !== dt.getUTCMonth()) continue; // 29 February
            if (c2.exceptions.has(nd) || !mins(c2.week[dow(nd)])) continue;
            const keep = mins(cal.exceptions.get(h.d) || []);
            c2.exceptions.set(nd, keep ? [...(cal.exceptions.get(h.d))].map((p) => [...p]) : []);
            added++;
          }
        }
      }
      const r2s = schedule(xer, { model: m2 });
      const projs = [];
      for (const p of model.projects.values()) {
        if (projId !== null && p.id !== projId) continue;
        const a = result.projects.get(p.id)?.finish, b = r2s.projects.get(p.id)?.finish;
        if (a === null || a === undefined || b === null || b === undefined) continue;
        const cal = p.cal;
        const days = r1(cal.workBetween(a, b) / 60 / (cal.hoursPerDay || 8));
        const calDays = r1((b - a) / DAY);
        projs.push({ project: p.code, finish: formatDate(a), finishWithHolidays: formatDate(b), workingDays: days, calendarDays: calDays });
      }
      let moved = 0;
      for (const [id, r] of result.tasks) {
        const t = model.tasks.get(id);
        if (!t || !inProj(t) || t.status === "TK_Complete") continue;
        const s = r2s.tasks.get(id);
        if (s && Number.isFinite(r.ef) && Number.isFinite(s.ef) && s.ef > r.ef) moved++;
      }
      wi = { holidaysAdded: added, projects: projs, activitiesLater: moved };
    } catch (e) {
      warnings.push(`the holiday what-if could not run: ${e.message}`);
    }
  }

  const order = { fault: 0, check: 1, note: 2 };
  const rank = (s) => (Object.hasOwn(order, s) ? order[s] : 3);
  findings.sort((a, b) => rank(a.severity) - rank(b.severity));
  const count = (s) => findings.filter((f) => f.severity === s).length;
  const summary = {
    calendars: calendars.length,
    used: calendars.filter((c) => c.activities).length,
    faults: count("fault"), checks: count("check"), notes: count("note"),
    missingHolidayYears: calendars.reduce((a, c) => a + c.missingYears.length, 0),
  };
  return { calendars, findings, whatIf: wi, summary, warnings, ms: Date.now() - t0 };
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}
function listYears(ys) {
  const runs = [];
  for (const y of ys) {
    const last = runs.at(-1);
    if (last && y === last[1] + 1) last[1] = y; else runs.push([y, y]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");
}

const some = (acts, n = 8) => `${acts.slice(0, n).map((a) => a.code).join(", ")}${acts.length > n ? ` and ${acts.length - n} more` : ""}`;
const label = (sev) => (sev === "fault" ? "FAULT" : sev === "check" ? "CHECK" : "note");

function whatIfLine(w) {
  if (!w || !w.projects.length) return null;
  const head = `With the missing years' holidays put back (${w.holidaysAdded} days, copied by date from each calendar's last listed year), ${w.activitiesLater} open activit${w.activitiesLater === 1 ? "y finishes" : "ies finish"} later.`;
  return [head, ...w.projects.map((p) => p.workingDays > 0 || p.calendarDays > 0 ? `${p.project}: the finish moves from ${p.finish} to ${p.finishWithHolidays}, ${p.workingDays} working days (${p.calendarDays} calendar days) later.` : `${p.project}: the finish stays ${p.finish}.`)].join("\n");
}

export function calendarText(r) {
  const s = r.summary;
  const L = [`Calendar review: ${s.calendars} calendars, ${s.used} used by activities; ${s.faults} fault${s.faults === 1 ? "" : "s"}, ${s.checks} to check, ${s.notes} note${s.notes === 1 ? "" : "s"}. (${r.ms} ms)`];
  for (const f of r.findings) {
    L.push("", `${label(f.severity)} [${f.kind}] ${f.text}`);
    if (f.activities.length) L.push(`  ${f.listed === "critical" ? "critical: " : ""}${some(f.activities)}`);
  }
  const w = whatIfLine(r.whatIf);
  if (w) L.push("", "What-if:", w);
  L.push("", "  calendar                                   days  h/day (stored)  holidays  last holiday  activities (open)");
  for (const c of r.calendars) L.push(`  ${c.name.slice(0, 42).padEnd(42)} ${String(c.workDays).padStart(4)}  ${String(c.typicalHours).padStart(5)} (${c.storedHoursPerDay ?? "-"})`.padEnd(70) + `${String(c.holidays).padStart(8)}  ${(c.lastHoliday || "-").padEnd(12)}  ${c.activities} (${c.open})`);
  if (r.warnings.length) L.push("", ...r.warnings.map((x) => `- ${x}`));
  L.push("", "Screening of the calendars in the file, not scheduling advice: a missing holiday year or a mismatched hours-per-day figure is a question for the scheduler.");
  return L.join("\n") + "\n";
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function calendarCsv(r) {
  const rows = [["severity", "finding", "calendar_id", "calendar", "activity_id", "activity_name", "detail"]];
  for (const f of r.findings) {
    if (!f.activities.length) rows.push([f.severity, f.kind, f.calendarId, f.calendar, "", "", f.text]);
    for (const a of f.activities) rows.push([f.severity, f.kind, f.calendarId, f.calendar, a.code, a.name, f.text]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function calendarTableHtml(r, { limit = 12 } = {}) {
  let h = "";
  if (r.findings.length) {
    h += `<table><thead><tr><th>Finding</th><th>Calendar</th><th>What it means</th><th>Activities</th></tr></thead><tbody>`;
    for (const f of r.findings) h += `<tr><td>${esc(label(f.severity))}<br><small>${esc(f.kind)}</small></td><td>${esc(f.calendar)}</td><td>${esc(f.text)}</td><td>${f.activities.length ? `${f.activities.length}${f.listed === "critical" ? " critical" : ""}: <small>${esc(some(f.activities, limit))}</small>` : ""}</td></tr>`;
    h += `</tbody></table>`;
  } else h += `<p>No calendar faults found.</p>`;
  const w = whatIfLine(r.whatIf);
  if (w) h += `<p><strong>What-if:</strong> ${esc(w).replace(/\n/g, "<br>")}</p>`;
  h += `<table><thead><tr><th>Calendar</th><th>Days a week</th><th>Hours a day (stored)</th><th>Holidays</th><th>Last holiday</th><th>Activities (open)</th></tr></thead><tbody>`;
  for (const c of r.calendars) h += `<tr><td>${esc(c.name)}${c.isDefault ? " <small>default</small>" : ""}</td><td>${c.workDays}</td><td>${c.typicalHours} (${esc(c.storedHoursPerDay ?? "-")})</td><td>${c.holidays}</td><td>${esc(c.lastHoliday || "-")}</td><td>${c.activities} (${c.open})</td></tr>`;
  h += `</tbody></table>`;
  return h;
}
