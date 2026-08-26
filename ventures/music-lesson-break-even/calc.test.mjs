import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLesson, comparePolicyLevers, leverSummary } from './calc.mjs';

test('accounts for cancellations when calculating paid lessons and target price', () => {
  const result = calculateLesson({ lessonPrice: 60, lessonsPerWeek: 20, weeksPerYear: 48, cancelRate: 10, prepMinutes: 10, travelMinutes: 0, monthlyCosts: 200, targetPay: 40000 });
  assert.equal(result.annualScheduled, 960);
  assert.equal(result.annualPaid, 864);
  assert.equal(result.annualRevenue, 51840);
  assert.equal(result.targetPrice, (40000 + 2400) / 864);
});

test('includes preparation and travel in the effective hourly rate', () => {
  const result = calculateLesson({ lessonPrice: 100, lessonsPerWeek: 1, weeksPerYear: 50, cancelRate: 0, prepMinutes: 20, travelMinutes: 40, monthlyCosts: 0, targetPay: 0 });
  assert.equal(result.annualHours, 50 * 120 / 60);
  assert.equal(result.effectiveHourly, 50);
});

test('rejects impossible cancellation rates', () => {
  assert.throws(() => calculateLesson({ lessonPrice: 50, lessonsPerWeek: 1, cancelRate: 101 }), /100%/);
});

const defaults = { lessonPrice: 60, lessonsPerWeek: 20, weeksPerYear: 48, cancelRate: 10, prepMinutes: 10, travelMinutes: 0, monthlyCosts: 200, targetPay: 40000 };

test('policy levers keep travel from changing cash on the defaults', () => {
  const rows = comparePolicyLevers(defaults);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(byId.current.result.netAfterCosts, 49440);
  assert.equal(byId.tighter_cancels.netDelta, 2880);
  assert.equal(byId.more_slots.netDelta, 5184);
  assert.equal(byId.house_call_30.netDelta, 0);
  assert.ok(byId.house_call_30.hourlyDelta < 0);
  assert.equal(byId.more_slots.result.targetPrice, (40000 + 2400) / 950.4);
});

test('studio-only lever appears when the week already includes travel', () => {
  const rows = comparePolicyLevers({ ...defaults, travelMinutes: 30 });
  assert.ok(rows.some((row) => row.id === 'no_travel'));
  assert.equal(rows.find((row) => row.id === 'no_travel').netDelta, 0);
});

test('lever summary names the cash winner and the travel caveat', () => {
  const text = leverSummary(comparePolicyLevers(defaults));
  assert.match(text, /Two more weekly lessons/);
  assert.match(text, /5184\.00/);
  assert.match(text, /does not change cash/);
});
