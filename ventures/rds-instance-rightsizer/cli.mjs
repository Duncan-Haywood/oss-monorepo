#!/usr/bin/env node
// Zero-dependency CLI: read a CSV of RDS/Aurora instances + CloudWatch stats and/or
// `aws rds describe-db-instances` JSON, report over-provisioned, idle and under-provisioned
// instances, Graviton and gp3 swaps and Multi-AZ on non-prod, estimate the monthly saving at an
// editable list-price table, print `aws rds modify-db-instance` commands, and optionally gate CI.
// No network call -- local files/stdin only.
//
//   aws rds describe-db-instances > describe.json
//   node cli.mjs analyze describe.json metrics.csv --commands
//   node cli.mjs analyze instances.csv --prices my-prices.json --target-cpu 50
//   node cli.mjs analyze instances.csv --fail-on warn        # CI: exit 1 on any warning

import fs from "node:fs/promises";
import { parseInput, analyze, summarize, fmtUsd, DEFAULTS, PRICES_AS_OF, DEFAULT_PRICES } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, commands: false, failOn: "error", positional: [], targetCpu: DEFAULTS.targetCpu * 100, memHeadroom: DEFAULTS.memHeadroom * 100 };
  const num = (v) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : NaN; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--commands") args.commands = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--target-cpu") args.targetCpu = num(argv[++i]);
    else if (a === "--mem-headroom") args.memHeadroom = num(argv[++i]);
    else if (a === "--prices") args.prices = argv[++i];
    else if (a === "--print-prices") args.printPrices = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <file|-> [more files...] [--prices prices.json] [--target-cpu PCT] [--mem-headroom PCT]",
  "                       [--commands] [--json] [--fail-on error|warn]",
  "  node cli.mjs --print-prices      # the embedded editable price table, as JSON",
  "",
  "Reads a CSV (instance_id,class,engine,multi_az,env,avg_cpu,p95_cpu,min_freeable_gib,max_connections,",
  "storage_gib,storage_type,iops) and/or `aws rds describe-db-instances` JSON from files or stdin and",
  "reports, per instance: over-provisioned (smaller class, same family), Graviton swap, gp2/io1 -> gp3,",
  "Multi-AZ on non-prod, idle, and under-provisioned risk, with the monthly saving at an editable",
  "list-price table. --commands prints `aws rds modify-db-instance` lines.",
  "Exit 1 on an error (or any warning with --fail-on warn); 2 on bad input.",
  "An estimate from a snapshot, not a bill: sample a representative period; resizing restarts the instance.",
].join("\n");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), stdin = readStdin } = {}) {
  const args = parseArgs(argv);
  if (args.printPrices) return { exitCode: 0, output: JSON.stringify(DEFAULT_PRICES, null, 2) };
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: USAGE };
  if (args.sub !== "analyze") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}. Try --help.` };
  if (args.positional.length < 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <file|-> [more files...]" };
  if (![args.targetCpu, args.memHeadroom].every(Number.isFinite) || args.targetCpu <= 0 || args.targetCpu > 100) return { exitCode: 2, output: "--target-cpu takes a percentage above 0 and up to 100; --mem-headroom a non-negative percentage." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices;
  if (args.prices) {
    try { prices = JSON.parse(await readFile(args.prices)); } catch (err) { return { exitCode: 2, output: `cannot read prices ${args.prices}: ${err.message}` }; }
  }
  let text = "";
  for (const src of args.positional) {
    try { text += `${src === "-" ? await stdin() : await readFile(src)}\n`; } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }
  }
  const report = analyze(parseInput(text), { targetCpu: args.targetCpu / 100, memHeadroom: args.memHeadroom / 100, prices });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const rows = report.instances.map((i) => [i.id, i.cls || "-", i.avgCpu === null ? "-" : `${i.avgCpu}%`, i.p95Cpu === null ? "-" : `${i.p95Cpu}%`, i.target ? i.target.cls : "keep", fmtUsd(i.monthlyNow), fmtUsd(i.savings.total)]);
  const head = ["instance", "class", "avg cpu", "p95 cpu", "suggested", "$/month", "saving"];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmtRow = (r) => r.map((v, i) => (i < 2 || i === 4 ? v.padEnd(w[i]) : v.padStart(w[i]))).join("  ");
  const lines = [summary.text, "", fmtRow(head), ...rows.map(fmtRow)];
  if (report.findings.length) {
    lines.push("", "Findings:");
    for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}  ${f.id}\n        ${f.message}`);
  }
  for (const n of report.notes) lines.push("", `Note: ${n}`);
  if (args.commands) {
    lines.push("", "Commands (review each; resizing restarts the instance and Multi-AZ fails over):");
    for (const c of report.commands) lines.push("", c.command);
    if (!report.commands.length) lines.push("  nothing to change");
  }
  lines.push("", `An estimate from a snapshot, not a bill. Prices: ${PRICES_AS_OF}. Sample a representative period, including your busiest day. Verify in a non-prod window first; this is not advice of record.`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
