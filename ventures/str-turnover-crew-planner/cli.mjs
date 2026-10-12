#!/usr/bin/env node
// Zero-dependency CLI: read a day's queue of short-term-rental turnovers, print
// which to take, which crew does which and in what order, what each declined
// turnover would need to pay, and how much first-come and biggest-fee-first
// booking leave behind. No network call -- local file/stdin only.
//
//   node cli.mjs plan turnovers.csv --crews 2 --start 09:00 --end 18:00 --hourly 40
//   cat turnovers.csv | node cli.mjs plan - --json

import fs from "node:fs/promises";
import { parseJobs, plan, summarize, money, clock, MODEL_NOTE } from "./engine.mjs";

const FLAGS = { "--start": "shiftStart", "--end": "shiftEnd", "--hourly": "hourly", "--per-mile": "perMile", "--speed": "speed", "--circuity": "circuity", "--crews": "crews" };

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
  "  node cli.mjs plan <turnovers.csv|-> [--crews 2] [--start 09:00] [--end 18:00] [--hourly 40] [--per-mile 0.70] [--speed 30] [--circuity 1.3] [--json]",
  "",
  "Rows: name,fee,supplies,clean_min,checkout,next_checkin,east_miles,north_miles[,note]",
  "--crews      identical crews leaving the same depot, 1 to 3 (default 2)",
  "--start      crews leave the depot at this time (default 09:00)",
  "--end        crews must be back by this time (default 18:00)",
  "--hourly     one crew's cost per hour while driving or cleaning, dollars (default 40)",
  "--per-mile   fuel and wear per mile, dollars (default 0.70)",
  "--speed      average driving speed, mph (default 30)",
  "--circuity   road miles per straight-line mile, 1 or more (default 1.3)",
  "--json       machine-readable output",
  "Up to 12 turnovers. Waiting for a checkout is free.",
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "plan") return bad("Expected the plan command");
  const file = args.positional[0];
  if (!file) return bad("Give a turnovers file, or - for stdin");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined || v === "") return bad(`${flag} needs a value`);
    opts[FLAGS[flag]] = v;
  }
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseJobs(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.jobs.length) return bad("No turnover rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, ""];
  for (const crew of p.crews) {
    lines.push(`Crew ${crew.crew}:`);
    crew.route.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${clock(s.start)}-${clock(s.finish)}  ${s.name}  margin ${money(s.margin)}  ${s.miles.toFixed(1)} mi${s.wait >= 1 ? `  (waits ${Math.round(s.wait)} min)` : ""}`);
    });
    lines.push(`  back at depot ${clock(crew.home)}  crew profit ${money(crew.profit)}`);
  }
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  lines.push("", `Plan ${money(p.profit)}`);
  for (const b of p.baselines) lines.push(`  ${b.label}: ${money(b.profit)} (${b.jobs} turnovers)`);
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
