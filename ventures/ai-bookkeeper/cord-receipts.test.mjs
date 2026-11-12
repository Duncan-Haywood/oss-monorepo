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
// took test 90 -> 92, train 742 -> 749, validation tax 45 -> 46.
test("CORD-v2 receipts: totals and tax read as in the README", () => {
  const t = score(load("test"));
  assert.deepEqual([t.total.right, t.total.labelled, t.tax.right, t.tax.labelled], [92, 95, 37, 41]);
  const v = score(load("validation"));
  assert.deepEqual([v.total.right, v.total.labelled, v.tax.right, v.tax.labelled], [96, 98, 46, 47]);
  const tr = score(load("train"));
  assert.deepEqual([tr.total.right, tr.total.labelled, tr.tax.right, tr.tax.labelled], [749, 779, 316, 352]);
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
