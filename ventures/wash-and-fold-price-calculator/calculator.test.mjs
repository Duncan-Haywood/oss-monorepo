import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWashAndFold, costOfOrder, SEVERITY } from "./calculator.mjs";

/** A counter-service (no delivery) shop with round numbers, so the arithmetic
 *  in each assertion below can be checked by hand. */
const counter = {
  pricePerPound: 2,
  minimumCharge: 20,
  minimumOrderPounds: 10,
  avgOrderPounds: 20,
  laborMinutesPerPound: 1,
  fixedMinutesPerOrder: 10,
  wagePerHour: 18,
  payrollLoadPct: 0,
  poundsPerWasherLoad: 20,
  washCostPerLoad: 2,
  poundsPerDryerLoad: 20,
  dryCostPerLoad: 1.5,
  suppliesCostPerPound: 0.05,
  deliveryStopsPerOrder: 0,
  driveMinutesPerStop: 0,
  milesPerStop: 0,
  vehicleCostPerMile: 0,
  monthlyOverhead: 2000,
  monthlyPounds: 8000,
  targetMarginPct: 35,
  monthlyProfitGoal: 3000,
};

const ids = (result) => result.findings.map((f) => f.id);

test("costs one order from labour minutes, machine cycles, supplies and overhead", () => {
  const r = computeWashAndFold(counter);
  // 30 labour minutes at $0.30/min = $9.00; one wash + one dry = $3.50;
  // supplies 20 lb x $0.05 = $1.00; overhead $2000/8000 lb x 20 lb = $5.00.
  assert.equal(r.order.labor, 9);
  assert.equal(r.order.machine, 3.5);
  assert.equal(r.order.supplies, 1);
  assert.equal(r.order.overhead, 5);
  assert.equal(r.order.total, 18.5);
  assert.equal(r.costPerPound, 0.925);
});

test("a payroll load raises only the labour component", () => {
  const base = computeWashAndFold(counter);
  const loaded = computeWashAndFold({ ...counter, payrollLoadPct: 20 });
  assert.equal(loaded.order.labor, 10.8); // $9.00 x 1.2
  assert.equal(loaded.order.machine, base.order.machine);
  assert.equal(loaded.order.total, 20.3);
});

test("machine cost steps up a whole cycle when an order spills past a machine", () => {
  const spill = computeWashAndFold({ ...counter, avgOrderPounds: 21 });
  assert.equal(spill.order.washLoads, 2);
  assert.equal(spill.order.dryLoads, 2);
  assert.equal(spill.order.machine, 7); // two washes + two dries, not 1.05x one
  assert.ok(
    spill.costPerPound > computeWashAndFold(counter).costPerPound,
    "one extra pound crossing a machine boundary must raise cost per pound",
  );
});

test("profit, margin and break-even follow from the order cost", () => {
  const r = computeWashAndFold(counter);
  assert.equal(r.revenuePerOrder, 40); // 20 lb x $2.00, above the $20 minimum
  assert.equal(r.minimumApplied, false);
  assert.equal(r.profitPerOrder, 21.5);
  assert.equal(r.marginPct, 53.8);
  assert.equal(r.breakEvenPricePerPound, 0.925);
});

test("the minimum charge applies when the weighed price falls below it", () => {
  const small = computeWashAndFold({ ...counter, avgOrderPounds: 8, minimumCharge: 25 });
  assert.equal(small.minimumApplied, true);
  assert.equal(small.revenuePerOrder, 25); // not 8 lb x $2.00 = $16
});

test("the target price hits the requested margin exactly", () => {
  const r = computeWashAndFold(counter);
  // cost 0.925 / (1 - 0.35) = 1.4231
  assert.equal(r.targetPricePerPound, 1.4231);
  const atTarget = r.targetPricePerPound * counter.avgOrderPounds;
  assert.ok(Math.abs((atTarget - r.order.total) / atTarget - 0.35) < 0.001);
});

test("a monthly profit goal converts into pounds and orders", () => {
  const r = computeWashAndFold(counter);
  assert.equal(r.profitPerPound, 1.075);
  assert.equal(r.monthlyProfitAtVolume, 8600); // 8000 lb at $1.075
  assert.equal(r.poundsForGoal, Math.ceil(3000 / 1.075));
  assert.equal(r.ordersForGoal, Math.ceil(Math.ceil(3000 / 1.075) / 20));
});

test("no goal and no volume leaves those outputs null rather than zero", () => {
  const r = computeWashAndFold({ ...counter, monthlyProfitGoal: 0, monthlyPounds: 0 });
  assert.equal(r.poundsForGoal, null);
  assert.equal(r.monthlyProfitAtVolume, null);
  assert.equal(r.order.overhead, 0, "overhead cannot be allocated without a volume");
});

test("delivery stops add drive time and vehicle cost per order, not per pound", () => {
  const delivered = computeWashAndFold({
    ...counter,
    deliveryStopsPerOrder: 2,
    driveMinutesPerStop: 6,
    milesPerStop: 4,
    vehicleCostPerMile: 0.7,
  });
  // 2 stops x (6 min x $0.30 + 4 mi x $0.70) = 2 x $4.60 = $9.20
  assert.equal(delivered.order.delivery, 9.2);
  const heavier = computeWashAndFold({
    ...counter,
    avgOrderPounds: 40,
    deliveryStopsPerOrder: 2,
    driveMinutesPerStop: 6,
    milesPerStop: 4,
    vehicleCostPerMile: 0.7,
  });
  assert.equal(heavier.order.delivery, 9.2, "the drive does not get longer with a heavier bag");
  assert.ok(
    heavier.perPound.delivery < delivered.perPound.delivery,
    "delivery cost per pound must fall as the order gets bigger",
  );
});

test("flags a price below break-even as high severity", () => {
  const r = computeWashAndFold({ ...counter, pricePerPound: 0.75, minimumCharge: 0 });
  const finding = r.findings.find((f) => f.id === "below-break-even");
  assert.ok(finding, "expected a below-break-even finding");
  assert.equal(finding.severity, SEVERITY.HIGH);
  assert.match(finding.title, /\$0\.18 a pound below cost/);
  assert.ok(r.profitPerOrder < 0);
});

test("a minimum charge can rescue an order priced below cost per pound", () => {
  // $0.75/lb on a 20 lb order is under the $0.925 cost, but the $20 minimum
  // still clears the $18.50 the order costs — the per-pound price is the
  // defect, and the finding fires while the order itself stays profitable.
  const r = computeWashAndFold({ ...counter, pricePerPound: 0.75 });
  assert.equal(r.revenuePerOrder, 20);
  assert.equal(r.minimumApplied, true);
  assert.ok(r.profitPerOrder > 0);
  assert.ok(ids(r).includes("below-break-even"));
});

test("flags a minimum charge that does not cover the smallest order accepted", () => {
  const r = computeWashAndFold({
    ...counter,
    minimumCharge: 8,
    minimumOrderPounds: 6,
    pricePerPound: 1,
  });
  const finding = r.findings.find((f) => f.id === "minimum-below-cost");
  assert.ok(finding, "expected a minimum-below-cost finding");
  assert.equal(finding.severity, SEVERITY.HIGH);
  // A 6 lb order still pays 16 labour minutes, one wash, one dry and supplies.
  const smallest = costOfOrder(6, {
    laborMinutesPerPound: 1,
    fixedMinutesPerOrder: 10,
    wagePerHour: 18,
    payrollLoadPct: 0,
    poundsPerWasherLoad: 20,
    washCostPerLoad: 2,
    poundsPerDryerLoad: 20,
    dryCostPerLoad: 1.5,
    suppliesCostPerPound: 0.05,
    deliveryStopsPerOrder: 0,
    driveMinutesPerStop: 0,
    milesPerStop: 0,
    vehicleCostPerMile: 0,
    overheadPerPound: 0.25,
  });
  // 16 labour minutes ($4.80) + one wash ($2.00) + one dry ($1.50) +
  // supplies ($0.30) + overhead ($1.50) = $10.10, against $8.00 collected.
  assert.equal(smallest.total, 10.1);
  assert.match(finding.title, /A 6 lb order at your minimum loses \$2\.10/);
});

test("does not flag a minimum charge that does cover the smallest order", () => {
  const r = computeWashAndFold({ ...counter, minimumCharge: 30, minimumOrderPounds: 10 });
  assert.ok(!ids(r).includes("minimum-below-cost"));
});

test("flags delivery that costs more than the washing", () => {
  const r = computeWashAndFold({
    ...counter,
    avgOrderPounds: 10,
    deliveryStopsPerOrder: 2,
    driveMinutesPerStop: 15,
    milesPerStop: 6,
    vehicleCostPerMile: 0.7,
  });
  assert.ok(ids(r).includes("delivery-dominates"));
});

test("flags a price above cost but below the margin target", () => {
  const r = computeWashAndFold({ ...counter, pricePerPound: 1 });
  const finding = r.findings.find((f) => f.id === "below-target-margin");
  assert.ok(finding, "expected a below-target-margin finding");
  assert.equal(finding.severity, SEVERITY.MEDIUM);
  assert.ok(!ids(r).includes("below-break-even"));
});

test("flags a mostly empty second machine", () => {
  const r = computeWashAndFold({ ...counter, avgOrderPounds: 24 });
  const finding = r.findings.find((f) => f.id === "partial-machine-load");
  assert.ok(finding, "expected a partial-machine-load finding");
  assert.match(finding.title, /2 washers/);
});

test("says so when no overhead share is allocated", () => {
  const r = computeWashAndFold({ ...counter, monthlyOverhead: 0 });
  assert.ok(ids(r).includes("no-overhead-allocated"));
  assert.ok(!ids(computeWashAndFold(counter)).includes("no-overhead-allocated"));
});

test("always carries the note that the rates are the operator's own", () => {
  assert.ok(ids(computeWashAndFold(counter)).includes("rates-are-yours"));
  assert.ok(ids(computeWashAndFold({})).includes("rates-are-yours"));
});

test("empty and nonsense input returns zeros rather than NaN", () => {
  const r = computeWashAndFold({});
  assert.equal(r.order.total, 0);
  assert.equal(r.costPerPound, 0);
  assert.equal(r.marginPct, 0);
  assert.ok(ids(r).includes("missing-basics"));

  const junk = computeWashAndFold({
    avgOrderPounds: -5,
    wagePerHour: Number.NaN,
    poundsPerWasherLoad: 0,
    pricePerPound: "2",
  });
  assert.equal(Number.isFinite(junk.order.total), true);
  assert.equal(junk.costPerPound, 0);
});

test("a target margin is capped below 100% so the target price stays finite", () => {
  const r = computeWashAndFold({ ...counter, targetMarginPct: 400 });
  assert.ok(Number.isFinite(r.targetPricePerPound));
  assert.ok(r.targetPricePerPound > r.costPerPound);
});
