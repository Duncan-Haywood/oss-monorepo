#!/usr/bin/env node
// Zero-dependency CLI: read contacts per interval (a week of half hours), print
// the agents each interval needs (Erlang C, with shrinkage) and the cheapest
// set of shifts that covers them. No network call -- local file/stdin only.
//
//   node cli.mjs plan demand.csv --sl 80 --answer 20 --shrinkage 30 --shifts 8,4 --wage 22
//   cat demand.csv | node cli.mjs plan - --json

import fs from "node:fs/promises";
import { parseDemand, plan, summarize, money, pct, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--sl": "serviceLevel", "--answer": "answerSeconds", "--shrinkage": "shrinkage", "--max-occupancy": "maxOccupancy",
  "--aht": "aht", "--wage": "wage", "--interval": "intervalMinutes", "--start-step": "startStepMinutes", "--min-shift": "minShiftHours",
  "--shifts": "shifts",
};

function parseArgs(argv) {
  const args = { json: false, positional: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (FLAGS[a]) args.opts[a] = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs plan <demand.csv|-> [--sl 80] [--answer 20] [--shrinkage 30] [--max-occupancy 85] [--shifts 8,4] [--wage 22] [--aht 300] [--interval 30] [--start-step 60] [--min-shift 3] [--json]",
  "",
  "Rows: day,start,contacts[,aht_seconds]  (start HH:MM, one row per interval)",
  "--sl             percent of contacts answered within --answer seconds (default 80)",
  "--answer         answer-time target in seconds (default 20)",
  "--shrinkage      percent of paid time agents are off the queue (default 30)",
  "--max-occupancy  occupancy cap in percent, 0 = none (default 85)",
  "--shifts         shift lengths allowed in hours, comma separated (default 8,4)",
  "--wage           fully loaded cost per paid hour in dollars (default 22)",
  "--aht            handle time in seconds for rows that do not give one (default 300)",
  "--interval       minutes per row (default 30)",
  "--start-step     minutes between allowed shift starts (default 60)",
  "--min-shift      shortest closing shift in hours (default 3)",
  "Exit 2 on bad input. Numbers are the ones you supply, not a forecast. No network call.",
].join("\n");

function bad(msg) {
  return { exitCode: 2, output: `${msg}\n\n${USAGE}` };
}

export async function run(argv, io = { readFile: (p) => fs.readFile(p, "utf8") }) {
  const args = parseArgs(argv);
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "plan") return bad(args.sub ? `Unknown command ${args.sub}` : "Missing command");
  const file = args.positional[0];
  if (!file) return bad("Missing demand file (use - for stdin)");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined) return bad(`${flag} needs a value`);
    if (flag === "--shifts") { opts.shifts = v; continue; }
    if (!(Number.isFinite(Number(v)) && Number(v) >= 0)) return bad(`${flag} needs a number, zero or more`);
    opts[FLAGS[flag]] = v;
  }
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseDemand(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.rows.length) return bad("No interval rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, ""];
  for (const d of p.days) {
    lines.push(`${d.day}: ${d.contacts} contacts, peak ${d.peakRequired} scheduled, cost ${money(d.cost)}`);
    for (const s of d.shifts) lines.push(`  ${s.count} x ${s.hours}h shift ${s.start}-${s.end}`);
    lines.push("  " + d.slots.map((s) => `${s.time} ${s.required}/${s.scheduled}`).join("  "));
  }
  lines.push("", "Cost of the service target:");
  for (const c of p.curve) lines.push(`  ${pct(c.serviceLevel)} within ${p.options.answerSeconds}s: ${money(c.cost)}${c.current ? "  <- your target" : ""}`);
  lines.push("", "What if:");
  for (const w of p.whatIf) lines.push(`  ${w.label}: ${money(w.cost)} (${w.delta >= 0 ? "+" : ""}${money(w.delta)})`);
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  const t = p.totals;
  lines.push("", `This plan ${money(t.cost)} | flat peak staffing ${money(t.flatPeak)} | longest shift only ${t.fullShiftOnly == null ? "n/a" : money(t.fullShiftOnly)} | occupancy rule only ${money(t.occupancyRule)} (misses the target in ${t.occupancyRuleMissedIntervals} intervals)`);
  lines.push("Each interval line reads time required/scheduled agents (scheduled includes shrinkage).");
  lines.push(MODEL_NOTE);
  return { exitCode: 0, output: lines.join("\n") };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run(process.argv.slice(2)).then(({ exitCode, output }) => {
    (exitCode ? console.error : console.log)(output);
    process.exitCode = exitCode;
  });
}
