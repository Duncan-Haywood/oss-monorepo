#!/usr/bin/env node
// node repair-cli.mjs invoice.json [-o fixed.json]
// Recomputes line nets and totals from the invoice's own quantities, prices
// and tax percents; prints each change to stderr and what still needs a
// person. Exit 0 repaired file passes every check, 1 findings remain, 2 usage.
import { readFileSync, writeFileSync } from "node:fs";
import { repairInvoice } from "./repair.mjs";

const args = process.argv.slice(2);
const oi = args.findIndex((a) => a === "-o" || a === "--output");
const out = oi >= 0 ? args.splice(oi, 2)[1] : null;
const file = args.find((a) => !a.startsWith("-") || a === "-");
if (!file) {
  console.error("usage: node repair-cli.mjs invoice.json [-o fixed.json]");
  process.exit(2);
}
let invoice;
try {
  invoice = JSON.parse(readFileSync(file === "-" ? 0 : file, "utf8"));
} catch (e) {
  console.error(`Cannot read invoice: ${e.message}`);
  process.exit(2);
}
const r = repairInvoice(invoice);
for (const c of r.changes) console.error(`fixed    ${c.path}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)} (${c.reason})`);
for (const e of r.remaining) console.error(`needs you ${e.rule} ${e.path}: ${e.message} ${e.fix}`);
const text = JSON.stringify(r.invoice, null, 2) + "\n";
if (out) writeFileSync(out, text);
else process.stdout.write(text);
console.error(`${r.changes.length} fixed, ${r.remaining.length} left. Check the result against your own records before sending.`);
process.exit(r.remaining.length ? 1 : 0);
