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

test("a bracketed company registration number does not hide the company name", () => {
  const r = parseReceipt("AEON CO. (M) BHD (126926-H)\n3RD FLR, AEON TAMAN MALURI SC\nJLN JEJAKA, TAMAN MALURI\nGST ID : 002017394688\nDate: 05/01/2019\nTotal 10.60");
  assert.equal(r.merchant, "AEON CO. (M) BHD");
});

test("the name printed above a registration number is the merchant, not a promo line above it", () => {
  const r = parseReceipt("THANK YOU. PLEASE COME AGAIN.\n*REDEEM VOUCHER BEFORE POINTS EXPIRY!*\nSEGI CASH & CARRY SDN.BHD\n(317041-W)\nPT17920, SEKSYEN U9,\nDate: 05/01/2019\nTotal 10.00");
  assert.equal(r.merchant, "SEGI CASH & CARRY SDN.BHD");
  // no registration line: the first name line still wins
  assert.equal(parseReceipt("KEDAI RUNCIT\nSOME ROAD\nTotal 10.00").merchant, "KEDAI RUNCIT");
});

test("a date stamped with a clock time beats code-like numbers for the day-month order", () => {
  const r = parseReceipt("SHOP SDN BHD\nCK 11-22-31 - 10/400\nRC11-23-42 - 12/144\n19-09-17 15:39 SH01 ZJ03\nTOTAL 5.00");
  assert.equal(r.date, "2017-09-19");
  assert.equal(parseReceipt("SHOP SDN BHD\nRC11-23-42 - 12/144\n15-03-18 15:41 SH01\nTOTAL 5.00").date, "2018-03-15");
});

test("a company name wrapped over two lines is read as one name", () => {
  const r = parseReceipt("POPULAR BOOK\nCO. (M) SDN BHD\n(COMPANY NO. 113825-W)\nDate: 05/01/2019\nTotal 10.00");
  assert.equal(r.merchant, "POPULAR BOOK CO. (M) SDN BHD");
});

test("stray two-letter OCR fragments and a mark before TAX INVOICE are not the merchant", () => {
  const r = parseReceipt("eee ee ee Ty Pee ee\n'\n| 99 SPEED MART S/B (519537-x)\nDate: 05/01/2019\nTotal 10.00");
  assert.equal(r.merchant, "99 SPEED MART S/B");
  const t = parseReceipt("J\n’ TAX INVOICE\nDOMINO'S PIZZA\nDate: 05/01/2019\nTotal 10.00");
  assert.equal(t.merchant, "DOMINO'S PIZZA");
});

test("an OCR-damaged SDN BND still marks the company line under a person's name", () => {
  const r = parseReceipt("TAN WOON YANN\nBOOK TA .K(TAMAN DAYA) SDN BND\n789417-W\nDate: 05/01/2019\nTotal 10.00");
  assert.equal(r.merchant, "BOOK TA .K(TAMAN DAYA) SDN BHD");
});

test("a date with one look-alike digit is repaired only when a single reading is a real date", () => {
  const r = parseReceipt("TOKO MAJU SDN BHD\nDate: 69/02/2018 10:00\nTotal 10.00");
  assert.equal(r.date, "2018-02-09");
  assert.match(r.notes.join(";"), /date repaired from OCR \(69\/02\/2018\)/);
  assert.equal(parseReceipt("TOKO MAJU SDN BHD\nDate: 05/61/2018\nTotal 10.00").date, "2018-05-01");
  // 42 is 12 or 02: two readings, so the date is left to the person
  const two = parseReceipt("TOKO MAJU SDN BHD\nDate: 42/13/2016\nTotal 10.00");
  assert.equal(two.date, null);
  assert.match(two.notes.join(";"), /no date found/);
  // a garbled year is not repaired into a date years away
  assert.equal(parseReceipt("TOKO MAJU SDN BHD\nDate: 04/99/2087\nTotal 10.00").date, null);
});
