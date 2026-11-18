// Rules written from CORD-v2's train photos read by tesseract (the CLI's four readings;
// eval/cord-train-photos-2026-11-17.md). Each receipt below is cut down from what OCR
// printed for the named photo; amounts are the photo's own, merchants are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, parseReceiptPasses } from "./receipts.mjs";

test('"SUB. TOTAL" and "SUB, TOTAL" are the subtotal, not the total (train-59)', () => {
  // the photo's total line was lost; the subtotal line must not stand in for it
  assert.equal(parseReceipt("WARUNG\nNASI 22,727\nSUB, TOTAL 22,727\nRESTAURANT TAX 2,273\nVCASH [25,000] 25.000").cents, 2500000);
  assert.equal(parseReceipt("WARUNG\nNASI 22,727\nSUB. TOTAL 22,727\nRESTAURANT TAX 2,273\nCASH 25,000").cents, 2500000);
});

test('"Bayar" (paid) less "Kembali" (change) checks the total, and a cut "Kembal" is still the change (train-45, -31)', () => {
  const a = "KEDAI\n3 Total 29.000\nBayar 52.000\nKembali 30.000";
  const b = "KEDAI\n| 3 Total 22.000\nBayar 52. 000\nKembali 30.000";
  const c = "KEDAI\n3 Total 2? 000\nBayar 52 000\nKembali 30.000";
  assert.equal(parseReceiptPasses([a, b, "KEDAI", c]).cents, 2200000);
  // "Total Bayar" is still the total line, not the cash
  assert.equal(parseReceipt("KEDAI\nTotal Bayar 8,250\nTunai 10,000\nKembalian 1,750").cents, 825000);
  const k = parseReceipt("KEDAI\nTotal 31,500\nCash 40,000\nKembal |\n8,500");
  assert.ok(k.checks.some(([v, w]) => v === 3150000 && w === "cash less change"));
});

test("a whole-unit total under 100 units gets no vote and puts no total in doubt (train-31, -84)", () => {
  const a = "KEDAI\ni Total 10 4\nCash 40,000";
  const b = "KEDAI\nTotal 31,500\nCash 40,000\nKembal |\n8,500";
  const d = "KEDAI\nTotal 3} 900\nCash 40,000\nKembal\n8,500";
  assert.equal(parseReceiptPasses([a, b, "KEDAI\nCASH 40,000", d]).cents, 3150000);
  // three readings agree on 31,000; a fourth's "4 Total event" (4) is no disagreement, so
  // cash less a misread change (40,000 - 5,000) does not replace it
  const t = "KEDAI\n4 Total 31.000\nBayar 40.000\nKembali 5000";
  const e = "KEDAI\n4 Total event\nBayar 40 000\nKembali 3 000";
  assert.equal(parseReceiptPasses([t, t, e, "KEDAI\n4 Total 31.000\nBayar 40 000\nKembali 8. 000"]).cents, 3100000);
  // dollar receipts keep small totals
  assert.equal(parseReceiptPasses(["CAFE\nTotal 4.50", "CAFE\nTotal 4.50", "CAFE\nTotal 4.80"]).cents, 450);
});

test('"CHANGE 26, OOO" is 26,000, and "TOTA 24.000" a total line (train-87)', () => {
  const r = parseReceiptPasses(["KEDAI", "KEDAI\nTOTA 24.000\nCHANGE 26, 000", "KEDAI\nCASH *50, 000\nCHANGE 26, OOO", "KEDAI"]);
  assert.equal(r.cents, 2400000);
  // a change under 100 units on a whole-unit slip is cut short: no cash-less-change check
  assert.ok(!parseReceipt("KEDAI\nTOTAL 24,000\nCASH 50,000\nCHANGE 26").checks.some(([, w]) => w === "cash less change"));
});

test("a long digit run is no amount, and \"Qty: 3 Amount: 262,000\" is the total line (train-64, -193)", () => {
  assert.equal(parseReceipt("TOKO\n8047000270\nKOPI 87,000\n| Qty: 3 Amount: 262,000").cents, 26200000);
  assert.equal(parseReceipt("TOKO\n8991038772194\nROTI 12,000\nSUSU 15,000").cents, 1500000);
});

test("a subtotal at 10% tax checks the total on a slip with a tax line (train-162, -144)", () => {
  const a = "RESTO\nSubtotal Rp 37,800\nTax (10.0%) Rp 3.780\n8,400\n9,600\n1,200";
  const b = "RESTO\nSubtotal Rp 37,800\nTax (10.0%) Rp 3.780\nTotal Rp 41.580";
  assert.equal(parseReceiptPasses([a, b, a, a]).cents, 4158000);
  const t = (x) => `RESTO\nSub Total 22,727\nPB1\nTotal ${x}\nCash 25,000`;
  assert.equal(parseReceiptPasses([t("29,000"), t("25,000"), t("20,000"), "RESTO\nSub Total 22,727"]).cents, 2500000);
});
