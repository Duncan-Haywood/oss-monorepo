import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, parseAmount, parseDate, categoryOf, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());

test("the sample reconciles: the Balance column is continuous and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error" || f.severity === "warning").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, -2898);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a month-end-spanning download becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-06"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, -2898);
});

test("split none keeps one journal for the whole file", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, -2898);
});

test("fees are split from gross sales, and a refund's returned fee reduces the fee line", () => {
  const sep = ok().journals;
  assert.equal(sep[0].lines.find((l) => l.category === "sales").credit, 19799);
  assert.equal(sep[0].lines.find((l) => l.category === "processing").debit, 667);
  assert.equal(sep[1].lines.find((l) => l.category === "processing").debit, 130);
});

test("refunds, disputes, payments sent and bank transfers each get their own line", () => {
  const cats = new Set(ok().journals.flatMap((j) => j.lines.map((l) => l.category)));
  for (const c of ["sales", "refunds", "disputes", "processing", "purchases", "transfers", "clearing"]) assert.ok(cats.has(c), c);
});

test("memo rows (Balance Impact = Memo) and pending rows are skipped and reported, not journalled", () => {
  const f = ok().findings.map((x) => x.title).join("\n");
  assert.match(f, /1 memo row skipped/);
  const pend = buildReport({ items: [["Website Payment", "2026-09-01", 10, -0.5], ["Website Payment", "2026-09-02", 20, -1, "x", "y", "Pending"]] });
  const r = validate(pend);
  assert.equal(r.reconciliation[0].stated, 950);
  assert.match(r.findings.map((x) => x.title).join("\n"), /pending, denied or cancelled/);
});

test("a gap in the Balance column is named at the row where it breaks", () => {
  const f = validate(sampleBrokenReport()).findings;
  const br = f.filter((x) => /Balance column breaks/.test(x.title));
  assert.ok(br.length >= 1);
  assert.match(br[0].detail, /Rows are missing or out of order/);
  assert.ok(f.some((x) => /Balance column moved by/.test(x.title)));
});

test("a bad amount is reported and the row left out", () => {
  const titles = validate(sampleBrokenReport()).findings.map((f) => f.title).join("\n");
  assert.match(titles, /not valid \(gross "12\.\.5"/);
});

test("unknown transaction types are journalled to uncategorised, never dropped", () => {
  const r = validate(buildReport({ items: [["Mystery Adjustment", "2026-09-01", 7.5, 0]] }));
  const line = r.journals.flatMap((j) => j.lines).find((l) => l.category === "uncategorised");
  assert.equal(line.credit, 750);
  assert.ok(r.findings.some((f) => /no rule recognised/.test(f.title)));
});

test("an ascending file reads the same as a descending one", () => {
  const lines = sampleReport().trim().split("\n");
  const asc = [lines[0], ...lines.slice(1).reverse()].join("\n");
  assert.equal(validate(asc).reconciliation[0].stated, -2898);
  assert.equal(validate(asc).findings.filter((f) => f.severity === "error").length, 0);
});

test("two currencies are journalled separately", () => {
  const usd = buildReport({ items: [["Website Payment", "2026-09-10", 10, -0.5]] });
  const eur = buildReport({ items: [["Website Payment", "2026-09-20", 20, -1]], currency: "EUR" });
  const r = validate(usd + eur.split("\n").slice(1).join("\n"));
  assert.equal(r.settlements.length, 2);
  assert.deepEqual(r.reconciliation.map((x) => [x.currency, x.stated]), [["USD", 950], ["EUR", 1900]]);
});

test("DD/MM/YYYY downloads are read per the chosen order", () => {
  const r = validate(buildReport({ items: [["Website Payment", "2026-09-30", 10, -0.5]], mdy: false }), { dateOrder: "dmy" });
  assert.equal(r.journals[0].date, "2026-09-30");
});

test("amounts parse US, European and thousands-separated forms to cents", () => {
  assert.equal(parseAmount("12.34"), 1234);
  assert.equal(parseAmount("-12,34"), -1234);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
});

test("dates parse ISO, dotted European and slashed per the chosen order", () => {
  assert.equal(parseDate("2026-09-28 00:00:00"), "2026-09-28");
  assert.equal(parseDate("28.09.2026"), "2026-09-28");
  assert.equal(parseDate("09/28/2026"), "2026-09-28");
  assert.equal(parseDate("28/09/2026", "dmy"), "2026-09-28");
  assert.equal(parseDate("31.02.2026"), null);
});

test("a file without the Activity columns is refused with a pointer to the right report", () => {
  const r = validate("when,amount\n2026-01-01,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Activity download/);
});

test("without a Balance column the rows are journalled with a warning, not an error", () => {
  const csv = ["Date,Type,Status,Currency,Gross,Fee,Net", "09/01/2026,Website Payment,Completed,USD,10.00,-0.50,9.50"].join("\n");
  const r = validate(csv);
  assert.ok(r.findings.some((f) => /no Balance column/.test(f.title)));
  assert.equal(r.journals.length, 1);
});

test("a gross plus fee that is not the stated net is flagged and the net wins", () => {
  const csv = ["Date,Type,Status,Currency,Gross,Fee,Net,Balance", "09/01/2026,Website Payment,Completed,USD,10.00,-0.50,9.00,9.00"].join("\n");
  const r = validate(csv);
  assert.ok(r.findings.some((f) => /Gross plus fee/.test(f.title)));
  assert.equal(r.reconciliation[0].stated, 900);
});

test("categoryOf recognises the common PayPal transaction types", () => {
  const c = (type, amount = 100, part = "gross") => categoryOf({ type, amount, part });
  assert.equal(c("Website Payment"), "sales");
  assert.equal(c("Express Checkout Payment"), "sales");
  assert.equal(c("Payment Refund", -100), "refunds");
  assert.equal(c("Chargeback", -100), "disputes");
  assert.equal(c("Hold on Balance for Dispute Investigation", -100), "disputes");
  assert.equal(c("General Withdrawal", -100), "transfers");
  assert.equal(c("General Currency Conversion"), "conversion");
  assert.equal(c("Payment Sent", -100), "purchases");
  assert.equal(c("Website Payment", -5, "fee"), "processing");
  assert.equal(c("Something new"), "uncategorised");
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("sales = 200\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.sales, "200");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,200,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().sales, "PayPal Sales");
});

test("Xero export: debits positive, credits negative, columns as the manual journal import expects", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.equal(lines[1], "PayPal USD 2026-09,30/09/2026,Payments received (gross) (3 rows),PayPal Sales,Tax Exempt,-197.99");
  const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.ok(lines[1].startsWith("PayPal USD-2026-09,09/30/2026,PayPal Sales,,197.99,"));
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
  assert.match(journalsCsv(ok().journals), /^settlement,period,date,category,account,debit,credit,memo\r\n/);
});

test("parsePayouts on an empty string reports an error and does not throw", () => {
  assert.equal(parsePayouts("").findings[0].severity, "error");
});
