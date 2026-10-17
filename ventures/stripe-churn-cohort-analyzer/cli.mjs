#!/usr/bin/env node
// Churn, MRR and cohort retention from a Stripe subscriptions CSV, in a terminal.
//
//   node cli.mjs subscriptions.csv                 # summary, findings, last 6 months
//   node cli.mjs --cohorts subscriptions.csv       # add the cohort retention table
//   node cli.mjs --json subscriptions.csv          # machine-readable
//   node cli.mjs --max-churn 5 subscriptions.csv   # exit 1 if monthly logo churn > 5%
//   cat subscriptions.csv | node cli.mjs -         # read stdin
//   node cli.mjs --example                         # run on the built-in synthetic data
//
// Zero dependencies, no network: the file is read locally and nothing is sent.
// Same analysis as the web page (calc.mjs); the --max-churn form is the one to
// put in a monthly cron or CI job so a churn spike is noticed without opening
// a dashboard.

import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseCsv, normalizeRows, analyze, sampleCsv, money, pct } from "./calc.mjs";

const USAGE = `Churn, MRR and cohort retention from a Stripe subscriptions CSV export.

Usage:
  node cli.mjs [options] <file.csv | ->

Options:
  --months <n>        monthly rows to print (default 6)
  --cohorts           also print the cohort retention table
  --json              print the full analysis as JSON
  --max-churn <pct>   exit 1 if recent monthly logo churn exceeds this percent
  --example           use the built-in synthetic data instead of a file
  -h, --help          this message

The model: MRR per subscription is amount / interval in months x quantity,
held constant. Expansion, contraction, refunds and failed payments are not in
a subscription export and are not modelled. Estimates, not financial advice.
`;

export function parseArgs(argv) {
  const opts = { file: null, months: 6, cohorts: false, json: false, maxChurn: null, example: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--cohorts") opts.cohorts = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--example") opts.example = true;
    else if (arg === "--months" || arg === "--max-churn") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`${arg} needs a non-negative number`);
      if (arg === "--months") opts.months = Math.max(1, Math.floor(v));
      else opts.maxChurn = v;
    } else if (arg.startsWith("-") && arg !== "-") throw new Error(`unknown option: ${arg}`);
    else opts.file = arg;
  }
  return opts;
}

export function run(text, opts = {}) {
  const { subs, skipped, error } = normalizeRows(parseCsv(text));
  if (error) return { error, skipped };
  const result = analyze(subs);
  if (result.invalid) return { error: result.invalid, skipped };
  const over = opts.maxChurn != null && result.summary.logoChurn * 100 > opts.maxChurn;
  return { result, skipped, over };
}

export function render(result, skipped, opts = {}) {
  const s = result.summary, out = [];
  out.push(`Stripe churn and cohorts   ${s.firstMonth} to ${s.lastMonth}`, "=".repeat(60), "");
  out.push(`  MRR now             ${money(s.currentMrr)}   (${s.currentCustomers} subscriptions, ARPA ${money(s.arpa)})`);
  out.push(`  Logo churn / month  ${pct(s.logoChurn)}   (${s.windowLabel})`);
  out.push(`  Revenue churn       ${pct(s.revenueChurn)}`);
  out.push(`  Implied lifetime    ${s.lifetimeMonths ? s.lifetimeMonths.toFixed(1) + " months" : "n/a (no churn in window)"}`);
  out.push(`  Revenue LTV         ${s.revenueLtv ? money(s.revenueLtv) : "n/a"}`);
  out.push(`  Quick ratio         ${s.quickRatio ? s.quickRatio.toFixed(1) : "n/a"}`, "");
  out.push("Month      Start     New  Churned      End  Subs");
  for (const m of result.months.slice(-(opts.months ?? 6))) {
    out.push([m.key, money(m.startMrr).padStart(8), money(m.newMrr).padStart(7), money(m.churnedMrr).padStart(8), money(m.endMrr).padStart(8), String(m.endCustomers).padStart(5)].join("  "));
  }
  out.push("", "Findings", "-".repeat(60));
  for (const f of result.findings) out.push(`  [${f.severity.toUpperCase()}] ${f.title}`, `      ${f.detail}`);
  if (opts.cohorts) {
    out.push("", "Cohort logo retention (rows: start month, columns: months since)", "-".repeat(60));
    for (const c of result.cohorts) out.push(`${c.key}  n=${String(c.size).padStart(3)}  ` + c.logo.slice(0, 12).map((x) => String(Math.round(x * 100)).padStart(3)).join(" "));
  }
  if (skipped.length) {
    out.push("", `Skipped ${skipped.length} unreadable row(s)`, "-".repeat(60));
    for (const k of skipped.slice(0, 10)) out.push(`  line ${k.line}: ${k.reason}`);
  }
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
  try { text = opts.example ? sampleCsv() : opts.file === "-" ? await readStdin() : await readFile(opts.file, "utf8"); }
  catch (e) { console.error(`cannot read ${opts.file}: ${e.message}`); return 2; }
  const { result, skipped, error, over } = run(text, opts);
  if (error) { console.error(error); return 2; }
  console.log(opts.json ? JSON.stringify({ summary: result.summary, findings: result.findings, months: result.months, cohorts: result.cohorts, skipped }, null, 2) : render(result, skipped, opts));
  if (over) { console.error(`monthly logo churn ${pct(result.summary.logoChurn)} exceeds --max-churn ${opts.maxChurn}%`); return 1; }
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(await main(process.argv.slice(2)));
}
