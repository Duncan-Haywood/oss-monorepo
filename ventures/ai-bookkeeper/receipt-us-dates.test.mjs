// Dates on US receipt photos (ExpressExpense SRD, read by eye: eval/srd/dates.jsonl,
// eval/srd-dates-2026-11-19.md). The printed shapes below are copied from those
// receipts; the shop lines around them are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, monthWordDate } from "./receipts.mjs";

const receipt = (dateLine, extra = "") => `CORNER CAFE\n${extra}${dateLine}\nCoffee 3.50\nTotal 3.50`;

test("month as a word with an apostrophe year, as Aloha and Micros print it", () => {
  for (const [line, want] of [
    ["Feb23'19 10:23AM", "2019-02-23"],
    ["MAR.19'17 7:02PM", "2017-03-19"],
    ["Jun 28 '17", "2017-06-28"],
    ["16Feb'19 12:01", "2019-02-16"],
    ["25AUG'17", "2017-08-25"],
    ["Oct01`17 6:15PM", "2017-10-01"], // OCR's backquote for the apostrophe
  ]) assert.equal(parseReceipt(receipt(line)).date, want, line);
});

test("day-month-year with dashes, a two-digit year after a comma, no space after the comma", () => {
  for (const [line, want] of [
    ["13-Jul-2018 8:53:47P", "2018-07-13"],
    ["24-Nov-16 Time:9:12 PM", "2016-11-24"],
    ["Jun 26, 15 7:12 PM", "2015-06-26"],
    ["TUE JANUARY 30,2018", "2018-01-30"],
    ["SUN JUN 24 20:49:53 2018", "2018-06-24"],
  ]) assert.equal(parseReceipt(receipt(line)).date, want, line);
});

test("a clock after a comma is not a two-digit year", () => {
  assert.equal(monthWordDate("Jun 26, 15:30"), "Jun 26, 15:30");
  assert.equal(parseReceipt(receipt("Jun 26, 15:30")).date, null);
});

test("tesseract's £ for a US $ does not make the date day-first when a US phone is printed", () => {
  const t = "HAMACHI BAR\n425-512-9361\n05/11/18 8:47 PM\nHamachi Collar £12.00\nTotal £12.00";
  assert.equal(parseReceipt(t).date, "2018-05-11");
});

test("a US state and ZIP code reads month first with no 'check the date' note", () => {
  const p = parseReceipt("TACO SHOP\nGardena, CA 90249\n06/02/2018 04:18 PM\nTaco 3.00\nTotal 3.00");
  assert.equal(p.date, "2018-06-02");
  assert.ok(!p.notes.some((n) => /day and month order/.test(n)));
});

test("a stray £ with no amount after it is not a locale marker", () => {
  const p = parseReceipt("GRILL\nServer: Wil 12/07/2016\nBurger 9.00\nTotal 9.00\nTHANK YOU £)");
  assert.equal(p.date, "2016-12-07");
});

test("Malaysian words still make a date day-first, North American-looking phone or not", () => {
  const p = parseReceipt("VERBENA SDN BHD\nTEL : 607-556-1878\n12/05/2018 15:16\nBUN 5.60\nTOTAL 5.60");
  assert.equal(p.date, "2018-05-12");
});

test("a pound amount on a receipt with no North American phone stays day first", () => {
  const p = parseReceipt("IKEA\n06/04/2016 13:02\nMEATBALLS £4.50\nTOTAL £4.50");
  assert.equal(p.date, "2016-04-06");
});

test("a sweepstakes end date loses to the sale date", () => {
  const p = parseReceipt("BURGER BARN\nCheeseburger 5.00\nTotal 5.00\n5/25/2017 12:01 PM\nSweepstakes ends 12/31/2017.");
  assert.equal(p.date, "2017-05-25");
});

test("a date the first reading missed is taken when two other readings agree, with a note", async () => {
  const { parseReceiptPasses } = await import("./receipts.mjs");
  const body = "Coffee 3.50\nTotal 3.50";
  const p = parseReceiptPasses([`CORNER CAFE\n${body}`, `CORNER CAFE\n05/11/18 8:47 PM\n${body}`, `CORNER CAFE\n05/11/18 8:47 PM\n${body}`, `CORNER CAFE\n${body}`]);
  assert.equal(p.date, "2018-05-11");
  assert.ok(p.notes.some((n) => /2 of the other 3 readings give 2018-05-11: check the date/.test(n)));
  assert.ok(!p.notes.includes("no date found"));
});

test("one other reading's date, or a tie, is not taken", async () => {
  const { parseReceiptPasses } = await import("./receipts.mjs");
  const body = "Coffee 3.50\nTotal 3.50";
  assert.equal(parseReceiptPasses([`CAFE\n${body}`, `CAFE\n05/11/18\n${body}`, `CAFE\n${body}`]).date, null);
  assert.equal(parseReceiptPasses([`CAFE\n${body}`, `CAFE\n05/11/18\n${body}`, `CAFE\n05/11/18\n${body}`, `CAFE\n05/17/18\n${body}`, `CAFE\n05/17/18\n${body}`]).date, null);
});

test("the page's settled text carries the agreed date", async () => {
  const { settleReadings } = await import("./photoocr.mjs");
  const body = "Coffee 3.50\nTotal 3.50";
  const s = settleReadings([`CORNER CAFE\n${body}`, `CORNER CAFE\nJun28'17 7:12PM\n${body}`, `CORNER CAFE\nJun28'17 7:12PM\n${body}`]);
  const p = parseReceipt(s.text);
  assert.equal(p.date, "2017-06-28");
  assert.equal(p.merchant, "CORNER CAFE");
  assert.equal(p.cents, 350);
});

test("RapidOCR's glued clock, lost apostrophe and zero for O", () => {
  for (const [line, want] of [
    ["APR04'166:09PM", "2016-04-04"],
    ["Nov12'1605:41PM", "2016-11-12"],
    ["Jun221807:59PM", "2018-06-22"],
    ["0ct011701:44PM", "2017-10-01"],
    ["0ct06'1607:08PM", "2016-10-06"],
    ["16Feb1921:31", "2019-02-16"],
    ["21-Dec-20145:23:42P", "2014-12-21"],
    ["-20:5702MAY.21'19REG0002", "2019-05-21"],
  ]) assert.equal(parseReceipt(receipt(line)).date, want, line);
});

test("a month word followed by digits and no clock is left alone", () => {
  assert.equal(monthWordDate("Add Mayo 2 12"), "Add Mayo 2 12");
  assert.equal(parseReceipt(receipt("Jun2218")).date, null);
});

test("a year past next year is a misread, not a date", () => {
  assert.equal(parseReceipt(receipt("4601/07/17")).date, null);
});
