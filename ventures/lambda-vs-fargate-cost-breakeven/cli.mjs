#!/usr/bin/env node
// Zero-dependency CLI: compare the monthly cost of Lambda, Cloud Run, Fargate and EC2 for one
// workload and find the request volume where always-on capacity beats pay-per-request.
// No network call.
//
//   node cli.mjs compare --requests 20M --duration-ms 120 --memory 0.5 --vcpu 0.25 --concurrency 10
//   node cli.mjs compare workload.txt --json
//   node cli.mjs breakeven --duration-ms 300 --memory 1 --vcpu 0.5 --concurrency 1
//   node cli.mjs compare --requests 50M --expect fargate     # CI: exit 1 if another platform is cheapest

import fs from "node:fs/promises";
import { parseInput, compare, breakEven, sensitivity, findings, summarize, fmtUsd, fmtVolume, PLATFORMS, PRICES_AS_OF } from "./engine.mjs";

const FLAGS = {
  "--requests": "requestsPerMonth", "--duration-ms": "durationMs", "--memory": "memoryGib", "--vcpu": "vcpu",
  "--concurrency": "concurrency", "--peak-ratio": "peakRatio", "--min-tasks": "minTasks",
};
const PRICE_FLAGS = {
  "--lambda-per-m-req": "lambdaPerMReq", "--lambda-per-gib-sec": "lambdaPerGibSec", "--cloud-run-per-m-req": "cloudRunPerMReq",
  "--cloud-run-per-vcpu-sec": "cloudRunPerVcpuSec", "--cloud-run-per-gib-sec": "cloudRunPerGibSec",
  "--fargate-per-vcpu-hour": "fargatePerVcpuHour", "--fargate-per-gib-hour": "fargatePerGibHour", "--ec2-per-vcpu-hour": "ec2PerVcpuHour",
};

export function parseVolume(v) {
  const m = /^([0-9.,_]+)\s*(k|m|b)?$/i.exec(String(v).trim());
  if (!m) return NaN;
  return Number(m[1].replace(/[,_]/g, "")) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] || 1);
}

function parseArgs(argv) {
  const args = { json: false, positional: [], input: {}, prices: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--expect") args.expect = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a in FLAGS) {
      const n = a === "--requests" ? parseVolume(argv[++i]) : Number(argv[++i]);
      if (!Number.isFinite(n) || n < 0) { args.bad = a; } else args.input[FLAGS[a]] = n;
    } else if (a in PRICE_FLAGS) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 0) { args.bad = a; } else args.prices[PRICE_FLAGS[a]] = n;
    } else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-")) args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = `lambda-vs-fargate-cost-breakeven -- compare Lambda, Cloud Run, Fargate and EC2 cost for one workload

  compare [file]     monthly cost on each platform, cheapest, and a volume sensitivity table
  breakeven [file]   request volume where Fargate (or --vs ec2|cloud-run) beats Lambda

Workload flags: --requests 20M --duration-ms 120 --memory 0.5 --vcpu 0.25 --concurrency 10 --peak-ratio 4 --min-tasks 2
Price flags:    --lambda-per-m-req --lambda-per-gib-sec --cloud-run-per-m-req --cloud-run-per-vcpu-sec
                --cloud-run-per-gib-sec --fargate-per-vcpu-hour --fargate-per-gib-hour --ec2-per-vcpu-hour
Other:          --json   --expect <lambda|cloud-run|fargate|ec2>  (exit 1 when another platform is cheapest)
`;

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) { process.stdout.write(USAGE); return args.help ? 0 : 2; }
  if (args.unknown || args.bad) { process.stderr.write(`bad option: ${args.unknown || args.bad}\n`); return 2; }
  if (!["compare", "breakeven"].includes(args.sub)) { process.stderr.write(`unknown command: ${args.sub}\n`); return 2; }
  if (args.expect && !PLATFORMS.includes(args.expect)) { process.stderr.write(`--expect must be one of ${PLATFORMS.join(", ")}\n`); return 2; }
  let input = {};
  for (const f of args.positional) input = { ...input, ...parseInput(await fs.readFile(f, "utf8")) };
  input = { ...input, ...args.input };

  if (args.sub === "breakeven") {
    const be = breakEven(input, args.prices, "lambda", "fargate");
    if (args.json) process.stdout.write(JSON.stringify(be, null, 2) + "\n");
    else process.stdout.write(be.volume ? `Fargate becomes cheaper than Lambda at about ${fmtVolume(be.volume)} requests/month.\n` : `${be.note}\n`);
    return 0;
  }
  const report = compare(input, args.prices);
  const fs_ = findings(report);
  if (args.json) {
    process.stdout.write(JSON.stringify({ ...report, findings: fs_, sensitivity: sensitivity(input, args.prices), breakEven: breakEven(input, args.prices) }, null, 2) + "\n");
  } else {
    const w = report.workload;
    process.stdout.write(`Workload: ${fmtVolume(w.requestsPerMonth)} req/month, ${w.durationMs} ms, ${w.memoryGib} GiB, ${w.vcpu} vCPU, concurrency ${w.concurrency}, peak ${w.peakRatio}x avg\n`);
    for (const r of report.ranked) process.stdout.write(`  ${r.name.padEnd(10)} ${fmtUsd(r.total)}/month\n`);
    process.stdout.write(`${summarize(report).text}\n`);
    for (const f of fs_) process.stdout.write(`[${f.severity}] ${f.rule}: ${f.message}\n`);
    const be = breakEven(input, args.prices);
    process.stdout.write(be.volume ? `Break-even vs Fargate: ~${fmtVolume(be.volume)} requests/month.\n` : `${be.note}\n`);
    process.stdout.write(`${PRICES_AS_OF}. An estimate, not a bill.\n`);
  }
  if (args.expect && report.cheapest !== args.expect) return 1;
  return 0;
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`${e.message}\n`); process.exitCode = 2; });
