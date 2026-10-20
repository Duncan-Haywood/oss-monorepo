#!/usr/bin/env node
// Zero-dependency CLI: price S3 buckets/prefixes in Standard, Standard-IA,
// Intelligent-Tiering and Glacier Instant Retrieval and optionally gate CI on
// money left on the table. No network call -- local file/stdin.
//
//   node cli.mjs analyze rows.csv
//   cat rows.csv | node cli.mjs analyze - --current standard
//   node cli.mjs analyze rows.csv --fail-on warn      # CI: exit 1 when a class switch saves >=20%
//   node cli.mjs analyze rows.csv --json --prices my-prices.json

import fs from "node:fs/promises";
import { parseRows, analyze, summarize, CLASSES, DEFAULTS, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", positional: [], current: DEFAULTS.current };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--current") args.current = argv[++i];
    else if (a === "--prices") args.prices = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <rows.csv|-> [--current standard|standard-ia|intelligent-tiering|glacier-ir]",
  "                       [--prices file.json] [--json] [--fail-on error|warn]",
  "",
  "Input rows: name,size_gb,objects,read_gb_per_month,gets_per_month[,avg_life_days] -- one per bucket or",
  "prefix (S3 Storage Lens or an S3 Inventory rollup gives all of it). Prices the same data in four",
  "storage classes, including the 128 KB minimum billable size and 30/90-day minimum durations.",
  "Exit 1 with --fail-on warn when moving a row would save 20% or more. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <rows.csv|->" };
  if (!CLASSES.includes(args.current)) return { exitCode: 2, output: `--current takes one of: ${CLASSES.join(", ")}.` };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices;
  if (args.prices) {
    try { prices = JSON.parse(await readFile(args.prices)); } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseRows(text), { current: args.current, prices });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = args.failOn === "warn" && summary.warns > 0 ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const lines = [summary.text, "", `Modelled monthly cost per row (${PRICES_AS_OF}):`];
  lines.push(`  ${"row".padEnd(28)}${CLASSES.map((c) => c.padStart(21)).join("")}   best`);
  for (const r of report.rows) lines.push(`  ${r.name.slice(0, 27).padEnd(28)}${CLASSES.map((c) => `$${r.costs[c].toFixed(2)}`.padStart(21)).join("")}   ${r.best}`);
  lines.push("", "Findings:");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", "Estimates from the numbers you gave and list prices you can override. Intelligent-Tiering assumes data not read this month is cold. Test a lifecycle rule on a non-critical prefix first.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
