/**
 * Deterministic tattoo deposit and touch-up pricing math. No network, no advice,
 * no recommended percent or fee.
 *
 * This is not the same question `calc.mjs` answers. That module compares a
 * recurring-appointment business's annual revenue with and without a deposit
 * policy. A tattoo shop's actual moment of friction is different: a specific
 * client, done with a specific session, asking "is my touch-up still free, and
 * if not, what does it cost?" There is no annual booking volume in that
 * question, and forcing it through the recurring-appointment model would ask
 * for inputs (bookings per week, a booking-rate assumption) that do not exist
 * for a one-off piece. So this module models the single-client decision
 * instead: a deposit on the original session, plus whether today's date falls
 * inside the shop's free touch-up window and what the touch-up costs if not.
 */

function number(value) {
  if (value === '' || value == null) return NaN;
  return Number(value);
}

export const PRICING_MODES = Object.freeze(['percent', 'flat', 'hourly']);

export function parseInputs(raw) {
  const mode = PRICING_MODES.includes(raw.pricingMode) ? raw.pricingMode : 'percent';
  const values = {
    currency: String(raw.currency || 'USD').trim() || 'USD',
    price: number(raw.price),
    depositPercent: number(raw.depositPercent),
    freeWindowMonths: number(raw.freeWindowMonths),
    monthsSinceSession: number(raw.monthsSinceSession),
    pricingMode: mode,
    touchupPercent: number(raw.touchupPercent),
    touchupFlat: number(raw.touchupFlat),
    hourlyRate: number(raw.hourlyRate),
    touchupHours: number(raw.touchupHours),
    businessName: String(raw.businessName || '').trim(),
    artistName: String(raw.artistName || '').trim(),
  };
  const errors = [];
  if (!Number.isFinite(values.price) || !(values.price > 0)) {
    errors.push('Enter an original session price greater than zero.');
  }
  if (!Number.isFinite(values.depositPercent) || values.depositPercent < 0 || values.depositPercent > 100) {
    errors.push('Deposit percentage must be between 0 and 100.');
  }
  if (!Number.isFinite(values.freeWindowMonths) || values.freeWindowMonths < 0) {
    errors.push('Free touch-up window must be zero or greater.');
  }
  if (!Number.isFinite(values.monthsSinceSession) || values.monthsSinceSession < 0) {
    errors.push('Months since the original session must be zero or greater.');
  }
  if (mode === 'percent') {
    if (!Number.isFinite(values.touchupPercent) || values.touchupPercent < 0 || values.touchupPercent > 100) {
      errors.push('Touch-up percentage must be between 0 and 100.');
    }
  } else if (mode === 'flat') {
    if (!Number.isFinite(values.touchupFlat) || values.touchupFlat < 0) {
      errors.push('Flat touch-up fee must be zero or greater.');
    }
  } else {
    if (!Number.isFinite(values.hourlyRate) || !(values.hourlyRate > 0)) {
      errors.push('Hourly rate must be greater than zero.');
    }
    if (!Number.isFinite(values.touchupHours) || !(values.touchupHours > 0)) {
      errors.push('Estimated touch-up hours must be greater than zero.');
    }
  }
  return { ok: errors.length === 0, errors, values };
}

/**
 * The full touch-up price under the shop's own pricing rule — before the
 * free-window check. Kept separate from `plan()`'s `amountDue` because a
 * shop still wants to know what a touch-up is *worth* even when this
 * particular client owes nothing for it, e.g. to track discounted work.
 */
export function touchupFullPrice(values) {
  if (values.pricingMode === 'flat') return values.touchupFlat;
  if (values.pricingMode === 'hourly') return values.hourlyRate * values.touchupHours;
  return values.price * values.touchupPercent / 100;
}

export function plan(values) {
  const deposit = values.price * values.depositPercent / 100;
  const balance = values.price - deposit;
  const fullPrice = touchupFullPrice(values);
  const withinFreeWindow = values.monthsSinceSession <= values.freeWindowMonths;
  const monthsRemaining = Math.max(0, values.freeWindowMonths - values.monthsSinceSession);
  const amountDue = withinFreeWindow ? 0 : fullPrice;
  return { deposit, balance, touchupFullPrice: fullPrice, withinFreeWindow, monthsRemaining, amountDue };
}

/**
 * The touch-up outcome in words. States what the inputs produce and stops —
 * this tool does not decide how long a free window should be or what a
 * touch-up should cost.
 */
export function touchupNote(values, modeled, money) {
  if (modeled.withinFreeWindow) {
    const remaining = modeled.monthsRemaining === 0
      ? 'today is the last day of that window'
      : `about ${modeled.monthsRemaining.toFixed(1)} month(s) of that window remain`;
    return `At ${values.monthsSinceSession} month(s) since the original session, this client is inside the ${values.freeWindowMonths}-month free touch-up window — ${remaining}. On these inputs, nothing is due for this touch-up.`;
  }
  return `At ${values.monthsSinceSession} month(s) since the original session, this client is past the ${values.freeWindowMonths}-month free touch-up window. On these inputs, the touch-up is priced at ${money(modeled.touchupFullPrice)}.`;
}

export function policyDraft(values, modeled, money) {
  const business = values.businessName || 'The shop';
  const artist = values.artistName ? ` with ${values.artistName}` : '';
  const priceRule = values.pricingMode === 'flat'
    ? `a flat ${money(modeled.touchupFullPrice)} fee`
    : values.pricingMode === 'hourly'
      ? `${money(values.hourlyRate)}/hour, estimated at ${values.touchupHours} hour(s) (${money(modeled.touchupFullPrice)})`
      : `${values.touchupPercent}% of the original ${money(values.price)} session price (${money(modeled.touchupFullPrice)})`;
  return [
    `${business} deposit and touch-up policy`,
    '',
    `A ${money(modeled.deposit)} deposit (${values.depositPercent}% of the ${money(values.price)} session price${artist}) is required to book. The deposit is applied to the total; the remaining ${money(modeled.balance)} is due at the session.`,
    '',
    `Touch-ups on this piece are complimentary within ${values.freeWindowMonths} month(s) of the original session. After that window, a touch-up is priced at ${priceRule}.`,
    '',
    'Touch-up eligibility and pricing are set by the shop and may vary by piece, healing, or client history. Please review this draft against the rules for your location and payment provider before publishing it.',
  ].join('\n');
}
