#!/usr/bin/env node
// Zero-dependency CLI: read a list of thrift/estate-sale/liquidation finds with
// your own resale and sell-through estimates, print which to buy, the most to
// pay for each, and the downside. No network call -- local files/stdin only.
//
//   node cli.mjs pick haul.csv --budget 80 --max-hours 2
//   cat haul.csv | node cli.mjs pick - --fee 13 --hourly 20 --json

import fs from "node:fs/promises";
import { parseItems, plan, summarize, money, pct, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--fee": "feePct", "--fixed": "fixedFee", "--ship": "shipDefault", "--supplies": "suppliesPerItem",
  "--minutes": "minutesDefault", "--hourly": "hourlyValue", "--days": "daysDefault", "--rate": "annualRate",
  "--unsold": "unsoldRecoveryPct", "--min-return": "minReturnPct", "--budget": "budget", "--max-items": "maxItems", "--max-hours": "maxHours",
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
  "  node cli.mjs pick <items.csv|-> [--fee 13] [--fixed 0.30] [--ship 6] [--supplies 0.50] [--minutes 20] [--hourly 15]",
  "                                  [--days 30] [--rate 20] [--unsold 30] [--min-return 0]",
  "                                  [--budget 80] [--max-items 10] [--max-hours 2] [--json]",
  "",
  "Rows: name,ask,resale,sell_chance[,ship,minutes,days,note]   (resale and sell_chance are YOUR estimates)",
  "--fee         marketplace fee percent on a sale (default 13)     --fixed   fixed fee per sale, dollars (default 0.30)",
  "--ship        default shipping per item, dollars (default 6)     --supplies packing supplies per item (default 0.50)",
  "--minutes     default hands-on minutes per item (default 20)     --hourly  what an hour of your time is worth (default 15)",
  "--days        default days cash is tied up (default 30)          --rate    annual cost of capital percent (default 20)",
  "--unsold      percent of resale recovered if it does not sell (default 30)",
  "--min-return  least profit per dollar paid, percent (default 0)",
  "--budget / --max-items / --max-hours   caps; blank = no cap",
  `Up to 120 items. ${MODEL_NOTE}`,
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "pick") return bad("Expected the pick command");
  const file = args.positional[0];
  if (!file) return bad("Give an items file, or - for stdin");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined || v === "") return bad(`${flag} needs a value`);
    opts[FLAGS[flag]] = v;
  }
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseItems(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.items.length) return bad("No item rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, "", "Buy (best first):"];
  p.buy.forEach((e, i) => {
    lines.push(`  ${i + 1}. ${e.name}  pay up to ${money(e.maxAsk)} (asking ${money(e.ask)})  expected profit ${money(e.profit)} (${pct(e.ret, 0)} on cash)`);
    const be = e.breakEven.status === "always" ? "profitable even if it never sells" : e.breakEven.status === "never" ? "not reachable" : `breaks even at a ${pct(e.breakEven.p)} sell chance (you said ${pct(e.p)})`;
    lines.push(`     ${be}; ${pct(e.pLoss, 0)} chance of a loss; worst case ${money(e.worst)}`);
  });
  if (!p.buy.length) lines.push("  (none)");
  lines.push("", "Pass:");
  for (const h of p.pass) lines.push(`  - ${h.name}: ${h.reason}; most worth paying ${money(h.maxAsk)} (asking ${money(h.ask)})`);
  if (!p.pass.length) lines.push("  (none)");
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  lines.push("", `Plan: spend ${money(p.spend)}, ${p.hours.toFixed(1)} hands-on hours, expected profit ${money(p.profit)}`);
  for (const b of p.baselines) lines.push(`  ${b.label}: ${b.items} items, spend ${money(b.spend)}, expected ${money(b.profit)}`);
  lines.push(MODEL_NOTE);
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
