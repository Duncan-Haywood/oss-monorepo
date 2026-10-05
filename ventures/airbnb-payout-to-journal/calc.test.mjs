import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());
const sum = (j) => j.lines.reduce((a, l) => a + l.debit - l.credit, 0);

test("the sample reconciles: rows add up to the payout row and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 134170);
  for (const j of r.journals) assert.equal(sum(j), 0);
});

test("a file spanning a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-05"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 134170);
});

test("rental income is gross less cleaning, cleaning is its own line, and Airbnb's fee is booked, not netted", () => {
  const sept = ok().journals[0];
  assert.equal(sept.lines.find((l) => l.category === "sales").credit, 45000 + 82000);
  assert.equal(sept.lines.find((l) => l.category === "cleaning").credit, 18000);
  assert.equal(sept.lines.find((l) => l.category === "fees").debit, 1620 + 2730);
});

test("a cancellation books a refund and gives back the fee; pass-through tax is a liability; adjustments get a line", () => {
  const oct = ok().journals[1];
  assert.equal(oct.lines.find((l) => l.category === "refunds").debit, 42000);
  assert.equal(oct.lines.find((l) => l.category === "fees").credit, 180);
  assert.equal(oct.lines.find((l) => l.category === "tax").credit, 3840);
  assert.equal(oct.lines.find((l) => l.category === "adjustments").debit, 4500);
});

test("occupancy taxes Airbnb remits itself are reported but never journalled", () => {
  const r = ok();
  assert.ok(r.findings.some((f) => /occupancy taxes of 48\.00/.test(f.title)));
  assert.ok(!r.journals.flatMap((j) => j.lines).some((l) => l.credit === 4800 || l.debit === 4800));
});

test("check-in basis moves a reservation to the month the guest arrives", () => {
  const csv = buildReport({ stays: [["2026-09-28", "HMAAAAAAAA", 5, 500, 50, 15, "2026-10-02"]] });
  assert.equal(validate(csv, { basis: "checkin" }).journals[0].period, "2026-10");
  assert.equal(validate(csv, { basis: "paid" }).journals[0].period, "2026-09");
});

test("split none keeps one journal for the whole file", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, 134170);
});

test("the broken sample names the bad amount, the reservation whose parts do not add up and the unknown row", () => {
  const titles = validate(sampleBrokenReport()).findings.map((x) => x.title).join("\n");
  assert.match(titles, /An amount on HMABBAD001 is not a number/);
  assert.match(titles, /Parts do not add up to the amount on HMAB7J8K9L/);
  assert.match(titles, /Unrecognised type "Mystery Bonus"/);
});

test("rows no rule explains are journalled to uncategorised, never dropped", () => {
  const r = validate(sampleBrokenReport());
  const lines = r.journals.flatMap((x) => x.lines).filter((l) => l.category === "uncategorised");
  assert.equal(lines.reduce((a, l) => a + l.credit - l.debit, 0), 2500 - 1000);
  for (const j of r.journals) assert.equal(sum(j), 0);
});

test("payouts that differ from the rows are a timing warning that names the amount held in clearing", () => {
  const csv = buildReport({ stays: [["2026-10-01", "HMAAAAAAAA", 2, 300, 50, 9, "2026-10-01"]], payouts: [["2026-10-03", 100]] });
  const r = validate(csv);
  const w = r.findings.find((f) => /payouts in the file total 100\.00/.test(f.title));
  assert.ok(w && w.severity === "warning");
  assert.match(w.detail, /Difference 191\.00/);
  assert.equal(r.reconciliation[0].agrees, false);
});

test("without Payout rows a typed total can be supplied, and no total is a warning", () => {
  const csv = buildReport({ stays: [["2026-10-01", "HMAAAAAAAA", 2, 300, 50, 9, "2026-10-01"]] });
  assert.ok(validate(csv).findings.some((f) => /no Payout rows/.test(f.title)));
  assert.equal(validate(csv, { expected: 29100 }).reconciliation[0].agrees, true);
});

test("amounts parse US, European and thousands-separated forms to cents", () => {
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("12,5"), 1250);
  assert.equal(parseAmount("-9.10"), -910);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
});

test("dates parse ISO, dotted European, and slashed per the chosen order", () => {
  assert.equal(parseDate("2026-10-03 12:00:00"), "2026-10-03");
  assert.equal(parseDate("03.10.2026"), "2026-10-03");
  assert.equal(parseDate("10/03/2026"), "2026-10-03");
  assert.equal(parseDate("10/03/2026", "dmy"), "2026-03-10");
  assert.equal(parseDate("02/30/2026"), null);
});

test("a file without the Airbnb columns is refused with a pointer to the right export", () => {
  const r = validate("Order,Total\n1,2\n");
  assert.equal(r.journals.length, 0);
  assert.match(r.findings[0].detail, /Transaction history/);
});

test("tab-separated exports and a BOM are read", () => {
  const tsv = "﻿" + sampleReport().replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, "\t");
  assert.equal(validate(tsv).journals.length, 2);
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("sales = 4000\nfees = 6100\nnonsense\nbogus = 1");
  assert.equal(mapping.sales, "4000");
  assert.equal(mapping.clearing, defaultMapping().clearing);
  assert.equal(errors.length, 2);
  const r = validate(sampleReport(), { mapping });
  assert.match(toXeroJournalCsv(r.journals), /4000/);
});

test("Xero export: debits positive, credits negative, one balanced narration", () => {
  const rows = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(rows[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  const byNarr = {};
  for (const r of rows.slice(1)) { const c = r.split(","); byNarr[c[0]] = (byNarr[c[0]] || 0) + Math.round(parseFloat(c[c.length - 1]) * 100); }
  for (const v of Object.values(byNarr)) assert.equal(v, 0);
});

test("QuickBooks Online export: debit and credit columns, journal numbers carry the month", () => {
  const csv = toQboJournalCsv(ok().journals);
  assert.match(csv, /^\*JournalNo,\*JournalDate,\*AccountName,Debits,Credits,Description,Name,Currency/);
  assert.match(csv, /AIRBNB-2026-09/);
  assert.match(csv, /AIRBNB-2026-10/);
});

test("IIF export: every transaction's lines sum to zero and end with ENDTRNS", () => {
  const iif = toIif(ok().journals).trim().split("\r\n");
  let total = 0, open = false;
  for (const l of iif) {
    if (l.startsWith("TRNS") || l.startsWith("SPL")) { total += Math.round(parseFloat(l.split("\t")[5]) * 100); open = true; }
    if (l === "ENDTRNS") { assert.equal(total, 0); total = 0; open = false; }
  }
  assert.equal(open, false);
});

test("tabs and newlines in account names cannot break IIF rows", () => {
  const { mapping } = parseMapping("sales = A\tB\nfees = C\nD");
  const iif = toIif(validate(sampleReport(), { mapping }).journals);
  for (const l of iif.split("\r\n").filter((x) => x.startsWith("TRNS") || x.startsWith("SPL"))) assert.equal(l.split("\t").length, 8);
});

test("generic journals CSV carries category and both columns", () => {
  assert.match(journalsCsv(ok().journals), /^payout,period,date,category,account,debit,credit,memo/);
});

test("parsePayouts on an empty string reports an error and does not throw", () => {
  const r = parsePayouts("");
  assert.equal(r.findings[0].severity, "error");
});
