// The printed total checked against the receipt's own arithmetic, and two OCR
// readings of one receipt settled the same way. Found on SROIE's 626 receipt
// scans through tesseract (eval/sroie-receipts.mjs --ocr); receipt text below is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, parseReceiptPasses, oneDigitApart } from "./receipts.mjs";

test("one digit apart: same length, exactly one digit differs", () => {
  assert.equal(oneDigitApart(900, 960), true);
  assert.equal(oneDigitApart(3100, 3400), true);
  assert.equal(oneDigitApart(900, 900), false);
  assert.equal(oneDigitApart(900, 1900), false);
  assert.equal(oneDigitApart(1234, 4321), false);
});

test("a total misread by one digit is corrected when two kinds of check agree", () => {
  // "Total : 9.00" then a rounded total misread as 9.60; the items also add to 9.00
  const r = parseReceipt("KEDAI MAJU\nDate: 05/01/2019\nTEH AIS 4.50\nNASI LEMAK 4.50\nTotal : 9.00\nRound Total (RM): 9.60");
  assert.equal(r.cents, 900);
  assert.ok(r.notes.some((n) => /total read as 9\.60/.test(n) && /check the total/.test(n)));
});

test("one check alone does not overrule the printed total", () => {
  // cash less change says 31.00, nothing else agrees: 34.00 stays, as printed
  const r = parseReceipt("KEDAI MAJU\nDate: 05/01/2019\nTotal Amount: 34.00\nCash Received 101.00\nChange : 70.00");
  assert.equal(r.cents, 3400);
  assert.ok(!r.notes.some((n) => /one digit apart/.test(n)));
});

test("a few cents either way is rounding, not a misread digit", () => {
  // items 23.26 rounded to 23.25: both checks agree on 23.26 but it is the 5-sen rounding
  const r = parseReceipt("KEDAI MAJU\nKOPI 11.63\nROTI 11.63\nTotal 23.25\nCash 50.00\nChange 26.74");
  assert.equal(r.cents, 2325);
});

test("a total any check confirms is left alone", () => {
  const r = parseReceipt("KEDAI MAJU\nKOPI 4.00\nROTI 5.00\nTotal 9.00\nCash 10.00\nChange 1.00");
  assert.equal(r.cents, 900);
  assert.deepEqual(Object.keys(r).includes("checks"), false, "checks are not an enumerable field");
  assert.ok(r.checks.length >= 2);
});

test("two OCR readings that disagree take the total the arithmetic confirms", () => {
  const a = "KEDAI MAJU\nDate: 05/01/2019\nTotal Amount: 34.00\nCash Received 101.00\nChange : 70.00";
  const b = "KEDAI MAJU\nDate: 05/01/2019\nTotal Amount: 31.00\nCash Received 101.00\nChange : 70.00";
  const r = parseReceiptPasses([a, b]);
  assert.equal(r.cents, 3100);
  assert.ok(r.notes.some((n) => /readings disagree/.test(n)));
  // the order of the readings does not matter when one is confirmed
  assert.equal(parseReceiptPasses([b, a]).cents, 3100);
});

test("two readings with no arithmetic to decide keep the first", () => {
  const r = parseReceiptPasses(["KEDAI MAJU\nTotal 12.00", "KEDAI MAJU\nTotal 13.00"]);
  assert.equal(r.cents, 1200);
  assert.ok(!r.notes.some((n) => /readings disagree/.test(n)));
});

test("a merchant the first reading missed is taken from the second; a date is not", () => {
  const r = parseReceiptPasses(["Total 12.00", "KEDAI MAJU\nDate: 13/01/2019\nTotal 12.00"]);
  assert.equal(r.merchant, "KEDAI MAJU");
  assert.ok(!r.notes.includes("no merchant found"));
  assert.equal(r.date, null);
  assert.equal(r.ok, false);
});

test("one reading, or empty ones, behave as parseReceipt", () => {
  const t = "KEDAI MAJU\nDate: 05/01/2019\nTotal 12.00";
  assert.deepEqual(parseReceiptPasses([t]), parseReceipt(t));
  assert.deepEqual(parseReceiptPasses([t, ""]), parseReceipt(t));
  assert.equal(parseReceiptPasses([]).cents, null);
});

test("a photo is read with --psm 6, then --psm 4 the second time; text files once", async () => {
  const { receiptPassesFromFile } = await import("./ocr.mjs");
  const calls = [];
  const run = (cmd, args) => { calls.push([cmd, ...args].join(" ")); return { status: 0, stdout: args.includes("4") ? "KEDAI MAJU\nTotal 31.00" : "KEDAI MAJU\nTotal 34.00" }; };
  const t = receiptPassesFromFile("slip.jpg", { run, env: {} });
  assert.equal(t.length, 2);
  assert.deepEqual(calls, ["tesseract slip.jpg stdout --psm 6", "tesseract slip.jpg stdout --psm 4"]);
  // a custom engine, or tesseract already on --psm 4, is read once
  assert.equal(receiptPassesFromFile("slip.jpg", { run, env: { RECEIPT_OCR_CMD: "myocr {file}" } }).length, 1);
  assert.equal(receiptPassesFromFile("slip.jpg", { run, env: { RECEIPT_OCR_CMD: "tesseract {file} stdout --psm 4" } }).length, 1);
  // a tesseract command with no mode gets --psm 4 added for the second reading
  calls.length = 0;
  assert.equal(receiptPassesFromFile("slip.jpg", { run, env: { RECEIPT_OCR_CMD: "tesseract {file} stdout" } }).length, 2);
  assert.deepEqual(calls, ["tesseract slip.jpg stdout", "tesseract slip.jpg stdout --psm 4"]);
  // a second pass that fails leaves the first
  let n = 0;
  const flaky = () => (n++ ? { status: 1, stdout: "" } : { status: 0, stdout: "KEDAI MAJU\nTotal 34.00" });
  assert.equal(receiptPassesFromFile("slip.jpg", { run: flaky, env: {} }).length, 1);
});

test("addReceipts takes two readings of one photo as one receipt", async () => {
  const { addReceipts } = await import("./receipts.mjs");
  const a = "KEDAI MAJU\nDate: 13/01/2019\nTotal Amount: 34.00\nCash Received 101.00\nChange : 70.00";
  const b = a.replace("34.00", "31.00");
  const books = { receipts: [], transactions: [], accounts: [], rules: [] };
  const r = addReceipts(books, [a, b]);
  assert.equal(r.added.length, 1);
  assert.equal(r.added[0].cents, 3100);
  assert.equal(addReceipts(books, [a]).added[0].cents, 3400);
});
