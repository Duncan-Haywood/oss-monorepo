// Scores parseReceipt on CORD-v2 (Clova AI, CC BY 4.0): real Indonesian shop
// and restaurant receipts whose total, subtotal and tax were labelled by hand.
// The text is the dataset's own word boxes (hand-corrected OCR), rows top to
// bottom and words left to right, so it tests reading a real layout, not OCR.
// Merchant names and dates are masked in CORD, so only amounts are scored.
//   node eval/cord-receipts.mjs eval/cord/validation.jsonl [--json] [--misses]
import { readFileSync } from "node:fs";
import { parseReceipt } from "../receipts.mjs";

// A label in the receipt's own style ("60.000", "28,000", "91000", "1.234,50")
// as a number in minor units. Rupiah are written with no decimals, so a lone
// separator before three digits groups thousands.
export function labelCents(v) {
  if (v == null) return null;
  const s = String(v).replace(/[^0-9.,]/g, "");
  if (!/\d/.test(s)) return null;
  const m = s.match(/^(.*\d)[.,](\d{1,2})$/);
  const whole = (m ? m[1] : s).replace(/[.,]/g, "");
  const frac = m ? m[2].padEnd(2, "0") : "00";
  return Number(whole) * 100 + Number(frac);
}

export function score(rows) {
  const r = { receipts: rows.length, total: { labelled: 0, right: 0, wrong: 0, none: 0 }, tax: { labelled: 0, right: 0, wrong: 0, none: 0, unlabelledRead: 0 }, misses: [] };
  for (const row of rows) {
    const p = parseReceipt(row.text);
    const want = labelCents(row.total);
    if (want !== null) {
      r.total.labelled++;
      if (p.cents === want) r.total.right++;
      else { if (p.cents === null) r.total.none++; else r.total.wrong++; r.misses.push({ id: row.id, want, got: p.cents, line: p.totalLine }); }
    }
    const tax = labelCents(row.tax);
    if (tax !== null) {
      r.tax.labelled++;
      if (p.taxCents === tax) r.tax.right++; else if (p.taxCents === null) r.tax.none++; else r.tax.wrong++;
    } else if (p.taxCents !== null) r.tax.unlabelledRead++;
  }
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const r = score(rows);
  if (process.argv.includes("--json")) console.log(JSON.stringify({ ...r, misses: process.argv.includes("--misses") ? r.misses : r.misses.length }, null, 2));
  else {
    const pct = (a, b) => `${a}/${b} (${b ? ((100 * a) / b).toFixed(1) : "0"}%)`;
    console.log(`${file}: ${r.receipts} receipts`);
    console.log(`total right ${pct(r.total.right, r.total.labelled)}, wrong ${r.total.wrong}, none ${r.total.none}`);
    console.log(`tax   right ${pct(r.tax.right, r.tax.labelled)}, wrong ${r.tax.wrong}, none ${r.tax.none}; tax read where none labelled ${r.tax.unlabelledRead}`);
    if (process.argv.includes("--misses")) for (const m of r.misses) console.log(m);
  }
}
