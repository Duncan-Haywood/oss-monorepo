#!/usr/bin/env node
// Zero-dependency CLI: price NAT gateway traffic per destination, find the AWS
// services that should bypass it through a VPC endpoint, print the
// aws ec2 create-vpc-endpoint commands, and optionally gate CI on waste.
// No network call -- local file/stdin.
//
//   node cli.mjs analyze nat.csv
//   cat nat.csv | node cli.mjs analyze -
//   node cli.mjs analyze nat.csv --azs 3 --region eu-west-1
//   node cli.mjs analyze nat.csv --fail-on warn    # CI: exit 1 on any avoidable NAT spend
//   node cli.mjs analyze nat.csv --json --prices prices.json

import fs from "node:fs/promises";
import { parseTraffic, analyze, summarize, DEFAULT_PRICES, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", azs: 2, region: "us-east-1", positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--prices") args.prices = argv[++i];
    else if (a === "--azs") args.azs = Number(argv[++i]);
    else if (a === "--region") args.region = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <nat.csv|-> [--azs 2] [--region us-east-1] [--prices file.json] [--json] [--fail-on error|warn]",
  "",
  "Input rows: gateway,destination,gb_per_month[,vpc] -- one per NAT gateway and destination (s3, dynamodb, ecr, logs, sts, ssm, ...).",
  "Prices the NAT gateway (hourly + per-GB), then each AWS-bound destination as a VPC endpoint (free gateway endpoint for",
  "S3/DynamoDB, hourly-plus-per-GB interface endpoint for the rest) and prints the create-vpc-endpoint commands that save money.",
  "Exit 1 when avoidable spend is large (an error finding), or any warning with --fail-on warn; 2 on bad input.",
  "The GB per destination is a number you supply: treat this as a screen, not a bill. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <nat.csv|->" };
  if (!Number.isInteger(args.azs) || args.azs < 1 || args.azs > 6) return { exitCode: 2, output: "--azs takes a whole number from 1 to 6." };
  if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(args.region ?? "")) return { exitCode: 2, output: "--region takes an AWS region name such as us-east-1." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try {
      const over = JSON.parse(await readFile(args.prices));
      prices = { ...DEFAULT_PRICES, ...over };
      if (Object.values(prices).some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) throw new Error("every price must be a non-negative number");
    } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseTraffic(text), { prices, azs: args.azs, region: args.region });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const lines = [summary.text, "", `Modelled monthly cost per NAT gateway (${PRICES_AS_OF}):`];
  for (const g of report.gateways) lines.push(`  ${g.name.padEnd(14)} ${String(g.gb).padStart(9)} GB  $${g.total.toFixed(2).padStart(9)}  ($${g.fixed.toFixed(2)} fixed + $${g.processing.toFixed(2)} processing)`);
  const worth = report.plans.filter((p) => p.worth);
  if (worth.length) {
    lines.push("", "Endpoints worth creating (largest saving first):");
    for (const p of worth) {
      lines.push(`  ${p.service.padEnd(14)} ${String(p.gb).padStart(9)} GB  NAT $${p.natCost.toFixed(2)} -> endpoint $${p.endpointCost.toFixed(2)}  (save $${p.net.toFixed(2)})`);
      for (const c of p.commands) lines.push(`      ${c}`);
    }
  }
  if (report.skipped) lines.push("", `${report.skipped} line(s) skipped (not parseable).`);
  lines.push("", "Findings:");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", "Estimates from the traffic you supplied and list prices you can override. Test the endpoint in one VPC first: a gateway endpoint adds a route, and an interface endpoint with private DNS changes where the service name resolves.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
