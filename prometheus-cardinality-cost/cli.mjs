#!/usr/bin/env node
// Zero-dependency CLI: count active series in a Prometheus/OpenMetrics scrape,
// find the labels responsible, and price it. No network call -- reads a local
// file or stdin.
//
//   curl -s localhost:9100/metrics | node cli.mjs analyze -
//   node cli.mjs analyze metrics.txt --targets 40
//   node cli.mjs analyze metrics.txt --max-series 50000 --targets 40   # CI gate: exit 1 over budget
//   node cli.mjs analyze metrics.txt --json
//   node cli.mjs analyze metrics.txt --prices my-prices.json

import fs from "node:fs/promises";
import { parseExposition, analyze, summarize, estimateCost, topSavings, DEFAULT_PRICES, DEFAULT_THRESHOLD, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", positional: [], targets: 1, maxSeries: null, threshold: DEFAULT_THRESHOLD, top: 10 };
  const num = (v) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : NaN; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--prices") args.prices = argv[++i];
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--targets") args.targets = num(argv[++i]);
    else if (a === "--max-series") args.maxSeries = num(argv[++i]);
    else if (a === "--threshold") args.threshold = num(argv[++i]);
    else if (a === "--top") args.top = num(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <metrics-file|-> [--targets N] [--max-series N] [--threshold N]",
  "                       [--top N] [--json] [--fail-on error|warn] [--prices file.json]",
  "",
  "Reads the text a /metrics endpoint prints (use - for stdin) and reports active series",
  "per metric, labels with high or unbounded cardinality, the exact series removed by",
  "dropping each label, and a monthly cost estimate for series x targets at list prices",
  "you can override. Exit 1 when --max-series is exceeded (or on warnings with --fail-on warn).",
  "Estimate from ONE scrape and numbers you supply, not a bill. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <metrics-file|->" };
  if (!Number.isFinite(args.targets) || !Number.isFinite(args.threshold) || !Number.isFinite(args.top)) return { exitCode: 2, output: "--targets, --threshold and --top need non-negative numbers." };
  if (args.maxSeries !== null && !Number.isFinite(args.maxSeries)) return { exitCode: 2, output: "--max-series needs a non-negative number." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try { prices = JSON.parse(await readFile(args.prices)); } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseExposition(text), { threshold: args.threshold });
  const summary = summarize(report, { maxSeries: args.maxSeries, targets: args.targets });
  const costs = estimateCost(report.totalSeries, { targets: args.targets }, prices);
  const savings = topSavings(report, args.top);
  const failing = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0);
  const exitCode = failing ? 1 : 0;

  if (args.json) {
    return { exitCode, output: JSON.stringify({ summary, totalSeries: report.totalSeries, samples: report.samples, skippedLines: report.skipped, families: report.families, findings: report.findings, topSavings: savings, estimate: { targets: args.targets, costs, pricesAsOf: PRICES_AS_OF } }, null, 2) };
  }

  const lines = [summary.text];
  lines.push("", "Series per metric (largest first):");
  for (const f of report.families.slice(0, args.top)) {
    const worst = f.labels.find((l) => l.drop && l.drop.saved > 0);
    lines.push(`  ${String(f.series).padStart(8)}  ${f.name} (${f.type})${worst ? `  <- ${worst.name}: ${worst.distinct} values` : ""}`);
  }
  if (report.findings.length) {
    lines.push("", "Findings:");
    for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}  ${f.metric}  ${f.message}`);
  }
  if (savings.length) {
    lines.push("", "Biggest single-label drops (exact, from this scrape):");
    for (const s of savings) lines.push(`  -${s.saved} of ${s.of} series  drop "${s.label}" from ${s.metric}`);
  }
  lines.push("", `Estimated monthly cost for ${report.totalSeries} series x ${args.targets} target(s), ${PRICES_AS_OF}:`);
  for (const c of costs) lines.push(`  $${c.monthly.toFixed(2).padStart(10)}  ${c.label} (${c.activeSeries} active, ${c.billable} billable)`);
  lines.push("  Your target count and editable prices, from one scrape -- an estimate, not a bill.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
