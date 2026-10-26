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
