// Rules written from CORD-v2's train shards 1-3 (600 photos) read by tesseract (the CLI's four
// readings; eval/cord-train-shards-2026-11-17.md). Each receipt below is cut down from what OCR
// printed for the named photo; amounts are the photo's own, merchants are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, parseReceiptPasses } from "./receipts.mjs";
import { settleReadings } from "./photoocr.mjs";

test('a whole-unit total read as "6.008" is 6,000 when a reading prints 6.000 (train-406)', () => {
  const a = "KEDAI\nNu Greentea 330\nx 8.000 6.000\nSubtotal 5 000\nPajak\nTotal 6.008\nTunal 6.008,";
  const b = "KEDAI\nNu Greentea 330\nx #6 .000 6.000\nubtota) 6.060\nPajak\nTotal 6.00\nTunal s";
  const c = "KEDAI\nx #6 .000 6.000\nSubtotal 7h eo\nPajak\nTotal 6.00\nTuna| 5.00g";
  const r = parseReceiptPasses([a, b, c, "ae _——s 4"]);
  assert.equal(r.cents, 600000);
  assert.match(r.notes.join(" "), /ends in 008/);
  // the page's settled text reads the same total back
  assert.match(settleReadings([a, b, c, "ae _——s 4"]).text, /Total 6\.000/);
});

test("the amount before rounding is not the total (train-400), and a real 6,008 no reading shows as 6,000 stands", () => {
  const t = (x) => `TOKO\nKOPI 55,000\nROTI 55,003\nBefore Rounding 110,003\n${x} 110,000\nBCA ECR: 110,000`;
  assert.equal(parseReceiptPasses([t("TAtal...>.-"), t("Tigtalics is:"), t("Tetel"), t("Fe |")]).cents, 11000000);
  const k = "KEDAI\nTEH 6,008\nTotal 6,008\nCash 10,000\nChange 3,992";
  assert.equal(parseReceiptPasses([k, k, k, k]).cents, 600800);
  // dollar receipts are left alone
  const d = "CAFE\nTotal 10.03\nCash 20.00";
  assert.equal(parseReceiptPasses([d, d, "CAFE\nTotal 10.00", d]).cents, 1003);
});

test("a whole-unit total with no line of its own goes into the page's text as 110,000, not 110000.00 (train-400)", () => {
  const t = (x) => `TOKO\nKOPI 55,000\nROTI 55,003\nBefore Rounding 110,003\n${x} 110,000\nBCA ECR: 110,000`;
  // (no reading's word is total-like: since 2026-11-17 "TAtal" and "Tetel" read as a total
  // line themselves, eval/rapidocr-parser-misses-2026-11-17.md, and the page keeps that line)
  const s = settleReadings([t("Tigtalics is:"), t("Fe |"), t("Igtal:"), t("Fe |")]);
  assert.match(s.text, /^Total 110,000$/m);
  assert.equal(parseReceipt(settleReadings([t("TAtal...>.-"), t("Tigtalics is:"), t("Tetel"), t("Fe |")]).text).cents, 11000000);
  assert.doesNotMatch(s.note, /disagree/);
  // a total under 100 units keeps the old line (it does not read back, so the page warns)
  const tiny = settleReadings(["TOKO\nCASH 37,000\nCHANGE 700", "TOKO\nTotal 1", "TOKO\nTotal 1", "TOKO"]);
  assert.doesNotMatch(tiny.text, /^Total 1$/m);
});
