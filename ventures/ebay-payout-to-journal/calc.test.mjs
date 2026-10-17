import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, categoryOf, partsOf, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());
const sum = (j) => j.lines.reduce((a, l) => a + l.debit - l.credit, 0);

test("the sample reconciles: rows add up to the Payout row and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error" || f.severity === "warning").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 13557);
  for (const j of r.journals) assert.equal(sum(j), 0);
});

test("a payout spanning a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-08"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 13557);
});

test("an order is split into item sales, shipping income, sales tax and fees", () => {
  const sept = ok().journals[0];
  const line = (c) => sept.lines.find((l) => l.category === c);
  assert.equal(line("sales").credit, 3800 + 6450 + 3800);
  assert.equal(line("shipping").credit, 500 + 500);
  assert.equal(line("tax").credit, 310);
  assert.equal(line("fees").debit, 40 + 570 + 40 + 855 + 40 + 570 + 70 + 0 + 0 - 0);
  assert.equal(line("labels").debit, 435);
});

test("ads, store fees, refunds and releases each get their own account", () => {
  const oct = ok().journals[1];
  const line = (c) => oct.lines.find((l) => l.category === c);
  assert.equal(line("ads").debit, 620);
  assert.equal(line("listing").debit, 1195);
  assert.equal(line("refunds").debit, 7305);
  assert.equal(line("other").credit, 200);
});

test("split none keeps one journal for the whole payout", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, 13557);
});

test("the broken sample names the payout mismatch, the bad amount, the column mismatch and the unknown row", () => {
  const titles = validate(sampleBrokenReport()).findings.map((f) => f.title).join("\n");
  assert.match(titles, /rows add up to 153\.55 USD but the payout is 135\.57 USD/);
  assert.match(titles, /Net amount "12\.\.5" is not a number/);
  assert.match(titles, /do not equal net on 27-11003-50003/);
  assert.match(titles, /no rule recognised/);
});

test("unknown types are journalled to the uncategorised account, never dropped", () => {
  const line = validate(sampleBrokenReport()).journals.flatMap((j) => j.lines).find((l) => l.category === "uncategorised");
  assert.equal(line.credit, 123);
});

test("the report's metadata lines above the header are skipped, and a headerless file is refused", () => {
  assert.equal(ok().summary.rows, 10);
  const r = validate("date,amount\n2026-01-01,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Payments > Reports/);
});

test("without a Payout row the deposit can be supplied, and a wrong one is an error", () => {
  const items = [{ date: "2026-09-10", type: "Order", order: "1", sub: 100, ship: 0, tax: 0, fixed: 0.4, variable: 12.9 }];
  const bare = buildReport({ items, withPayoutRow: false });
  const warn = validate(bare);
  assert.equal(warn.reconciliation[0].agrees, null);
  assert.ok(warn.findings.some((f) => /no payout row and no expected deposit/.test(f.title)));
  assert.equal(validate(bare, { expected: 8670 }).reconciliation[0].agrees, true);
  assert.ok(validate(bare, { expected: 9000 }).findings.some((f) => f.severity === "error"));
});

test("two payouts in one file are journalled separately", () => {
  const a = buildReport({ id: "11", items: [{ date: "2026-09-10", type: "Order", order: "a", sub: 10, fixed: 0.5 }] });
  const b = buildReport({ id: "22", items: [{ date: "2026-09-20", type: "Order", order: "b", sub: 20, fixed: 1 }] });
  const r = validate(a + b.split("\n").slice(5).join("\n"));
  assert.equal(r.payouts.length, 2);
  assert.deepEqual(r.reconciliation.map((x) => x.stated), [950, 1900]);
});

test("rows with no Payout ID are grouped apart and warned about", () => {
  const csv = sampleReport().replace(/5000123456/g, "--");
  assert.ok(validate(csv).findings.some((f) => /have no payout ID/.test(f.title)));
});

test("a sale in one currency paid out in another is warned about", () => {
  const csv = sampleReport().replace(/,USD,\"Oct 8, 2026\"/, ",USD,\"Oct 8, 2026\"").replace(/46\.10,USD,--/, "46.10,GBP,--");
  assert.ok(validate(csv).findings.some((f) => /sold in GBP but paid out in USD/.test(f.title)));
});

test("amounts and dates parse eBay's forms", () => {
  assert.equal(parseAmount("-12.34"), -1234);
  assert.equal(parseAmount("$1,234.56"), 123456);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("--"), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
  assert.equal(parseDate("Sep 28, 2026"), "2026-09-28");
  assert.equal(parseDate("28 Sep 2026"), "2026-09-28");
  assert.equal(parseDate("2026-09-28T10:00:00Z"), "2026-09-28");
  assert.equal(parseDate("28/09/2026", "dmy"), "2026-09-28");
  assert.equal(parseDate("31.02.2026"), null);
});

test("categoryOf reads the Type first and the Description for eBay's catch-all Other fee", () => {
  const c = (type, desc = "") => categoryOf({ type, desc });
  assert.equal(c("Order"), "sales");
  assert.equal(c("Refund"), "refunds");
  assert.equal(c("Shipping label"), "labels");
  assert.equal(c("Claim"), "disputes");
  assert.equal(c("Other fee", "Promoted Listings - General fee"), "ads");
  assert.equal(c("Other fee", "Insertion fee"), "listing");
  assert.equal(c("Other fee", "Store subscription fee"), "listing");
  assert.equal(c("Other fee", "Below standard performance fee"), "fees");
  assert.equal(c("Hold", "Hold released"), "other");
  assert.equal(c("Mystery", "thing"), "uncategorised");
});

test("partsOf always sums to the row's net, even for a hand-edited order", () => {
  const row = { type: "Order", desc: "", net: 4100, sub: 3800, ship: 500, stax: 0, feeSum: -610, hasItemCols: true };
  assert.equal(partsOf(row).reduce((a, [, v]) => a + v, 0), 4100);
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
  assert.match(lines[1], /^eBay payout 5000123456 2026-09,30\/09\/2026,Item sales \(gross\) \(3 rows\),eBay Sales,Tax Exempt,-140\.50$/);
  assert.ok(Math.abs(lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0)) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^5000123456-2026-09,09\/30\/2026,eBay Sales,,140\.50,/);
});

test("IIF export: every transaction's lines sum to zero and end with ENDTRNS", () => {
  const blocks = toIif(ok().journals).split("ENDTRNS").slice(1, -1);
  assert.equal(blocks.length, 2);
  for (const b of blocks) assert.ok(Math.abs(b.split("\r\n").filter((l) => /^(TRNS|SPL)\t/.test(l)).reduce((a, l) => a + Number(l.split("\t")[5]), 0)) < 0.005);
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
