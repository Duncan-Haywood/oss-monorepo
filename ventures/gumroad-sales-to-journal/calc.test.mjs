import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, buildReport, SAMPLE_ITEMS, SAMPLE_NET_SEPT, parseMoney, parseSaleDate, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());
const sept = () => buildReport(SAMPLE_ITEMS.filter((i) => i.date.startsWith("2026-09")));
const septNet = Math.round(SAMPLE_NET_SEPT * 100);
const cells = (l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
const bal = (j) => j.lines.reduce((a, l) => a + l.debit - l.credit, 0);
const by = (j, c) => j.lines.find((l) => l.category === c);

test("the sample splits into balanced monthly journals with no errors or warnings", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity !== "info").length, 0);
  assert.deepEqual(r.journals.map((j) => j.period), ["2026-09", "2026-10"]);
  for (const j of r.journals) assert.equal(bal(j), 0);
});

test("sales, tax, fees, affiliate commissions, refunds and chargebacks are booked separately", () => {
  const j = ok().journals[0];
  assert.equal(by(j, "sales").credit, 2900 + 4900 + 1900 + 7900 + 2900 + 19900);
  assert.equal(by(j, "fees").debit, 340 + 540 + 240 + 840 + 340 + 2040 - 540); // the refund returned its 5.40 fee
  assert.equal(by(j, "affiliate").debit, 490 + 1990);
  assert.equal(by(j, "refunds").debit, 4900);
  assert.equal(by(j, "disputes").debit, 7900);
  assert.equal(by(j, "uncategorised"), undefined);
});

test("tax paid out to you is a liability credit, never sales, and tax Gumroad keeps is not journalled", () => {
  const m = parseMapping("tax = 2200 Sales Tax").mapping;
  const r = validate(sampleReport(), { mapping: m });
  assert.ok(r.journals[0].lines.some((l) => l.account === "2200 Sales Tax" && l.credit === 380)); // only the 3.80 whose Net includes it
  assert.ok(r.findings.some((f) => /2\.40 USD of tax is on rows where your Net does not include it/.test(f.title)));
});

test("without a Net column the taxInNet option decides", () => {
  const csv = "Sale Date,Price,Sales Tax,Gumroad Fee\n2026-09-02,10.00,1.00,1.50\n";
  assert.equal(by(validate(csv).journals[0], "tax"), undefined);
  assert.equal(by(validate(csv, { taxInNet: true }).journals[0], "tax").credit, 100);
  assert.equal(validate(csv, { taxInNet: true }).journals[0].clearing, 1000 + 100 - 150);
});

test("payouts move clearing to the bank and the unpaid net stays in clearing", () => {
  const [sep, oct] = ok().journals;
  assert.equal(sep.paidOut, 6430 + 9100);
  assert.equal(by(sep, "bank").debit, 15530);
  assert.equal(sep.clearing, septNet - 15530);
  assert.equal(sep.clearing + oct.clearing, 4220); // G4 is not paid out yet
});

test("each Payout ID is tied to the sales that carry it", () => {
  const d = Object.fromEntries(ok().deposits.map((x) => [x.id, x]));
  assert.equal(d.G1.earnings, 6430);
  assert.equal(d.G1.ties, true);
  assert.equal(d.G3.rows, 4);
  assert.equal(d.G3.ties, true);
  assert.equal(d.G4.ties, null);
});

test("a payout that does not equal its sales is a warning naming the difference, and either sign is read", () => {
  const r = validate(sampleReport().replace("-$64.30", "-$60.00"));
  assert.ok(r.findings.some((f) => f.severity === "warning" && /Payout G1: sales add up to 64\.30 USD but the payout is 60\.00 USD/.test(f.title)));
  for (const j of r.journals) assert.equal(bal(j), 0);
  assert.equal(validate(sampleReport().replace("-$64.30", "$64.30")).deposits.find((x) => x.id === "G1").ties, true);
});

test("a typed-in month total proves the sales, and a wrong one is an error", () => {
  assert.equal(validate(sept(), { expected: septNet }).reconciliation[0].agrees, true);
  assert.ok(validate(sept(), { expected: septNet + 500 }).findings.some((f) => f.severity === "error" && /Do not post/.test(f.detail)));
});

test("broken sample names the bad net, the bad amount and the failed payout", () => {
  const titles = validate(sampleBrokenReport()).findings.map((f) => f.title).join("\n");
  assert.match(titles, /Net amount does not match the columns on S1001/);
  assert.match(titles, /An amount is not a number/);
  assert.match(titles, /Payout with status "Failed" skipped/);
});

test("a boolean Refunded column books the reversal beside the sale", () => {
  const csv = "Sale Date,Price,Gumroad Fee,Net Total,Refunded\n2026-09-02,10.00,1.50,8.50,false\n2026-09-03,20.00,2.50,-2.50,true\n";
  const j = validate(csv).journals[0];
  assert.equal(by(j, "sales").credit, 3000);
  assert.equal(by(j, "refunds").debit, 2000);
  assert.equal(bal(j), 0);
});

test("incomplete sales are skipped, and unexplained money goes to uncategorised, never dropped", () => {
  const csv = sampleReport().trimEnd().split("\n");
  csv[1] = csv[1].replace("Completed", "Pending");
  const c = cells(csv[2]); c[11] = "$30.00"; csv[2] = c.join(",");
  const r = validate(csv.join("\n") + "\n");
  assert.ok(r.findings.some((f) => /status "Sale Pending" skipped/.test(f.title)));
  assert.ok(by(r.journals[0], "uncategorised"));
  for (const j of r.journals) assert.equal(bal(j), 0);
});

test("a payout-summary file with no per-sale columns is rejected with a pointer", () => {
  const r = parsePayouts("Product,Units\nPlanner,3\n");
  assert.equal(r.payouts.length, 0);
  assert.match(r.findings[0].title, /does not look like a Gumroad/);
});

test("money and dates parse", () => {
  assert.equal(parseMoney("$25.00"), 2500);
  assert.equal(parseMoney("-$1.63"), -163);
  assert.equal(parseMoney("--"), null);
  assert.ok(Number.isNaN(parseMoney("$12..5")));
  assert.equal(parseSaleDate("2026-09-02 14:03:11"), "2026-09-02");
  assert.equal(parseSaleDate("Sep 2, 2026"), "2026-09-02");
  assert.equal(parseSaleDate("Feb 30, 2026"), null);
});

test("account mapping rejects unknown categories and keeps defaults", () => {
  const r = parseMapping("fees = 6100 Platform Fees\nnope = X");
  assert.equal(r.mapping.fees, "6100 Platform Fees");
  assert.equal(r.mapping.sales, defaultMapping().sales);
  assert.equal(r.errors.length, 1);
});

test("exports carry every journal line and balance", () => {
  const { journals } = ok();
  const xero = toXeroJournalCsv(journals).trim().split("\r\n");
  assert.equal(xero.length, 1 + journals.flatMap((j) => j.lines).length);
  assert.equal(Math.round(xero.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0) * 100) || 0, 0);
  assert.match(toQboJournalCsv(journals), /^\*JournalNo/);
  const iif = toIif(journals);
  let total = 0, n = 0;
  for (const l of iif.split("\r\n")) { if (l === "ENDTRNS") { assert.equal(Math.round(total * 100) || 0, 0); total = 0; n++; } else if (/^(TRNS|SPL)\t/.test(l)) total += Number(l.split("\t")[5]); }
  assert.equal(n, journals.length);
  assert.match(journalsCsv(journals), /^month,date/);
});

test("an empty file and a non-Gumroad file are errors, not crashes", () => {
  assert.equal(validate("").findings[0].severity, "error");
  assert.match(validate("a,b\n1,2\n").findings[0].title, /does not look like a Gumroad/);
});
