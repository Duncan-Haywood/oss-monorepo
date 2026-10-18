#!/usr/bin/env node
// Zero-dependency CLI: read the items in a CSA box, price a share, and print
// the season, the price that pays your target wage, and a price sweep.
// No network call -- local file/stdin only.
//
//   node cli.mjs price box.csv --weeks 20 --shares 60 --price 500
//   cat box.csv | node cli.mjs price - --json

import fs from "node:fs/promises";
import { parseLines, plan, summarize, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--weeks": "seasonWeeks", "--shares": "shares", "--price": "price", "--fee": "feePct", "--packaging": "packaging", "--delivery": "delivery",
  "--pack-minutes": "packMinutes", "--rate": "hourlyRate", "--fixed": "fixedCosts", "--capacity": "capacity", "--elasticity": "elasticity", "--wage": "targetWage",
};

function parseArgs(argv) {
  const args = { json: false, positional: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (FLAGS[a]) args.opts[a] = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs price <box.csv|-> [--weeks 20] [--shares 60] [--price 500] [--fee 3] [--packaging 1.5] [--delivery 0.8]",
  "                     [--pack-minutes 6] [--rate 20] [--fixed 1500] [--capacity 120] [--elasticity 1.2] [--wage 20] [--json]",
  "",
  "Rows: item,qty_per_box,value_each,cost_each,minutes_each,weeks[,note]",
  "--weeks       season length in weeks (default 20)       --shares   shares you sell (default 60)",
  "--price       full-season price of one share (default 500)   --fee  payment fee percent (default 3)",
  "--packaging   per box per share, dollars (default 1.5)   --delivery per box per share, dollars (default 0.8)",
  "--pack-minutes minutes per box to wash and pack (default 8)   --rate your hourly pay, dollars (default 20)",
  "--fixed       season costs that do not scale with shares (default 6000)   --capacity most shares you can serve (default 120)",
  "--elasticity  sign-up reaction to price for the sweep, 0 turns it off (default 1.2)   --wage target hourly wage for the price check (default 20)",
  "Exit 2 on bad input. Numbers are the ones you supply, not a forecast. No network call.",
].join("\n");

function bad(msg) {
  return { exitCode: 2, output: `${msg}\n\n${USAGE}` };
}

export async function run(argv, io = { readFile: (p) => fs.readFile(p, "utf8") }) {
  const args = parseArgs(argv);
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "price") return bad(args.sub ? `Unknown command ${args.sub}` : "Missing command");
  const file = args.positional[0];
  if (!file) return bad("Missing box file (use - for stdin)");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (!(v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0)) return bad(`${flag} needs a number, zero or more`);
    opts[FLAGS[flag]] = v;
  }
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseLines(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.items.length) return bad("No item rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const o = p.options;
  const lines = [summarize(p).text, ""];
  lines.push(`Per share: retail ${money(p.perShare.retail)}, item cost ${money(p.perShare.itemCost)}, box costs ${money(p.perShare.boxCosts)}, ${p.perShare.hours.toFixed(1)} hours`);
  lines.push(`Price that pays ${money(o.targetWage)} an hour at ${o.shares} shares: ${money(p.wagePrice)}`);
  lines.push(`Shares to break even after your pay at ${money(o.price)}: ${p.breakEvenShares === null ? "never (each share loses money)" : Math.ceil(p.breakEvenShares)}`);
  lines.push("", "Items, least worthwhile first (value - cost - your time):");
  for (const l of p.lines) lines.push(`  ${l.net < 0 ? "-" : "+"} ${l.name}  ${money(l.net)}  (retail ${money(l.retail)}, ${l.hours.toFixed(1)} h)`);
  if (o.elasticity > 0) {
    lines.push("", `Price sweep (elasticity ${o.elasticity}):`);
    for (const r of p.sweep.rows.filter((_, i) => i % 2 === 0)) lines.push(`  ${money(r.price)}  ${r.members} shares  ${money(r.afterPay)} after your pay`);
  }
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  lines.push("", MODEL_NOTE);
  return { exitCode: 0, output: lines.join("\n") };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run(process.argv.slice(2)).then(({ exitCode, output }) => {
    (exitCode ? console.error : console.log)(output);
    process.exitCode = exitCode;
  });
}
