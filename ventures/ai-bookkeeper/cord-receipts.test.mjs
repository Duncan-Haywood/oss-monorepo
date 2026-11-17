import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { score, labelCents } from "./eval/cord-receipts.mjs";
import { parseReceipt, joinSplitGroups } from "./receipts.mjs";

const load = (s) => readFileSync(new URL(`./eval/cord/${s}.jsonl`, import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("labels in rupiah style read as whole units", () => {
  assert.equal(labelCents("60.000"), 6000000);
  assert.equal(labelCents("28,000"), 2800000);
  assert.equal(labelCents("Rp 1,234,500"), 123450000);
  assert.equal(labelCents("99999.99"), 9999999);
  assert.equal(labelCents(null), null);
});

// The README's numbers. The test split was scored once before and once after the
// rules changed; a drop here is a regression on real receipts. 2026-11-12: split
// groups and the total/cash/change triple (written from validation photo misses)
// took test 90 -> 92, train 742 -> 749, validation tax 45 -> 46. 2026-11-15: tax lines
// found by the subtotal-to-total arithmetic (written from SRD photo misses, CORD held
// out) took tax test 37 -> 41, train 316 -> 322. 2026-11-16: misspelt "Subtotal" read
// (Suototal, Subtota; written from SRD photos, CORD held out) took train tax 322 -> 323. 2026-11-16, later: a "10.000%" rate no longer read as a
// 1.00 tax (under 1% of a whole-unit total) took train 323 -> 324 (train-203; train-397 now none). 2026-11-17: "Total Kembalian"
// (the change) is not a total line (chosen on validation photos): validation 96 -> 97. 2026-11-17,
// later: rules written from 200 CORD train photos (SUB. TOTAL, Bayar/Kembali, Qty Amount, no
// barcodes as amounts; eval/cord-train-photos-2026-11-17.md) took test 92 -> 93, train 749 -> 761. 2026-11-17, latest: rules written from RapidOCR's misses on
// CORD train shards 1-3 photos (Change:5,000, Pay Cash ... Change on one line, Discount total,
// TAX10%; eval/rapidocr-parser-misses-2026-11-17.md) took test 93 -> 94, train 761 -> 767.
test("CORD-v2 receipts: totals and tax read as in the README", () => {
  const t = score(load("test"));
  assert.deepEqual([t.total.right, t.total.labelled, t.tax.right, t.tax.labelled], [94, 95, 41, 41]);
  const v = score(load("validation"));
  assert.deepEqual([v.total.right, v.total.labelled, v.tax.right, v.tax.labelled], [97, 98, 46, 47]);
  const tr = score(load("train"));
  assert.deepEqual([tr.total.right, tr.total.labelled, tr.tax.right, tr.tax.labelled], [767, 779, 324, 352]);
});

test("whole-unit receipts: yen with a symbol, and decimal receipts unchanged", () => {
  const yen = parseReceipt("Lawson Shibuya\n2026/03/14\nOnigiri ¥150\nTea ¥128\nTax ¥22\nTotal ¥300\nCash ¥1,000\nChange ¥700");
  assert.equal(yen.cents, 30000);
  assert.equal(yen.taxCents, 2200);
  const us = parseReceipt("Joe's Diner\n03/14/2026\nBurger 12.50\nSubtotal 12.50\nTax 1.03\nTotal 13.53\nVisa 1234");
  assert.deepEqual([us.cents, us.taxCents], [1353, 103]);
  // a total word alone, the amount on the next line
  assert.equal(parseReceipt("Kopi\nGRAND TOTAL\n33,000\nCASH\n100,000").cents, 3300000);
  // "Total Qty" is a count, not the total
  assert.equal(parseReceipt("Shop\nTotal 334,000\nTotal Qty 16").cents, 33400000);
});

// Phone photos through OCR (README, "Receipt photos from a phone", 2026-11-12).
test("whole-unit amounts OCR split at the separator are joined", () => {
  assert.equal(joinSplitGroups("1 Total 25 000"), "1 Total 25,000");
  assert.equal(joinSplitGroups("TOTAL 308. 000"), "TOTAL 308.000");
  assert.equal(joinSplitGroups(": TOTAL 304 ,326_"), ": TOTAL 304,326_");
  // a three-digit number standing alone, a percentage and a longer group are left as they are
  assert.equal(joinSplitGroups("Table 12 Qty 3"), "Table 12 Qty 3");
  assert.equal(joinSplitGroups("Disc 10 100%"), "Disc 10 100%");
  assert.equal(joinSplitGroups("2 100,000"), "2 100,000");
  assert.equal(parseReceipt("1 Sate Padang 25 000\n1 Total 25 000\nCash 25 000").cents, 2500000);
  // a decimal receipt is never joined
  assert.equal(parseReceipt("Cafe\n1 Tea 3.50\nTotal 3.50").cents, 350);
});

test("no total line: total, cash and change read from three amounts whose sum closes", () => {
  const p = parseReceipt("1 REAL GANACHE\n: 13,000\ni) 16,000\nL 45,500\n50,000\n4,500");
  assert.equal(p.cents, 4550000);
  assert.match(p.notes.join(" "), /total, cash and change/);
  // OCR noise under 100 units closes a sum by chance and is not read
  assert.notEqual(parseReceipt("Bag 272.000\n5\n2\n3\nKembali 22.000").cents, 500);
  // no three amounts that close: the largest-amount fallback, as before
  assert.match(parseReceipt("Kopi 20,000\n50,000\n4,500").notes.join(" "), /largest amount/);
});

// CORD's photos through the CLI's four readings (eval/cord-photos-four-pass-2026-11-16.md):
// shapes OCR printed on rupiah slips that no rule read before.
test("rupiah slips as OCR prints them: dashes, PB1 misread, rate as tax, rounding", async () => {
  const { parseReceiptPasses } = await import("./receipts.mjs");
  // "CASH -50,000", "CHANGE -30,000" with the total line unreadable: cash less change
  assert.equal(parseReceipt("1 Teh 12,000\n1 Roti 8,000\nTOTAL a0 .000\nCASH -50,000\nCHANGE -30,000").cents, 2000000);
  // "PBI" and "PB]" are PB1; "P Resto" lost its dot
  assert.equal(parseReceipt("Subtotal: 18,181\nPBI: 1,818\nTotal: 20,000").taxCents, 181800);
  assert.equal(parseReceipt("SUBTTL 261,000\nSVC CHG 6% 15,660\nPB] 10% 27,666\nTOTAL 304,326").taxCents, 2766600);
  assert.equal(parseReceipt("Subtotal 27,272\nP Resto 10% 2,700\nTotal 30,000").taxCents, 270000);
  // "10.000%" is the rate, and 1.00 on a 188,499 total is no tax
  assert.notEqual(parseReceipt("SUBTOTAL 171,363\nPB 1 10% 10.000%\nTOTAL 188,499").taxCents, 100);
  // a yen tax under 100 units is still a tax
  assert.equal(parseReceipt("Onigiri ¥150\nTea ¥128\nTax ¥22\nTotal ¥300").taxCents, 2200);
  // three readings agree on 1,818; 18,181 + 1,818 is 19,999, printed rounded as 20,000
  const r = "1 Ovaltine 20,000\nPBI: 1,818\nSubtotal: 18,181\nTotal: 20,000\nCash: 100,000\nCHANGE: 80,000";
  assert.equal(parseReceiptPasses([r, r, r, r.replace("1,818", "4,818")]).taxCents, 181800);
  // a decimal receipt one cent off is still repaired by the arithmetic (unchanged)
  const us = "Subtotal 38.95\nTax 8.21\nTotal 42.16";
  assert.equal(parseReceiptPasses([us, us, us]).taxCents, 321);
});
