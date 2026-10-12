#!/usr/bin/env node
// Zero-dependency CLI: read a queue of requested translation (or any per-file
// professional) jobs, print the best set to accept and the order to
// work them, what each declined file would need to pay, and how much
// first-come, biggest-fee and best-per-hour acceptance leave behind. Local
// file/stdin only, no network.
//
//   node cli.mjs pla jobs.csv --hours-per-day 6 --booked 4 --booked-due 2
//   cat jobs.csv | node cli.mjs plan - --json

import fs from "node:fs/promises";
import { parseJobs, plan, summarize, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = { "--hours-per-day": "hoursPerDay", "--booked": "booked", "--booked-due": "bookedDue" };

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
  "  node cli.mjs plan <jobs.csv|-> [--hours-per-day 7] [--booked 0] [--booked-due 1] [--json]",
  "",
  "Rows: name,fee,hours,due_day,direct_cost[,note]",
  "--hours-per-day  real working hours you can give the queue each business day (default 7)",
  "--booked         hours already committed to files not in the list (default 0)",
  "--booked-due     business day those booked hours are due by the end of (default 1)",
  "--json           machine-readable output",
  "Due day 1 is today. Up to 16 jobs. Work is treated as divisible across days.",
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
  const lines = [summarize(p).text, "", "Work in this order:"];
  p.schedule.forEach((s, i) => {
    const days = s.startDay === s.finishDay ? `day ${s.finishDay}` : `days ${s.startDay}-${s.finishDay}`;
    const net = s.booked ? "already booked" : `net ${money(p.jobs[s.index].fee - p.jobs[s.index].cost)}`;
    lines.push(`  ${i + 1}. ${s.name}  ${s.hours}h  ${days} (due day ${s.due}, ${Math.max(0, s.spare).toFixed(1)}h to spare)  ${net}`);
  });
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  lines.push("", `Plan ${money(p.net)}`);
  for (const b of p.baselines) lines.push(`  ${b.label}: ${money(b.net)} (${b.jobs} files)`);
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
