#!/usr/bin/env node
// node cli.mjs logs.csv --offer 12000 [--per-mbf] [--rule doyle|scribner|international] [--price "red oak=420"]... [--fee 8] [--json]
// exit 1 when the offer is under 75% of the value at your prices
import { readFileSync } from "node:fs";
import { parseLogs, check, money, RULES } from "./calc.mjs";

const args = process.argv.slice(2);
const opts = { prices: {}, rule: "doyle", fee: 8, perMbf: false, json: false, offer: null, file: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--offer") opts.offer = Number(args[++i]);
  else if (a === "--rule") opts.rule = args[++i];
  else if (a === "--fee") opts.fee = Number(args[++i]);
  else if (a === "--per-mbf") opts.perMbf = true;
  else if (a === "--json") opts.json = true;
  else if (a === "--price") { const [k, v] = String(args[++i]).split("="); opts.prices[k.trim().toLowerCase()] = Number(v); }
  else if (!a.startsWith("--") && !opts.file) opts.file = a;
  else { console.error(`unknown option ${a}`); process.exit(2); }
}
if (!opts.file || !opts.offer) { console.error('usage: node cli.mjs logs.csv --offer <dollars> [--per-mbf] [--rule doyle|scribner|international] [--price "species=$/MBF"] [--fee 8] [--json]'); process.exit(2); }
if (!RULES[opts.rule]) { console.error(`rule must be one of ${Object.keys(RULES).join(", ")}`); process.exit(2); }
const p = parseLogs(readFileSync(opts.file, "utf8"));
if (p.error) { console.error(p.error); process.exit(2); }
const r = check({ rows: p.rows, prices: opts.prices, offer: { kind: opts.perMbf ? "perMbf" : "lump", amount: opts.offer }, offerRule: opts.rule, foresterFeePct: opts.fee });
if (r.error) { console.error(r.error); process.exit(2); }
if (opts.json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`Offer ${money(r.offered)}  value at your prices ${money(r.fairValue)}  ratio ${r.ratio ?? "n/a"}`);
  for (const x of r.rules) console.log(`  ${x.label.padEnd(34)} ${String(x.totalBf).padStart(8)} BF  ${money(x.totalValue).padStart(10)}`);
  for (const t of r.advice) console.log(`- ${t}`);
  for (const w of p.warnings) console.log(`! ${w}`);
}
process.exit(r.belowThreshold ? 1 : 0);
