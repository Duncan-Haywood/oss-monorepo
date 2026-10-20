#!/usr/bin/env node
// UK crypto capital gains in a terminal: same-day, 30-day and Section 104 pool matching.
//
//   node cli.mjs history.csv                         # every tax year in the file
//   node cli.mjs --year 2024-25 --income 45000 a.csv b.csv
//   node cli.mjs --disposals-csv working.csv history.csv
//   cat history.csv | node cli.mjs -                 # read stdin
//   node cli.mjs --example                           # built-in sample
//
// Zero dependencies, no network. Same engine as the web page (calc.mjs).

import { readFile, writeFile } from "node:fs/promises";
import { parseTransactions, overview, toDisposalsCsv, fmtQty, round2, SAMPLE_CSV, TAX_YEARS } from "./calc.mjs";

const USAGE = `UK crypto capital gains from a CSV: HMRC same-day, 30-day and Section 104 pool matching.

Usage:
  node cli.mjs [options] <file.csv ...| ->

CSV columns: date, type (buy|sell|income|swap|donate), asset, quantity, GBP value,
optional fee (GBP), and for swaps "to asset" and "to quantity".

Options:
  --year <yyyy-yy>        show one tax year, e.g. 2024-25
  --income <gbp>          your taxable income after the personal allowance (decides the 10/18% or 20/24% rate)
  --losses <gbp>          unused capital losses brought forward from before the file starts
  --disposals-csv <file>  write every disposal with the rule that matched it
  --json                  machine-readable output
  --example               run on the built-in sample
  -h, --help              this text

Arithmetic on the figures you supply. Not tax advice; check HMRC guidance or ask an adviser.
`;

export function parseArgs(argv) {
  const o = { files: [], json: false, example: false, help: false };
  const val = (i, name) => {
    if (i + 1 >= argv.length) throw new Error(`${name} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--example") o.example = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--year") {
      o.year = val(i++, a);
      if (!/^\d{4}-\d{2}$/.test(o.year)) throw new Error("--year must look like 2024-25");
    } else if (a === "--income" || a === "--losses") {
      const n = Number(val(i++, a));
      if (!(n >= 0)) throw new Error(`${a} must be a number of pounds, zero or more`);
      o[a.slice(2)] = n;
    } else if (a === "--disposals-csv") o.disposalsCsv = val(i++, a);
    else if (a === "-" || !a.startsWith("-")) o.files.push(a);
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

const gbp = (n) => `${n < 0 ? "-" : ""}£${Math.abs(round2(n)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function render(result, year) {
  const out = [];
  const shown = result.summaries.filter((s) => !year || s.year === year);
  if (!shown.length) out.push(year ? `No disposals or income in ${year}.` : "No disposals found.");
  for (const s of shown) {
    out.push(`Tax year ${s.year}`);
    out.push(`  Disposals ${s.disposalCount}   proceeds ${gbp(s.proceeds)}   allowable cost ${gbp(s.cost)}`);
    out.push(`  Gains ${gbp(s.gains)}   losses ${gbp(s.losses)}   net ${gbp(s.net)}`);
    if (s.estimate) {
      const e = s.estimate;
      out.push(`  Exempt amount ${gbp(e.aea)} (used ${gbp(e.aeaUsed)})   losses b/f used ${gbp(e.bfUsed)}   taxable ${gbp(e.taxable)}`);
      out.push(`  Estimated CGT ${gbp(e.tax)}${e.assumedIncome ? " (no income given: assumes the whole basic-rate band is free)" : ""}   losses carried forward ${gbp(e.lossCarried)}`);
    }
    for (const d of result.disposals.filter((x) => x.taxYear === s.year)) {
      out.push(`    ${d.date} ${d.asset} ${fmtQty(d.quantity)} ${d.rule}${d.matchedWith ? ` (${d.matchedWith})` : ""}: proceeds ${gbp(d.proceeds)}, cost ${gbp(d.cost)}, ${d.gain < 0 ? "loss" : "gain"} ${gbp(Math.abs(d.gain))}`);
    }
    out.push("");
  }
  const pools = Object.entries(result.pools);
  if (pools.length) {
    out.push("Section 104 pools now:");
    for (const [a, p] of pools) out.push(`  ${a} ${fmtQty(p.quantity)} units, allowable cost ${gbp(p.cost)}`);
  }
  for (const w of result.warnings) out.push(`Warning: ${w}`);
  return out.join("\n");
}

export async function run(argv, io = {}) {
  const o = parseArgs(argv);
  if (o.help) return { code: 0, text: USAGE };
  const texts = [];
  if (o.example) texts.push(SAMPLE_CSV);
  for (const f of o.files) texts.push(f === "-" ? await (io.stdin ?? readStdin)() : await readFile(f, "utf8"));
  if (!texts.length) return { code: 2, text: USAGE };
  if (o.year && !TAX_YEARS[o.year]) return { code: 2, text: `Rates for ${o.year} are not built in. Known years: ${Object.keys(TAX_YEARS).join(", ")}.` };

  const warnings = [];
  const transactions = [];
  for (const t of texts) {
    const r = parseTransactions(t);
    warnings.push(...r.warnings);
    transactions.push(...r.transactions);
  }
  if (!transactions.length) return { code: 1, text: ["No transactions could be read.", ...warnings].join("\n") };
  const result = overview(transactions, { income: o.income, lossesBroughtForward: o.losses });
  result.warnings.push(...warnings);
  if (o.disposalsCsv) await writeFile(o.disposalsCsv, toDisposalsCsv(result.disposals));
  if (o.json) return { code: 0, text: JSON.stringify({ disposals: result.disposals, summaries: result.summaries, pools: result.pools, income: result.income, warnings: result.warnings }, null, 2) };
  return { code: 0, text: render(result, o.year) };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { code, text } = await run(process.argv.slice(2));
    (code === 0 ? process.stdout : process.stderr).write(text.endsWith("\n") ? text : text + "\n");
    process.exitCode = code;
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}
