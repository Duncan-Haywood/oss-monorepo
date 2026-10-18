#!/usr/bin/env node
// Zero-dependency CLI: read a catering cost sheet (name, basis, qty, unit cost),
// print the per-guest price that delivers your margin, the food and labor
// percentages, the deposit, a guest-count tier table and a break-even count for
// a price you name. No network call -- local file/stdin.
//
//   node cli.mjs quote event.csv --guests 60
//   cat event.csv | node cli.mjs quote - --guests 60 --margin 30
//   node cli.mjs quote event.csv --guests 60 --price 28 --json --fail-on error

import fs from "node:fs/promises";
import { parseLines, analyze, summarize, MODEL_NOTE } from "./engine.mjs";

const NUMERIC = { "--guests": "guests", "--margin": "targetMargin", "--overhead": "overheadPct", "--waste": "wastePct", "--burden": "burdenPct", "--deposit": "depositPct", "--price": "offeredPrice", "--tax": "taxPct", "--warn-food": "warnFood", "--warn-labor": "warnLabor" };
const PERCENT = new Set(["targetMargin", "overheadPct", "wastePct", "burdenPct", "depositPct", "taxPct", "warnFood", "warnLabor"]);
const flag = (k) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

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
  "  node cli.mjs quote <event.csv|-> [--guests 50] [--margin 30] [--overhead 10] [--waste 5] [--burden 12] [--deposit 50] [--tax 0] [--price 28] [--json] [--fail-on error|warn]",
  "",
  "Input rows: name,basis,qty,unit -- basis is guest (per-guest cost), flat (fixed cost) or staff-hour (qty = total staff hours, unit = hourly rate). A header row is read by name.",
  "--margin/--overhead/--waste/--burden/--deposit/--tax: percentages (defaults 30/10/5/12/50/0). --price: a per-guest price to test (margin, loss, break-even guests).",
  "--warn-food/--warn-labor: percent of the quote that raises a warning (default 35 each).",
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
  if (args.sub !== "quote") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}. Try --help.` };
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs quote <event.csv|->" };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };
  const n = args.nums;
  for (const [k, v] of Object.entries(n)) if (!Number.isFinite(v) || v < 0) return { exitCode: 2, output: `${flag(k)} takes a non-negative number.` };
  if (n.guests !== undefined && (n.guests < 1 || !Number.isInteger(n.guests))) return { exitCode: 2, output: "--guests takes a whole number of at least 1." };
  for (const k of PERCENT) if (n[k] !== undefined && n[k] > 100) return { exitCode: 2, output: `${flag(k)} takes a percentage from 0 to 100.` };
  if (n.offeredPrice !== undefined && n.offeredPrice <= 0) return { exitCode: 2, output: "--price takes a per-guest price above 0." };

  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const opts = {};
  for (const [k, v] of Object.entries(n)) opts[k] = PERCENT.has(k) ? v / 100 : v;
  const report = analyze(parseLines(text), opts);
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  const r4 = (x) => (typeof x === "number" ? Math.round(x * 10000) / 10000 : x);
  if (args.json) {
    return { exitCode, output: JSON.stringify({ summary, note: MODEL_NOTE, guests: report.guests, totalCost: r4(report.totalCost), costPerGuest: report.costPerGuest, quote: report.quote, pricePerGuest: report.pricePerGuest, foodPct: r4(report.foodPct), laborPct: r4(report.laborPct), deposit: report.deposit, tax: report.tax, breakEvenGuests: report.breakEven, offered: report.offered, tiers: report.tiers, items: report.items, findings: report.findings }, null, 2) };
  }
  const lines = [summary.text, "", `Total cost $${report.totalCost.toFixed(2)} (food $${report.food.toFixed(2)}, labor $${report.labor.toFixed(2)}, other fixed $${(report.fixed - report.labor).toFixed(2)})`];
  if (Number.isFinite(report.quote)) lines.push(`Quote $${report.quote.toFixed(2)}  Deposit $${report.deposit.toFixed(2)}  Food ${(report.foodPct * 100).toFixed(0)}%  Labor ${(report.laborPct * 100).toFixed(0)}%`);
  lines.push("", "Guests   Per guest      Quote     Profit");
  for (const t of report.tiers) lines.push(`${String(t.guests).padStart(6)}  ${("$" + t.pricePerGuest.toFixed(2)).padStart(10)}  ${("$" + t.quote.toFixed(0)).padStart(9)}  ${("$" + t.profit.toFixed(0)).padStart(8)}`);
  if (report.offered) lines.push("", `At $${report.offered.pricePerGuest.toFixed(2)} per guest: profit $${report.offered.profit.toFixed(0)} (${(report.offered.margin * 100).toFixed(1)}%)${report.breakEven ? `, break-even ${report.breakEven} guests` : ""}`);
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
