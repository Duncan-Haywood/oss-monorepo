import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, buildReport, SAMPLE_ITEMS, SAMPLE_NET_SEPT, parseMoney, parseStatementDate, categoryOf, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());
const sept = () => buildReport(SAMPLE_ITEMS.slice(0, 9));
const septNet = Math.round(SAMPLE_NET_SEPT * 100);

test("the sample splits into one balanced journal per month with no errors", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.deepEqual(r.journals.map((j) => j.period), ["2026-09", "2026-10"]);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a typed-in monthly net proves the activity, and a wrong one is an error", () => {
  assert.equal(validate(sept(), { expected: septNet }).reconciliation[0].agrees, true);
  const bad = validate(sept(), { expected: septNet + 500 });
  assert.ok(bad.findings.some((f) => f.severity === "error" && /Do not post/.test(f.detail)));
});

test("gross sales, each fee kind, refunds and deposits are booked separately", () => {
  const lines = ok().journals[0].lines;
  const by = (c) => lines.find((l) => l.category === c);
  assert.equal(by("sales").credit, 7050);
  assert.equal(by("fees").debit, 273 + 150 + 185 + 20);
  assert.equal(by("ads").debit, 600);
  assert.equal(by("refunds").debit, 1000);
  assert.equal(by("deposits").debit, 3000);
  assert.equal(by("clearing").debit, 1822);
});

test("a month's clearing is its activity net minus deposits", () => {
  const j = ok().journals[0];
  assert.equal(j.clearing, septNet - 3000);
});

test("shipping labels get their own account", () => {
  assert.ok(ok().journals[1].lines.some((l) => l.category === "labels" && l.debit === 890));
});

test("broken sample names the bad net, the bad amount and the unknown type", () => {
  const titles = validate(sampleBrokenReport()).findings.map((f) => f.title).join("\n");
  assert.match(titles, /does not equal net on "Etsy Ads"/);
  assert.match(titles, /An amount is not a number/);
  assert.match(titles, /no rule recognised/);
});

test("unknown types are journalled to the uncategorised account, never dropped", () => {
  const line = validate(sampleBrokenReport()).journals.flatMap((j) => j.lines).find((l) => l.category === "uncategorised");
  assert.equal(line.credit, 123);
});

test("money parses symbols, dashes, negatives and European decimals", () => {
  assert.equal(parseMoney("$25.00"), 2500);
  assert.equal(parseMoney("-$1.63"), -163);
  assert.equal(parseMoney("--"), null);
  assert.equal(parseMoney("€12,50"), 1250);
  assert.equal(parseMoney("($3.00)"), -300);
  assert.ok(Number.isNaN(parseMoney("$12..5")));
});

test("dates parse month names in both orders and numeric forms", () => {
  assert.equal(parseStatementDate("September 3, 2026"), "2026-09-03");
  assert.equal(parseStatementDate("3 September 2026"), "2026-09-03");
  assert.equal(parseStatementDate("Sep 30, 2026"), "2026-09-30");
  assert.equal(parseStatementDate("2026-09-03"), "2026-09-03");
  assert.equal(parseStatementDate("30/09/2026", "dmy"), "2026-09-30");
  assert.equal(parseStatementDate("nonsense"), null);
});

test("sales-row taxes withheld go to taxes, not fees", () => {
  const csv = "Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details\n\"September 3, 2026\",Sale,Order,,USD,$50.00,-$4.00,$46.00,--\n";
  const lines = validate(csv).journals[0].lines;
  assert.equal(lines.find((l) => l.category === "taxes").debit, 400);
  assert.ok(!lines.some((l) => l.category === "fees"));
});

test("categoryOf recognises the common Etsy types", () => {
  const c = (cat, desc = "") => categoryOf({ cat, desc });
  assert.equal(c("Sale"), "sales");
  assert.equal(c("Refund"), "refunds");
  assert.equal(c("Deposit"), "deposits");
  assert.equal(c("Marketing"), "ads");
  assert.equal(c("Shipping"), "labels");
  assert.equal(c("Fee", "Listing fee"), "fees");
  assert.equal(c("Tax"), "taxes");
  assert.equal(c("Adjustment"), "other");
  assert.equal(c("Something new"), "uncategorised");
});

test("a file without the statement columns is refused with a pointer to the right export", () => {
  const r = validate("a,b\n1,2\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /Payment account/);
});

test("account mapping overrides names and reaches the exports", () => {
  const { mapping, errors } = parseMapping("sales = 200\nbogus = 1\nclearing = 1200");
  assert.equal(errors.length, 1);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,200,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().sales, "Etsy Sales");
});

test("Xero export: debits positive, credits negative, sums to zero", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^Etsy statement 2026-09,30\/09\/2026,.*,Etsy Sales,Tax Exempt,-70\.50$/);
  assert.ok(Math.abs(lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0)) < 0.005);
});

test("QuickBooks Online export has the journal-entry columns", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^2026-09,09\/30\/2026,Etsy Sales,,70\.50,/);
});

test("IIF transactions each sum to zero and end with ENDTRNS", () => {
  const blocks = toIif(ok().journals).split("ENDTRNS").slice(1, -1);
  assert.equal(blocks.length, 2);
  for (const b of blocks) {
    const amounts = b.split("\r\n").filter((l) => /^(TRNS|SPL)\t/.test(l)).map((l) => Number(l.split("\t")[5]));
    assert.ok(Math.abs(amounts.reduce((a, x) => a + x, 0)) < 0.005);
  }
});

test("generic CSV and empty input", () => {
  assert.match(journalsCsv(ok().journals), /^payout,period,date,category,account,debit,credit,memo\r\n/);
  assert.equal(parsePayouts("").findings[0].severity, "error");
});
