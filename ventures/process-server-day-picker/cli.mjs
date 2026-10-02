#!/usr/bin/env node
// Zero-dependency CLI: read a queue of requested jobs, print the best set and
// order for one server, what each declined job would need to pay, and how much
// first-come and biggest-fee-first rules leave behind. No network serve --
// local file/stdin only.
//
//   node cli.mjs plan jobs.csv --start 08:00 --end 17:00 --hourly 35 --per-mile 0.70
//   cat jobs.csv | node cli.mjs plan - --json

import fs from "node:fs/promises";
import { parseJobs, plan, summarize, money, clock, MODEL_NOTE } from "./engine.mjs";

const FLAGS = { "--start": "shiftStart", "--end": "shiftEnd", "--hourly": "hourly", "--per-mile": "perMile", "--speed": "speed", "--circuity": "circuity" };

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
  "  node cli.mjs plan <jobs.csv|-> [--start 08:00] [--end 17:00] [--hourly 35] [--per-mile 0.70] [--speed 30] [--circuity 1.3] [--json]",
  "",
  "Rows: name,price,materials,service_min,earliest,latest_start,east_miles,north_miles[,note]",
  "--start      vehicle leaves the depot at this time (default 08:00)",
  "--end        vehicle must be back by this time (default 17:00)",
  "--hourly     your time and vehicle cost per hour while driving or working, dollars (default 35)",
  "--per-mile   fuel and wear per mile, dollars (default 0.70)",
  "--speed      average driving speed, mph (default 30)",
  "--circuity   road miles per straight-line mile, 1 or more (default 1.3)",
  "--json       machine-readable output",
  "Up to 14 jobs. Waiting for a window to open is free.",
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "plan") return bad("Expected the plan command");
  const file = args.positional[0];
  if (!file) return bad("Give a jobs file, or - for stdin");
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
  if (!parsed.jobs.length) return bad("No job rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, "", "Route:"];
  p.route.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${clock(s.start)}-${clock(s.finish)}  ${s.name}  margin ${money(s.margin)}  ${s.miles.toFixed(1)} mi${s.wait >= 1 ? `  (waits ${Math.round(s.wait)} min)` : ""}`);
  });
  if (p.route.length) lines.push(`  back at depot ${clock(p.home)}`);
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  lines.push("", `Plan ${money(p.profit)}`);
  for (const b of p.baselines) lines.push(`  ${b.label}: ${money(b.profit)} (${b.jobs} jobs)`);
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
