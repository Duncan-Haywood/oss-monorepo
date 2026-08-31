/** Deterministic deposit math. No network, no advice, no recommended percent. */

function number(value) {
  if (value === '' || value == null) return NaN;
  return Number(value);
}

export function parseInputs(raw) {
  const values = {
    currency: String(raw.currency || 'USD').trim() || 'USD',
    price: number(raw.price),
    depositPercent: number(raw.depositPercent),
    bookingsPerWeek: number(raw.bookingsPerWeek),
    bookingRate: number(raw.bookingRate),
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
  if (!Number.isFinite(values.noticeHours) || values.noticeHours < 0) {
    errors.push('Cancellation notice must be zero or greater.');
  }
  return { ok: errors.length === 0, errors, values };
}

export function plan(values) {
  const deposit = values.price * values.depositPercent / 100;
  const balance = values.price - deposit;
  const weeklyBookings = values.bookingsPerWeek * values.bookingRate / 100;
  return {
    deposit,
    balance,
    weeklyBookings,
    annualBookings: weeklyBookings * 52,
    annual: deposit * weeklyBookings * 52,
  };
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
