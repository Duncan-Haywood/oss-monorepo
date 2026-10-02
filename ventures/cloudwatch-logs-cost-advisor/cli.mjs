#!/usr/bin/env node
// Zero-dependency CLI: price a list of CloudWatch log groups (ingestion plus
// storage), find never-expire and over-long retention, dead groups and
// Infrequent Access candidates, print the put-retention-policy commands, and
// optionally gate CI on waste. No network call -- local file/stdin.
//
//   node cli.mjs analyze groups.csv
//   cat groups.csv | node cli.mjs analyze -
//   node cli.mjs analyze groups.csv --retention 14 --fail-on warn
//   node cli.mjs analyze groups.csv --json --prices prices.json

import fs from "node:fs/promises";
import { parseGroups, analyze, summarize, DEFAULT_PRICES, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", retention: 30, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--prices") args.prices = argv[++i];
    else if (a === "--retention") args.retention = Number(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <groups.csv|-> [--retention 30] [--prices file.json] [--json] [--fail-on error|warn]",
  "",
  "Input rows: log_group,stored_gb,retention_days|never,ingested_gb_month[,age_days[,class]] -- one per log group.",
  "Prices ingestion and storage, estimates what a shorter retention saves, flags dead groups, and prints",
  "`aws logs put-retention-policy` commands. Exit 1 on a warning with --fail-on warn; 2 on bad input.",
  "Retention savings assume even ingestion over time: a model, not a measurement. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <groups.csv|->" };
  if (!Number.isFinite(args.retention) || args.retention < 1 || args.retention > 3653) return { exitCode: 2, output: "--retention takes a number of days from 1 to 3653." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try { prices = { ...DEFAULT_PRICES, ...JSON.parse(await readFile(args.prices)) }; } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseGroups(text), { prices, retention: args.retention });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const lines = [summary.text, "", `Modelled monthly cost per log group (${PRICES_AS_OF}):`];
  for (const g of report.groups) {
    lines.push(`  ${g.name.padEnd(34)} $${g.current.toFixed(2).padStart(9)}  (ingest $${g.ingest.toFixed(2)}, storage $${g.storage.toFixed(2)})${g.saving > 0 ? `  save $${g.saving.toFixed(2)}` : ""}`);
    if (g.command) lines.push(`      ${g.command}`);
  }
  if (report.skipped) lines.push("", `${report.skipped} line(s) skipped (not parseable).`);
  lines.push("", "Findings:");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", "Estimates from the numbers you supplied and list prices you can override. A retention policy deletes data; check compliance and audit needs first.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
