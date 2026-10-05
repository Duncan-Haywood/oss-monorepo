import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, categoryOf, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());

test("the sample reconciles: rows add up to the payout row and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 55954);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a payout spanning a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-08"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 55954);
});

test("gross sales and fees are booked separately, not as the net deposit", () => {
  const sept = ok().journals[0];
  const sales = sept.lines.find((l) => l.category === "sales"), fees = sept.lines.find((l) => l.category === "fees");
  assert.equal(sales.credit, 12999 + 4900 + 1900);
  assert.equal(fees.debit, 397 + 172 + 85);
});

test("split none keeps one journal for the whole payout", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, 55954);
});

test("refunds, disputes, fees and adjustments each get their own line", () => {
  const cats = new Set(ok().journals.flatMap((j) => j.lines.map((l) => l.category)));
  for (const c of ["sales", "refunds", "disputes", "fees", "other", "clearing"]) assert.ok(cats.has(c), c);
});

test("dispute fees land in fees, not disputes", () => {
  const oct = ok().journals[1];
  assert.equal(oct.lines.find((l) => l.category === "disputes").debit, 1900);
});

test("the broken sample names the payout mismatch, the bad amount and the unknown category", () => {
  const titles = validate(sampleBrokenReport()).findings.map((f) => f.title).join("\n");
  assert.match(titles, /rows add up to 561\.97 USD but the payout is 559\.54 USD/);
  assert.match(titles, /Net amount "12\.\.5" is not a number/);
  assert.match(titles, /no rule recognised/);
});

test("unknown categories are journalled to the uncategorised account, never dropped", () => {
  const line = validate(sampleBrokenReport()).journals.flatMap((j) => j.lines).find((l) => l.category === "uncategorised");
  assert.equal(line.credit, 123);
});

test("a row whose gross minus fee is not its net is flagged", () => {
  const csv = sampleReport().replace("129.99,3.97,126.02", "129.99,3.97,120.00");
  assert.ok(validate(csv).findings.some((f) => /Gross minus fee does not equal net/.test(f.title)));
});

test("without a payout row the deposit can be supplied, and a wrong one is an error", () => {
  const bare = buildReport({ items: [["2026-09-10", "charge", 100, 3.2, "x"]], withPayoutRow: false });
  const warn = validate(bare);
  assert.equal(warn.reconciliation[0].agrees, null);
  assert.ok(warn.findings.some((f) => /no payout row and no expected deposit/.test(f.title)));
  assert.equal(validate(bare, { expected: 9680 }).reconciliation[0].agrees, true);
  assert.ok(validate(bare, { expected: 9000 }).findings.some((f) => f.severity === "error"));
});

test("rows with no payout id are grouped apart and warned about", () => {
  const csv = sampleReport().split("\n").map((l, i) => (i === 2 ? l.replace("po_1TESTPAYOUT01", "") : l)).join("\n");
  const r = validate(csv);
  assert.ok(r.findings.some((f) => /have no payout ID/.test(f.title) || /has no payout ID/.test(f.title)));
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

test("the balance-transactions export (Title Case headers, type column) is read too", () => {
  const csv = [
    "id,Type,Source,Amount,Fee,Net,Currency,Created (UTC),Available On (UTC),Description,Automatic Payout ID,Automatic Payout Effective At (UTC)",
    "txn_1,charge,ch_1,100.00,3.20,96.80,usd,2026-09-10 10:00,2026-09-12,Sale,po_9,2026-09-12",
    "txn_2,payout,po_9,-96.80,0.00,-96.80,usd,2026-09-12 00:00,2026-09-12,STRIPE PAYOUT,po_9,2026-09-12",
  ].join("\n");
  const r = validate(csv);
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].stated, 9680);
  assert.equal(r.reconciliation[0].agrees, true);
});

test("a file without the payout columns is refused with a pointer to the right report", () => {
  const r = validate("date,amount\n2026-01-01,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Payout reconciliation/);
});

test("two payouts in one file are journalled separately", () => {
  const a = buildReport({ id: "po_1", items: [["2026-09-10", "charge", 10, 0.5, "a"]] });
  const b = buildReport({ id: "po_2", items: [["2026-09-20", "charge", 20, 1, "b"]] });
  const r = validate(a + b.split("\n").slice(1).join("\n"));
  assert.equal(r.payouts.length, 2);
  assert.deepEqual(r.reconciliation.map((x) => x.stated), [950, 1900]);
});

test("categoryOf recognises the common Stripe reporting categories", () => {
  const c = (cat) => categoryOf({ cat });
  assert.equal(c("charge"), "sales");
  assert.equal(c("refund"), "refunds");
  assert.equal(c("dispute"), "disputes");
  assert.equal(c("dispute_reversal"), "disputes");
  assert.equal(c("stripe_fee"), "fees");
  assert.equal(c("network_cost"), "fees");
  assert.equal(c("tax"), "fees");
  assert.equal(c("adjustment"), "other");
  assert.equal(c("something_new"), "uncategorised");
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("sales = 200\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.sales, "200");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,200,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().sales, "Stripe Sales");
});

test("Xero export: debits positive, credits negative, columns as the manual journal import expects", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^Stripe payout po_1TESTPAYOUT01 2026-09,30\/09\/2026,Card and wallet sales \(gross\) \(3 rows\),Stripe Sales,Tax Exempt,-197\.99$/);
  const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^po_1TESTPAYOUT01-2026-09,09\/30\/2026,Stripe Sales,,197\.99,/);
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
