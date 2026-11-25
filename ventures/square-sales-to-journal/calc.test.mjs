import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, buildReport, SAMPLE_ITEMS, SAMPLE_NET_SEPT, parseMoney, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());
const sept = () => buildReport(SAMPLE_ITEMS.filter((i) => i.date.startsWith("2026-09")));
const septNet = Math.round(SAMPLE_NET_SEPT * 100);
const bal = (j) => j.lines.reduce((a, l) => a + l.debit - l.credit, 0);

test("the sample splits into one balanced journal per month with no errors", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.deepEqual(r.journals.map((j) => j.period), ["2026-09", "2026-10"]);
  for (const j of r.journals) assert.equal(bal(j), 0);
});

test("sales, discounts, tax, tips, gift cards, refunds and fees are booked separately", () => {
  const by = (c) => ok().journals[0].lines.find((l) => l.category === c);
  assert.equal(by("sales").credit, 26000);
  assert.equal(by("discounts").debit, 500);
  // Row 4's $20 refund carries its share of the row's tax: 20.00 x 4.95 / 64.95 = 1.52.
  assert.equal(by("tax").credit, 2104 - 152);
  assert.equal(by("tips").credit, 2000);
  assert.equal(by("giftcards").credit, 2500);
  assert.equal(by("refunds").debit, 2000 - 152);
  assert.equal(by("fees").debit, 146 + 90 + 448 + 200 + 78);
  assert.equal(by("clearing").debit, septNet);
  assert.equal(by("uncategorised"), undefined);
});

test("tax and tips are credited as liabilities, not revenue", () => {
  const m = parseMapping("tax = 2200 Sales Tax\ntips = 2210 Tips Owed").mapping;
  const j = validate(sampleReport(), { mapping: m }).journals[0];
  assert.ok(j.lines.some((l) => l.account === "2200 Sales Tax" && l.credit > 0));
  assert.ok(j.lines.some((l) => l.account === "2210 Tips Owed" && l.credit > 0));
});

test("a typed-in month Net Total proves the payments, and a wrong one is an error", () => {
  assert.equal(validate(sept(), { expected: septNet }).reconciliation[0].agrees, true);
  const bad = validate(sept(), { expected: septNet + 500 });
  assert.ok(bad.findings.some((f) => f.severity === "error" && /Do not post/.test(f.detail)));
});

test("each Deposit ID is totalled, even across a month boundary of rows", () => {
  const dep = Object.fromEntries(ok().deposits.map((d) => [d.id, d]));
  assert.equal(dep.D100.rows, 2);
  assert.equal(dep.D100.net, 6859);
  assert.equal(dep.D102.rows, 2);
  assert.equal(dep.D102.last, "2026-09-30");
  assert.equal(ok().deposits.reduce((a, d) => a + d.net, 0), ok().payouts.flatMap((p) => p.rows).filter((r) => r.deposit).reduce((a, r) => a + r.net, 0));
});

test("rows with no Deposit ID are reported as not yet paid out", () => {
  assert.ok(ok().findings.some((f) => /no Deposit ID/.test(f.title)));
});

test("broken sample names the bad net and the bad amount", () => {
  const titles = validate(sampleBrokenReport()).findings.map((f) => f.title).join("\n");
  assert.match(titles, /does not equal Net Total on P1/);
  assert.match(titles, /An amount is not a number/);
});

test("collected money no column explains goes to uncategorised, never dropped", () => {
  const csv = sampleReport().trimEnd().split("\n");
  const c = csv[1].split(",");
  c[11] = "$99.30"; c[17] = "$97.84"; // 50.00 more collected than the columns explain
  csv[1] = c.join(",");
  const r = validate(csv.join("\n") + "\n");
  const u = r.journals[0].lines.find((l) => l.category === "uncategorised");
  assert.equal(u.credit, 5000);
  assert.ok(r.findings.some((f) => f.severity === "warning" && /not explained/.test(f.title)));
  for (const j of r.journals) assert.equal(bal(j), 0);
});

test("incomplete payments are skipped with a warning", () => {
  const csv = sampleReport().trimEnd().split("\n");
  csv[0] += ",Transaction Status";
  csv[1] += ",Voided";
  for (let i = 2; i < csv.length; i++) csv[i] += ",Complete";
  const r = validate(csv.join("\n") + "\n");
  assert.equal(r.summary.rows, SAMPLE_ITEMS.length - 1);
  assert.ok(r.findings.some((f) => /status "Voided" skipped/.test(f.title)));
});

test("an Items export without fees is rejected with a pointer to the right report", () => {
  const r = parsePayouts("Date,Category,Item,Qty,Gross Sales\n2026-09-01,Food,Latte,1,$4.00\n");
  assert.equal(r.payouts.length, 0);
  assert.match(r.findings[0].detail, /Items export has no fees/);
});

test("money parses symbols, negatives and European decimals", () => {
  assert.equal(parseMoney("$25.00"), 2500);
  assert.equal(parseMoney("-$1.63"), -163);
  assert.equal(parseMoney("€12,50"), 1250);
  assert.equal(parseMoney("($3.00)"), -300);
  assert.ok(Number.isNaN(parseMoney("$12..5")));
});

test("account mapping rejects unknown categories and keeps defaults", () => {
  const r = parseMapping("fees = 6100 Card Fees\nnope = X");
  assert.equal(r.mapping.fees, "6100 Card Fees");
  assert.equal(r.mapping.sales, defaultMapping().sales);
  assert.equal(r.errors.length, 1);
});

test("exports carry every journal line and balance", () => {
  const { journals } = ok();
  const xero = toXeroJournalCsv(journals).trim().split("\r\n");
  assert.equal(xero.length, 1 + journals.flatMap((j) => j.lines).length);
  const sum = xero.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.equal(Math.round(sum * 100), 0);
  assert.match(toQboJournalCsv(journals), /^\*JournalNo/);
  assert.match(toIif(journals), /GENERAL JOURNAL/);
  assert.match(journalsCsv(journals), /^payout,period/);
});

test("an empty file and a non-Square file are errors, not crashes", () => {
  assert.equal(validate("").findings[0].severity, "error");
  assert.match(validate("a,b\n1,2\n").findings[0].title, /does not look like a Square/);
});

// Hand-written exports (not built with buildReport), checked against double-entry by hand.
const HEAD = "Date,Gross Sales,Discounts,Net Sales,Gift Card Sales,Tax,Tip,Partial Refunds,Total Collected,Card,Cash,Square Gift Card,Other Tender,Fees,Net Total,Payment ID,Deposit ID,Transaction Status";
const line = (j, cat) => j.lines.filter((l) => l.category === cat).reduce((a, l) => a + l.debit - l.credit, 0);

test("cash and Square gift card tenders stay out of Square clearing and the deposit total", () => {
  const csv = [HEAD,
    "2026-10-03,30.00,0.00,30.00,0.00,2.40,0.00,0.00,32.40,32.40,0.00,0.00,0.00,-1.13,31.27,P1,D200,Complete",
    "2026-10-04,10.00,0.00,10.00,0.00,0.80,0.00,0.00,10.80,0.00,10.80,0.00,0.00,0.00,10.80,P2,,Complete",
    "2026-10-05,20.00,0.00,20.00,0.00,1.60,0.00,0.00,21.60,0.00,0.00,21.60,0.00,0.00,21.60,P3,,Complete"].join("\n");
  const r = validate(csv);
  const j = r.journals[0];
  assert.equal(line(j, "cash"), 1080);          // Dr Cash on Hand 10.80
  assert.equal(line(j, "giftredeemed"), 2160);  // Dr Gift Cards Outstanding 21.60
  assert.equal(line(j, "clearing"), 3127);      // Dr Square Clearing = the card deposit
  assert.equal(r.deposits.find((d) => d.id === "D200").net, 3127);
  assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
  assert.equal(j.lines.filter((l) => l.category === "uncategorised").length, 0);
});

test("an export with Net Total but no Fees column books the fee from Net Total, with no false error", () => {
  const csv = ["Date,Gross Sales,Tax,Total Collected,Net Total,Deposit ID",
    "2026-09-02,20.00,1.65,21.65,20.92,D1",
    "2026-09-03,20.00,1.65,21.65,20.92,D1"].join("\n");
  const r = validate(csv);
  const j = r.journals[0];
  assert.equal(line(j, "fees"), 146);
  assert.equal(line(j, "clearing"), 4184);
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
});

test("when Collected + Fees disagrees with Net Total, the journal follows Net Total as the message says", () => {
  const csv = ["Date,Gross Sales,Total Collected,Fees,Net Total,Deposit ID",
    "2026-09-02,20.00,20.00,-0.88,19.00,D1"].join("\n");
  const r = validate(csv);
  assert.ok(r.findings.some((f) => f.severity === "error" && /does not equal Net Total/.test(f.title)));
  const j = r.journals[0];
  assert.equal(line(j, "fees"), 100);
  assert.equal(line(j, "clearing"), 1900);
});

// A hand-written row, not buildReport: a $100 sale with $8 tax, $54 of it refunded ($50 goods + $4 tax).
const partialRefund = (extra = "") => [
  "Date,Gross Sales,Discounts,Net Sales,Tax,Tip,Partial Refunds,Total Collected,Fees,Net Total,Payment ID,Deposit ID",
  "2026-09-10,$100.00,$0.00,$100.00,$8.00,$5.00,-$54.00,$59.00,-$1.90,$57.10,P1,D1",
  extra,
].filter(Boolean).join("\n") + "\n";

test("a partial refund takes its sales tax out of Sales Tax Payable (audit 2026-11-22, defect 1)", () => {
  const r = validate(partialRefund());
  const by = (c) => r.journals[0].lines.find((l) => l.category === c);
  assert.equal(by("tax").credit, 400); // 8.00 charged less 4.00 refunded
  assert.equal(by("refunds").debit, 5000); // the goods only
  assert.equal(by("tips").credit, 500); // tips are not apportioned
  assert.equal(by("uncategorised"), undefined);
  assert.equal(bal(r.journals[0]), 0);
  assert.equal(by("clearing").debit, 5710);
  assert.ok(r.findings.some((f) => f.severity === "info" && /Sales tax taken out of 1 partial refund/.test(f.title) && /4\.00 USD of a 54\.00 USD refund/.test(f.detail)));
});

test("refundTax: none keeps the refund as one amount", () => {
  const by = (c) => validate(partialRefund(), { refundTax: "none" }).journals[0].lines.find((l) => l.category === c);
  assert.equal(by("tax").credit, 800);
  assert.equal(by("refunds").debit, 5400);
});

test("a refund on an untaxed row moves no tax", () => {
  const csv = "Date,Gross Sales,Tax,Partial Refunds,Total Collected,Fees,Net Total\n2026-09-10,$100.00,$0.00,-$40.00,$60.00,-$1.00,$59.00\n";
  const by = (c) => validate(csv).journals[0].lines.find((l) => l.category === c);
  assert.equal(by("tax"), undefined);
  assert.equal(by("refunds").debit, 4000);
});

test("a month that nets to zero writes no journal instead of a lone 0.00 line (audit 2026-11-22, defect 6)", () => {
  const csv = "Date,Gross Sales,Tax,Total Collected,Fees,Net Total,Payment ID\n2026-08-01,$1234.56,$0.00,$1234.56,-$32.40,$1202.16,P1\n2026-08-02,-$1234.56,$0.00,-$1234.56,$32.40,-$1202.16,P2\n";
  const r = validate(csv);
  assert.equal(r.journals.length, 0);
  assert.ok(r.findings.some((f) => /nets to zero: no journal written/.test(f.title)));
  assert.equal(toIif(r.journals).includes("TRNS\t\t"), false);
});
