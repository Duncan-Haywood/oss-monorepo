// The tax on a receipt, read from one text and settled across several OCR readings of
// one photo (README, "Tax on receipt photos"). Shapes found on ExpressExpense's US
// receipt photos (eval/srd) through tesseract.js; the receipt text below is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, parseReceiptPasses, readTax } from "./receipts.mjs";
import { settleReadings } from "./photoocr.mjs";

const R = (body) => `CORNER DINER\nDate: 03/14/2024\n${body}`;

test("a rate printed beside the tax is not the amount", () => {
  assert.equal(parseReceipt(R("Burger 12.67\nTax 8.75% 1.11\nTotal 13.78")).taxCents, 111);
  assert.equal(parseReceipt(R("Sales Tex (10.25%) 1.23\nTotal 13.22")).taxCents, 123);
  // a rate alone, the amount unreadable: never 8.75; the total split at 8.75% is 12.67 +
  // 1.11, and the line's digits "1.1" agree, so 1.11 with a note (2026-11-16)
  const r = parseReceipt(R("Tax 8.75% 1.1\nTotal 13.78"));
  assert.equal(r.taxCents, 111);
  assert.ok(r.notes.some((n) => /split at 8.75%/.test(n)));
  assert.equal(parseReceipt(R("Tax 8.75% 2.1\nTotal 13.78")).taxCents, null);
});

test("Taxes, TXTL and Hawaii's GET are tax lines; Taxable and w/Tax are not", () => {
  assert.equal(parseReceipt(R("Taxable: 40.50\nTaxes: 3.85\nTotal Due 44.35")).taxCents, 385);
  assert.equal(parseReceipt(R("NET 8.75\nTXTL 0.75\nTOTL 9.50")).taxCents, 75);
  assert.equal(parseReceipt(R("HI HNLKO 4.712% GET 1.86\nTotal 41.33")).taxCents, 186);
  // the subtotal with tax after the tax line used to overwrite it, then be dropped as the total
  assert.equal(parseReceipt(R("Sbtl 10.00\nTax:: $0.70\nSbt1 w/Tax: $10.70\nAmt Due: $10.70")).taxCents, 70);
  assert.equal(parseReceipt(R("Tax ID 12-3456789\nTotal 9.50")).taxCents, null);
});

test("Tax IDR and tax included are still tax lines", () => {
  assert.equal(readTax(["Total IDR 215,985", "Tax IDR 19,635"], "whole", 21598500).cents, 1963500);
  assert.equal(readTax(["Subtotal: 165.00", "Total Tax Included: 15.00", "Total: 165.00"], false, 16500).cents, 1500);
});

test("a printed Total Tax wins over the lines it adds up", () => {
  assert.equal(parseReceipt(R("Subtotal 30.00\nFood Tax 1.74\nLiquor Tax 0.00\nTotal Tax 1.74\nTotal 31.74")).taxCents, 174);
});

test("two tax lines are added when the subtotal plus their sum is the total", () => {
  const r = parseReceipt(R("Subtotal 40.00\nSales Tax 2.80\nResort Tax 0.80\nTotal 43.60"));
  assert.equal(r.taxCents, 360);
  assert.ok(r.notes.some((n) => /2 tax lines added/.test(n)));
  // without that check the last line stands, as before
  assert.equal(parseReceipt(R("Sales Tax 2.80\nResort Tax 0.80\nTotal 50.80")).taxCents, 80);
});

test("a tax line whose decimal point was lost is read, with a note", () => {
  const r = parseReceipt(R("Subtotal 167.00\nTax 12,94\nTotal 179.94"));
  assert.equal(r.taxCents, 1294);
  assert.ok(r.notes.some((n) => /decimal point lost/.test(n) && /check the tax/.test(n)));
  assert.equal(parseReceipt(R("Total Tax 2:29\nTotal 30.29")).taxCents, 229);
  assert.equal(parseReceipt(R("TXTL .75\nTOTL 9.50")).taxCents, 75);
  // a time is not a tax
  assert.equal(parseReceipt(R("Tax 10:45\nTotal 9.50")).taxCents, null);
});

test("several readings vote on the tax; the subtotal's arithmetic counts double", () => {
  const p = parseReceiptPasses([R("TAX: Vea\nTotal 14.36"), R("Subtotal 13.50\nTAX: 0.86\nTotal 14.36"), R("TAX: ie\nTotal 14.36")]);
  assert.equal(p.taxCents, 86);
  // two readings say 4.60, one says 4.68 and the subtotal confirms it
  const q = parseReceiptPasses([R("Subtotal 47.22\nTax 1: 4.60\nTotal 51.90"), R("Tax 1: 4.60\nTotal 51.90"), R("Subtotal 47.22\nTax 1: 4.68\nTotal 51.90")]);
  assert.equal(q.taxCents, 468);
});

test("a voted tax one digit from total less subtotal takes the difference", () => {
  const p = parseReceiptPasses([R("Sub Total 38.95\nTax: 8.21\nTotal 42.16"), R("Sub Total 38.95\nTotal 42.16"), R("Total 42.16")]);
  assert.equal(p.taxCents, 321);
});

test("no reading has a tax: total less a subtotal, when it is under 15% of the subtotal", () => {
  assert.equal(parseReceiptPasses([R("Subtotal 40.00\nTax ???\nTotal 43.60"), R("Subtotal 40.00\nTotal 43.60"), R("Total 43.60")]).taxCents, 360);
  // a service charge makes the gap too large to be a tax
  assert.equal(parseReceiptPasses([R("Subtotal 40.00\nTotal 50.80"), R("Subtotal 40.00\nTotal 50.80"), R("Total 50.80")]).taxCents, null);
});

test("over 22% of the settled total is not a tax", () => {
  assert.equal(parseReceiptPasses([R("Total 615.00"), R("Total 615.00"), R("Sales Tax 152.00\nTotal 615.00")]).taxCents, null);
});

test("the page puts the voted tax into the receipts box and says so", () => {
  const readings = [R("Burger 13.50\nTAX: Vea\nTotal 14.36"), R("Burger 13.50\nTAX: 0.86\nTotal 14.36"), R("Burger 13.50\nTAX: 0.86\nTotal 14.36")];
  const s = settleReadings(readings);
  assert.equal(parseReceipt(s.text).taxCents, 86);
  assert.equal(parseReceipt(s.text).cents, 1436);
  assert.match(s.taxNote, /kept 0\.86/);
  assert.equal(s.note, null);
  // the first reading's tax agrees: the text is the first reading, no tax note
  const same = settleReadings([readings[1], readings[0]]);
  assert.equal(same.taxNote, undefined);
});

// 2026-11-15, second pass (eval/receipt-tax-labels-2026-11-15.md)
test("a Tax label with its first letter misread, between the subtotal and the total", () => {
  assert.equal(parseReceipt(R("SubTotal 3.99\n[ax 0.30\nGratuity 1.00\nTotal 5.29")).taxCents, 30);
  assert.equal(parseReceipt(R("SUB TOTAL : 16.39\nfax 1: 1.36\nTOTAL: 17.75")).taxCents, 136);
  assert.equal(parseReceipt(R("Food Subtotal: 9.79\nflax 1: 0.46\nTotal 10.25")).taxCents, 46);
  // the 1 that numbers the line is not an amount; a truncated "3.5" is not read
  assert.equal(parseReceipt(R("SUB TOTAL: 44.20\nfax 1: 3.5\nTotal 47.70")).taxCents, null);
  // above the subtotal it is the header's fax number, never a tax
  assert.equal(parseReceipt(R("Fax 555-0134 2.50\nSubtotal 10.00\nTotal 10.80")).taxCents, null);
  // a real tax line still wins
  assert.equal(parseReceipt(R("Subtotal 10.00\nfax 0.50\nTax 0.80\nTotal 10.80")).taxCents, 80);
});

test("an unlabelled amount the subtotal makes the total is the tax", () => {
  const r = parseReceipt(R("TAXABLE SALES $25.85\nGo's THY $2.46\nTL $28.31"));
  assert.equal(r.taxCents, 246);
  assert.ok(r.notes.some((n) => /unlabelled line/.test(n)));
  assert.equal(readTax(["SUB TOTAL 30,000", "AMOUNT 2,727", "TOTAL 32,727"], "whole", 3272700).cents, 272700);
  // a gap the line does not close is left alone
  assert.equal(parseReceipt(R("Subtotal 25.85\nCoupon 2.00\nTotal 28.31")).taxCents, null);
});

test("a zero second tax line does not replace the first", () => {
  assert.equal(parseReceipt(R("SUB TOTAL: 66.89\nTax 1: 6.35\nTax 2: 0.00\nTotal: 73.24")).taxCents, 635);
  assert.equal(parseReceipt(R("Subtotal 5.00\nTax 0.00\nTotal 5.00")).taxCents, 0);
});

test("Sub/Ttl is a subtotal", () => {
  assert.equal(parseReceiptPasses([R("Sub/Tt] 12.67\nTax 8.75% 1.1\nTotal 13.78"), R("Sub/Ttl 12.67\nTotal 13.78"), R("Total 13.78")]).taxCents, 111);
});

test("a tax line holding the subtotal's amount, the tax on the line below", () => {
  const r = parseReceipt(R("Subtotal\nTax $21.50\n$1.37\nTotal 22.87"));
  assert.equal(r.taxCents, 137);
  assert.ok(r.notes.some((n) => /subtotal's amount/.test(n)));
});

test("two subtotals one digit apart: the one most readings read sets the tax", () => {
  const p = parseReceiptPasses([R("subtotal $28.48\nTotal $30.76"), R("Subtotal $28.47\nTotal $30.76"), R("subtotal $28.48\nTotal $30.76"), R("subtotal $28.48\nTax 2.20\nTotal $30.76")]);
  assert.equal(p.taxCents, 228);
});

test("tax lines printed together whose label OCR lost are added when the items or subtotal close the total", () => {
  // SRD photo 1173's shape: "IL Sales" and "Restaurant" lost the word tax, MPEA kept it
  const r = parseReceipt(R("1 Bottled Water $2.45\n1 Pollo Taco $4.95\n1 Carnitas Taco $4.95\n1 Sour Cream $1.25\n1 Cheese $1.25\nCTT et otal eA\nIL Sales $1.52\nMPEA Tax $0.15\nRestaurant $0.04\nTOTAL: $16.56"));
  assert.equal(r.taxCents, 171);
  assert.ok(r.notes.some((n) => /3 lines beside the tax line/.test(n) && /check the tax/.test(n)));
  // the lines taken as taxes are not items, so the five things bought split the receipt
  assert.equal(r.itemsOk, true);
  assert.deepEqual(r.items.map((i) => i.cents), [245, 495, 495, 125, 125]);
  assert.ok(!r.notes.some((n) => /items add to/.test(n)));
  // a subtotal line closes it too
  assert.equal(parseReceipt(R("Subtotal 40.00\nSales Tax 2.80\nResort 0.80\nTotal 43.60")).taxCents, 360);
});

test("a service charge, rounding or tip beside the tax line is not a tax", () => {
  assert.equal(parseReceipt(R("Subtotal 65.00\nPB1 (10%) 6.50\nSC (3%) 1.95\nTotal 73.45")).taxCents, 650);
  assert.equal(parseReceipt(R("Subtotal 45.00\nPB1 (10%) 4.50\nRounding 0.01\nTotal 49.51")).taxCents, 450);
  assert.equal(parseReceipt(R("Subtotal 40.00\nSales Tax 2.80\nGratuity 7.20\nTotal 50.00")).taxCents, 280);
  // nothing closes the sum: the tax line stands alone
  assert.equal(parseReceipt(R("Subtotal 40.00\nSales Tax 2.80\nResort 0.85\nTotal 43.60")).taxCents, 280);
});

test("the subtotal plus the taxes may close to a Total printed before a tip", () => {
  const r = parseReceipt(R("Sub-total: 40.00\nSales Tax 7%: 2.80\nResort Tax 2%: 0.80\nTotal: 43.60\nGratuity 18%: 7.20\nTotal 50.80"));
  assert.equal(r.taxCents, 360);
});

test("one reading's tax lines added, checked against another reading's subtotal", () => {
  // SRD photo 1182: the reading with both tax lines lost the subtotal line
  const p = parseReceiptPasses([R("Sales Tax 7%: 2.80\nResort Tax 2%: 0.80\nTotal: 43.60"), R("Sub-total: 40.00\nSales Tax 7%: 2.80\nResort Tax 2%: 0.60\nTotal 43.60"), R("Sub-total: 40.00\nSales Tax 7%: 2 80\nResort fax 2%: an\nTotal: 43.60")]);
  assert.equal(p.taxCents, 360);
});

test("summary lines printed under the total (Food, Beverage) do not stop the item split", () => {
  // SRD photo 1173 as the CLI's tesseract reads it: the items again by kind, under TOTAL
  const r = parseReceipt(R("1 Bottled Water $2.45\n1 Pollo Taco $4.95\n1 Carnitas Taco $4.95\n1 Sour Cream $1.25\n1 Cheese $1.25\nNet Total: $1485\nIL Sales $1.52\nMPEA Tax $0.15\nRestaurant $0.04\nTOTAL: $16.56\nFood: $12.40\nBeverage: $2.45"));
  assert.equal(r.itemsOk, true);
  assert.deepEqual(r.items.map((i) => i.cents), [245, 495, 495, 125, 125]);
  // a suggested-gratuity table under the total (SRD 1065)
  const g = parseReceipt(R("Chicken $15.00\nPescado $18.00\nSubtotal: $42.50\nTotal Tax: $3.29\nTotal: $36.29\nSuggested Gratuity\n18.00% of sale: $7.65 = $53.44"));
  assert.equal(g.itemsOk, true);
  assert.equal(g.items.length, 2);
  // OCR's "Subtota |" is not an item (SRD 1175)
  assert.ok(!parseReceipt(R("Whiskey 6.25\nSubtota | 6.25\nTax 1.31\nTotal 7.56")).items.some((i) => /subtota/i.test(i.desc)));
});

test("the lines above the subtotal are not tried against a guessed total", () => {
  // SRD photo 1160: no total line read, the largest amount is the subtotal itself
  const r = parseReceipt(R("1 Sprite 2.55\n1 Chicken Caesar Salad 8.95\n1 Chefs Special 19.95\nFood Subtotal: 31.45\nSoup 0.00 extra 4.00"));
  assert.ok(r.notes.some((n) => /largest amount/.test(n)));
  assert.equal(r.itemsOk, false);
});

test("a tax line's amount with the decimal point lost is read when a subtotal plus it is a total", () => {
  // SRD photo 1012: "TAX 211", then a Total before the tip
  const r = parseReceipt(R("Subtotal 22.25\nTAX 211\nTotal 24.36\nTip 8.90\nTotal $33.26"));
  assert.equal(r.taxCents, 211);
  assert.ok(r.notes.some((n) => /decimal point lost/.test(n)));
  // nothing closes: no tax is guessed from the digits
  assert.equal(parseReceipt(R("Subtotal 22.25\nTAX 211\nTotal $33.26")).taxCents, null);
});

test("a tax line's printed rate gives the tax when the receipt closes with it", () => {
  // the subtotal at the printed rate makes the total
  assert.equal(parseReceipt(R("Subtotal 18.00\nTAX 8.00% a)\nTotal 19.44")).taxCents, 144);
  // SRD photo 1064: no subtotal read; 19.44 at 8% splits 18.00 + 1.44 and the line kept "44"
  assert.equal(parseReceipt(R("Burger 18.00\nTAX 8.00% 44\nTotal 19.44")).taxCents, 144);
  // the line's digits disagree with the split: no tax
  assert.equal(parseReceipt(R("Burger 18.00\nTAX 8.00% 57\nTotal 19.44")).taxCents, null);
  // no digits to agree with (SRD photo 1018): no tax
  assert.equal(parseReceipt(R("Taco 2.00\nTAX 8.25% *=\nTotal 2.17")).taxCents, null);
});

test("OCR's misspelt Subtotal and Total are read (Suototal, Subtota |, Tota], 146..57)", () => {
  // SRD photo 1061: "Suototal" kept the subtotal from the tax's own check
  const p = parseReceiptPasses([R("Suototal 24.08\nTotal Tax 2.25\nTotal 26.37"), R("Suctotal 24.08\nTotal Tax pg)\nTotal a7"), R("Suototal 24.08\nTotal Tax 2.239\nTotal 2.37")]);
  assert.equal(p.taxCents, 229);
  // SRD photo 1076: "Grand Tota] $25.78" is the total
  const r = parseReceipt(R("Subtota | $20.00\nTotal Taxes $2.18\nGrand Tota] $25.78"));
  assert.equal(r.cents, 2578);
  assert.equal(r.taxCents, 218);
  assert.equal(parseReceipt(R("SUBTOTAL: 134.46\nTax(9%) 12.11\nTOTAL: 146..57")).cents, 14657);
});
