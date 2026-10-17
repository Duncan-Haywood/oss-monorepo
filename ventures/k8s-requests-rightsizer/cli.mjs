#!/usr/bin/env node
// Zero-dependency CLI: read `kubectl top pod --containers` output, `kubectl get pods -o json`
// and/or CSV rows, report per-container over/under-provisioning, recommend requests
// (usage p95 + headroom), estimate the monthly saving at list prices you can edit, warn about
// out-of-memory risk, and optionally gate CI. No network call -- local files/stdin only.
//
//   kubectl top pod -A --containers > top.txt; kubectl get pods -A -o json > pods.json
//   node cli.mjs analyze top.txt pods.json --patch
//   node cli.mjs analyze containers.csv --cpu-headroom 30 --cpu-price 0.04 --mem-price 0.005
//   node cli.mjs analyze containers.csv --fail-on warn        # CI: exit 1 on over-provisioning

import fs from "node:fs/promises";
import { parseInput, analyze, summarize, fmtCpu, fmtMem, fmtUsd, DEFAULTS, DEFAULT_PRICES, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, patch: false, failOn: "error", positional: [], cpuHeadroom: DEFAULTS.cpuHeadroom * 100, memHeadroom: DEFAULTS.memHeadroom * 100, cpuPrice: DEFAULT_PRICES.cpuPerVcpuHour, memPrice: DEFAULT_PRICES.memPerGibHour };
  const num = (v) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : NaN; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--patch") args.patch = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--cpu-headroom") args.cpuHeadroom = num(argv[++i]);
    else if (a === "--mem-headroom") args.memHeadroom = num(argv[++i]);
    else if (a === "--cpu-price") args.cpuPrice = num(argv[++i]);
    else if (a === "--mem-price") args.memPrice = num(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <file|-> [more files...] [--cpu-headroom PCT] [--mem-headroom PCT]",
  "                       [--cpu-price $/vCPU-hr] [--mem-price $/GiB-hr] [--patch] [--json] [--fail-on error|warn]",
  "",
  "Reads `kubectl top pod --containers [-A]` output, `kubectl get pods -A -o json`, and/or CSV rows",
  "(namespace,pod,container,cpu_request,mem_request,cpu_usage_p95,mem_usage_p95,replicas) from files or",
  "stdin and reports, per container, over/under-provisioned CPU and memory, a recommended request",
  "(usage + headroom, default 20% cpu / 25% memory), the monthly saving at the list prices given, and",
  "out-of-memory risk (usage over 85% of the request or limit). --patch prints YAML snippets.",
  "Exit 1 on an error (or any warning with --fail-on warn); 2 on bad input.",
  "A recommendation from a snapshot, not a bill: sample usage over a representative period.",
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
  if (args.positional.length < 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <file|-> [more files...]" };
  if (![args.cpuHeadroom, args.memHeadroom, args.cpuPrice, args.memPrice].every(Number.isFinite)) return { exitCode: 2, output: "--cpu-headroom/--mem-headroom take a non-negative percentage and --cpu-price/--mem-price a non-negative $ number." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  let text = "";
  for (const src of args.positional) {
    try { text += `${src === "-" ? await stdin() : await readFile(src)}\n`; } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }
  }
  const report = analyze(parseInput(text), { cpuHeadroom: args.cpuHeadroom / 100, memHeadroom: args.memHeadroom / 100, prices: { cpuPerVcpuHour: args.cpuPrice, memPerGibHour: args.memPrice } });
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, pricesAsOf: PRICES_AS_OF, ...report }, null, 2) };

  const rows = report.containers.map((c) => [
    `${c.ns}/${c.workload}`, c.container, String(c.replicas),
    c.cpuReq === null ? "-" : fmtCpu(c.cpuReq), fmtCpu(c.cpuUse), fmtCpu(c.cpu.rec),
    c.memReq === null ? "-" : fmtMem(c.memReq), fmtMem(c.memUse), fmtMem(c.mem.rec),
    fmtUsd(c.savings),
  ]);
  const head = ["workload", "container", "x", "cpu req", "cpu use", "cpu rec", "mem req", "mem use", "mem rec", "$/month"];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmtRow = (r) => r.map((v, i) => (i < 2 ? v.padEnd(w[i]) : v.padStart(w[i]))).join("  ");
  const lines = [summary.text, "", fmtRow(head), ...rows.map(fmtRow)];
  if (report.findings.length) {
    lines.push("", "Findings:");
    for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  }
  for (const n of report.notes) lines.push("", `Note: ${n}`);
  if (args.patch) {
    lines.push("", "Patch snippets (requests = usage + headroom; limits only move when a request would pass them):");
    for (const p of report.patches) lines.push("", p.yaml);
    if (!report.patches.length) lines.push("  nothing to change");
  }
  lines.push("", `A recommendation from a snapshot, not a bill. $ = replicas x requests x list prices (${PRICES_AS_OF}). Usage must be sampled over a representative period, including peaks. Test changes in staging first.`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
