#!/usr/bin/env node
// Predicted customer lifetime value from an order export, in a terminal.
//
//   node cli.mjs orders.csv                        # summary, findings, top customers
//   node cli.mjs --horizon 24 --margin 40 orders.csv
//   node cli.mjs --csv orders.csv > clv.csv        # one row per customer, for a spreadsheet or a CRM import
//   node cli.mjs --json orders.csv                 # machine-readable
//   node cli.mjs --segment "At risk, high spend" orders.csv   # only that segment's customers
//   cat orders.csv | node cli.mjs -                # read stdin
//   node cli.mjs --example                         # run on the built-in synthetic data
//
// Zero dependencies, no network: the file is read locally and nothing is sent.
// Same BG/NBD + Gamma-Gamma analysis as the web page (calc.mjs). The --csv form
// is the one to run after each month's export to refresh a win-back list.

import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseOrders, analyze, paybackCurve, reportCsv, sampleText, money, pct, dayToIso } from "./calc.mjs";

const USAGE = `Predicted customer lifetime value from an order export (customer, date, amount).

Usage:
  node cli.mjs [options] <file.csv | ->

Options:
  --horizon <months>   value horizon, 1 to 60 (default 12)
  --margin <pct>       gross margin applied to revenue, 1 to 100 (default 100)
  --discount <pct>     annual discount rate, 0 to 99 (default 10)
  --cac <amount>       what you pay to acquire a customer: adds payback month and
                       the value-to-cost ratio for a new customer
  --top <n>            customers to list in the text report (default 10)
  --segment <name>     keep only one segment: "Top 20% value", "Active",
                       "At risk, high spend" or "Likely lost" (--csv and --json too)
  --csv                print one row per customer as CSV
  --json               print the full analysis as JSON
  --example            use the built-in synthetic data instead of a file
  -h, --help           this message

The model: BG/NBD for how often each customer buys and whether they have
stopped, Gamma-Gamma for how much they spend. Needs 30+ customers and 10+
repeat buyers. Estimates, not financial advice.
`;

const SEGMENTS = ["Top 20% value", "Active", "At risk, high spend", "Likely lost"];

export function parseArgs(argv) {
  const opts = { file: null, horizon: 12, margin: 100, discount: 10, top: 10, cac: null, segment: null, csv: false, json: false, example: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--csv") opts.csv = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--example") opts.example = true;
    else if (arg === "--segment") {
      const v = argv[++i];
      const match = SEGMENTS.find((s) => s.toLowerCase() === String(v ?? "").toLowerCase());
      if (!match) throw new Error(`--segment must be one of: ${SEGMENTS.join("; ")}`);
      opts.segment = match;
    } else if (arg === "--horizon" || arg === "--margin" || arg === "--discount" || arg === "--top" || arg === "--cac") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`${arg} needs a non-negative number`);
      opts[arg.slice(2)] = arg === "--top" ? Math.max(1, Math.floor(v)) : v;
    } else if (arg.startsWith("-") && arg !== "-") throw new Error(`unknown option: ${arg}`);
    else opts.file = arg;
  }
  if (opts.csv && opts.json) throw new Error("choose one of --csv and --json");
  return opts;
}

export function run(text, opts = {}) {
  const parsed = parseOrders(text);
  if (parsed.error) return { error: parsed.error };
  const res = analyze(parsed.orders, {
    horizonMonths: opts.horizon ?? 12,
    margin: (opts.margin ?? 100) / 100,
    annualDiscount: (opts.discount ?? 10) / 100,
  });
  if (res.error) return { error: res.error };
  if (opts.segment) {
    res.sorted = res.sorted.filter((c) => c.segment === opts.segment);
    res.customers = res.customers.filter((c) => c.segment === opts.segment);
  }
  return { result: res, parsed };
}

export function render(res, parsed, opts = {}) {
  const s = res.summary, out = [];
  out.push(`Customer lifetime value   ${dayToIso(s.firstDay)} to ${dayToIso(s.lastDay)}`, "=".repeat(64), "");
  out.push(`  Customers           ${s.customers}   (${pct(s.repeatShare)} bought more than once, ${s.orders} orders)`);
  out.push(`  Historic revenue    ${money(s.historicRevenue)}`);
  out.push(`  Predicted value     ${money(s.totalClv)} over ${s.horizonMonths} months   (avg ${money(s.avgClv)} per customer)`);
  out.push(`  Top 20% share       ${pct(s.topShare, 0)} of predicted value`);
  out.push(`  Still active        about ${Math.round(s.expectedActive)} of ${s.customers} customers`);
  out.push(`  New customer        ${money(res.newCustomer.value)} over ${s.horizonMonths} months: the ceiling on what to pay to acquire one`, "");
  if (opts.cac > 0) {
    const pb = paybackCurve(res, opts.cac);
    out.push(`  Acquisition         ${money(pb.cac)} paid pays back ${pb.verdict}; ${pb.ltvToCac.toFixed(1)}:1 over ${pb.horizonMonths} months; up to ${money(pb.maxCacForTarget)} for ${pb.target}:1`, "");
  }
  out.push("Segments", "-".repeat(64));
  for (const name of SEGMENTS) {
    const g = res.segments[name];
    if (g) out.push(`  ${name.padEnd(22)} ${String(g.customers).padStart(6)} customers  ${money(g.clv).padStart(12)} predicted`);
  }
  out.push("", "Findings", "-".repeat(64));
  for (const f of res.findings) out.push(`  [${f.severity.toUpperCase()}] ${f.title}`, `      ${f.detail}`);
  const top = res.sorted.slice(0, opts.top ?? 10);
  out.push("", `${opts.segment ? opts.segment + ": " : ""}Top ${top.length} by predicted value`, "-".repeat(64));
  out.push("Customer".padEnd(28) + "Repeat  Active  Predicted  Segment");
  for (const c of top) {
    out.push(String(c.id).slice(0, 26).padEnd(28) + String(c.x).padStart(6) + pct(c.pAlive, 0).padStart(8) + money(c.clv).padStart(11) + "  " + c.segment);
  }
  if (parsed.skipped || parsed.refunds) out.push("", `Skipped ${parsed.skipped} unreadable row(s); ${parsed.refunds} refund or zero row(s) dropped.`);
  out.push("", "Estimates from the dates and amounts in your file; not financial advice.");
  return out.join("\n");
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(e.message); return 2; }
  if (opts.help || (!opts.file && !opts.example)) { console.log(USAGE); return opts.help ? 0 : 2; }
  let text;
  try { text = opts.example ? sampleText() : opts.file === "-" ? await readStdin() : await readFile(opts.file, "utf8"); }
  catch (e) { console.error(`cannot read ${opts.file}: ${e.message}`); return 2; }
  const { result, parsed, error } = run(text, opts);
  if (error) { console.error(error); return 2; }
  if (opts.csv) process.stdout.write(reportCsv(result));
  else if (opts.json) {
    console.log(JSON.stringify({ summary: result.summary, params: result.params, newCustomer: result.newCustomer, segments: result.segments, backtest: result.backtest, findings: result.findings, customers: result.sorted }, null, 2));
  } else console.log(render(result, parsed, opts));
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = await main(process.argv.slice(2));
}
