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
  assert.equal(by("tax").credit, 2104);
  assert.equal(by("tips").credit, 2000);
  assert.equal(by("giftcards").credit, 2500);
  assert.equal(by("refunds").debit, 2000);
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
