#!/usr/bin/env node
// Zero-dependency CLI: price a list of BigQuery query groups on-demand and
// on Editions slot-hours, say which is cheaper, flag expensive single runs
// with a --maximum_bytes_billed guardrail, and optionally gate CI on it. No network call -- local file/stdin.
//
//   node cli.mjs analyze queries.csv
//   cat queries.csv | node cli.mjs analyze -
//   node cli.mjs analyze queries.csv --guardrail-usd 2 --fail-on warn
//   node cli.mjs analyze queries.csv --json --prices prices.json

import fs from "node:fs/promises";
import { parseQueries, analyze, summarize, DEFAULT_PRICES, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", guardrail: 5, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--prices") args.prices = argv[++i];
    else if (a === "--guardrail-usd") args.guardrail = Number(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <queries.csv|-> [--guardrail-usd 5] [--prices file.json] [--json] [--fail-on error|warn]",
  "",
  "Input rows: query_group,runs_per_month,gb_billed_per_run[,slot_hours_per_run] -- one per query group.",
  "Prices on-demand and Editions, flags expensive single runs, and prints",
  "`bq query --maximum_bytes_billed` guardrails. Exit 1 on a warning with --fail-on warn; 2 on bad input.",
  "Editions cost is a floor (no autoscaler granularity or idle baseline). No network call.",
].join("\n");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), stdin = readStdin } = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: USAGE };
  if (args.sub !== "analyze") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}. Try --help.` };
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <queries.csv|->" };
  if (!Number.isFinite(args.guardrail) || args.guardrail <= 0) return { exitCode: 2, output: "--guardrail-usd takes a positive dollar amount." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try { prices = { ...DEFAULT_PRICES, ...JSON.parse(await readFile(args.prices)) }; } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseQueries(text), { prices, guardrailUsd: args.guardrail });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const lines = [summary.text, "", `Modelled monthly on-demand cost per query group (${PRICES_AS_OF}):`];
  for (const g of report.groups) {
    lines.push(`  ${g.name.padEnd(34)} $${g.onDemand.toFixed(2).padStart(9)}  (${g.runs}/mo x ${g.gbPerRun} GB = $${g.perRunUsd.toFixed(2)}/run${g.editions !== null ? `; slots $${g.editions.toFixed(2)}` : ""})`);
  }
  if (report.skipped) lines.push("", `${report.skipped} line(s) skipped (not parseable).`);
  lines.push("", "Findings:");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", "Estimates from the numbers you supplied and list prices you can override. Moving to Editions changes how every query in the project is billed: pilot with a capped reservation first.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
