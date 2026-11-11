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
//   node cli.mjs --cover "Tue 17:00" staff.txt shifts.txt   # a call-out: who can take that shift, or the fewest hand-overs that cover it
//   node cli.mjs --example                                  # run on the built-in invented week
//
// Staff and shift files are the same text as on the web page. Zero dependencies, no network: names and wages never
// leave the machine. Same solver as the web page (calc.mjs); the search is seeded, so a rerun gives the same roster.
// Planning aid: not legal advice, and local scheduling-notice, break and minor-labor rules are not modelled.

import { readFile } from "node:fs/promises";
import process from "node:process";
import { importStaffCsv } from "./import-staff.mjs";
import { importShiftsCsv } from "./import-shifts.mjs";
import { demandShifts, backtestSales } from "./demand.mjs";
import {
  parseStaff, parseShifts, buildRoster, coverOptions, coverChain, checkTrade, planWeeks, planFairness, planStreaks, optimalityText, rosterCsv, scheduleChanges, restPremium, hoursCsv, rosterIcs, rosterMessages, openShiftPost, tipPool, shortShifts, longShifts, daysOffRuns, carryOverStaff, dailyLabor, budgetCheck, trimOptions, salesPerLaborHour, sampleStaff, sampleShifts,
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
                      --premium-hours (default 1), --cancel-hours (hours of pay for a cancelled shift, default the same), --premium-flat <$> (a fixed dollar amount per short-notice change, no wage needed) and --exempt "Ben,Cleo" (employee-requested changes) are yours to set, not a statement of any law
  --burden <pct>      payroll burden added to wages, in percent (default 0)
  --daily-ot-after <h> / --daily-dt-after <h> / --dt-mult <x>   daily overtime and double-time thresholds and the double-time multiplier (default off, 2)
  --split-premium <$> [--split-gap <h>]   dollars owed on each day a person's shifts have a gap over <h> hours (default gap 1); the search prices it
  --diff-when "Sat-Sun; 10pm-6am" with --diff-per-hour <$> and/or --diff-pct <%>   pay differential for hours inside those windows
  --meal-after <h> [--meal-min <m>]   shifts longer than <h> hours lose <m> unpaid meal minutes (default off, 30)
  --rest-under <h>    list every pair of one person's shifts with less than <h> hours between them (a close then an open) and the premium
                      on your numbers: --premium-hours (default 1 hour of pay each) and --exempt "Ben" (they asked for it). Arithmetic, not a statement of any law
  --import-shifts <csv> convert a published-schedule export (date, start, end, position rows) to shift lines on stdout; notes on stderr
  --from-sales <csv>  build the shift lines from an hourly sales export (date-time and sales columns) at --splh <$> sales per labor hour (required):
                      the average of each weekday-hour sets the heads needed (at least --min-staff, default 1), cut into shifts of --min-shift to
                      --max-shift hours (default 4 to 8), inside the hours with sales or --open/--close (0-24). Shift lines on stdout, summary on stderr;
                      --count tickets plans from distinct ticket/order/receipt numbers per hour instead (--splh is then tickets per labor
                      hour; --count rows counts each row); a file with a ticket column and no sales column is counted by ticket.
                      the average of what you sold, not a forecast. --skip-dates 2026-11-26,2026-12-25 leaves those days out (holiday, storm);
                      --half-life <weeks> weights recent weeks more (a day's weight halves every that many weeks back from the newest date);
                      the default, auto, backtests equal weights and half-lives 8, 4 and 2 on your file and keeps the best (equal
                      weights under 4 testable weeks or on a tie); none weighs every week the same
                      A weekday that traded on under 1 in 4 of its dates is treated as closed, and an edge hour with sales on under 1 in
                      20 days does not stretch the day (--keep-rare turns both off). --backtest tests the forecast on your own file
                      instead: each full week after the first --warmup weeks (default 4) is planned from the weeks before it and compared
                      hour by hour with what its sales needed, for the plain average, --half-life 2/4/8, last 4 weeks and last week.
                      --short-cost <r>: a short person-hour costs r spare ones (a queue or lost sale vs idle pay); each hour is then
                      staffed for the r/(1+r) share of its past dates (r 1 = median, 3 = 75th percentile) instead of the average,
                      and --backtest scores r x short + over and tries every weighting with that rule.
                      With dated rows, a run shorter than --min-shift is priced against past dates (at --short-cost, or 1): put in
                      the cheapest whole shift that holds it, or left unstaffed and listed when every such shift costs more than it
                      saves; never a run of minimum staff. --plain-cut stretches every short run instead. --join lets short runs near each
                      other share one shift, and a short run lengthen the shift next to it, when that is cheaper (opt-in: no gain on held-out weeks). With it, a run shorter than
                      --min-shift is stretched only where that is cheaper than leaving it unstaffed, to the cheapest window.
                      The backtest scores the shifts cut from each plan, so the shortest-shift stretch counts as over
  --import-staff <csv>  convert a staff export from another scheduler (name, hourly rate, hours, position columns) to staff lines on stdout; notes on stderr
  --hours-watch <h>   list everyone whose planned week reaches <h> hours (a full-time or benefit line you set, e.g. 30) or lands within --watch-within <h> (default 2) of it
  --sales "1200,900,..."  seven daily sales figures, Monday first (0 or blank = unknown): prints each day's labor cost as a share of sales; --labor-target <%> flags days over it,
                      --splh <$> flags days with more or fewer hours than that sales per labor hour calls for
  --tips <$>          split a tip pot over the planned hours, in whole cents that add back to the pot
  --short-under <h>   list every assigned shift shorter than <h> hours (a commute for little pay; some cities owe reporting-time pay)
  --budget <$>        compare the week's payroll with a labor budget; if over, list drops that close the gap (safe ones first)
  --long-over <h>     list every assigned shift longer than <h> hours (a double or long stretch; some places owe a premium or a break)
  --days-off <n>      list everyone without <n> days off in a row this week (a day counts on the day a shift starts; the week is not wrapped)
  --cover "<Day HH:MM>" a call-out or open shift that starts then (add -HH:MM to tell two apart): who could take it outright, else the
                      shortest chains of hand-overs (one person takes it and gives up a shift a third takes; --max-moves n, default 3) with the pay change;
                      with --json the same answer as data (shift, outright, blocked, chains) for a call-out bot or script
  --swap "<Day HH:MM>,<Day HH:MM>"  check one trade: the owners of those two shifts exchange them. Says whether both weeks stay inside
                      every hard rule (rest, hour limits, availability, role), the rule that stops each person if not, and the pay change
  --max-moves <n>     longest hand-over chain for --cover (1-5, default 3)
  --check             print the report; exit 1 if any shift is left open
  --example           use the built-in invented week
  -h, --help          this text

Planning aid, not legal advice. It does not know your local scheduling-notice, break or minor-labor rules.
`;

const FLAGS = {
  "--rest": "minRestHours", "--consec": "maxConsecDays", "--daily": "maxDailyHours", "--ot-after": "otAfter",
  "--ot-mult": "otMult", "--balance": "balance", "--tough-balance": "toughBalance", "--open-shift-hours": "openShiftWeight",
  "--burden": "burdenPct", "--daily-ot-after": "dailyOtAfter", "--daily-dt-after": "dailyDtAfter", "--dt-mult": "dtMult",
  "--split-premium": "splitPremium", "--split-gap": "splitGap", "--diff-per-hour": "diffPerHour", "--diff-pct": "diffPct",
  "--meal-after": "mealAfter", "--meal-min": "mealMin",
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
    else if (a === "--from-sales") { o.fromSales = argv[++i]; if (!o.fromSales) throw new Error("--from-sales needs a CSV file"); }
    else if (a === "--skip-dates") { o.demand = { ...o.demand, skipDates: String(argv[++i] || "").split(/[,\s]+/).filter(Boolean) }; if (!o.demand.skipDates.length) throw new Error("--skip-dates needs dates like 2026-11-26,2026-12-25"); }
    else if (a === "--backtest") o.backtest = true;
    else if (a === "--keep-rare") o.demand = { ...o.demand, keepRare: true };
    else if (a === "--count") { const v = argv[++i]; if (!["sales", "tickets", "rows"].includes(v)) throw new Error("--count needs sales, tickets or rows"); o.demand = { ...o.demand, count: v }; }
    else if (a === "--plain-cut") o.demand = { ...o.demand, costCut: false };
    else if (a === "--join") o.demand = { ...o.demand, join: true };
    else if (a === "--warmup") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v < 1) throw new Error("--warmup needs a whole number of weeks, 1 or more"); o.demand = { ...o.demand, warmup: v }; }
    else if (a === "--short-cost") { const v = Number(argv[++i]); if (!(v > 0) || !Number.isFinite(v)) throw new Error("--short-cost needs a positive number (a short person-hour costs that many spare ones; 1 = equal)"); o.demand = { ...o.demand, shortCost: v }; }
    else if (a === "--half-life") {
      const t = String(argv[++i]).toLowerCase();
      const v = t === "auto" || t === "none" ? t : Number(t);
      if (typeof v === "number" && !(v > 0)) throw new Error("--half-life needs a positive number of weeks, auto or none");
      o.demand = { ...o.demand, halfLife: v };
    }
    else if (a === "--min-staff" || a === "--min-shift" || a === "--max-shift" || a === "--open" || a === "--close") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`${a} needs a number`);
      (o.demand ||= {})[{ "--min-staff": "minStaff", "--min-shift": "minShift", "--max-shift": "maxShift", "--open": "open", "--close": "close" }[a]] = v;
    }
    else if (a === "--import-staff") { o.importStaff = argv[++i]; if (!o.importStaff) throw new Error("--import-staff needs a CSV file"); }
    else if (a === "--check") o.check = true;
    else if (a === "--swap") { o.swap = argv[++i]; if (!o.swap) throw new Error('--swap needs two shifts like "Tue 17:00,Sat 09:00"'); }
    else if (a === "--cover") { o.cover = argv[++i]; if (!o.cover) throw new Error('--cover needs a shift like "Tue 17:00"'); }
    else if (a === "--max-moves") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error("--max-moves needs a whole number from 1 to 5");
      o.maxMoves = v;
    }
    else if (a === "--changes") { o.changes = argv[++i]; if (!o.changes) throw new Error("--changes needs the posted roster CSV"); }
    else if (a === "--changed-at") {
      o.changedAt = argv[++i];
      if (!/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}$/.test(o.changedAt || "")) throw new Error('--changed-at needs a date and time like "2026-10-30 14:00"');
    }
    else if (a === "--rest-under") {
      const v = Number(argv[++i]);
      if (!(v > 0 && v <= 48)) throw new Error("--rest-under needs hours between 0 and 48");
      o.restUnder = v;
    }
    else if (a === "--hours-watch") {
      const v = Number(argv[++i]);
      if (!(v > 0 && v <= 80)) throw new Error("--hours-watch needs weekly hours between 0 and 80");
      o.hoursWatch = v;
    }
    else if (a === "--tips") {
      const v = Number(argv[++i]);
      if (!(v > 0)) throw new Error("--tips needs a positive dollar amount");
      o.tips = v;
    }
    else if (a === "--short-under") {
      const v = Number(argv[++i]);
      if (!(v > 0 && v <= 24)) throw new Error("--short-under needs hours between 0 and 24");
      o.shortUnder = v;
    }
    else if (a === "--budget") {
      const v = Number(String(argv[++i]).replace(/[$,]/g, ""));
      if (!(v > 0)) throw new Error("--budget needs a positive dollar amount");
      o.budget = v;
    }
    else if (a === "--long-over") {
      const v = Number(argv[++i]);
      if (!(v > 0 && v < 24)) throw new Error("--long-over needs hours between 0 and 24");
      o.longOver = v;
    }
    else if (a === "--days-off") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 1 || v > 6) throw new Error("--days-off needs a whole number of days from 1 to 6");
      o.daysOff = v;
    }
    else if (a === "--sales") o.sales = argv[++i] || "";
    else if (a === "--labor-target") {
      const v = Number(argv[++i]);
      if (!(v > 0 && v <= 100)) throw new Error("--labor-target needs a percent between 0 and 100");
      o.laborTarget = v;
    }
    else if (a === "--splh") {
      const v = Number(argv[++i]);
      if (!(v > 0)) throw new Error("--splh needs a positive sales per labor hour");
      o.splh = v;
    }
    else if (a === "--watch-within") {
      const v = Number(argv[++i]);
      if (!(v >= 0 && v <= 40)) throw new Error("--watch-within needs hours between 0 and 40");
      o.watchWithin = v;
    }
    else if (a === "--exempt") { o.exempt = argv[++i]; if (o.exempt === undefined) throw new Error("--exempt needs names, comma separated"); }
    else if (a === "--notice-hours" || a === "--premium-hours" || a === "--cancel-hours" || a === "--premium-flat") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`${a} needs a number`);
      o[{ "--notice-hours": "noticeHours", "--premium-hours": "premiumHours", "--cancel-hours": "cancelHours", "--premium-flat": "premiumFlat" }[a]] = v;
    }
    else if (a === "--diff-when") { o.options.diffWhen = argv[++i]; if (!o.options.diffWhen) throw new Error('--diff-when needs windows like "Sat-Sun; 10pm-6am"'); }
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
    noticeHours: opts.noticeHours ?? 336, premiumHours: opts.premiumHours ?? 1, cancelHours: opts.cancelHours ?? null, flat: opts.premiumFlat ?? null, wages, exempt: String(opts.exempt || "").split(","),
  });
  const lines = [];
  for (const c of r.changes) {
    const what = c.kind === "added" ? `added ${clockOf(c.to)}` : c.kind === "cancelled" ? `cancelled ${clockOf(c.from)}` : `moved ${clockOf(c.from)} -> ${clockOf(c.to)}`;
    const note = !r.noticeKnown ? "" : c.exempt ? "  requested, no premium" : c.premiumUnpriced ? "  short notice, no wage on file" : c.shortNotice ? `  ${num(c.noticeHours)} h notice, premium ${money(c.premium)}` : `  ${num(c.noticeHours)} h notice`;
    lines.push(`${c.person.padEnd(12)} ${DAYS[(c.to || c.from).day]} ${what} (${c.hoursDelta > 0 ? "+" : ""}${num(c.hoursDelta)} h)${note}`);
  }
  const head = r.noticeKnown
    ? `${r.changes.length} change(s), ${r.shortNotice} on short notice (under ${num(opts.noticeHours ?? 336)} h). Premium on your numbers (${opts.premiumFlat != null ? money(opts.premiumFlat) + " flat each" : num(opts.premiumHours ?? 1) + " h of pay each"}${opts.cancelHours != null && opts.premiumFlat == null ? `, ${num(opts.cancelHours)} h for a cancelled shift` : ""}): ${money(r.owed)}.`
    : `${r.changes.length} change(s). Give --week-start and --changed-at to see notice and premium.`;
  return [head, ...lines, "", "Arithmetic on the window and premium you entered, not a statement of what any scheduling law requires. Not legal advice.", ""].join("\n");
}
function hoursWatchReport(r, opts) {
  const line = opts.hoursWatch, within = opts.watchWithin ?? 2;
  const rows = r.people.map((p) => ({ name: p.name, hours: p.hours })).filter((p) => p.hours >= line - within - 1e-9).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  const lines = rows.map((p) => `${p.name.padEnd(12)} ${num(p.hours)} h  ${p.hours >= line - 1e-9 ? `at or over ${num(line)} h` : `${num(line - p.hours)} h under ${num(line)} h`}`);
  const over = rows.filter((p) => p.hours >= line - 1e-9).length;
  const head = rows.length ? `${over} at or over ${num(line)} h this week, ${rows.length - over} within ${num(within)} h under it.` : `No one is at or within ${num(within)} h of ${num(line)} h this week.`;
  return [head, ...lines, "", "Planned hours for this one week against a line you typed. Eligibility rules usually count a longer period, so this is not a statement of what any benefit or employer-mandate rule requires. Not legal advice.", ""].join("\n");
}
const usd = (x) => "$" + x.toFixed(2);
function tipsReport(r, opts) {
  const t = tipPool(r, opts.tips);
  if (!t.rows.length) return "No tip split: nobody is scheduled for any hours.\n";
  const lines = t.rows.map((x) => `${x.name.padEnd(12)} ${num(x.hours).padStart(5)} h  ${usd(x.share).padStart(8)}  ${usd(x.perHour)}/h`);
  return [`${usd(t.pot)} split over ${num(t.hours)} scheduled hours:`, ...lines, "", "Shares in proportion to scheduled hours, rounded to whole cents that sum to the pot. Who may share in a pool is the employer's to decide; not legal advice.", ""].join("\n");
}
function shortReport(r, opts) {
  const rows = shortShifts(r, opts.shortUnder);
  const lines = rows.map((x) => `${x.person.padEnd(12)} ${x.day} ${fmtClock(x.startMin)}-${fmtClock(x.endMin)}  ${num(x.hours)} h`);
  const head = rows.length ? `${rows.length} shift(s) under ${num(opts.shortUnder)} h.` : `No assigned shift is under ${num(opts.shortUnder)} h.`;
  return [head, ...lines, ""].join("\n");
}
function longReport(r, opts) {
  const rows = longShifts(r, opts.longOver);
  const lines = rows.map((x) => `${x.person.padEnd(12)} ${x.day} ${fmtClock(x.startMin)}-${fmtClock(x.endMin)}  ${num(x.hours)} h`);
  const head = rows.length ? `${rows.length} shift(s) over ${num(opts.longOver)} h.` : `No assigned shift is over ${num(opts.longOver)} h.`;
  return [head, ...lines, ""].join("\n");
}
function budgetReport(staff, slots, r, opts) {
  const b = budgetCheck(r, opts.budget);
  const $ = (x) => "$" + x.toFixed(2);
  if (!b) return "Nothing to compare: no payroll.\n";
  if (!b.over) return `Payroll ${$(b.payroll)} against a ${$(b.budget)} budget: ${$(b.headroom)} under (${b.pct.toFixed(1)}%).\n`;
  const need = b.payroll - b.budget;
  const t = trimOptions(staff, slots, r);
  const rows = [];
  let got = 0;
  for (const x of (t.rows || [])) { if (got >= need - 0.005) break; rows.push(x); got += x.saves; }
  const lines = rows.map((x) => `${x.person.padEnd(12)} ${DAYS[x.slot.day % 7]} ${fmtClock(x.slot.startMin)}-${fmtClock(x.slot.endMin)}  ${num(x.hoursSaved)} h  saves ${$(x.saves)}  ${x.leavesEmpty ? "LEAVES SHIFT EMPTY" : "shift stays covered"}${x.breaksMinimum ? ", under their minimum hours" : ""}`);
  const head = `Payroll ${$(b.payroll)} against a ${$(b.budget)} budget: ${$(need)} over (about ${num(b.cutHours)} paid h at the average cost).`;
  const tail = got >= need - 0.005 ? `These ${rows.length} drop(s) add up to about ${$(got)}; savings are per drop and overtime is priced across the week, so re-run to confirm.` : `Even every drop listed does not close the gap.`;
  return [head, ...lines, tail, ""].join("\n");
}
function daysOffReport(r, opts) {
  const d = daysOffRuns(r, opts.daysOff);
  const lines = d.short.map((x) => `${x.person.padEnd(12)} works ${x.daysWorked} day(s), longest run off ${x.longestOff}`);
  const head = d.short.length ? `${d.short.length} of ${d.rows.length} people have no ${opts.daysOff} days off in a row.` : `Everyone has ${opts.daysOff} days off in a row.`;
  return [head, ...lines, ""].join("\n");
}
function salesReport(staff, opts, r) {
  const dl = dailyLabor(r, staff, opts.sales);
  if (!dl.hasSales) return "No daily sales read: give seven figures, Monday first, e.g. --sales \"1200,900,950,1000,1800,2600,2100\".\n";
  const t = opts.laborTarget ?? null;
  const sp = opts.splh ? salesPerLaborHour(r, staff, opts.sales, opts.splh) : null;
  const lines = dl.days.filter((d) => d.sales).map((d, i) => {
    const flags = [];
    if (t && d.pct > t + 1e-9) flags.push(`${num(d.pct - t)} points over ${num(t)}%`);
    const s = sp && sp.days.find((x) => x.day === d.day);
    if (s && s.gap > 0.5) flags.push(`${num(s.gap)} h more than ${money(opts.splh)}/h calls for`);
    if (s && s.gap < -0.5) flags.push(`${num(-s.gap)} h fewer than ${money(opts.splh)}/h calls for`);
    return `${d.day.padEnd(4)} ${num(d.hours).padStart(5)} h  ${money(d.cost).padStart(8)}  on ${money(d.sales).padStart(8)} sales  ${num(d.pct)}%${flags.length ? "  " + flags.join("; ") : ""}`;
  });
  const tot = dl.days.filter((d) => d.sales).reduce((a, d) => ({ c: a.c + d.cost, s: a.s + d.sales }), { c: 0, s: 0 });
  const head = `Labor ${num((tot.c / tot.s) * 100)}% of the ${money(tot.s)} sales given; highest ${dl.worst.day} at ${num(dl.worst.pct)}%.`;
  return [head, ...lines, "", "Base wages plus any burden %, before weekly overtime premiums; arithmetic on the sales you typed, not a forecast. Not financial advice.", ""].join("\n");
}
const dayName = (d) => DAYS[((d % 7) + 7) % 7] + (d < 0 ? " (last week)" : "");
const clockMod = (m) => ((m % 1440) + 1440) % 1440;
function restReport(staff, opts, csv) {
  const wages = Object.fromEntries(staff.map((p) => [p.name, p.wage]));
  const r = restPremium(csv, { restHours: opts.restUnder, premiumHours: opts.premiumHours ?? 1, wages, exempt: String(opts.exempt || "").split(","), previousCsv: opts.lastWeekCsv || null });
  const lines = r.turnarounds.map((t) => {
    const note = t.exempt ? "  requested, no premium" : t.premiumUnpriced ? "  no wage on file" : `  premium ${money(t.premium)}`;
    return `${t.person.padEnd(12)} ${dayName(t.first.day)} ${clockOf(t.first)} then ${DAYS[t.second.day]} ${clockOf(t.second)}: ${num(t.restHours)} h rest${note}`;
  });
  const head = r.turnarounds.length
    ? `${r.turnarounds.length} turnaround(s) under ${num(opts.restUnder)} h. Premium on your numbers (${num(opts.premiumHours ?? 1)} h of pay each): ${money(r.owed)}.`
    : `No turnaround under ${num(opts.restUnder)} h.`;
  return [head, ...lines, "", "Arithmetic on the rest window and premium you entered, not a statement of what any scheduling law requires. Not legal advice.", ""].join("\n");
}
const clockOf = (x) => `${fmtClock(clockMod(x.start))}-${fmtClock(clockMod(x.end) || 1440)}`;

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
  if (opts.swap) return { code: 0, out: swapReport(st.staff, sh.slots, r, opts) };
  if (opts.cover) return { code: 0, out: coverReport(st.staff, sh.slots, r, opts) };
  if (opts.sales) return { code, out: salesReport(st.staff, opts, r) };
  if (opts.tips) return { code, out: tipsReport(r, opts) };
  if (opts.budget) return { code, out: budgetReport(st.staff, sh.slots, r, opts) };
  if (opts.daysOff) return { code, out: daysOffReport(r, opts) };
  if (opts.shortUnder) return { code, out: shortReport(r, opts) };
  if (opts.longOver) return { code, out: longReport(r, opts) };
  if (opts.hoursWatch) return { code, out: hoursWatchReport(r, opts) };
  if (opts.restUnder) return { code, out: restReport(st.staff, opts, rosterCsv(r)) };
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

// --cover "Tue 17:00[-22:00]": find the shift, then who can take it outright (coverOptions) or, failing that, the shortest hand-over chains (coverChain).
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function coverReport(staff, slots, r, opts) {
  const m = /^\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?\s*$/i.exec(opts.cover);
  if (!m) return '--cover needs a shift like "Tue 17:00" or "Tue 17:00-22:00"\n';
  const day = DAYS.findIndex((d) => d.toLowerCase() === m[1].toLowerCase());
  const start = +m[2] * 60 + +m[3], end = m[4] === undefined ? null : +m[4] * 60 + +m[5];
  const hits = slots.map((s, i) => i).filter((i) => slots[i].day === day && slots[i].startMin === start && (end === null || slots[i].endMin % 1440 === end % 1440));
  if (!hits.length) return `No shift starts ${DAYS[day]} ${fmtClock(start)}. Shifts that day: ${slots.filter((s) => s.day === day).map(clock).join(", ") || "none"}\n`;
  if (hits.length > 1) return `${hits.length} shifts start ${DAYS[day]} ${fmtClock(start)}; add the end, like "${DAYS[day]} ${hm(start)}-${hm(slots[hits[0]].endMin % 1440)}": ${hits.map((i) => clock(slots[i]) + (slots[i].label ? " " + slots[i].label : "")).join(", ")}\n`;
  const i = hits[0], s = slots[i];
  const head = `${DAYS[s.day]} ${clock(s)}${s.label ? " " + s.label : ""}, now ${r.owner[i] >= 0 ? staff[r.owner[i]].name : "open"}`;
  const direct = coverOptions(staff, slots, r, i);
  if (direct.error) return direct.error + "\n";
  const money2 = (x) => (x >= 0 ? "+" : "-") + money(Math.abs(x));
  const lines = [head, ""];
  const asJson = opts.mode === "json";
  const data = { shift: { day: DAYS[s.day], start: fmtClock(s.startMin), end: fmtClock(s.endMin), label: s.label || "", role: s.role || "", now: r.owner[i] >= 0 ? staff[r.owner[i]].name : null }, outright: [], blocked: [], chains: [], maxMoves: opts.maxMoves ?? 3 };
  if (direct.fits.length) {
    data.outright = direct.fits.map((f) => ({ name: f.name, extraCost: f.extraCost, hoursAfter: f.hoursAfter, overtimeAfter: f.overtimeAfter }));
    lines.push("Can take it outright, everyone else keeps their shifts (cheapest first):");
    for (const f of direct.fits) lines.push(`  ${f.name}: payroll ${money2(f.extraCost)}, ${num(f.hoursAfter)} h that week${f.overtimeAfter > 0 ? `, ${num(f.overtimeAfter)} h overtime` : ""}`);
  } else {
    lines.push("Nobody can take it without giving something up.");
    for (const b of direct.blocked) lines.push(`  ${b.name}: ${b.reason}`);
    data.blocked = direct.blocked.map((b) => ({ name: b.name, reason: b.reason }));
    const c = coverChain(staff, slots, r, i, {}, { maxMoves: opts.maxMoves ?? 3 });
    if (c.error) return c.error + "\n";
    data.chains = c.chains.map((ch) => ({ moves: ch.moves, extraCost: ch.extraCost, steps: ch.steps.map((x) => ({ to: x.to, from: x.from || null, day: DAYS[x.slot.day], start: fmtClock(x.slot.startMin), end: fmtClock(x.slot.endMin) })) }));
    lines.push("");
    if (!c.chains.length) lines.push(`No chain of up to ${opts.maxMoves ?? 3} hand-overs keeps every rule. Try --max-moves ${(opts.maxMoves ?? 3) + 1}, or post the shift.`);
    else {
      lines.push(`Shortest hand-over chains (fewest shifts moved first, then lowest pay change):`);
      c.chains.forEach((ch, k) => lines.push(`  ${k + 1}. ${ch.moves} shifts move, payroll ${money2(ch.extraCost)}: ` + ch.steps.map((x) => `${x.to} takes ${DAYS[x.slot.day]} ${clock(x.slot)}${x.from ? ` from ${x.from}` : ""}`).join("; then ")));
    }
  }
  if (asJson) return JSON.stringify(data, null, 2) + "\n";
  lines.push("", "Checks the hard rules in the staff file for everyone touched; people outside the chain keep their shifts. Planning aid, not legal advice.");
  return lines.join("\n") + "\n";
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
    if (o.fromSales) {
      if (!(o.splh > 0)) throw new Error("--from-sales needs --splh <sales per labor hour>");
      if (o.backtest) {
        const b = backtestSales(await readFile(o.fromSales, "utf8"), { ...o.demand, splh: o.splh, shifts: true });
        process.stdout.write(backtestReport(b));
        process.exit(b.weeks ? 0 : 1);
      }
      const r = demandShifts(await readFile(o.fromSales, "utf8"), { halfLife: "auto", ...o.demand, splh: o.splh });
      for (const n of [...r.notes, ...r.skipped.map((x) => "Skipped " + x)]) process.stderr.write(n + "\n");
      if (!r.shiftsText) process.exit(1);
      const extra = r.extra >= 0 ? `${r.extra} extra from the shortest-shift rule` : `${-r.extra} fewer: short runs left unstaffed at your short cost`;
      process.stderr.write(`${r.needed} person-hours needed, ${r.scheduled} scheduled (${extra}); average week ${r.count && r.count !== "sales" ? r.count : "sales"} ${Math.round(r.sales)}, ${Math.round(r.sales / r.scheduled)} per scheduled hour.\n`);
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

// --swap "Tue 17:00,Sat 09:00": find both shifts (same matching as --cover), then checkTrade.
function swapReport(staff, slots, r, opts) {
  const parts = opts.swap.split(",");
  if (parts.length !== 2) return '--swap needs two shifts like "Tue 17:00,Sat 09:00"\n';
  const found = [];
  for (const part of parts) {
    const m = /^\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?\s*$/i.exec(part);
    if (!m) return '--swap needs two shifts like "Tue 17:00,Sat 09:00"\n';
    const day = DAYS.findIndex((d) => d.toLowerCase() === m[1].toLowerCase());
    const start = +m[2] * 60 + +m[3], end = m[4] === undefined ? null : +m[4] * 60 + +m[5];
    const hits = slots.map((x, i) => i).filter((i) => slots[i].day === day && slots[i].startMin === start && (end === null || slots[i].endMin % 1440 === end % 1440));
    if (!hits.length) return `No shift starts ${DAYS[day]} ${fmtClock(start)}. Shifts that day: ${slots.filter((x) => x.day === day).map(clock).join(", ") || "none"}\n`;
    if (hits.length > 1) return `${hits.length} shifts start ${DAYS[day]} ${fmtClock(start)}; add the end, like "${DAYS[day]} ${hm(start)}-${hm(slots[hits[0]].endMin % 1440)}"\n`;
    found.push(hits[0]);
  }
  const t = checkTrade(staff, slots, r, found[0], found[1]);
  if (t.error) return t.error + "\n";
  const side = (x) => `${x.name} gives ${DAYS[x.gives.day]} ${clock(x.gives)} and takes ${DAYS[x.gets.day]} ${clock(x.gets)} (${num(x.hoursAfter)} h that week)`;
  const lines = [t.ok ? "This trade keeps both weeks inside every hard rule." : "This trade breaks a rule.", "  " + side(t.a), "  " + side(t.b)];
  if (t.ok) lines.push(`Payroll change for the pair: ${t.extraCost >= 0 ? "+" : "-"}${money(Math.abs(t.extraCost))}`);
  else for (const p of t.problems) lines.push(`  ${p.name} ${p.reason}`);
  lines.push("", "Everyone else keeps their shifts. Planning aid, not legal advice.");
  return lines.join("\n") + "\n";
}

// --backtest table: person-hours a week short of and over what each week's real sales needed, per method.
export function backtestReport(b) {
  if (!b.weeks) return b.notes.join("\n") + "\n";
  const f = (x) => x.toFixed(1);
  const r = b.shortCost == null ? null : b.shortCost;
  const col = r === null ? "Short+over" : `${r}xshort+over`.padStart(10).slice(-12);
  const lines = [b.notes[b.notes.length - 1], "", `Method                                  Short   Over  Scheduled  ${col.padStart(10)}  vs default (95% CI)`];
  for (const m of b.methods) {
    const vs = m.id === "all" ? "" : `${m.vsDefault >= 0 ? "+" : ""}${f(m.vsDefault)} (${f(m.ci[0])} to ${f(m.ci[1])})`;
    lines.push(`${m.label.padEnd(38)}${f(m.short).padStart(7)}${f(m.over).padStart(7)}${f(m.scheduled).padStart(11)}${f(m.miss).padStart(Math.max(12, col.length + 2))}  ${vs}`);
  }
  const best = b.methods.find((m) => m.id === b.best);
  lines.push("", "Person-hours per week. Short: hours a week's real sales needed that the plan did not staff; over: staffed beyond that.");
  if (b.shifts) lines.push(`Scored on the shifts cut from each plan (${b.minShift} to ${b.maxShift} hours), so hours added to reach the shortest shift count as over.`);
  if (r !== null) lines.push(`Scored as ${r} x short + over (--short-cost ${r}). Rows with "short cost" staff each hour for ${Math.round(r / (1 + r) * 100)}% of its past dates instead of the average.`);
  lines.push(b.clear
    ? `Best on your file: ${best.label} (${f(-best.vsDefault)} ${r === null ? "fewer person-hours off" : "less weighted cost"} per week than the default, interval below zero).`
    : "No method is clearly better than the plain average on your file (every interval reaches zero or above): keep the default.");
  lines.push("A test on your past weeks, not a promise about the next one. Planning aid, not legal advice.");
  for (const n of b.notes.slice(0, -1)) lines.push(n);
  return lines.join("\n") + "\n";
}
