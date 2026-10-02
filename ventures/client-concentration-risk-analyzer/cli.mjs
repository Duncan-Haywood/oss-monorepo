#!/usr/bin/env node
// Zero-dependency CLI: read an invoice export (client, optional date, amount),
// print each client's share of revenue, the top-1/3/5 shares, the Herfindahl
// index, what is left if the biggest client goes, and optionally gate CI or a
// monthly cron on concentration. No network call -- local file/stdin.
//
//   node cli.mjs analyze invoices.csv
//   cat invoices.csv | node cli.mjs analyze -
//   node cli.mjs analyze invoices.csv --costs 24000 --months 12
//   node cli.mjs analyze invoices.csv --warn-top1 20 --json --fail-on warn

import fs from "node:fs/promises";
import { parseInvoices, analyze, summarize, MODEL_NOTE } from "./engine.mjs";

const NUMERIC = { "--costs": "monthlyCosts", "--months": "windowMonths", "--warn-top1": "warnTop1", "--error-top1": "errorTop1", "--warn-top3": "warnTop3", "--error-top3": "errorTop3" };
const PERCENT = new Set(["warnTop1", "errorTop1", "warnTop3", "errorTop3"]);

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
  "  node cli.mjs analyze <invoices.csv|-> [--costs 24000] [--months 12] [--warn-top1 25] [--error-top1 40] [--warn-top3 60] [--error-top3 80] [--json] [--fail-on error|warn]",
  "",
  "Input rows: client,amount or client,date,amount -- one invoice per line (a header row is read by name).",
  "--costs: your average monthly costs, to test whether you survive losing the biggest client.",
  "--months: window of invoice dates to use when dates are present (default 12).",
  "--warn-top1/--error-top1: single-client share (percent) that raises a warning/error (defaults 25/40). --warn-top3/--error-top3: same for the top three (60/80).",
  "Exit 1 on an error finding (or a warning with --fail-on warn); 2 on bad input. The levels are rules of thumb. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <invoices.csv|->" };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };
  const n = args.nums;
  for (const [k, v] of Object.entries(n)) if (!Number.isFinite(v) || v < 0) return { exitCode: 2, output: `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} takes a non-negative number.` };
  for (const k of PERCENT) if (n[k] !== undefined && (n[k] <= 0 || n[k] > 100)) return { exitCode: 2, output: `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} takes a percentage above 0 and up to 100.` };
  if (n.windowMonths !== undefined && (n.windowMonths < 1 || n.windowMonths > 120 || !Number.isInteger(n.windowMonths))) return { exitCode: 2, output: "--months takes a whole number from 1 to 120." };

  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const opts = {};
  for (const [k, v] of Object.entries(n)) opts[k] = PERCENT.has(k) ? v / 100 : v;
  const report = analyze(parseInvoices(text), opts);
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) {
    const round = (x) => (typeof x === "number" ? Math.round(x * 10000) / 10000 : x);
    return { exitCode, output: JSON.stringify({ summary, note: MODEL_NOTE, window: report.windowNote, total: report.total, top1: round(report.top1), top3: round(report.top3), top5: round(report.top5), hhi: report.hhi, effectiveClients: round(report.effective), trend: report.trend || null, clients: report.list.map((e) => ({ client: e.client, total: round(e.total), share: round(e.share), invoices: e.invoices })), findings: report.findings }, null, 2) };
  }
  const lines = [summary.text, "", "Clients by share of revenue:"];
  for (const e of report.list) lines.push(`  ${e.client.slice(0, 30).padEnd(30)} ${(e.share * 100).toFixed(1).padStart(5)}%  $${Math.round(e.total).toLocaleString("en-US").padStart(10)}  ${e.invoices} invoice(s)`);
  lines.push("", `Top 1 ${(report.top1 * 100).toFixed(0)}%  Top 3 ${(report.top3 * 100).toFixed(0)}%  Top 5 ${(report.top5 * 100).toFixed(0)}%  Herfindahl ${report.hhi}`);
  if (report.skipped) lines.push(`${report.skipped} line(s) skipped (not parseable).`);
  lines.push("", "Findings:");
  if (!report.findings.length) lines.push("  none");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", `${MODEL_NOTE}.`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
