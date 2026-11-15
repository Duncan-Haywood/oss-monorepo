// The tax on a receipt, read from one text and settled across several OCR readings of
// one photo (README, "Tax on receipt photos"). Shapes found on ExpressExpense's US
// receipt photos (eval/srd) through tesseract.js; the receipt text below is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, parseReceiptPasses, readTax } from "./receipts.mjs";
import { settleReadings } from "./photoocr.mjs";

const R = (body) => `CORNER DINER\nDate: 03/14/2024\n${body}`;

test("a rate printed beside the tax is not the amount", () => {
  assert.equal(parseReceipt(R("Burger 12.67\nTax 8.75% 1.11\nTotal 13.78")).taxCents, 111);
  assert.equal(parseReceipt(R("Sales Tex (10.25%) 1.23\nTotal 13.22")).taxCents, 123);
  // a rate alone, the amount unreadable: no tax rather than 8.75
  assert.equal(parseReceipt(R("Tax 8.75% 1.1\nTotal 13.78")).taxCents, null);
});

test("Taxes, TXTL and Hawaii's GET are tax lines; Taxable and w/Tax are not", () => {
  assert.equal(parseReceipt(R("Taxable: 40.50\nTaxes: 3.85\nTotal Due 44.35")).taxCents, 385);
  assert.equal(parseReceipt(R("NET 8.75\nTXTL 0.75\nTOTL 9.50")).taxCents, 75);
  assert.equal(parseReceipt(R("HI HNLKO 4.712% GET 1.86\nTotal 41.33")).taxCents, 186);
  // the subtotal with tax after the tax line used to overwrite it, then be dropped as the total
  assert.equal(parseReceipt(R("Sbtl 10.00\nTax:: $0.70\nSbt1 w/Tax: $10.70\nAmt Due: $10.70")).taxCents, 70);
  assert.equal(parseReceipt(R("Tax ID 12-3456789\nTotal 9.50")).taxCents, null);
});

test("Tax IDR and tax included are still tax lines", () => {
  assert.equal(readTax(["Total IDR 215,985", "Tax IDR 19,635"], "whole", 21598500).cents, 1963500);
  assert.equal(readTax(["Subtotal: 165.00", "Total Tax Included: 15.00", "Total: 165.00"], false, 16500).cents, 1500);
});

test("a printed Total Tax wins over the lines it adds up", () => {
  assert.equal(parseReceipt(R("Subtotal 30.00\nFood Tax 1.74\nLiquor Tax 0.00\nTotal Tax 1.74\nTotal 31.74")).taxCents, 174);
});

test("two tax lines are added when the subtotal plus their sum is the total", () => {
  const r = parseReceipt(R("Subtotal 40.00\nSales Tax 2.80\nResort Tax 0.80\nTotal 43.60"));
  assert.equal(r.taxCents, 360);
  assert.ok(r.notes.some((n) => /2 tax lines added/.test(n)));
  // without that check the last line stands, as before
  assert.equal(parseReceipt(R("Sales Tax 2.80\nResort Tax 0.80\nTotal 50.80")).taxCents, 80);
});

test("a tax line whose decimal point was lost is read, with a note", () => {
  const r = parseReceipt(R("Subtotal 167.00\nTax 12,94\nTotal 179.94"));
  assert.equal(r.taxCents, 1294);
  assert.ok(r.notes.some((n) => /decimal point lost/.test(n) && /check the tax/.test(n)));
  assert.equal(parseReceipt(R("Total Tax 2:29\nTotal 30.29")).taxCents, 229);
  assert.equal(parseReceipt(R("TXTL .75\nTOTL 9.50")).taxCents, 75);
  // a time is not a tax
  assert.equal(parseReceipt(R("Tax 10:45\nTotal 9.50")).taxCents, null);
});

test("several readings vote on the tax; the subtotal's arithmetic counts double", () => {
  const p = parseReceiptPasses([R("TAX: Vea\nTotal 14.36"), R("Subtotal 13.50\nTAX: 0.86\nTotal 14.36"), R("TAX: ie\nTotal 14.36")]);
  assert.equal(p.taxCents, 86);
  // two readings say 4.60, one says 4.68 and the subtotal confirms it
  const q = parseReceiptPasses([R("Subtotal 47.22\nTax 1: 4.60\nTotal 51.90"), R("Tax 1: 4.60\nTotal 51.90"), R("Subtotal 47.22\nTax 1: 4.68\nTotal 51.90")]);
  assert.equal(q.taxCents, 468);
});

test("a voted tax one digit from total less subtotal takes the difference", () => {
  const p = parseReceiptPasses([R("Sub Total 38.95\nTax: 8.21\nTotal 42.16"), R("Sub Total 38.95\nTotal 42.16"), R("Total 42.16")]);
  assert.equal(p.taxCents, 321);
});

test("no reading has a tax: total less a subtotal, when it is under 15% of the subtotal", () => {
  assert.equal(parseReceiptPasses([R("Subtotal 40.00\nTax ???\nTotal 43.60"), R("Subtotal 40.00\nTotal 43.60"), R("Total 43.60")]).taxCents, 360);
  // a service charge makes the gap too large to be a tax
  assert.equal(parseReceiptPasses([R("Subtotal 40.00\nTotal 50.80"), R("Subtotal 40.00\nTotal 50.80"), R("Total 50.80")]).taxCents, null);
});

test("over 22% of the settled total is not a tax", () => {
  assert.equal(parseReceiptPasses([R("Total 615.00"), R("Total 615.00"), R("Sales Tax 152.00\nTotal 615.00")]).taxCents, null);
});

test("the page puts the voted tax into the receipts box and says so", () => {
  const readings = [R("Burger 13.50\nTAX: Vea\nTotal 14.36"), R("Burger 13.50\nTAX: 0.86\nTotal 14.36"), R("Burger 13.50\nTAX: 0.86\nTotal 14.36")];
  const s = settleReadings(readings);
  assert.equal(parseReceipt(s.text).taxCents, 86);
  assert.equal(parseReceipt(s.text).cents, 1436);
  assert.match(s.taxNote, /kept 0\.86/);
  assert.equal(s.note, null);
  // the first reading's tax agrees: the text is the first reading, no tax note
  const same = settleReadings([readings[1], readings[0]]);
  assert.equal(same.taxNote, undefined);
});
