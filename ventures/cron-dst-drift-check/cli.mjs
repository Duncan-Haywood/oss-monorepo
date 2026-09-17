#!/usr/bin/env node
// Zero-dependency CLI: compute a cron expression's next run times against a
// real IANA timezone and flag DST-skipped/ambiguous occurrences, or compute
// how a fixed-UTC-only scheduler (GitHub Actions' `schedule:` cron among
// them) drifts against a target local wall-clock time across the year. No
// network call, ever -- everything here is `Intl`/`Date` arithmetic.
//
//   node cli.mjs next "30 2 * * *" --tz America/New_York
//   node cli.mjs next "30 2 * * *" --tz America/New_York --count 5 --from 2027-03-13T00:00:00Z --json
//   node cli.mjs drift 09:00 --tz America/New_York
//   node cli.mjs drift 09:00 --tz America/New_York --year 2027 --json

import { nextRuns, summarizeRuns, utcOffsetDrift, formatOffset } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--tz") args.tz = argv[++i];
    else if (a === "--count") args.count = parseInt(argv[++i], 10);
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--year") args.year = parseInt(argv[++i], 10);
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (!a.startsWith("-")) args.positional.push(a);
  }
  return args;
}

const HELP = [
  "Usage:",
  '  node cli.mjs next "<cron expression>" --tz <IANA timezone> [--count N] [--from <ISO datetime>] [--json]',
  "  node cli.mjs drift <HH:MM> --tz <IANA timezone> [--year YYYY] [--json]",
  "",
  "next: computes the next N run times of a standard 5-field cron expression",
  "(minute hour day-of-month month day-of-week -- month and day-of-week accept",
  "the standard 3-letter names, JAN-DEC and SUN-SAT, case-insensitive,",
  "anywhere a number is allowed), interpreted as a *local wall-clock* schedule",
  "in --tz, and flags any occurrence that falls in a spring-forward gap (the local time",
  "never happens) or a fall-back overlap (the local time happens twice).",
  "Exits 1 if any occurrence in the computed window is flagged.",
  "",
  "drift: for a target local HH:MM in --tz, computes what UTC clock time a",
  "scheduler that only understands UTC (no timezone field at all -- this is",
  "how GitHub Actions' own `schedule:` cron works, by its own documentation)",
  "would need in each DST segment of --year, and by how much a single fixed",
  "choice would drift for the segments it doesn't cover. Exits 1 if the zone",
  "observes DST (so one UTC cron expression cannot hold the local time",
  "steady year-round).",
].join("\n");

function renderNext(cronExpr, timeZone, result) {
  const { occurrences, flagged } = result;
  const { text } = summarizeRuns(result);
  const lines = [`${cronExpr} in ${timeZone}: ${text}`, ""];
  for (const occ of occurrences) {
    const l = occ.local;
    const flag = occ.ambiguous ? "  [AMBIGUOUS -- fires again or once, depending on scheduler]" : "";
    lines.push(`  ${new Date(occ.utc).toISOString()} UTC  (local ${l.year}-${String(l.month).padStart(2, "0")}-${String(l.day).padStart(2, "0")} ${String(l.hour).padStart(2, "0")}:${String(l.minute).padStart(2, "0")})${flag}`);
  }
  const skipped = flagged.filter((f) => f.kind === "skipped");
  if (skipped.length) {
    lines.push("", "Skipped occurrences (the local time never happens that day):");
    for (const f of skipped) {
      const l = f.local;
      lines.push(`  ${l.year}-${String(l.month).padStart(2, "0")}-${String(l.day).padStart(2, "0")} ${String(l.hour).padStart(2, "0")}:${String(l.minute).padStart(2, "0")} local -- most schedulers either skip this run or fire it at the post-transition time; behavior is implementation-defined, not something this tool can tell you without knowing which cron daemon runs it.`);
    }
  }
  return lines.join("\n");
}

function renderDrift(hour, minute, timeZone, year, drift) {
  const target = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const lines = [`Target local time: ${target} ${timeZone}, year ${year}`, ""];
  if (!drift.observesDst) {
    lines.push(`${timeZone} does not observe DST in ${year} -- a single fixed UTC cron time works year-round.`);
    const seg = drift.segments[0];
    lines.push(`  UTC ${String(seg.utcHour).padStart(2, "0")}:${String(seg.utcMinute).padStart(2, "0")} (offset ${formatOffset(seg.offsetMinutes)})`);
    return lines.join("\n");
  }
  lines.push(`${timeZone} observes DST -- a fixed UTC-only cron cannot hold ${target} local steady year-round. Drift: ${drift.driftMinutes} minutes.`, "");
  for (const seg of drift.segments) {
    lines.push(`  from ${year}-${String(seg.startMonth).padStart(2, "0")}-${String(seg.startDay).padStart(2, "0")}: offset ${formatOffset(seg.offsetMinutes)} -> UTC ${String(seg.utcHour).padStart(2, "0")}:${String(seg.utcMinute).padStart(2, "0")}${seg.utcDayShift !== 0 ? ` (${seg.utcDayShift > 0 ? "+" : ""}${seg.utcDayShift}d)` : ""}`);
  }
  lines.push("", "A scheduler pinned to one of these UTC times (GitHub Actions `schedule:` cron, plain crontab on a UTC host, etc.) will fire at the wrong local hour for the segments it does not match.");
  return lines.join("\n");
}

export function run(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: HELP };
  if (args.sub !== "next" && args.sub !== "drift") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (!args.tz) return { exitCode: 2, output: "Missing required --tz <IANA timezone>. Try --help." };

  if (args.sub === "next") {
    if (args.positional.length !== 1) return { exitCode: 2, output: 'Usage: node cli.mjs next "<cron expression>" --tz <IANA timezone>' };
    let result;
    try {
      const from = args.from ? new Date(args.from) : new Date();
      if (args.from && Number.isNaN(from.getTime())) throw new Error(`unparseable --from date "${args.from}"`);
      result = nextRuns(args.positional[0], args.tz, { from, count: args.count || 10 });
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    const hasRisk = result.flagged.length > 0;
    if (args.json) {
      return { exitCode: hasRisk ? 1 : 0, output: JSON.stringify({ cron: args.positional[0], timeZone: args.tz, ...result }, null, 2) };
    }
    return { exitCode: hasRisk ? 1 : 0, output: renderNext(args.positional[0], args.tz, result) };
  }

  if (args.sub === "drift") {
    if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs drift <HH:MM> --tz <IANA timezone>" };
    const m = /^(\d{1,2}):(\d{2})$/.exec(args.positional[0]);
    if (!m) return { exitCode: 2, output: `Expected HH:MM, got "${args.positional[0]}"` };
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour > 23 || minute > 59) return { exitCode: 2, output: `Invalid time "${args.positional[0]}"` };
    const year = args.year || new Date().getUTCFullYear();
    let drift;
    try {
      drift = utcOffsetDrift(hour, minute, args.tz, year);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    if (args.json) {
      return { exitCode: drift.observesDst ? 1 : 0, output: JSON.stringify({ hour, minute, timeZone: args.tz, year, ...drift }, null, 2) };
    }
    return { exitCode: drift.observesDst ? 1 : 0, output: renderDrift(hour, minute, args.tz, year, drift) };
  }

  // Unreachable: the subcommand is validated above, before --tz is required.
  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
