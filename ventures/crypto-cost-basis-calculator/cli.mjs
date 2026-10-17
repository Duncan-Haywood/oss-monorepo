#!/usr/bin/env node
// Match crypto sales to purchase lots from exchange CSVs, in a terminal.
//
//   node cli.mjs coinbase.csv                       # FIFO summary for the latest sale year
//   node cli.mjs --method HIFO --year 2024 a.csv b.csv
//   node cli.mjs --form8949 8949.csv kraken.csv      # write Form 8949 style rows
//   node cli.mjs --json coinbase.csv                 # machine-readable
//   cat history.csv | node cli.mjs -                 # read stdin
//   node cli.mjs --example                           # built-in sample
//
// Zero dependencies, no network: files are read locally and nothing is sent.
// Same matching as the web page (calc.mjs) and the same exchange readers
// (importers.mjs), so the numbers agree with the page.

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { analyze, toForm8949Csv, form8949Totals, METHODS, METHOD_LABELS, SAMPLE_CSV } from "./calc.mjs";
import { convertMany, FORMAT_LABELS } from "./importers.mjs";

const USAGE = `Crypto cost basis from exchange CSVs: lot matching, method comparison, Form 8949 style rows.

Usage:
  node cli.mjs [options] <file.csv ...| ->

Options:
  --method <m>        FIFO (default), LIFO, HIFO, LOFO or TAXMIN
  --year <yyyy>       tax year of the sales (default: the latest year with a sale)
  --per-wallet        match each sale only against lots in the same wallet
  --short-rate <pct>  short-term rate for the tax estimate (default 24)
  --long-rate <pct>   long-term rate for the tax estimate (default 15)
  --form8949 <file>   also write Form 8949 style rows to this file
  --json              print the full analysis as JSON
  --example           use the built-in sample instead of a file
  -h, --help          this message

Reads Coinbase, Kraken, Binance.US, Crypto.com App, Gemini and Bitstamp exports or the
plain CSV (date,type,asset,quantity,total,fee,wallet). Several files are
merged. Arithmetic on the figures in your files, not tax advice: it fetches no
prices, and rows an export gives no USD value for are flagged, never zero.
`;

export function parseArgs(argv) {
  const opts = { files: [], method: "FIFO", year: null, perWallet: false, shortRate: 0.24, longRate: 0.15, form8949: null, json: false, example: false, help: false };
  const need = (i, arg) => { if (i >= argv.length) throw new Error(`${arg} needs a value`); return argv[i]; };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--example") opts.example = true;
    else if (arg === "--per-wallet") opts.perWallet = true;
    else if (arg === "--method") {
      const m = need(++i, arg).toUpperCase();
      if (!METHODS.includes(m)) throw new Error(`--method must be one of ${METHODS.join(", ")}`);
      opts.method = m;
    } else if (arg === "--year") {
      const y = Number(need(++i, arg));
      if (!Number.isInteger(y) || y < 2009 || y > 2100) throw new Error("--year needs a four-digit year");
      opts.year = y;
    } else if (arg === "--short-rate" || arg === "--long-rate") {
      const v = Number(need(++i, arg));
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`${arg} needs a percent between 0 and 100`);
      opts[arg === "--short-rate" ? "shortRate" : "longRate"] = v / 100;
    } else if (arg === "--form8949") opts.form8949 = need(++i, arg);
    else if (arg.startsWith("-") && arg !== "-") throw new Error(`unknown option: ${arg}`);
    else opts.files.push(arg);
  }
  return opts;
}

const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// files: [{ name, text }]. Returns { result, formats, notes, csv, error }.
export function run(files, opts = {}) {
  const { formats, csv, notes } = convertMany(files);
  const result = analyze(csv, { method: opts.method || "FIFO", year: opts.year ?? null, perWallet: !!opts.perWallet, shortRate: opts.shortRate ?? 0.24, longRate: opts.longRate ?? 0.15 });
  const error = result.errors.length && result.rows.length === 0 ? result.errors.join("; ") : null;
  return { result, formats, notes, csv, error };
}

export function render({ result, formats, notes }, opts = {}) {
  const out = [];
  out.push(`Read ${result.count} transactions (${[...new Set(formats)].map((f) => FORMAT_LABELS[f] || f).join(", ")}).`);
  for (const n of notes) out.push(`  note: ${n}`);
  for (const e of result.errors) out.push(`  problem: ${e}`);
  for (const s of result.skipped || []) out.push(`  skipped: ${typeof s === "string" ? s : JSON.stringify(s)}`);
  if (result.year === null) { out.push("No sales found, so there is nothing to match."); return out.join("\n") + "\n"; }
  const s = result.summary, t = totalsLine(result);
  out.push("", `Sales in ${result.year}, ${METHOD_LABELS[result.method]}${opts.perWallet ? ", per wallet" : ""}`);
  out.push(`  short-term ${usd(s.shortGain)}   long-term ${usd(s.longGain)}   total ${usd(s.totalGain)}   income received ${usd(result.income)}`);
  out.push(`  estimated tax ${usd(result.tax)} at ${(opts.shortRate ?? 0.24) * 100}% short / ${(opts.longRate ?? 0.15) * 100}% long`);
  if (t) out.push(`  ${t}`);
  out.push("", "Method comparison (same sales):");
  for (const c of result.comparison) out.push(`  ${c.label.padEnd(24)} gain ${usd(c.totalGain).padStart(14)}   tax ${usd(c.tax).padStart(12)}${c.method === result.bestMethod ? "   <- lowest estimated tax" : ""}`);
  if (result.holdings.length) {
    out.push("", "Still held:");
    for (const h of result.holdings) out.push(`  ${h.asset.padEnd(8)} ${String(h.qty).padStart(14)}   basis ${usd(h.basis)}`);
  }
  for (const w of result.warnings) out.push("", `warning: ${w}`);
  return out.join("\n") + "\n";
}

function totalsLine(result) {
  const f = form8949Totals(result.rows);
  return f.total.noBasis ? `${f.total.noBasis} row(s) have no purchase on record (zero basis); fix before filing.` : "";
}

async function readInput(name) {
  if (name === "-") {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return { name: "stdin", text: Buffer.concat(chunks).toString("utf8") };
  }
  return { name, text: await readFile(name, "utf8") };
}

export async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { process.stderr.write(`${e.message}\n\n${USAGE}`); return 2; }
  if (opts.help || (!opts.files.length && !opts.example)) { process.stdout.write(USAGE); return opts.help ? 0 : 2; }
  let files;
  try { files = opts.example ? [{ name: "example", text: SAMPLE_CSV }] : await Promise.all(opts.files.map(readInput)); }
  catch (e) { process.stderr.write(`cannot read input: ${e.message}\n`); return 2; }
  const r = run(files, opts);
  if (r.error) { process.stderr.write(`${r.error}\n`); return 1; }
  if (opts.form8949) await writeFile(opts.form8949, toForm8949Csv(r.result.rows));
  process.stdout.write(opts.json ? JSON.stringify(r.result, null, 2) + "\n" : render(r, opts));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
