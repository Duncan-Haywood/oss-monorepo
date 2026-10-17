import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, detectType, throughDate, extractAmounts, extractDates, parseMoney, dollars, summaryText, findingsCsv, sampleWaiver, SAMPLE_SETTINGS } from "./calc.mjs";

const ids = (r) => r.findings.map((g) => g.id);
const GOOD = `CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT. Upon receipt by the claimant of a check from Owner in the sum of $10,000.00 payable to Acme Framing, and when the check has been properly endorsed and has been paid by the bank on which it is drawn, this document becomes effective to release any mechanics lien right the claimant has on the job of Maple Street for labor and materials furnished through 09/30/2026. This release does not cover retention or items furnished after that date.`;

test("money, amounts and dates parse", () => {
  assert.equal(parseMoney("$1,234.50"), 123450);
  assert.equal(parseMoney("x"), null);
  assert.equal(dollars(123450), "$1,234.50");
  assert.deepEqual(extractAmounts("pay $10,000.00 and $2,500, not $0"), [1000000, 250000]);
  assert.deepEqual(extractDates("on 9/30/2026, 2026-10-01 and Oct. 5, 2026").map((d) => d.iso).sort(), ["2026-09-30", "2026-10-01", "2026-10-05"]);
  assert.equal(extractDates("Sept 3, 2026")[0].iso, "2026-09-03");
});

test("through date is the one after the word through, not the signing date", () => {
  assert.equal(throughDate("furnished through September 30, 2026. Signed 10/05/2026"), "2026-09-30");
  assert.equal(throughDate("signed 10/05/2026, no period"), null);
});

test("type is detected from the title words", () => {
  assert.equal(detectType("Unconditional Waiver on Progress Payment"), "unconditional-progress");
  assert.equal(detectType("Conditional Waiver and Release on Final Payment"), "conditional-final");
  assert.equal(detectType("Lien release"), null);
});

test("a clean conditional progress waiver raises no red flags", () => {
  const r = analyze(GOOD, { expectedAmount: "10000", throughDate: "2026-09-30", payment: "promised", retainageHeld: "1000", claimant: "Acme Framing", project: "Maple Street" });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(ids(r), []);
  assert.equal(r.verdict, "no-red-flags");
});

test("unconditional before the funds clear is high; cleared is not", () => {
  const t = "UNCONDITIONAL WAIVER ON PROGRESS PAYMENT for labor furnished through 09/30/2026 in the amount of $10,000.00 by Acme.";
  assert.ok(ids(analyze(t, { payment: "check" })).includes("unconditional-before-funds"));
  assert.ok(ids(analyze(t, { payment: "" })).includes("unconditional-before-funds"));
  assert.ok(!ids(analyze(t, { payment: "cleared" })).includes("unconditional-before-funds"));
  assert.equal(analyze(t, { payment: "check" }).verdict, "do-not-sign");
});

test("a condition that stops at receipt is flagged as weak", () => {
  const t = "CONDITIONAL WAIVER ON PROGRESS PAYMENT. Upon receipt of payment of $5,000.00 the claimant releases its lien for labor furnished through 09/30/2026.";
  assert.ok(ids(analyze(t, {})).includes("weak-condition"));
});

test("progress waiver that releases all claims is high without a through-date limit", () => {
  const t = "WAIVER ON PROGRESS PAYMENT. Claimant releases any and all claims of any kind against the owner. Payment $5,000.00 through 09/30/2026.";
  const g = analyze(t, {}).findings.find((x) => x.id === "broad-release");
  assert.equal(g.severity, "high");
});

test("future work wording and a missing through-date are high", () => {
  const t = "UNCONDITIONAL WAIVER ON PROGRESS PAYMENT. Claimant releases all lien rights for work performed and hereafter performed. Amount $5,000.00.";
  const r = analyze(t, { payment: "cleared" });
  assert.ok(ids(r).includes("future-work"));
  assert.ok(ids(r).includes("no-through-date"));
});

test("through-date after the billing period is high; before it is only info", () => {
  const t = "CONDITIONAL WAIVER ON PROGRESS PAYMENT paid by the bank $5,000.00 for work furnished through 10/31/2026.";
  assert.ok(ids(analyze(t, { throughDate: "2026-09-30" })).includes("through-after-billing"));
  const t2 = t.replace("10/31/2026", "08/31/2026");
  const g = analyze(t2, { throughDate: "2026-09-30" }).findings.find((x) => x.id === "through-before-billing");
  assert.equal(g.severity, "info");
});

test("amount mismatch names what the waiver says; a blank amount is flagged", () => {
  const t = "CONDITIONAL WAIVER ON PROGRESS PAYMENT paid by the bank in the amount of $48,500.00 through 09/30/2026.";
  const g = analyze(t, { expectedAmount: "52000" }).findings.find((x) => x.id === "amount-mismatch");
  assert.match(g.why, /\$48,500\.00/);
  const blank = analyze("CONDITIONAL WAIVER ON PROGRESS PAYMENT paid by the bank through 09/30/2026 for labor.", { expectedAmount: "52000" });
  assert.ok(ids(blank).includes("no-amount"));
});

test("retainage and pending claims need exceptions", () => {
  const t = "CONDITIONAL WAIVER ON PROGRESS PAYMENT paid by the bank $5,000.00 through 09/30/2026 for all labor.";
  const r = analyze(t, { retainageHeld: "500", pendingClaims: "7200" });
  assert.ok(ids(r).includes("retainage-not-excepted"));
  assert.ok(ids(r).includes("pending-claims"));
  const ok = analyze(t + " Except retainage and pending change order 4.", { retainageHeld: "500", pendingClaims: "7200" });
  assert.ok(!ids(ok).includes("retainage-not-excepted"));
  assert.ok(!ids(ok).includes("pending-claims"));
});

test("indemnity, bond release and other waived rights are caught", () => {
  const t = "CONDITIONAL WAIVER ON FINAL PAYMENT paid by the bank. Claimant releases the payment bond, waives trial by jury and agrees to indemnify the owner.";
  const r = analyze(t, {});
  for (const id of ["indemnity", "bond-release", "other-rights"]) assert.ok(ids(r).includes(id), id);
});

test("claimant and project names must appear; statutory states get an info note", () => {
  const r = analyze(GOOD, { claimant: "Other Co", project: "Elm Court", state: "CA" });
  assert.ok(ids(r).includes("claimant-missing"));
  assert.ok(ids(r).includes("project-missing"));
  assert.equal(r.findings.find((x) => x.id === "statutory-form").severity, "info");
});

test("bad numbers and empty text produce errors, not findings", () => {
  assert.equal(analyze("short").errors.length, 1);
  assert.match(analyze(GOOD, { expectedAmount: "abc" }).errors[0], /not a number/);
});

test("the sample trips the headline rules and the outputs render", () => {
  const r = analyze(sampleWaiver(), SAMPLE_SETTINGS);
  assert.equal(r.verdict, "do-not-sign");
  for (const id of ["unconditional-before-funds", "broad-release", "future-work", "amount-mismatch", "indemnity", "bond-release", "pending-claims"]) assert.ok(ids(r).includes(id), id);
  assert.ok(r.findings[0].severity === "high");
  assert.match(summaryText(r, SAMPLE_SETTINGS), /RESULT: Do not sign as written/);
  assert.equal(findingsCsv(r).split("\n").length, r.findings.length + 1);
});
