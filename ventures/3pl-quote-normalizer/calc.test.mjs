import test from "node:test";
import assert from "node:assert/strict";
import { calculate, compareInboundMethods, compareQuotes, comparisonSummary, inboundComparisonSummary, inboundReceivingPerUnit, inputWarnings, largestCostDriver, negotiationLines, summary, volumeSensitivity } from "./calc.mjs";

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

test("converts pallet and carton inbound fees into a per-unit receiving rate", () => {
  const pallet = inboundReceivingPerUnit("pallet", { inboundUnits: 480, palletInboundFee: 10, unitsPerPallet: 60 });
  assert.equal(pallet.inboundCount, 8);
  assert.equal(pallet.receivingPerUnit, 10 / 60);
  const carton = inboundReceivingPerUnit("carton", { inboundUnits: 480, cartonInboundFee: 1.5, unitsPerCarton: 6 });
  assert.equal(carton.inboundCount, 80);
  assert.equal(carton.receivingPerUnit, 0.25);
  const unit = inboundReceivingPerUnit("unit", { inboundUnits: 480, receivingPerUnit: 0.4 });
  assert.equal(unit.inboundCount, 480);
  assert.equal(unit.receivingPerUnit, 0.4);
});

test("rejects an unknown inbound method", () => {
  assert.throws(() => inboundReceivingPerUnit("airfreight", {}), /Unknown inbound method/);
});

test("a zero container size cannot be turned into a receiving rate", () => {
  const pallet = inboundReceivingPerUnit("pallet", { inboundUnits: 480, unitsPerPallet: 0, palletInboundFee: 10 });
  assert.equal(pallet.receivingPerUnit, Infinity);
  assert.equal(pallet.inboundCount, Infinity);
});

test("compares pallet, carton, and loose inbound on the same quote", () => {
  const comparison = compareInboundMethods({
    orders: 100,
    inboundUnits: 480,
    palletInboundFee: 10,
    unitsPerPallet: 60,
    cartonInboundFee: 1.5,
    unitsPerCarton: 6,
    receivingPerUnit: 0.4,
    minimumMonthly: 0,
  });
  assert.deepEqual(comparison.rows.map((row) => row.id), ["pallet", "carton", "unit"]);
  assert.equal(comparison.rows[0].receiving, 80);
  assert.equal(comparison.rows[1].receiving, 120);
  assert.equal(comparison.rows[2].receiving, 192);
  assert.equal(comparison.cheapestId, "pallet");
  assert.equal(comparison.monthlySpread, 112);
  assert.match(inboundComparisonSummary(comparison), /Pallet inbound is lower by \$112\.00 per month/);
  assert.ok(comparison.rows[0].total < comparison.rows[2].total);
});

test("inbound comparison leaves storage and pick fees unchanged", () => {
  const input = {
    orders: 100,
    inboundUnits: 480,
    palletInboundFee: 10,
    unitsPerPallet: 60,
    cartonInboundFee: 1.5,
    unitsPerCarton: 6,
    receivingPerUnit: 0.4,
    storagePerPallet: 18,
    firstPick: 2.75,
    minimumMonthly: 0,
  };
  const comparison = compareInboundMethods(input);
  const pallet = calculate({ ...input, receivingPerUnit: 10 / 60 }, false);
  const loose = calculate({ ...input, receivingPerUnit: 0.4 }, false);
  assert.equal(comparison.rows[0].total, pallet.quote.total);
  assert.equal(comparison.rows[2].total, loose.quote.total);
  assert.equal(pallet.quote.storage, loose.quote.storage);
  assert.equal(pallet.quote.pickPack, loose.quote.pickPack);
});

test("a monthly minimum can hide a real inbound difference", () => {
  const comparison = compareInboundMethods({
    inboundUnits: 480,
    palletInboundFee: 10,
    unitsPerPallet: 60,
    cartonInboundFee: 1.5,
    unitsPerCarton: 6,
    receivingPerUnit: 0.4,
    minimumMonthly: 5000,
  });
  assert.equal(comparison.receivingSpread, 112);
  assert.equal(comparison.monthlySpread, 0);
  assert.match(inboundComparisonSummary(comparison), /monthly minimum keeps the normalized totals the same/);
});

test("inbound comparison reports a tie when every method costs the same", () => {
  const comparison = compareInboundMethods({
    inboundUnits: 120,
    palletInboundFee: 12,
    unitsPerPallet: 40,
    cartonInboundFee: 3,
    unitsPerCarton: 10,
    receivingPerUnit: 0.3,
    minimumMonthly: 0,
  });
  assert.equal(comparison.cheapestId, null);
  assert.deepEqual(comparison.cheapestIds, ["pallet", "carton", "unit"]);
  assert.equal(comparison.monthlySpread, 0);
  assert.match(inboundComparisonSummary(comparison), /same normalized monthly total/);
});

test("uses the first component when the quote is tied or empty", () => {
  const result = calculate({ orders: 0, unitsPerOrder: 0, pallets: 0, inboundUnits: 0, fixedFee: 0 });
  const driver = largestCostDriver(result);
  assert.equal(driver.component, "receiving");
  assert.equal(driver.amount, 0);
  assert.equal(driver.share, 0);
});
