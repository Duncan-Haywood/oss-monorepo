#!/usr/bin/env node
// Zero-dependency CLI: read a list of trade shows with costs and expected
// leads, print which to buy for the most net gain under a budget and why each
// other one lost. No network call -- local file/stdin only.
//
//   node cli.mjs plan shows.csv --lead-qual 30 --close 20 --deal-value 12000 --margin 60 --budget 40000
//   cat shows.csv | node cli.mjs plan - --json

import fs from "node:fs/promises";
import { parseShows, plan, summarize, money, pct, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--lead-qual": "leadQual", "--close": "close", "--deal-value": "dealValue", "--margin": "margin", "--cycle": "cycleMonths",
  "--ltv": "ltv", "--budget": "budget", "--max-per-quarter": "maxPerQuarter", "--downside": "downside",
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
  "  node cli.mjs plan <shows.csv|-> [--lead-qual 30] [--close 20] [--deal-value 12000] [--margin 60] [--budget 40000] [--max-per-quarter 2] [--cycle 6] [--ltv 1] [--downside 70] [--json]",
  "",
  "Rows: name,date,booth_fee,travel_lodging,staff_count,staff_days,staff_day_cost,swag_collateral,expected_leads[,note]  (date YYYY-MM-DD)",
  "--lead-qual        percent of leads that qualify (default 30)",
  "--close            percent of qualified leads that become deals (default 20)",
  "--deal-value       average first-year deal value, dollars (default 10000)",
  "--margin           gross margin percent on a deal (default 60)",
  "--ltv              lifetime-value multiplier on deal value, 1 = first year only (default 1)",
  "--cycle            sales cycle in months, for the close-by date (default 6)",
  "--budget           yearly show budget in dollars, 0 = none (default 0)",
  "--max-per-quarter  most shows per calendar quarter, 0 = none (default 0)",
  "--downside         leads as a percent of your estimate for the re-check (default 70)",
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
  if (!file) return bad("Missing shows file (use - for stdin)");
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
  const parsed = parseShows(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.shows.length) return bad("No show rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, "", "Ranked by ROI:"];
  for (const r of p.ranked) {
    lines.push(`  ${String(r.rank).padStart(2)}. ${r.name}  cost ${money(r.cost)}  ${money(r.costPerLead)}/lead  ${money(r.costPerQualified)}/qualified  deals ${r.deals.toFixed(2)}  gross profit ${money(r.grossProfit)}  ROI ${pct(r.roi)}  break-even ${Number.isFinite(r.breakEven.leads) ? Math.ceil(r.breakEven.leads) : "n/a"} leads / ${pct(r.breakEven.closeRate, 1)} close / ${r.breakEven.deals.toFixed(2)} deals`);
  }
  lines.push("", "Buy:");
  for (const c of p.chosen) lines.push(`  + ${c.name}  net ${money(c.net)}  (cost ${money(c.cost)})`);
  if (!p.chosen.length) lines.push("  (none)");
  lines.push("", "Skip:");
  for (const s of p.skipped) lines.push(`  - ${s.name} -- ${s.reason}`);
  if (!p.skipped.length) lines.push("  (none)");
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  const t = p.totals;
  lines.push("", `Plan ${money(t.plan)} (spend ${money(t.planSpend)}) | every show ${money(t.everyShow)} (spend ${money(t.everyShowSpend)}${t.everyShowWithinBudget ? "" : ", over budget"}) | cheapest first ${money(t.cheapestFirst)} (spend ${money(t.cheapestFirstSpend)}) | this plan if leads hit ${p.options.downside}%: ${money(t.downsidePlan)}`);
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
