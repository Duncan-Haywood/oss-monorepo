// Pure arithmetic for a mobile bridal hair & makeup artist (or team) pricing
// one wedding-day booking. No network, no state: every price, fee, minute,
// and count is an input, so the total stays a calculation the artist can
// check against their own contract rather than a claim about what any
// wedding "should" cost.
//
// Two things a flat per-person rate sheet usually misses, and both change
// the answer this calculator gives:
//
//   **Crediting a trial fee toward the wedding day is a real discount, even
//   though it rarely gets counted as one.** "Book with us and your trial fee
//   comes off your wedding day total" reads as goodwill, but it reduces the
//   combined amount collected across both bookings by up to the trial fee —
//   the same booking is worth less to the artist than the identical booking
//   without that policy. This calculator reports the total contract value
//   both ways, so the discount is a number an artist decided on rather than
//   one that fell out of a rate card nobody added up.
//
//   **Group size is a scheduling problem before it is a pricing problem.**
//   One artist can only do so many full "hair + makeup" looks between
//   arrival and the moment the bride has to be dressed. A booking that fits
//   the calendar on paper can still be physically impossible for one person
//   to finish on time — and the fix (a second artist) is a real cost, and
//   usually a real line item billed to the client, not something a rate
//   sheet with one row per service can show.

function number(value, name, { min = 0, allowZero = true, max = null } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  if (max !== null && result > max) throw new Error(`${name} must be at most ${max}`);
  return result;
}

export const DEFAULTS = {
  bridePrice: 225,
  brideCount: 1,
  fullServicePrice: 150,
  fullServiceCount: 4,
  hairOnlyPrice: 85,
  hairOnlyCount: 0,
  makeupOnlyPrice: 95,
  makeupOnlyCount: 0,
  kidsPrice: 55,
  kidsCount: 0,
  trialFee: 125,
  trialRequested: 1,
  creditTrialToBooking: 1,
  startHour: 6,
  earlyStartThresholdHour: 7,
  earlyStartFee: 75,
  milesRoundTrip: 40,
  travelRatePerMile: 1,
  travelSurcharge: 0,
  serviceMinimumRevenue: 500,
  serviceMinimumHeadcount: 3,
  minutesPerFullService: 60,
  minutesPerHairOnly: 40,
  minutesPerMakeupOnly: 45,
  minutesPerKid: 20,
  brideExtraMinutes: 30,
  bufferMinutesPerPerson: 10,
  prepWindowMinutes: 240,
  artistsBooked: 1,
  assistantChargeToClient: 150,
  assistantPayout: 125,
};

/**
 * Price and schedule one wedding-day booking.
 *
 * @param {object} input
 * @param {number} input.bridePrice              The bride's own hair + makeup, priced above the bridal-party rate for the extra time and detail a bride's look usually takes.
 * @param {number} input.brideCount              Almost always 1; 0 if this booking is bridal-party only.
 * @param {number} input.fullServicePrice        Hair + makeup combined, for a bridesmaid, mother, or other bridal-party member.
 * @param {number} input.fullServiceCount        People taking the combined service, not counting the bride.
 * @param {number} input.hairOnlyPrice           Hair styling alone.
 * @param {number} input.hairOnlyCount           People taking hair only.
 * @param {number} input.makeupOnlyPrice         Makeup application alone.
 * @param {number} input.makeupOnlyCount         People taking makeup only.
 * @param {number} input.kidsPrice               Flower girl / junior bridesmaid simple style.
 * @param {number} input.kidsCount               Children serviced.
 * @param {number} input.trialFee                What a trial run costs, charged separately from the wedding day.
 * @param {number} input.trialRequested          1 if a trial is part of this booking, 0 if not.
 * @param {number} input.creditTrialToBooking    1 to credit the trial fee against the wedding-day balance, 0 to charge both in full.
 * @param {number} input.startHour               Arrival time on a 24-hour clock (6.5 = 6:30am).
 * @param {number} input.earlyStartThresholdHour Below this arrival hour, the early-start fee applies.
 * @param {number} input.earlyStartFee           Flat surcharge for an arrival before the threshold.
 * @param {number} input.milesRoundTrip          Round-trip driving miles to the venue or getting-ready location.
 * @param {number} input.travelRatePerMile       What is billed to the client per mile.
 * @param {number} input.travelSurcharge         Flat parking, toll, or ferry cost on top of mileage.
 * @param {number} input.serviceMinimumRevenue   The lowest dollar total this booking is accepted for, regardless of headcount.
 * @param {number} input.serviceMinimumHeadcount The headcount below which the booking is flagged as under the artist's usual minimum, informationally.
 * @param {number} input.minutesPerFullService   Minutes to complete one hair + makeup look.
 * @param {number} input.minutesPerHairOnly      Minutes to complete hair alone.
 * @param {number} input.minutesPerMakeupOnly    Minutes to complete makeup alone.
 * @param {number} input.minutesPerKid           Minutes to complete a child's simple style.
 * @param {number} input.brideExtraMinutes       Extra minutes on top of a full service for the bride's own look.
 * @param {number} input.bufferMinutesPerPerson  Setup, product change, and transition time added after every person.
 * @param {number} input.prepWindowMinutes       Minutes available from arrival to the must-be-ready deadline, per artist working in parallel.
 * @param {number} input.artistsBooked           Artists already committed to this booking (the lead, plus any assistant already hired).
 * @param {number} input.assistantChargeToClient What is billed to the client for each additional artist the schedule requires.
 * @param {number} input.assistantPayout         What is paid out to each additional artist hired.
 */
export function calculateQuote(input) {
  const bridePrice = number(input.bridePrice, 'Bride price');
  const brideCount = number(input.brideCount, 'Bride count');
  const fullServicePrice = number(input.fullServicePrice, 'Full-service price');
  const fullServiceCount = number(input.fullServiceCount, 'Full-service count');
  const hairOnlyPrice = number(input.hairOnlyPrice, 'Hair-only price');
  const hairOnlyCount = number(input.hairOnlyCount, 'Hair-only count');
  const makeupOnlyPrice = number(input.makeupOnlyPrice, 'Makeup-only price');
  const makeupOnlyCount = number(input.makeupOnlyCount, 'Makeup-only count');
  const kidsPrice = number(input.kidsPrice, 'Kids price');
  const kidsCount = number(input.kidsCount, 'Kids count');
  const trialFee = number(input.trialFee, 'Trial fee');
  const trialRequested = number(input.trialRequested, 'Trial requested', { max: 1 });
  const creditTrialToBooking = number(input.creditTrialToBooking, 'Credit trial to booking', { max: 1 });
  const startHour = number(input.startHour, 'Start hour', { max: 24 });
  const earlyStartThresholdHour = number(input.earlyStartThresholdHour, 'Early-start threshold hour', { max: 24 });
  const earlyStartFee = number(input.earlyStartFee, 'Early-start fee');
  const milesRoundTrip = number(input.milesRoundTrip, 'Round-trip miles');
  const travelRatePerMile = number(input.travelRatePerMile, 'Travel rate per mile');
  const travelSurcharge = number(input.travelSurcharge, 'Travel surcharge');
  const serviceMinimumRevenue = number(input.serviceMinimumRevenue, 'Service minimum revenue');
  const serviceMinimumHeadcount = number(input.serviceMinimumHeadcount, 'Service minimum headcount');
  const minutesPerFullService = number(input.minutesPerFullService, 'Minutes per full service', { allowZero: false });
  const minutesPerHairOnly = number(input.minutesPerHairOnly, 'Minutes per hair only');
  const minutesPerMakeupOnly = number(input.minutesPerMakeupOnly, 'Minutes per makeup only');
  const minutesPerKid = number(input.minutesPerKid, 'Minutes per kid');
  const brideExtraMinutes = number(input.brideExtraMinutes, 'Bride extra minutes');
  const bufferMinutesPerPerson = number(input.bufferMinutesPerPerson, 'Buffer minutes per person');
  const prepWindowMinutes = number(input.prepWindowMinutes, 'Prep window minutes', { allowZero: false });
  const artistsBooked = number(input.artistsBooked, 'Artists booked', { min: 1 });
  const assistantChargeToClient = number(input.assistantChargeToClient, 'Assistant charge to client');
  const assistantPayout = number(input.assistantPayout, 'Assistant payout');

  const totalHeadcount = brideCount + fullServiceCount + hairOnlyCount + makeupOnlyCount + kidsCount;

  const serviceRevenue = brideCount * bridePrice
    + fullServiceCount * fullServicePrice
    + hairOnlyCount * hairOnlyPrice
    + makeupOnlyCount * makeupOnlyPrice
    + kidsCount * kidsPrice;

  const earlyStartApplies = startHour < earlyStartThresholdHour;
  const earlyStartFeeCharged = earlyStartApplies ? earlyStartFee : 0;

  const travelFeeCharged = milesRoundTrip * travelRatePerMile;

  const preMinimumSubtotal = serviceRevenue + earlyStartFeeCharged + travelFeeCharged + travelSurcharge;
  const minimumShortfallFee = Math.max(0, serviceMinimumRevenue - preMinimumSubtotal);
  const belowHeadcountMinimum = totalHeadcount < serviceMinimumHeadcount;
  const belowRevenueMinimum = minimumShortfallFee > 0;

  // The scheduling question: can the artists booked finish everyone between
  // arrival and the must-be-ready deadline? The bride gets extra time on top
  // of a full service; everyone gets a buffer for setup and product changes.
  const totalServiceMinutes = brideCount * (minutesPerFullService + brideExtraMinutes + bufferMinutesPerPerson)
    + fullServiceCount * (minutesPerFullService + bufferMinutesPerPerson)
    + hairOnlyCount * (minutesPerHairOnly + bufferMinutesPerPerson)
    + makeupOnlyCount * (minutesPerMakeupOnly + bufferMinutesPerPerson)
    + kidsCount * (minutesPerKid + bufferMinutesPerPerson);

  const capacityMinutes = prepWindowMinutes * artistsBooked;
  const minutesShort = Math.max(0, totalServiceMinutes - capacityMinutes);
  const additionalArtistsNeeded = minutesShort > 0 ? Math.ceil(minutesShort / prepWindowMinutes) : 0;

  const assistantChargeRevenue = additionalArtistsNeeded * assistantChargeToClient;
  const assistantPayoutCost = additionalArtistsNeeded * assistantPayout;
  const assistantMarkup = assistantChargeRevenue - assistantPayoutCost;

  const weddingDayServiceTotal = preMinimumSubtotal + minimumShortfallFee + assistantChargeRevenue;

  const trialFeeCollected = trialRequested > 0 ? trialFee : 0;
  const trialCreditApplied = (trialRequested > 0 && creditTrialToBooking > 0)
    ? Math.min(trialFee, weddingDayServiceTotal)
    : 0;
  const weddingDayBalanceDue = weddingDayServiceTotal - trialCreditApplied;
  const totalContractValue = weddingDayServiceTotal + trialFeeCollected - trialCreditApplied;

  const netAfterAssistantPayout = totalContractValue - assistantPayoutCost;
  const effectiveRevenuePerPerson = totalHeadcount > 0 ? totalContractValue / totalHeadcount : null;

  return {
    totalHeadcount,
    serviceRevenue,
    earlyStartApplies,
    earlyStartFeeCharged,
    travelFeeCharged,
    preMinimumSubtotal,
    minimumShortfallFee,
    belowHeadcountMinimum,
    belowRevenueMinimum,
    totalServiceMinutes,
    capacityMinutes,
    minutesShort,
    additionalArtistsNeeded,
    assistantChargeRevenue,
    assistantPayoutCost,
    assistantMarkup,
    weddingDayServiceTotal,
    trialFeeCollected,
    trialCreditApplied,
    weddingDayBalanceDue,
    totalContractValue,
    netAfterAssistantPayout,
    effectiveRevenuePerPerson,
  };
}
