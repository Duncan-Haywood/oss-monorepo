import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculateQuote() matches hand-computed arithmetic on the default booking', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.totalHeadcount, 5);
  // 1 bride * 225 + 4 full-service * 150
  close(r.serviceRevenue, 825);
  assert.equal(r.earlyStartApplies, true);
  close(r.earlyStartFeeCharged, 75);
  // 40 miles * $1.00/mile
  close(r.travelFeeCharged, 40);
  close(r.preMinimumSubtotal, 940);
  close(r.minimumShortfallFee, 0);
  assert.equal(r.belowHeadcountMinimum, false);
  assert.equal(r.belowRevenueMinimum, false);
  // bride: 60+30+10=100; 4 full-service: 4*(60+10)=280
  close(r.totalServiceMinutes, 380);
  close(r.capacityMinutes, 240);
  close(r.minutesShort, 140);
  assert.equal(r.additionalArtistsNeeded, 1);
  close(r.assistantChargeRevenue, 150);
  close(r.assistantPayoutCost, 125);
  close(r.assistantMarkup, 25);
  close(r.weddingDayServiceTotal, 1090);
  close(r.trialFeeCollected, 125);
  close(r.trialCreditApplied, 125);
  close(r.weddingDayBalanceDue, 965);
  close(r.totalContractValue, 1090);
  close(r.netAfterAssistantPayout, 965);
  close(r.effectiveRevenuePerPerson, 218);
});

// The structural point this venture exists to make: crediting the trial fee
// is a real discount on the combined total, not a neutral timing change.
test('crediting the trial fee lowers the total contract value by the trial fee, not just the balance due', () => {
  const credited = calculateQuote(DEFAULTS);
  const notCredited = calculateQuote({ ...DEFAULTS, creditTrialToBooking: 0 });
  close(notCredited.totalContractValue - credited.totalContractValue, DEFAULTS.trialFee);
  assert.ok(credited.weddingDayBalanceDue < notCredited.weddingDayBalanceDue);
  close(notCredited.weddingDayBalanceDue, notCredited.weddingDayServiceTotal);
  close(notCredited.trialCreditApplied, 0);
});

test('no trial requested collects nothing and credits nothing', () => {
  const r = calculateQuote({ ...DEFAULTS, trialRequested: 0 });
  close(r.trialFeeCollected, 0);
  close(r.trialCreditApplied, 0);
  close(r.totalContractValue, r.weddingDayServiceTotal);
});

test('a trial fee larger than the wedding-day total credits only up to the total, never past it', () => {
  const r = calculateQuote({
    ...DEFAULTS, fullServiceCount: 0, brideCount: 0, milesRoundTrip: 0, earlyStartFee: 0,
    startHour: 9, serviceMinimumRevenue: 0, trialFee: 5000,
  });
  close(r.weddingDayServiceTotal, 0);
  close(r.trialCreditApplied, 0);
  close(r.weddingDayBalanceDue, 0);
  close(r.totalContractValue, 5000);
});

test('starting at or after the threshold hour does not charge the early-start fee', () => {
  const atThreshold = calculateQuote({ ...DEFAULTS, startHour: 7 });
  const after = calculateQuote({ ...DEFAULTS, startHour: 9 });
  assert.equal(atThreshold.earlyStartApplies, false);
  close(atThreshold.earlyStartFeeCharged, 0);
  assert.equal(after.earlyStartApplies, false);
});

test('a booking below the dollar minimum is topped up to exactly the minimum', () => {
  const r = calculateQuote({
    ...DEFAULTS, brideCount: 0, fullServiceCount: 1, milesRoundTrip: 0, earlyStartFee: 0,
    startHour: 9, serviceMinimumRevenue: 500,
  });
  close(r.preMinimumSubtotal, 150);
  close(r.minimumShortfallFee, 350);
  assert.equal(r.belowRevenueMinimum, true);
  close(r.weddingDayServiceTotal - r.assistantChargeRevenue, 500);
});

test('a booking above the dollar minimum adds no shortfall fee', () => {
  const r = calculateQuote(DEFAULTS);
  assert.equal(r.belowRevenueMinimum, false);
  close(r.minimumShortfallFee, 0);
});

test('a small group is flagged below the headcount minimum, informationally', () => {
  const r = calculateQuote({ ...DEFAULTS, brideCount: 0, fullServiceCount: 2, serviceMinimumHeadcount: 3 });
  assert.equal(r.belowHeadcountMinimum, true);
  close(r.totalHeadcount, 2);
});

test('a booking that fits inside one artist\'s window needs no assistant', () => {
  const r = calculateQuote({ ...DEFAULTS, brideCount: 0, fullServiceCount: 1 });
  close(r.totalServiceMinutes, 70);
  close(r.capacityMinutes, 240);
  close(r.minutesShort, 0);
  assert.equal(r.additionalArtistsNeeded, 0);
  close(r.assistantChargeRevenue, 0);
  close(r.assistantPayoutCost, 0);
});

test('a large group needs more than one additional artist, rounded up', () => {
  const r = calculateQuote({ ...DEFAULTS, fullServiceCount: 14 });
  // bride 100 + 14 full-service * 70 = 1080; capacity 240; short 840; ceil(840/240)=4
  close(r.totalServiceMinutes, 1080);
  assert.equal(r.additionalArtistsNeeded, 4);
  close(r.assistantChargeRevenue, 600);
  close(r.assistantPayoutCost, 500);
});

test('booking a second artist up front reduces or removes the need to add one', () => {
  const oneArtist = calculateQuote(DEFAULTS);
  const twoArtists = calculateQuote({ ...DEFAULTS, artistsBooked: 2 });
  assert.equal(oneArtist.additionalArtistsNeeded, 1);
  assert.equal(twoArtists.additionalArtistsNeeded, 0);
  close(twoArtists.capacityMinutes, 480);
});

test('the assistant markup is what is billed minus what is paid out', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.assistantMarkup, r.assistantChargeRevenue - r.assistantPayoutCost);
});

test('effective revenue per person divides the total contract value by the whole headcount', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.effectiveRevenuePerPerson, r.totalContractValue / r.totalHeadcount);
});

test('effective revenue per person is null rather than dividing by zero on an empty booking', () => {
  const r = calculateQuote({
    ...DEFAULTS, brideCount: 0, fullServiceCount: 0, serviceMinimumRevenue: 0,
    milesRoundTrip: 0, earlyStartFee: 0, startHour: 9, trialRequested: 0,
  });
  assert.equal(r.totalHeadcount, 0);
  assert.equal(r.effectiveRevenuePerPerson, null);
});

test('net after assistant payout is the total contract value minus what assistants are paid', () => {
  const r = calculateQuote(DEFAULTS);
  close(r.netAfterAssistantPayout, r.totalContractValue - r.assistantPayoutCost);
});

test('every DEFAULTS key is validated rather than silently coerced', () => {
  for (const key of Object.keys(DEFAULTS)) {
    assert.throws(
      () => calculateQuote({ ...DEFAULTS, [key]: 'not a number' }),
      /must be a number/,
      `${key} accepted a non-numeric value`,
    );
    assert.throws(
      () => calculateQuote({ ...DEFAULTS, [key]: -1 }),
      /must be at least/,
      `${key} accepted a negative value`,
    );
  }
});

test('zero minutes per full service is rejected rather than dividing by zero in the capacity math', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, minutesPerFullService: 0 }), /greater than zero/);
});

test('zero prep window minutes is rejected rather than dividing by zero', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, prepWindowMinutes: 0 }), /greater than zero/);
});

test('zero artists booked is rejected — a booking always has at least a lead artist', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, artistsBooked: 0 }), /must be at least 1/);
});

test('a trial-requested flag above 1 is rejected', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, trialRequested: 2 }), /at most/);
});

test('a start hour past 24 is rejected', () => {
  assert.throws(() => calculateQuote({ ...DEFAULTS, startHour: 25 }), /at most/);
});

// Red-team guards (2026-10-15): the default booking has no travel surcharge
// and no makeup-only guests, so a sign flip on either term went unnoticed.
test('a travel surcharge adds to the subtotal and makeup-only guests add their time plus buffer', () => {
  const base = calculateQuote(DEFAULTS);
  const r = calculateQuote({ ...DEFAULTS, travelSurcharge: 20, makeupOnlyCount: 1 });
  close(r.preMinimumSubtotal - base.preMinimumSubtotal, 20 + DEFAULTS.makeupOnlyPrice);
  close(r.totalServiceMinutes - base.totalServiceMinutes,
    DEFAULTS.minutesPerMakeupOnly + DEFAULTS.bufferMinutesPerPerson);
});
