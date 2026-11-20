import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());

test("the sample reconciles: rows add up to the deposit row and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 34270);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a payout spanning a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-03"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 34270);
});

test("gross sales and Gumroad fees are booked separately, not as the net deposit", () => {
  const sept = ok().journals[0];
  assert.equal(sept.lines.find((l) => l.category === "sales").credit, 2900 + 14900 + 1900);
  assert.equal(sept.lines.find((l) => l.category === "fees").debit, 370 + 1540 + 235);
});

test("shipping income gets its own line and a refunded sale books a refund and keeps the fee", () => {
  const oct = ok().journals[1];
  assert.equal(oct.lines.find((l) => l.category === "shipping").credit, 650);
  assert.equal(oct.lines.find((l) => l.category === "refunds").debit, 2900);
  assert.equal(oct.lines.find((l) => l.category === "fees").debit, 1540 + 370 + 425);
});

test("split none keeps one journal for the whole payout", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, 34270);
});

test("the broken sample names the mismatch, the bad amount and the sale whose parts do not add up", () => {
  const f = validate(sampleBrokenReport()).findings;
  const titles = f.map((x) => x.title).join("\n");
  assert.match(titles, /rows add up to 312\.45 USD but the payout is 342\.70 USD/);
  assert.match(titles, /An amount on S1007 is not a number/);
  assert.match(titles, /Parts do not add up to the net total on S1006/);
});

test("a sale whose parts do not explain its net is journalled to uncategorised, never dropped", () => {
  const j = validate(sampleBrokenReport()).journals.flatMap((x) => x.lines);
  assert.equal(j.find((l) => l.category === "uncategorised").debit, 200);
});

test("tax you collected is a liability only when the row's own arithmetic says it was paid out", () => {
  const head = "Sale ID,Item Name,Date,Price,Shipping,Taxes,Fees,Net Total,Payout ID\n";
  const inNet = validate(head + "a,x,2026-09-10,100.00,0.00,8.00,13.00,95.00,1\n", { expected: 9500 });
  assert.equal(inNet.journals[0].lines.find((l) => l.category === "tax").credit, 800);
  assert.equal(inNet.reconciliation[0].agrees, true);
  const remitted = validate(head + "a,x,2026-09-10,100.00,0.00,8.00,13.00,87.00,1\n", { expected: 8700 });
  assert.equal(remitted.journals[0].lines.some((l) => l.category === "tax"), false);
  assert.equal(remitted.findings.filter((f) => f.severity === "error").length, 0);
});

test("without a deposit row the deposit can be supplied, and a wrong one is an error", () => {
  const bare = buildReport({ items: [["2026-09-10", "x", 100, 10, false]], withPayoutRow: false });
  const warn = validate(bare);
  assert.equal(warn.reconciliation[0].agrees, null);
  assert.ok(warn.findings.some((f) => /no payout row and no expected deposit/.test(f.title)));
  assert.equal(validate(bare, { expected: 9000 }).reconciliation[0].agrees, true);
  assert.ok(validate(bare, { expected: 9500 }).findings.some((f) => f.severity === "error"));
});

test("an export with no payout column is one group the deposit can be checked against", () => {
  const csv = "Sale ID,Date,Price,Fees,Net Total\na,2026-09-10,50.00,5.00,45.00\nb,2026-09-11,50.00,5.00,45.00\n";
  const r = validate(csv, { expected: 9000 });
  assert.equal(r.payouts.length, 1);
  assert.equal(r.reconciliation[0].agrees, true);
});

test("rows with no payout id are grouped apart and warned about", () => {
  const csv = sampleReport().replace("S1001,Notion template pack,2026-09-28 12:00:00,29.00,0.00,0.00,3.70,25.30,USD,false,P-2026-10", "S1001,Notion template pack,2026-09-28 12:00:00,29.00,0.00,0.00,3.70,25.30,USD,false,");
  assert.ok(validate(csv).findings.some((f) => /no payout ID/.test(f.title)));
});

test("amounts parse US, European and thousands-separated forms to cents", () => {
  assert.equal(parseAmount("12.34"), 1234);
  assert.equal(parseAmount("-12,34"), -1234);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
});

test("dates parse ISO with a time suffix, dotted European, and slashed per the chosen order", () => {
  assert.equal(parseDate("2026-09-28 12:00:00"), "2026-09-28");
  assert.equal(parseDate("28.09.2026"), "2026-09-28");
  assert.equal(parseDate("09/28/2026"), "2026-09-28");
  assert.equal(parseDate("28/09/2026", "dmy"), "2026-09-28");
  assert.equal(parseDate("31.02.2026"), null);
});


test("a file without the sales columns is refused with a pointer to the right export", () => {
  const r = validate("date,amount\n2026-01-01,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Analytics > Sales/);
});

test("two payouts in one file are journalled separately", () => {
  const a = buildReport({ id: "11", items: [["2026-09-10", "a", 10, 1, false]], withPayoutRow: true });
  const b = buildReport({ id: "22", items: [["2026-09-20", "b", 20, 2, false]], withPayoutRow: true });
  const r = validate(a + b.split("\n").slice(1).join("\n"));
  assert.equal(r.payouts.length, 2);
  assert.deepEqual(r.reconciliation.map((x) => x.stated), [900, 1800]);
});

test("tab-separated exports and a BOM are read", () => {
  const tsv = "\ufeff" + sampleReport().replace(/,/g, "\t");
  assert.equal(validate(tsv).reconciliation[0].agrees, true);
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("sales = 200\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.sales, "200");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,200,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().sales, "Gumroad Sales");
});

test("Xero export: debits positive, credits negative, columns as the manual journal import expects", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^Gumroad payout P-2026-10 2026-09,30\/09\/2026,Product sales \(gross\) \(3 rows\),Gumroad Sales,Tax Exempt,-197\.00$/);
  const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^P-2026-10-2026-09,09\/30\/2026,Gumroad Sales,,197\.00,/);
});

test("IIF export: every transaction's lines sum to zero and end with ENDTRNS", () => {
  const blocks = toIif(ok().journals).split("ENDTRNS").slice(1, -1);
  assert.equal(blocks.length, 2);
  for (const b of blocks) {
    const amounts = b.split("\r\n").filter((l) => /^(TRNS|SPL)\t/.test(l)).map((l) => Number(l.split("\t")[5]));
    assert.ok(Math.abs(amounts.reduce((a, x) => a + x, 0)) < 0.005);
  }
});

test("tabs and newlines in account names cannot break IIF rows", () => {
  const { mapping } = parseMapping("sales = Bad\tName");
  assert.ok(!/Bad\tName/.test(toIif(validate(sampleReport(), { mapping }).journals)));
});

test("generic journals CSV carries category and both columns", () => {
  assert.match(journalsCsv(ok().journals), /^payout,period,date,category,account,debit,credit,memo\r\n/);
});

test("parsePayouts on an empty string reports an error and does not throw", () => {
  assert.equal(parsePayouts("").findings[0].severity, "error");
});

// Gumroad's real header lists, from github.com/antiwork/gumroad at c58af153:
// app/services/exports/payouts/csv.rb HEADERS and app/services/exports/purchase_export_service.rb PURCHASE_FIELDS.
// There, Sale Price includes shipping and tax and Net Total = Sale Price - fee (app/modules/purchase/accounting.rb);
// payout CSV refund rows carry negated amounts (payouts/base.rb, summarize_full_refund).
const PAYOUT_HEAD = "Type,Date,Purchase ID,Item Name,Buyer Name,Buyer Email,Taxes ($),Shipping ($),Sale Price ($),Gumroad Fees ($),Net Total ($)\n";
const line = (cats) => (cat) => cats.lines.filter((l) => l.category === cat).reduce((a, l) => a + (l.debit || 0) - (l.credit || 0), 0);

test("reads Gumroad's real payout CSV: shipping inside Sale Price, signed refund rows, Totals row is the deposit", () => {
  const csv = PAYOUT_HEAD +
    "Sale,2026-10-02,s1,Zine,A,a@x,0,5.00,34.00,3.90,30.10\n" +
    "Sale,2026-10-03,s2,Course,B,b@x,0,0,149.00,15.40,133.60\n" +
    "Full Refund,2026-10-05,s1,Zine,A,a@x,0,-5.00,-34.00,-3.90,-30.10\n" +
    "Subtotal - activity paid out by Gumroad,,,,,,0,0,149.00,15.40,133.60\n" +
    "Totals,,,,,,0,0,149.00,15.40,133.60\n";
  const r = validate(csv);
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0, JSON.stringify(r.findings));
  assert.equal(r.reconciliation[0].stated, 13360);
  assert.equal(r.reconciliation[0].agrees, true);
  const sum = line(r.journals[0]);
  assert.equal(sum("sales"), -(2900 + 14900)); // credit: product sales exclude the $5 shipping
  assert.equal(sum("shipping"), -500);
  assert.equal(sum("refunds"), 3400);
  assert.equal(sum("fees"), 1540); // the refunded sale's fee came back
  assert.equal(sum("clearing"), 13360);
});

test("reads Gumroad's real Sales export: full and partial refunds net out, the Totals row is not a sale", () => {
  const head = "Purchase ID,Item Name,Purchase Date,Subtotal ($),Taxes ($),Shipping ($),Sale Price ($),Fees ($),Net Total ($),Refunded?,Partial Refund ($),Fully Refunded?\n";
  const csv = head +
    "s1,Zine,2026-10-02,29.00,0,5.00,34.00,3.90,30.10,true,0,true\n" +
    "s2,Course,2026-10-03,149.00,0,0,149.00,15.40,133.60,false,0,false\n" +
    "s3,Kit,2026-10-04,50.00,0,0,50.00,5.50,44.50,true,10.00,false\n" +
    "Totals,,,228.00,0,5.00,233.00,24.80,208.20,,10.00,\n";
  const r = validate(csv, { expected: 16810 });
  assert.equal(r.summary.rows, 3);
  assert.equal(r.reconciliation[0].agrees, true, JSON.stringify(r.reconciliation));
  const sum = line(r.journals[0]);
  assert.equal(sum("sales"), -(2900 + 14900 + 5000));
  assert.equal(sum("refunds"), 3400 + 1000);
  assert.equal(sum("fees"), 1540 + 550);
  assert.ok(r.findings.some((f) => /fully refunded, fee assumed returned/.test(f.title)));
});

test("seller-collected tax inside Sale Price goes to the payable account, not sales", () => {
  const r = validate(PAYOUT_HEAD + "Sale,2026-10-02,s1,Zine,A,a@x,2.00,0,22.00,2.70,19.30\nTotals,,,,,,2.00,0,22.00,2.70,19.30\n");
  const sum = line(r.journals[0]);
  assert.equal(sum("sales"), -2000);
  assert.equal(sum("tax"), -200);
  assert.equal(r.reconciliation[0].agrees, true);
});

test("a Totals row in the older layout is skipped, not journalled as a second sale", () => {
  const r = validate("Type,Date,Purchase ID,Price,Gumroad Fees,Net Total\nSale,2026-10-01,s1,149.00,15.40,133.60\nTotals,,,149.00,15.40,133.60\n", { expected: 13360 });
  assert.equal(r.reconciliation[0].agrees, true);
});
