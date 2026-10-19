#!/usr/bin/env node
// State residency day counts from a stays file, in a terminal.
//
//   node cli.mjs --year 2025 --home FL --abode NY,FL stays.txt     # days per state against each published test
//   node cli.mjs --year 2025 --asof 2025-09-30 --nights stays.txt  # as of a date, counting nights
//   node cli.mjs --csv stays.txt > totals.csv                      # totals per state
//   node cli.mjs --daily-log stays.txt > log.csv                   # one row per calendar day, with an evidence column
//   node cli.mjs --html stays.txt > packet.html                    # printable audit packet
//   node cli.mjs --ics stays.txt > last-safe-days.ics              # calendar reminders for the last safe day per state
//   node cli.mjs --json stays.txt                                  # machine-readable
//   node cli.mjs --trip "NY 2025-11-01 14" stays.txt              # what a planned trip (state, start, days) would change
//   node cli.mjs --example                                         # run on the built-in invented year
//
// Stays file: one line per stay, as on the web page ("2025-01-03 to 2025-03-30 FL",
// "NY, Jun 2 - Jun 9", add "off" for days you did not work). Zero dependencies, no
// network: your travel history never leaves the machine. Same counter as the web
// page (calc.mjs); an organising aid, not tax or legal advice.

import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  parseStays, parseDate, analyze, tripImpact, sampleSpec, reportCsv, dailyLogCsv, auditReportHtml, deadlinesIcs,
  statusText, dayIso, fmtNum, fmtMoney, STATE_NAMES,
} from "./calc.mjs";

const USAGE = `Count days per state against the commonly published residency tests.

Usage:
  node cli.mjs [options] <stays.txt | ->

Options:
  --year <yyyy>        tax year (default: the current year)
  --asof <date>        count room left and crossing dates from this date (default: year end)
  --home <ST>          assume days in no stay were spent in this state
  --abode <ST,ST>      states where you keep a home you could use (statutory tests need one)
  --employer <ST>      your employer's state, for the convenience-of-the-employer view
  --wages <amount>     annual wages, to split by workdays per state
  --limits "OH 90,GA 150"  your own day limits, overriding the table
  --trip "NY 2025-11-01 14"  what-if: add a planned trip (state, start date, days) and show what it changes
  --nights             count nights (drop the departure day) instead of any part of a day
  --csv                print totals per state as CSV
  --daily-log          print the day-by-day log as CSV
  --html               print a self-contained printable audit packet
  --ics                print last-safe-day reminders as an iCalendar file
  --json               print the full result as JSON
  --example            use the built-in invented year instead of a file
  -h, --help           this message

Not tax or legal advice and not a residency determination: domicile, ties, what
counts as an abode, part-year rules and reciprocity are not modelled, and the
state tests are summaries that may be out of date.
`;

const code = (t) => String(t).trim().toUpperCase();

export function parseArgs(argv) {
  const opts = {
    file: null, year: null, asof: null, home: null, abode: [], employer: null, wages: null, limits: null, trip: null,
    nights: false, csv: false, dailyLog: false, html: false, ics: false, json: false, example: false, help: false,
  };
  const value = (i, flag, what) => {
    const v = argv[i];
    if (v === undefined || (v.startsWith("-") && v !== "-")) throw new Error(`${flag} needs ${what}`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--nights") opts.nights = true;
    else if (arg === "--csv") opts.csv = true;
    else if (arg === "--daily-log") opts.dailyLog = true;
    else if (arg === "--html") opts.html = true;
    else if (arg === "--ics") opts.ics = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--example") opts.example = true;
    else if (arg === "--year") {
      const y = Number(value(++i, arg, "a four-digit year"));
      if (!Number.isInteger(y) || y < 1990 || y > 2100) throw new Error("--year needs a four-digit year");
      opts.year = y;
    } else if (arg === "--asof") opts.asof = value(++i, arg, "a date, e.g. 2025-09-30");
    else if (arg === "--home") {
      opts.home = code(value(++i, arg, "a two-letter state code"));
      if (!/^[A-Z]{2}$/.test(opts.home)) throw new Error("--home needs a two-letter state code");
    } else if (arg === "--abode") {
      opts.abode = value(++i, arg, "state codes, e.g. NY,FL").split(/[,\s]+/).filter(Boolean).map(code);
      if (opts.abode.some((c) => !/^[A-Z]{2}$/.test(c))) throw new Error("--abode needs two-letter state codes, e.g. NY,FL");
    } else if (arg === "--employer") {
      opts.employer = code(value(++i, arg, "a two-letter state code"));
      if (!/^[A-Z]{2}$/.test(opts.employer)) throw new Error("--employer needs a two-letter state code");
    } else if (arg === "--wages") {
      const w = Number(value(++i, arg, "an amount").replace(/[$,]/g, ""));
      if (!(w >= 0)) throw new Error("--wages needs an amount of zero or more");
      opts.wages = w;
    } else if (arg === "--trip") opts.trip = value(++i, arg, 'a state, start date and number of days, e.g. "NY 2025-11-01 14"');
    else if (arg === "--limits") opts.limits = value(++i, arg, 'state and days pairs, e.g. "OH 90,GA 150"');
    else if (arg.startsWith("-") && arg !== "-") throw new Error(`unknown option: ${arg}`);
    else opts.file = arg;
  }
  if ([opts.csv, opts.dailyLog, opts.html, opts.ics, opts.json].filter(Boolean).length > 1) {
    throw new Error("choose one of --csv, --daily-log, --html, --ics and --json");
  }
  return opts;
}

export function parseLimits(text) {
  const overrides = {};
  for (const p of String(text || "").split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = p.match(/^([A-Za-z]{2})\s+(\d{1,3})$/);
    if (!m) throw new Error(`"${p}" is not a limit. Write a state code and a number of days, like OH 90.`);
    overrides[m[1].toUpperCase()] = { limit: Number(m[2]) };
  }
  return overrides;
}

// Build the same spec the web page builds from its form.
export function buildSpec(opts, staysText) {
  const year = opts.year ?? new Date().getFullYear();
  const { stays, errors } = parseStays(staysText, year);
  if (errors.length) throw new Error(errors.map((e) => `Line ${e.line}: ${e.message}`).join("\n"));
  let asOf;
  if (opts.asof) {
    asOf = parseDate(opts.asof, year);
    if (asOf === null) throw new Error("--asof is not a real date. Use YYYY-MM-DD.");
  }
  return {
    year, stays, asOf, homeState: opts.home, employerState: opts.employer,
    abode: Object.fromEntries(opts.abode.map((c) => [c, true])),
    overrides: parseLimits(opts.limits), convention: opts.nights ? "nights" : "inclusive",
    wages: opts.wages, homeWorks: true,
  };
}

export function parseTrip(text, year) {
  const m = String(text || "").trim().match(/^([A-Za-z]{2})\s+(\S+)\s+(\d{1,3})$/);
  if (!m) throw new Error('--trip needs a state, a start date and a number of days, like "NY 2025-11-01 14"');
  const start = parseDate(m[2], year);
  if (start === null) throw new Error("--trip start is not a real date. Use YYYY-MM-DD.");
  return { state: m[1].toUpperCase(), start, days: Number(m[3]) };
}

export function tripReport(t) {
  const out = [`Planned trip: ${t.trip.days} day(s) in ${t.trip.state} from ${dayIso(t.trip.start)}.`, ""];
  if (!t.changes.length) out.push("It changes no state's total.");
  for (const c of t.changes) {
    out.push(`  ${c.code}  ${c.before} -> ${c.after} days (${c.delta > 0 ? "+" : ""}${c.delta})${c.limit !== null ? `, limit ${c.limit}` : ""}${c.crossed ? "  CROSSES THE LIMIT" : ""}`);
  }
  if (t.maxSafeDays !== null) out.push("", `Longest trip from that date that stays within ${t.trip.state}'s limit of ${t.tripLimit}: ${t.maxSafeDays} day(s).`);
  return out.join("\n") + "\n";
}

export function render(spec, opts) {
  if (opts.trip) {
    const t = tripImpact(spec, parseTrip(opts.trip, spec.year));
    return opts.json ? JSON.stringify(t, null, 2) + "\n" : tripReport(t);
  }
  if (opts.csv) return reportCsv(analyze(spec));
  if (opts.dailyLog) return dailyLogCsv(spec);
  if (opts.html) return auditReportHtml(spec);
  if (opts.ics) return deadlinesIcs(analyze(spec)).ics;
  const r = analyze(spec);
  if (opts.json) return JSON.stringify(r, null, 2) + "\n";
  return textReport(r);
}

export function textReport(r) {
  const out = [];
  const conv = r.convention === "nights" ? "nights (departure day not counted)" : "any part of a day";
  out.push(`Residency days ${r.year}, counted by ${conv}; as of ${dayIso(r.asOf)}.`, "");
  const rows = r.states.map((s) => [
    `${s.code} ${STATE_NAMES[s.code] || ""}`.trim(), String(s.days), s.rule ? String(s.rule.limit) : "-",
    s.room === null ? "-" : String(s.room), s.triggerDate ? dayIso(s.triggerDate) : "-", statusText(s),
  ]);
  const head = ["State", "Days", "Limit", "Room", "Crosses on", "Status"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => (i === 1 || i === 2 || i === 3 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join("  ").trimEnd();
  out.push(line(head), line(widths.map((w) => "-".repeat(w))), ...rows.map(line));
  if (r.wages !== null) {
    out.push("", "Wages split by Monday-to-Friday workdays:");
    for (const s of r.states.filter((x) => x.wages)) out.push(`  ${s.code}  ${fmtNum(s.workdays, 1)} workdays  ${fmtMoney(s.wages)}`);
  }
  if (r.notices.length) out.push("", "Notices:", ...r.notices.map((n) => `  - ${n}`));
  out.push("", "An organising aid, not tax or legal advice and not a residency determination. Check each state's own guidance.");
  return out.join("\n") + "\n";
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export async function run(argv, { stdin = readStdin, read = (f) => readFile(f, "utf8") } = {}) {
  const opts = parseArgs(argv);
  if (opts.help) return { out: USAGE, code: 0 };
  let spec;
  if (opts.example) {
    spec = sampleSpec();
    if (opts.nights) spec.convention = "nights";
  } else {
    if (!opts.file) throw new Error("give a stays file (or - for standard input), or use --example");
    spec = buildSpec(opts, opts.file === "-" ? await stdin() : await read(opts.file));
  }
  return { out: render(spec, opts), code: 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then(
    ({ out, code }) => { process.stdout.write(out); process.exitCode = code; },
    (e) => { process.stderr.write(`error: ${e.message}\n\n${USAGE}`); process.exitCode = 2; },
  );
}
