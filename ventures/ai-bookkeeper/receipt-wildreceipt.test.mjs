// Lines that are not the total, and total words in other languages, found on WildReceipt's
// train photos read by RapidOCR (eval/wildreceipt-2026-11-17.md). Receipt text here is made
// up in the photos' style.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt } from "./receipts.mjs";

test("a savings line after the total is not the total", () => {
  const r = parseReceipt("STORE 12\nSHIRT 2.40\nSUBTOTAL 11.20\nTAX 0.73\nTOTAL $11.93\nAMEX 11.93\nTOTAL SAVED: $44.80");
  assert.equal(r.cents, 1193);
  assert.equal(parseReceipt("MARKET\nMILK 3.29\nTOTAL $25.50\nVISA 25.50\nTOTAL PROMOTIONAL SAVINGS\n4.10").cents, 2550);
  assert.equal(parseReceipt("HARDWARE\nRAKE 99.99\nTOTAL: $108.99\nTotal Sales Discounts $25.01").cents, 10899);
});

test("'total includes GST of' names the tax, not the total", () => {
  assert.equal(parseReceipt("CAFE\nFLAT WHITE 4.50\nMUFFIN 4.00\nTOTAL 8.50\nEFTPOS 8.50\nTOTAL INCLUDES GST OF 0.77").cents, 850);
  assert.equal(parseReceipt("BURGERS\nMEAL 11.98\nTotal (incl Tax) 11.98\nCash 20.00\nChange 8.02\nTOTAL INCLUDES 6% Govt Tax OF 0.68").cents, 1198);
});

test("before-tax totals in French, Spanish and German are not the total", () => {
  assert.equal(parseReceipt("BRASSERIE\nPLAT 45,00\nTotal TTC 60,41\nTVA 10% 5,49\nTotal HT: 54,92").cents, 6041);
  assert.equal(parseReceipt("BAR\nTAPAS 30,00\nTOTAL 34,90 EUR\nIVA 21% 6,06\nTOTAL SIN IVA 28,84 EUR").cents, 3490);
});

test("German Netto is the net amount when it carries cents; Indonesian Netto stays the total", () => {
  assert.equal(parseReceipt("GASTHAUS\n2x Bier 7,00\nNetto(1) Eur 129,75\n+19,0% MwSt: 24,65\nSumme: Eur 154,40").cents, 15440);
  assert.equal(parseReceipt("BACKEREI\nBrot 3,20\nSumme EUR 15,40\nUmsatz 19% netto 12,94\nMwSt 2,46").cents, 1540);
  assert.equal(parseReceipt("WARUNG\nNASI 125,000\nSub Total 125,000\nPB1 12,500\nNetto 137,500\nCash 150,000").cents, 13750000);
});

test("total words in Croatian, Polish, Czech and Turkish", () => {
  assert.equal(parseReceipt("KONOBA\nPIZZA 50.00\nPIVO 14.00\nUKUPNO 134.00\nPRIMLJENO 200.00").cents, 13400);
  assert.equal(parseReceipt("SKLEP\nCHLEB 4,50\nMLEKO 3,20\nRAZEM PLN 21,70\nGOTOWKA 50,00").cents, 2170);
  assert.equal(parseReceipt("OBCHOD\nROHLIK 2,90\nCELKEM 45,80 Kc\nHOTOVE 100,00").cents, 4580);
  assert.equal(parseReceipt("LOKANTA\nCORBA 25,00\nTOPLAM 85,00\nNAKIT 100,00").cents, 8500);
});

test("county and fee tax lines are not totals", () => {
  assert.equal(parseReceipt("DINER\nEGGS 6.50\nSUBTOTAL 8.16\nSTATE TAX 0.32\nTOTAL 8.68\nTOTAL COUNTY TAX 2.500% 0.20").cents, 868);
  assert.equal(parseReceipt("TICKETS\nSEAT 39.06\nOrder Total: $41.75\nTax/Fee Total: $2.69").cents, 4175);
});

test("tax words glued to their rate or to the word before them", () => {
  // RapidOCR drops the space between words more often than tesseract does
  assert.equal(parseReceipt("GROCER\nBREAD 3.00\nSUBTOTAL 20.62\nMwSt19% 4,33 A\nSUMME 24,95").taxCents, 433);
  assert.equal(parseReceipt("HOTEL\nROOM 1084.60\nVAT7% 75.92\nTOTAL 1160.52").taxCents, 7592);
  assert.equal(parseReceipt("DINER\nSUBTOTAL 31.17\nTax1: 2.79\nTOTAL 33.96").taxCents, 279);
  assert.equal(parseReceipt("SHOP\nSUBTOTAL 5.62\nSalesTax $0.38\nTOTAL $6.00").taxCents, 38);
  assert.equal(parseReceipt("CAFE\nSUBTOTAL 102.94\n6%GOVTTAX 6.18\nTOTAL 109.12").taxCents, 618);
  const dash = parseReceipt("STORE\nSUBTOTAL $20.15\nTOTAL-TAX $1.85\nTOTAL $22.00");
  assert.equal(dash.cents, 2200);
  assert.equal(dash.taxCents, 185);
});
