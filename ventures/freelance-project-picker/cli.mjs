#!/usr/bin/env node
// Zero-dependency CLI: read your weekly capacity and the project offers on the
// table, print which to accept so the hours earn the most, why each other one
// loses, and the fee at which a declined project would earn its place. No
// network call -- local file/stdin only.
//
//   node cli.mjs plan projects.csv --buffer 20
//   cat projects.csv | node cli.mjs plan - --json

import fs from "node:fs/promises";
import { parseOffers, plan, summarize, money, MODEL_NOTE } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--buffer") args.buffer = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs plan <projects.csv|-> [--buffer 20] [--json]",
  "",
  "Rows: capacity,,hours[,week]  and  project,fee,hours,deadline_week[,label]",
  "--buffer  scope-creep allowance, percent added to every hours estimate (default 0)",
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
  if (!file) return bad("Missing projects file (use - for stdin)");
  if (args.buffer !== undefined && !(Number.isFinite(Number(args.buffer)) && Number(args.buffer) >= 0)) return bad("--buffer needs a number, zero or more");
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseOffers(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.projects.length) return bad("No project rows found");
  if (!parsed.capacities.length) return bad("No capacity row found (capacity,,30 means 30 hours a week)");
  const p = plan(parsed, { buffer: args.buffer });
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, "", "Accept:"];
  for (const c of p.chosen) lines.push(`  + ${money(c.fee)}  ${c.planHours}h  by week ${c.deadline}  ${money(c.rate)}/h  ${c.label}`.trimEnd());
  if (!p.chosen.length) lines.push("  (none)");
  lines.push("", "Decline:");
  for (const d of p.declined) {
    const be = d.breakEvenFee === null ? "cannot fit at any fee" : `would earn its place at ${money(d.breakEvenFee)}`;
    lines.push(`  - ${money(d.fee)}  ${d.planHours}h  by week ${d.deadline}  ${d.label} -- ${d.reason}; ${be}`.replace(/  -- /, " -- "));
  }
  if (!p.declined.length) lines.push("  (none)");
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  const t = p.totals;
  lines.push("", `Plan ${money(t.plan)} | highest fee first ${money(t.highestFeeFirst)} | best rate first ${money(t.bestRateFirst)} | listed order ${money(t.listedOrder)}`);
  lines.push(`Ten more billable hours in every week would add ${money(p.sensitivity.extraTenHoursEveryWeek)}.`);
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
