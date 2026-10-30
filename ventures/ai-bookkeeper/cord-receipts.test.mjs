import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { score, labelCents } from "./eval/cord-receipts.mjs";
import { parseReceipt } from "./receipts.mjs";

const load = (s) => readFileSync(new URL(`./eval/cord/${s}.jsonl`, import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("labels in rupiah style read as whole units", () => {
  assert.equal(labelCents("60.000"), 6000000);
  assert.equal(labelCents("28,000"), 2800000);
  assert.equal(labelCents("Rp 1,234,500"), 123450000);
  assert.equal(labelCents("99999.99"), 9999999);
  assert.equal(labelCents(null), null);
});

// The README's numbers. The test split was scored once before and once after the
// rules changed; a drop here is a regression on real receipts.
test("CORD-v2 receipts: totals and tax read as in the README", () => {
  const t = score(load("test"));
  assert.deepEqual([t.total.right, t.total.labelled, t.tax.right, t.tax.labelled], [90, 95, 37, 41]);
  const v = score(load("validation"));
  assert.deepEqual([v.total.right, v.total.labelled, v.tax.right, v.tax.labelled], [96, 98, 45, 47]);
  const tr = score(load("train"));
  assert.deepEqual([tr.total.right, tr.total.labelled, tr.tax.right, tr.tax.labelled], [742, 779, 316, 352]);
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
