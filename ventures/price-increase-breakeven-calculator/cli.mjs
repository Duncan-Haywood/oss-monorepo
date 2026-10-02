#!/usr/bin/env node
// Zero-dependency CLI: read items (name, price, unit cost, units), test a
// proposed price increase, print per-item break-even volume loss and the
// elasticity at which the raise stops paying, and optionally gate CI.
// No network call -- local file/stdin.
//
//   node cli.mjs analyze items.csv --increase 8
//   cat items.csv | node cli.mjs analyze - --increase 5 --elasticity 1.5 --json --fail-on warn

import fs from "node:fs/promises";
import { parseItems, analyze, summarize, fmtE, MODEL_NOTE } from "./engine.mjs";

const NUMERIC = { "--increase": "increase", "--elasticity": "elasticity" };

function parseArgs(argv) {
  const args = { json: false, failOn: "error", positional: [], nums: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (NUMERIC[a]) args.nums[NUMERIC[a]] = Number(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs analyze <items.csv|-> [--increase 5] [--elasticity 1] [--json] [--fail-on error|warn]",
  "",
  "Input rows: name,price,unit_cost,units -- per unit, units sold in the period you care about.",
  "--increase: proposed price increase in percent (default 5). --elasticity: assumed % fall in units per 1% rise in price (default 1).",
  "Prints, per item, the share of units you can lose before the raise stops paying and the elasticity where it breaks even.",
  "Exit 1 on an error (or a warning with --fail-on warn); 2 on bad input. Elasticity is an assumption, not a measurement. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <items.csv|->" };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };
  const n = args.nums;
  for (const [k, v] of Object.entries(n)) if (!Number.isFinite(v) || v < 0) return { exitCode: 2, output: `--${k} takes a non-negative number.` };
  if (n.increase !== undefined && (n.increase <= 0 || n.increase > 200)) return { exitCode: 2, output: "--increase takes a percentage above 0 and up to 200." };
  if (n.elasticity !== undefined && n.elasticity > 20) return { exitCode: 2, output: "--elasticity takes a number from 0 to 20." };

  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const opts = {};
  if (n.increase !== undefined) opts.increase = n.increase / 100;
  if (n.elasticity !== undefined) opts.elasticity = n.elasticity;
  const report = analyze(parseItems(text), opts);
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) {
    const clean = (v) => (v === Infinity ? "20+" : v);
    return { exitCode, output: JSON.stringify({ summary, note: MODEL_NOTE, totals: report.totals, portfolioNeutralElasticity: clean(report.portfolioNeutral), items: report.rows.map((r) => ({ ...r, neutralElasticity: clean(r.neutralElasticity) })), findings: report.findings }, null, 2) };
  }
  const lines = [summary.text, "", "Item                          now     new  can lose  stops paying at   profit change"];
  for (const r of report.rows) lines.push(`${r.name.slice(0, 28).padEnd(28)} ${r.price.toFixed(2).padStart(7)} ${r.newPrice.toFixed(2).padStart(7)}  ${(r.breakEvenLoss * 100).toFixed(1).padStart(6)}%   elasticity ${fmtE(r.neutralElasticity).padStart(5)}  ${(r.delta >= 0 ? "+" : "-") + Math.abs(r.delta).toFixed(2).padStart(9)}`);
  if (report.skipped) lines.push("", `${report.skipped} line(s) skipped (not parseable).`);
  lines.push("", "Findings:");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", `${MODEL_NOTE}. Test a raise on a few items first and compare units sold before rolling it out.`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
