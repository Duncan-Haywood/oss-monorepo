#!/usr/bin/env node
// Zero-dependency CLI: read a list of markets, fairs and festivals with
// expected sales and costs, print which to work for the most net income and
// why each other one lost. No network call -- local file/stdin only.
//
//   node cli.mjs plan events.csv --cogs 35 --crew-rate 15 --max-per-week 2
//   cat events.csv | node cli.mjs plan - --json

import fs from "node:fs/promises";
import { parseEvents, plan, summarize, isoDay, clock, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = { "--cogs": "cogsPct", "--crew-rate": "crewRate", "--setup": "setupHours", "--teardown": "teardownHours", "--max-per-week": "maxPerWeek", "--downside": "downside" };

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
  "  node cli.mjs plan <events.csv|-> [--cogs 35] [--crew-rate 15] [--setup 1] [--teardown 0.5] [--max-per-week 2] [--downside 70] [--json]",
  "",
  "Rows: name,date,start,end,expected_sales,flat_fee,pct_fee,travel[,note]  (date YYYY-MM-DD, times HH:MM)",
  "--cogs          cost of goods as a percent of sales (default 35)",
  "--crew-rate     total crew cost per hour, dollars (default 0)",
  "--setup         hours of setup before each event; --teardown hours after (defaults 1 and 0.5)",
  "--max-per-week  most events you will work in a Monday-to-Sunday week, 0 = no limit (default 0)",
  "--downside      sales as a percent of your estimate for the bad-weather check (default 70)",
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
  if (!file) return bad("Missing events file (use - for stdin)");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (!(v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0)) return bad(`${flag} needs a number, zero or more`);
    opts[FLAGS[flag]] = v;
  }
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseEvents(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.events.length) return bad("No event rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const when = (e) => `${isoDay(Math.floor(e.start / 24))} ${clock(e.start % 24)}-${clock(e.end % 24)}`;
  const lines = [summarize(p).text, "", "Work:"];
  for (const c of p.chosen) lines.push(`  + ${when(c)}  ${c.name}  net ${money(c.net)}  (break-even sales ${money(c.breakEven)})`);
  if (!p.chosen.length) lines.push("  (none)");
  lines.push("", "Skip:");
  for (const s of p.skipped) lines.push(`  - ${when(s)}  ${s.name} -- ${s.reason}`);
  if (!p.skipped.length) lines.push("  (none)");
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  const t = p.totals;
  lines.push("", `Plan ${money(t.plan)} | in the order listed ${money(t.firstListed)} | biggest sales first ${money(t.biggestSalesFirst)} | this plan if sales hit ${p.options.downside}%: ${money(t.downsidePlan)}`);
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
