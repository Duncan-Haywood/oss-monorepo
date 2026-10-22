#!/usr/bin/env node
// node repair-cli.mjs invoice.json|invoice.xml [-o fixed.json|fixed.xml]
// Recomputes line nets and totals from the invoice's own quantities, prices
// and tax percents; prints each change to stderr and what still needs a
// person. Exit 0 repaired file passes every check, 1 findings remain, 2 usage.
import { readFileSync, writeFileSync } from "node:fs";
import { repairInvoice } from "./repair.mjs";
import { repairUbl } from "./repair-ubl.mjs";

const args = process.argv.slice(2);
const oi = args.findIndex((a) => a === "-o" || a === "--output");
const out = oi >= 0 ? args.splice(oi, 2)[1] : null;
const file = args.find((a) => !a.startsWith("-") || a === "-");
if (!file) {
  console.error("usage: node repair-cli.mjs invoice.json [-o fixed.json]");
  process.exit(2);
}
if (file !== "-" && file.toLowerCase().endsWith(".xml")) {
  let x;
  try {
    x = repairUbl(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Cannot read invoice: ${e.message}`);
    process.exit(2);
  }
  for (const c of x.changes) console.error(`fixed    ${c.path}: ${c.from} -> ${c.to} (${c.reason})`);
  for (const s of x.skipped) console.error(`skipped  ${s}`);
  for (const e of x.remaining) console.error(`needs you ${e.rule} ${e.path}: ${e.message} ${e.fix}`);
  if (out) writeFileSync(out, x.xml);
  else process.stdout.write(x.xml);
  console.error(`${x.changes.length} fixed, ${x.remaining.length} left. Check the result against your own records before sending.`);
  process.exit(x.remaining.length ? 1 : 0);
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
