import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts, rowCategory, royaltySummary, uncategorisedRows } from "./calc.mjs";

const ok = () => validate(sampleReport());
const jr = (r, cur, period) => r.journals.find((j) => j.currency === cur && j.period === period);
const line = (j, cat) => j.lines.find((l) => l.category === cat);
const ONE = [["2026-09", "Book", "B0X", "Amazon.com", "Kindle eBook", 10, 100, 0, 0, "USD"], ["2026-09", "Book", "B0X", "Amazon.com", "Paperback", 5, 60, 20, 0, "USD"]];

test("the sample reconciles: every row total holds and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.ok(r.reconciliation.every((x) => x.agrees === true));
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("each currency is journalled on its own, labelled, and never converted", () => {
  const r = ok();
  assert.deepEqual([...new Set(r.journals.map((j) => j.currency))].sort(), ["EUR", "GBP", "USD"]);
  assert.equal(jr(r, "GBP", "2026-08").clearing, 4800);
  assert.equal(jr(r, "EUR", "2026-09").clearing, 3400);
  assert.match(jr(r, "GBP", "2026-08").narration, /\(GBP\)/);
  assert.ok(r.findings.some((f) => /3 currencies/.test(f.title)));
});

test("a history spanning a month end becomes one journal per month inside its own month", () => {
  const usd = ok().journals.filter((j) => j.currency === "USD");
  assert.deepEqual(usd.map((j) => [j.period, j.date]), [["2026-08", "2026-08-31"], ["2026-09", "2026-09-30"]]);
});

test("royalties are booked gross by format and marketplace to their own accounts", () => {
  const aug = jr(ok(), "USD", "2026-08");
  assert.equal(line(aug, "ebook").credit, 25200);
  assert.equal(line(aug, "paperback").credit, 15000);
  assert.equal(line(aug, "kenp").credit, 9000);
  assert.match(line(aug, "ebook").memo, /Amazon\.com/);
  assert.equal(line(jr(ok(), "USD", "2026-09"), "hardcover").credit, 6000);
});

test("two marketplaces in one month get separate lines", () => {
  const csv = buildReport({ items: [...ONE, ["2026-09", "Book", "B0X", "Amazon.ca", "Kindle eBook", 3, 12, 0, 0, "USD"]] });
  const j = validate(csv).journals[0];
  assert.equal(j.lines.filter((l) => l.category === "ebook").length, 2);
});

test("printing cost is an expense and tax withheld is its own debit", () => {
  const r = ok();
  assert.equal(line(jr(r, "USD", "2026-09"), "printing").debit, 7700 + 3000);
  assert.equal(line(jr(r, "EUR", "2026-09"), "withholding").debit, 600);
  assert.equal(line(jr(r, "EUR", "2026-09"), "ebook").credit, 4000);
});

test("net print mode adds printing back onto income and leaves the receivable unchanged", () => {
  const csv = "Royalty Date,Format,Royalty,Printing Cost\n2026-09,Paperback,94.00,56.00\n";
  const sep = validate(csv), net = validate(csv, { printMode: "net" });
  assert.equal(sep.journals[0].clearing, 3800);
  assert.equal(net.journals[0].clearing, 9400 - 0);
  const a = line(net.journals[0], "paperback"), p = line(net.journals[0], "printing");
  assert.equal(a.credit, 15000);
  assert.equal(p.debit, 5600);
  assert.equal(net.journals[0].clearing, 9400);
});

test("a row type of printing cost or tax withheld is always a cost whatever its sign", () => {
  const csv = "Date,Transaction Type,Royalty,Currency\n2026-09,Kindle eBook sale,100.00,USD\n2026-09,Printing cost,12.00,USD\n2026-09,Tax withheld,-5.00,USD\n";
  const j = validate(csv).journals[0];
  assert.equal(line(j, "printing").debit, 1200);
  assert.equal(line(j, "withholding").debit, 500);
  assert.equal(j.clearing, 8300);
});

test("formats map loosely, a printing cost is not a paperback and KENP is not an ebook", () => {
  assert.equal(rowCategory("Kindle eBook"), "ebook");
  assert.equal(rowCategory("eBook"), "ebook");
  assert.equal(rowCategory("Paperback"), "paperback");
  assert.equal(rowCategory("Hardcover"), "hardcover");
  assert.equal(rowCategory("Kindle Edition Normalized Pages (KENP) read"), "kenp");
  assert.equal(rowCategory("KENP"), "kenp");
  assert.equal(rowCategory("Paperback printing cost"), "printing");
  assert.equal(rowCategory("Tax withheld"), "withholding");
  assert.equal(rowCategory("Audio Replica"), "uncategorised");
  assert.equal(rowCategory(""), "uncategorised");
});

test("the summary gives gross by marketplace and the printing share of gross", () => {
  const s = ok().summaryByMarket;
  assert.equal(s.gross, 25200 + 15000 + 9000 + 4800 + 21000 + 20500 + 6000 + 4000);
  assert.equal(s.printing, 5600 + 7700 + 3000);
  assert.equal(s.withheld, 600);
  assert.ok(s.printingShare > 0.15 && s.printingShare < 0.16);
  assert.ok(s.rows.some((x) => x.market === "Amazon.co.uk" && x.category === "ebook" && x.currency === "GBP" && x.units === 30));
  assert.equal(royaltySummary([]).printingShare, null);
});

test("an altered row Total is an error naming the row and the difference", () => {
  const r = validate(sampleBrokenReport());
  const f = r.findings.find((x) => /does not match its own columns/.test(x.title));
  assert.match(f.title, /Total on B0EXAMPLE1/);
  assert.match(f.detail, /off by 6\.00 USD/);
});

test("the broken sample names the altered total, the bad amount and the unknown format", () => {
  const r = validate(sampleBrokenReport());
  const titles = r.findings.map((x) => x.title).join("\n");
  assert.match(titles, /An amount on B0EXAMPLE2 is not a number/);
  assert.match(titles, /1 item no rule recognised/);
  assert.match(titles, /Rows add up to .* but the report's total is/);
  assert.ok(r.reconciliation.some((x) => x.agrees === false));
});

test("an unrecognised format is journalled to uncategorised, never dropped", () => {
  const r = validate(sampleBrokenReport());
  const l = r.journals.flatMap((x) => x.lines).find((x) => x.category === "uncategorised");
  assert.equal(l.credit, 900);
  assert.equal(uncategorisedRows(r.payouts).length, 1);
  assert.equal(uncategorisedRows(r.payouts)[0].units, 3);
});

test("a Total row that matches the rows reconciles and is not journalled as a book", () => {
  const r = validate(buildReport({ items: ONE, totalRow: true }));
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.summary.rows, 2);
  assert.equal(r.reconciliation[0].stated, 14000);
  assert.equal(r.reconciliation[0].agrees, true);
});

test("a Total row that disagrees with the rows is an error with the amount", () => {
  const r = validate(buildReport({ items: ONE, totalRow: true, totalOverride: { royalty: 20000 } }));
  assert.ok(r.findings.some((f) => f.severity === "error" && /Rows add up to 160\.00 USD but the Total row says 200\.00 USD \(royalty\)/.test(f.title)));
});

test("a dropped row breaks the Total row check", () => {
  const r = validate(buildReport({ items: ONE, totalRow: true, skip: [1] }));
  assert.ok(r.findings.some((f) => f.severity === "error" && /Total row says/.test(f.title)));
  assert.equal(r.reconciliation[0].agrees, false);
});

test("a Total row cannot be checked across currencies and the page says so", () => {
  const r = validate(buildReport({ items: [...ONE, ["2026-09", "Book", "B0X", "Amazon.de", "Kindle eBook", 1, 5, 0, 0, "EUR"]], totalRow: true }));
  assert.ok(r.findings.some((f) => /Total row was found in a multi-currency file/.test(f.title)));
});

test("without any total, completeness cannot be proved and the page says so", () => {
  const csv = "Royalty Date,Format,Royalty\n2026-09,Kindle eBook,100.00\n";
  const r = validate(csv);
  assert.equal(r.reconciliation[0].agrees, null);
  assert.ok(r.findings.some((f) => /No Total column or Total row/.test(f.title)));
  assert.ok(r.findings.some((f) => /No currency in the file/.test(f.title)));
  assert.equal(r.journals[0].currency, "USD");
  assert.equal(validate(csv, { currency: "gbp" }).journals[0].currency, "GBP");
});

test("an entered payment that differs from the rows is a warning", () => {
  const csv = buildReport({ items: ONE });
  assert.ok(validate(csv, { expected: 99999 }).findings.some((f) => /do not add up to the amount you entered/.test(f.title)));
  assert.ok(!validate(csv, { expected: 14000 }).findings.some((f) => /do not add up to the amount you entered/.test(f.title)));
});

test("split none keeps one journal per currency", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 3);
});

test("amounts parse symbols, parentheses, US and European forms to cents", () => {
  assert.equal(parseAmount("12.34"), 1234);
  assert.equal(parseAmount("$1,234.56"), 123456);
  assert.equal(parseAmount("£12.00"), 1200);
  assert.equal(parseAmount("(12.00)"), -1200);
  assert.equal(parseAmount("-12,34"), -1234);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
});

test("dates parse ISO, month-only values, month names and slashed per the chosen order", () => {
  assert.equal(parseDate("2026-09-28 12:00:00"), "2026-09-28");
  assert.equal(parseDate("2026-09"), "2026-09-30");
  assert.equal(parseDate("2026-02"), "2026-02-28");
  assert.equal(parseDate("September 2026"), "2026-09-30");
  assert.equal(parseDate("Sep 28, 2026"), "2026-09-28");
  assert.equal(parseDate("28.09.2026"), "2026-09-28");
  assert.equal(parseDate("09/28/2026"), "2026-09-28");
  assert.equal(parseDate("28/09/2026", "dmy"), "2026-09-28");
  assert.equal(parseDate("2026-13"), null);
  assert.equal(parseDate("31.02.2026"), null);
});

test("a file without the KDP columns is refused with a pointer to the right export", () => {
  const r = validate("name,total\nx,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Reports/);
});

test("tab-separated exports and a BOM are read", () => {
  const tsv = "﻿" + sampleReport().replace(/,/g, "\t");
  assert.ok(validate(tsv).reconciliation.every((x) => x.agrees === true));
});

test("quoted titles containing commas do not shift the columns", () => {
  const csv = buildReport({ items: [["2026-09", "Salt, Signal and Sea", "B0X", "Amazon.com", "Kindle eBook", 1, 10, 0, 0, "USD"]] });
  const r = validate(csv);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.journals[0].clearing, 1000);
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("printing = 5100\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.printing, "5100");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,5100,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().withholding, "KDP Tax Withheld");
});

test("Xero export: debits positive, credits negative, currency in the narration, balanced per journal", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.ok(lines.slice(1).every((l) => /^KDP royalties 2026-\d\d \((USD|GBP|EUR)\),/.test(l)));
  const by = {};
  for (const l of lines.slice(1)) { const c = l.split(","); by[c[0] + c[1]] = (by[c[0] + c[1]] || 0) + Number(c[c.length - 1]); }
  for (const v of Object.values(by)) assert.ok(Math.abs(v) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month, currency column set", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.ok(lines.some((l) => /^KDP-USD-2026-08,08\/31\/2026,KDP eBook Royalties,,252\.00,.*,,USD$/.test(l)));
  assert.ok(lines.some((l) => /^KDP-GBP,08\/31\/2026,/.test(l)));
});

test("IIF export: every transaction's lines sum to zero and end with ENDTRNS", () => {
  const blocks = toIif(ok().journals).split("ENDTRNS").slice(1, -1);
  assert.equal(blocks.length, 4);
  for (const b of blocks) {
    const amounts = b.split("\r\n").filter((l) => /^(TRNS|SPL)\t/.test(l)).map((l) => Number(l.split("\t")[5]));
    assert.ok(Math.abs(amounts.reduce((a, x) => a + x, 0)) < 0.005);
  }
});

test("tabs and newlines in account names cannot break IIF rows", () => {
  const { mapping } = parseMapping("ebook = Bad\tName");
  assert.ok(!/Bad\tName/.test(toIif(validate(sampleReport(), { mapping }).journals)));
});

test("generic journals CSV carries currency, category and both columns", () => {
  assert.match(journalsCsv(ok().journals), /^group,period,date,currency,category,account,debit,credit,memo\r\n/);
});

test("parsePayouts on an empty string reports an error and does not throw", () => {
  assert.equal(parsePayouts("").findings[0].severity, "error");
});

test("a dedicated KENP pages-read column marks an otherwise unlabelled row as KENP", () => {
  const csv = "Royalty Date,Title,Transaction Type,Kindle Edition Normalized Pages (KENP) Read,Royalty,Currency\n2026-09,Book,Sale,12000,60.00,USD\n";
  const r = validate(csv);
  assert.equal(line(r.journals[0], "kenp").credit, 6000);
  assert.equal(r.summaryByMarket.rows.find((x) => x.category === "kenp").units, 12000);
});
