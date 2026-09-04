import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseInputs, decodeDraft, computeAll, delayScenarios, followUpDraft, releaseSchedule, releaseNote, comparePartialReleaseOffer, partialReleaseNote, worksheetSummary, summaryText, cashFlowRecordText, compareRetainageRates, rateComparisonNote, evidenceSnapshot, paymentScheduleSummary } from './calc.mjs';

test('calculates retainage and carrying cost without rounding drift', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(computeAll(parsed.values), { retainageWithheld: 10000, retainageStillUnpaid: 10000, earnedUnpaid: 25000, dailyCarryingCost: 8.22, thirtyDayDelayCost: 246.58, carryingCost: 739.73, totalCashOutstanding: 25739.73 });
});

test('draft names the modeled cost of another day and 30 days', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' });
  const draft = followUpDraft({ result: computeAll(parsed.values), currency: '$' });
  assert.match(draft, /each additional day represents approximately \$8\.22/);
  assert.match(draft, /a 30-day delay would model approximately \$246\.58/);
});

test('rejects missing and inconsistent inputs', () => {
  assert.equal(parseInputs({ contractValue: '', retainagePct: 10, paidToDate: 20, daysOutstanding: 1, annualCarryingRatePct: 1 }).ok, false);
  assert.match(parseInputs({ contractValue: 10, retainagePct: 10, paidToDate: 20, daysOutstanding: 1, annualCarryingRatePct: 1 }).errors.at(-1), /cannot exceed/);
});

test('only restores complete valid worksheet drafts', () => {
  const valid = JSON.stringify({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12', project: 'Main Street' });
  assert.equal(decodeDraft(valid).project, 'Main Street');
  assert.equal(decodeDraft('{broken json'), null);
  assert.equal(decodeDraft(JSON.stringify({ contractValue: '-1', retainagePct: '10', paidToDate: '0', daysOutstanding: '0', annualCarryingRatePct: '12' })), null);
  assert.equal(decodeDraft(JSON.stringify({ contractValue: '100000', retainagePct: '10' })), null);
  assert.equal(decodeDraft(JSON.stringify(['100000', '10'])), null);
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
    // Billed $80,000, received $75,000 — so the customer is holding $5,000,
    // which is exactly the modeled proper hold at the reduced 5% rate.
    // Nothing is over-withheld. This assertion read `overheld: 5000` until
    // the figure was corrected: it was derived from the whole contract
    // rather than from what had actually been billed and paid, so it
    // reported over-withholding on a customer holding precisely the right
    // amount. `shouldHaveReleased` stays $3,000 — the model still says the
    // rate should have dropped from 10% to 5% of billed work, and it has.
    retainageHeldToDate: 5000,
    properHold: 5000,
    shouldHaveReleased: 3000,
    overheld: 0,
    pastReduction: true,
  });
});

test('over-withholding is measured against what has actually been paid, not the whole contract', () => {
  // Same job, but the customer has released nothing: billed $80,000, paid
  // $72,000, so $8,000 of retainage is genuinely outstanding against a
  // $5,000 proper hold. $3,000 really is held above the reduced rate.
  const held = paid => releaseSchedule(parseInputs({
    contractValue: '100000',
    retainagePct: '10',
    paidToDate: String(paid),
    daysOutstanding: '90',
    annualCarryingRatePct: '12',
    percentComplete: '80',
    reductionAtPct: '50',
    reducedRetainagePct: '5',
  }).values);

  assert.equal(held(72000).retainageHeldToDate, 8000);
  assert.equal(held(72000).overheld, 3000);

  // Partially released: $2,000 of the retainage has come back, so only
  // $6,000 is still held and $1,000 of it sits above the reduced rate.
  assert.equal(held(74000).retainageHeldToDate, 6000);
  assert.equal(held(74000).overheld, 1000);

  // The whole point of the fix: the figure has to move as payment arrives.
  // It previously reported a flat $5,000 across every one of these.
  assert.notEqual(held(72000).overheld, held(74000).overheld);
  assert.notEqual(held(74000).overheld, held(75000).overheld);
});

test('a customer paid past the retainage slice is not reported as holding any', () => {
  // Billed $80,000 and paid $79,000 — less than $8,000 of retainage is
  // outstanding because most of it has already come back.
  const schedule = releaseSchedule(parseInputs({
    contractValue: '100000',
    retainagePct: '10',
    paidToDate: '79000',
    daysOutstanding: '10',
    annualCarryingRatePct: '12',
    percentComplete: '80',
    reductionAtPct: '50',
    reducedRetainagePct: '5',
  }).values);
  assert.equal(schedule.retainageHeldToDate, 1000);
  assert.equal(schedule.overheld, 0);
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
  assert.doesNotMatch(note, /should bid|must add|you should/i);
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

test('payment schedule export ignores blank rows and calculates outstanding amounts', () => {
  const summary = paymentScheduleSummary([
    { label: 'Mobilization', billed: '12000', paid: '5000' },
    { label: '', billed: '', paid: '' }
  ]);
  assert.match(summary, /1\. Mobilization \| billed \$12000\.00 \| paid \$5000\.00 \| outstanding \$7000\.00/);
  assert.doesNotMatch(summary, /2\./);
  assert.match(summary, /Review this schedule/);
});

test('snapshot contains local inputs, modeled results, and safety note', () => {
  const snapshot = evidenceSnapshot({ inputs: { contractValue: 100000 }, result: { earnedUnpaid: 25000, inputs: { contractValue: 100000 } }, projectName: ' Main Street ' });
  assert.equal(snapshot.project.projectName, 'Main Street');
  assert.deepEqual(snapshot.inputs, { contractValue: 100000 });
  assert.equal(snapshot.modeledResults.earnedUnpaid, 25000);
  assert.equal(snapshot.modeledResults.inputs, undefined);
  assert.match(snapshot.note, /not legal/);
  assert.match(snapshot.exportedAt, /^20\d\d-/);
});

test('the page offers a private payment milestone schedule', () => {
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /id="milestoneSection"/);
  assert.match(page, /id="addMilestone"/);
  assert.match(page, /id="downloadSchedule"/);
  assert.match(page, /paymentScheduleSummary\(/);
  assert.match(page, /retainage-cashflow:milestone-downloads/);
});

test('the page offers a private JSON evidence snapshot', () => {
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /id="jsonSnapshot"/);
  assert.match(page, /evidenceSnapshot\(/);
  assert.match(page, /retainage-cashflow:snapshot-downloads/);
});

test('summary export contains modeled values and safety boundary', () => {
  const parsed = parseInputs({ contractValue: '100000', retainagePct: '10', paidToDate: '75000', daysOutstanding: '90', annualCarryingRatePct: '12' });
  const summary = summaryText({ projectName: 'Main Street remodel', result: computeAll(parsed.values) });
  assert.match(summary, /Main Street remodel/);
  assert.match(summary, /Retainage withheld: \$10000\.00/);
  assert.match(summary, /Retainage still unpaid: \$10000\.00/);
  assert.match(summary, /Total modeled cash outstanding: \$25739\.73/);
  assert.match(summary, /Not legal, tax, financial, or engineering advice/);
  assert.doesNotMatch(summary, /Hello /);
});

test('the page offers a compact cash-summary download', () => {
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /id="downloadSummary"/);
  assert.match(page, /summaryText\(/);
  assert.match(page, /retainage-cash-flow-summary\.txt/);
  assert.match(page, /retainage-cashflow:summary-downloads/);
});

test('the page restores drafts through decodeDraft, not a bare JSON.parse', () => {
  // The bug this guards: restoreDraft used to apply whatever parsed out of
  // local storage, so a stale or hand-edited draft was written over the working
  // defaults and submitted as an error state. Checked structurally because the
  // validation only helps if the page is the thing calling it.
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const restore = page.slice(page.indexOf('function restoreDraft()'), page.indexOf('$(\'form\').addEventListener'));
  assert.match(restore, /decodeDraft\(raw\)/);
  assert.doesNotMatch(restore, /JSON\.parse/);
});

test('cash-flow record creates a portable record with explicit assumptions', () => {
  const record = cashFlowRecordText({ projectName: 'Library remodel', invoiceReference: 'Pay app 4', dueDate: '2026-08-30', generatedDate: '2026-08-25', result: { retainageWithheld: 10000, earnedUnpaid: 25000, carryingCost: 739.73, totalCashOutstanding: 25739.73 } });
  assert.match(record, /Project: Library remodel/);
  assert.match(record, /Total modeled cash outstanding: \$25739\.73/);
  assert.match(record, /not a determination of interest/);
});

test('the page offers a downloadable cash-flow record', () => {
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /id="downloadRecord"/);
  assert.match(page, /cashFlowRecordText\(/);
  assert.match(page, /retainage-cash-flow-record\.txt/);
  assert.match(page, /retainage-cashflow:record-downloads/);
});
