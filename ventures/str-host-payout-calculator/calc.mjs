// Host-payout arithmetic for one stay listed on Airbnb, Vrbo, or a direct
// site. No network, no stored fee schedule: every rate is an input. The
// presets below are 2026 starting points a host is expected to replace with
// the numbers on their own payout statement. The output is transparent
// arithmetic they can check, not a claim about any platform's current fees.

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rate = (value) => num(value) / 100;

/**
 * Illustrative 2026 starting points. Fee *bases* differ in ways a flat
 * "Airbnb takes 15%" vs "Vrbo takes 8%" comparison hides:
 *
 *   - Airbnb's host service fee is a percentage of the booking subtotal
 *     (nights + cleaning + extras). Payment processing is bundled. Occupancy
 *     tax and refundable deposits are usually excluded.
 *   - Airbnb's legacy split-fee model charged the host ~3% and added a
 *     separate guest service fee at checkout. Most hosts were migrated off
 *     it in 2025–2026; it stays here so a host can see what the 15.5%
 *     host-only cut actually changed.
 *   - Vrbo's pay-per-booking commission is 5% of the same subtotal, plus a
 *     3% payment-processing fee on the *guest payment* (subtotal + tax +
 *     deposit). Those two percentages are not on the same base.
 *   - Vrbo's annual subscription (renewals only in 2026) drops the 5%
 *     commission and still charges processing. The subscription only makes
 *     sense amortised over the bookings it actually carries.
 *   - Direct booking has no marketplace commission — only card processing
 *     and the site/PMS cost — but it does not include the guests. The
 *     honest comparison is the fee gap against the occupancy you keep.
 */
export const CHANNEL_PRESETS = [
  {
    id: "airbnb-host-only",
    label: "Airbnb (host-only)",
    note: "Standard 2026 model for most hosts: one host service fee, guest sees no Airbnb service fee. Processing is bundled. Starting rate 15.5% (16% in some markets; EU hosts also owe VAT on the fee).",
    hostFeeRate: 15.5,
    guestFeeRate: 0,
    processingRate: 0,
    processingFixed: 0,
    processingOnGuestPayment: false,
    annualFee: 0,
    monthlyFee: 0,
    occupancyKeep: 100,
  },
  {
    id: "airbnb-split",
    label: "Airbnb (legacy split)",
    note: "The pre-migration model: host ~3%, guest ~14.1% at checkout. Being retired through 2026. Keep it on to see what the 15.5% cut changed in payout *and* in the price the guest sees. It cannot win the ranking — most hosts can no longer choose it.",
    hostFeeRate: 3,
    guestFeeRate: 14.1,
    processingRate: 0,
    processingFixed: 0,
    processingOnGuestPayment: false,
    annualFee: 0,
    monthlyFee: 0,
    occupancyKeep: 100,
    referenceOnly: true,
  },
  {
    id: "vrbo-pay-per-booking",
    label: "Vrbo (pay-per-booking)",
    note: "Vrbo's current default for new hosts: 5% commission on the rental + mandatory fees, plus 3% processing on the guest payment including tax and deposits. Guests also pay a separate Vrbo service fee that you do not receive.",
    hostFeeRate: 5,
    guestFeeRate: 10,
    processingRate: 3,
    processingFixed: 0,
    processingOnGuestPayment: true,
    annualFee: 0,
    monthlyFee: 0,
    occupancyKeep: 100,
  },
  {
    id: "vrbo-subscription",
    label: "Vrbo (annual subscription)",
    note: "Legacy plan, renewals only in 2026: no 5% commission, still 3% processing. Enter what you actually pay per listing per year — historically $499–$699.",
    hostFeeRate: 0,
    guestFeeRate: 10,
    processingRate: 3,
    processingFixed: 0,
    processingOnGuestPayment: true,
    annualFee: 599,
    monthlyFee: 0,
    occupancyKeep: 100,
  },
  {
    id: "direct",
    label: "Direct booking",
    note: "No marketplace commission. Card processing (Stripe-like default 2.9% + $0.30) plus the website or channel-manager cost, spread over the bookings you actually keep after leaving the marketplace.",
    hostFeeRate: 0,
    guestFeeRate: 0,
    processingRate: 2.9,
    processingFixed: 0.3,
    processingOnGuestPayment: false,
    annualFee: 0,
    monthlyFee: 29,
    occupancyKeep: 70,
  },
];

export function bookingFrom(input = {}) {
  const nightlyRate = num(input.nightlyRate);
  const nights = num(input.nights);
  const cleaningFee = num(input.cleaningFee);
  const extraFees = num(input.extraFees);
  const taxRate = num(input.taxRate);
  const securityDeposit = num(input.securityDeposit);
  const bookingsPerYear = num(input.bookingsPerYear);

  if (nightlyRate < 0 || nights <= 0) {
    return { error: "Enter a nightly rate and at least one night." };
  }
  if (cleaningFee < 0 || extraFees < 0 || taxRate < 0 || securityDeposit < 0) {
    return { error: "Fees, tax, and deposit cannot be negative." };
  }
  if (bookingsPerYear < 0) {
    return { error: "Bookings per year cannot be negative." };
  }

  const lodging = nightlyRate * nights;
  const subtotal = lodging + cleaningFee + extraFees;
  const tax = subtotal * rate(taxRate);
  return {
    nightlyRate,
    nights,
    cleaningFee,
    extraFees,
    taxRate,
    securityDeposit,
    bookingsPerYear,
    lodging,
    subtotal,
    tax,
    guestPaymentBeforePlatform: subtotal + tax + securityDeposit,
  };
}

export function calculateChannel(channel = {}, booking = {}) {
  if (booking.error) return { error: booking.error };

  const hostFeeRate = num(channel.hostFeeRate);
  const guestFeeRate = num(channel.guestFeeRate);
  const processingRate = num(channel.processingRate);
  const processingFixed = num(channel.processingFixed);
  const annualFee = num(channel.annualFee);
  const monthlyFee = num(channel.monthlyFee);
  const occupancyKeep = num(channel.occupancyKeep);
  const bookingsPerYear = num(booking.bookingsPerYear);

  if ([hostFeeRate, guestFeeRate, processingRate, occupancyKeep].some((value) => value < 0)) {
    return { error: "Rates cannot be negative." };
  }
  if (occupancyKeep > 100) {
    return { error: "Occupancy kept cannot exceed 100%." };
  }

  const hostFee = booking.subtotal * rate(hostFeeRate);
  const guestFee = booking.subtotal * rate(guestFeeRate);
  const processingBase = channel.processingOnGuestPayment
    ? booking.guestPaymentBeforePlatform
    : booking.subtotal;
  const processing = processingBase * rate(processingRate) + processingFixed;
  const feeTotal = hostFee + processing;
  const payoutPerStay = booking.subtotal - feeTotal;

  const keptBookings = bookingsPerYear * (occupancyKeep / 100);
  const siteCostAnnual = annualFee + monthlyFee * 12;
  const siteCostPerStay = keptBookings > 0 ? siteCostAnnual / keptBookings : siteCostAnnual;
  const payoutAfterSite = payoutPerStay - (keptBookings > 0 ? siteCostPerStay : 0);
  const annualPayout = keptBookings > 0
    ? payoutPerStay * keptBookings - siteCostAnnual
    : -siteCostAnnual;

  const guestPays = booking.subtotal + guestFee + booking.tax;
  const effectiveHostFeeRate = booking.subtotal > 0
    ? ((feeTotal + (keptBookings > 0 ? siteCostPerStay : 0)) / booking.subtotal) * 100
    : 0;

  return {
    id: channel.id,
    label: channel.label,
    note: channel.note,
    enabled: channel.enabled !== false,
    hostFee,
    guestFee,
    processing,
    feeTotal,
    siteCostPerStay: keptBookings > 0 ? siteCostPerStay : siteCostAnnual,
    siteCostAnnual,
    payoutPerStay,
    payoutAfterSite,
    annualPayout,
    keptBookings,
    guestPays,
    effectiveHostFeeRate,
    occupancyKeep,
    hostFeeRate,
    guestFeeRate,
    referenceOnly: channel.referenceOnly === true,
  };
}

/**
 * Nightly (and cleaning/extras, in proportion) a host must list under a
 * new host-fee rate to keep the same payout they had under an old rate.
 * This is the 2026 migration question: "I used to pay 3%. What do I list
 * now at 15.5% so the deposit does not shrink?"
 *
 * Host fee is a share of the *listed* subtotal, so
 *   newSubtotal × (1 − newRate) = oldSubtotal × (1 − oldRate)
 *   newSubtotal = oldSubtotal × (1 − oldRate) / (1 − newRate)
 */
export function restoreListedSubtotal(oldSubtotal, oldHostRate, newHostRate) {
  const oldTake = 1 - rate(oldHostRate);
  const newTake = 1 - rate(newHostRate);
  if (oldSubtotal < 0) return { error: "Subtotal cannot be negative." };
  if (newTake <= 0) return { error: "The new host fee must be under 100%." };
  const newSubtotal = oldSubtotal * oldTake / newTake;
  const raisePct = oldSubtotal > 0 ? (newSubtotal / oldSubtotal - 1) * 100 : 0;
  return {
    oldPayout: oldSubtotal * oldTake,
    newSubtotal,
    raisePct,
    newPayout: newSubtotal * newTake,
  };
}

/**
 * Bookings a direct channel needs, after its own per-stay processing, to
 * match another channel's annual payout once the site/PMS cost is paid.
 *
 * The target can itself be negative — a marketplace channel with a large
 * fixed fee (an annual subscription, say) and few bookings can lose money
 * for the year, and a host can toggle every other channel off, leaving that
 * loser as "the best" comparison. Solving the raw ratio in that case can
 * return a negative booking count: direct's payout at zero bookings is
 * already -siteCostAnnual, which can already beat a negative target without
 * a single stay. A negative "bookings needed" is not a real answer, so that
 * case is zero bookings, not the unclamped ratio.
 */
export function directBreakEvenBookings(targetAnnual, payoutPerStay, siteCostAnnual) {
  if (payoutPerStay <= 0) return null;
  const target = num(targetAnnual);
  const cost = num(siteCostAnnual);
  if (-cost >= target) return 0;
  return (target + cost) / payoutPerStay;
}

/**
 * The listing a host must publish for one channel to leave a target payout
 * per stay -- the question hosts actually ask ("I want $400 a stay; what do
 * I list?"), which the forward calculation only answers by trial and error.
 *
 * Payout is linear in the subtotal S, so it inverts exactly. With processing
 * on the subtotal:        payout = S(1 - h - p) - fixed
 * with processing on the guest payment (S + tax + deposit, tax = t*S):
 *                         payout = S(1 - h - p(1 + t)) - p*deposit - fixed
 * The nightly rate is what is left of S after cleaning and other fees.
 * Returns null when the fee rates leave nothing to scale (100% or more).
 */
export function listingForPayout(channel = {}, booking = {}, targetPayout = 0) {
  if (booking.error) return { error: booking.error };
  const target = num(targetPayout);
  if (target < 0) return { error: "Target payout cannot be negative." };

  const h = rate(channel.hostFeeRate);
  const p = rate(channel.processingRate);
  const fixed = num(channel.processingFixed);
  const onGuest = channel.processingOnGuestPayment === true;
  const t = rate(booking.taxRate);
  const deposit = onGuest ? num(booking.securityDeposit) : 0;

  const keep = 1 - h - (onGuest ? p * (1 + t) : p);
  if (keep <= 0) return null;

  const subtotal = (target + fixed + p * deposit * (onGuest ? 1 : 0)) / keep;
  const nightlyRate = (subtotal - num(booking.cleaningFee) - num(booking.extraFees)) / booking.nights;
  return {
    subtotal,
    nightlyRate,
    belowZero: nightlyRate < 0,
    guestPays: subtotal * (1 + rate(channel.guestFeeRate) + t),
  };
}

export function compareChannels(input = {}, channels = CHANNEL_PRESETS) {
  const booking = bookingFrom(input);
  if (booking.error) return { error: booking.error, booking, channels: [] };

  const results = channels.map((channel) => ({
    ...calculateChannel(channel, booking),
    enabled: channel.enabled !== false,
  }));
  if (results.some((result) => result.error)) {
    return { error: results.find((result) => result.error).error, booking, channels: results };
  }

  const ranked = results
    .filter((result) => result.enabled && !result.referenceOnly)
    .slice()
    .sort((a, b) => b.annualPayout - a.annualPayout);
  const best = ranked[0] || null;
  for (const result of results) {
    result.isBest = Boolean(best && result.enabled && result.id === best.id);
  }

  const airbnbHostOnly = results.find((result) => result.id === "airbnb-host-only");
  const airbnbSplit = results.find((result) => result.id === "airbnb-split");
  const restore = airbnbHostOnly && airbnbSplit
    ? restoreListedSubtotal(
      booking.subtotal,
      airbnbSplit.hostFeeRate,
      airbnbHostOnly.hostFeeRate,
    )
    : null;

  const restoredGuestPays = restore && !restore.error && airbnbHostOnly
    ? restore.newSubtotal * (1 + rate(airbnbHostOnly.guestFeeRate)) + booking.tax
    : null;
  const legacyGuestPays = airbnbSplit ? airbnbSplit.guestPays : null;

  const direct = results.find((result) => result.id === "direct");
  const marketplaceBest = ranked.find((result) => result.id !== "direct") || null;
  const breakEven = direct && marketplaceBest
    ? directBreakEvenBookings(
      marketplaceBest.annualPayout,
      direct.payoutPerStay,
      direct.siteCostAnnual,
    )
    : null;
  const breakEvenKeepPct = breakEven != null && booking.bookingsPerYear > 0
    ? (breakEven / booking.bookingsPerYear) * 100
    : null;

  const targetPayout = num(input.targetPayout);
  if (targetPayout > 0) {
    for (const result of results) {
      const channel = channels.find((c) => c.id === result.id);
      result.listing = listingForPayout(channel, booking, targetPayout);
    }
  }

  return {
    booking,
    channels: results,
    best,
    restore: restore && !restore.error
      ? {
        ...restore,
        restoredGuestPays,
        legacyGuestPays,
        guestDelta: restoredGuestPays != null && legacyGuestPays != null
          ? restoredGuestPays - legacyGuestPays
          : null,
      }
      : restore,
    directBreakEven: breakEven == null ? null : {
      bookings: breakEven,
      occupancyKeep: breakEvenKeepPct,
      vs: marketplaceBest?.label ?? null,
    },
  };
}
