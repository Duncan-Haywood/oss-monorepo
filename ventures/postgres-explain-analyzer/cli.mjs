#!/usr/bin/env node
// Zero-dependency CLI: read a PostgreSQL EXPLAIN plan (text or FORMAT JSON),
// show where the time went, and flag the plan shapes that usually mean a slow
// query. No network call and no database connection -- reads a file or stdin.
//
//   psql -c "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT ..." -At | node cli.mjs analyze -
//   node cli.mjs analyze plan.txt
//   node cli.mjs analyze plan.json --max-ms 200      # CI gate: exit 1 over budget
//   node cli.mjs analyze plan.txt --fail-on warn --json

import fs from "node:fs/promises";
import { parsePlan, analyze, summarize, renderTree, fmtMs } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, failOn: "error", positional: [], maxMs: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--max-ms") { const v = argv[++i]; const n = Number(v); args.maxMs = v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : NaN; }
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <plan-file|-> [--max-ms N] [--fail-on error|warn] [--json]",
  "",
  "Reads EXPLAIN output (text, or FORMAT JSON; use - for stdin) and reports time per",
  "plan node, filters that discard most rows, bad row estimates, sorts and hashes that",
  "spill to disk, and nested loops over sequential scans, with a suggested fix for each.",
  "Exit 1 on an error finding or when --max-ms is exceeded (warnings too with --fail-on warn).",
  "Heuristics over one plan, not a DBA: test any index on your own data. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <plan-file|->" };
  if (args.maxMs !== null && !Number.isFinite(args.maxMs)) return { exitCode: 2, output: "--max-ms needs a non-negative number." };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }
  const plan = parsePlan(text);
  if (plan.error) return { exitCode: 2, output: plan.error };

  const report = analyze(plan);
  const summary = summarize(report, { maxMs: args.maxMs });
  const failing = summary.errors > 0 || summary.overBudget || (args.failOn === "warn" && summary.warns > 0);
  const exitCode = failing ? 1 : 0;

  if (args.json) {
    return { exitCode, output: JSON.stringify({ summary, executionMs: report.executionMs, planningMs: report.planningMs, topNodes: report.topNodes, findings: report.findings }, null, 2) };
  }
  const lines = [summary.text, "", "Plan (self time per node):", renderTree(plan)];
  if (report.topNodes.length && report.hasActual) {
    lines.push("", "Where the time went:");
    for (const t of report.topNodes.slice(0, 3)) lines.push(`  ${fmtMs(t.exclusiveMs).padStart(10)}  ${t.share !== null ? `${Math.round(t.share * 100)}%`.padStart(4) : "    "}  ${t.label}`);
  }
  if (report.findings.length) {
    lines.push("", "Findings:");
    for (const f of report.findings) {
      lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}  ${f.nodeLabel}`, `        ${f.message}`);
      if (f.fix) lines.push(`        Fix: ${f.fix}`);
    }
  }
  lines.push("", "Heuristics over one plan -- test any index or setting change on your own data.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
