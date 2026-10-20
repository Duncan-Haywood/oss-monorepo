#!/usr/bin/env node
// Zero-dependency CLI: read AWS Lambda CloudWatch REPORT lines, find the
// memory size that minimises cost without a latency regression, and optionally
// gate CI on waste or out-of-memory risk. No network call -- local file/stdin.
//
//   aws logs tail /aws/lambda/my-fn --since 1d | node cli.mjs analyze - --invocations 5000000
//   node cli.mjs analyze logs.txt --cpu-bound 0.8 --arch arm
//   node cli.mjs analyze logs.txt --fail-on warn        # CI: exit 1 on over-provisioned / near-limit
//   node cli.mjs analyze logs.txt --json --prices my-prices.json

import fs from "node:fs/promises";
import { parseReports, analyze, summarize, DEFAULT_PRICES, DEFAULTS, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", positional: [], invocations: 1e6, cpuBound: DEFAULTS.cpuBound, maxSlowdown: DEFAULTS.maxSlowdown, arch: "x86" };
  const num = (v) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : NaN; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--invocations") args.invocations = num(argv[++i]);
    else if (a === "--cpu-bound") args.cpuBound = num(argv[++i]);
    else if (a === "--max-slowdown") args.maxSlowdown = num(argv[++i]);
    else if (a === "--arch") args.arch = argv[++i];
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
  "  node cli.mjs analyze <logs.txt|-> [--invocations N/month] [--cpu-bound 0..1] [--max-slowdown X]",
  "                       [--arch x86|arm] [--prices file.json] [--json] [--fail-on error|warn]",
  "",
  "Reads Lambda REPORT lines (from CloudWatch, `aws logs tail`, an export; other lines are ignored)",
  "and reports peak memory vs configured, duration percentiles, cold-start share, and the",
  "cost-minimising memory size within a latency cap (default 1.25x p50), shown at I/O-bound,",
  "your --cpu-bound share (default 0.5) and fully CPU-bound. Exit 1 on out-of-memory risk",
  "(or any warning with --fail-on warn). Duration at another size is a MODEL, not a measurement:",
  "confirm with AWS Lambda Power Tuning. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <logs.txt|->" };
  if (!Number.isFinite(args.invocations) || !Number.isFinite(args.cpuBound) || args.cpuBound > 1 || !Number.isFinite(args.maxSlowdown) || args.maxSlowdown < 1) return { exitCode: 2, output: "--invocations needs a non-negative number, --cpu-bound a number from 0 to 1, --max-slowdown a number >= 1." };
  if (!["x86", "arm"].includes(args.arch)) return { exitCode: 2, output: "--arch takes x86 or arm." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try { prices = JSON.parse(await readFile(args.prices)); } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseReports(text), { invocations: args.invocations, cpuBound: args.cpuBound, maxSlowdown: args.maxSlowdown, arch: args.arch, prices });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const s = report.stats;
  const lines = [summary.text, "", `Peak memory ${s.maxUsed} MB of ${s.size} MB; duration p50 ${s.p50Ms.toFixed(0)} / p95 ${s.p95Ms.toFixed(0)} / p99 ${s.p99Ms.toFixed(0)} ms; cold starts ${(s.coldShare * 100).toFixed(0)}%.`, "",
    `Cheapest size within ${args.maxSlowdown}x p50, by how CPU-bound the function is (${PRICES_AS_OF}):`];
  for (const [name, label] of [["ioBound", "I/O-bound (0%)"], ["yours", `your guess (${(args.cpuBound * 100).toFixed(0)}%)`], ["cpuBound", "CPU-bound (100%)"]]) {
    const b = report.scenarios[name].best;
    lines.push(`  ${label.padEnd(20)} ${String(b.mb).padStart(6)} MB  p50 ~${b.p50Ms} ms  $${b.costPerMillion.toFixed(2)} per million invocations`);
  }
  if (report.findings.length) {
    lines.push("", "Findings:");
    for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  }
  lines.push("", "Estimates from the lines you pasted and list prices you can override; duration at another size is modelled. Test any change before rolling it out.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
