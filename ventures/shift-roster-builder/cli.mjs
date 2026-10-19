#!/usr/bin/env node
// Weekly shift roster from a staff file and a shifts file, in a terminal.
//
//   node cli.mjs staff.txt shifts.txt                       # who works what, open shifts and why, payroll, who the week depends on
//   node cli.mjs --last-week roster.csv staff.txt shifts.txt  # carry last week's end times over Monday (rest rule)
//   node cli.mjs --ot-after 40 --rest 11 --balance 50 staff.txt shifts.txt
//   node cli.mjs --csv staff.txt shifts.txt > roster.csv    # also --hours, --json
//   node cli.mjs --week-start 2026-10-19 --ics [--person Sam] staff.txt shifts.txt > week.ics   # calendar file, all or one person
//   node cli.mjs --messages [--week-start 2026-10-19] staff.txt shifts.txt   # one paste-ready text per person
//   node cli.mjs --check staff.txt shifts.txt               # exit 1 if any shift stays open (cron, CI, a Sunday reminder)
//   node cli.mjs --example                                  # run on the built-in invented week
//
// Staff and shift files are the same text as on the web page. Zero dependencies, no network: names and wages never
// leave the machine. Same solver as the web page (calc.mjs); the search is seeded, so a rerun gives the same roster.
// Planning aid: not legal advice, and local scheduling-notice, break and minor-labor rules are not modelled.

import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  parseStaff, parseShifts, buildRoster, rosterCsv, hoursCsv, rosterIcs, rosterMessages, carryOverStaff, sampleStaff, sampleShifts,
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
  --week-start <date> Monday of the week, YYYY-MM-DD (lets time-off dates in the staff file apply)
  --last-week <csv>   last week's roster CSV, to carry shift end times into Monday
  --csv | --hours | --json   machine-readable output
  --ics [--person <name>]    calendar file for the week (needs --week-start, a Monday); one person's shifts with --person
  --messages                 a paste-ready text per person
  --check             print the report; exit 1 if any shift is left open
  --example           use the built-in invented week
  -h, --help          this text

Planning aid, not legal advice. It does not know your local scheduling-notice, break or minor-labor rules.
`;

const FLAGS = {
  "--rest": "minRestHours", "--consec": "maxConsecDays", "--daily": "maxDailyHours", "--ot-after": "otAfter",
  "--ot-mult": "otMult", "--balance": "balance",
};

export function parseArgs(argv) {
  const o = { options: {}, files: [], mode: "report", example: false, check: false, help: false, lastWeek: null, weekStart: null, person: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--csv") o.mode = "csv";
    else if (a === "--hours") o.mode = "hours";
    else if (a === "--json") o.mode = "json";
    else if (a === "--ics") o.mode = "ics";
    else if (a === "--messages") o.mode = "messages";
    else if (a === "--person") { o.person = argv[++i]; if (!o.person) throw new Error("--person needs a name"); }
    else if (a === "--check") o.check = true;
    else if (a === "--example") o.example = true;
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
  if (o.options.balance !== undefined) o.options.balance = Math.min(100, Math.max(0, o.options.balance));
  return o;
}

async function readInput(file) {
  if (file === "-") { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString("utf8"); }
  return readFile(file, "utf8");
}

const clock = (s) => `${fmtClock(s.startMin)}-${fmtClock(s.endMin)}`;

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
  if (opts.mode === "messages") {
    try { return { code, out: rosterMessages(r, opts.weekStart || null).map((m) => m.text).join("\n\n") + "\n" }; } catch (e) { return { code: 2, out: e.message + "\n" }; }
  }
  if (opts.mode === "hours") return { code, out: hoursCsv(r) };
  if (opts.mode === "json") {
    return {
      code,
      out: JSON.stringify({
        payroll: r.cost, overtimeHours: r.otHours, unfilledShifts: r.unfilledSlots, unfilledHours: r.unfilledHours,
        assignments: r.assignments.map((a) => ({ day: DAYS[a.slot.day], start: fmtClock(a.slot.startMin), end: fmtClock(a.slot.endMin), label: a.slot.label || "", role: a.slot.role || "", person: a.person })),
        people: r.people.map((p) => ({ name: p.name, hours: p.hours, short: p.short })),
        unfilled: r.unfilled.map((u) => ({ day: DAYS[u.slot.day], start: fmtClock(u.slot.startMin), end: fmtClock(u.slot.endMin), why: u.text })),
        critical: r.critical, warnings: r.warnings,
      }, null, 2) + "\n",
    };
  }
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
  if (r.savingVsListed > 0.5) lines.push("", `Versus filling shifts in the order listed: saves ${money(r.savingVsListed)}.`);
  lines.push("", "Planning aid, not legal advice. Local scheduling-notice, break and minor-labor rules are not modelled.");
  return { code, out: lines.join("\n") + "\n" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) { process.stdout.write(USAGE); process.exit(0); }
    if (!o.example && o.files.length !== 2) { process.stderr.write(USAGE); process.exit(2); }
    const [staffText, shiftsText] = o.example
      ? [sampleStaff(), sampleShifts()]
      : [await readInput(o.files[0]), await readFile(o.files[1], "utf8")];
    const lastWeekCsv = o.lastWeek ? await readFile(o.lastWeek, "utf8") : null;
    const r = run(staffText, shiftsText, { ...o, lastWeekCsv });
    (r.code === 2 ? process.stderr : process.stdout).write(r.out);
    process.exit(r.code);
  } catch (e) { process.stderr.write(`${e.message}\n`); process.exit(2); }
}
