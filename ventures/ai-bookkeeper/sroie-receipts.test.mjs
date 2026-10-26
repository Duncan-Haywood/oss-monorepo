// Receipt reader fixes found by scoring parseReceipt on SROIE 2019 (eval/sroie-receipts.mjs).
// Receipts here are hand-written in the shapes the dataset showed; no dataset text is copied.
import test from "node:test";
import assert from "node:assert/strict";
import { parseReceipt } from "./receipts.mjs";

const rcpt = (...l) => l.join("\n");

test("a slash date with both fields up to 12 is day-first on an RM receipt, month-first otherwise", () => {
  const rm = parseReceipt(rcpt("KEDAI RUNCIT AMIR", "TEL 03-5555 1212", "09/01/2019", "TOTAL  RM 4.00"));
  assert.equal(rm.date, "2019-01-09");
  const us = parseReceipt(rcpt("CORNER DELI", "09/01/2019", "TOTAL  $4.00"));
  assert.equal(us.date, "2019-09-01");
  assert.match(us.notes.join(" "), /order guessed/);
});

test("a first field above 12 settles the order, and so does the caller", () => {
  assert.equal(parseReceipt(rcpt("SHOP", "25/12/2018", "TOTAL 4.00")).date, "2018-12-25");
  assert.equal(parseReceipt(rcpt("SHOP", "12/28/2018", "TOTAL 4.00")).date, "2018-12-28");
  assert.equal(parseReceipt(rcpt("SHOP", "03/04/2018", "TOTAL 4.00"), { dayFirst: true }).date, "2018-04-03");
});

test("dash dates, year-first slash dates and two-digit-year month names are read", () => {
  assert.equal(parseReceipt(rcpt("SHOP SDN BHD", "12-01-19 14:22", "TOTAL 4.00")).date, "2019-01-12");
  assert.equal(parseReceipt(rcpt("SHOP", "DATE : 2018/02/22 13:34", "TOTAL 4.00")).date, "2018-02-22");
  assert.equal(parseReceipt(rcpt("SHOP", "28 MAR 18", "TOTAL 4.00")).date, "2018-03-28");
  assert.equal(parseReceipt(rcpt("SHOP", "21/05/2018TIME: 10:00", "TOTAL 4.00")).date, "2018-05-21");
});

test("the line labelled date wins over a serial number that looks like a date", () => {
  const p = parseReceipt(rcpt("SHOP", "REF 18/06/04-1016", "DATE: 04/06/2018", "TOTAL RM 4.00"));
  assert.equal(p.date, "2018-06-04");
});

test("a printed rounding adjustment moves the total to the amount paid", () => {
  const p = parseReceipt(rcpt("SHOP", "TOTAL AMT  RM", "60.31", "ROUNDING ADJ", "-0.01", "CASH  70.30", "CHANGE  10.00"));
  assert.equal(p.cents, 6030);
  assert.match(p.notes.join(" "), /rounding/);
  assert.equal(parseReceipt(rcpt("SHOP", "TOTAL  RM  45.34", "ROUNDING ADJUSTMENT  RM  .01")).cents, 4535);
  assert.equal(parseReceipt(rcpt("SHOP", "TOTAL  33.92", "ROUNDING ADJUSTMENT  -RM 0.02", "TOTAL ROUNDED  33.90")).cents, 3390);
});

test("a tax summary table after the total does not replace it", () => {
  const p = parseReceipt(rcpt("SHOP", "TOTAL SALES INCL GST  75.00", "CASH  100.00", "GST SUMMARY", "TOTAL  70.75  4.25"));
  assert.equal(p.cents, 7500);
});

test("tax lines that start with TOTAL are not the total, and a zero total is skipped", () => {
  const p = parseReceipt(rcpt("SHOP", "TOTAL  RM 25.00", "TOTAL GST  RM 1.42", "TOTAL INCLUDES 6% GST  1.42"));
  assert.equal(p.cents, 2500);
  assert.equal(parseReceipt(rcpt("SHOP", "TOTAL  RM 15.00", "TOTAL INCL .6% GST  RM  0.00")).cents, 1500);
  assert.equal(parseReceipt(rcpt("SHOP", "TOTAL SALES (EXCLUDING GST)  11.68", "TOTAL SALES (INCLUSIVE OF GST)  12.38")).cents, 1238);
});

test("a currency word glued to the amount on the next line still counts as bare", () => {
  assert.equal(parseReceipt(rcpt("SHOP", "GRAND TOTAL", "RM39.00", "(BILL INCLUSIVE OF 6% GST : RM2.21)")).cents, 3900);
});

test("with no total line, the cash handed over less the change is what was paid", () => {
  const p = parseReceipt(rcpt("SHOP", "ITEM A  3.00", "ITEM B  4.00", "CASH  RM 10.00", "CHANGE  RM 3.00"));
  assert.equal(p.cents, 700);
});

test("a person's name above the company name gives way to the company; boilerplate is never the merchant", () => {
  assert.equal(parseReceipt(rcpt("TAN WOON YANN", "BOOK TAMAN SDN BHD", "NO. 53, JALAN SAGU", "TOTAL 4.00")).merchant, "BOOK TAMAN SDN BHD");
  assert.equal(parseReceipt(rcpt("MYDIN", "MYDIN MOHAMED HOLDINGS SDN BHD", "TOTAL 4.00")).merchant, "MYDIN");
  assert.equal(parseReceipt(rcpt("GOODS SOLD ARE NOT RETURNABLE", "SEGI CASH & CARRY", "TOTAL 4.00")).merchant, "SEGI CASH & CARRY");
  assert.equal(parseReceipt(rcpt("KIKU JAPANESE RESTAURANT", "TAMAN ABC SDN BHD", "TOTAL 4.00")).merchant, "KIKU JAPANESE RESTAURANT");
});

test("TOTAL PAID that is cash handed over, with a change line, yields to the total above it", () => {
  const p = parseReceipt(rcpt("SHOP", "TOTAL (INCL GST)  RM21.83", "ROUNDING  RM0.02", "GRAND TOTAL  RM21.85", "TOTAL PAID  RM50.00", "CHANGE  RM28.15"));
  assert.equal(p.cents, 2185);
  assert.equal(parseReceipt(rcpt("SHOP", "TOTAL  RM 30.00", "TOTAL PAID  RM 30.00", "CHANGE  RM 0.00")).cents, 3000);
  assert.equal(parseReceipt(rcpt("SHOP", "TOTAL PAID  RM 12.00")).cents, 1200);
});

test("TOTAL SV / TOTAL GV voucher counts are not the total; the GST summary row adds to the amount paid", () => {
  const p = parseReceipt(rcpt("BEAUTY SHOP SDN BHD", "AMT PAID INCL GST : RM111.90", "TOTAL SV : 10.56  TOTAL GV : 10.55", "GST SUMMARY  AMT(RM)  TAX(RM)", "SR(6%)  105.57  6.33", "TOTAL  105.57  6.33"));
  assert.equal(p.cents, 11190);
});

test("a price glued to a tax code (7.50ZR) is not repaired into 7.5025, and BHD marks a day-first locale", () => {
  const r = parseReceipt(rcpt("AEON CO. (M) BHD", "1X 000008541987  7.00ZR", "1X 000001058621  9.85SR", "1X 000007570247  12.50ZR", "01/04/2018", "TOTAL AFTER ADJ INCL GST  29.35", "GST SUMMARY", "TOTAL  27.00  1.65"));
  assert.equal(r.date, "2018-04-01");
  assert.equal(r.cents, 2935);
});

test("a closing 'Total : base tax' row with an unreadable tax cell takes the GST lines above it", () => {
  const a = parseReceipt(rcpt("SHOP SDN BHD", "Total Sales (Excluding GST) : 89.50", "Total GST : 5.37", "Total Sales (Inclusive of GST) : 94.87", "Total : 89.50 §.37] +"));
  assert.equal(a.cents, 9487);
  const b = parseReceipt(rcpt("SHOP SDN BHD", "Total Sales (Excluding GST) : 45.00", "Total GST : 2.70", "Total Sales (Inclusive of GST) : ( 47.10)", "Total : 45.00 2.7"));
  assert.equal(b.cents, 4770);
  // one amount on the row: nothing to doubt, the row stands
  assert.equal(parseReceipt(rcpt("SHOP SDN BHD", "SUB-TOTAL (EX) : 4.60", "TOTAL TAX : 0.28", "TOTAL 4.90")).cents, 490);
});

test("ACCEPTED TOTAL is the cash fed to a parking machine: with no total line, it less the change is the amount", () => {
  const p = parseReceipt(rcpt("CAR PARK SDN BHD", "AMOUNT INCL. GST", "5.00 RM", "ACCEPTED TOTAL", "10.00 RM", "CHANGE", "5.00 RM"));
  assert.equal(p.cents, 500);
});
