// The page's Dutch VAT check (vat.mjs) against python-stdnum's verdicts written
// by nl-vat-stdnum-differential.py. Usage: node eval/nl-vat-stdnum-differential.mjs OUT.json
import { readFileSync } from "node:fs";
import { inspectPartyVat } from "../vat.mjs";

const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
const tally = new Map();
let off = 0;
for (const row of rows) {
  const ok = !inspectPartyVat({ vat_id: row.vat }, "supplier").some((f) => f.rule === "INV-023");
  const t = tally.get(row.kind) || [0, 0];
  t[0] += 1;
  if (ok !== row.stdnum) { t[1] += 1; off += 1; }
  tally.set(row.kind, t);
}
console.log(`numbers: ${rows.length}, page disagreements with stdnum: ${off}`);
for (const [kind, [count, bad]] of [...tally].sort()) console.log(`  ${kind.padEnd(16)} ${String(count).padStart(6)} drawn, ${bad} off`);
