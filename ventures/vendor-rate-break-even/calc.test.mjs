import test from 'node:test';
import assert from 'node:assert/strict';
import { compare } from './calc.mjs';

test('compares fixed and per-job vendor costs at expected volume', () => {
  const result = compare({ jobsPerMonth: 20, revenuePerJob: 500, baseFixedMonthly: 0, baseVariablePerJob: 120, scenarios: [{ name: 'Bulk supplier', fixedMonthly: 100, variablePerJob: 90 }] });
  assert.equal(result.baseline.monthlyCost, 2400);
  assert.equal(result.scenarios[0].monthlyCost, 1900);
  assert.equal(result.scenarios[0].costPerJob, 95);
  assert.equal(result.scenarios[0].savingsPerJob, 25);
});

test('returns no break-even when a scenario is never cheaper', () => {
  const result = compare({ jobsPerMonth: 10, revenuePerJob: 300, baseFixedMonthly: 50, baseVariablePerJob: 100, scenarios: [{ name: 'Bad lease', fixedMonthly: 300, variablePerJob: 120 }] });
  assert.equal(result.scenarios[0].savingsPerJob, -45);
  assert.equal(result.scenarios[0].breakEvenJobs, null);
});

test('rejects zero volume', () => {
  assert.throws(() => compare({ jobsPerMonth: 0, revenuePerJob: 1, baseFixedMonthly: 0, baseVariablePerJob: 1, scenarios: [] }), /greater than zero/);
});
