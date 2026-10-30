#!/usr/bin/env node
// Weekly shift roster from a staff file and a shifts file, in a terminal.
//
//   node cli.mjs staff.txt shifts.txt                       # who works what, open shifts and why, payroll, who the week depends on
//   node cli.mjs --last-week roster.csv staff.txt shifts.txt  # carry last week's end times over Monday (rest rule)
//   node cli.mjs --ot-after 40 --rest 11 --balance 50 staff.txt shifts.txt
//   node cli.mjs --csv staff.txt shifts.txt > roster.csv    # also --hours, --json
//   node cli.mjs --week-start 2026-10-19 --ics [--person Sam] staff.txt shifts.txt > week.ics   # calendar file, all or one person
//   node cli.mjs --messages [--week-start 2026-10-19] staff.txt shifts.txt   # one paste-ready text per person
//   node cli.mjs --open-post [--week-start 2026-10-19] staff.txt shifts.txt   # group message for shifts left open, with who could take each
//   node cli.mjs --check staff.txt shifts.txt               # exit 1 if any shift stays open (cron, CI, a Sunday reminder)
//   node cli.mjs --weeks 4 --week-start 2026-11-02 staff.txt shifts.txt   # a month: rest gaps and tough-shift tallies carry week to week
//   node cli.mjs --changes posted.csv --week-start 2026-11-02 --changed-at "2026-10-30 14:00" staff.txt shifts.txt   # what changed since you posted, notice and premium on your numbers
//   node cli.mjs --example                                  # run on the built-in invented week
//
// Staff and shift files are the same text as on the web page. Zero dependencies, no network: names and wages never
// leave the machine. Same solver as the web page (calc.mjs); the search is seeded, so a rerun gives the same roster.
// Planning aid: not legal advice, and local scheduling-notice, break and minor-labor rules are not modelled.

import { readFile } from "node:fs/promises";
import process from "node:process";
import { importStaffCsv } from "./import-staff.mjs";
import { importShiftsCsv } from "./import-shifts.mjs";
import {
  parseStaff, parseShifts, buildRoster, planWeeks, planFairness, planStreaks, optimalityText, rosterCsv, scheduleChanges, hoursCsv, rosterIcs, rosterMessages, openShiftPost, carryOverStaff, sampleStaff, sampleShifts,
  DAYS, fmtClock, money, num,
} from "./calc.mjs";

const USAGE = `Build a weekly roster that respects availability, hour limits and rest, covers as many shifts as it can, and avoids overtime.

Usage:
  node cli.mjs [options] <staff.txt | -> <shifts.txt>

Options:
  --rest <h>          hours of rest between shifts (default 10)
  --consec <n>        most days in a row (default 6)
  --daily <h>         daily hour cap (default none)
  --ot-after <h>      weekly overtime threshold (default 40)
  --ot-mult <x>       overtime multiplier (default 1.5)
  --balance <0-100>   how hard to even out hours (default 25)
  --tough-balance <0-100>  how hard to even out weekend, closing and opening shifts across weeks (default 0)
  --week-start <date> Monday of the week, YYYY-MM-DD (lets time-off dates in the staff file apply)
  --last-week <csv>   last week's roster CSV, to carry shift end times into Monday
  --csv | --hours | --json   machine-readable output
  --ics [--person <name>]    calendar file for the week (needs --week-start, a Monday); one person's shifts with --person
  --messages                 a paste-ready text per person
  --open-post                a group message for the shifts left open and who could take each (empty when none)
  --open-shift-hours <h>  when shifts must stay open, count each open shift as <h> hours: 0 leaves the fewest hours open, 100 the fewest shifts
                      (runs the slower exact repair; the plain build leaves it out)
  --no-prove          skip the exact search (it runs by itself on weeks of up to 14 shifts)
  --prove             also run an exact search (small weeks) and say whether the roster is provably the best, or how far off
  --weeks <n>         plan n consecutive weeks (1-8) from the same shifts; needs --week-start so dated time off lands in its week;
                      rest gaps and the tough-shift tally carry over; prints a fairness total. With --csv a "week" column is added
  --changes <csv>     compare the roster you posted (CSV) with this build: every shift added, cancelled or moved, its notice and the premium
                      on your numbers. Needs --week-start and --changed-at "YYYY-MM-DD HH:MM" for notice; --notice-hours (default 336),
                      --premium-hours (default 1) and --exempt "Ben,Cleo" (employee-requested changes) are yours to set, not a statement of any law
  --import-shifts <csv> convert a published-schedule export (date, start, end, position rows) to shift lines on stdout; notes on stderr
  --import-staff <csv>  convert a staff export from another scheduler (name, hourly rate, hours, position columns) to staff lines on stdout; notes on stderr
  --check             print the report; exit 1 if any shift is left open
  --example           use the built-in invented week
  -h, --help          this text

Planning aid, not legal advice. It does not know your local scheduling-notice, break or minor-labor rules.
`;

const FLAGS = {
  "--rest": "minRestHours", "--consec": "maxConsecDays", "--daily": "maxDailyHours", "--ot-after": "otAfter",
  "--ot-mult": "otMult", "--balance": "balance", "--tough-balance": "toughBalance", "--open-shift-hours": "openShiftWeight",
};

export function parseArgs(argv) {
  const o = { options: {}, files: [], mode: "report", example: false, check: false, help: false, lastWeek: null, weekStart: null, person: null, weeks: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--csv") o.mode = "csv";
    else if (a === "--hours") o.mode = "hours";
    else if (a === "--json") o.mode = "json";
    else if (a === "--ics") o.mode = "ics";
    else if (a === "--messages") o.mode = "messages";
    else if (a === "--open-post") o.mode = "open-post";
    else if (a === "--person") { o.person = argv[++i]; if (!o.person) throw new Error("--person needs a name"); }
    else if (a === "--import-shifts") { o.importShifts = argv[++i]; if (!o.importShifts) throw new Error("--import-shifts needs a CSV file"); }
    else if (a === "--import-staff") { o.importStaff = argv[++i]; if (!o.importStaff) throw new Error("--import-staff needs a CSV file"); }
    else if (a === "--check") o.check = true;
    else if (a === "--changes") { o.changes = argv[++i]; if (!o.changes) throw new Error("--changes needs the posted roster CSV"); }
    else if (a === "--changed-at") {
      o.changedAt = argv[++i];
      if (!/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}$/.test(o.changedAt || "")) throw new Error('--changed-at needs a date and time like "2026-10-30 14:00"');
    }
    else if (a === "--exempt") { o.exempt = argv[++i]; if (o.exempt === undefined) throw new Error("--exempt needs names, comma separated"); }
    else if (a === "--notice-hours" || a === "--premium-hours") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`${a} needs a number`);
      o[a === "--notice-hours" ? "noticeHours" : "premiumHours"] = v;
    }
    else if (a === "--prove") o.options.exact = true;
    else if (a === "--no-prove") o.options.exact = false;
    else if (a === "--weeks") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 1 || v > 8) throw new Error("--weeks needs a whole number from 1 to 8");
      o.weeks = v;
    } else if (a === "--example") o.example = true;
    else if (a === "--last-week") { o.lastWeek = argv[++i]; if (!o.lastWeek) throw new Error("--last-week needs a CSV file"); }
    else if (a === "--week-start") {
      o.weekStart = argv[++i];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.weekStart || "")) throw new Error("--week-start needs a date like 2026-10-19");
    } else if (FLAGS[a]) {
      const v = argv[++i];
      if (v === undefined || v === "" || !Number.isFinite(Number(v))) throw new Error(`${a} needs a number`);
      o.options[FLAGS[a]] = Number(v);
    } else if (a === "-" || !a.startsWith("--")) o.files.push(a);
    else throw new Error(`Unknown option ${a}. Try --help.`);
  }
  if (o.options.openShiftWeight !== undefined) o.options.openShiftWeight = Math.min(1000, Math.max(0, o.options.openShiftWeight));
  if (o.options.balance !== undefined) o.options.balance = Math.min(100, Math.max(0, o.options.balance));
  return o;
}

async function readInput(file) {
  if (file === "-") { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString("utf8"); }
  return readFile(file, "utf8");
}

const clock = (s) => `${fmtClock(s.startMin)}-${fmtClock(s.endMin)}`;

// Minutes from Monday 00:00 of weekStart to a "YYYY-MM-DD HH:MM" wall-clock time (calendar arithmetic only, no time zones).
function minutesSinceMonday(weekStart, when) {
  const t = (x) => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(x); return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000; };
  return t(when) - t(`${weekStart} 00:00`);
}

function changesReport(staff, opts, revisedCsv) {
  const known = opts.changedAt && opts.weekStart;
  const wages = Object.fromEntries(staff.map((p) => [p.name, p.wage]));
  const r = scheduleChanges(opts.postedCsv, revisedCsv, {
    changedAt: known ? minutesSinceMonday(opts.weekStart, opts.changedAt) : null,
    noticeHours: opts.noticeHours ?? 336, premiumHours: opts.premiumHours ?? 1, wages, exempt: String(opts.exempt || "").split(","),
  });
  const lines = [];
  for (const c of r.changes) {
    const what = c.kind === "added" ? `added ${clockOf(c.to)}` : c.kind === "cancelled" ? `cancelled ${clockOf(c.from)}` : `moved ${clockOf(c.from)} -> ${clockOf(c.to)}`;
    const note = !r.noticeKnown ? "" : c.exempt ? "  requested, no premium" : c.premiumUnpriced ? "  short notice, no wage on file" : c.shortNotice ? `  ${num(c.noticeHours)} h notice, premium ${money(c.premium)}` : `  ${num(c.noticeHours)} h notice`;
    lines.push(`${c.person.padEnd(12)} ${DAYS[(c.to || c.from).day]} ${what} (${c.hoursDelta > 0 ? "+" : ""}${num(c.hoursDelta)} h)${note}`);
  }
  const head = r.noticeKnown
    ? `${r.changes.length} change(s), ${r.shortNotice} on short notice (under ${num(opts.noticeHours ?? 336)} h). Premium on your numbers (${num(opts.premiumHours ?? 1)} h of pay each): ${money(r.owed)}.`
    : `${r.changes.length} change(s). Give --week-start and --changed-at to see notice and premium.`;
  return [head, ...lines, "", "Arithmetic on the window and premium you entered, not a statement of what any scheduling law requires. Not legal advice.", ""].join("\n");
}
const clockOf = (x) => `${fmtClock(x.start % 1440)}-${fmtClock(x.end % 1440 || 1440)}`;

/** Pure core: returns { code, out } so tests need no process. */
export function run(staffText, shiftsText, opts = {}) {
  const staffIn = opts.lastWeekCsv ? carryOverStaff(staffText, opts.lastWeekCsv).text : staffText;
  const st = parseStaff(staffIn, { weekStart: opts.weekStart || null });
  const sh = parseShifts(shiftsText);
  const errors = [...st.errors, ...sh.errors];
  if (errors.length) return { code: 2, out: errors.join("\n") + "\n" };
  const r = buildRoster(st.staff, sh.slots, opts.options || {});
  if (r.error) return { code: 2, out: r.error + "\n" };
  const open = r.unfilledSlots > 0;
  const code = opts.check && open ? 1 : 0;
  if (opts.mode === "csv") return { code, out: rosterCsv(r) };
  if (opts.mode === "ics") {
    if (!opts.weekStart) return { code: 2, out: "--ics needs --week-start (the Monday, YYYY-MM-DD)\n" };
    if (opts.person && !r.people.some((p) => p.name === opts.person)) return { code: 2, out: `No one named ${opts.person} in the staff file\n` };
    try { return { code, out: rosterIcs(r, opts.weekStart, opts.person || null) }; } catch (e) { return { code: 2, out: e.message + "\n" }; }
  }
  if (opts.mode === "open-post") {
    try { const p = openShiftPost(st.staff, sh.slots, r, opts.weekStart || null); return { code, out: p.text ? p.text + "\n" : "" }; } catch (e) { return { code: 2, out: e.message + "\n" }; }
  }
  if (opts.mode === "messages") {
    try { return { code, out: rosterMessages(r, opts.weekStart || null).map((m) => m.text).join("\n\n") + "\n" }; } catch (e) { return { code: 2, out: e.message + "\n" }; }
  }
  if (opts.postedCsv) return { code, out: changesReport(st.staff, opts, rosterCsv(r)) };
  if (opts.mode === "hours") return { code, out: hoursCsv(r) };
  if (opts.mode === "json") {
    return {
      code,
      out: JSON.stringify({
        payroll: r.cost, overtimeHours: r.otHours, unfilledShifts: r.unfilledSlots, unfilledHours: r.unfilledHours,
        assignments: r.assignments.map((a) => ({ day: DAYS[a.slot.day], start: fmtClock(a.slot.startMin), end: fmtClock(a.slot.endMin), label: a.slot.label || "", role: a.slot.role || "", person: a.person })),
        people: r.people.map((p) => ({ name: p.name, hours: p.hours, short: p.short })),
        unfilled: r.unfilled.map((u) => ({ day: DAYS[u.slot.day], start: fmtClock(u.slot.startMin), end: fmtClock(u.slot.endMin), why: u.text })),
        critical: r.critical, warnings: r.warnings, optimality: r.optimality || undefined,
      }, null, 2) + "\n",
    };
  }
  return { code, out: reportText(r) };
}

function reportText(r) {
  const lines = [`${r.slots - r.unfilledSlots} of ${r.slots} shifts covered, payroll ${money(r.cost)}, ${num(r.otHours)} overtime hours`, ""];
  const w = Math.max(...r.grid.map((g) => g.name.length));
  for (const g of r.grid) {
    const bits = g.days.map((d, i) => (d.length ? `${DAYS[i]} ${d.join(", ")}` : null)).filter(Boolean);
    lines.push(`  ${g.name.padEnd(w)}  ${bits.length ? bits.join("; ") : "(no shifts)"}`);
  }
  if (r.unfilled.length) {
    lines.push("", "Shifts left open:");
    for (const u of r.unfilled) lines.push(`  ${DAYS[u.slot.day]} ${clock(u.slot)}${u.slot.label ? " " + u.slot.label : ""}: ${u.text}`);
  }
  if (r.critical.length) {
    lines.push("", "The week depends on:");
    for (const c of r.critical) lines.push(`  ${c.name}: without them ${num(c.extraUnfilledHours)} more hours go uncovered`);
  }
  if (r.warnings.length) lines.push("", ...r.warnings.map((x) => `Note: ${x}`));
  if (r.optimality) lines.push("", optimalityText(r.optimality));
  if (r.savingVsListed > 0.5) lines.push("", `Versus filling shifts in the order listed: saves ${money(r.savingVsListed)}.`);
  lines.push("", "Planning aid, not legal advice. Local scheduling-notice, break and minor-labor rules are not modelled.");
  return lines.join("\n") + "\n";
}

/** Several weeks in a row (planWeeks): one report per week, then each person's tough shifts added up. */
export function runPlan(staffText, shiftsText, opts = {}) {
  if (!opts.weekStart) return { code: 2, out: "--weeks needs --week-start (the first Monday, YYYY-MM-DD)\n" };
  if (new Date(opts.weekStart + "T00:00:00Z").getUTCDay() !== 1) return { code: 2, out: "--week-start must be a Monday\n" };
  const staffIn = opts.lastWeekCsv ? carryOverStaff(staffText, opts.lastWeekCsv).text : staffText;
  const plan = planWeeks(staffIn, shiftsText, { ...(opts.options || {}), weeks: opts.weeks, weekStart: opts.weekStart });
  if (plan.error) return { code: 2, out: plan.error + "\n" };
  const code = opts.check && plan.totalOpenHours > 0 ? 1 : 0;
  if (opts.mode === "csv") {
    const rows = plan.weeks.map((w) => w.csv.trimEnd().split("\n").map((l, i) => (i === 0 ? "week," : `${w.weekStart},`) + l));
    return { code, out: [rows[0][0], ...rows.flatMap((r) => r.slice(1))].join("\n") + "\n" };
  }
  if (opts.mode === "json") {
    return { code, out: JSON.stringify({
      totalPayroll: plan.totalCost, totalOpenHours: plan.totalOpenHours,
      weeks: plan.weeks.map((w) => ({ weekStart: w.weekStart, payroll: w.roster.cost, overtimeHours: w.roster.otHours, unfilledShifts: w.roster.unfilledSlots, unfilledHours: w.roster.unfilledHours })),
      fairness: planFairness(plan).rows,
      streaks: planStreaks(plan).rows,
    }, null, 2) + "\n" };
  }
  if (opts.mode !== "report") return { code: 2, out: "--weeks works with the report, --csv and --json outputs\n" };
  const lines = [];
  for (const w of plan.weeks) lines.push(`=== Week ${w.week}, starting ${w.weekStart} ===`, reportText(w.roster).replace(/\nPlanning aid, not legal advice[^\n]*\n$/, ""), "");
  const f = planFairness(plan);
  lines.push(`=== ${plan.weeks.length} weeks: payroll ${money(plan.totalCost)}, ${num(plan.totalOpenHours)} hours left open ===`, "", "Tough shifts (weekend, closing, opening) per person over the plan:");
  const w = Math.max(...f.rows.map((x) => x.name.length));
  for (const x of f.rows) lines.push(`  ${x.name.padEnd(w)}  ${x.tough} tough of ${x.shifts} shifts (${x.weekend} weekend, ${x.closing} closing, ${x.opening} opening), ${num(x.hours)} h`);
  if (f.flag) lines.push("", `Uneven: ${f.most.name} has ${f.spread} more tough shifts than ${f.least.name}. Try --tough-balance, or widen who can close or open.`);
  const st = planStreaks(plan);
  const dayName = (d) => `week ${Math.floor(d / 7) + 1} ${DAYS[d % 7]}`;
  for (const x of st.flag) lines.push("", `${x.name} works ${x.longest} days in a row (${dayName(x.from)} to ${dayName(x.to)}). Check your state's consecutive-day rule; the search does not limit it.`);
  lines.push("", "Planning aid, not legal advice. Local scheduling-notice, break and minor-labor rules are not modelled.");
  return { code, out: lines.join("\n") + "\n" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) { process.stdout.write(USAGE); process.exit(0); }
    if (o.importShifts) {
      const r = importShiftsCsv(await readFile(o.importShifts, "utf8"));
      for (const n of [...r.notes, ...r.skipped.map((x) => "Skipped " + x)]) process.stderr.write(n + "\n");
      if (!r.rows) process.exit(1);
      process.stdout.write(r.shiftsText + "\n"); process.exit(0);
    }
    if (o.importStaff) {
      const r = importStaffCsv(await readFile(o.importStaff, "utf8"));
      for (const n of [...r.notes, ...r.skipped.map((x) => "Skipped " + x)]) process.stderr.write(n + "\n");
      if (!r.rows) process.exit(1);
      process.stdout.write(r.staffText + "\n"); process.exit(0);
    }
    if (!o.example && o.files.length !== 2) { process.stderr.write(USAGE); process.exit(2); }
    const [staffText, shiftsText] = o.example
      ? [sampleStaff(), sampleShifts()]
      : [await readInput(o.files[0]), await readFile(o.files[1], "utf8")];
    const postedCsv = o.changes ? await readFile(o.changes, "utf8") : null;
    const lastWeekCsv = o.lastWeek ? await readFile(o.lastWeek, "utf8") : null;
    const r = o.weeks > 1 ? runPlan(staffText, shiftsText, { ...o, lastWeekCsv }) : run(staffText, shiftsText, { ...o, lastWeekCsv, postedCsv });
    (r.code === 2 ? process.stderr : process.stdout).write(r.out);
    process.exit(r.code);
  } catch (e) { process.stderr.write(`${e.message}\n`); process.exit(2); }
}
