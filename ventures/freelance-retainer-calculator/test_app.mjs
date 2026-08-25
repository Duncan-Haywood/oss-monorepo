import assert from 'node:assert/strict';
import {
  calculatePlan,
  compareRetainerScenarios,
  DRAFT_KEY,
  DISCLAIMER,
  formatProposalSummary,
  formatScenarioComparison,
  loadDraft,
  retainerHourOptions,
  saveDraft,
  scenarioInsight,
} from './app.js';

const plan = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15 });
assert.equal(plan.capacity, 104);
assert.equal(plan.remainingCapacity, 84);
assert.equal(plan.target, 7800);
assert.equal(plan.rate, 75);
assert.equal(plan.retainer, 1725);
const summary = formatProposalSummary({ income: '6000', costs: '1800', hours: '160', utilization: '65', retainerHours: '20', buffer: '15' }, plan, 'USD');
assert.match(summary, /Monthly price: \$1,725/);
assert.match(summary, /Billable utilization: 65%/);
assert.ok(summary.includes(DISCLAIMER));
assert.throws(() => calculatePlan({ income: 1, costs: 1, hours: 0, utilization: 50, retainerHours: 1, buffer: 0 }));
assert.throws(() => calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 105, buffer: 15 }), /only 104.0 billable hours/);
const data = new Map();
const storage = { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) || null };
const draft = { income: '5000', costs: '900', hours: '140', utilization: '70', retainerHours: '16', buffer: '10' };
assert.equal(saveDraft(draft, storage), true);
assert.deepEqual(loadDraft(storage), draft);
assert.equal(loadDraft({ getItem: () => '{broken' }), null);
assert.equal(data.has(DRAFT_KEY), true);

const values = { income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15 };
assert.deepEqual(retainerHourOptions(20), [10, 15, 20, 25, 30]);
assert.deepEqual(retainerHourOptions(18), [10, 15, 18, 20, 25, 30]);
const scenarios = compareRetainerScenarios(values);
assert.equal(scenarios.length, 5);
assert.equal(scenarios[0].retainerHours, 10);
assert.equal(scenarios[0].ok, true);
assert.equal(scenarios[0].retainer, 862.5);
assert.equal(scenarios[0].effectiveRate, 86.25);
assert.equal(scenarios[2].selected, true);
assert.equal(scenarios[2].retainer, 1725);
assert.equal(scenarios[2].shareOfCapacity, 20 / 104);
const overflow = compareRetainerScenarios({ ...values, retainerHours: 110 });
assert.equal(overflow.find((row) => row.retainerHours === 110).ok, false);
assert.equal(overflow.find((row) => row.retainerHours === 20).ok, true);
const comparison = formatScenarioComparison(scenarios, 'USD');
assert.match(comparison, /20 hours — \$1,725 \/ month — 84\.0 hours left  ← this proposal/);
assert.match(comparison, /10 hours — \$863 \/ month/);
assert.match(scenarioInsight(scenarios), /19% of your billable capacity/);
assert.match(scenarioInsight(overflow), /largest size that does is 30 hours/);
const heavy = compareRetainerScenarios({ ...values, retainerHours: 60 });
assert.match(scenarioInsight(heavy), /more than half your month/);
console.log('freelance retainer calculator tests passed');
