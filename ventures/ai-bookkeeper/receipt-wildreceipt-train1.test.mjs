// Tax lines and currency marks found on WildReceipt's second train shard read by RapidOCR
// (eval/wildreceipt-train1-2026-11-17.md). Receipt text here is made up in the photos' style.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt } from "./receipts.mjs";
import { cleanOcr } from "./cleanocr.mjs";

test("a state tax line glued to its two-letter code is the tax", () => {
  const r = parseReceipt("STORE T-1234\nLAMP 39.99\nSUBTOTAL $42.49\nT=CTTAX 6.3500%on $42.49  $2.70\nTOTAL $45.19\nVISA $45.19");
  assert.equal(r.cents, 4519);
  assert.equal(r.taxCents, 270);
  assert.equal(parseReceipt("STORE\nSOAP 3.49\nSUBTOTAL $9.98\nT=NJTAX7.0000%on  $9.98  $0.70\nTOTAL $10.68").taxCents, 70);
  assert.equal(parseReceipt("STORE\nSOAP 3.49\nSUBTOTAL $4.84\n=C0TAX2.9000%on  $4.84  $0.14\nTOTAL $4.98").taxCents, 14);
});

test("French TVA, Canary IGIC and a rate printed before the word are tax lines", () => {
  assert.equal(parseReceipt("BRASSERIE\nCAFE 2,50\nTVA10.00%  *1.14\nTOTAL TTC  *12.50").taxCents, 114);
  assert.equal(parseReceipt("BAR\nCERVEZA 3,00\nIGIC7%  1.12\nTOTAL  17.12").taxCents, 112);
  assert.equal(parseReceipt("CAFE\nTEA 9.07\nSUBTOTAL 9.07\n20.600TAX  0.98\nTOTAL 10.05").taxCents, 98);
  assert.equal(parseReceipt("DINER\nSOUP 99.00\nSUBTOTAL $99.00\nTAXAMT  $8.16\nTOTAL $107.16").taxCents, 816);
});

test("a net / tax / gross row reads its middle amount as the tax", () => {
  assert.equal(parseReceipt("HOTEL\nROOM 635.00\nNet.Amt  VAT  Amount\nVATABL  566.96  68.04  635.00\nTOTAL 635.00").taxCents, 6804);
  assert.equal(parseReceipt("TABAC\nTOTAL  6,60\nCODE  HTVA  TVA  TTC\nA21,00%  5,45  1,15  6,60").taxCents, 115);
  assert.equal(parseReceipt("PUB\nGrand Total EUR  105.00\n[V.A.T Analysis]\n9.00%  96.33  8.67  105.00").taxCents, 867);
  // net, rate and gross with the tax amount lost: the gross less the net
  assert.equal(parseReceipt("CAFE\nTOTAL:  41.00\nSales-VAT  VAT Rate  VAT Amt  Total\n34.17  20.00%  41.00").taxCents, 683);
  // three amounts that do not add are not a tax row
  assert.equal(parseReceipt("PUB\nTOTAL 20.00\nNet  VAT  Gross\n20.00%  1.50  2.50  3.00").taxCents, null);
});

test("'total includes GST of' gives the tax, glued or not, and is not the total", () => {
  const r = parseReceipt("CAFE\nFLAT WHITE 4.50\nTotal $84.50\nEFTPOS $84.50\nTotalincludes GSTof:  $7.68");
  assert.equal(r.cents, 8450);
  assert.equal(r.taxCents, 768);
  assert.equal(parseReceipt("BAKERY\nPIE 3.90\nEat-In Total (incl GST)  3.90\nTOTAL INCLUDES GST OF  0.26").taxCents, 26);
  assert.equal(parseReceipt("MARKET\nBREAD 4.00\nTOTAL $15.07\nGST INCLUDED IN TOTAL  $1.37").taxCents, 137);
});

test("a savings line read as 'Savin9s' and a misspelt 'VAT included in total' are not the total", () => {
  assert.equal(parseReceipt("ELECTRONICS\nCABLE 83.99\nSubtotal  83.99\nTotal  89.03\nVisa Credit\nTotal Savin9s:  66.00").cents, 8903);
  assert.equal(parseReceipt("SHOP\nITEM 98.10\nTotal:  101.21\nVAT Incuded in total:  16.18").cents, 10121);
});

test("a dollar with its country letters is a dollar, with the $ read or read as S", () => {
  assert.equal(cleanOcr("TOTAL ECS161.04"), "TOTAL $161.04");
  assert.equal(cleanOcr("Total US$12.50"), "Total $12.50");
  assert.equal(cleanOcr("Total USS 12.50"), "Total $12.50");
  assert.equal(cleanOcr("S$8.40"), "$8.40");
  assert.equal(cleanOcr("BUS 12.50"), "BUS 12.50");
  assert.equal(cleanOcr("PLUS 5.00"), "PLUS 5.00");
  assert.equal(parseReceipt("ISLAND MART\nRUM 150.00\nTOTAL ECS161.04\nCASH ECS200.00").cents, 16104);
});

// The four tax misses left in eval/wildreceipt-train1-2026-11-17.md "Next" (2026-11-17, second run).
test("'Total HTVA' is the net before French VAT: two TVA lines add onto it to make the total", () => {
  // the TTC total line lost: before, "Total HTVA 69.06" was read as the total and one TVA line as the tax
  const r = parseReceipt("BRASSERIE\nPLAT 45.73\nVIN 23.33\nTotal HTVA 69.06\nTVA10.00% 45.73) 4.57\nTVA20.00% 23.33) 4.67\n78.30\nCB 78.30");
  assert.equal(r.cents, 7830);
  assert.equal(r.taxCents, 924);
  // "CODE HTVA TVA TTC" stays a tax-table header, not a subtotal
  assert.equal(parseReceipt("TABAC\nTOTAL  6,60\nCODE  HTVA  TVA  TTC\nA21,00%  5,45  1,15  6,60").taxCents, 115);
});

test("a French net / rate / gross row under an OCR-bent 'HT TIC TUA' header, in mixed decimal marks", () => {
  const r = parseReceipt("HOTEL\nLOCAL 412.50\nHT TIC TUA\nLOCAL 412.50 20% 495,00\nTOTAL 495,00");
  assert.equal(r.cents, 49500);
  assert.equal(r.taxCents, 8250);
  // a header with no HT and TTC beside it is not taken as one
  assert.equal(parseReceipt("SHOP\nTUA\nLOCAL 412.50 20% 495,00\nTOTAL 495,00").taxCents, null);
});

test("VAT printed inside a subtotal line is the tax when the total split at that rate gives it", () => {
  const r = parseReceipt("FASTFOOD\nCHICKEN 300.00\nSubtotal(12%VAT) Php32.14\nTOTAL Php300.00\nCASH 300.00");
  assert.equal(r.cents, 30000);
  assert.equal(r.taxCents, 3214);
  // an amount the rate does not give stays a subtotal, not a tax
  assert.equal(parseReceipt("FASTFOOD\nCHICKEN 300.00\nSubtotal(12%VAT) Php31.00\nTOTAL Php300.00").taxCents, null);
});

test("a 0.00 tax on a 0.00 receipt is the tax; a tax equal to a non-zero total is not", () => {
  assert.equal(parseReceipt("FREEBIE\nSAMPLE 0.00\nSUBTOTAL 0.00\nTAX 0.00\nTOTAL 0.00").taxCents, 0);
  assert.equal(parseReceipt("SHOP\nX 5.00\nTAX 5.00\nTOTAL 5.00").taxCents, null);
});
