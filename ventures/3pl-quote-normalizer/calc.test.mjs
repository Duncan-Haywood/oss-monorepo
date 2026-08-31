import test from "node:test";
import assert from "node:assert/strict";
import { agedStorageFlip, agedStorageSummary, agedStorageSweep, calculate, compareAgedStorage, compareInboundMethods, compareKitting, compareQuotes, compareReturnDisposition, comparisonSummary, costDrivers, inboundComparisonSummary, inboundReceivingPerUnit, inputWarnings, kittingAovSweep, kittingFeeSweep, kittingFlip, kittingSummary, largestCostDriver, negotiationLines, returnDispositionFlip, returnDispositionRestockableSweep, returnDispositionSummary, returnDispositionUnitCostSweep, returnsFlip, returnsMinimumMask, returnsSensitivity, returnsSensitivitySummary, summary, volumeSensitivity } from "./calc.mjs";

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

test("minimum orders estimates the volume where line items alone clear the minimum", () => {
  const result = calculate({ orders: 100, unitsPerOrder: 1.5, pallets: 1, minimumMonthly: 2000 });
  assert.ok(result.minimumOrders > 0);
  const atThatVolume = Math.ceil(result.minimumOrders);
  const atMinimumOrders = calculate({
    orders: atThatVolume,
    unitsPerOrder: 1.5,
    pallets: 1,
    minimumMonthly: 2000,
    inboundUnits: atThatVolume * 1.5,
  });
  assert.ok(atMinimumOrders.quote.subtotal >= 2000 - 1);
});

test("minimum orders is zero when no minimum monthly spend is set", () => {
  const result = calculate({ orders: 100, minimumMonthly: 0 });
  assert.equal(result.minimumOrders, 0);
});

test("negotiation lines and summary name the minimum-clearing volume only when a minimum applies", () => {
  const withMinimum = calculate({ orders: 100, unitsPerOrder: 1.5, pallets: 1, minimumMonthly: 2000 });
  assert.ok(negotiationLines(withMinimum).some((line) => line.includes("clear the minimum")));
  assert.ok(summary(withMinimum).includes("clear the minimum"));
  const noMinimum = calculate({ orders: 100, minimumMonthly: 0 });
  assert.ok(!negotiationLines(noMinimum).some((line) => line.includes("clear the minimum")));
  assert.ok(!summary(noMinimum).includes("clear the minimum"));
});

test("break-even reflects the in-house comparison", () => {
  const result = calculate({ orders: 100, inHousePerOrder: 20, minimumMonthly: 0 });
  const atBreakEven = calculate({ orders: result.breakEvenOrders, inHousePerOrder: 20, minimumMonthly: 0 });
  const justBelow = calculate({ orders: Math.max(0, result.breakEvenOrders - 1), inHousePerOrder: 20, minimumMonthly: 0 });
  assert.ok(atBreakEven.delta >= 0);
  assert.ok(justBelow.delta < 0);
  assert.ok(result.delta > 0);
});

test("reports no break-even when 3PL variable cost always exceeds in-house", () => {
  const result = calculate({ orders: 100, shipping: 20, inHousePerOrder: 10 });
  assert.equal(result.breakEvenOrders, 0);
  assert.equal(result.breakEvenFound, false);
});

test("a high monthly minimum is priced into the searched break-even volume", () => {
  const result = calculate({ orders: 100, inHousePerOrder: 20, minimumMonthly: 2500, inboundUnits: 150 });
  assert.equal(result.breakEvenFound, true);
  const atBreakEven = calculate({
    orders: result.breakEvenOrders,
    inHousePerOrder: 20,
    minimumMonthly: 2500,
    inboundUnits: result.breakEvenOrders * 1.5,
  }, false);
  const justBelow = calculate({
    orders: Math.max(0, result.breakEvenOrders - 1),
    inHousePerOrder: 20,
    minimumMonthly: 2500,
    inboundUnits: Math.max(0, result.breakEvenOrders - 1) * 1.5,
  }, false);
  assert.ok(atBreakEven.delta >= 0);
  if (result.breakEvenOrders > 0) assert.ok(justBelow.delta < 0);
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
  assert.match(negotiationLines(first).join("\n"), /Shipping: \$800\.00/);
  assert.match(negotiationLines(first).join("\n"), /Subtotal before minimum/);
});

test("negotiation report uses buyer-facing line item labels", () => {
  const lines = negotiationLines(calculate({ orders: 100, shipping: 8 }));
  assert.match(lines.join("\n"), /Shipping: \$800\.00/);
  assert.doesNotMatch(lines.join("\n"), /shipping:/);
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

test("ranks cost drivers and estimates savings from a typed reduction", () => {
  const drivers = costDrivers(calculate({ orders: 100, shipping: 8, fixedFee: 100 }), 10);
  assert.equal(drivers[0].component, "shipping");
  assert.equal(drivers[0].savings, 80);
  assert.equal(drivers[0].revised, 720);
  assert.equal(drivers.at(-1).component, "storage");
  const clamped = costDrivers(calculate({ orders: 100 }), -5);
  assert.equal(clamped[0].savings, 0);
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

const agedPage = {
  orders: 100,
  pallets: 4,
  leftoverPallets: 2,
  storagePerPallet: 18,
  longTermStoragePerPallet: 54,
  liquidationPerPallet: 80,
  inHousePerOrder: 15.5,
};

test("aged storage prices leftover at the long-term rate and names the flip", () => {
  const comparison = compareAgedStorage(agedPage);
  assert.equal(comparison.asWritten.storageCost, 72);
  assert.equal(comparison.aged.storageCost, 144);
  assert.equal(comparison.liquidate.storageCost, 36);
  assert.equal(comparison.monthlySurcharge, 72);
  assert.equal(comparison.liquidationRecovery, 160);
  assert.equal(Math.round(comparison.asWritten.result.quote.total * 10), 14732);
  assert.equal(Math.round(comparison.aged.result.quote.total * 10), 15452);
  assert.equal(comparison.asWritten.result.winner, "3PL");
  assert.equal(comparison.aged.result.winner, "3PL");
  assert.equal(comparison.cheapestPath, "liquidate");
  assert.equal(Math.round(comparison.monthsUntilSurchargeEatsRecovery * 100), 148);
});

test("aged storage sweep flips to in-house at three leftover pallets", () => {
  const sweep = agedStorageSweep(agedPage);
  const flip = agedStorageFlip(sweep);
  assert.deepEqual(sweep.map((row) => row.leftoverPallets), [0, 1, 2, 3, 4]);
  assert.equal(sweep[0].winner, "3PL");
  assert.equal(sweep[2].winner, "3PL");
  assert.equal(sweep[3].winner, "in-house");
  assert.equal(flip.kind, "flips");
  assert.equal(flip.leftoverPallets, 3);
  assert.equal(Math.round(flip.gap), -31);
  assert.match(agedStorageSummary(agedPage), /until 3 leftover pallets/);
  assert.match(agedStorageSummary(agedPage), /\$72\.00 of that is the storage surcharge/);
  assert.match(agedStorageSummary(agedPage), /1\.5 months/);
});

test("blank long-term storage doubles the fresh rate", () => {
  const comparison = compareAgedStorage({ pallets: 2, leftoverPallets: 1, storagePerPallet: 20, longTermStoragePerPallet: "" });
  assert.equal(comparison.longTermRate, 40);
  assert.equal(comparison.aged.storageCost, 60);
});

test("leftover pallets cannot exceed stored pallets", () => {
  const comparison = compareAgedStorage({ pallets: 2, leftoverPallets: 9, storagePerPallet: 10, longTermStoragePerPallet: 30 });
  assert.equal(comparison.leftoverPallets, 2);
  assert.equal(comparison.turningPallets, 0);
  assert.equal(comparison.aged.storageCost, 60);
  assert.equal(comparison.liquidate.storageCost, 0);
});

test("zero leftover matches the quote as written", () => {
  const comparison = compareAgedStorage({ pallets: 4, leftoverPallets: 0, storagePerPallet: 18, longTermStoragePerPallet: 54 });
  assert.equal(comparison.monthlySurcharge, 0);
  assert.equal(comparison.aged.result.quote.total, comparison.asWritten.result.quote.total);
  assert.equal(comparison.cheapestPath, "tie");
  assert.match(agedStorageSummary({ pallets: 4, leftoverPallets: 0 }), /No leftover pallets/);
});

const dispositionPage = {
  orders: 100,
  returnsRate: 12,
  returnFee: 3.5,
  restockFee: 4,
  destroyFee: 1.5,
  returnLabelCost: 8,
  unitCost: 18,
  restockableRate: 70,
  storageUntilResale: 0.4,
  keepOffer: 0,
};

test("return disposition prices restock, destroy, and customer-keeps", () => {
  const comparison = compareReturnDisposition(dispositionPage);
  assert.equal(comparison.returnedOrders, 12);
  assert.equal(comparison.restockFees, 15.9);
  assert.equal(comparison.destroyFees, 13);
  assert.equal(comparison.restock.perReturn, 21.75);
  assert.equal(comparison.destroy.perReturn, 31);
  assert.equal(comparison.keep.perReturn, 18);
  assert.equal(comparison.restock.monthly, 261);
  assert.equal(comparison.keep.monthly, 216);
  assert.equal(comparison.cheapestPath, "keep");
  assert.equal(comparison.restock.inventoryLost, 5.4);
  assert.equal(comparison.restock.destroyLeftover, 0.45);
  assert.equal(comparison.restockBeatsKeepAt, 23.36);
});

test("return disposition restocks once unit cost clears the keep threshold", () => {
  const comparison = compareReturnDisposition({ ...dispositionPage, unitCost: 45 });
  assert.equal(comparison.restock.perReturn, 29.85);
  assert.equal(comparison.keep.perReturn, 45);
  assert.equal(comparison.cheapestPath, "restock");
  assert.equal(comparison.vsKeep.restock, 15.15);
  assert.match(returnDispositionSummary({ ...dispositionPage, unitCost: 45 }), /cheaper by \$15\.15 per return versus letting the customer keep/);
});

test("return disposition restockable sweep flips from keep to restock", () => {
  const sweep = returnDispositionRestockableSweep(dispositionPage);
  const flip = returnDispositionFlip(sweep, "restockableRate");
  assert.deepEqual(sweep.map((row) => row.restockableRate), [40, 50, 60, 70, 80, 90, 100]);
  assert.equal(sweep[0].cheapestPath, "keep");
  assert.equal(sweep[3].cheapestPath, "keep");
  assert.equal(sweep[4].cheapestPath, "keep");
  assert.equal(sweep[5].cheapestPath, "restock");
  assert.equal(flip.kind, "flips");
  assert.equal(flip.from, "keep");
  assert.equal(flip.to, "restock");
  assert.equal(flip.at, 90);
});

test("return disposition unit-cost sweep flips from keep to restock at $24", () => {
  const sweep = returnDispositionUnitCostSweep(dispositionPage);
  const flip = returnDispositionFlip(sweep, "unitCost");
  assert.equal(sweep.find((row) => row.unitCost === 18).cheapestPath, "keep");
  assert.equal(sweep.find((row) => row.unitCost === 24).cheapestPath, "restock");
  assert.equal(flip.kind, "flips");
  assert.equal(flip.to, "restock");
  assert.equal(flip.at, 24);
  assert.match(returnDispositionSummary(dispositionPage), /cheaper by \$3\.75 per return versus restock/);
  assert.match(returnDispositionSummary(dispositionPage), /once unit cost reaches \$23\.36/);
});

test("blank restockable rate defaults to 70 and cannot exceed 100", () => {
  const blank = compareReturnDisposition({ ...dispositionPage, restockableRate: "" });
  assert.equal(blank.restockableRate, 70);
  const capped = compareReturnDisposition({ ...dispositionPage, restockableRate: 140 });
  assert.equal(capped.restockableRate, 100);
  assert.equal(capped.restock.inventoryLost, 0);
  assert.equal(capped.cheapestPath, "restock");
});

test("zero restockable never recovers inventory so customer-keeps wins", () => {
  const comparison = compareReturnDisposition({ ...dispositionPage, restockableRate: 0, unitCost: 45 });
  assert.equal(comparison.restockBeatsKeepAt, null);
  assert.equal(comparison.restock.perReturn, 62.4);
  assert.equal(comparison.destroy.perReturn, 58);
  assert.equal(comparison.keep.perReturn, 45);
  assert.equal(comparison.cheapestPath, "keep");
  assert.match(returnDispositionSummary({ ...dispositionPage, restockableRate: 0 }), /At 0% restockable/);
});

test("a keep-the-item thank-you still beats bringing a cheap SKU back", () => {
  const cheapSku = compareReturnDisposition({ ...dispositionPage, unitCost: 12, keepOffer: 5 });
  assert.equal(cheapSku.keep.perReturn, 17);
  assert.equal(cheapSku.restock.perReturn, 19.95);
  assert.equal(cheapSku.cheapestPath, "keep");
  const expensive = compareReturnDisposition({ ...dispositionPage, unitCost: 45, keepOffer: 5 });
  assert.equal(expensive.keep.perReturn, 50);
  assert.equal(expensive.restock.perReturn, 29.85);
  assert.equal(expensive.cheapestPath, "restock");
});

const kittingPage = {
  orders: 400,
  kitAttachRate: 100,
  aovLift: 6,
  extraCogs: 2.8,
  kitFee: 3.5,
  extraPicks: 1,
  extraReceiving: 0.36,
  inHouseKitLabor: 0.9,
};

test("kitting prices 3PL assembly, pre-kit, and skipping the bundle", () => {
  const comparison = compareKitting(kittingPage);
  assert.equal(comparison.kittedOrders, 400);
  assert.equal(comparison.threePlFees, 4.86);
  assert.equal(comparison.threePl.perOrder, -1.66);
  assert.equal(comparison.prekit.perOrder, 2.3);
  assert.equal(comparison.skip.perOrder, 0);
  assert.equal(comparison.threePl.monthly, -664);
  assert.equal(comparison.prekit.monthly, 920);
  assert.equal(comparison.bestPath, "prekit");
  assert.equal(comparison.bestIfAlreadyInbound, "skip");
  assert.equal(comparison.threePlBeatsSkipAtKitFee, 1.84);
  assert.equal(comparison.threePlBeatsSkipAtAovLift, 7.66);
  assert.equal(comparison.prekitBeatsSkipAtAovLift, 3.7);
});

test("kitting at a cheap 3PL fee still loses to pre-kit but beats skip", () => {
  const comparison = compareKitting({ ...kittingPage, kitFee: 0.75 });
  assert.equal(comparison.threePlFees, 2.11);
  assert.equal(comparison.threePl.perOrder, 1.09);
  assert.equal(comparison.bestPath, "prekit");
  assert.equal(comparison.bestIfAlreadyInbound, "threePl");
  assert.match(kittingSummary({ ...kittingPage, kitFee: 0.75 }), /Kitting before inbound keeps \$2\.30 per kit/);
});

test("kitting kit-fee sweep flips the on-floor winner from 3PL to skip", () => {
  const sweep = kittingFeeSweep(kittingPage);
  const flip = kittingFlip(sweep, "kitFee", "bestIfAlreadyInbound");
  assert.deepEqual(sweep.map((row) => row.kitFee), [0.75, 1.25, 1.84, 2.5, 3.5, 5, 7]);
  assert.equal(sweep[0].bestIfAlreadyInbound, "threePl");
  assert.equal(sweep[2].bestIfAlreadyInbound, "tie");
  assert.equal(sweep[3].bestIfAlreadyInbound, "skip");
  assert.equal(sweep[0].bestPath, "prekit");
  assert.equal(flip.kind, "flips");
  assert.equal(flip.from, "threePl");
  assert.equal(flip.to, "skip");
  assert.equal(flip.at, 2.5);
});

test("kitting AOV sweep flips the on-floor winner from skip to 3PL", () => {
  const sweep = kittingAovSweep(kittingPage);
  const flip = kittingFlip(sweep, "aovLift", "bestIfAlreadyInbound");
  assert.equal(sweep.find((row) => row.aovLift === 6).bestIfAlreadyInbound, "skip");
  assert.equal(sweep.find((row) => row.aovLift === 7.66).bestIfAlreadyInbound, "tie");
  assert.equal(sweep.find((row) => row.aovLift === 8).bestIfAlreadyInbound, "threePl");
  assert.equal(flip.kind, "flips");
  assert.equal(flip.from, "skip");
  assert.equal(flip.to, "threePl");
  assert.equal(flip.at, 8);
  assert.match(kittingSummary(kittingPage), /skip the kit/);
  assert.match(kittingSummary(kittingPage), /\$1\.84 kit fee/);
});

test("blank kitting inputs use the page defaults and attach cannot exceed 100", () => {
  const blank = compareKitting({ orders: 400, kitAttachRate: "", aovLift: "", kitFee: "" });
  assert.equal(blank.kitAttachRate, 100);
  assert.equal(blank.aovLift, 6);
  assert.equal(blank.kitFee, 3.5);
  assert.equal(blank.threePl.perOrder, -1.66);
  const capped = compareKitting({ ...kittingPage, kitAttachRate: 140 });
  assert.equal(capped.kitAttachRate, 100);
  assert.equal(capped.kittedOrders, 400);
});

test("half the book on kits halves the monthly without changing per-kit math", () => {
  const comparison = compareKitting({ ...kittingPage, kitAttachRate: 50 });
  assert.equal(comparison.kittedOrders, 200);
  assert.equal(comparison.threePl.perOrder, -1.66);
  assert.equal(comparison.threePl.monthly, -332);
  assert.equal(comparison.prekit.monthly, 460);
  assert.equal(comparison.bestPath, "prekit");
});

test("expensive in-house labor can make skipping the kit the overall winner", () => {
  const comparison = compareKitting({ ...kittingPage, inHouseKitLabor: 3.5 });
  assert.equal(comparison.prekit.perOrder, -0.3);
  assert.equal(comparison.threePl.perOrder, -1.66);
  assert.equal(comparison.bestPath, "skip");
  assert.equal(comparison.bestIfAlreadyInbound, "skip");
  assert.match(kittingSummary({ ...kittingPage, inHouseKitLabor: 3.5 }), /Skipping the kit keeps more/);
});

test("uses the first component when the quote is tied or empty", () => {
  const result = calculate({ orders: 0, unitsPerOrder: 0, pallets: 0, inboundUnits: 0, fixedFee: 0 });
  const driver = largestCostDriver(result);
  assert.equal(driver.component, "receiving");
  assert.equal(driver.amount, 0);
  assert.equal(driver.share, 0);
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
