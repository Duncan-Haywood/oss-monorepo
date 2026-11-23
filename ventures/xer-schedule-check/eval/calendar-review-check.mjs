// Check for calreview.mjs on the public P6 files: does it name calendar
// faults planted into real calendars, stay quiet on changes that should not
// matter, and does its holiday what-if recover the finish the real holidays
// give?
//
//   bash eval/corpus-fetch.sh DIR && node eval/calendar-review-check.mjs DIR/xer [--json out.json]
//
// For every calendar that open work uses:
// 1. Holidays removed: for each year the calendar's open work covers by at
//    least MIN_YEAR_COVER_DAYS days and that lists holidays, a copy of the
//    file with that year's holiday exceptions deleted. Expected: a
//    holidays-run-out finding on that calendar naming that year. The
//    what-if then copies the neighbouring year's holidays back by date; its
//    finish is compared with the unplanted file's own finish (the real
//    holidays), which it should come close to (Easter and other moving
//    holidays land on different dates, so not always exactly).
// 2. Control: a year before the data date with holidays deleted. Expected:
//    no new finding (work no longer runs through it).
// 3. Hours per day: the calendar's day_hr_cnt raised by one hour. Expected:
//    an hours-per-day finding on it. Control: day_hr_cnt set to the hours
//    its days really hold, no finding.
// 4. Name: the calendar renamed "<n> Day Workweek" for an n other than the
//    days it works. Expected: a name-days finding. Control: renamed for the
//    days it does work, no finding.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer, parseXer } from "../xer.mjs";
import { buildModel, schedule } from "../cpm.mjs";
import { calendarReview, MIN_YEAR_COVER_DAYS } from "../calreview.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
if (!dir) { console.error("usage: node eval/calendar-review-check.mjs DIR [--json out.json]"); process.exit(2); }

const SERIAL = Date.UTC(1899, 11, 30) / 86400000;
// one exception node: (0||k(d|N)()) or with work periods as children
const EXC = /\(0\|\|\d+\(d\|(\d+)\)\((?:[\s\x7f]*\(0\|\|\d+\([^()]*\)\(\)\)[\s\x7f]*)*\)\)/g; // P6 writes line breaks in the field as 0x7F
const yearOfSerial = (n) => new Date((n + SERIAL) * 86400000).getUTCFullYear();

function withCalendar(xer, id, change) {
  const CAL = xer.tables.CALENDAR.map((r) => (r.clndr_id === id ? change({ ...r }) : r));
  return { ...xer, tables: { ...xer.tables, CALENDAR: CAL } };
}
const dropYear = (y) => (r) => { r.clndr_data = r.clndr_data.replace(EXC, (m, n) => (yearOfSerial(+n) === y ? "" : m)); return r; };
const keyOf = (f) => `${f.kind}|${f.calendarId}|${(f.years || []).join(",")}`;

const out = { files: [], totals: {} };
const T = { runOut: [0, 0], runOutControl: [0, 0], hpd: [0, 0], hpdControl: [0, 0], name: [0, 0], nameControl: [0, 0] };
const recover = [];
for (const name of readdirSync(dir).filter((f) => f.endsWith(".xer")).sort()) {
  const xer = parseXer(decodeXer(readFileSync(join(dir, name))));
  const model = buildModel(xer);
  const result = schedule(xer, { model });
  const base = calendarReview(xer, { model, result });
  const baseKeys = new Set(base.findings.map(keyOf));
  const file = { file: name, baseline: base.findings.map((f) => ({ kind: f.kind, calendar: f.calendar, years: f.years, activities: f.activities.length })), plants: [] };
  const finishOf = (r) => Object.fromEntries([...r.projects].map(([k, p]) => [k, p.finish]));
  const rawFinish = finishOf(result);
  const realFinish = finishOf(result);
  // the finish the file's real holidays give, with any year the file itself
  // is missing filled the same way (so a fault already in the file does not
  // count against the what-if)
  if (base.whatIf) for (const p of base.whatIf.projects) {
    const pid = [...model.projects.values()].find((q) => q.code === p.project)?.id;
    if (pid !== undefined) realFinish[pid] = Date.parse(p.finishWithHolidays.replace(" ", "T") + ":00Z") / 60000;
  }
  for (const c of base.calendars) {
    if (!c.open) continue;
    const cal = model.cals.get(c.id);
    const row = xer.tables.CALENDAR.find((r) => r.clndr_id === c.id);
    if (!row || !(row.clndr_data || "").trim()) continue;
    // 1 and 2: holiday years
    const from = c.openFrom ? Date.parse(c.openFrom) / 86400000 : null, to = c.openTo ? Date.parse(c.openTo) / 86400000 : null;
    for (const [ys, n] of Object.entries(c.holidaysByYear)) {
      const y = +ys;
      if (!n || from === null) continue;
      const cover = Math.min(Date.UTC(y + 1, 0, 1) / 86400000, to) - Math.max(Date.UTC(y, 0, 1) / 86400000, from);
      const planted = withCalendar(xer, c.id, dropYear(y));
      if (cover >= MIN_YEAR_COVER_DAYS) {
        const r = calendarReview(planted);
        const hit = r.findings.find((f) => f.kind === "holidays-run-out" && f.calendarId === c.id && f.years.includes(y));
        T.runOut[1]++; if (hit) T.runOut[0]++;
        // what-if against the real holidays
        const rec = { file: name, calendar: c.name, year: y, removed: n, projects: [] };
        if (r.whatIf) for (const p of r.whatIf.projects) {
          const pid = [...model.projects.values()].find((q) => q.code === p.project)?.id;
          const real = realFinish[pid];
          if (real === null || real === undefined) continue;
          const pc = model.projects.get(pid).cal;
          const dayH = pc.hoursPerDay || 8;
          const wiF = Date.parse(p.finishWithHolidays.replace(" ", "T") + ":00Z") / 60000;
          const noF = Date.parse(p.finish.replace(" ", "T") + ":00Z") / 60000;
          rec.projects.push({ project: p.project, plantedDaysEarly: Math.round(pc.workBetween(noF, rawFinish[pid]) / 60 / dayH * 10) / 10, whatIfOffBy: Math.round(pc.workBetween(real, wiF) / 60 / dayH * 10) / 10 });
        }
        recover.push(rec);
        file.plants.push({ plant: "holidays removed", calendar: c.name, year: y, found: !!hit });
      } else if (y < new Date(from * 86400000).getUTCFullYear()) {
        const r = calendarReview(planted, { whatIf: false });
        const extra = r.findings.filter((f) => !baseKeys.has(keyOf(f)));
        T.runOutControl[1]++; if (!extra.length) T.runOutControl[0]++;
        file.plants.push({ plant: "past year removed (control)", calendar: c.name, year: y, quiet: !extra.length, extra: extra.map(keyOf) });
      }
    }
    if (!cal.works) continue;
    // 3: hours per day
    const typ = c.typicalHours;
    {
      const r = calendarReview(withCalendar(xer, c.id, (q) => { q.day_hr_cnt = String(typ + 1); return q; }), { whatIf: false });
      const hit = r.findings.some((f) => f.kind === "hours-per-day" && f.calendarId === c.id);
      T.hpd[1]++; if (hit) T.hpd[0]++;
      const r2 = calendarReview(withCalendar(xer, c.id, (q) => { q.day_hr_cnt = String(typ); return q; }), { whatIf: false });
      const quiet = !r2.findings.some((f) => f.kind === "hours-per-day" && f.calendarId === c.id);
      T.hpdControl[1]++; if (quiet) T.hpdControl[0]++;
      file.plants.push({ plant: "hours per day +1", calendar: c.name, found: hit, controlQuiet: quiet });
    }
    // 4: name
    {
      const wrong = c.workDays === 5 ? 6 : 5;
      const r = calendarReview(withCalendar(xer, c.id, (q) => { q.clndr_name = `${wrong} Day Workweek`; return q; }), { whatIf: false });
      const hit = r.findings.some((f) => f.kind === "name-days" && f.calendarId === c.id);
      T.name[1]++; if (hit) T.name[0]++;
      const r2 = calendarReview(withCalendar(xer, c.id, (q) => { q.clndr_name = `${c.workDays} Day Workweek`; return q; }), { whatIf: false });
      const quiet = !r2.findings.some((f) => f.kind === "name-days" && f.calendarId === c.id);
      T.nameControl[1]++; if (quiet) T.nameControl[0]++;
      file.plants.push({ plant: "renamed", calendar: c.name, found: hit, controlQuiet: quiet });
    }
  }
  out.files.push(file);
  console.log(`${name}: baseline ${base.findings.length} findings (${base.summary.faults} faults); ${file.plants.length} plants, ${file.plants.filter((p) => p.found === false || p.quiet === false || p.controlQuiet === false).length} missed`);
}
out.totals = T;
out.whatIf = recover;
const fmt = ([a, b]) => `${a}/${b}`;
console.log(`\nholidays removed, named: ${fmt(T.runOut)}; past-year control quiet: ${fmt(T.runOutControl)}`);
console.log(`hours per day +1, named: ${fmt(T.hpd)}; set to the true hours, quiet: ${fmt(T.hpdControl)}`);
console.log(`renamed for the wrong days, named: ${fmt(T.name)}; renamed for the right days, quiet: ${fmt(T.nameControl)}`);
const pr = recover.flatMap((r) => r.projects.map((p) => ({ ...p, file: r.file, calendar: r.calendar, year: r.year })));
const moved = pr.filter((p) => p.plantedDaysEarly > 0);
console.log(`what-if: ${pr.length} project finishes; removing the year made ${moved.length} early (by ${moved.map((p) => p.plantedDaysEarly).join(", ") || "-"} working days)`);
console.log(`  after the what-if, off the real finish by (working days): ${moved.map((p) => p.whatIfOffBy).join(", ") || "-"}`);
for (const p of pr) console.log(`  ${p.file} ${p.calendar} ${p.year} ${p.project}: planted ${p.plantedDaysEarly} d early, what-if off by ${p.whatIfOffBy} d`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
