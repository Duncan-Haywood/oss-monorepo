#!/usr/bin/env node
// Zero-dependency CLI: estimate a monthly Supabase bill from a `product,usage`
// CSV and rank the levers that cut it most. No network call -- reads a local
// file or stdin.
//
//   node cli.mjs template > usage.csv
//   node cli.mjs estimate usage.csv
//   cat usage.csv | node cli.mjs estimate - --budget 500      # CI gate: exit 1 over budget
//   node cli.mjs estimate usage.csv --set egress_gb=2000 --json
//   node cli.mjs estimate usage.csv --prices prices.json --assume assumptions.json

import fs from "node:fs/promises";
import { parseUsageCsv, estimateBill, rankLevers, summarize, fmt, CSV_TEMPLATE, DEFAULT_PRICES, DEFAULT_ASSUMPTIONS, PRICES_AS_OF } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, positional: [], budget: null, top: 10, sets: [] };
  const num = (v) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : NaN; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--prices") args.prices = argv[++i];
    else if (a === "--assume") args.assume = argv[++i];
    else if (a === "--set") args.sets.push(argv[++i]);
    else if (a === "--budget") args.budget = num(argv[++i]);
    else if (a === "--top") args.top = num(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs template                      print a product,usage CSV to fill in",
  "  node cli.mjs estimate <usage.csv|->        [--budget USD] [--top N] [--json]",
  "                        [--set product=value]... [--prices file.json] [--assume file.json]",
  "",
  "Estimates a monthly Supabase Pro bill from the usage you give (organizations, compute, database disk, egress,",
  "storage, monthly active users, Edge Function and Realtime usage) at editable list prices,",
  "then ranks the changes that cut it most with a dollar saving each. Levers overlap, so",
  "savings are not additive. Exit 1 when --budget (monthly USD) is exceeded; 2 on bad input.",
  "Arithmetic on your inputs, not a bill reader and not a guarantee. No network call.",
].join("\n");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), stdin = readStdin } = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: USAGE };
  if (args.sub === "template") return { exitCode: 0, output: CSV_TEMPLATE };
  if (args.sub !== "estimate") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}. Try --help.` };
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs estimate <usage.csv|->" };
  if (!Number.isFinite(args.top)) return { exitCode: 2, output: "--top needs a non-negative number." };
  if (args.budget !== null && !Number.isFinite(args.budget)) return { exitCode: 2, output: "--budget needs a non-negative number (monthly USD)." };

  let prices = DEFAULT_PRICES;
  let assumptions = DEFAULT_ASSUMPTIONS;
  for (const [flag, file] of [["--prices", args.prices], ["--assume", args.assume]]) {
    if (file === undefined) continue;
    try {
      const parsed = JSON.parse(await readFile(file));
      if (flag === "--prices") prices = { ...DEFAULT_PRICES, ...parsed }; else assumptions = { ...DEFAULT_ASSUMPTIONS, ...parsed };
    } catch (err) { return { exitCode: 2, output: `Cannot read ${flag} file ${file}: ${err.message}` }; }
  }
  const src = args.positional[0];
  let text;
  try { text = src === "-" ? await stdin() : await readFile(src); } catch (err) { return { exitCode: 2, output: `cannot read ${src}: ${err.message}` }; }

  const parsed = parseUsageCsv([text, ...args.sets].join("\n"));
  if (parsed.errors.length) return { exitCode: 2, output: `Cannot use the usage input:\n  ${parsed.errors.join("\n  ")}` };

  const estimate = estimateBill(parsed.usage, prices);
  const levers = rankLevers(estimate.usage, prices, assumptions).slice(0, args.top);
  const summary = summarize(estimate, levers, { budget: args.budget });
  const exitCode = summary.errors > 0 ? 1 : 0;

  if (args.json) {
    return { exitCode, output: JSON.stringify({ summary, estimate, levers, ignoredProducts: parsed.unknown, pricesAsOf: PRICES_AS_OF, note: "Levers overlap; savings are not additive." }, null, 2) };
  }
  const lines = [summary.text, "", "Estimated monthly bill by product:"];
  for (const i of estimate.items.filter((x) => x.monthly > 0)) lines.push(`  ${fmt(i.monthly).padStart(12)}  ${i.label}${i.note ? ` (${i.note})` : ""}`);
  if (estimate.credit > 0) lines.push(`  ${("-" + fmt(estimate.credit)).padStart(12)}  Extra usage credit (against usage lines, not the organization fee)`);
  lines.push(`  ${fmt(estimate.total).padStart(12)}  TOTAL`);
  if (levers.length) {
    lines.push("", "Levers that cut the bill most (each alone, under its assumption; not additive):");
    for (const l of levers) lines.push(`  -${fmt(l.saving).padStart(11)}/mo  ${l.title}  [${l.assumption}]`);
  }
  if (parsed.unknown.length) lines.push("", `Ignored unknown product(s): ${parsed.unknown.join(", ")}`);
  lines.push("", `Prices: ${PRICES_AS_OF}. Your inputs, editable prices -- an estimate, not a bill.`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
