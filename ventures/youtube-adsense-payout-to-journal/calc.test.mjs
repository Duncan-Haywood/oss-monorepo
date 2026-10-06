import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, sampleOpts, sampleBankTotal, parseAmount, parseDate, parseRates, rateFor, rowKind, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, workingsCsv, buildReport, parseRows } from "./calc.mjs";

const ok = (extra = {}) => validate(sampleReport(), { ...sampleOpts(), bankTotal: sampleBankTotal(), ...extra });
const line = (j, cat) => j.lines.find((l) => l.category === cat);
const net = (j) => j.lines.reduce((a, l) => a + l.debit - l.credit, 0);
const r = (n, rate) => Math.round(n * rate);

test("the sample reconciles to the typed bank total with no errors, and every journal balances", () => {
  const res = ok();
  assert.equal(res.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(res.reconciliation.agrees, true);
  assert.equal(res.journals.length, 2);
  for (const j of res.journals) assert.equal(net(j), 0);
});

test("a payment month-splits: one journal per payment month, dated inside it", () => {
  const res = ok();
  assert.deepEqual(res.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-21"]]);
  assert.equal(validate(sampleReport(), { ...sampleOpts(), split: "none" }).journals.length, 1);
});

test("withholding is a separate receivable and is added to revenue (payment is net of it)", () => {
  const [sept] = ok().journals;
  const wh = line(sept, "withholding");
  assert.equal(wh.account, "US Tax Withholding Receivable");
  assert.equal(wh.debit, r(14483, 0.735));
  assert.equal(line(sept, "revenue").credit, r(84217, 0.75) + r(14483, 0.75));
  assert.equal(line(sept, "bank").debit, r(84217, 0.735));
});

test("revenue at the earned-month rate and cash at the payment rate leaves a realised FX loss when the rate fell", () => {
  const [sept] = ok().journals;
  const fx = line(sept, "fx");
  assert.equal(fx.debit, r(84217, 0.75) + r(14483, 0.75) - r(84217, 0.735) - r(14483, 0.735));
  assert.equal(fx.credit, 0);
  assert.ok(ok().fx.realised < 0);
});

test("a rising rate books a realised FX gain as a credit", () => {
  const csv = buildReport([["2026-09-21", "Google AdSense payment", 1000, "USD"]]);
  const res = validate(csv, { base: "GBP", rates: parseRates("USD 2026-08 0.70\nUSD 2026-09-21 0.80") });
  const fx = line(res.journals[0], "fx");
  assert.equal(fx.credit, 10000);
  assert.equal(net(res.journals[0]), 0);
  assert.equal(res.fx.realised, 10000);
});

test("revenue at the payment-date rate leaves no FX line", () => {
  const res = validate(sampleReport(), { ...sampleOpts(), revenueRate: "payment" });
  for (const j of res.journals) assert.equal(line(j, "fx"), undefined);
  assert.ok(res.findings.some((f) => /payment-date rate/.test(f.title)));
});

test("a payment already in the base currency needs no rate and has no FX", () => {
  const csv = buildReport([["2026-09-21", "Google AdSense payment", 500, "GBP"]]);
  const res = validate(csv, { base: "GBP", bankTotal: 50000 });
  assert.equal(res.reconciliation.agrees, true);
  assert.equal(line(res.journals[0], "fx"), undefined);
  assert.equal(line(res.journals[0], "revenue").credit, 50000);
});

test("a foreign row with no rate is an error naming the currency, and is left out", () => {
  const csv = buildReport([["2026-09-21", "Google AdSense payment", 100, "EUR"]]);
  const res = validate(csv, { base: "GBP", rates: parseRates("USD 2026-09-21 0.7") });
  assert.ok(res.findings.some((f) => f.severity === "error" && /No EUR-to-GBP rate/.test(f.title)));
  assert.equal(res.journals.length, 0);
});

test("a typed bank total that disagrees is an error with the difference", () => {
  const res = ok({ bankTotal: sampleBankTotal() + 150 });
  assert.equal(res.reconciliation.agrees, false);
  assert.ok(res.findings.some((f) => f.severity === "error" && /Off by 1\.50 GBP/.test(f.detail)));
});

test("without a bank total the page warns instead of claiming a match", () => {
  const res = validate(sampleReport(), sampleOpts());
  assert.equal(res.reconciliation.agrees, null);
  assert.ok(res.findings.some((f) => /No bank total typed/.test(f.title)));
});

test("rows are classified by description; withholding wins over payment", () => {
  assert.equal(rowKind("Google AdSense payment"), "payment");
  assert.equal(rowKind("Tax withheld on payment"), "withholding");
  assert.equal(rowKind("US tax withholding"), "withholding");
  assert.equal(rowKind("Payment reversal"), "adjustments");
  assert.equal(rowKind("Mystery credit"), "uncategorised");
});

test("the broken sample names the bad amount, the missing euro rate, the unknown row and the bank gap", () => {
  const res = validate(sampleBrokenReport(), { ...sampleOpts(), bankTotal: sampleBankTotal() });
  const titles = res.findings.map((f) => f.title).join("\n");
  assert.match(titles, /amount on line 4 is not a number/);
  assert.match(titles, /No EUR-to-GBP rate/);
  assert.match(titles, /1 row no rule recognised/);
  assert.match(titles, /Bank rows add up to/);
  for (const j of res.journals) assert.equal(net(j), 0);
});

test("an unknown row is journalled to uncategorised against the bank, never dropped", () => {
  const res = validate(sampleBrokenReport(), sampleOpts());
  const u = res.journals.flatMap((j) => j.lines).find((l) => l.category === "uncategorised");
  assert.equal(u.credit, r(1500, 0.73));
  assert.equal(u.debit, 0);
});

test("withholding with a negative sign or a positive sign is the same tax", () => {
  const a = validate(buildReport([["2026-09-21", "US tax withholding", -10, "GBP"]]), { base: "GBP" });
  const b = validate(buildReport([["2026-09-21", "US tax withholding", 10, "GBP"]]), { base: "GBP" });
  assert.equal(line(a.journals[0], "withholding").debit, 1000);
  assert.equal(line(b.journals[0], "withholding").debit, 1000);
});

test("rates parse with optional currency and fall back day, then month", () => {
  const { byCur, errors } = parseRates("USD 2026-09-21 0.7\n2026-08 0.9\nbogus\nUSD 2026-02-31 0.7");
  assert.equal(errors.length, 2);
  const rates = { byCur };
  assert.equal(rateFor(rates, "USD", "2026-09-30"), 0.7);
  assert.equal(rateFor(rates, "EUR", "2026-08-15"), 0.9);
  assert.equal(rateFor(rates, "EUR", "2026-07-01"), null);
});

test("amounts parse US, European, bracketed negatives and currency symbols to cents", () => {
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("-12,34"), -1234);
  assert.equal(parseAmount("($144.83)"), -14483);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
});

test("dates parse ISO, 21 Sep 2026, Sep 21, 2026, dotted and slashed per order", () => {
  assert.equal(parseDate("2026-09-21 08:00"), "2026-09-21");
  assert.equal(parseDate("21 Sep 2026"), "2026-09-21");
  assert.equal(parseDate("Sep 21, 2026"), "2026-09-21");
  assert.equal(parseDate("21.09.2026"), "2026-09-21");
  assert.equal(parseDate("09/21/2026"), "2026-09-21");
  assert.equal(parseDate("21/09/2026", "dmy"), "2026-09-21");
  assert.equal(parseDate("31.02.2026"), null);
});

test("a currency in the amount header, in any column order, is read", () => {
  const csv = "Description,Amount (USD),Date\nGoogle AdSense payment,10.00,2026-09-21\n";
  const p = parseRows(csv, { base: "GBP" });
  assert.equal(p.rows[0].currency, "USD");
});

test("a file without the AdSense columns is refused with a pointer to the right export", () => {
  const res = validate("name,total\nx,1\n");
  assert.equal(res.findings[0].severity, "error");
  assert.match(res.findings[0].detail, /Payments > Transactions/);
  assert.equal(validate("").findings[0].severity, "error");
  assert.equal(validate("Date,Amount\n").findings[0].severity, "error");
});

test("a bad date is an error and the row is left out", () => {
  const res = validate("Date,Description,Amount\nnot-a-date,Google AdSense payment,5\n", { base: "USD" });
  assert.ok(res.findings.some((f) => f.severity === "error" && /not a date/.test(f.title)));
});

test("tab-separated exports and a BOM are read", () => {
  const tsv = "﻿" + sampleReport().replace(/,/g, "\t");
  assert.equal(validate(tsv, sampleOpts()).journals.length, 2);
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("withholding = 1150\nbogus = 1\nnot a line\n# note\nbank = 1200");
  assert.equal(mapping.withholding, "1150");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { ...sampleOpts(), mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,1150,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().withholding, "US Tax Withholding Receivable");
});

test("Xero export: debits positive, credits negative, and the amounts sum to zero", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^AdSense payments 2026-09,30\/09\/2026,/);
  assert.ok(Math.abs(lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0)) < 0.005);
});

test("QuickBooks Online export carries debit and credit columns and the base currency", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^ADSENSE-2026-09,09\/30\/2026,.*,GBP$/);
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
  const { mapping } = parseMapping("bank = Bad\tName");
  assert.ok(!/Bad\tName/.test(toIif(validate(sampleReport(), { ...sampleOpts(), mapping }).journals)));
});

test("generic journals CSV and workings CSV carry their headers and every row's rates", () => {
  const res = ok();
  assert.match(journalsCsv(res.journals), /^journal,period,date,category,account,debit,credit,memo\r\n/);
  const w = workingsCsv(res.workings).trim().split("\r\n");
  assert.equal(w.length, 5);
  assert.match(w[1], /0\.735,0\.75,/);
});
