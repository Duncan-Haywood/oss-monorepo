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

// Quality audit 2026-11-26 (portfolio/quality/audits/2026-11-26-freelance-contract-checker.json), defects 1-3, 6, 7, 12:
// phrase pairs are tested inside one sentence, so a cap or condition elsewhere no longer clears a clause.
const BASE = "This Services Agreement is between Client and Contractor for a brochure for a fee of $3,000. A 50% deposit is due on signing. Invoices are payable net 15. Late invoices accrue 1.5% per month. Two rounds of revisions are included; further work needs a written change order. Deliverables are deemed accepted after 5 days. The prevailing party recovers reasonable attorney fees.";

test("liability that expands damages is not read as a liability limit (defect 1)", () => {
  assert.ok(ids(analyze(BASE, {})).includes("no-liability-limit"));
  assert.ok(ids(analyze(BASE + " Contractor shall be liable for all damages, including consequential damages and lost profits.", {})).includes("no-liability-limit"));
  assert.ok(ids(analyze(BASE + " Contractor is liable for any loss caused by the work.", {})).includes("no-liability-limit"));
  for (const cap of [
    " Each party's liability is limited to fees paid.",
    " Contractor's total liability shall not exceed the fees paid under this Agreement.",
    " In no event shall either party be liable for indirect or consequential damages.",
    " Neither party is liable for consequential damages.",
    " Both parties waive any claim for consequential or incidental damages.",
  ]) assert.ok(!ids(analyze(BASE + cap, {})).includes("no-liability-limit"), cap);
});

test("an unrelated money limit does not cap an indemnity (defect 2)", () => {
  const ind = " Contractor shall indemnify and hold harmless Client from all claims arising from the work.";
  assert.ok(ids(analyze(BASE + ind, {})).includes("uncapped-indemnity"));
  assert.ok(ids(analyze(BASE + ind + " Reimbursable expenses are limited to $200 per month.", {})).includes("uncapped-indemnity"));
  assert.ok(ids(analyze(BASE + ind + " Each party's liability is limited to fees paid.", {})).includes("uncapped-indemnity"), "a general liability cap that does not name the indemnity often carves it out");
  assert.ok(ids(analyze(BASE + " Contractor shall indemnify Client, limited to third-party claims caused by Contractor's breach.", {})).includes("uncapped-indemnity"), "a scope limit is not a money cap");
  assert.ok(!ids(analyze(BASE + " Contractor shall indemnify Client for third-party claims, in an amount not to exceed the fees paid.", {})).includes("uncapped-indemnity"));
});

test("'upon payment' elsewhere does not make an assignment payment-conditional (defect 3)", () => {
  const assign = " Contractor hereby assigns to Client all rights in the deliverables upon creation.";
  assert.ok(ids(analyze(BASE + assign + " Contractor will begin work upon payment of the deposit.", {})).includes("ip-before-payment"));
  assert.ok(!ids(analyze(BASE + " Contractor assigns the deliverables to Client upon full payment of all invoices.", {})).includes("ip-before-payment"));
});

test("a late-fee day count is not the payment term (defect 6)", () => {
  assert.equal(paymentDays("Invoices are payable net 15. Invoices that remain unpaid after 60 days accrue a late fee of 1.5% per month."), 15);
  assert.equal(paymentDays("Late payment: interest accrues on invoices not paid within 45 days of invoice."), null);
  assert.equal(paymentDays("Payment is due within 45 days of invoice, after which interest accrues."), 45);
  assert.equal(paymentDays("Client shall pay the outstanding balance within 30 days of invoice."), 30);
  const r = analyze(BASE.replace("Late invoices accrue 1.5% per month.", "Invoices that remain unpaid after 60 days accrue a late fee of 1.5% per month."), {});
  assert.ok(!ids(r).includes("slow-payment"), ids(r).join());
});

test("'all revisions Client requests' is open-ended (defect 7)", () => {
  assert.ok(ids(analyze(BASE.replace("Two rounds of revisions are included; further", "Contractor will make all revisions Client requests; further"), {})).includes("unlimited-revisions"));
});

test("a parsed 0 days shows as 0, not 'not found' (defect 12)", () => {
  const r = analyze(BASE.replace("net 15", "net 0"), {});
  assert.equal(r.extracted.days, 0);
  assert.match(summaryText(r), /Payment due in the text: 0 days/);
});
