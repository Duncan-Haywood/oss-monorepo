// Lists the receipts whose total or tax differs between two copies of the parser, on one
// set of OCR folders: what a rule change moved, receipt by receipt. Use it on a
// development set only; on a held-out set it reads test receipts
// (eval/wildreceipt-rescore-2026-11-17.md).
//   node eval/receipt-version-diff.mjs <labels.jsonl> <ocr dirs> <beforeDir> <afterDir>  (absolute paths to venture copies) [--lead] [--print]
import { readFileSync } from "node:fs";
const [labels, ocr, bdir, adir] = process.argv.slice(2);
const lead = process.argv.includes("--lead"), print = process.argv.includes("--print");
const B = await import(`${bdir}/receipts.mjs`), A = await import(`${adir}/receipts.mjs`);
const { withOcr, labelCents, taxLabelCents = labelCents } = await import(`${adir}/eval/cord-receipts.mjs`);
const rows = withOcr(readFileSync(labels, "utf8").trim().split("\n").map((l) => JSON.parse(l)), ocr);
const run = (M, row) => row.texts ? M.parseReceiptPasses(row.texts, { lead }) : M.parseReceipt(row.text);
for (const row of rows) {
  const b = run(B, row), a = run(A, row);
  if (b.cents !== a.cents || b.taxCents !== a.taxCents) {
    console.log(JSON.stringify({ id: row.id, wantTotal: labelCents(row.total), wantTax: taxLabelCents(row.tax), total: [b.cents, a.cents], tax: [b.taxCents, a.taxCents] }));
    if (print) console.log(row.text.split("\n").filter((l) => /\d/.test(l)).slice(-25).join("\n") + "\n---");
  }
}
