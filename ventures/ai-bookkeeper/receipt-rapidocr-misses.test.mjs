// Rules written from RapidOCR's parser misses on CORD train shards 1-3 photos
// (eval/rapidocr-parser-misses-2026-11-17.md). The slips below are written in the
// shape those readings take, not copied from CORD.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, CHANGE_WORD } from "./receipts.mjs";

const total = (t) => parseReceipt(t).cents;

test("cash and change printed on one line: cash is before the change word, change after", () => {
  assert.equal(total("Ayam Goreng  45.000\nITEMS:1  45,000\nPay Cash 50.000  Change:5,000"), 4500000);
  assert.equal(total("Nasi Box  41,000\nPay Cash 100.000  Change :59.000"), 4100000);
});

test("a word glued to its amount by a colon is read through on a whole-unit slip; a time is not", () => {
  assert.equal(total("Teh  8,000\nTOTAL  42,000\nCASH  50,000\nChange:8,000"), 4200000);
  const p = parseReceipt("Kopi  12,000\nJam 12:30\nTOTAL  12,000");
  assert.equal(p.cents, 1200000);
});

test("DUE with its E lost and the amount glued on is the total line", () => {
  const p = parseReceipt("FOOD  959,000\nSUBTOTAL  1,065,000\nSERVICE CHARGE  63,900\nTax10%  112,890\nDU1,241,790");
  assert.equal(p.cents, 124179000);
  // cleanOcr reads that D as 0; the rule takes either
  assert.equal(total("SUBTOTAL  940,000\nTax 10%  99,640\n0U1,096,040"), 109604000);
});

test("IDR glued to an amount reads like Rp", () => {
  assert.equal(total("Ramen  IDR71,500\nGyoza  IDR34,100\nTotal  IDR105,600"), 10560000);
});

test("Total Qty read as OTY, Discount total, Total Discount and Ch ange Due are not the total", () => {
  assert.equal(total("SUBTOTAL  42,500\nDUE  42,500\nCASH  50,000\nCHANGE  7,500\nTOTAL OTY  5PCS"), 4250000);
  assert.equal(total("TTL Food  645000\nDiscount total  129000-\nService Charge  93100\nTax  102410\nPayment  1126510"), 112651000);
  assert.equal(total("Subtotal  23.000\nTOTAL  23.000\nCash  32.000\nCh ange Due  9.000"), 2300000);
  assert.equal(total("Shirt  70,000\nOffer disc 45%  -31,500\nTotal Discont  94,500\nGrand Tatal  115,500"), 11550000);
});

test("a misspelt total word is a fallback only: a real total line wins", () => {
  const p = parseReceipt("Bihun  29,091\nBefore Rounding  81,002\nRounding  -2\nTota.......  81,000");
  assert.equal(p.cents, 8100000);
  assert.ok(p.notes.some((n) => /total line's word read as/.test(n)));
  assert.equal(total("Item  45,000\nTatai...  45,000\nTOTAL  46,000"), 4600000);
});

test("cash less change under the slip's own subtotal is not the total", () => {
  // a garbled cash line: 66,646 less 5,001 would be 61,645, under the subtotal of 86,363
  const p = parseReceipt("SUB.TOTAL  86,363\nRESTAURANT TAX  8,636\nCASH[94,999]  66646\nChange:5,001");
  assert.notEqual(p.cents, 6164500);
});

test("OCR spellings of Kembali are the change", () => {
  for (const w of ["KEBALI", "KEPBALI", "KEHEALI", "KEMEALI", "Kembali", "Kembalian"]) assert.ok(CHANGE_WORD.test(`${w}  4,501`), w);
  assert.ok(!CHANGE_WORD.test("KERING  4,501"));
});

test("two of the receipt's own sums agreeing on a printed amount replace an unconfirmed total", () => {
  // the total's word lost; cash less change and the bare line agree
  const a = parseReceipt("BASO KUAH  41,363\nTOTAL  2921\nTAX10.00 %  4,136\n45,499\nTUNAI  50,000\nKEHEALI  4,501");
  assert.equal(a.cents, 4549900);
  assert.ok(a.notes.some((n) => /own sums give 45499\.00/.test(n)));
  // the cash column read into the total line: subtotal plus tax is the bare line above it
  assert.equal(total("PKT AYAM  33,000\nSUBTOTAL  33,000\nTAX10%  3,300\n36,300\nTOTAL  50,000\nCASH  13,700"), 3630000);
  // PB1 (P81 after cleanOcr) as the tax
  assert.equal(total("RISOL  8,182\nSUBTOTAL  13,636\nPB110%  1,363\n14,999\nTOTAL  20,000\nCASH  5,001"), 1499900);
  // a total some check confirms stays
  assert.equal(total("Nasi  20,000\nSUBTOTAL  20,000\nTAX10%  2,000\nTOTAL  22,000\nCASH  50,000\nCHANGE  28,000\n15,000"), 2200000);
  // dollar slips are not touched
  assert.equal(total("Burger  9.00\nSubtotal  9.00\nTax  0.72\n9.72\nTotal  12.00\nCash  20.00\nChange  10.28"), 1200);
});

test("a stray small number after a whole-unit total is dropped", () => {
  assert.equal(total("SURTOTAL  115,908\nPB1 10%  11,591\nTOTAL  127,500  4\nBCA card.  127,500"), 12750000);
  // a dollar total line with a second amount is unchanged
  assert.equal(total("Total  140.00  8.40"), 14840);
});
