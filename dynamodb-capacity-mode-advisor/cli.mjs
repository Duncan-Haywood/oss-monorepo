#!/usr/bin/env node
// Zero-dependency CLI: price one DynamoDB table's consumed capacity as
// on-demand vs provisioned (autoscaled or fixed) and optionally gate CI on a
// wasteful capacity mode. No network call -- local file/stdin.
//
//   node cli.mjs analyze metrics.csv
//   cat metrics.csv | node cli.mjs analyze - --period 300 --current-rcu 400 --current-wcu 100
//   node cli.mjs analyze metrics.csv --fail-on warn      # CI: exit 1 when a switch would save >=20%
//   node cli.mjs analyze metrics.csv --json --prices my-prices.json

import fs from "node:fs/promises";
import { parseMetrics, analyze, summarize, DEFAULT_PRICES, DEFAULTS, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", positional: [], period: DEFAULTS.periodSeconds, target: DEFAULTS.targetUtilization };
  const num = (v) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : NaN; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--period") args.period = num(argv[++i]);
    else if (a === "--target") args.target = num(argv[++i]);
    else if (a === "--current-rcu") args.currentRcu = num(argv[++i]);
    else if (a === "--current-wcu") args.currentWcu = num(argv[++i]);
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
  "  node cli.mjs analyze <metrics.csv|-> [--period seconds] [--target 0..1] [--current-rcu N --current-wcu N]",
  "                       [--prices file.json] [--json] [--fail-on error|warn]",
  "",
  "Input rows: timestamp,read_units,write_units -- the Sum of ConsumedReadCapacityUnits and",
  "ConsumedWriteCapacityUnits per period (default 3600 s). Prices the same traffic on-demand,",
  "provisioned with autoscaling (target utilisation default 0.7) and provisioned at a fixed peak.",
  "Pass --current-rcu/--current-wcu if the table is provisioned today; otherwise on-demand is assumed.",
  "Exit 1 on throttling (or any warning with --fail-on warn). Bursts shorter than the period are",
  "invisible: treat this as a screen, not a capacity plan. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <metrics.csv|->" };
  if (!Number.isFinite(args.period) || args.period < 1 || !Number.isFinite(args.target) || args.target <= 0 || args.target > 1) return { exitCode: 2, output: "--period needs seconds >= 1 and --target a number above 0 and at most 1." };
  if ((args.currentRcu !== undefined) !== (args.currentWcu !== undefined) || Number.isNaN(args.currentRcu) || Number.isNaN(args.currentWcu)) return { exitCode: 2, output: "--current-rcu and --current-wcu go together and take non-negative numbers." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try { prices = JSON.parse(await readFile(args.prices)); } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseMetrics(text), { periodSeconds: args.period, targetUtilization: args.target, prices, currentProvisioned: args.currentRcu === undefined ? undefined : { read: args.currentRcu, write: args.currentWcu } });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const lines = [summary.text, "", `Reads: avg ${report.read.avg.toFixed(1)}/s, peak ${report.read.peak.toFixed(1)}/s.  Writes: avg ${report.write.avg.toFixed(1)}/s, peak ${report.write.peak.toFixed(1)}/s.`, "", `Modelled monthly cost, 730 h (${PRICES_AS_OF}):`];
  const rows = [["on-demand", report.totals.onDemand], ["provisioned, autoscaling", report.totals.autoscaled], [`provisioned, fixed peak (${report.readCost.staticPeakUnits} RCU / ${report.writeCost.staticPeakUnits} WCU)`, report.totals.staticPeak]];
  if (report.totals.current !== undefined) rows.push([`your current ${args.currentRcu} RCU / ${args.currentWcu} WCU`, report.totals.current]);
  for (const [label, cost] of rows) lines.push(`  ${label.padEnd(48)} $${cost.toFixed(2)}`);
  lines.push(`  Provisioned beats on-demand above ~${(report.breakEven.read * 100).toFixed(0)}% average utilisation (reads) / ~${(report.breakEven.write * 100).toFixed(0)}% (writes).`);
  if (report.findings.length) {
    lines.push("", "Findings:");
    for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  }
  lines.push("", "Estimates from the metrics you pasted and list prices you can override. Traffic inside a period is treated as flat. Test any change on a non-critical table first.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
