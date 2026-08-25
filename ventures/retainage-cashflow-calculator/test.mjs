import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputs, computeAll, followUpDraft, summaryText } from './calc.mjs';

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

test('summary export contains modeled values and safety boundary', () => {
  const summary = summaryText({ projectName: 'Main Street remodel', result: { retainageWithheld: 10000, earnedUnpaid: 25000, carryingCost: 739.73, totalCashOutstanding: 25739.73 } });
  assert.match(summary, /Main Street remodel/);
  assert.match(summary, /Total modeled cash outstanding: \$25739\.73/);
  assert.match(summary, /Not legal, tax, financial, or engineering advice/);
});
