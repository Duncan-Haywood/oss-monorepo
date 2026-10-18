#!/usr/bin/env node
// Zero-dependency CLI: price a list of Amazon RDS instances from the numbers
// `aws rds describe-db-instances` and CloudWatch give you, find idle
// instances, Multi-AZ outside production, io1 volumes gp3 covers and x86
// classes with a cheaper Graviton twin, print the aws CLI commands, and
// optionally gate CI on waste. No network call -- local file/stdin.
//
//   node cli.mjs analyze instances.csv
//   cat instances.csv | node cli.mjs analyze -
//   node cli.mjs analyze instances.csv --fail-on warn
//   node cli.mjs analyze instances.csv --json --prices prices.json

import fs from "node:fs/promises";
import { parseInstances, analyze, summarize, DEFAULT_PRICES, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
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
  "  node cli.mjs analyze <instances.csv|-> [--prices file.json] [--json] [--fail-on error|warn]",
  "",
  "Input rows: instance,class,engine,multi_az,storage_type,storage_gb[,provisioned_iops[,avg_cpu_pct[,env]]] -- one per DB instance.",
  "Prices instances at list prices you can override ({\"hourly\": {\"db.m5.large\": 0.15}, \"gbMonth\": {\"gp3\": 0.1}, \"iopsMonth\": 0.1, \"riDiscount\": 0.3}),",
  "flags idle instances, Multi-AZ outside production, io1/io2 that gp3 covers and Graviton twins, and prints `aws rds` commands.",
  "Exit 1 on a warning with --fail-on warn; 2 on bad input. A model of list prices, not a bill. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <instances.csv|->" };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try { prices = JSON.parse(await readFile(args.prices)); } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseInstances(text), { prices });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const lines = [summary.text, "", `Modelled monthly cost per instance (${PRICES_AS_OF}):`];
  for (const w of report.instances) lines.push(`  ${w.name.padEnd(28)} ${w.cls.padEnd(16)}${w.multiAz ? " Multi-AZ" : "         "} $${w.current.toFixed(2).padStart(10)}${w.saving > 0 ? `  save $${w.saving.toFixed(2)}` : ""}${w.potential > 0 ? `  up to $${w.potential.toFixed(2)} more` : ""}`);
  if (report.skipped) lines.push("", `${report.skipped} line(s) skipped (not parseable, unknown class, or an engine other than mysql/mariadb/postgres).`);
  lines.push("", "Findings:");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", "Estimates from the numbers you supplied and list prices you can override. Test each change on a copy first: instance-class and storage changes restart or reconfigure a live database.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
