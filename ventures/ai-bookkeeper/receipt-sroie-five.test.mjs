// SROIE scans and SRD photos through RapidOCR and tesseract's four readings
// (eval/sroie-five-readings-2026-11-18.md): dates glued to the time, and a lead that took its subtotal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, unglueDate } from "./receipts.mjs";

const slip = (line) => parseReceipt(`KEDAI MAJU SDN BHD\nNO 12 JALAN BESAR\n${line}\nITEM A 5.00\nTOTAL 12.00\n`);

test("a four-digit year glued to the time is split off", () => {
  assert.equal(unglueDate("Date:  25/12/20188:13:39PM"), "Date:  25/12/2018 8:13:39PM");
  assert.equal(slip("Date:  25/12/20188:13:39PM").date, "2018-12-25");
  assert.equal(slip("25/01/20181:22:56PM").date, "2018-01-25");
  assert.equal(slip("CB#:389772  17/01/20188.08.53").date, "2018-01-17");
});

test("a two-digit year glued to the time is not read as 18xx", () => {
  assert.equal(slip("18-11-1813:58SH01Z153  T2 R000002902").date, "2018-11-18");
  assert.equal(slip("18/03/1815:170605102").date, "2018-03-18");
  assert.equal(slip("Date  06/01/1812.17:26PM").date, "2018-01-06");
});

test("a month name glued to its day and year", () => {
  assert.equal(slip("05Mar201818:24").date, "2018-03-05");
  assert.equal(slip("05 MAR 2018 18:24").date, "2018-03-05");
});

test("spaced dates and plain numbers are left alone", () => {
  assert.equal(unglueDate("Date: 11/01/2019 10:27"), "Date: 11/01/2019 10:27");
  assert.equal(unglueDate("Order No. 100021911/03/201806:20PM"), "Order No. 100021911/03/201806:20PM");
  assert.equal(unglueDate("Marmalade 2019 05Mar"), "Marmalade 2019 05Mar");
  assert.equal(slip("Date: 2018-12-25").date, "2018-12-25");
});

// SRD 1009 (eval/sroie-five-readings-2026-11-18.md); text made up in the photo's style.
import { parseReceiptPasses } from "./receipts.mjs";

test("a lead that took its subtotal as the total gives way to a total line just above it", () => {
  const lead = "Nonna's Kitchen\nServer: AB\n08/09/19 4:28PM\nPasta\nSalad\nSoda\nSubtotal  $28.48\nTax\nTotal\nThank you";
  const tess = [
    "Nonna's Kitchen\nPasta $12.99\nSalad $12°93,\nSoda $2.50\nSubtotal $28.48\nax ae\nTotal $30.76 7",
    "Nonnas Kitchn\nPasta $13-28\nSalad zs\nSoda 39°58 se\nSubtotal 323.49 am\nTax 2:2) a\nTotal $3.7)",
    "Nonna's Kitchen\nPasta $12.99\nSalad $17.99\nSoda $27.50\npubtotel $28.48\nax $2.26\nfota!l $30./6 &",
    "Nonna's Kitchen\nPasta 129\nSalad 312.99 ies\nSoda $2.50 a\nSubtotal| $28.48 a\nB fax 2.23 aa\nfotal 530. /6 §",
  ];
  assert.equal(parseReceipt(lead).cents, 2848);
  assert.equal(parseReceiptPasses([lead, ...tess], { lead: true }).cents, 3076);
  // a "total" far above the subtotal is no total: the lead keeps its amount
  const far = tess.map((t) => t.replace(/Total \$30\.76 7/, "I agree to pay above total 133"));
  assert.equal(parseReceiptPasses([lead, ...far], { lead: true }).cents, 2848);
});
