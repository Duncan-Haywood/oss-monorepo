import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, rankAddOns, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  close(r.totalHours, 3);
  close(r.laborCost, 225);
  close(r.grossRevenue, 300);
  close(r.totalCost, 230);
  close(r.netProfit, 70);
  close(r.effectiveHourlyRate, 70 / 3);
  close(r.profitMarginPct, (70 / 300) * 100);
  close(r.breakEvenPrice, 230);
  assert.ok(r.netProfit > 0, 'the default add-on should be profitable');
});

test('a second shooter add-on with a subcontractor payout and extra gear wear can lose money on paper', () => {
  const r = calculate({
    targetHourlyRate: 75, shootHours: 0, cullHours: 1.5, editHours: 2,
    secondShooterCost: 250, albumPrintCost: 0, gearWearAllowance: 10, price: 450,
  });
  close(r.totalHours, 3.5);
  close(r.laborCost, 262.5);
  close(r.totalCost, 522.5);
  close(r.netProfit, -72.5);
  close(r.effectiveHourlyRate, -72.5 / 3.5);
  close(r.profitMarginPct, (-72.5 / 450) * 100);
  close(r.breakEvenPrice, 522.5);
  assert.ok(r.netProfit < 0, 'a $450 charge for this second-shooter add-on loses money once every cost is counted');
});

test('an album/print add-on with zero of the photographer\'s own hours reports a null effective hourly rate', () => {
  const r = calculate({
    ...DEFAULTS, shootHours: 0, cullHours: 0, editHours: 0, albumPrintCost: 150, price: 220,
  });
  assert.equal(r.totalHours, 0);
  assert.equal(r.effectiveHourlyRate, null);
  close(r.netProfit, 65);
});

test('zero price reports a null profit margin instead of dividing by zero', () => {
  const r = calculate({ ...DEFAULTS, price: 0 });
  assert.equal(r.grossRevenue, 0);
  assert.equal(r.profitMarginPct, null);
  assert.ok(r.netProfit < 0, 'labor and gear cost still apply with zero price');
});

test('gear wear allowance and second shooter cost are both counted even when time is zero', () => {
  const r = calculate({
    targetHourlyRate: 75, shootHours: 0, cullHours: 0, editHours: 0,
    secondShooterCost: 100, albumPrintCost: 0, gearWearAllowance: 5, price: 90,
  });
  close(r.totalCost, 105);
  close(r.netProfit, -15);
});

test('a price that exactly matches total cost breaks even at zero net profit', () => {
  const r = calculate(DEFAULTS);
  const atBreakEven = calculate({ ...DEFAULTS, price: r.breakEvenPrice });
  close(atBreakEven.netProfit, 0);
  close(atBreakEven.effectiveHourlyRate, 0);
});

test('rejects a negative shoot hours value', () => {
  assert.throws(() => calculate({ ...DEFAULTS, shootHours: -1 }), /shoot hours/i);
});

test('rejects a negative price', () => {
  assert.throws(() => calculate({ ...DEFAULTS, price: -10 }), /price/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, targetHourlyRate: 'a lot' }), /target hourly rate/i);
});

test('rankAddOns sorts by effective hourly rate descending and reports the spread', () => {
  const r = rankAddOns([
    { name: 'Extra hour', netProfit: 70, effectiveHourlyRate: 23.33 },
    { name: 'Second shooter', netProfit: -72.5, effectiveHourlyRate: -20.71 },
    { name: 'Engagement session', netProfit: 200, effectiveHourlyRate: 40 },
  ]);
  assert.deepEqual(r.ranked.map((o) => o.name), ['Engagement session', 'Extra hour', 'Second shooter']);
  assert.equal(r.best.name, 'Engagement session');
  assert.equal(r.worst.name, 'Second shooter');
  close(r.spread, 40 - -20.71);
  assert.equal(r.optionCount, 3);
});

test('rankAddOns on an empty list returns nulls without dividing by zero', () => {
  const r = rankAddOns([]);
  assert.equal(r.best, null);
  assert.equal(r.worst, null);
  assert.equal(r.spread, 0);
  assert.equal(r.optionCount, 0);
});

test('rankAddOns accepts a negative effective hourly rate (a losing add-on) rather than rejecting it', () => {
  const r = rankAddOns([
    { name: 'Bad add-on', netProfit: -72.5, effectiveHourlyRate: -20.71 },
    { name: 'Good add-on', netProfit: 70, effectiveHourlyRate: 23.33 },
  ]);
  assert.equal(r.best.name, 'Good add-on');
  assert.equal(r.worst.name, 'Bad add-on');
});

test('rankAddOns breaks a tied effective hourly rate by net profit', () => {
  const r = rankAddOns([
    { name: 'Small job', netProfit: 20, effectiveHourlyRate: 20 },
    { name: 'Bigger job', netProfit: 60, effectiveHourlyRate: 20 },
  ]);
  assert.equal(r.ranked[0].name, 'Bigger job');
});
