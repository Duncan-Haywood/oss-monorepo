import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputs, computeAll, compareRetainageRates, rateComparisonNote, delayScenarios, followUpDraft } from './calc.mjs';
import { worksheetSummary } from './calc.mjs';

test('calculates retainage and carrying cost without rounding drift', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(computeAll(parsed.values), { retainageWithheld: 10000, retainageStillUnpaid: 10000, earnedUnpaid: 25000, carryingCost: 739.73, totalCashOutstanding: 25739.73 });
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

test('caps retainage still unpaid at the total unpaid balance', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '95000', daysOutstanding: '30', annualCarryingRatePct: '12' });
  const result = computeAll(parsed.values);
  assert.equal(result.retainageWithheld, 10000);
  assert.equal(result.retainageStillUnpaid, 5000);
  assert.match(followUpDraft({ result }), /including approximately \$5000\.00 in retainage/);
});

test('shows incremental carrying cost for future delay scenarios', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  assert.deepEqual(delayScenarios(values), [
    { days: 30, totalCashOutstanding: 25986.3, additionalCarryingCost: 246.57 },
    { days: 60, totalCashOutstanding: 26232.88, additionalCarryingCost: 493.15 },
    { days: 90, totalCashOutstanding: 26479.45, additionalCarryingCost: 739.72 },
  ]);
});

test('worksheet summary preserves project context and model assumptions', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' });
  const summary = worksheetSummary({ projectName: 'Main Street remodel', payerName: 'Acme Construction', invoiceReference: 'Pay application #4', dueDate: 'August 30, 2026', values: parsed.values, result: computeAll(parsed.values) });
  assert.match(summary, /Project: Main Street remodel/);
  assert.match(summary, /Retainage withheld \(10\.0%\): \$10000\.00/);
  assert.match(summary, /Annual carrying-cost assumption: 12\.0%/);
  assert.match(summary, /Verify the figures/);
});

test('worksheet summary includes optional delay scenarios for project review', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  const summary = worksheetSummary({ values, result: computeAll(values), scenarios: delayScenarios(values) });
  assert.match(summary, /Further-delay scenarios \(modeled\):/);
  assert.match(summary, /\+90 days: \$26479\.45 outstanding; \$739\.72 added carrying cost/);
});

test('defaults typical retainage hold to 90 days when omitted', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '45', annualCarryingRatePct: '12' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.values.typicalHoldDays, 90);
});

test('compares 0/5/10 percent retainage and the worksheet rate', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  const rows = compareRetainageRates(values);
  assert.deepEqual(rows.map((row) => row.retainagePct), [0, 5, 10]);
  assert.equal(rows[0].withheld, 0);
  assert.equal(rows[0].bidToKeepProgress, 100000);
  assert.equal(rows[0].extraToKeepProgress, 0);
  assert.equal(rows[1].withheld, 5000);
  assert.equal(rows[1].progressCash, 95000);
  assert.equal(rows[1].carryingCost, 147.95);
  assert.equal(rows[1].bidToKeepProgress, 105263.16);
  assert.equal(rows[1].extraToKeepProgress, 5263.16);
  assert.equal(rows[2].current, true);
  assert.equal(rows[2].withheld, 10000);
  assert.equal(rows[2].progressCash, 90000);
  assert.equal(rows[2].carryingCost, 295.89);
  assert.equal(rows[2].bidToKeepProgress, 111111.11);
  assert.equal(rows[2].extraToKeepProgress, 11111.11);
  assert.equal(rows[2].bidToKeepEconomic, 100296.77);
  assert.equal(rows[2].extraToKeepEconomic, 296.77);
});

test('includes a non-standard retainage rate in the comparison', () => {
  const values = parseInputs({ contractValue: '80000', retainagePct: '7.5', paidToDate: '0', daysOutstanding: '0', annualCarryingRatePct: '10', typicalHoldDays: '60' }).values;
  const rows = compareRetainageRates(values);
  assert.deepEqual(rows.map((row) => row.retainagePct), [0, 5, 7.5, 10]);
  const current = rows.find((row) => row.current);
  assert.equal(current.holdDays, 60);
  assert.equal(current.withheld, 6000);
  assert.equal(current.progressCash, 74000);
  assert.equal(current.bidToKeepProgress, 86486.49);
});

test('does not invent a bid at 100 percent retainage', () => {
  const values = parseInputs({ contractValue: '50000', retainagePct: '100', paidToDate: '0', daysOutstanding: '0', annualCarryingRatePct: '8' }).values;
  const rows = compareRetainageRates(values, [100]);
  assert.equal(rows[0].bidToKeepProgress, null);
  assert.equal(rows[0].extraToKeepProgress, null);
  assert.equal(rows[0].progressCash, 0);
});

test('rate comparison note prices the cash-now gap, not just interest', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  const note = rateComparisonNote(compareRetainageRates(values));
  assert.match(note, /\$111111\.11/);
  assert.match(note, /\$11111\.11 more/);
  assert.match(note, /cash-now gap/);
  assert.match(note, /not a contract reading/);
});

test('worksheet summary includes the retainage-rate comparison', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  const summary = worksheetSummary({
    values,
    result: computeAll(values),
    rateRows: compareRetainageRates(values),
  });
  assert.match(summary, /Retainage rate comparison \(modeled on a 90-day hold\):/);
  assert.match(summary, /10\.0% \(this worksheet\): withheld \$10000\.00; progress cash \$90000\.00; bid to keep progress cash \$111111\.11 \(\$11111\.11 extra\)/);
});
