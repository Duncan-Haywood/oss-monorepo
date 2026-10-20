/** Deterministic deposit math. No network, no advice, no recommended percent. */

function number(value) {
  if (value === '' || value == null) return NaN;
  return Number(value);
}

// The no-show rates are the only inputs that carry a fallback rather than
// failing validation when they are absent. Every other field has been required
// since this tool shipped, and callers that predate the net-revenue model --
// `test/deposit.test.mjs`'s `defaults`, and any saved form state from before
// the two fields existed -- pass an object without them. Defaulting keeps
// those working and reproduces the old behaviour exactly: at 15% and 5% the
// deposit and balance figures are untouched, because they never depended on a
// no-show rate at all.
export const DEFAULT_NO_SHOW_WITHOUT = 15;
export const DEFAULT_NO_SHOW_WITH = 5;

function rate(value, fallback) {
  if (value === '' || value == null) return fallback;
  return Number(value);
}

export function parseInputs(raw) {
  const values = {
    currency: String(raw.currency || 'USD').trim() || 'USD',
    price: number(raw.price),
    depositPercent: number(raw.depositPercent),
    bookingsPerWeek: number(raw.bookingsPerWeek),
    bookingRate: number(raw.bookingRate),
    noShowWithout: rate(raw.noShowWithout, DEFAULT_NO_SHOW_WITHOUT),
    noShowWith: rate(raw.noShowWith, DEFAULT_NO_SHOW_WITH),
    noticeHours: number(raw.noticeHours),
    businessName: String(raw.businessName || '').trim(),
    serviceName: String(raw.serviceName || '').trim(),
  };
  const errors = [];
  if (!Number.isFinite(values.price) || !(values.price > 0)) {
    errors.push('Enter a service price greater than zero.');
  }
  if (!Number.isFinite(values.depositPercent) || values.depositPercent < 0 || values.depositPercent > 100) {
    errors.push('Deposit percentage must be between 0 and 100.');
  }
  if (!Number.isFinite(values.bookingsPerWeek) || values.bookingsPerWeek < 0) {
    errors.push('Bookings per week must be zero or greater.');
  }
  if (!Number.isFinite(values.bookingRate) || values.bookingRate < 0 || values.bookingRate > 100) {
    errors.push('Booking rate must be between 0 and 100.');
  }
  if (!Number.isFinite(values.noShowWithout) || values.noShowWithout < 0 || values.noShowWithout > 100) {
    errors.push('No-show rate without a deposit must be between 0 and 100.');
  }
  if (!Number.isFinite(values.noShowWith) || values.noShowWith < 0 || values.noShowWith > 100) {
    errors.push('No-show rate with a deposit must be between 0 and 100.');
  }
  if (!Number.isFinite(values.noticeHours) || values.noticeHours < 0) {
    errors.push('Cancellation notice must be zero or greater.');
  }
  return { ok: errors.length === 0, errors, values };
}

export function plan(values) {
  const deposit = values.price * values.depositPercent / 100;
  const balance = values.price - deposit;
  const weeklyBookings = values.bookingsPerWeek * values.bookingRate / 100;

  // Does requiring a deposit actually leave you with more money?
  //
  // "Secured cash" below (`annual`) cannot answer that, and reading it as
  // though it could is the mistake this block exists to stop. A deposit is
  // applied to the service total rather than added to it, so the deposits you
  // collect in a year are not new revenue -- they are a slice of revenue you
  // would have billed anyway, moved earlier. A business comparing "$21,762
  // secured" against nothing concludes a deposit is free money. It is not:
  // the deposit is paid for in bookings that never happen because a deposit
  // was asked for.
  //
  // The real trade has two sides, and the tool now models both:
  //
  //   cost     some prospects who would have booked do not (`bookingRate`)
  //   benefit  of those who do book, fewer fail to show (`noShowWith` vs
  //            `noShowWithout`), and the ones who still no-show forfeit a
  //            deposit instead of paying nothing
  //
  // Assumption, stated on the page as well as here: a missed appointment
  // earns nothing and the slot is not refilled. A business that reliably
  // refills short-notice cancellations has less to gain from a deposit than
  // this models, so the comparison is deliberately the optimistic-for-deposits
  // case being shown honestly rather than an estimate of refill rates the user
  // has no way to supply.
  const noShowWithout = rate(values.noShowWithout, DEFAULT_NO_SHOW_WITHOUT) / 100;
  const noShowWith = rate(values.noShowWith, DEFAULT_NO_SHOW_WITH) / 100;
  const annualBookingsToday = values.bookingsPerWeek * 52;
  const annualBookings = weeklyBookings * 52;

  const revenueWithoutDeposit = annualBookingsToday * (1 - noShowWithout) * values.price;
  // Each kept booking is worth the full price when it shows, and the forfeited
  // deposit when it does not.
  const valuePerKeptBooking = (1 - noShowWith) * values.price + noShowWith * deposit;
  const revenueWithDeposit = annualBookings * valuePerKeptBooking;
  const netChange = revenueWithDeposit - revenueWithoutDeposit;

  // The booking rate at which the two columns are equal: below it the deposit
  // costs more in lost bookings than it recovers in kept slots.
  //
  // Null when a kept booking is worth nothing at all (every booking no-shows
  // *and* the deposit is zero), which is the one case with no rate to solve
  // for rather than a rate outside 0-100.
  //
  // Above 100 is rarer than it looks, and the reason is worth writing down
  // because it is the tool's most useful finding. Whenever the deposit is
  // positive and the with-deposit no-show rate is no worse than today's,
  // break-even is necessarily at or below 100%: a deposit pays for itself at
  // full retention even with no change in behaviour at all, because the
  // no-shows that remain forfeit a deposit instead of paying nothing. So the
  // entire cost of a deposit policy is the bookings it turns away. The
  // above-100% branch is reachable only when the user expects a deposit to
  // make no-shows *worse* -- an unusual but enterable assumption, and one the
  // tool should answer honestly rather than clamp.
  const breakEvenBookingRate = valuePerKeptBooking > 0
    ? (1 - noShowWithout) * values.price / valuePerKeptBooking * 100
    : null;

  return {
    deposit,
    balance,
    weeklyBookings,
    annualBookings,
    // Left associated exactly as it was before the net-revenue model landed.
    // `deposit * annualBookings` is the same quantity but not the same double:
    // 37.5 * 11.16 * 52 is 21762, while 37.5 * (11.16 * 52) is not, and this
    // figure is displayed to the cent.
    annual: deposit * weeklyBookings * 52,
    revenueWithoutDeposit,
    revenueWithDeposit,
    netChange,
    breakEvenBookingRate,
  };
}

/**
 * The net-revenue result in words, including the break-even booking rate.
 *
 * Deliberately describes the arithmetic and stops. The tool has never
 * recommended a deposit percentage and does not start here: "these assumptions
 * produce X" is a statement about the numbers the user typed, while "a deposit
 * is worth it for you" would be a claim about a business this page knows
 * nothing else about.
 */
export function netEffectNote(values, modeled, money) {
  // A year's difference smaller than a single appointment is inside the noise
  // of the rates being estimated, so it is reported as a wash rather than as a
  // precise gain or loss the inputs cannot actually support.
  const sameThreshold = values.price;
  const direction = Math.abs(modeled.netChange) < sameThreshold
    ? `works out about the same as taking no deposit — within one appointment's price over a year`
    : modeled.netChange > 0
      ? `leaves about ${money(modeled.netChange)} more a year than taking no deposit`
      : `leaves about ${money(Math.abs(modeled.netChange))} less a year than taking no deposit`;

  const breakEven = modeled.breakEvenBookingRate == null
    ? 'With every booking no-showing and no deposit to forfeit, a deposit policy collects nothing at any booking rate.'
    : modeled.breakEvenBookingRate > 100
      ? `Even keeping every booking you get today, this deposit would not make up the revenue lost to the no-show rates you entered — the break-even booking rate is ${modeled.breakEvenBookingRate.toFixed(1)}%, which is above 100%.`
      : `Break-even is at a ${modeled.breakEvenBookingRate.toFixed(1)}% booking rate: keep more than that share of today's bookings and the deposit is ahead, keep less and it is behind.`;

  return `On these assumptions, requiring a ${values.depositPercent}% deposit ${direction}. ${breakEven} This compares full-price appointments that actually happen, plus forfeited deposits from those that do not, against your bookings today at your current no-show rate; it assumes a missed slot earns nothing and is not refilled.`;
}

export function comparisonNote(values, modeled, money) {
  return `At ${values.bookingRate}% of your current ${values.bookingsPerWeek} weekly bookings, this plan secures ${money(modeled.annual)} in deposits over a year. Deposits are applied to the service total, not added to it.`;
}

export function policyDraft(values, modeled, money) {
  const business = values.businessName || 'The business';
  const service = values.serviceName || 'appointment';
  return [
    `${business} booking deposit policy`,
    '',
    `A ${money(modeled.deposit)} deposit (${values.depositPercent}% of the ${money(values.price)} ${service} price) is required to reserve your appointment. The deposit is applied to the total; the remaining ${money(modeled.balance)} is due at the appointment.`,
    '',
    `Cancellations made at least ${values.noticeHours} hours before the appointment may have the deposit refunded or transferred, subject to our booking terms. Cancellations with less notice and no-shows may forfeit the deposit. Please contact us as soon as plans change.`,
    '',
    'Please review this draft against the rules for your location, industry, and payment provider before publishing it.',
  ].join('\n');
}
