import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputs, computeAll, delayScenarios, followUpDraft } from './calc.mjs';
import { worksheetSummary } from './calc.mjs';

test('calculates retainage and carrying cost without rounding drift', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(computeAll(parsed.values), { retainageWithheld: 10000, earnedUnpaid: 25000, carryingCost: 739.73, totalCashOutstanding: 25739.73 });
});

test('rejects missing and inconsistent inputs', () => {
  assert.equal(parseInputs({ contractValue: '', retainagePct: 10, paidToDate: 20, daysOutstanding: 1, annualCarryingRatePct: 1 }).ok, false);
  assert.match(parseInputs({ contractValue: 10, retainagePct: 10, paidToDate: 20, daysOutstanding: 1, annualCarryingRatePct: 1 }).errors.at(-1), /cannot exceed/);
});

test('draft names the measured amount and keeps the decision with the user', () => {
  const draft = followUpDraft({ result: { earnedUnpaid: 25000, retainageWithheld: 10000 }, currency: '$' });
  assert.match(draft, /\$25000\.00/);
  assert.match(draft, /not legal advice/);
});

test('shows incremental carrying cost for future delay scenarios', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  assert.deepEqual(delayScenarios(values), [
    { days: 30, totalCashOutstanding: 25986.3, additionalCarryingCost: 246.57 },
    { days: 60, totalCashOutstanding: 26232.88, additionalCarryingCost: 493.15 },
    { days: 90, totalCashOutstanding: 26479.45, additionalCarryingCost: 739.72 },
  ]);

test('worksheet summary preserves project context and model assumptions', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' });
  const summary = worksheetSummary({ projectName: 'Main Street remodel', payerName: 'Acme Construction', invoiceReference: 'Pay application #4', dueDate: 'August 30, 2026', values: parsed.values, result: computeAll(parsed.values) });
  assert.match(summary, /Project: Main Street remodel/);
  assert.match(summary, /Retainage withheld \(10\.0%\): \$10000\.00/);
  assert.match(summary, /Annual carrying-cost assumption: 12\.0%/);
  assert.match(summary, /Verify the figures/);
});
