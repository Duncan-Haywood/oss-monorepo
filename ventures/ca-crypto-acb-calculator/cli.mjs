#!/usr/bin/env node
// Canadian crypto capital gains in a terminal: average-cost ACB and the superficial loss rule.
//
//   node cli.mjs history.csv                         # every calendar year in the file
//   node cli.mjs --year 2024 --marginal-rate 0.43 a.csv b.csv
//   node cli.mjs --dispositions-csv working.csv history.csv
//   cat history.csv | node cli.mjs -                 # read stdin
//   node cli.mjs --example                           # built-in sample
//
// Zero dependencies, no network. Same engine as the web page (calc.mjs).

import { readFile, writeFile } from "node:fs/promises";
import { parseTransactions, overview, toDispositionsCsv, fmtQty, round2, SAMPLE_CSV, INCLUSION_RATE } from "./calc.mjs";

const USAGE = `Canadian crypto capital gains from a CSV: average-cost ACB and the superficial loss rule.

Usage:
  node cli.mjs [options] <file.csv ...| ->

CSV columns: date (YYYY-MM-DD), type (buy|sell|income|swap), asset, quantity, CAD value,
optional fee (CAD), and for swaps "to asset" and "to quantity".

Options:
  --year <yyyy>            show one calendar year
  --marginal-rate <0-1>    your combined federal + provincial rate on extra income, e.g. 0.43, for a tax estimate
  --losses <cad>           unused net capital losses carried in from before the file starts
  --inclusion-rate <0-1>   share of a gain that is taxable (default ${INCLUSION_RATE})
  --dispositions-csv <f>   write every disposition with its ACB and any superficial loss
  --json                   machine-readable output
  --example                run on the built-in sample
  -h, --help               this text

Arithmetic on the figures you supply. Not tax advice; check CRA guidance or ask an accountant.
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
      if (!/^\d{4}$/.test(o.year)) throw new Error("--year must look like 2024");
    } else if (a === "--marginal-rate" || a === "--inclusion-rate") {
      const n = Number(val(i++, a));
      if (!(n >= 0 && n <= 1)) throw new Error(`${a} must be a fraction from 0 to 1`);
      o[a === "--marginal-rate" ? "marginalRate" : "inclusionRate"] = n;
    } else if (a === "--losses") {
      const n = Number(val(i++, a));
      if (!(n >= 0)) throw new Error("--losses must be a number of dollars, zero or more");
      o.losses = n;
    } else if (a === "--dispositions-csv") o.dispositionsCsv = val(i++, a);
    else if (a === "-" || !a.startsWith("-")) o.files.push(a);
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

const cad = (n) => `${n < 0 ? "-" : ""}$${Math.abs(round2(n)).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function render(result, year) {
  const out = [];
  const shown = result.summaries.filter((s) => !year || s.year === year);
  if (!shown.length) out.push(year ? `No dispositions in ${year}.` : "No dispositions found.");
  for (const s of shown) {
    out.push(`Year ${s.year}`);
    out.push(`  Dispositions ${s.rows}   proceeds ${cad(s.proceeds)}   ACB ${cad(s.acb)}`);
    out.push(`  Gains ${cad(s.gains)}   losses claimed ${cad(s.losses)}   net ${cad(s.net)}   superficial losses denied ${cad(s.denied)}`);
    out.push(`  Taxable capital gain at ${round2(s.inclusionRate * 100)}%: ${cad(s.taxableGain)}   net capital losses used ${cad(s.bfUsed)}   taxable after losses ${cad(s.taxableAfterLosses)}`);
    out.push(`  Net capital losses carried forward ${cad(s.lossCarried)}${s.tax === null ? "" : `   estimated tax ${cad(s.tax)}`}`);
    for (const d of result.dispositions.filter((x) => x.taxYear === s.year)) {
      const sup = d.superficial ? `, superficial loss: ${cad(d.denied)} denied and added to ACB` : "";
      out.push(`    ${d.date} ${d.asset} ${fmtQty(d.quantity)}: proceeds ${cad(d.proceeds)}, ACB ${cad(d.acb)}, ${d.gain < 0 ? "loss" : "gain"} ${cad(Math.abs(d.gain))}${sup}`);
    }
    out.push("");
  }
  const pools = Object.entries(result.pools);
  if (pools.length) {
    out.push("Still held (ACB):");
    for (const [a, p] of pools) out.push(`  ${a} ${fmtQty(p.quantity)} units, ACB ${cad(p.cost)} (${cad(p.cost / p.quantity)} per unit)`);
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

  const warnings = [];
  const transactions = [];
  for (const t of texts) {
    const r = parseTransactions(t);
    warnings.push(...r.warnings);
    transactions.push(...r.transactions);
  }
  if (!transactions.length) return { code: 1, text: ["No transactions could be read.", ...warnings].join("\n") };
  const result = overview(transactions, { marginalRate: o.marginalRate, inclusionRate: o.inclusionRate, netCapitalLossesBroughtForward: o.losses });
  result.warnings.push(...warnings);
  if (o.dispositionsCsv) await writeFile(o.dispositionsCsv, toDispositionsCsv(result.dispositions));
  if (o.json) return { code: 0, text: JSON.stringify({ dispositions: result.dispositions, summaries: result.summaries, pools: result.pools, income: result.income, warnings: result.warnings }, null, 2) };
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
