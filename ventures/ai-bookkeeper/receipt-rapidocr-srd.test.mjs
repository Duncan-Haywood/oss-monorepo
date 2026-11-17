// Rules written from RapidOCR's parser misses on the choose half of the SRD US receipt photos
// (eval/rapidocr-srd-misses-2026-11-17.md). The slips below are written in the shape those
// readings take, not copied from the photos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt } from "./receipts.mjs";

test("TOTALDUE with its words glued is a total line", () => {
  const p = parseReceipt("Steak  62.00\nSUBTOTAL  142.00\nFood Tax  7.70\nBev Tax  2.24\nTOTALDUE  $154.78\n18%gratuity $25.56\n22% gratuity s31.24");
  assert.equal(p.cents, 15478);
});

test("a French phone number after Tl (Tel) is not a total line", () => {
  const p = parseReceipt("PERRIER  5.80\nTOTAL EURO  *17.00\nH.T. TVA 10%  15.45\nMONTANT TVA 10%  1.55\nTl:01.48.28.44.81\nMERCI");
  assert.equal(p.cents, 1700);
});

test("amounts one row below their words: subtotal plus tax, read shifted, give the total", () => {
  const p = parseReceipt("Glenmont Roll  $20.75\nSalmon R  $13.00\nSubtotal  $5.50\nTax  $86.65\nTotal:  $6.93\n...  $93.58");
  assert.equal(p.cents, 9358);
  assert.equal(p.taxCents, 693);
  assert.ok(p.notes.some((n) => /one row off their words/.test(n)));
  // the subtotal in place, the tax word with no amount and its amount on the total's line
  const q = parseReceipt("SALAD  24.00\nSUBTOTAL  74.49\nTAX\nAMOUNT DUE  5.96\n$80.45");
  assert.equal(q.cents, 8045);
  assert.equal(q.taxCents, 596);
});

test("no shift when the total read already closes, or when the sum is a printed subtotal", () => {
  // the total closes in place: untouched
  assert.equal(parseReceipt("Subtotal  10.00\nTax  0.80\nTotal  10.80\n20.00").cents, 1080);
  // a void after tax: "Sbt1 w/Tax 73.34" above "Amt Due 55.39" is subtotal plus tax in place
  assert.equal(parseReceipt("Subtotal:  $69.90\nVoid:  -$17.95\nTax::  $3.44\nSbt1 w/Tax:  $73.34\nAmt Due:  $55.39").cents, 5539);
  // an earlier Total above a printed gratuity: the last total line stands
  assert.equal(parseReceipt("Subtotal  50.05\n5.46\nTax\n55.51\nTotal  9.01\nGratuity 18.00%  64.52\nTotal\nBalance Due  64.52").cents, 6452);
});
