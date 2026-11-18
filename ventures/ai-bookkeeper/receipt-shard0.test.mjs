// Two faults CORD train shard 0 showed once RapidOCR led tesseract's four readings
// (eval/cord-shard0-lead-2026-11-17.md); receipt text here is made up in the photos' style.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, parseReceiptPasses } from "./receipts.mjs";
import { settleReadings } from "./photoocr.mjs";

test("a total that subtotal plus PAJAK gives is not 'fixed' to a round amount under it", () => {
  // the slip prints the total before rounding, then the card payment rounded down
  const lead = "TOKO MANIS\nCOKLAT 18.182\nSubtotal 18,182\n-15% DISC -2.727\nSubtotal 15.455\nPAJAK 10% 1.546\nTotal 17,001\nRounding -1\nFLAZZ 17,000";
  assert.ok(parseReceipt(lead).checks.some(([v, w]) => v === 1700100 && w === "subtotal plus tax"));
  const five = [lead, "TOKO MANIS", "COKLAT", "TOKO", "MANIS"];
  const p = parseReceiptPasses(five, { lead: true });
  assert.equal(p.cents, 1700100);
  assert.ok(!p.notes.some((n) => /rarely prints/.test(n)));
  // a misread last digit that no sum confirms is still taken back to 000
  const misread = "TOKO MANIS\n1 x Nasi 6.000\nTotal 6.008\nTUNAI 10.000";
  assert.equal(parseReceiptPasses([misread, misread, misread], { lead: true }).cents, 600000);
});

test("the page writes a whole-unit tax the other readings found in the slip's own style", () => {
  const lead = "SOLARIA\nNASI AYAM 31,815\nTEH PANAS 5,455\nSubtotal 37,270\nTotal... 41,000";
  const other = "SOLARIA\nNASI AYAM 31,815\nTEH PANAS 5,455\nSubtotal 37,270\nVAT10% 3,730\nTotal 41,000";
  const readings = [lead, other, other.replace("SOLARIA", "S0LARIA"), lead, other];
  assert.equal(parseReceipt(lead).taxCents, null);
  assert.equal(parseReceiptPasses(readings, { lead: true }).taxCents, 373000);
  const s = settleReadings(readings, { lead: true });
  assert.match(s.text, /^Tax 3,730$/m);
  assert.equal(parseReceipt(s.text).taxCents, 373000);
  assert.equal(parseReceipt(s.text).cents, 4100000);
  assert.match(s.taxNote, /kept 3730.00/);
});
