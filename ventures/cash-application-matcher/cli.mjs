#!/usr/bin/env node
// node cli.mjs open-invoices.csv bank-receipts.csv [--fee 25] [--no-discounts] [--day-first] [--json] [--out applications.csv]
import fs from 'node:fs';
import { readInvoices, readReceipts, fmtMoney, fmtDate } from './csv.mjs';
import { applyCash } from './match.mjs';
import { applicationsCsv } from './export.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const files = args.filter((a, i) => !a.startsWith('--') && !['--fee', '--out'].includes(args[i - 1]));
if (flag('--help') || files.length !== 2) {
  console.log(`Cash application matcher: propose which open invoices each bank receipt pays.

Usage: node cli.mjs <open-invoices.csv> <bank-receipts.csv> [options]
  --fee <amount>    short-pay accepted as a bank charge (default 25.00)
  --no-discounts    ignore early-payment terms such as "2/10 net 30"
  --day-first       read 03/04/2026 as 3 April
  --json            print the full result as JSON
  --out <file>      write the applications CSV

No warranty. Free and as-is; not accounting, tax, legal or financial advice.
You are responsible for reviewing and verifying its output before posting.`);
  process.exit(files.length === 2 || flag('--help') ? 0 : 2);
}
const opts = { dayFirst: flag('--day-first') };
const inv = readInvoices(fs.readFileSync(files[0], 'utf8'), opts);
const rec = readReceipts(fs.readFileSync(files[1], 'utf8'), opts);
for (const w of [...inv.warnings, ...rec.warnings]) console.error(`warning: ${w}`);
const settings = { allowDiscounts: !flag('--no-discounts') };
if (val('--fee') != null) settings.feeTolerance = Math.round(Number(val('--fee')) * 100);
const run = applyCash(inv.invoices, rec.receipts, settings);
if (val('--out')) fs.writeFileSync(val('--out'), applicationsCsv(run));
if (flag('--json')) { console.log(JSON.stringify(run, null, 2)); process.exit(0); }
for (const x of run.results) {
  const r = x.receipt;
  const apps = x.applications.map((a) => `${a.invoice} ${fmtMoney(a.applied)}${a.discount ? ` (disc ${fmtMoney(a.discount)})` : ''}${a.writeoff ? ` (fee ${fmtMoney(a.writeoff)})` : ''}`).join('; ') || '-';
  console.log(`${fmtDate(r.date)}  ${fmtMoney(r.amount).padStart(10)}  ${(r.payer || '(no payer)').slice(0, 24).padEnd(24)}  [${x.confidence}] ${apps}\n    ${x.note}`);
}
const s = run.summary;
console.log(`\n${s.receipts} receipts: ${s.high} high, ${s.medium} medium, ${s.review} to review, ${s.unmatched} unmatched. Applied ${fmtMoney(s.appliedCents)} of ${fmtMoney(s.receivedCents)}; discounts ${fmtMoney(s.discountCents)}; unapplied ${fmtMoney(s.unappliedCents)}. ${run.openInvoices.length} invoices still open.`);
