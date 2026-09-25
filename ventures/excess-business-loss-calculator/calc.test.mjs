import { test } from "node:test";
import assert from "node:assert/strict";
import { excessBusinessLossOutcome, money, EBL_THRESHOLDS } from "./calc.mjs";

test("a loss under the threshold is fully allowed, no excess", () => {
  const r = excessBusinessLossOutcome({
    filingStatus: "single", taxYear: 2025, businessIncome: 50_000, businessDeductions: 200_000,
  });
  assert.equal(r.netLoss, 150_000);
  assert.equal(r.allowedLoss, 150_000);
  assert.equal(r.excessLoss, 0);
  assert.equal(r.limited, false);
});

test("a loss over the threshold is capped, excess becomes an NOL carryforward", () => {
  const r = excessBusinessLossOutcome({
    filingStatus: "single", taxYear: 2025, businessIncome: 0, businessDeductions: 400_000,
  });
  assert.equal(r.netLoss, 400_000);
  assert.equal(r.threshold, 313_000);
  assert.equal(r.allowedLoss, 313_000);
  assert.equal(r.excessLoss, 87_000);
  assert.equal(r.limited, true);
});

test("married filing jointly gets exactly double the single/HOH/MFS threshold", () => {
  assert.equal(EBL_THRESHOLDS[2025].mfj, EBL_THRESHOLDS[2025].single * 2);
  assert.equal(EBL_THRESHOLDS[2026].mfj, EBL_THRESHOLDS[2026].single * 2);
});

test("2026 threshold is LOWER than 2025 -- the counterintuitive rebasing", () => {
  assert.ok(EBL_THRESHOLDS[2026].single < EBL_THRESHOLDS[2025].single);
  assert.ok(EBL_THRESHOLDS[2026].mfj < EBL_THRESHOLDS[2025].mfj);
  assert.equal(EBL_THRESHOLDS[2026].single, 256_000);
  assert.equal(EBL_THRESHOLDS[2026].mfj, 512_000);
});

test("the same net loss produces a smaller allowed amount in 2026 than 2025", () => {
  const loss2025 = excessBusinessLossOutcome({
    filingStatus: "single", taxYear: 2025, businessIncome: 0, businessDeductions: 300_000,
  });
  const loss2026 = excessBusinessLossOutcome({
    filingStatus: "single", taxYear: 2026, businessIncome: 0, businessDeductions: 300_000,
  });
  assert.equal(loss2025.allowedLoss, 300_000, "2025 threshold (313k) covers the full 300k loss");
  assert.equal(loss2026.allowedLoss, 256_000, "2026 threshold (256k) caps it lower");
  assert.equal(loss2026.excessLoss, 44_000);
});

test("2026 finding fires only when the loss actually exceeds the lower threshold", () => {
  const small = excessBusinessLossOutcome({
    filingStatus: "single", taxYear: 2026, businessIncome: 0, businessDeductions: 100_000,
  });
  const titles = small.findings.map((f) => f.title).join(" | ");
  assert.doesNotMatch(titles, /LOWER than 2025/, "no rebasing warning when the loss never approaches either threshold");

  const large = excessBusinessLossOutcome({
    filingStatus: "single", taxYear: 2026, businessIncome: 0, businessDeductions: 300_000,
  });
  const largeTitles = large.findings.map((f) => f.title).join(" | ");
  assert.match(largeTitles, /LOWER than 2025/);
});

test("business income offsets business deductions before computing the net loss", () => {
  const r = excessBusinessLossOutcome({
    filingStatus: "single", taxYear: 2025, businessIncome: 100_000, businessDeductions: 100_000,
  });
  assert.equal(r.netLoss, 0);
  assert.equal(r.allowedLoss, 0);
  assert.match(r.findings[0].title, /No net business loss/);
});

test("business income exceeding deductions never produces a negative loss", () => {
  const r = excessBusinessLossOutcome({
    filingStatus: "single", taxYear: 2025, businessIncome: 500_000, businessDeductions: 100_000,
  });
  assert.equal(r.netLoss, 0);
});

test("married filing jointly at the exact 2026 threshold is not limited", () => {
  const r = excessBusinessLossOutcome({
    filingStatus: "mfj", taxYear: 2026, businessIncome: 0, businessDeductions: 512_000,
  });
  assert.equal(r.threshold, 512_000);
  assert.equal(r.allowedLoss, 512_000);
  assert.equal(r.excessLoss, 0);
  assert.equal(r.limited, false);
});

test("negative or missing inputs are treated as zero, never negative", () => {
  const r = excessBusinessLossOutcome({ filingStatus: "single", businessIncome: -1000, businessDeductions: -500 });
  assert.equal(r.businessIncome, 0);
  assert.equal(r.businessDeductions, 0);
  assert.equal(r.netLoss, 0);
});

test("an unrecognized tax year falls back to the 2025 rules", () => {
  const r = excessBusinessLossOutcome({ filingStatus: "single", taxYear: 2099, businessIncome: 0, businessDeductions: 100_000 });
  assert.equal(r.threshold, 313_000);
});

test("findings always flag the trade-or-business-only scope and the QBI interaction", () => {
  const r = excessBusinessLossOutcome({ filingStatus: "single", taxYear: 2025, businessIncome: 0, businessDeductions: 100_000 });
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /Trade-or-business income and deductions only/);
  assert.match(titles, /QBI interaction not modeled/);
});

test("money() formats negative values with a leading minus and no double sign", () => {
  assert.equal(money(1234), "$1,234");
  assert.equal(money(-1234), "-$1,234");
  assert.equal(money(0), "$0");
});
