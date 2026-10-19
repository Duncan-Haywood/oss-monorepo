#!/usr/bin/env node
// S corporation basis roll-forward from a file, in a terminal.
//
//   node cli.mjs years.csv                       # one shareholder: basis by year, flags
//   node cli.mjs --opening 20000,0,0,0 years.csv # opening stock, debt basis, loan face, suspended loss
//   node cli.mjs --k1 k1.txt                     # lines like "2024: 1=90000, 16D=60000" (K-1 box numbers)
//   node cli.mjs --batch clients.csv             # many shareholders: summary, needs-attention first
//   node cli.mjs --csv years.csv > basis.csv     # year-by-year CSV (with --batch: one CSV for everyone)
//   node cli.mjs --html years.csv > worksheet.html   # printable worksheet (with --batch: one packet)
//   node cli.mjs --json years.csv                # machine-readable
//   node cli.mjs --example                       # run on the built-in invented figures
//
// Same roll-forward as the web page (calc.mjs). Zero dependencies, no network: the
// figures never leave the machine. An organising aid, not tax or legal advice.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {
  parseYears, parseMoney, run, fmt, csv, packetHtml, plan, fromK1Boxes, SAMPLE,
  runBatch, batchSummary, batchCsv, batchPacketHtml, BATCH_SAMPLE,
} from "./calc.mjs";

const USAGE = `Roll S corporation stock basis, debt basis and suspended losses forward in Form 7203 order.

Usage:
  node cli.mjs [options] <years.csv | ->

Input: a table with the columns year, contributions, loansMade, loansRepaid,
income, taxExempt, distributions, nondeductible, losses (header optional), or
with --k1 one line per year in K-1 box numbers ("2024: 1=90000, 16D=60000").
With --batch, a shareholder column comes first and an "opening" row may set
starting figures.

Options:
  --opening <a,b,c,d>  opening stock basis, debt basis, loan face, suspended loss (default 0,0,0,0; no thousands commas, 5k is fine)
  --k1                 read K-1 box lines instead of the column table
  --batch              many shareholders in one file; prints who needs attention first
  --csv                print the year-by-year table as CSV
  --html               print a self-contained printable worksheet
  --json               print the full result as JSON
  --example            use the built-in invented figures instead of a file
  -h, --help           this message

Not tax or legal advice. At-risk and passive-activity limits, excess business
loss, QBI, other adjustments account, E&P and stock sales are not modelled.
Check every figure against the K-1 and the Form 7203 instructions.
`;

export function parseArgs(argv) {
  const o = { file: null, opening: null, k1: false, batch: false, csv: false, html: false, json: false, example: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--k1") o.k1 = true;
    else if (a === "--batch") o.batch = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--html") o.html = true;
    else if (a === "--json") o.json = true;
    else if (a === "--example") o.example = true;
    else if (a === "--opening") {
      const v = argv[++i];
      if (v === undefined) throw new Error("--opening needs four amounts, e.g. 20000,0,0,0");
      o.opening = parseOpening(v);
    } else if (a.startsWith("-") && a !== "-") throw new Error("unknown option " + a);
    else if (o.file === null) o.file = a;
    else throw new Error("one input file only");
  }
  if ([o.csv, o.html, o.json].filter(Boolean).length > 1) throw new Error("choose one of --csv, --html, --json");
  if (o.batch && (o.k1 || o.opening)) throw new Error("--batch reads openings from \"opening\" rows; drop --k1 and --opening");
  return o;
}

export function parseOpening(text) {
  const cells = String(text).split(",");
  if (cells.length > 4) throw new Error("--opening takes at most four amounts");
  const [stock, debtBasis, debtFace, suspended] = [0, 1, 2, 3].map((k) => parseMoney(cells[k] ?? ""));
  const vals = { stock, debtBasis, debtFace, suspended };
  for (const [k, v] of Object.entries(vals)) if (Number.isNaN(v) || v < 0) throw new Error("--opening " + k + " must be an amount of zero or more");
  return vals;
}

function single(opts, text) {
  const errors = [];
  let years;
  if (opts.k1) { const k = fromK1Boxes(text); errors.push(...k.errors); years = parseYears(k.text).years; }
  else { const p = parseYears(text); years = p.years; errors.push(...p.errors); }
  if (!years.length && !errors.length) errors.push("no year rows found.");
  const result = years.length ? run(opts.opening || {}, years) : null;
  return { result, errors: [...errors, ...(result ? result.problems : [])] };
}

function table(result) {
  const head = ["year", "stock basis", "debt basis", "taxable excess dist.", "loan repay gain", "suspended loss"];
  const rows = result.rows.map((r) => [String(r.year), fmt(r.close.stock), fmt(r.close.debtBasis), fmt(r.lines.excessDistributions), fmt(r.lines.repaymentGain), fmt(r.close.suspended)]);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (c) => c.map((x, i) => (i === 0 ? x.padEnd(w[i]) : x.padStart(w[i]))).join("  ");
  return [line(head), ...rows.map(line)].join("\n");
}

export function render(opts, text) {
  if (opts.batch) {
    const batch = runBatch(text);
    const errors = batch.errors;
    if (opts.csv) return { out: batchCsv(batch), errors };
    if (opts.html) return { out: batchPacketHtml(batch), errors };
    const sum = batchSummary(batch);
    if (opts.json) return { out: JSON.stringify({ summary: sum, holders: batch.holders.map((h) => ({ name: h.name, rows: h.result ? h.result.rows : [] })), errors }, null, 2) + "\n", errors };
    const lines = sum.map((s) => `${s.name}: stock ${fmt(s.stock)}, debt ${fmt(s.debtBasis)}, suspended ${fmt(s.suspended)}, taxable excess ${fmt(s.excessDistributions)}${s.repaymentGain > 0 ? `, loan repayment gain ${fmt(s.repaymentGain)}` : ""}${s.flags.length ? "  <-- " + s.flags.join(", ") : ""}`);
    return { out: lines.join("\n") + "\n", errors };
  }
  const { result, errors } = single(opts, text);
  if (!result) return { out: "", errors };
  if (opts.csv) return { out: csv(result), errors };
  if (opts.html) return { out: packetHtml(result), errors };
  if (opts.json) return { out: JSON.stringify({ rows: result.rows, closing: result.closing, plan: plan(result), errors }, null, 2) + "\n", errors };
  const p = plan(result);
  const c = result.closing;
  const out = [
    table(result), "",
    `Closing: stock ${fmt(c.stock)}, debt basis ${fmt(c.debtBasis)}, loan face ${fmt(c.debtFace)}, suspended loss ${fmt(c.suspended)}`,
    `Largest ${p.year} distribution that is all return of basis, other figures as entered: ${fmt(p.maxTaxFreeDistribution)}`,
    ...p.advice,
  ].join("\n") + "\n";
  return { out, errors };
}

async function readInput(file) {
  if (file === "-") { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString("utf8"); }
  return readFile(file, "utf8");
}

export async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { process.stderr.write(e.message + "\n\n" + USAGE); return 2; }
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  let text;
  if (opts.example) text = opts.batch ? BATCH_SAMPLE : SAMPLE.text;
  else if (!opts.file) { process.stderr.write("give an input file, - for stdin, or --example\n\n" + USAGE); return 2; }
  else { try { text = await readInput(opts.file); } catch (e) { process.stderr.write("cannot read " + opts.file + ": " + e.message + "\n"); return 2; } }
  if (opts.example && !opts.batch && !opts.opening && !opts.k1) opts.opening = SAMPLE.opening;
  const { out, errors } = render(opts, text);
  if (errors.length) process.stderr.write(errors.join("\n") + "\n");
  process.stdout.write(out);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main(process.argv.slice(2));
