#!/usr/bin/env node
// Zero-dependency CLI: read the lines of a bulk lot (estate, storage unit,
// liquidation pallet), compare a whole-lot offer with listing the items, and
// print which lines to list and which to sell on in bulk. No network call --
// local file/stdin only.
//
//   node cli.mjs split lot.csv --offer 260 --cost 150 --rate 15
//   cat lot.csv | node cli.mjs split - --json

import fs from "node:fs/promises";
import { parseLines, plan, summarize, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = { "--offer": "lotOffer", "--cost": "lotCost", "--fee": "feePct", "--remnant": "remnantPct", "--rate": "hourlyRate", "--downside": "downside" };

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
  "  node cli.mjs split <lot.csv|-> [--offer 260] [--cost 150] [--fee 13] [--remnant 20] [--rate 15] [--downside 80] [--json]",
  "",
  "Rows: item,qty,price,sell_through,shipping,minutes[,note]  (sell_through is a percent, minutes are per unit)",
  "--offer      the single price a buyer will pay for the whole lot (default 0 = no offer to compare)",
  "--cost       what you paid for the lot, for profit figures (default 0)",
  "--fee        marketplace + payment fee, percent of price (default 13)",
  "--remnant    percent of price that bulk-sold or unsold units fetch (default 20)",
  "--rate       what an hour of your time is worth, dollars (default 15)",
  "--downside   sell-through as a percent of your estimate for the stress check (default 80)",
  "Exit 2 on bad input. Numbers are the ones you supply, not a forecast. No network call.",
].join("\n");

function bad(msg) {
  return { exitCode: 2, output: `${msg}\n\n${USAGE}` };
}

export async function run(argv, io = { readFile: (p) => fs.readFile(p, "utf8") }) {
  const args = parseArgs(argv);
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "split") return bad(args.sub ? `Unknown command ${args.sub}` : "Missing command");
  const file = args.positional[0];
  if (!file) return bad("Missing lot file (use - for stdin)");
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
  const lines = [summarize(p).text, "", "List:"];
  const listed = p.lines.filter((l) => l.action === "list");
  const dumped = p.lines.filter((l) => l.action === "dump");
  for (const l of listed) lines.push(`  + ${l.name} x${l.qty}  ${money(l.value)}  (${l.hours.toFixed(1)} h)`);
  if (!listed.length) lines.push("  (none)");
  lines.push("", "Sell on in bulk:");
  for (const l of dumped) lines.push(`  - ${l.name} x${l.qty}  ${money(l.value)}  (listing would net ${money(l.list)})`);
  if (!dumped.length) lines.push("  (none)");
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  const t = p.totals;
  lines.push("", `Best mix ${money(t.bestMix)} | list everything ${money(t.allListed)} | whole-lot offer ${t.wholeLot === null ? "none" : money(t.wholeLot)} | best mix if sell-through hits ${p.options.downside}%: ${money(t.downsideMix)}`);
  if (p.profit) lines.push(`Profit on a ${money(p.options.lotCost)} lot: split ${money(p.profit.split)}${p.profit.whole === null ? "" : `, whole ${money(p.profit.whole)}`}`);
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
