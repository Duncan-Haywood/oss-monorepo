#!/usr/bin/env node
// Zero-dependency CLI: read an S3 Inventory report (CSV), estimate the net
// 12-month saving of lifecycle transitions after the fees people forget, and
// optionally gate CI on avoidable waste. No network call -- local file/stdin.
//
//   node cli.mjs analyze inventory.csv
//   node cli.mjs analyze inventory.csv --retrieval-pct 5 --region-multiplier 1.1
//   node cli.mjs analyze inventory.csv --fail-on warn --waste-threshold 250   # CI: exit 1 above $250/month
//   node cli.mjs analyze inventory.csv --json --prices my-prices.json

import fs from "node:fs/promises";
import { parseInventory, analyze, summarize, money, fmtBytes, DEFAULT_PRICES, DEFAULTS, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "none", positional: [], retrievalPct: DEFAULTS.retrievalPct, earlyDeletePct: DEFAULTS.earlyDeletePct, wasteThreshold: DEFAULTS.wasteThresholdPerMonth, regionMultiplier: 1 };
  const num = (v) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : NaN; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--retrieval-pct") args.retrievalPct = num(argv[++i]);
    else if (a === "--early-delete-pct") args.earlyDeletePct = num(argv[++i]);
    else if (a === "--waste-threshold") args.wasteThreshold = num(argv[++i]);
    else if (a === "--region-multiplier") args.regionMultiplier = num(argv[++i]);
    else if (a === "--as-of") args.asOf = argv[++i];
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
  "  node cli.mjs analyze <inventory.csv|-> [--retrieval-pct N] [--early-delete-pct N] [--region-multiplier X]",
  "                       [--prices file.json] [--as-of YYYY-MM-DD] [--json] [--fail-on warn] [--waste-threshold USD/month]",
  "",
  "Reads an S3 Inventory CSV (Bucket, Key, Size, LastModifiedDate, StorageClass; optional",
  "IntelligentTieringAccessTier, IsLatest, IsDeleteMarker) and estimates, per lifecycle action, the NET",
  "12-month saving after transition request fees, minimum billable size, Glacier overhead, minimum",
  "storage duration, Intelligent-Tiering monitoring and retrieval (default 1% of bytes per month).",
  "Prints a ready-to-paste lifecycle configuration for the best rule, with a size filter where it helps.",
  "--fail-on warn exits 1 when the avoidable saving exceeds --waste-threshold (default $100/month).",
  "Estimates from list prices you can override, not a bill. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <inventory.csv|->" };
  if (![args.retrievalPct, args.earlyDeletePct, args.wasteThreshold, args.regionMultiplier].every(Number.isFinite) || args.retrievalPct > 100 || args.earlyDeletePct > 100 || args.regionMultiplier <= 0) return { exitCode: 2, output: "--retrieval-pct and --early-delete-pct take 0 to 100, --waste-threshold a non-negative number, --region-multiplier a positive number." };
  if (!["none", "error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };
  let asOf;
  if (args.asOf !== undefined) {
    asOf = /^\d{4}-\d{2}-\d{2}/.test(args.asOf) ? Date.parse(args.asOf) : NaN;
    if (!Number.isFinite(asOf)) return { exitCode: 2, output: "--as-of takes a date like 2026-10-01." };
  }

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try { prices = JSON.parse(await readFile(args.prices)); } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseInventory(text), { retrievalPct: args.retrievalPct, earlyDeletePct: args.earlyDeletePct, wasteThresholdPerMonth: args.wasteThreshold, regionMultiplier: args.regionMultiplier, prices, asOf });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const lines = [summary.text, "", "Current monthly storage cost by class:"];
  for (const c of report.byClass) lines.push(`  ${c.cls.padEnd(20)} ${String(c.count).padStart(9)} objects  ${fmtBytes(c.bytes).padStart(11)}  ${money(c.monthlyCost).padStart(12)}`);
  lines.push("", "Standard objects by age (LastModified):");
  for (const b of report.ageBuckets) lines.push(`  ${b.label.padEnd(14)} ${String(b.standardCount).padStart(9)} objects  ${fmtBytes(b.standardBytes).padStart(11)}`);
  lines.push("", `Net 12-month saving per action (retrieval ${args.retrievalPct}% of bytes per month, ${args.earlyDeletePct}% deleted early; ${PRICES_AS_OF}):`, `  ${"action".padEnd(28)} ${"all objects".padStart(14)} ${"128 KiB+ only".padStart(14)}`);
  for (const c of report.candidates) lines.push(`  ${`${c.label} (day ${c.minAgeDays})`.padEnd(28)} ${money(c.unfiltered.net).padStart(14)} ${money(c.filtered.net).padStart(14)}`);
  if (report.findings.length) {
    lines.push("", "Findings:");
    for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  }
  if (report.lifecycle) lines.push("", "Lifecycle configuration for the best net saving (review, then aws s3api put-bucket-lifecycle-configuration):", JSON.stringify(report.lifecycle, null, 2));
  lines.push("", "Estimates from the rows you supplied and list prices you can override; access patterns are assumptions. Not a bill. Test on one prefix before rolling out.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
