import test from "node:test";
import assert from "node:assert/strict";
import { calculate, compareQuotes, comparisonSummary, inputWarnings, largestCostDriver, negotiationLines, returnsFlip, returnsMinimumMask, returnsSensitivity, returnsSensitivitySummary, summary, volumeSensitivity } from "./calc.mjs";

test("custom return and restocking fees flow into the normalized quote", () => {
  const result = calculate({ orders: 100, unitsPerOrder: 1, returnsRate: 10, returnFee: 7, restockFee: 3 });
  assert.equal(result.quote.returns, 100);
});

test("normalizes the full monthly quote and minimum", () => {
  const result = calculate({ orders: 100, unitsPerOrder: 1.5, pallets: 1, minimumMonthly: 2000 });
  assert.equal(Math.round(result.quote.subtotal), 1419);
  assert.equal(result.quote.total, 2000);
  assert.equal(result.winner, "in-house");
  assert.deepEqual(result.components, ["receiving", "storage", "pickPack", "packaging", "shipping", "returns", "fixed"]);
});

test("break-even reflects the in-house comparison", () => {
  const result = calculate({ orders: 100, inHousePerOrder: 20, minimumMonthly: 0 });
  assert.equal(Math.round(result.breakEvenOrders), Math.round(result.quote.total / 20));
  assert.ok(result.delta > 0);
});

test("zero volume stays finite and does not apply a minimum", () => {
  const result = calculate({ orders: 0, inboundUnits: 0, pallets: 0, minimumMonthly: 0 });
  assert.equal(result.perOrder, 0);
  assert.equal(result.minimumApplied, false);
  assert.ok(Number.isFinite(result.breakEvenOrders));
});

test("compares two normalized quotes and creates a negotiation report", () => {
  const first = calculate({ orders: 100, shipping: 8 });
  const second = calculate({ orders: 100, shipping: 9 });
  const comparison = compareQuotes(first, second);
  assert.equal(comparison.cheaper, "first");
  assert.equal(comparison.totalDelta, second.quote.total - first.quote.total);
  assert.match(negotiationLines(first).join("\n"), /shipping: \$800\.00/);
  assert.match(negotiationLines(first).join("\n"), /Subtotal before minimum/);
});

test("does not pick a winner when normalized quote totals tie", () => {
  const first = calculate({ orders: 100, shipping: 10, minimumMonthly: 0 });
  const second = calculate({ orders: 100, shipping: 10, minimumMonthly: 0 });
  const comparison = compareQuotes(first, second);
  assert.equal(comparison.cheaper, "tie");
  assert.equal(comparison.totalDelta, 0);
  assert.equal(comparisonSummary(first, second, "Provider A", "Provider B"), "Provider A and Provider B have the same normalized monthly total.");
});

test("summary exposes every normalized line item and minimum warning", () => {
  const text = summary(calculate({ orders: 100, unitsPerOrder: 1.5, pallets: 1, minimumMonthly: 2000 }));
  assert.match(text, /Receiving:/);
  assert.match(text, /Shipping:/);
  assert.match(text, /Fixed fees:/);
  assert.match(text, /Minimum monthly charge applied: yes/);
  assert.match(text, /signed rate card/);
});

test("comparison identifies the cheaper quote at the same volume", () => {
  const first = calculate({ orders: 100, shipping: 8, fixedFee: 100 });
  const second = calculate({ orders: 100, shipping: 9, fixedFee: 100 });
  assert.match(comparisonSummary(first, second, "North", "South"), /North is lower by \$100\.00 per month/);
});

test("flags malformed and negative rate-card inputs", () => {
  const result = calculate({ orders: -10, shipping: "not-a-number", returnFee: -1, restockFee: "unknown" });
  assert.deepEqual(result.warnings, [
    "Orders / month cannot be negative; the negative value was treated as zero.",
    "Shipping / order was not a number and was ignored.",
    "Return handling / order cannot be negative; the negative value was treated as zero.",
    "Restocking / returned order was not a number and was ignored.",
  ]);
  assert.deepEqual(inputWarnings({}), []);
  assert.match(summary(result), /Input warnings/);
});

test("blank rate-card inputs disclose the fallback used", () => {
  const result = calculate({ orders: 100, shipping: "" }, false);
  assert.match(result.warnings.join("\n"), /Shipping \/ order was blank; the default 8\.5 was used/);
  assert.equal(result.quote.shipping, 850);
});

test("whitespace-only rate-card inputs use the disclosed default", () => {
  const result = calculate({ orders: 100, shipping: "   " }, false);
  assert.equal(result.quote.shipping, 850);
  assert.match(result.warnings.join("\n"), /Shipping \/ order was blank; the default 8\.5 was used/);
});

test("blank inbound units disclose the derived fallback", () => {
  const result = calculate({ orders: 120, unitsPerOrder: 2, inboundUnits: "" }, false);
  assert.equal(Math.round(result.quote.receiving * 100) / 100, 28.8);
  assert.deepEqual(result.warnings, ["Inbound units / month was blank; orders × units / order was used."]);
});

test("explicit zero rate-card inputs remain zero", () => {
  const result = calculate({ orders: 100, shipping: 0 }, false);
  assert.equal(result.quote.shipping, 0);
  assert.deepEqual(result.warnings, []);
});

test("shows how minimums and unit economics change with volume", () => {
  const rows = volumeSensitivity({ orders: 100, unitsPerOrder: 1.5, minimumMonthly: 2000 }, [50, 100, 500]);
  assert.deepEqual(rows.map((row) => row.orders), [50, 100, 500]);
  assert.equal(rows[0].minimumApplied, true);
  assert.equal(rows[1].minimumApplied, true);
  assert.equal(rows[2].minimumApplied, false);
  assert.ok(rows[2].perOrder < rows[0].perOrder);
});

test("volume sensitivity applies the same defaults as the main quote", () => {
  const rows = volumeSensitivity({ orders: 100, unitsPerOrder: "", receivingPerUnit: "" }, [100]);
  assert.equal(rows[0].total, calculate({ orders: 100 }).quote.total);
});

test("identifies the largest normalized cost driver for negotiation", () => {
  const result = calculate({ orders: 100, shipping: 12, fixedFee: 50 });
  const driver = largestCostDriver(result);
  assert.equal(driver.component, "shipping");
  assert.equal(driver.label, "Shipping");
  assert.equal(driver.amount, result.quote.shipping);
  assert.equal(driver.share, Math.round((result.quote.shipping / result.quote.subtotal) * 100));
  assert.match(summary(result), /Largest cost driver: Shipping/);
  assert.match(negotiationLines(result).join("\n"), /Largest normalized cost driver: Shipping/);
});

test("sweeps return rates and keeps other rate-card lines fixed", () => {
  const rows = returnsSensitivity({
    orders: 100,
    unitsPerOrder: 1,
    inboundUnits: 100,
    returnFee: 10,
    restockFee: 0,
    minimumMonthly: 0,
    inHousePerOrder: 16,
  }, [0, 8, 20]);
  assert.deepEqual(rows.map((row) => row.returnsRate), [0, 8, 20]);
  assert.equal(rows[0].returnsCost, 0);
  assert.equal(rows[1].returnsCost, 80);
  assert.equal(rows[2].returnsCost, 200);
  assert.equal(rows[2].total - rows[0].total, 200);
  assert.equal(rows[0].inHouse, rows[2].inHouse);
});

test("names the return rate where in-house overtakes a 3PL quote", () => {
  const rows = returnsSensitivity({
    orders: 100,
    unitsPerOrder: 1,
    inboundUnits: 100,
    shipping: 4,
    firstPick: 1,
    additionalPick: 0,
    packaging: 0,
    receivingPerUnit: 0,
    storagePerPallet: 0,
    pallets: 0,
    fixedFee: 0,
    returnFee: 12,
    restockFee: 0,
    minimumMonthly: 0,
    inHousePerOrder: 6,
  }, [0, 8, 20]);
  assert.equal(rows[0].winner, "3PL");
  assert.equal(rows[2].winner, "in-house");
  const flip = returnsFlip(rows);
  assert.equal(flip.kind, "flips");
  assert.equal(flip.rate, 20);
  assert.match(returnsSensitivitySummary({
    orders: 100,
    unitsPerOrder: 1,
    inboundUnits: 100,
    shipping: 4,
    firstPick: 1,
    additionalPick: 0,
    packaging: 0,
    receivingPerUnit: 0,
    storagePerPallet: 0,
    pallets: 0,
    fixedFee: 0,
    returnFee: 12,
    restockFee: 0,
    minimumMonthly: 0,
    inHousePerOrder: 6,
  }, [0, 8, 20]), /until 20% returns/);
});

test("says when a monthly minimum hides return-fee growth", () => {
  const rows = returnsSensitivity({
    orders: 100,
    unitsPerOrder: 1,
    inboundUnits: 100,
    shipping: 4,
    firstPick: 1,
    additionalPick: 0,
    packaging: 0,
    receivingPerUnit: 0,
    storagePerPallet: 0,
    pallets: 0,
    fixedFee: 100,
    returnFee: 10,
    restockFee: 0,
    minimumMonthly: 700,
    inHousePerOrder: 16,
  }, [0, 8, 30]);
  assert.equal(rows[0].minimumApplied, true);
  assert.equal(rows[1].minimumApplied, true);
  assert.equal(rows[0].total, rows[1].total);
  assert.equal(rows[2].minimumApplied, false);
  assert.ok(rows[2].total > rows[1].total);
  const mask = returnsMinimumMask(rows);
  assert.equal(mask.masked, true);
  assert.equal(mask.maskedThrough, 8);
  assert.equal(mask.unmaskedAt, 30);
  assert.match(returnsSensitivitySummary({
    orders: 100,
    unitsPerOrder: 1,
    inboundUnits: 100,
    shipping: 4,
    firstPick: 1,
    additionalPick: 0,
    packaging: 0,
    receivingPerUnit: 0,
    storagePerPallet: 0,
    pallets: 0,
    fixedFee: 100,
    returnFee: 10,
    restockFee: 0,
    minimumMonthly: 700,
    inHousePerOrder: 16,
  }, [0, 8, 30]), /hides return-fee growth through 8%/);
});

test("says when the quote already loses before return fees grow", () => {
  const rows = returnsSensitivity({ orders: 100, minimumMonthly: 2000, inHousePerOrder: 13 }, [0, 8]);
  assert.equal(returnsFlip(rows).kind, "already-in-house");
  assert.match(returnsSensitivitySummary({ orders: 100, minimumMonthly: 2000, inHousePerOrder: 13 }, [0, 8]), /already lower/);
});

test("default returns-page assumptions flip to in-house at 20% by $36", () => {
  const input = { orders: 100, returnFee: 8, restockFee: 4, shipping: 8.5, minimumMonthly: 0, inHousePerOrder: 16 };
  const rows = returnsSensitivity(input);
  const flip = returnsFlip(rows);
  assert.deepEqual(rows.map((row) => row.returnsRate), [0, 5, 8, 12, 15, 20]);
  assert.equal(rows[0].winner, "3PL");
  assert.equal(Math.round(rows[0].total), 1396);
  assert.equal(rows[5].winner, "in-house");
  assert.equal(Math.round(rows[5].total), 1636);
  assert.equal(flip.kind, "flips");
  assert.equal(flip.rate, 20);
  assert.equal(Math.round(flip.gap), -36);
  assert.match(returnsSensitivitySummary(input), /until 20% returns/);
  assert.match(returnsSensitivitySummary(input), /\$36\.00 per month/);
});

test("ignores negative or non-numeric return-rate sweep values", () => {
  const rows = returnsSensitivity({ orders: 100 }, [-5, "n/a", 8, 8]);
  assert.deepEqual(rows.map((row) => row.returnsRate), [0, 8]);
});

test("uses the first component when the quote is tied or empty", () => {
  const result = calculate({ orders: 0, unitsPerOrder: 0, pallets: 0, inboundUnits: 0, fixedFee: 0 });
  const driver = largestCostDriver(result);
  assert.equal(driver.component, "receiving");
  assert.equal(driver.amount, 0);
  assert.equal(driver.share, 0);
});
