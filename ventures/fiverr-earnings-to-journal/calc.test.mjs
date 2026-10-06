import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts, rowCategory, feeSummary } from "./calc.mjs";

const ok = () => validate(sampleReport());
const line = (j, cat) => j.lines.find((l) => l.category === cat);

test("the sample reconciles: the balance chain holds and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 30900);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a history that spans a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-05"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 30900);
});

test("order revenue and tips are booked gross to their own accounts", () => {
  const [sept, oct] = ok().journals;
  assert.equal(line(sept, "orders").credit, 80000);
  assert.equal(line(oct, "orders").credit, 25000);
  assert.equal(line(oct, "tips").credit, 5000);
});

test("service fees and withdrawal fees are separate expenses, refunds and cancellations debited", () => {
  const [sept, oct] = ok().journals;
  assert.equal(line(sept, "fees").debit, 10000 + 6000);
  assert.equal(line(sept, "withdrawalfees").debit, 100);
  assert.equal(line(oct, "fees").debit, 5000);
  assert.equal(line(oct, "refunds").debit, 8000);
});

test("a withdrawal is money moving to the bank, not income or expense", () => {
  const sept = ok().journals[0];
  assert.equal(line(sept, "withdrawals").debit, 50000);
  assert.equal(line(sept, "withdrawals").credit, 0);
});

test("the fee summary says what Fiverr took of what was billed", () => {
  const f = ok().fees;
  assert.equal(f.gross, 110000);
  assert.equal(f.fees, 21000);
  assert.equal(f.withdrawalFees, 100);
  assert.ok(Math.abs(f.feeRate - 0.1909) < 0.0001);
  assert.ok(f.allInRate > f.feeRate);
  assert.equal(feeSummary([]).feeRate, null);
});

test("net mode grosses an order up at 20%, books the fee, and leaves the balance unchanged", () => {
  const csv = "Date,Type,Description,Amount,Balance\n2026-09-01,Order revenue,Logo,80.00,80.00\n2026-09-02,Tip,Tip,10.00,90.00\n";
  const r = validate(csv, { feeMode: "net" });
  assert.equal(r.reconciliation[0].agrees, true);
  const j = r.journals[0];
  assert.equal(line(j, "orders").credit, 10000);
  assert.equal(line(j, "fees").debit, 2000);
  assert.equal(line(j, "tips").credit, 1000);
  assert.equal(j.clearing, 9000);
  assert.equal(validate(csv, { feeMode: "net", feePct: 10 }).journals[0].lines.find((l) => l.category === "fees").debit, 889);
  assert.equal(validate(csv).journals[0].lines.find((l) => l.category === "fees"), undefined);
});

test("types map loosely, a withdrawal fee is a fee, and unknown ones are reviewed not guessed", () => {
  assert.equal(rowCategory("Order revenue"), "orders");
  assert.equal(rowCategory("Revenue from order"), "orders");
  assert.equal(rowCategory("Tip"), "tips");
  assert.equal(rowCategory("Service fee"), "fees");
  assert.equal(rowCategory("Fiverr commission"), "fees");
  assert.equal(rowCategory("Withdrawal fee"), "withdrawalfees");
  assert.equal(rowCategory("Withdrawal"), "withdrawals");
  assert.equal(rowCategory("Payout to PayPal"), "withdrawals");
  assert.equal(rowCategory("Refund"), "refunds");
  assert.equal(rowCategory("Order cancellation"), "refunds");
  assert.equal(rowCategory("Fiverr credit"), "uncategorised");
  assert.equal(rowCategory(""), "uncategorised");
});

test("oldest-first and newest-first files give the same journals", () => {
  const newest = sampleReport().trim().split("\n");
  const oldest = [newest[0], ...newest.slice(1).reverse()].join("\n") + "\n";
  const a = validate(sampleReport()), b = validate(oldest);
  assert.equal(b.findings.filter((f) => f.severity === "error").length, 0);
  assert.deepEqual(b.journals.map((j) => j.clearing), a.journals.map((j) => j.clearing));
});

test("split none keeps one journal for the whole file", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, 30900);
});

test("the broken sample names the gap, the bad amount and the unknown type", () => {
  const r = validate(sampleBrokenReport());
  const titles = r.findings.map((x) => x.title).join("\n");
  assert.match(titles, /Balance does not follow between/);
  assert.match(titles, /An amount on FO2000011 is not a number/);
  assert.match(titles, /1 item no rule recognised/);
  assert.match(titles, /Rows add up to .* but the Fiverr balance moved by/);
  assert.equal(r.reconciliation[0].agrees, false);
});

test("the gap finding says how much is missing", () => {
  const f = validate(sampleBrokenReport()).findings.find((x) => /Balance does not follow/.test(x.title));
  assert.match(f.detail, /50\.00 USD is missing or was edited/);
});

test("an unknown type is journalled to uncategorised, never dropped", () => {
  const j = validate(sampleBrokenReport()).journals.flatMap((x) => x.lines);
  assert.equal(j.find((l) => l.category === "uncategorised").credit, 500);
});

test("without a Balance column completeness cannot be proved and the page says so", () => {
  const csv = "Date,Type,Description,Amount\n2026-09-10,Order revenue,x,100.00\n2026-09-10,Service fee,x,-20.00\n";
  const r = validate(csv);
  assert.equal(r.reconciliation[0].agrees, null);
  assert.ok(r.findings.some((f) => /No Balance column/.test(f.title)));
  assert.equal(r.journals[0].clearing, 8000);
});

test("an entered balance that differs from the file's last balance is a warning", () => {
  assert.ok(validate(sampleReport(), { expected: 70000 }).findings.some((f) => /not the balance you entered/.test(f.title)));
  assert.ok(!validate(sampleReport(), { expected: 55900 }).findings.some((f) => /not the balance you entered/.test(f.title)));
});

test("amounts parse symbols, parentheses, US and European forms to cents", () => {
  assert.equal(parseAmount("12.34"), 1234);
  assert.equal(parseAmount("$1,234.56"), 123456);
  assert.equal(parseAmount("-$12.00"), -1200);
  assert.equal(parseAmount("(12.00)"), -1200);
  assert.equal(parseAmount("USD 5.00"), 500);
  assert.equal(parseAmount("-12,34"), -1234);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
});

test("dates parse ISO, month names, dotted European, and slashed per the chosen order", () => {
  assert.equal(parseDate("2026-09-28 12:00:00"), "2026-09-28");
  assert.equal(parseDate("Sep 28, 2026"), "2026-09-28");
  assert.equal(parseDate("28 Sep 2026"), "2026-09-28");
  assert.equal(parseDate("28.09.2026"), "2026-09-28");
  assert.equal(parseDate("09/28/2026"), "2026-09-28");
  assert.equal(parseDate("28/09/2026", "dmy"), "2026-09-28");
  assert.equal(parseDate("31.02.2026"), null);
});

test("a file without the Fiverr columns is refused with a pointer to the right export", () => {
  const r = validate("name,total\nx,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Earnings/);
});

test("tab-separated exports and a BOM are read", () => {
  const tsv = "﻿" + sampleReport().replace(/,/g, "\t");
  assert.equal(validate(tsv).reconciliation[0].agrees, true);
});

test("quoted descriptions containing commas do not shift the columns", () => {
  const csv = buildReport({ items: [["2026-09-01", "Order revenue", "Design, build and QA", 100], ["2026-09-01", "Service fee", "Fee", -20]] });
  const r = validate(csv);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.journals[0].clearing, 8000);
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("fees = 6100\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.fees, "6100");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,6100,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().withdrawalfees, "Fiverr Withdrawal Fees");
});

test("Xero export: debits positive, credits negative, columns as the manual journal import expects", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^Fiverr transactions 2026-09,30\/09\/2026,Fiverr order revenue \(gross\) \(2 rows\),Fiverr Order Income,Tax Exempt,-800\.00$/);
  const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^Fiverr-2026-09,09\/30\/2026,Fiverr Order Income,,800\.00,/);
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
  const { mapping } = parseMapping("tips = Bad\tName");
  assert.ok(!/Bad\tName/.test(toIif(validate(sampleReport(), { mapping }).journals)));
});

test("generic journals CSV carries category and both columns", () => {
  assert.match(journalsCsv(ok().journals), /^payout,period,date,category,account,debit,credit,memo\r\n/);
});

test("parsePayouts on an empty string reports an error and does not throw", () => {
  assert.equal(parsePayouts("").findings[0].severity, "error");
});
