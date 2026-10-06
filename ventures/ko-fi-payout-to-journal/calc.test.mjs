import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts, incomeCategory } from "./calc.mjs";

const ok = () => validate(sampleReport());
const line = (j, cat) => j.lines.find((l) => l.category === cat);

test("the sample reconciles: rows add up to the typed deposit and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 15530);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a deposit that spans a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-03"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 15530);
});

test("tips, memberships, shop orders and commissions each get their own income account", () => {
  const [sept, oct] = ok().journals;
  assert.equal(line(sept, "donations").credit, 500);
  assert.equal(line(sept, "memberships").credit, 1000);
  assert.equal(line(sept, "shop").credit, 1800);
  assert.equal(line(oct, "commissions").credit, 12000);
});

test("the fee is Given minus Received, booked gross rather than netted into income", () => {
  const [sept, oct] = ok().journals;
  assert.equal(line(sept, "fees").debit, 15 + 65 + 125);
  assert.equal(line(oct, "fees").debit, 790 + 10 + 65);
});

test("transaction types map loosely and unknown ones are reviewed, not guessed", () => {
  assert.equal(incomeCategory("Donation"), "donations");
  assert.equal(incomeCategory("Subscription"), "memberships");
  assert.equal(incomeCategory("Shop Order"), "shop");
  assert.equal(incomeCategory("Commission"), "commissions");
  assert.equal(incomeCategory(""), "donations");
  assert.equal(incomeCategory("Gift Card"), "uncategorised");
});

test("split none keeps one journal for the whole export", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, 15530);
});

test("the broken sample names the mismatch, the bad amount, the unknown type and the swapped columns", () => {
  const f = validate(sampleBrokenReport()).findings;
  const titles = f.map((x) => x.title).join("\n");
  assert.match(titles, /rows add up to 159\.45 USD but the payout is 155\.30 USD/);
  assert.match(titles, /An amount on T1007 is not a number/);
  assert.match(titles, /T1008: received is more than given/);
  assert.match(titles, /1 item no rule recognised/);
});

test("an unknown transaction type is journalled to uncategorised, never dropped", () => {
  const j = validate(sampleBrokenReport()).journals.flatMap((x) => x.lines);
  assert.equal(j.find((l) => l.category === "uncategorised").credit, 1000);
});

test("without a deposit row the deposit can be supplied, and a wrong one is an error", () => {
  const bare = buildReport({ items: [["2026-09-10", "a", "x", "Donation", 10, 9]], withPayoutRow: false });
  const warn = validate(bare);
  assert.equal(warn.reconciliation[0].agrees, null);
  assert.ok(warn.findings.some((f) => /no payout row and no expected deposit/.test(f.title)));
  assert.equal(validate(bare, { expected: 900 }).reconciliation[0].agrees, true);
  assert.ok(validate(bare, { expected: 950 }).findings.some((f) => f.severity === "error"));
});

test("a real-shaped Ko-fi header is read by name, in any column order", () => {
  const csv = "DateTime (UTC),From,Message,Item,Received,Given,Currency,TransactionType,TransactionId,Reference\n2026-09-10 08:00:00,A,hi,Ko-fi Donation,4.85,5.00,USD,Donation,t1,r1\n";
  const r = validate(csv, { expected: 485 });
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(line(r.journals[0], "fees").debit, 15);
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

test("a file without the Ko-fi columns is refused with a pointer to the right export", () => {
  const r = validate("date,amount\n2026-01-01,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Dashboard > Transactions/);
});

test("tab-separated exports and a BOM are read", () => {
  const tsv = "\ufeff" + sampleReport().replace(/,/g, "\t");
  assert.equal(validate(tsv).reconciliation[0].agrees, true);
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("memberships = 200\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.memberships, "200");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,200,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().memberships, "Ko-fi Membership Income");
});

test("Xero export: debits positive, credits negative, columns as the manual journal import expects", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^Ko-fi payout all rows 2026-09,30\/09\/2026,Ko-fi donations and tips \(gross\) \(1 row\),Ko-fi Donation Income,Tax Exempt,-5\.00$/);
  const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^all rows-2026-09,09\/30\/2026,Ko-fi Donation Income,,5\.00,/);
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
  const { mapping } = parseMapping("shop = Bad\tName");
  assert.ok(!/Bad\tName/.test(toIif(validate(sampleReport(), { mapping }).journals)));
});

test("generic journals CSV carries category and both columns", () => {
  assert.match(journalsCsv(ok().journals), /^payout,period,date,category,account,debit,credit,memo\r\n/);
});

test("parsePayouts on an empty string reports an error and does not throw", () => {
  assert.equal(parsePayouts("").findings[0].severity, "error");
});
