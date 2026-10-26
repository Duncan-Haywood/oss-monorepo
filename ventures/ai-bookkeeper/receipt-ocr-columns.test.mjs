// Found by running tesseract over SROIE's 626 receipt photos (eval/sroie-receipts.mjs --ocr);
// receipt text below is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt } from "./receipts.mjs";

test("a total row with a before-tax and a tax column adds the 6% tax", () => {
  const r = parseReceipt("TOKO MAJU SDN BHD\nDate: 05/01/2019\nItem 28.00\nTotal : 28.00 1.68");
  assert.equal(r.cents, 2968);
  const same = parseReceipt("TOKO MAJU SDN BHD\nDate: 05/01/2019\nTotal : 45.00 2.70");
  assert.equal(same.cents, 4770);
});

test("a total with tax already inside it is not added to", () => {
  // 2.55 is 6/106 of 45.00, not 6% of it
  assert.equal(parseReceipt("TOKO MAJU SDN BHD\nTotal : 45.00 2.55").cents, 255);
  assert.equal(parseReceipt("TOKO MAJU SDN BHD\nTotal 45.00").cents, 4500);
});

test("a clock printed with dashes is not month-first evidence for the date", () => {
  const r = parseReceipt("HARDWARE TRADING\nDoc No 800035663 Date: 13/03/2018\nCashier USER Time: 12-49-00\nTotal 5.00");
  assert.equal(r.date, "2018-03-13");
});

test("a lower-case stamped name above a printed shop name is not the merchant", () => {
  assert.equal(parseReceipt("tan woon yann\nYONGFATT ENTERPRISE\nTotal 5.00").merchant, "YONGFATT ENTERPRISE");
  assert.equal(parseReceipt("amazon\nTotal 5.00").merchant, "amazon");
});

test("OCR noise, GST and state lines are not the merchant; SON BHD reads as SDN BHD", () => {
  const r = parseReceipt("| ~~ a%# ¢¢ wii oa «\n- UAN HING STATIONERY SON BHD\nGST Reg No. 001492992000\nSELANGOR DARUL EHSAN\nDate: 05/01/2019\nTotal 10.00");
  assert.equal(r.merchant, "UAN HING STATIONERY SDN BHD");
  assert.equal(parseReceipt("99 SPEED MART S/B\nDate: 05/01/2019\nTotal 10.00").merchant, "99 SPEED MART S/B");
});
