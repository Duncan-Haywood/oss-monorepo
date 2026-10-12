#!/usr/bin/env node
// Zero-dependency CLI: price a list of EBS volumes (type, size, provisioned and
// observed peak IOPS/throughput) against the cheapest type that still covers the
// peak, print the aws ec2 modify-volume commands, and optionally gate CI on
// waste. No network call -- local file/stdin.
//
//   node cli.mjs analyze volumes.csv
//   cat volumes.csv | node cli.mjs analyze -
//   node cli.mjs analyze volumes.csv --fail-on warn    # CI: exit 1 when a change would save >=10%
//   node cli.mjs analyze volumes.csv --json --prices prices.json

import fs from "node:fs/promises";
import { parseVolumes, analyze, summarize, DEFAULT_PRICES, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", headroom: 1.2, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--prices") args.prices = argv[++i];
    else if (a === "--headroom") args.headroom = Number(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <volumes.csv|-> [--headroom 1.2] [--prices file.json] [--json] [--fail-on error|warn]",
  "",
  "Input rows: volume,type,size_gb,provisioned_iops,provisioned_mibps,peak_iops,peak_mibps[,state] -- one per EBS volume.",
  "Prices each volume as gp2/gp3/io1/io2/st1/sc1, picks the cheapest type that covers the observed peak plus",
  "headroom, and prints the live `aws ec2 modify-volume` command. An `available` volume is unattached waste.",
  "Exit 1 when a volume is throttled today (or any warning with --fail-on warn); 2 on bad input.",
  "The peak is one number you supply: treat this as a screen, not a performance test. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <volumes.csv|->" };
  if (!Number.isFinite(args.headroom) || args.headroom < 1 || args.headroom > 3) return { exitCode: 2, output: "--headroom takes a number from 1 to 3." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices = DEFAULT_PRICES;
  if (args.prices) {
    try {
      const over = JSON.parse(await readFile(args.prices));
      prices = Object.fromEntries(Object.keys(DEFAULT_PRICES).map((k) => [k, { ...DEFAULT_PRICES[k], ...(over[k] ?? {}) }]));
    } catch (err) { return { exitCode: 2, output: `Cannot read prices file ${args.prices}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const report = analyze(parseVolumes(text), { prices, headroom: args.headroom });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const lines = [summary.text, "", `Modelled monthly cost per volume (${PRICES_AS_OF}):`];
  for (const v of report.volumes) {
    lines.push(`  ${v.name.padEnd(14)} ${v.type.padEnd(4)} ${String(v.sizeGb).padStart(6)} GB  $${v.current.toFixed(2).padStart(9)}  ->  ${v.recommended.padEnd(6)} $${v.recommendedCost.toFixed(2).padStart(9)}${v.saving > 0 ? `  (save $${v.saving.toFixed(2)})` : ""}`);
    if (v.command) lines.push(`      ${v.command}`);
  }
  if (report.skipped) lines.push("", `${report.skipped} line(s) skipped (not parseable).`);
  lines.push("", "Findings:");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", "Estimates from the peaks you supplied and list prices you can override. Change one non-critical volume first; a type change runs live but the volume is in the optimizing state for a while.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
