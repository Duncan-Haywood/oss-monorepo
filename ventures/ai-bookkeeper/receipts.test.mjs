import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { parseReceipt, parseItems, splitReceipts, addReceipts, matchReceipts, attachReceipt, removeReceipt, receiptReport, taxOnReceipts, planReceiptSplit } from "./receipts.mjs";

const books = (rows) => importStatement(newBooks(), "Date,Description,Amount\n" + rows.map(([d, n, a]) => `${d},${n},${a}`).join("\n") + "\n", "1000").books;

const CAFE = `Blue Bottle Coffee
66 Mint Plaza, San Francisco
Tel 415-555-0142
03/14/2026 08:41
Latte            5.50
Croissant        4.25
Subtotal         9.75
Sales Tax        0.87
Total           10.62
Visa ****1234`;

test("a receipt is read into merchant, date, total and tax", () => {
  const r = parseReceipt(CAFE);
  assert.equal(r.merchant, "Blue Bottle Coffee");
  assert.equal(r.date, "2026-03-14");
  assert.equal(r.cents, 1062);
  assert.equal(r.taxCents, 87);
  assert.ok(r.ok);
});

test("subtotal, tip and change lines are never taken as the total", () => {
  const r = parseReceipt("Hardware Hank\n2026-02-02\nSubtotal 40.00\nTax 3.20\nTOTAL 43.20\nCash 50.00\nChange 6.80");
  assert.equal(r.cents, 4320);
  assert.equal(r.taxCents, 320);
});

test("written dates, thousands separators and a missing total line", () => {
  const r = parseReceipt("Acme Supply Co\nInvoice date: March 3, 2026\nWidgets 1,200.00\nFreight 35.50");
  assert.equal(r.date, "2026-03-03");
  assert.equal(r.cents, 120000);
  assert.ok(r.notes.some((n) => /largest amount/.test(n)));
  const g = parseReceipt("Acme\n3 Mar 2026\nGrand Total $1,235.50");
  assert.equal(g.cents, 123550);
});

test("a block without a date is skipped with the reason, not guessed", () => {
  const b = addReceipts(books([["2026-03-14", "BLUE BOTTLE 0412", "-10.62"]]), "Mystery shop\nTotal 12.00");
  assert.equal(b.added.length, 0);
  assert.deepEqual(b.skipped[0].notes, ["no date found"]);
});

test("receipts are separated by a rule line and each pairs with its bank line", () => {
  const b0 = books([["2026-03-15", "SQ *BLUE BOTTLE 0412 OAKLAND CA", "-10.62"], ["2026-03-16", "HARDWARE HANK #22", "-43.20"], ["2026-03-20", "OTHER", "-10.62"]]);
  const text = CAFE + "\n---\nHardware Hank\n2026-03-16\nTotal 43.20";
  assert.equal(splitReceipts(text).length, 2);
  const r = addReceipts(b0, text);
  assert.equal(r.added.length, 2);
  const m = r.books.receipts;
  assert.equal(m[0].matched, b0.transactions[0].id, "the coffee goes to the coffee line, not the later same-amount line");
  assert.equal(m[1].matched, b0.transactions[1].id);
});

test("the same receipt twice is kept once and reported", () => {
  const b0 = books([["2026-03-14", "BLUE BOTTLE", "-10.62"]]);
  const one = addReceipts(b0, CAFE);
  const two = addReceipts(one.books, CAFE);
  assert.equal(two.books.receipts.length, 1);
  assert.equal(two.duplicates.length, 1);
});

test("two receipts for one amount do not share a bank line", () => {
  const b0 = books([["2026-03-14", "BLUE BOTTLE", "-10.62"]]);
  const r = addReceipts(b0, CAFE + "\n---\nPeets Coffee\n03/14/2026\nTotal 10.62");
  const matched = r.books.receipts.filter((x) => x.matched);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].merchant, "Blue Bottle Coffee", "the one whose name is on the line wins");
});

test("a tip on top of the receipt total pairs only when the payee agrees", () => {
  const meal = "Luigi's Trattoria\n2026-04-02\nTotal 80.00";
  const ok = addReceipts(books([["2026-04-03", "LUIGIS TRATTORIA", "-96.00"]]), meal);
  assert.equal(ok.books.receipts[0].tipCents, 1600);
  const no = addReceipts(books([["2026-04-03", "SOMETHING ELSE", "-96.00"]]), meal);
  assert.equal(no.books.receipts[0].matched, null);
  const tooMuch = addReceipts(books([["2026-04-03", "LUIGIS TRATTORIA", "-120.00"]]), meal);
  assert.equal(tooMuch.books.receipts[0].matched, null);
});

test("a bank line outside the date window or a deposit never matches", () => {
  const r = addReceipts(books([["2026-03-30", "BLUE BOTTLE", "-10.62"], ["2026-03-14", "BLUE BOTTLE REFUND", "10.62"]]), CAFE);
  assert.equal(r.books.receipts[0].matched, null);
});

test("the report lists spending over the threshold that has no receipt", () => {
  const b0 = books([["2026-03-14", "BLUE BOTTLE", "-10.62"], ["2026-03-16", "BIG VENDOR", "-250.00"], ["2026-03-17", "SMALL SHOP", "-20.00"]]);
  const b1 = addReceipts(b0, CAFE).books;
  const rep = receiptReport(b1, { minCents: 7500 });
  assert.deepEqual(rep.missing.map((t) => t.desc), ["BIG VENDOR"]);
  assert.equal(rep.missingCents, 25000);
  assert.equal(rep.coveredCents, 1062);
  assert.equal(rep.spendCents, 1062 + 25000 + 2000);
  assert.equal(rep.matched.length, 1);
  assert.equal(receiptReport(b1, { minCents: 1000 }).missing.length, 2);
});

test("attach pins a pair by hand, moves it from another receipt, and survives a re-match", () => {
  const b0 = books([["2026-03-14", "BLUE BOTTLE", "-10.62"], ["2026-03-30", "UNRELATED", "-99.00"]]);
  let b = addReceipts(b0, CAFE).books;
  const id = b.receipts[0].id, far = b0.transactions[1].id;
  b = attachReceipt(b, id, far);
  assert.equal(matchReceipts(b).receipts[0].matched, far);
  b = attachReceipt(b, id, null);
  assert.equal(b.receipts[0].matched, null);
  assert.throws(() => attachReceipt(b, id, "nope"), /no line/);
  assert.throws(() => attachReceipt(b, "r9", far), /no receipt/);
  assert.equal(removeReceipt(b, id).receipts.length, 0);
});

test("an exact amount with a different name and a distant date is not paired; a near date is, marked weak", () => {
  const far = addReceipts(books([["2026-03-20", "UBER TRIP", "-10.62"]]), CAFE);
  assert.equal(far.books.receipts[0].matched, null);
  const near = addReceipts(books([["2026-03-15", "UBER TRIP", "-10.62"]]), CAFE);
  assert.ok(near.books.receipts[0].matched);
  assert.equal(near.books.receipts[0].payeeAgrees, false);
  assert.equal(receiptReport(near.books).weak.length, 1);
});

test("payroll and owner draws are not asked for a receipt", async () => {
  const { confirm } = await import("./engine.mjs");
  let b = books([["2026-03-14", "OWNER DRAW", "-900.00"], ["2026-03-15", "GUSTO NET PAY", "-900.00"], ["2026-03-16", "OFFICE DEPOT", "-900.00"]]);
  b = confirm(b, { [b.transactions[0].id]: "3100", [b.transactions[1].id]: "6150", [b.transactions[2].id]: "6070" });
  assert.deepEqual(receiptReport(b).missing.map((t) => t.desc), ["OFFICE DEPOT"]);
});

test("tax on receipts is summed by month and by the account the line was filed to", async () => {
  const { taxOnReceipts } = await import("./receipts.mjs");
  const b0 = books([["2026-03-14", "BLUE BOTTLE COFFEE", "-10.62"], ["2026-04-02", "HARDWARE HANK", "-43.20"]]);
  const text = `${CAFE}\n---\nHardware Hank\n2026-04-02\nSubtotal 40.00\nTax 3.20\nTotal 43.20\n---\nNo Tax Diner\n2026-04-05\nTotal 20.00`;
  let { books: b } = addReceipts(b0, text);
  b = { ...b, transactions: b.transactions.map((t) => /HANK/.test(t.desc) ? { ...t, posted: "6060" } : t) };
  const t = taxOnReceipts(b);
  assert.equal(t.receipts, 2);
  assert.equal(t.taxCents, 87 + 320);
  assert.deepEqual(t.byMonth.map((m) => [m.month, m.taxCents]), [["2026-03", 87], ["2026-04", 320]]);
  assert.equal(t.byAccount.find((a) => a.code === "6060").taxCents, 320);
  assert.equal(t.rows.find((r) => r.merchant === "Hardware Hank").rate, 0.08);
  assert.equal(t.noTax.length, 1);
  assert.equal(taxOnReceipts(b, { from: "2026-04-01" }).taxCents, 320);
});

const STORE = `Office Depot
2026-05-04
Printer paper      24.99
Stamps book        11.00
Coffee beans       12.50
Subtotal           48.49
Sales Tax           4.00
Total              52.49`;

test("items are read when they add up to the total, and left out when they do not", () => {
  const r = parseReceipt(STORE);
  assert.deepEqual(r.items.map((i) => [i.desc, i.cents]), [["Printer paper", 2499], ["Stamps book", 1100], ["Coffee beans", 1250]]);
  assert.ok(r.itemsOk);
  const bad = parseReceipt(STORE.replace("Total              52.49", "Discount -5.00\nTotal              47.49"));
  assert.equal(bad.items.length, 0);
  assert.ok(bad.notes.some((n) => /not used for a split/.test(n)));
  const incl = parseReceipt("Cafe Uno\n2026-05-04\nSandwich 8.00\nSoda 2.00\nTotal 10.00\nIncludes tax 0.80");
  assert.ok(incl.itemsOk && incl.taxIncluded);
  const tipped = parseReceipt("Luigi's\n2026-05-04\nPasta 20.00\nTax 1.60\nTip 4.00\nTotal 25.60");
  assert.equal(tipped.items.length, 1);
  assert.equal(tipped.tipCents, 400);
});

test("a receipt is split by item with tax shared out so the cents add up", async () => {
  const { splitFromReceipt, planReceiptSplit } = await import("./receipts.mjs");
  let b = addReceipts(books([["2026-05-05", "OFFICE DEPOT 1234", "-52.49"]]), STORE).books;
  const plan = planReceiptSplit(b, b.receipts[0].id);
  assert.equal(plan.line.cents, -5249);
  assert.equal(plan.parts.reduce((a, p) => a + p.cents, 0), -5249);
  assert.deepEqual(plan.parts.map((p) => [p.account, p.cents, p.taxCents]), [["6070", -3896, 297], ["6130", -1353, 103]], "paper and stamps follow the merchant; coffee beans go to meals; $4.00 tax shared 297/103");
  const r = splitFromReceipt(b, b.receipts[0].id);
  const t = r.books.transactions[0];
  assert.equal(t.status, "split");
  assert.deepEqual(t.split, [{ account: "6070", cents: -3896 }, { account: "6130", cents: -1353 }]);
});

test("a split that lands in two accounts posts a split; unknown items need --other", async () => {
  const { splitFromReceipt, planReceiptSplit } = await import("./receipts.mjs");
  const text = "Corner Market\n2026-05-04\nStarbucks coffee 6.00\nUSPS stamps 10.00\nTax 0.00\nTotal 16.00".replace("Tax 0.00\n", "");
  const b = addReceipts(books([["2026-05-04", "CORNER MARKET", "-16.00"]]), text).books;
  const plan = planReceiptSplit(b, "r1");
  assert.equal(plan.unfiled.length, 0, "nothing unknown here");
  assert.deepEqual(plan.parts.map((p) => [p.account, p.cents]), [["6070", -1000], ["6130", -600]]);
  const done = splitFromReceipt(b, "r1");
  assert.equal(done.books.transactions[0].status, "split");
  const odd = addReceipts(books([["2026-05-04", "CORNER MARKET", "-16.00"]]), "Corner Market\n2026-05-04\nWidget 6.00\nGizmo 10.00\nTotal 16.00").books;
  assert.equal(planReceiptSplit(odd, "r1").unfiled.length, 2);
  assert.throws(() => splitFromReceipt(odd, "r1"), /--other/);
  assert.equal(splitFromReceipt(odd, "r1", { other: "6100" }).books.transactions[0].posted, "6100");
  assert.throws(() => planReceiptSplit(books([]), "r1"), /no receipt/);
});

test("items you place by hand are learned, so the next receipt needs no flag", async () => {
  const { splitFromReceipt, planReceiptSplit } = await import("./receipts.mjs");
  const mk = (id, day) => `Corner Market\n2026-05-${day}\nWidget 6.00\nStarbucks coffee 10.00\nTotal 16.00`;
  let b = addReceipts(books([["2026-05-04", "CORNER MARKET", "-16.00"], ["2026-05-06", "CORNER MARKET", "-16.00"]]), mk(1, "04") + "\n---\n" + mk(2, "06")).books;
  const before = JSON.stringify(b.receipts);
  const plan = planReceiptSplit(b, "r1", { fix: { widget: "6100" } });
  assert.deepEqual(plan.parts.map((p) => p.account).sort(), ["6100", "6130"]);
  assert.equal(JSON.stringify(b.receipts), before, "planning leaves the books alone");
  const r = splitFromReceipt(b, "r1", { fix: { widget: "6100" } });
  assert.deepEqual(r.taught.map((t) => [t.desc, t.account]), [["Widget", "6100"]], "only the placed item is taught, not the coffee");
  const next = planReceiptSplit(r.books, "r2");
  assert.equal(next.unfiled.length, 0, "Widget now has an account");
  assert.deepEqual(next.parts.map((p) => p.account).sort(), ["6100", "6130"]);
  assert.equal(splitFromReceipt(b, "r1", { fix: { widget: "6100" }, learn: false }).taught.length, 0);
});

// foreign-currency receipts
const PARIS = (d, tot, tax) => `Café de Flore
2 rue Test, Paris
${d}
Café crème      € 4.00
Tartine         € 6.00
TVA             € ${tax}
Total           € ${tot}`;

test("a receipt in another currency is read with its code", () => {
  const r = parseReceipt(PARIS("2026-03-10", "11.00", "1.00"));
  assert.equal(r.currency, "EUR");
  assert.equal(r.cents, 1100);
  assert.equal(parseReceipt(CAFE).currency, null);
  assert.equal(parseReceipt("Pret\n2026-03-10\nTotal GBP 12.40").currency, "GBP");
});

test("a euro receipt matches a dollar card line by the implied rate", () => {
  const b0 = books([["2026-03-11", "CAFE DE FLORE PARIS", "-11.90"], ["2026-03-11", "SOMETHING ELSE", "-11.00"]]);
  const { books: b, added } = addReceipts(b0, PARIS("2026-03-10", "11.00", "1.00"));
  assert.equal(added[0].currency, "EUR");
  const r = b.receipts[0];
  assert.equal(r.matched, b.transactions.find((t) => /FLORE/.test(t.desc)).id);
  assert.ok(Math.abs(r.fxRate - 1.081818) < 1e-4);
});

test("a given rate rules out a coincidence of a different size", () => {
  const b0 = books([["2026-03-11", "CAFE DE FLORE PARIS", "-30.00"]]);
  const { books: b } = addReceipts({ ...b0, fxRates: { EUR: 1.08 } }, PARIS("2026-03-10", "11.00", "1.00"));
  assert.equal(b.receipts[0].matched, null);
  const ok = matchReceipts({ ...b, receipts: b.receipts }, { rates: { EUR: 2.7 } });
  assert.ok(ok.receipts[0].matched, "a rate that fits 30.00 / 11 matches");
});

test("tax on a euro receipt is counted in dollars at the line's rate; split is in dollars", () => {
  const b0 = books([["2026-03-11", "CAFE DE FLORE PARIS", "-11.90"]]);
  const { books: b } = addReceipts(b0, PARIS("2026-03-10", "11.00", "1.00"));
  const t = taxOnReceipts(b);
  assert.equal(t.taxCents, 108);
  const plan = planReceiptSplit(b, "r1", { other: "6150" });
  assert.equal(plan.parts.reduce((a, p) => a + p.cents, 0), -1190);
  const none = taxOnReceipts({ ...b, receipts: [{ ...b.receipts[0], matched: null }] });
  assert.equal(none.taxCents, 0);
  assert.ok(none.noTax[0].note);
});

test("decimal-comma receipts and dotted day-first dates are read", async () => {
  const { commaStyle } = await import("./receipts.mjs");
  const r = parseReceipt("Bäckerei Schmidt\nHauptstr. 5, Berlin\n04.05.2026 09:12\nBrötchen 3,20 EUR\nKuchen 12,50 EUR\nZwischensumme 15,70 EUR\nMwSt 19% 2,51 EUR\nGesamt 18,21 EUR");
  assert.equal(r.date, "2026-05-04");
  assert.equal(r.cents, 1821, "Gesamt is the total, Zwischensumme is not");
  assert.equal(r.taxCents, 251);
  assert.equal(r.merchant, "Bäckerei Schmidt");
  assert.equal(r.currency, "EUR");
  assert.equal(parseReceipt("Shop\n1.234,56\nTotal 1.234,56").cents, 123456, "a dot thousands separator");
  assert.ok(commaStyle("Total 12,50"));
  assert.ok(!commaStyle("Total 12.50\n04.05.2026"), "a dotted date is not an amount");
  assert.ok(!commaStyle("Total 1,234.50"));
  assert.equal(parseReceipt(CAFE).cents, 1062, "dot receipts are unchanged");
});

test("a decimal-comma receipt's items split like any other", async () => {
  const { planReceiptSplit } = await import("./receipts.mjs");
  const text = "Corner Market\n2026-05-04\nStarbucks coffee 6,00\nUSPS stamps 10,00\nTotal 16,00";
  const b = addReceipts(books([["2026-05-04", "CORNER MARKET", "-16.00"]]), text).books;
  assert.deepEqual(b.receipts[0].items.map((i) => i.cents), [600, 1000]);
  assert.equal(planReceiptSplit(b, "r1").parts.length, 2);
});

test("OCR slips in pasted receipt text are repaired by the parser", () => {
  const r = parseReceipt("Blue Bottle Coffee\n03/14/2026\nLatte 5 .50\nCroissant 4.25\nSales Tax O.87\nTOTAL S10.62");
  assert.equal(r.cents, 1062);
  assert.equal(r.taxCents, 87);
  assert.equal(parseReceipt("Route 66 Diner\n2026-03-01\nTotal 12.50").cents, 1250);
});

test("a phone-number first line is not the merchant, and a day/100 date is not a date", () => {
  const r = parseReceipt("Tel 555-123-4567\nCorner Cafe\n2026-03-10\nTotal 5.00");
  assert.equal(r.merchant, "Corner Cafe");
  assert.equal(parseReceipt("Shop\n10/100/2026\nTotal 5.00").date, null);
});

test("without a given rate, a card line five times or more the receipt is not a match", () => {
  const b0 = books([["2026-03-11", "CAFE DE FLORE PARIS", "-60.00"]]);
  const { books: b } = addReceipts(b0, PARIS("2026-03-10", "11.00", "1.00"));
  assert.equal(b.receipts[0].matched, null);
});

test("item descriptions collapse a double space but keep a single one", () => {
  const items = parseItems(["Green  tea bags   3.50"]);
  assert.equal(items[0].desc, "Green tea bags");
});

test("one card charge for several receipts matches them as a group, only when the sum is unique", () => {
  const slips = "Hardware Hank\n2026-03-10\nTotal 20.00\n---\nHardware Hank\n2026-03-11\nTotal 15.50\n---\nHardware Hank\n2026-03-11\nTotal 4.50";
  const b0 = books([["2026-03-12", "HARDWARE HANK #12", "-35.50"], ["2026-03-12", "PAYROLL CO", "-900.00"]]);
  const b = matchReceipts(addReceipts(b0, slips).books);
  const t = b.transactions.find((x) => /HARDWARE/.test(x.desc));
  const grouped = b.receipts.filter((r) => r.matched === t.id);
  assert.deepEqual(grouped.map((r) => r.cents).sort((a, c) => a - c), [1550, 2000]);
  assert.ok(grouped.every((r) => r.group === 2));
  assert.equal(b.receipts.find((r) => r.cents === 450).matched ?? null, null);
  // 20.00 + 15.50 and 20.00 + 4.50 + ... two ways to reach one total: leave it for the person
  const amb = addReceipts(b0, "Hardware Hank\n2026-03-10\nTotal 20.00\n---\nHardware Hank\n2026-03-11\nTotal 15.50\n---\nHardware Hank\n2026-03-11\nTotal 15.50\n---\nHardware Hank\n2026-03-11\nTotal 20.00").books;
  const m = matchReceipts({ ...amb, transactions: amb.transactions.map((x) => x.desc.includes("HARDWARE") ? { ...x, cents: -3550 } : x) });
  assert.ok(m.receipts.every((r) => !r.matched));
  // unrelated payee: a coincidental sum is not offered
  const other = addReceipts(b0, "Cafe One\n2026-03-10\nTotal 20.00\n---\nCafe Two\n2026-03-11\nTotal 15.50").books;
  assert.ok(matchReceipts(other).receipts.every((r) => !r.matched));
});
