#!/usr/bin/env node
// Zero-dependency CLI: read past orders (subtotal, optional shipping cost),
// sweep free-shipping thresholds, print the expected profit of each against
// your current policy, the top-up rate each needs to break even, a best and a
// robust threshold, and optionally gate CI on a better threshold existing.
// No network call -- local file/stdin.
//
//   node cli.mjs analyze orders.csv
//   cat orders.csv | node cli.mjs analyze -
//   node cli.mjs analyze orders.csv --current 75 --margin 45 --fee 5.95 --days 30
//   node cli.mjs analyze orders.csv --top-up 15 --drag 5 --reach 20 --json --fail-on warn

import fs from "node:fs/promises";
import { parseOrders, analyze, summarize, MODEL_NOTE } from "./engine.mjs";

const NUMERIC = { "--current": "current", "--margin": "margin", "--fee": "fee", "--ship-cost": "shipCost", "--top-up": "topUp", "--drag": "drag", "--reach": "reach", "--days": "days" };

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
  "  node cli.mjs analyze <orders.csv|-> [--current 75] [--margin 40] [--fee 5.95] [--ship-cost 7] [--top-up 25] [--reach 30] [--drag 10] [--days 30] [--json] [--fail-on error|warn]",
  "",
  "Input rows: subtotal[,shipping_cost] -- one per order, subtotal before shipping and tax.",
  "--current: your free-shipping threshold today (omit if you charge shipping on every order).",
  "--margin: profit % of merchandise before shipping (default 40). --fee: what customers under the threshold pay (default: your average shipping cost).",
  "--top-up: % of orders right under a threshold that add items to reach it (default 25). --reach: how far below, as % of the threshold, they still bother (default 30).",
  "--drag: % of would-be buyers who abandon when charged shipping (default 10).",
  "--days: how many days of orders the file covers, to annualise (default 30). Exit 1 on a warning with --fail-on warn; 2 on bad input.",
  "Top-up and checkout drop-off are assumptions, not measurements. No network call.",
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
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs analyze <orders.csv|->" };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };
  const n = args.nums;
  for (const [k, v] of Object.entries(n)) if (!Number.isFinite(v) || v < 0) return { exitCode: 2, output: `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} takes a non-negative number.` };
  if (n.margin !== undefined && (n.margin <= 0 || n.margin > 100)) return { exitCode: 2, output: "--margin takes a percentage above 0 and up to 100." };
  if (n.topUp !== undefined && n.topUp > 100) return { exitCode: 2, output: "--top-up takes a percentage from 0 to 100." };
  if (n.drag !== undefined && n.drag > 60) return { exitCode: 2, output: "--drag takes a percentage from 0 to 60." };
  if (n.reach !== undefined && (n.reach < 5 || n.reach > 100)) return { exitCode: 2, output: "--reach takes a percentage from 5 to 100." };
  if (n.days !== undefined && n.days < 1) return { exitCode: 2, output: "--days takes a number of days, 1 or more." };

  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const opts = {};
  if (n.current) opts.current = n.current;
  if (n.margin !== undefined) opts.margin = n.margin / 100;
  if (n.fee !== undefined) opts.fee = n.fee;
  if (n.shipCost !== undefined) opts.shipCost = n.shipCost;
  if (n.topUp !== undefined) opts.topUp = n.topUp / 100;
  if (n.drag !== undefined) opts.drag = n.drag / 100;
  if (n.reach !== undefined) opts.reach = n.reach / 100;
  if (n.days !== undefined) opts.days = n.days;

  const report = analyze(parseOrders(text), opts);
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) {
    const clean = (v) => (v === Infinity ? "none" : v);
    const row = (t) => ({ ...t, threshold: clean(t.threshold) });
    return { exitCode, output: JSON.stringify({ summary, note: MODEL_NOTE, totals: report.totals, current: clean(report.current), best: row(report.best), robust: row(report.robust), table: report.table.map(row), findings: report.findings }, null, 2) };
  }

  const lines = [summary.text, "", `Expected profit change vs ${report.label(report.current)} on these ${report.count} orders (${Math.round(report.options.topUp * 100)}% top-up, ${Math.round(report.options.drag * 100)}% checkout drop-off when charged shipping):`];
  const fmtBE = (b) => (!b ? "(current)" : b.kind === "always" ? "pays at any drop-off" : b.kind === "never" ? "does not pay" : b.kind === "atLeast" ? `pays if drop-off >= ${(b.drag * 100).toFixed(0)}%` : `pays if drop-off <= ${(b.drag * 100).toFixed(0)}%`);
  for (const t of report.table) {
    const mark = t === report.best ? " <- best" : t === report.robust ? " <- safest" : "";
    lines.push(`  ${report.label(t.threshold).padEnd(17)} free ${(t.freePct * 100).toFixed(0).padStart(3)}%  ${(t.gain >= 0 ? "+" : "-") + "$" + Math.abs(t.gain).toFixed(2).padStart(9)}  ${fmtBE(t.breakEven)}${mark}`);
  }
  if (report.skipped) lines.push("", `${report.skipped} line(s) skipped (not parseable).`);
  lines.push("", "Findings:");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", `${MODEL_NOTE}. Try a change for a few weeks and compare average order value and conversion before keeping it.`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
