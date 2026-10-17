#!/usr/bin/env node
// Zero-dependency CLI: read a CSV of CloudWatch numbers per RDS/Aurora instance and/or the
// JSON from `aws rds describe-db-instances`, report over/under-provisioned instances, the
// next-smaller (or larger) class in the same family, a Graviton equivalent for x86 classes,
// the monthly saving (Multi-AZ doubles the instance price) and the `aws rds modify-db-instance`
// command. No network call -- local files/stdin only.
//
//   aws rds describe-db-instances --output json > rds.json
//   node cli.mjs analyze rds.json metrics.csv --commands
//   node cli.mjs analyze instances.csv --fail-on warn          # CI: exit 1 on any warning
//   node cli.mjs classes                                       # print the embedded price table

import fs from "node:fs/promises";
import { parseInput, analyze, summarize, fmtUsd, CLASS_TABLE, DEFAULTS, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, commands: false, applyImmediately: false, failOn: "error", positional: [], cpuTarget: DEFAULTS.cpuTarget * 100, memReserve: DEFAULTS.memReserve * 100, prices: null };
  const num = (v) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--commands") args.commands = true;
    else if (a === "--apply-immediately") args.applyImmediately = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--cpu-target") args.cpuTarget = num(argv[++i]);
    else if (a === "--mem-reserve") args.memReserve = num(argv[++i]);
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
  "  node cli.mjs analyze <file|-> [more files...] [--cpu-target PCT] [--mem-reserve PCT]",
  "                       [--prices prices.json] [--commands] [--apply-immediately] [--json] [--fail-on error|warn]",
  "  node cli.mjs classes",
  "",
  "Reads CSV rows (db_identifier,engine,instance_class,multi_az,storage_gb,cpu_avg,cpu_p95,",
  "freeable_mem_gb_min,connections_p95[,count]) and/or `aws rds describe-db-instances --output json`",
  "and reports, per instance, over/under-provisioning, the next class in the same family that keeps",
  "p95 CPU under --cpu-target (default 70) and freeable memory over --mem-reserve (default 20) percent,",
  "a Graviton equivalent for x86 classes, and the monthly saving at approximate us-east-1 list prices",
  "(edit them with --prices). --commands prints `aws rds modify-db-instance` lines; they wait for the",
  "maintenance window unless --apply-immediately, and either way the class change restarts the instance.",
  "Exit 1 on an error (or any warning with --fail-on warn); 2 on bad input.",
  "A recommendation from metrics, not a bill: sample metrics over a representative period.",
].join("\n");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), stdin = readStdin } = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: USAGE };
  if (args.sub === "classes") {
    const rows = Object.entries(CLASS_TABLE).map(([k, v]) => `${k.padEnd(20)} ${String(v.vcpu).padStart(3)} vCPU ${String(v.memGib).padStart(4)} GiB  $${v.price.toFixed(3)}/hr${v.baseline === null ? "" : `  burstable, baseline ${v.baseline * 100}%`}`);
    return { exitCode: 0, output: [`Embedded class table (${PRICES_AS_OF}):`, ...rows].join("\n") };
  }
  if (args.sub !== "analyze") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}. Try --help.` };
  if (args.positional.length < 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <file|-> [more files...]" };
  if (![args.cpuTarget, args.memReserve].every(Number.isFinite)) return { exitCode: 2, output: "--cpu-target and --mem-reserve take a percentage between 0 and 100." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let prices;
  if (args.prices) {
    try { prices = JSON.parse(await readFile(args.prices)); } catch (err) { return { exitCode: 2, output: `cannot read prices ${args.prices}: ${err.message}` }; }
    if (!prices || typeof prices !== "object" || Array.isArray(prices)) return { exitCode: 2, output: "--prices expects a JSON object such as {\"db.r6g.large\": 0.27}." };
  }
  let text = "";
  for (const src of args.positional) {
    try { text += `${src === "-" ? await stdin() : await readFile(src)}\n`; } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }
  }
  const report = analyze(parseInput(text), { cpuTarget: args.cpuTarget / 100, memReserve: args.memReserve / 100, applyImmediately: args.applyImmediately, prices });
  const summary = summarize(report);
  if (!report.analysed) return { exitCode: 2, output: [summary.text, ...report.notes.filter((n) => !/^Metrics must/.test(n))].join("\n") };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const shown = report.instances.filter((i) => i.monthlyNow > 0);
  const rows = shown.map((i) => [i.id, i.cls, i.multiAz && !/^aurora/.test(i.engine) ? "yes" : "no", i.cpuP95 === null ? "-" : `${i.cpuP95}%`, i.freeMemGb === null ? "-" : `${i.freeMemGb}`, i.verdict, i.finalCls || "-", fmtUsd(i.monthlyNow), fmtUsd(i.savings)]);
  const head = ["instance", "class", "multi-az", "cpu p95", "free GiB", "verdict", "recommended", "$/mo now", "saves/mo"];
  const w = head.map((h, k) => Math.max(h.length, ...rows.map((r) => r[k].length)));
  const fmtRow = (r) => r.map((v, k) => (k < 2 || k === 5 || k === 6 ? v.padEnd(w[k]) : v.padStart(w[k]))).join("  ");
  const lines = [summary.text, "", fmtRow(head), ...rows.map(fmtRow)];
  if (report.findings.length) {
    lines.push("", "Findings:");
    for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  }
  for (const n of report.notes) lines.push("", `Note: ${n}`);
  if (args.commands) {
    lines.push("", args.applyImmediately ? "Commands (--apply-immediately: the restart happens now):" : "Commands (no --apply-immediately: applied in the next maintenance window):");
    const cmds = shown.filter((i) => i.command);
    for (const i of cmds) lines.push(i.command);
    if (!cmds.length) lines.push("  nothing to change");
    else lines.push("", "Downtime: changing the class restarts the instance. Single-AZ is unavailable for several minutes; Multi-AZ fails over (about 1-2 minutes). Test in a non-production copy first.");
  }
  lines.push("", `A recommendation from metrics, not a bill. Prices are ${PRICES_AS_OF}. Metrics must be sampled over a representative period, including peaks.`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
