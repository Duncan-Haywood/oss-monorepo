import test from "node:test";
import assert from "node:assert/strict";

import { reconcileRow, reconcileAll, toCsv, sampleRows, LARGE_NON_INCOME_SHARE } from "./calc.mjs";

test("reconcileRow backs out refunds and marketplace-remitted sales tax before costs", () => {
  const r = reconcileRow({ platform: "Etsy", box1a: "1000", refunds: "100", salesTax: "50", fees: "80", cogs: "300", shipping: "40" });
  assert.equal(r.nonIncomeAdjustments, 150);
  assert.equal(r.adjustedGrossReceipts, 850);
  assert.equal(r.totalExpenses, 420);
  assert.equal(r.estimatedNetProfit, 430);
});

test("blank/missing fields are treated as zero, not skipped", () => {
  const r = reconcileRow({ platform: "eBay", box1a: "500" });
  assert.equal(r.refunds, 0);
  assert.equal(r.adjustedGrossReceipts, 500);
  assert.equal(r.estimatedNetProfit, 500);
});

test("a platform name is required text; a blank one gets a placeholder rather than an empty label", () => {
  assert.equal(reconcileRow({ box1a: "10" }).platform, "Untitled platform");
  assert.equal(reconcileRow({ platform: "  Depop  ", box1a: "10" }).platform, "Depop");
});

test("negative or non-numeric input is floored at zero, never negative", () => {
  const r = reconcileRow({ platform: "Mercari", box1a: "-500", refunds: "abc", salesTax: null });
  assert.equal(r.box1a, 0);
  assert.equal(r.refunds, 0);
  assert.equal(r.adjustedGrossReceipts, 0);
});

test("adjustments exceeding Box 1a floors the reconciled total at zero and raises a high-severity finding", () => {
  const r = reconcileRow({ platform: "Whatnot", box1a: "100", refunds: "80", salesTax: "50" });
  assert.equal(r.rawAdjustedGrossReceipts, -30);
  assert.equal(r.adjustedGrossReceipts, 0, "floored at zero even though the raw figure is negative");
  const finding = r.findings.find((f) => f.id === "adjustments-exceed-box1a");
  assert.ok(finding, "expected an adjustments-exceed-box1a finding");
  assert.equal(finding.severity, "high");
});

test("a large non-income share (over the disclosed threshold) is flagged but does not exceed Box 1a", () => {
  const share = LARGE_NON_INCOME_SHARE + 0.05;
  const box1a = 1000;
  const refunds = Math.round(box1a * share);
  const r = reconcileRow({ platform: "StockX", box1a: String(box1a), refunds: String(refunds) });
  assert.ok(r.rawAdjustedGrossReceipts > 0);
  const finding = r.findings.find((f) => f.id === "large-non-income-share");
  assert.ok(finding, "expected a large-non-income-share finding");
  assert.equal(finding.severity, "medium");
});

test("a non-income share right at or below the threshold does not fire the large-share finding", () => {
  const r = reconcileRow({ platform: "Reverb", box1a: "1000", refunds: String(LARGE_NON_INCOME_SHARE * 1000) });
  assert.ok(!r.findings.some((f) => f.id === "large-non-income-share"));
});

test("a platform whose costs exceed its adjusted receipts is flagged as an estimated loss, info severity", () => {
  const r = reconcileRow({ platform: "Depop", box1a: "500", cogs: "700" });
  assert.ok(r.estimatedNetProfit < 0);
  const finding = r.findings.find((f) => f.id === "platform-loss");
  assert.ok(finding);
  assert.equal(finding.severity, "info");
});

test("an all-zero row (Box 1a not entered yet) raises no loss finding", () => {
  const r = reconcileRow({ platform: "Placeholder" });
  assert.ok(!r.findings.some((f) => f.id === "platform-loss"));
});

test("reconcileAll totals every row and reports an empty-worksheet finding when there are none", () => {
  const result = reconcileAll([]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.totals.box1a, 0);
  assert.ok(result.findings.some((f) => f.id === "no-rows"));
});

test("reconcileAll sums Box 1a, adjustments, and estimated net profit across platforms", () => {
  const result = reconcileAll(sampleRows());
  assert.equal(result.rows.length, 2);
  // Etsy: 9200 - 180 - 410 = 8610 adjusted; costs 540+3100+620=4260; net 4350
  // Poshmark: 5400 - 0 - 0 = 5400 adjusted; costs 1080+2200+0=3280; net 2120
  assert.equal(result.totals.box1a, 14600);
  assert.equal(result.totals.nonIncomeAdjustments, 590);
  assert.equal(result.totals.adjustedGrossReceipts, 14010);
  assert.equal(result.totals.estimatedNetProfit, 6470);
});

test("reconcileAll always raises the not-a-filing disclosure on any non-empty worksheet", () => {
  const single = reconcileAll([{ platform: "Etsy", box1a: "100" }]);
  assert.ok(single.findings.some((f) => f.id === "not-a-filing"));
});

test("reconcileAll only raises the multi-platform summary once two or more rows exist", () => {
  assert.ok(!reconcileAll([{ platform: "Etsy", box1a: "100" }]).findings.some((f) => f.id === "multi-platform-summary"));
  assert.ok(reconcileAll(sampleRows()).findings.some((f) => f.id === "multi-platform-summary"));
});

test("reconcileAll flattens every row's own findings into the worksheet-level list", () => {
  const result = reconcileAll([
    { platform: "A", box1a: "100", refunds: "90", salesTax: "20" }, // adjustments-exceed-box1a
    { platform: "B", box1a: "100", cogs: "200" }, // platform-loss
  ]);
  assert.ok(result.findings.some((f) => f.id === "adjustments-exceed-box1a"));
  assert.ok(result.findings.some((f) => f.id === "platform-loss"));
});

test("toCsv emits one line per row plus headers, and a TOTAL line only when there is more than one row", () => {
  const single = toCsv(reconcileAll([{ platform: "Etsy", box1a: "100" }]));
  assert.equal(single.trim().split("\n").length, 2, "header + one row, no TOTAL line for a single platform");
  assert.ok(!single.includes("TOTAL"));

  const multi = toCsv(reconcileAll(sampleRows()));
  const lines = multi.trim().split("\n");
  assert.equal(lines.length, 4, "header + 2 rows + TOTAL");
  assert.ok(lines[3].startsWith("TOTAL,"));
});

test("toCsv quotes a platform name containing a comma", () => {
  const csv = toCsv(reconcileAll([{ platform: 'Sales, LLC', box1a: "10" }]));
  assert.ok(csv.includes('"Sales, LLC"'));
});

test("sampleRows produces a worksheet with no adjustments-exceed-box1a finding, so the example always reads clean", () => {
  const result = reconcileAll(sampleRows());
  assert.ok(!result.findings.some((f) => f.id === "adjustments-exceed-box1a"));
});
