import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEvent, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculateEvent() matches hand-computed arithmetic on the default event', () => {
  const r = calculateEvent(DEFAULTS);
  // 90 miles * $0.67
  close(r.mileageCost, 60.3);
  // 250 booth + 25 jury + 60.30 mileage + 0 lodging + 15 parking + 20 display
  close(r.fixedEventCost, 370.3);
  // 8 prep + 3 travel + 3 setup/teardown + 12 selling
  close(r.committedHours, 26);
  close(r.laborValue, 650);
  // 0.30 materials + 0.80 * 0.026 card percent + 0.80 * 0.10/38 fixed
  close(r.materialRate, 0.3);
  close(r.cardPercentRate, 0.0208);
  close(r.cardFixedRate, 0.00210526, 1e-6);
  close(r.contributionRate, 0.67709474, 1e-6);
  close(r.contributionPerOrder, 25.7296);
  close(r.breakEvenRevenue, 546.8954);
  close(r.breakEvenRevenueWithPay, 1506.8792);
});

test('break-even revenue really does leave exactly zero cash', () => {
  const r = calculateEvent(DEFAULTS);
  const atBreakEven = calculateEvent({ ...DEFAULTS, expectedRevenue: r.breakEvenRevenue });
  close(atBreakEven.expected.cashProfit, 0, 1e-6);
});

test('break-even with your own time paid leaves exactly zero after paying yourself', () => {
  const r = calculateEvent(DEFAULTS);
  const atBreakEven = calculateEvent({ ...DEFAULTS, expectedRevenue: r.breakEvenRevenueWithPay });
  close(atBreakEven.expected.profitAfterPayingYourself, 0, 1e-6);
  close(atBreakEven.expected.effectiveHourlyRate, DEFAULTS.targetHourlyRate, 1e-6);
});

test('order counts round up — a partial sale does not cover a booth', () => {
  const r = calculateEvent(DEFAULTS);
  assert.equal(r.breakEvenOrders, Math.ceil(r.breakEvenRevenue / DEFAULTS.averageOrderValue));
  assert.ok(r.breakEvenOrders * DEFAULTS.averageOrderValue >= r.breakEvenRevenue);
});

test("paying yourself nothing makes the two break-evens the same number", () => {
  const r = calculateEvent({ ...DEFAULTS, targetHourlyRate: 0 });
  close(r.laborValue, 0);
  close(r.breakEvenRevenueWithPay, r.breakEvenRevenue, 1e-9);
});

// The structural point this venture exists to make: stock that does not sell
// is inventory for the next market, not a cost of this one. If the whole
// table's materials were charged against one weekend, break-even would move
// with how much stock was loaded into the van — and it must not.
test('bringing more stock does not change what the day has to sell to break even', () => {
  const lean = calculateEvent({ ...DEFAULTS, stockBroughtRetailValue: 900 });
  const loaded = calculateEvent({ ...DEFAULTS, stockBroughtRetailValue: 6000 });
  close(loaded.breakEvenRevenue, lean.breakEvenRevenue, 1e-9);
  close(loaded.expected.cashProfit, lean.expected.cashProfit, 1e-9);
  // It changes only the sell-through the break-even represents.
  assert.ok(loaded.sellThroughNeededPct < lean.sellThroughNeededPct);
});

test('a table too thin to cover the booth is flagged, not silently priced', () => {
  const r = calculateEvent({ ...DEFAULTS, stockBroughtRetailValue: 400 });
  assert.equal(r.stockTooThin, true);
  assert.ok(r.sellThroughNeededPct > 100);
});

test('a table with room to spare is not flagged', () => {
  assert.equal(calculateEvent(DEFAULTS).stockTooThin, false);
});

test('sell-through is null rather than Infinity when no stock figure is given', () => {
  const r = calculateEvent({ ...DEFAULTS, stockBroughtRetailValue: 0 });
  assert.equal(r.sellThroughNeededPct, null);
  assert.equal(r.sellThroughNeededWithPayPct, null);
  assert.equal(r.stockTooThin, false);
});

// The processor's fixed fee is charged per transaction, so it costs a
// sticker table far more per dollar than a print table. A calculator that
// folded it into the percentage would report both the same.
test('a low average order value costs more per dollar in fixed card fees', () => {
  const stickers = calculateEvent({ ...DEFAULTS, averageOrderValue: 6 });
  const prints = calculateEvent({ ...DEFAULTS, averageOrderValue: 80 });
  assert.ok(stickers.cardFixedRate > prints.cardFixedRate);
  assert.ok(stickers.contributionRate < prints.contributionRate);
  assert.ok(stickers.breakEvenRevenue > prints.breakEvenRevenue);
});

test('cash-only selling removes card fees entirely', () => {
  const r = calculateEvent({ ...DEFAULTS, cardSharePct: 0 });
  close(r.cardPercentRate, 0);
  close(r.cardFixedRate, 0);
  close(r.expected.cardFees, 0);
  close(r.contributionRate, 1 - DEFAULTS.materialCostPct / 100, 1e-9);
});

test('the max defensible booth fee is the fee that lands exactly on the target rate', () => {
  const r = calculateEvent(DEFAULTS);
  const atMax = calculateEvent({ ...DEFAULTS, boothFee: r.maxBoothFeeAtTargetRate });
  close(atMax.expected.profitAfterPayingYourself, 0, 1e-6);
  close(atMax.expected.effectiveHourlyRate, DEFAULTS.targetHourlyRate, 1e-6);
});

test('an event whose expected sales cannot clear the target rate at any booth fee says so', () => {
  const r = calculateEvent({ ...DEFAULTS, expectedRevenue: 600 });
  assert.equal(r.noBoothFeeClearsTarget, true);
  assert.ok(r.maxBoothFeeAtTargetRate < 0);
});

test('the default event clears cash but only just clears the target rate', () => {
  const r = calculateEvent(DEFAULTS);
  assert.equal(r.expected.belowCashBreakEven, false);
  assert.ok(r.expected.cashProfit > 0);
  close(r.expected.effectiveHourlyRate, 24.82, 0.01);
  assert.equal(r.expected.clearsTargetRate, false);
});

test('a losing day is reported as below cash break-even', () => {
  const r = calculateEvent({ ...DEFAULTS, expectedRevenue: 300 });
  assert.equal(r.expected.belowCashBreakEven, true);
  assert.ok(r.expected.cashProfit < 0);
});

test('expected order count follows from revenue and average order value', () => {
  const r = calculateEvent(DEFAULTS);
  close(r.expected.orders, DEFAULTS.expectedRevenue / DEFAULTS.averageOrderValue, 1e-9);
});

test('materials and card fees at the expected day reconcile to the contribution', () => {
  const r = calculateEvent(DEFAULTS);
  close(
    r.expected.contribution,
    r.expected.revenue - r.expected.materialsCost - r.expected.cardFees,
    1e-9,
  );
  close(r.expected.cashProfit, r.expected.contribution - r.fixedEventCost, 1e-9);
});

test('every DEFAULTS key is validated rather than silently coerced', () => {
  for (const key of Object.keys(DEFAULTS)) {
    assert.throws(
      () => calculateEvent({ ...DEFAULTS, [key]: 'not a number' }),
      /must be a number/,
      `${key} accepted a non-numeric value`,
    );
    assert.throws(
      () => calculateEvent({ ...DEFAULTS, [key]: -1 }),
      /must be at least/,
      `${key} accepted a negative value`,
    );
  }
});

test('an average order value of zero is rejected rather than dividing by zero', () => {
  assert.throws(() => calculateEvent({ ...DEFAULTS, averageOrderValue: 0 }), /greater than zero/);
});

test('a material cost of 100% or more is rejected', () => {
  assert.throws(() => calculateEvent({ ...DEFAULTS, materialCostPct: 100 }), /at most/);
});

test('a card share above 100% is rejected', () => {
  assert.throws(() => calculateEvent({ ...DEFAULTS, cardSharePct: 101 }), /at most/);
});

test('fees that consume every dollar of sales raise a readable error', () => {
  assert.throws(
    () => calculateEvent({ ...DEFAULTS, materialCostPct: 99, averageOrderValue: 0.5 }),
    /consume every dollar/,
  );
});
