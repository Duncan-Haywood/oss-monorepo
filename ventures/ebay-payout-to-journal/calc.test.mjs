import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, categoryOf, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());

test("the sample reconciles: rows add up to the payout row and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 48235);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a payout spanning a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-08"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 48235);
});

test("sales are booked before fees: the order net is grossed back up by its fee columns", () => {
  const sept = ok().journals[0];
  const sales = sept.lines.find((l) => l.category === "sales"), fees = sept.lines.find((l) => l.category === "fees");
  assert.equal(sales.credit, 12999 + 4180 + 1900);
  assert.equal(fees.debit, 1744 + 560 + 320);
});

test("split none keeps one journal for the whole payout", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, 48235);
});

test("refunds, disputes, shipping, ads, fees and adjustments each get their own line", () => {
  const cats = new Set(ok().journals.flatMap((j) => j.lines.map((l) => l.category)));
  for (const c of ["sales", "refunds", "disputes", "shipping", "fees", "ads", "clearing"]) assert.ok(cats.has(c), c);
});

test("Promoted Listings charges go to advertising, other fees and fee credits to fees", () => {
  const oct = ok().journals[1];
  assert.equal(oct.lines.find((l) => l.category === "ads").debit, 640);
  // 49.99 order fees + 4.95 subscription, less the 3.00 fee credit
  assert.equal(oct.lines.find((l) => l.category === "fees").debit, 4999 + 495 - 300);
  assert.equal(oct.lines.find((l) => l.category === "disputes").debit, 1580);
});

test("the broken sample names the payout mismatch, the bad amount and the unknown type", () => {
  const titles = validate(sampleBrokenReport()).findings.map((f) => f.title).join("\n");
  assert.match(titles, /rows add up to 493\.43 USD but the payout is 482\.35 USD/);
  assert.match(titles, /Net amount "12\.\.5" is not a number/);
  assert.match(titles, /no rule recognised/);
});

test("unknown types are journalled to the uncategorised account, never dropped", () => {
  const line = validate(sampleBrokenReport()).journals.flatMap((j) => j.lines).find((l) => l.category === "uncategorised");
  assert.equal(line.credit, 123);
});

test("a fee column that is not a number is flagged and the row left out", () => {
  const csv = sampleReport().replace("-0.30,", "x.y,");
  assert.notEqual(csv, sampleReport());
  assert.ok(validate(csv).findings.some((f) => /fee column is not a number/.test(f.title)));
});

test("the preamble above the header is skipped and the header found", () => {
  assert.match(sampleReport().split("\n")[0], /Transaction report/);
  assert.equal(parsePayouts(sampleReport()).payouts.length, 1);
});

test("without a payout row the deposit can be supplied, and a wrong one is an error", () => {
  const bare = buildReport({ items: [["2026-09-10", "Order", 100, 13.2, "x"]], withPayoutRow: false });
  const warn = validate(bare);
  assert.equal(warn.reconciliation[0].agrees, null);
  assert.ok(warn.findings.some((f) => /no payout row and no expected deposit/.test(f.title)));
  assert.equal(validate(bare, { expected: 10000 }).reconciliation[0].agrees, true);
  assert.ok(validate(bare, { expected: 9000 }).findings.some((f) => f.severity === "error"));
});

test("orders not yet paid out carry -- and are grouped apart with a warning", () => {
  const csv = sampleReport().split("\n").map((l, i) => (i === 5 ? l.replace(/5081234567/g, "--") : l)).join("\n");
  const r = validate(csv);
  assert.ok(r.findings.some((f) => /have no payout ID|has no payout ID/.test(f.title)));
});

test("amounts parse US, European and thousands-separated forms to cents", () => {
  assert.equal(parseAmount("12.34"), 1234);
  assert.equal(parseAmount("-12,34"), -1234);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
});

test("dates parse eBay's 'Sep 28, 2026', ISO, dotted European, and slashed per the chosen order", () => {
  assert.equal(parseDate("Sep 28, 2026"), "2026-09-28");
  assert.equal(parseDate("Oct 1, 2026"), "2026-10-01");
  assert.equal(parseDate("Foo 1, 2026"), null);
  assert.equal(parseDate("2026-09-28 12:00:00"), "2026-09-28");
  assert.equal(parseDate("28.09.2026"), "2026-09-28");
  assert.equal(parseDate("09/28/2026"), "2026-09-28");
  assert.equal(parseDate("28/09/2026", "dmy"), "2026-09-28");
  assert.equal(parseDate("31.02.2026"), null);
});

test("a report with the quoted not-as-described header and quoted dates is read", () => {
  const csv = [
    'Transaction creation date,Type,Order number,Net amount,Payout currency,Payout date,Payout ID,Description,Final Value Fee - variable,"Very high ""item not as described"" fee"',
    '"Sep 10, 2026",Order,12-1-1,80.00,USD,"Sep 12, 2026",77,--,-10.00,--',
    '"Sep 12, 2026",Payout,--,80.00,USD,"Sep 12, 2026",77,--,--,--',
  ].join("\n");
  const r = validate(csv);
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.journals[0].lines.find((l) => l.category === "sales").credit, 9000);
  assert.equal(r.journals[0].lines.find((l) => l.category === "fees").debit, 1000);
});

test("a file without the Transaction report columns is refused with a pointer to the right report", () => {
  const r = validate("date,amount\n2026-01-01,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Seller Hub/);
});

test("two payouts in one file are journalled separately", () => {
  const a = buildReport({ id: "11", items: [["2026-09-10", "Order", 10, 1.5, "a"]], withPayoutRow: true });
  const b = buildReport({ id: "22", items: [["2026-09-20", "Order", 20, 3, "b"]], withPayoutRow: true });
  const r = validate(a + b.split("\n").slice(5).join("\n"));
  assert.equal(r.payouts.length, 2);
  assert.deepEqual(r.reconciliation.map((x) => x.stated), [1000, 2000]);
});

test("categoryOf recognises the common eBay transaction types", () => {
  const c = (cat, desc = "") => categoryOf({ cat, desc });
  assert.equal(c("Order"), "sales");
  assert.equal(c("Refund"), "refunds");
  assert.equal(c("Claim"), "disputes");
  assert.equal(c("Payment dispute"), "disputes");
  assert.equal(c("Shipping label"), "shipping");
  assert.equal(c("Other fee", "Store subscription fee"), "fees");
  assert.equal(c("Other fee", "Promoted Listings - General fee"), "ads");
  assert.equal(c("Credit", "Final value fee credit"), "fees");
  assert.equal(c("Credit", "Goodwill"), "other");
  assert.equal(c("Transfer"), "other");
  assert.equal(c("something new"), "uncategorised");
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("sales = 200\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.sales, "200");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,200,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().sales, "eBay Sales");
});

test("Xero export: debits positive, credits negative, columns as the manual journal import expects", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^eBay payout 5081234567 2026-09,30\/09\/2026,".*before fees\) \(3 rows\)",eBay Sales,Tax Exempt,-190\.79$/);
  const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^5081234567-2026-09,09\/30\/2026,eBay Sales,,190\.79,/);
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
