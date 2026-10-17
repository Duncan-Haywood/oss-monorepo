import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, categoryOf, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parseSettlements } from "./calc.mjs";

const ok = () => validate(sampleReport());

test("the sample reconciles: rows add up to the stated deposit and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 22087);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a settlement spanning a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-08"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 22087);
});

test("split none keeps one journal for the whole settlement", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, 22087);
});

test("facilitator-withheld tax nets against tax collected, so the tax line disappears when it is zero", () => {
  const cats = ok().journals.flatMap((j) => j.lines.map((l) => l.category));
  assert.ok(!cats.includes("tax"));
});

test("refunds, reserve, advertising and subscription each get their own line", () => {
  const cats = new Set(ok().journals.flatMap((j) => j.lines.map((l) => l.category)));
  for (const c of ["sales", "shipping", "promo", "refunds", "referral", "fba", "storage", "advertising", "subscription", "clearing"]) assert.ok(cats.has(c), c);
});

test("the broken sample names the deposit mismatch, the bad amount and the unknown item", () => {
  const titles = validate(sampleBrokenReport()).findings.map((f) => f.title).join("\n");
  assert.match(titles, /rows add up to 307\.10 USD but the deposit is 220\.87 USD/);
  assert.match(titles, /Amount "12\.\.5" is not a number/);
  assert.match(titles, /no rule recognised/);
});

test("unknown items are journalled to the uncategorised account, never dropped", () => {
  const r = validate(sampleBrokenReport());
  const line = r.journals.flatMap((j) => j.lines).find((l) => l.category === "uncategorised");
  assert.equal(line.credit, 123);
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
  assert.equal(parseDate("2026-09-28 00:00:00 UTC"), "2026-09-28");
  assert.equal(parseDate("28.09.2026 00:00:00 UTC"), "2026-09-28");
  assert.equal(parseDate("09/28/2026"), "2026-09-28");
  assert.equal(parseDate("28/09/2026", "dmy"), "2026-09-28");
  assert.equal(parseDate("31.02.2026"), null);
});

test("comma-separated reports and quoted cells parse the same as tab-separated", () => {
  const csv = sampleReport().split("\n").map((l) => l.split("\t").map((c) => (c.includes(" ") ? `"${c}"` : c)).join(",")).join("\n");
  assert.equal(validate(csv).reconciliation[0].stated, 22087);
});

test("a file without the settlement columns is refused with a pointer to the right report", () => {
  const r = validate("date,amount\n2026-01-01,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Flat File V2/);
});

test("two settlements in one file are journalled separately", () => {
  const a = buildReport({ id: "1", items: [["Order", "o", "ItemPrice", "Principal", "2026-09-10", 10]] });
  const b = buildReport({ id: "2", items: [["Order", "o2", "ItemPrice", "Principal", "2026-09-20", 20]] });
  const both = a + b.split("\n").slice(1).join("\n");
  const r = validate(both);
  assert.equal(r.settlements.length, 2);
  assert.deepEqual(r.reconciliation.map((x) => x.stated), [1000, 2000]);
});

test("categoryOf recognises the common Amazon rows", () => {
  const c = (type, amountType, desc) => categoryOf({ type, amountType, desc });
  assert.equal(c("Order", "ItemPrice", "Principal"), "sales");
  assert.equal(c("Refund", "ItemPrice", "Principal"), "refunds");
  assert.equal(c("Order", "ItemFees", "Commission"), "referral");
  assert.equal(c("Order", "ItemFees", "FBAWeightBasedFee"), "fba");
  assert.equal(c("Order", "ItemFees", "ShippingChargeback"), "otherfees");
  assert.equal(c("Order", "ItemPrice", "ShippingTax"), "tax");
  assert.equal(c("other-transaction", "other-transaction", "Storage Fee"), "storage");
  assert.equal(c("other-transaction", "other-transaction", "FBA Inventory Reimbursement - Lost:Warehouse"), "reimbursements");
  assert.equal(c("other-transaction", "other-transaction", "Something new"), "uncategorised");
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("sales = 200\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.sales, "200");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,200,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().sales, "Amazon Sales");
});

test("Xero export: debits positive, credits negative, columns as the manual journal import expects", () => {
  const csv = toXeroJournalCsv(ok().journals);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^Amazon settlement 12345678901 2026-09,30\/09\/2026,Product sales \(1 row\),Amazon Sales,Tax Exempt,-129\.99$/);
  const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^12345678901-2026-09,09\/30\/2026,Amazon Sales,,129\.99,/);
});

test("IIF export: every transaction's lines sum to zero and end with ENDTRNS", () => {
  const txt = toIif(ok().journals);
  const blocks = txt.split("ENDTRNS").slice(1, -1);
  assert.equal(blocks.length, 2);
  for (const b of blocks) {
    const amounts = b.split("\r\n").filter((l) => /^(TRNS|SPL)\t/.test(l)).map((l) => Number(l.split("\t")[5]));
    assert.ok(Math.abs(amounts.reduce((a, x) => a + x, 0)) < 0.005);
  }
});

test("tabs and newlines in account names cannot break IIF rows", () => {
  const { mapping } = parseMapping("sales = Bad\tName");
  const txt = toIif(validate(sampleReport(), { mapping }).journals);
  assert.ok(!/Bad\tName/.test(txt));
});

test("generic journals CSV carries category and both columns", () => {
  assert.match(journalsCsv(ok().journals), /^settlement,period,date,category,account,debit,credit,memo\r\n/);
});

test("rows without a settlement summary row are journalled with a warning", () => {
  const lines = sampleReport().split("\n");
  const r = validate([lines[0], ...lines.slice(2)].join("\n"));
  assert.ok(r.findings.some((f) => /no summary row/.test(f.title)));
  assert.equal(r.journals.length, 2);
});

test("parseSettlements on an empty string reports an error and does not throw", () => {
  assert.equal(parseSettlements("").findings[0].severity, "error");
});
