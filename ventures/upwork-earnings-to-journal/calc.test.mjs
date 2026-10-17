import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts, rowCategory, feeSummary } from "./calc.mjs";

const ok = () => validate(sampleReport());
const line = (j, cat) => j.lines.find((l) => l.category === cat);

test("the sample reconciles: the balance chain holds and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 72200);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a history that spans a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-05"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 72200);
});

test("hourly, fixed price and bonus income are booked gross to their own accounts", () => {
  const [sept, oct] = ok().journals;
  assert.equal(line(sept, "hourly").credit, 80000);
  assert.equal(line(sept, "fixed").credit, 150000);
  assert.equal(line(oct, "bonus").credit, 10000);
});

test("service fees and the withdrawal fee are expenses, Connects their own line, refunds debited", () => {
  const [sept, oct] = ok().journals;
  assert.equal(line(sept, "fees").debit, 8000 + 15000 + 200);
  assert.equal(line(sept, "connects").debit, 1200);
  assert.equal(line(oct, "fees").debit, 1000 + 6400);
  assert.equal(line(oct, "refunds").debit, 20000);
});

test("a withdrawal is money moving to the bank, not income or expense", () => {
  const sept = ok().journals[0];
  assert.equal(line(sept, "withdrawals").debit, 180000);
  assert.equal(line(sept, "withdrawals").credit, 0);
});

test("the fee summary says what Upwork took of what was billed", () => {
  const f = ok().fees;
  assert.equal(f.gross, 304000);
  assert.equal(f.fees, 30600);
  assert.equal(f.connects, 1200);
  assert.ok(Math.abs(f.feeRate - 0.1007) < 0.0001);
  assert.ok(f.allInRate > f.feeRate);
  assert.equal(feeSummary([]).feeRate, null);
});

test("types map loosely, a withdrawal fee is a fee, and unknown ones are reviewed not guessed", () => {
  assert.equal(rowCategory("Hourly"), "hourly");
  assert.equal(rowCategory("Fixed Price"), "fixed");
  assert.equal(rowCategory("Milestone payment"), "fixed");
  assert.equal(rowCategory("Bonus"), "bonus");
  assert.equal(rowCategory("Service Fee"), "fees");
  assert.equal(rowCategory("Withdrawal Fee"), "fees");
  assert.equal(rowCategory("Withdrawal"), "withdrawals");
  assert.equal(rowCategory("Connects"), "connects");
  assert.equal(rowCategory("Freelancer Plus membership"), "connects");
  assert.equal(rowCategory("Refund"), "refunds");
  assert.equal(rowCategory("Gift Card"), "uncategorised");
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
  assert.equal(r.journals[0].clearing, 72200);
});

test("the broken sample names the gap, the bad amount and the unknown type", () => {
  const r = validate(sampleBrokenReport());
  const titles = r.findings.map((x) => x.title).join("\n");
  assert.match(titles, /Balance does not follow between/);
  assert.match(titles, /An amount on 1000013 is not a number/);
  assert.match(titles, /1 item no rule recognised/);
  assert.match(titles, /Rows add up to .* but the Upwork balance moved by/);
  assert.equal(r.reconciliation[0].agrees, false);
});

test("the gap finding says how much is missing", () => {
  const f = validate(sampleBrokenReport()).findings.find((x) => /Balance does not follow/.test(x.title));
  assert.match(f.detail, /100\.00 USD is missing or was edited/);
});

test("an unknown type is journalled to uncategorised, never dropped", () => {
  const j = validate(sampleBrokenReport()).journals.flatMap((x) => x.lines);
  assert.equal(j.find((l) => l.category === "uncategorised").credit, 500);
});

test("without a Balance column completeness cannot be proved and the page says so", () => {
  const csv = "Date,Type,Description,Amount\n2026-09-10,Hourly,x,100.00\n2026-09-10,Service Fee,x,-10.00\n";
  const r = validate(csv);
  assert.equal(r.reconciliation[0].agrees, null);
  assert.ok(r.findings.some((f) => /No Balance column/.test(f.title)));
  assert.equal(r.journals[0].clearing, 9000);
});

test("an entered balance that differs from the file's last balance is a warning", () => {
  assert.ok(validate(sampleReport(), { expected: 70000 }).findings.some((f) => /not the balance you entered/.test(f.title)));
  assert.ok(!validate(sampleReport(), { expected: 97200 }).findings.some((f) => /not the balance you entered/.test(f.title)));
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

test("a file without the Upwork columns is refused with a pointer to the right export", () => {
  const r = validate("name,total\nx,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Transaction history/);
});

test("tab-separated exports and a BOM are read", () => {
  const tsv = "﻿" + sampleReport().replace(/,/g, "\t");
  assert.equal(validate(tsv).reconciliation[0].agrees, true);
});

test("quoted descriptions containing commas do not shift the columns", () => {
  const csv = buildReport({ items: [["2026-09-01", "Hourly", "Design, build and QA", 100], ["2026-09-01", "Service Fee", "Fee", -10]] });
  const r = validate(csv);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.journals[0].clearing, 9000);
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("fees = 6100\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.fees, "6100");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,6100,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().connects, "Upwork Connects and Membership");
});

test("Xero export: debits positive, credits negative, columns as the manual journal import expects", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^Upwork transactions 2026-09,30\/09\/2026,Upwork hourly contract earnings \(gross\) \(1 row\),Upwork Hourly Income,Tax Exempt,-800\.00$/);
  const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^Upwork-2026-09,09\/30\/2026,Upwork Hourly Income,,800\.00,/);
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
  const { mapping } = parseMapping("bonus = Bad\tName");
  assert.ok(!/Bad\tName/.test(toIif(validate(sampleReport(), { mapping }).journals)));
});

test("generic journals CSV carries category and both columns", () => {
  assert.match(journalsCsv(ok().journals), /^payout,period,date,category,account,debit,credit,memo\r\n/);
});

test("parsePayouts on an empty string reports an error and does not throw", () => {
  assert.equal(parsePayouts("").findings[0].severity, "error");
});
