import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLesson } from './calc.mjs';

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
