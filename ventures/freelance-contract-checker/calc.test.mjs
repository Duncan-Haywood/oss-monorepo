import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, paymentDays, revisionCount, parseMoney, dollars, sampleContract, SAMPLE_SETTINGS, summaryText, findingsCsv } from "./calc.mjs";

const ids = (r) => r.findings.map((g) => g.id);

test("sample contract trips the big traps", () => {
  const r = analyze(sampleContract(), SAMPLE_SETTINGS);
  for (const id of ["slow-payment", "pay-when-paid", "ip-before-payment", "ip-too-broad", "unlimited-revisions", "terminate-no-pay", "non-compete", "uncapped-indemnity", "absolute-warranty", "no-deposit"]) {
    assert.ok(ids(r).includes(id), `missing ${id}: ${ids(r)}`);
  }
  assert.equal(r.verdict, "push-back");
  assert.equal(r.extracted.days, 60);
});

const GOOD = `Services Agreement. Consultant will build the website described in Exhibit A for a fee of $6,000: 40% deposit on signing, 30% at design approval, 30% on delivery. Invoices are payable net 15. Late invoices accrue 1.5% interest per month on any overdue balance and Consultant may suspend work until paid. Two rounds of revisions are included; additional changes are billed at $90 per hour under a written change order. Deliverables are deemed accepted if Client does not object in writing within 7 days of delivery. Ownership of the deliverables transfers to Client upon full payment; Consultant retains all pre-existing materials and tools and may show the work in a portfolio. Either party may terminate on 14 days notice; Client pays for all work performed and the deposit is non-refundable. Each party's liability is limited to fees paid and neither is liable for consequential damages. The prevailing party recovers reasonable attorney fees.`;

test("a balanced contract has no high findings", () => {
  const r = analyze(GOOD, { fee: "6000" });
  assert.deepEqual(r.findings.filter((g) => g.severity === "high").map((g) => g.id), []);
  assert.notEqual(r.verdict, "push-back");
});

test("payment day parsing", () => {
  assert.equal(paymentDays("Invoices are payable Net 45."), 45);
  assert.equal(paymentDays("payment due within 90 days of receipt of invoice"), 90);
  assert.equal(paymentDays("due upon receipt"), null);
});

test("net 30 is not flagged at the default, net 45 is", () => {
  assert.ok(!ids(analyze(GOOD.replace("net 15", "net 30"), {})).includes("slow-payment"));
  assert.ok(ids(analyze(GOOD.replace("net 15", "net 45"), {})).includes("slow-payment"));
  assert.ok(!ids(analyze(GOOD.replace("net 15", "net 45"), { wantedDays: "60" })).includes("slow-payment"));
});

test("revision count", () => {
  assert.equal(revisionCount("Two rounds of revisions are included"), 2);
  assert.equal(revisionCount("up to 3 revisions"), 3);
  assert.equal(revisionCount("no mention"), null);
});

test("ip transfer on full payment is not flagged as before payment", () => {
  assert.ok(!ids(analyze(GOOD, {})).includes("ip-before-payment"));
});

test("short text and bad fee return errors", () => {
  assert.ok(analyze("too short", {}).errors.length);
  assert.ok(analyze(GOOD, { fee: "abc" }).errors.length);
});

test("money helpers and outputs", () => {
  assert.equal(parseMoney("$1,234.50"), 123450);
  assert.equal(parseMoney("x"), null);
  assert.equal(dollars(123450), "$1,234.50");
  const r = analyze(sampleContract(), SAMPLE_SETTINGS);
  assert.match(summaryText(r, SAMPLE_SETTINGS), /not legal advice/);
  assert.equal(findingsCsv(r).split("\n").length, r.findings.length + 1);
});

// Quality round 119 (portfolio/quality/audits/2026-11-26-freelance-contract-checker.json, defect 1):
// the optional word-number group used to swallow the leading digit, so "within 90 days" read as 0.
test("multi-digit day counts are read whole, with no 'payment' before them", () => {
  assert.equal(paymentDays("Client shall pay within 90 days of receipt of invoice."), 90);
  assert.equal(paymentDays("Client shall pay the balance within 90 days of completion."), 90);
  assert.equal(paymentDays("Client pays within 120 days of acceptance."), 120);
  assert.equal(paymentDays("Client pays within sixty (60) days of delivery."), 60);
  const r = analyze("This Services Agreement is between Client and Contractor for a brochure for a fee of $3,000. Two rounds of revisions are included; further work needs a written change order. Deliverables are deemed accepted after 5 days. A 50% deposit is due on signing. Late invoices accrue 1.5% per month. Each party's liability is limited to fees paid. Client shall pay the balance within 90 days of completion.", { fee: "3000" });
  assert.equal(r.extracted.days, 90);
  assert.notEqual(r.verdict, "no-red-flags");
});
