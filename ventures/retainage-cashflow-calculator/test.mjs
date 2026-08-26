import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputs, computeAll, delayScenarios, followUpDraft, releaseSchedule, releaseNote, comparePartialReleaseOffer, partialReleaseNote, worksheetSummary } from './calc.mjs';

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

test('defaults release-schedule fields so older worksheets still parse', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.values.percentComplete, 75);
  assert.equal(parsed.values.reductionAtPct, 50);
  assert.equal(parsed.values.reducedRetainagePct, 5);
});

test('models AIA-style retainage reduction after the 50% point', () => {
  const values = parseInputs({
    contractValue: '100000',
    retainagePct: '10',
    paidToDate: '75000',
    daysOutstanding: '90',
    annualCarryingRatePct: '12',
    percentComplete: '80',
    reductionAtPct: '50',
    reducedRetainagePct: '5',
  }).values;
  assert.deepEqual(releaseSchedule(values), {
    percentComplete: 80,
    reductionAtPct: 50,
    reducedRetainagePct: 5,
    billed: 80000,
    progressRetainage: 8000,
    properHold: 5000,
    shouldHaveReleased: 3000,
    overheld: 5000,
    pastReduction: true,
  });
});

test('holds the full rate before the reduction point', () => {
  const values = parseInputs({
    contractValue: '100000',
    retainagePct: '10',
    paidToDate: '30000',
    daysOutstanding: '15',
    annualCarryingRatePct: '12',
    percentComplete: '40',
    reductionAtPct: '50',
    reducedRetainagePct: '5',
  }).values;
  const schedule = releaseSchedule(values);
  assert.equal(schedule.pastReduction, false);
  assert.equal(schedule.properHold, 4000);
  assert.equal(schedule.shouldHaveReleased, 0);
  assert.equal(schedule.overheld, 0);
});

test('release note names the typically releasable amount', () => {
  const schedule = releaseSchedule({
    contractValue: 100000,
    retainagePct: 10,
    paidToDate: 75000,
    daysOutstanding: 90,
    annualCarryingRatePct: 12,
    percentComplete: 80,
    reductionAtPct: 50,
    reducedRetainagePct: 5,
  });
  assert.match(releaseNote(schedule), /\$3000\.00/);
  assert.match(releaseNote(schedule), /not a contract reading/);
});

test('worksheet summary includes the modeled release schedule', () => {
  const values = parseInputs({
    contractValue: '100000',
    retainagePct: '10',
    paidToDate: '75000',
    daysOutstanding: '90',
    annualCarryingRatePct: '12',
    percentComplete: '80',
  }).values;
  const summary = worksheetSummary({
    values,
    result: computeAll(values),
    release: releaseSchedule(values),
  });
  assert.match(summary, /Proper hold at this percent complete: \$5000\.00/);
  assert.match(summary, /Typically already releasable: \$3000\.00/);
});

test('partial retainage offer: $5k waiver trails waiting; acceleration still beats both', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  const comparison = comparePartialReleaseOffer(values, { partialOffer: '5000', waitDays: '60' });
  assert.equal(comparison.fullRelease, 10000);
  assert.equal(comparison.remainder, 5000);
  assert.deepEqual(comparison.wait, {
    path: 'wait',
    label: 'Wait 60 days for full retainage',
    cash: 10000,
    additionalCarrying: 197.26,
    net: 9802.74,
  });
  assert.deepEqual(comparison.accelerate, {
    path: 'accelerate',
    label: 'Take the check, rest in 60 days',
    cash: 10000,
    additionalCarrying: 98.63,
    net: 9901.37,
  });
  assert.equal(comparison.waive.net, 5000);
  assert.equal(comparison.winner, 'accelerate');
  assert.equal(comparison.breakEvenPartialOffer, 9802.74);
  assert.equal(comparison.waiveVsWait, -4802.74);
  assert.equal(comparison.accelerateVsWait, 98.63);
});

test('a check above the wait net still loses to acceleration when the rest arrives', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  const comparison = comparePartialReleaseOffer(values, { partialOffer: 9900, waitDays: 60 });
  assert.equal(comparison.waiveVsWait, 97.26);
  assert.equal(comparison.winner, 'accelerate');
  assert.ok(comparison.accelerate.net > comparison.waive.net);
});

test('an over-full check that closes retainage uniquely beats waiting', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  const comparison = comparePartialReleaseOffer(values, { partialOffer: 11000, waitDays: 60 });
  assert.equal(comparison.remainder, 0);
  assert.equal(comparison.waive.net, 11000);
  assert.equal(comparison.accelerate.net, 10000);
  assert.equal(comparison.winner, 'waive');
});

test('partial-release comparison uses unpaid retainage, not the original withhold', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '95000', daysOutstanding: '30', annualCarryingRatePct: '12' }).values;
  const comparison = comparePartialReleaseOffer(values, { partialOffer: 2000, waitDays: 30 });
  assert.equal(comparison.fullRelease, 5000);
  assert.equal(comparison.wait.additionalCarrying, 49.32);
  assert.equal(comparison.wait.net, 4950.68);
});

test('rejects a negative or empty partial offer and a fractional wait', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  assert.throws(() => comparePartialReleaseOffer(values, { partialOffer: -1, waitDays: 60 }), /non-negative/);
  assert.throws(() => comparePartialReleaseOffer(values, { waitDays: 60 }), /required/);
  assert.throws(() => comparePartialReleaseOffer(values, { partialOffer: 5000, waitDays: -1 }), /non-negative/);
  assert.throws(() => comparePartialReleaseOffer(values, { partialOffer: 5000, waitDays: 60.5 }), /whole number/);
});

test('partial-release note stays arithmetic and does not tell the user to sign', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  const note = partialReleaseNote(comparePartialReleaseOffer(values, { partialOffer: 5000, waitDays: 60 }));
  assert.match(note, /\$9802\.74/);
  assert.match(note, /\$4802\.74 behind/);
  assert.match(note, /\$9901\.37/);
  assert.match(note, /not interest, a lien right, or a reason to sign/);
  assert.doesNotMatch(note, /accept|refuse|should sign|you should/i);
});

test('worksheet summary can include the partial-release comparison', () => {
  const values = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' }).values;
  const partialRelease = comparePartialReleaseOffer(values, { partialOffer: 5000, waitDays: 60 });
  const summary = worksheetSummary({ values, result: computeAll(values), partialRelease });
  assert.match(summary, /Partial retainage offer \(modeled\):/);
  assert.match(summary, /Typed check today: \$5000\.00/);
  assert.match(summary, /Take the check, close the rest: cash \$5000\.00/);
  assert.match(summary, /Break-even check that matches waiting: \$9802\.74/);
});
