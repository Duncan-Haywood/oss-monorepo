import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, quoteResult } from './calc.mjs';

const base = { travelMiles: 20, mileageRate: .7, travelMinutes: 30, hourlyRate: 60, appointmentMinutes: 45, minimumFee: 50, stateFees: 15, witnessFee: 25, witnesses: 1, afterHoursFee: 0, waitingMinutes: 0, waitingRate: 30 };

// The signing-service offer the print and offer-test fields exist for: a flat
// $85 for a 138-page refi package 45 miles away. Every figure a signing agent
// would actually type.
const signing = {
  ...base,
  travelMiles: 45, travelMinutes: 60, appointmentMinutes: 60, witnesses: 0,
  pagesPerSet: 138, printSets: 2, printChargePerPage: .20, printCostPerPage: .04,
  printMinutes: 30, vehicleCostPerMile: .30, offeredFee: 85,
};

const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: got ${actual}, want ${expected}`);

test('prices travel, time, fees, and witness', () => { const result = calculateQuote(base); assert.equal(result.travelCost, 14); assert.equal(result.travelTimeCost, 30); assert.equal(result.appointmentCost, 45); assert.equal(result.quote, 129); });
test('minimum protects a short appointment', () => { const result = calculateQuote({ ...base, travelMiles: 0, travelMinutes: 0, appointmentMinutes: 5, stateFees: 0, witnesses: 0, minimumFee: 75 }); assert.equal(result.minimumApplied, true); assert.equal(result.quote, 75); });
test('rejects negative or nonnumeric inputs', () => { assert.throws(() => calculateQuote({ ...base, travelMiles: -1 }), /Travel miles/); assert.throws(() => calculateQuote({ ...base, hourlyRate: 'nope' }), /Hourly rate/); });

test('a fractional witness count floors instead of pricing a partial witness', () => {
  const result = calculateQuote({ ...base, witnesses: 2.9 });
  assert.equal(result.witnessCost, 50);
});

test('a very large but finite trip still totals correctly', () => {
  const result = calculateQuote({ ...base, travelMiles: 5000, mileageRate: 1.25, hourlyRate: 500 });
  assert.equal(result.travelCost, 6250);
  assert.ok(Number.isFinite(result.quote));
});

// The page recalculates on every keystroke, and a `type="number"` input lets
// a visitor type a leading "-" even with `min="0"` set (the browser only
// enforces `min` on submit and the spinner buttons). Before quoteResult()
// existed, the page called calculateQuote() directly with nothing to catch
// the throw, so one stray "-" froze the total with no explanation on screen.
test('quoteResult never throws: an invalid figure comes back as a message, not an exception', () => {
  const bad = quoteResult({ ...base, travelMiles: -1 });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Travel miles/);
  assert.doesNotThrow(() => quoteResult({ ...base, hourlyRate: 'nope' }));
  assert.doesNotThrow(() => quoteResult({ ...base, witnesses: Infinity }));
});

test('quoteResult mirrors calculateQuote on valid input', () => {
  const good = quoteResult(base);
  assert.equal(good.ok, true);
  assert.equal(good.quote, 129);
});

// --------------------------------------------------------------- printing

test('the print fields are neutral until pages are entered, so the published worked example still holds', () => {
  // The guide page quotes $129 from the default form state. Every field added
  // for printing and the offer test has to leave that untouched, including the
  // ones whose HTML default is non-zero (printSets, and the two per-page
  // rates) -- they multiply against zero pages.
  const withDefaults = calculateQuote({
    ...base, pagesPerSet: 0, printSets: 2, printChargePerPage: .20,
    printCostPerPage: .04, printMinutes: 0, vehicleCostPerMile: 0, offeredFee: 0,
  });
  assert.equal(withDefaults.quote, 129);
  assert.equal(withDefaults.printedPages, 0);
  assert.equal(withDefaults.printCharge, 0);
  assert.equal(withDefaults.outOfPocket, 0);
});

test('pages are multiplied by sets, and billed and costed at their own separate rates', () => {
  const result = calculateQuote(signing);
  assert.equal(result.printedPages, 276, 'a 138-page package printed twice is 276 sheets');
  near(result.printCharge, 55.2, 'print charge');
  near(result.printCost, 11.04, 'print cost');
  // The charge is revenue and belongs in the quote; the cost is not and must
  // not be. Confusing the two is the whole reason they are separate fields.
  near(result.quote, 221.7, 'quote');
  assert.ok(!Object.keys(result).some((k) => k === 'printNet'), 'the two print figures stay separate');
});

test('a fractional set count floors instead of printing part of a package', () => {
  const result = calculateQuote({ ...signing, printSets: 2.8 });
  assert.equal(result.printedPages, 276);
});

test('print minutes are counted as time occupied but never billed twice', () => {
  const withPrintTime = calculateQuote(signing);
  const withoutPrintTime = calculateQuote({ ...signing, printMinutes: 0 });
  // Same quote: the per-page charge is what pays for printing.
  near(withPrintTime.quote, withoutPrintTime.quote, 'quote must not move with print minutes');
  // Different engaged time: those minutes are still gone.
  assert.equal(withPrintTime.engagedMinutes - withoutPrintTime.engagedMinutes, 30);
});

// ------------------------------------------------------------- offer test

test('an offer is measured against out-of-pocket cost and every hour the job occupies', () => {
  const result = calculateQuote(signing);
  assert.equal(result.offerEvaluated, true);
  near(result.vehicleCost, 13.5, 'vehicle cost');
  near(result.outOfPocket, 24.54, 'out of pocket');
  assert.equal(result.engagedMinutes, 150, 'drive 60 + appointment 60 + print 30');
  near(result.netAfterCosts, 60.46, 'net after costs');
  // The headline finding: $85 is $24.18 an hour, not $85.
  near(result.effectiveHourly, 24.184, 'effective hourly');
  near(result.offerGap, -136.7, 'offer gap against the notary\'s own quote');
});

test('with no offer on the table the test runs against the notary\'s own quote', () => {
  // A visitor who has not been offered anything leaves the field at zero. If
  // zero were treated as an offer, every such visitor would be shown a
  // guaranteed loss instead of what their own quote is worth per hour.
  const result = calculateQuote({ ...signing, offeredFee: 0 });
  assert.equal(result.offerEvaluated, false);
  assert.equal(result.offerGap, null);
  near(result.feeUnderTest, result.quote, 'the quote stands in for the offer');
  near(result.effectiveHourly, (221.7 - 24.54) / 2.5, 'effective hourly on the notary\'s own price');
});

test('the walk-away fee is the point where the job stops costing cash', () => {
  const result = calculateQuote(signing);
  near(result.walkAwayFee, 24.54, 'walk-away fee');
  // Solved back rather than re-derived: accepting exactly the walk-away fee
  // has to land on exactly zero an hour. Re-computing the formula in the test
  // would not catch a walk-away figure that does not break even.
  const atWalkAway = calculateQuote({ ...signing, offeredFee: result.walkAwayFee });
  near(atWalkAway.effectiveHourly, 0, 'effective hourly at the walk-away fee');
});

test('the target fee is the one that pays the entered rate for every minute', () => {
  const result = calculateQuote(signing);
  near(result.feeForTargetHourly, 174.54, 'fee for target hourly');
  // Same solve-back: feeding it in must land on exactly the hourly rate.
  const atTarget = calculateQuote({ ...signing, offeredFee: result.feeForTargetHourly });
  near(atTarget.effectiveHourly, 60, 'effective hourly at the target fee');
});

test('waiting is valued at the waiting rate in the target fee, matching how the quote prices it', () => {
  // Valuing waiting at the hourly rate here while the quote bills it at the
  // waiting rate would make the two figures disagree without either being
  // wrong on its own.
  const result = calculateQuote({ ...signing, waitingMinutes: 60, waitingRate: 30 });
  near(result.feeForTargetHourly, 174.54 + 30, 'an hour of waiting adds the waiting rate, not the hourly rate');
});

test('effective hourly is null, not zero, when no time has been entered', () => {
  const result = calculateQuote({
    ...base, travelMinutes: 0, appointmentMinutes: 0, waitingMinutes: 0, printMinutes: 0, offeredFee: 100,
  });
  assert.equal(result.engagedHours, 0);
  assert.equal(result.effectiveHourly, null, 'a fee per zero hours is undefined, not zero an hour');
});

test('the new fields are validated like every other figure', () => {
  assert.throws(() => calculateQuote({ ...base, pagesPerSet: -1 }), /Pages per set/);
  assert.throws(() => calculateQuote({ ...base, printCostPerPage: 'nope' }), /Print cost per page/);
  assert.throws(() => calculateQuote({ ...base, offeredFee: -5 }), /Offered fee/);
  assert.throws(() => calculateQuote({ ...base, vehicleCostPerMile: -0.1 }), /Vehicle cost per mile/);
});
