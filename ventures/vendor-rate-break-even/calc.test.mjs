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
  assert.equal(result.scenarios[0].cheaperUpToJobs, null);
});

test('a lower fixed cost with a higher per-job cost is cheaper only below a volume, not "not cheaper"', () => {
  // No-fee pay-per-job vendor vs. a $1,000/mo baseline: cheaper at low volume
  // on the fixed-cost saving, but the $5/job premium eventually erases it.
  const result = compare({ jobsPerMonth: 5, revenuePerJob: 50, baseFixedMonthly: 1000, baseVariablePerJob: 10, scenarios: [{ name: 'No-fee pay-per-job vendor', fixedMonthly: 0, variablePerJob: 15 }] });
  assert.equal(result.scenarios[0].monthlyCost, 75);
  assert.equal(result.scenarios[0].savingsPerJob, 195);
  assert.equal(result.scenarios[0].breakEvenJobs, null);
  assert.equal(result.scenarios[0].cheaperUpToJobs, 200);
  // Confirm the crossover: cheaper just below it, tied/worse at and above it.
  const below = compare({ jobsPerMonth: 199, revenuePerJob: 50, baseFixedMonthly: 1000, baseVariablePerJob: 10, scenarios: [{ name: 'x', fixedMonthly: 0, variablePerJob: 15 }] });
  const at = compare({ jobsPerMonth: 200, revenuePerJob: 50, baseFixedMonthly: 1000, baseVariablePerJob: 10, scenarios: [{ name: 'x', fixedMonthly: 0, variablePerJob: 15 }] });
  assert.ok(below.scenarios[0].monthlyCost < below.baseline.monthlyCost);
  assert.equal(at.scenarios[0].monthlyCost, at.baseline.monthlyCost);
});

test('a lower fixed cost with an equal per-job cost is already cheaper, not "not cheaper"', () => {
  const result = compare({ jobsPerMonth: 20, revenuePerJob: 500, baseFixedMonthly: 200, baseVariablePerJob: 90, scenarios: [{ name: 'No monthly minimum', fixedMonthly: 0, variablePerJob: 90 }] });
  assert.equal(result.scenarios[0].breakEvenJobs, 0);
  assert.equal(result.scenarios[0].cheaperUpToJobs, null);
});

test('rejects zero volume', () => {
  assert.throws(() => compare({ jobsPerMonth: 0, revenuePerJob: 1, baseFixedMonthly: 0, baseVariablePerJob: 1, scenarios: [] }), /greater than zero/);
});

test('reports profit per job, monthly profit, and margin for both the baseline and each scenario', () => {
  // Revenue per job was collected, validated, persisted, and shared, but
  // `compare` discarded it after validation -- the FAQ already talks about
  // "profit" but nothing computed one. Regression for that gap.
  const result = compare({
    jobsPerMonth: 20,
    revenuePerJob: 500,
    baseFixedMonthly: 0,
    baseVariablePerJob: 120,
    scenarios: [{ name: 'Bulk supplier', fixedMonthly: 100, variablePerJob: 90 }],
  });
  assert.equal(result.baseline.profitPerJob, 380);
  assert.equal(result.baseline.monthlyProfit, 7600);
  assert.equal(result.baseline.marginPercent, 76);
  assert.equal(result.scenarios[0].profitPerJob, 405);
  assert.equal(result.scenarios[0].monthlyProfit, 8100);
  assert.equal(result.scenarios[0].marginPercent, 81);
});

test('a scenario that costs more per job than it earns reports negative profit and margin', () => {
  const result = compare({
    jobsPerMonth: 10,
    revenuePerJob: 100,
    baseFixedMonthly: 0,
    baseVariablePerJob: 80,
    scenarios: [{ name: 'Overpriced lease', fixedMonthly: 300, variablePerJob: 90 }],
  });
  assert.equal(result.scenarios[0].costPerJob, 120);
  assert.equal(result.scenarios[0].profitPerJob, -20);
  assert.equal(result.scenarios[0].marginPercent, -20);
});

test('margin is null, not zero or infinite, when revenue per job is $0', () => {
  const result = compare({
    jobsPerMonth: 10,
    revenuePerJob: 0,
    baseFixedMonthly: 0,
    baseVariablePerJob: 50,
    scenarios: [{ name: 'Any vendor', fixedMonthly: 0, variablePerJob: 40 }],
  });
  assert.equal(result.baseline.marginPercent, null);
  assert.equal(result.scenarios[0].marginPercent, null);
  // Profit is still meaningful even without a margin denominator.
  assert.equal(result.scenarios[0].profitPerJob, -40);
});
