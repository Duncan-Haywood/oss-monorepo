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
import { analyze, planSale, donationPlan, parsePrices, harvestPlan, waitPlan, toForm8949Csv, toIncomeCsv, form8949Totals, form8949BoxTotals, METHODS, METHOD_LABELS, NIIT_THRESHOLDS, SAMPLE_CSV } from "./calc.mjs";
import { convertMany, FORMAT_LABELS } from "./importers.mjs";

const USAGE = `Crypto cost basis from exchange CSVs: lot matching, method comparison, Form 8949 style rows.

Usage:
  node cli.mjs [options] <file.csv ...| ->

Options:
  --method <m>        FIFO (default), LIFO, HIFO, LOFO or TAXMIN
  --year <yyyy>       tax year of the sales (default: the latest year with a sale)
  --per-wallet        match each sale only against lots in the same wallet
  --carry-short <usd>  short-term loss carried in from before the file starts
  --carry-long <usd>   long-term loss carried in from before the file starts
  --mfs                $1,500 annual loss deduction (married filing separately)
  --magi <usd>         your other income for the year (excluding these results): adds the 3.8% net investment income tax
  --other-nii <usd>    other net investment income (interest, dividends, other gains) for that estimate
  --filing <status>    single (default), mfj, mfs, hoh or qw: sets the NIIT threshold
  --short-rate <pct>  short-term rate for the tax estimate (default 24)
  --long-rate <pct>   long-term rate for the tax estimate (default 15)
  --sell <COIN>       sell planner: compare the five methods for selling COIN; needs --price and --qty or --cash
  --donate <COIN>     gift planner: which long-held lots of COIN to give to a public charity, and the gain tax avoided; needs --price and --qty
  --deduction-rate <r> your rate (0-1) to value the deduction in --donate (default 0: deduction ignored)
  --price <usd>       price per coin for --sell or --donate
  --qty <coins>       coins to sell with --sell
  --cash <usd>        dollars to raise with --sell (used when --qty is absent)
  --sale-date <date>  date of the planned sale or price check (default: today)
  --prices <list>     prices you type, e.g. "BTC=65000,ETH=3200": adds tax-loss harvesting and wait-for-long-term (90 days) views of the lots you still hold
  --form8949 <file>   also write Form 8949 style rows to this file
  --income-csv <file> also write the year's staking/mining/airdrop income by coin to this file
  --json              print the full analysis as JSON
  --example           use the built-in sample instead of a file
  -h, --help          this message

Reads Coinbase, Kraken, Binance.US, Crypto.com App, Gemini, Bitstamp, Cash App, Robinhood, Koinly universal CSV and Coinbase Pro fills exports or the
plain CSV (date,type,asset,quantity,total,fee,wallet). Several files are
merged. Arithmetic on the figures in your files, not tax advice: it fetches no
prices, and rows an export gives no USD value for are flagged, never zero.
`;

export function parseArgs(argv) {
  const opts = { files: [], method: "FIFO", year: null, perWallet: false, shortRate: 0.24, longRate: 0.15, form8949: null, incomeCsv: null, carryShort: 0, carryLong: 0, lossLimit: 3000, json: false, example: false, help: false };
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
    } else if (arg === "--carry-short" || arg === "--carry-long") {
      const v = Number(need(++i, arg));
      if (!Number.isFinite(v) || v < 0) throw new Error(`${arg} needs a positive dollar amount`);
      opts[arg === "--carry-short" ? "carryShort" : "carryLong"] = v;
    } else if (arg === "--mfs") opts.lossLimit = 1500;
    else if (arg === "--magi" || arg === "--other-nii") {
      const v = Number(need(++i, arg));
      if (!Number.isFinite(v) || (arg === "--magi" && v < 0)) throw new Error(`${arg} needs a dollar amount`);
      opts[arg === "--magi" ? "magi" : "otherNii"] = v;
    } else if (arg === "--filing") {
      const f = need(++i, arg).toLowerCase();
      if (!(f in NIIT_THRESHOLDS)) throw new Error(`--filing must be one of ${Object.keys(NIIT_THRESHOLDS).join(", ")}`);
      opts.filing = f;
    }
    else if (arg === "--sell") opts.sell = need(++i, arg).toUpperCase();
    else if (arg === "--donate") opts.donate = need(++i, arg).toUpperCase();
    else if (arg === "--deduction-rate") opts.deductionRate = Number(need(++i, arg));
    else if (arg === "--price" || arg === "--qty" || arg === "--cash") {
      const v = Number(need(++i, arg));
      if (!(v > 0)) throw new Error(`${arg} needs a number above zero`);
      opts[arg.slice(2)] = v;
    } else if (arg === "--sale-date") {
      const d = need(++i, arg);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("--sale-date needs yyyy-mm-dd");
      opts.saleDate = d;
    }
    else if (arg === "--prices") {
      const { prices, errors } = parsePrices(need(++i, arg));
      if (errors.length) throw new Error(`--prices: ${errors[0]}`);
      if (!Object.keys(prices).length) throw new Error("--prices needs at least one coin, e.g. BTC=65000");
      opts.prices = prices;
    }
    else if (arg === "--form8949") opts.form8949 = need(++i, arg);
    else if (arg === "--income-csv") opts.incomeCsv = need(++i, arg);
    else if (arg.startsWith("-") && arg !== "-") throw new Error(`unknown option: ${arg}`);
    else opts.files.push(arg);
  }
  return opts;
}

const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// files: [{ name, text }]. Returns { result, formats, notes, csv, error }.
export function run(files, opts = {}) {
  const { formats, csv, notes } = convertMany(files);
  const result = analyze(csv, { method: opts.method || "FIFO", year: opts.year ?? null, perWallet: !!opts.perWallet, shortRate: opts.shortRate ?? 0.24, longRate: opts.longRate ?? 0.15, carryShort: opts.carryShort || 0, carryLong: opts.carryLong || 0, lossLimit: opts.lossLimit || 3000, magi: opts.magi ?? null, otherNii: opts.otherNii || 0, filing: opts.filing || "single" });
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
  if (result.carryChain.length) {
    out.push("", `Loss limit and carryforward (${usd(opts.lossLimit || 3000)} a year; years chained from the first sale in the file):`);
    for (const c of result.carryChain) out.push(`  ${c.year}  carried in ${usd(c.carryShortIn + c.carryLongIn).padStart(12)}   net ${usd(c.totalNet).padStart(13)}   deductible ${usd(c.deduction).padStart(10)}   carried out ${usd(c.carryShortOut + c.carryLongOut).padStart(12)}   tax ${usd(c.tax).padStart(11)}${c.year === result.year ? "   <- shown year" : ""}`);
  }
  if (result.niit) {
    const n = result.niit;
    out.push("", `Net investment income tax (3.8%, ${n.status}, threshold ${usd(n.threshold)}): ${usd(n.tax)} on ${usd(n.base)}; the crypto result adds ${usd(n.fromCrypto)} of it. Your MAGI with these results is ${usd(n.totalMagi)}.`);
  }
  const ir = result.incomeReport;
  if (ir && ir.count) {
    out.push("", `Income received in ${ir.year} (staking, mining, airdrops; ordinary income, not in the gains above): ${usd(ir.total)} from ${ir.count} receipt(s)`);
    for (const a of ir.assets) out.push(`  ${a.asset.padEnd(8)} ${String(a.qty).padStart(14)}   ${usd(a.usd).padStart(12)}   ${a.count} receipt(s), ${a.first} to ${a.last}`);
  }
  const wl = result.washLookalike;
  if (wl && wl.items.length) {
    out.push("", `Wash-sale lookalike (crypto is not covered by the wash-sale rule today; a stock-style rule would defer ${usd(wl.deferred)} of ${result.year} losses):`);
    for (const i of wl.items) out.push(`  line ${String(i.saleLine).padEnd(4)} ${i.sold}  ${i.asset.padEnd(8)} loss ${usd(i.loss).padStart(11)}   re-bought ${i.replacedQty} of ${i.qty} within 30 days   would defer ${usd(i.deferred).padStart(10)}`);
  }
  out.push("", "Method comparison (same sales):");
  for (const c of result.comparison) out.push(`  ${c.label.padEnd(24)} gain ${usd(c.totalGain).padStart(14)}   tax ${usd(c.tax).padStart(12)}${c.niit !== undefined ? `   NIIT ${usd(c.niit).padStart(10)}` : ""}${c.method === result.bestMethod ? "   <- lowest estimated tax" : ""}`);
  if (result.holdings.length) {
    out.push("", "Still held:");
    for (const h of result.holdings) out.push(`  ${h.asset.padEnd(8)} ${String(h.qty).padStart(14)}   basis ${usd(h.basis)}`);
  }
  for (const w of result.warnings) out.push("", `warning: ${w}`);
  return out.join("\n") + "\n";
}

export function renderPlan(p) {
  if (!p.qty) return `\nSell plan: no ${p.asset} on record to sell.\n`;
  const out = ["", `Sell plan: ${p.qty} ${p.asset} at ${usd(p.price)} on ${p.asOf}${p.capped ? ` (asked for ${p.requested}; only ${p.heldQty} on record)` : ""}`];
  for (const o of p.options) out.push(`  ${o.label.padEnd(24)} proceeds ${usd(o.proceeds).padStart(12)}   gain ${usd(o.gain).padStart(12)}   extra tax ${usd(o.extraTax).padStart(11)}${o.method === p.bestMethod ? "   <- least extra tax" : ""}`);
  out.push("  A negative extra tax means the sale lowers the year's estimated tax. Estimate only; which lots you may sell depends on your records.");
  return out.join("\n") + "\n";
}

export function renderPrices(h, w) {
  const out = ["", `Tax-loss harvesting on ${h.asOf} (prices you typed; no wash-sale rule applied)`];
  if (!h.losers.length) out.push("  No priced lot is under water.");
  for (const l of h.losers) out.push(`  ${l.asset.padEnd(8)} bought ${l.acquired}  ${String(l.qty).padStart(12)}   loss ${usd(l.gain).padStart(12)}   ${l.term}-term   tax saved ${usd(l.taxSaved).padStart(10)}`);
  if (h.losers.length) out.push(`  Selling all of them: estimated tax ${usd(h.taxBefore)} -> ${usd(h.taxAfter)} (saves ${usd(h.taxSaved)})${h.unusedLoss ? `; ${usd(h.unusedLoss)} of loss is left over` : ""}.`);
  if (h.unpriced.length) out.push(`  No price given for: ${h.unpriced.join(", ")}.`);
  out.push("", `Wait for long-term: gains that turn long-term within ${w.windowDays} days of ${w.asOf}`);
  if (!w.lots.length) out.push("  None.");
  for (const l of w.lots) out.push(`  ${l.asset.padEnd(8)} bought ${l.acquired}  gain ${usd(l.gain).padStart(12)}   long-term from ${l.longFrom} (${l.days} days)   saves ${usd(l.taxSaved).padStart(10)}   price may fall ${l.breakEvenFallPct}% first`);
  return out.join("\n") + "\n";
}

export function renderDonation(d) {
  if (!d.qty) return `\nGift plan: no ${d.asset} held over a year on record. Short-term lots are not valued at market for a gift.\n`;
  const out = ["", `Gift plan: ${d.qty} ${d.asset} at ${usd(d.price)} on ${d.asOf}${d.capped ? ` (asked for ${d.requested}; only ${d.longQty} held over a year)` : ""}`];
  for (const l of d.lots) out.push(`  ${l.acquired}  ${String(l.qty).padStart(12)}  value ${usd(l.value).padStart(12)}  basis ${usd(l.basis).padStart(12)}  gain ${usd(l.gain).padStart(12)}`);
  out.push(`  Value ${usd(d.value)}, gain never taxed ${usd(d.gain)}, long-term tax avoided ${usd(d.taxAvoided)}` + (d.deductionValue ? `, deduction worth ${usd(d.deductionValue)}` : "") + ".");
  out.push("  Estimate only: deduction limits, appraisal rules and itemizing decide the rest; ask a tax professional.");
  return out.join("\n") + "\n";
}

function totalsLine(result) {
  const f = form8949Totals(result.rows);
  const bt = result.rows.some((r) => r.reported) ? "\n" + form8949BoxTotals(result.rows).map((b) => `Box ${b.box}: ${b.rows} row(s), proceeds ${usd(b.proceeds)}, basis ${usd(b.basis)}, gain ${usd(b.gain)}`).join("\n") : "";
  return bt + (f.total.noBasis ? `${f.total.noBasis} row(s) have no purchase on record (zero basis); fix before filing.` : "");
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
  if (opts.sell) {
    if (!opts.price || (!opts.qty && !opts.cash)) { process.stderr.write("--sell needs --price and --qty or --cash\n"); return 2; }
  }
  if (opts.donate && (!opts.price || !opts.qty)) { process.stderr.write("--donate needs --price and --qty\n"); return 2; }
  if (opts.incomeCsv) await writeFile(opts.incomeCsv, toIncomeCsv(r.result.incomeReport));
  if (opts.form8949) await writeFile(opts.form8949, toForm8949Csv(r.result.rows));
  const plan = opts.sell ? planSale(r.result.openLots, { asset: opts.sell, price: opts.price, asOf: opts.saleDate || new Date().toISOString().slice(0, 10), qty: opts.qty ?? null, cash: opts.qty ? null : opts.cash ?? null, summary: r.result.summary, shortRate: opts.shortRate, longRate: opts.longRate }) : null;
  let pr = null;
  if (opts.prices) {
    const asOf = opts.saleDate || new Date().toISOString().slice(0, 10);
    const common = { asOf, summary: r.result.summary, shortRate: opts.shortRate, longRate: opts.longRate };
    pr = { harvest: harvestPlan(r.result.openLots, opts.prices, common), wait: waitPlan(r.result.openLots, opts.prices, common) };
  }
  const gift = opts.donate ? donationPlan(r.result.openLots, { asset: opts.donate, price: opts.price, asOf: opts.saleDate || new Date().toISOString().slice(0, 10), qty: opts.qty, longRate: opts.longRate, deductionRate: opts.deductionRate || 0 }) : null;
  if (opts.json) process.stdout.write(JSON.stringify({ ...r.result, ...(plan ? { plan } : {}), ...(pr ? { harvest: pr.harvest, wait: pr.wait } : {}), ...(gift ? { gift } : {}) }, null, 2) + "\n");
  else process.stdout.write(render(r, opts) + (plan ? renderPlan(plan) : "") + (pr ? renderPrices(pr.harvest, pr.wait) : "") + (gift ? renderDonation(gift) : ""));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
