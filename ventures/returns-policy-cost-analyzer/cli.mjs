#!/usr/bin/env node
// Zero-dependency CLI: read orders (category, subtotal, refund, optional return
// label), print what returns cost per return and per category, and what a return
// fee or restocking fee would earn against free returns. Optionally gate CI on
// a category losing money after returns. No network call -- local file/stdin.
//
//   node cli.mjs analyze orders.csv
//   cat orders.csv | node cli.mjs analyze -
//   node cli.mjs analyze orders.csv --margin 45 --out-ship 6.5 --resale 70 --days 90
//   node cli.mjs analyze orders.csv --deterrence 0.5 --drag 5 --json --fail-on warn

import fs from "node:fs/promises";
import { parseOrders, analyze, summarize, MODEL_NOTE } from "./engine.mjs";

const NUMERIC = { "--margin": "margin", "--out-ship": "outShip", "--return-label": "returnShip", "--handling": "handling", "--resale": "resale", "--deterrence": "deterrence", "--drag": "drag", "--days": "days" };
const PERCENT = new Set(["margin", "resale", "drag"]);

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
  "  node cli.mjs analyze <orders.csv|-> [--margin 40] [--out-ship 7] [--return-label 6] [--handling 2] [--resale 85] [--deterrence 1] [--drag 3] [--days 30] [--json] [--fail-on error|warn]",
  "",
  "Input rows: category,subtotal,refund[,return_label] -- one per order; refund is 0 or blank when kept.",
  "--margin: profit % of merchandise before shipping and fees (default 40). --resale: % of returned goods you can sell again (default 85).",
  "--out-ship: what you paid to ship an order out (default 7). --return-label: default label cost when a row has none (default 6). --handling: cost to receive a return (default 2).",
  "--deterrence: returns a fee prevents per 10% of the order it costs, as a multiple of 10% (default 1). --drag: % of buyers who do not check out when a fee is shown (default 3).",
  "--days: days of orders the file covers, to annualise (default 30). Exit 1 on an error finding (or a warning with --fail-on warn); 2 on bad input.",
  "Deterrence and checkout drop-off are assumptions, not measurements. No network call.",
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
  if (n.resale !== undefined && n.resale > 100) return { exitCode: 2, output: "--resale takes a percentage from 0 to 100." };
  if (n.drag !== undefined && n.drag > 30) return { exitCode: 2, output: "--drag takes a percentage from 0 to 30." };
  if (n.days !== undefined && n.days < 1) return { exitCode: 2, output: "--days takes a number of days, 1 or more." };

  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const opts = {};
  for (const [k, v] of Object.entries(n)) opts[k] = PERCENT.has(k) ? v / 100 : v;
  const report = analyze(parseOrders(text), opts);
  const summary = summarize(report);
  if (!report.count) return { exitCode: 2, output: summary.text };
  const exitCode = summary.errors > 0 || (args.failOn === "warn" && summary.warns > 0) ? 1 : 0;
  if (args.json) return { exitCode, output: JSON.stringify({ summary, note: MODEL_NOTE, totals: report.totals, categories: report.categories, best: report.best, robust: report.robust, policies: report.table, findings: report.findings }, null, 2) };

  const money = (x) => (x < 0 ? "-" : "") + "$" + Math.abs(x).toFixed(2);
  const lines = [summary.text, "", "By category (worst first):"];
  for (const c of report.categories) lines.push(`  ${c.cat.padEnd(16)} ${String(c.orders).padStart(5)} orders  return rate ${(c.rate * 100).toFixed(0).padStart(3)}%  returns cost ${money(c.cost).padStart(10)}  margin ${(c.marginBefore * 100).toFixed(0)}% -> ${(c.margin * 100).toFixed(0)}%`);
  lines.push("", `Expected profit change vs free returns on these ${report.count} orders (deterrence ${report.options.deterrence}x, ${Math.round(report.options.drag * 100)}% checkout drop-off when a fee is shown):`);
  const fmtBE = (b) => (b.kind === "always" ? "pays at any drop-off" : b.kind === "never" ? "does not pay" : `pays if drop-off <= ${(b.drag * 100).toFixed(1)}%`);
  for (const t of report.table) {
    const mark = t === report.best ? " <- best" : t === report.robust ? " <- safest" : "";
    lines.push(`  ${t.label.padEnd(20)} ${money(t.gain).padStart(10)}  ${fmtBE(t.breakEven)}${mark}`);
  }
  if (report.skipped) lines.push("", `${report.skipped} line(s) skipped (not parseable).`);
  lines.push("", "Findings:");
  for (const f of report.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n        ${f.message}`);
  lines.push("", `${MODEL_NOTE}. Try a policy change for a few weeks and compare conversion and return rate before keeping it.`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
