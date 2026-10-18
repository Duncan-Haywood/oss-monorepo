#!/usr/bin/env node
// Zero-dependency CLI: scan a repo's source for LLM API call sites that
// quietly cost money. No network call -- reads only local files.
//
//   node cli.mjs scan src
//   node cli.mjs scan . --json
//   node cli.mjs scan src --calls-per-day 5000 --in-tokens 2000 --out-tokens 500
//   node cli.mjs scan src --prices my-prices.json     # override the built-in list prices
//   node cli.mjs scan src --fail-on warn              # exit 1 on warnings too (default: errors only)

import fs from "node:fs/promises";
import path from "node:path";
import { scanSource, mergeScans, estimateMonthly, summarize, DEFAULT_PRICES, PRICES_AS_OF } from "./engine.mjs";

const SCAN_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py"]);
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", "vendor", ".next", ".venv", "venv", "target", "__pycache__"]);

function parseArgs(argv) {
  const args = { json: false, failOn: "error", positional: [], callsPerDay: 1000, inTokens: 1000, outTokens: 300 };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : NaN; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--prices") args.prices = argv[++i];
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--calls-per-day") args.callsPerDay = num(argv[++i]);
    else if (a === "--in-tokens") args.inTokens = num(argv[++i]);
    else if (a === "--out-tokens") args.outTokens = num(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-")) args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

async function walk(root, readdir, out = []) {
  let entries;
  try { entries = await readdir(root); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      await walk(full, readdir, out);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs scan <dir-or-file> [...] [--json] [--fail-on error|warn]",
  "                    [--calls-per-day N] [--in-tokens N] [--out-tokens N] [--prices file.json]",
  "",
  "Finds OpenAI / Anthropic / Google LLM call sites and flags: no output cap,",
  "call inside a loop, premium-tier model hard-coded, retired model names.",
  "Cost figures are arithmetic on YOUR traffic guess and list prices you can",
  "override -- an estimate, not a bill. No network call.",
].join("\n");

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), stat = (p) => fs.stat(p), readdir = (p) => fs.readdir(p, { withFileTypes: true }) } = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: USAGE };
  if (args.sub !== "scan") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}. Try --help.` };
  if (args.positional.length === 0) return { exitCode: 2, output: "Usage: node cli.mjs scan <dir-or-file> [...]" };
  if (![args.callsPerDay, args.inTokens, args.outTokens].every(Number.isFinite)) return { exitCode: 2, output: "--calls-per-day, --in-tokens and --out-tokens need non-negative numbers." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try { prices = JSON.parse(await readFile(args.prices)); } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }

  const files = [];
  for (const target of args.positional) {
    let st;
    try { st = await stat(target); } catch (err) { return { exitCode: 2, output: `cannot read ${target}: ${err.message}` }; }
    if (st.isDirectory()) files.push(...(await walk(target, readdir)));
    else files.push(target);
  }

  const scans = [];
  for (const file of files) {
    let text;
    try { text = await readFile(file); } catch { continue; }
    scans.push(scanSource(text, file, prices));
  }
  const merged = mergeScans(scans);
  const summary = summarize(merged);
  const estimate = estimateMonthly(merged.calls, args, prices);
  const failing = merged.findings.some((f) => f.severity === "error" || (args.failOn === "warn" && f.severity === "warn"));
  const exitCode = failing ? 1 : 0;

  if (args.json) {
    return { exitCode, output: JSON.stringify({ filesScanned: files.length, summary, calls: merged.calls, findings: merged.findings, estimate: { assumptions: { callsPerDay: args.callsPerDay, inTokens: args.inTokens, outTokens: args.outTokens }, monthlyUsd: estimate.total, pricedCalls: estimate.pricedCount, pricesAsOf: PRICES_AS_OF } }, null, 2) };
  }

  const lines = [`scanned ${files.length} source file(s) -- ${summary.text}`];
  for (const f of merged.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}  ${f.file}:${f.line}  ${f.message}`);
  if (estimate.pricedCount > 0) {
    lines.push(`Estimated monthly cost if EVERY priced call site ran ${args.callsPerDay}x/day at ${args.inTokens} in / ${args.outTokens} out tokens: $${estimate.total.toFixed(2)}`);
    lines.push(`  (${estimate.pricedCount} of ${merged.calls.length} call sites priced; ${PRICES_AS_OF}. Your traffic guess, not a measurement.)`);
  }
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
