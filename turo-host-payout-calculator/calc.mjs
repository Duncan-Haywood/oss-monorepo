/**
 * Turo host payout calculator, as a deterministic module.
 *
 * Turo restructured US host earnings twice in 2026. The single flat
 * percentage every earlier "Turo fee calculator" assumed (a fixed split by
 * protection-plan tier alone) is gone. What replaced it is a matrix: your
 * host share now depends on **which earnings plan you picked** (Peace of
 * Mind / Balanced / More Earnings -- named for the trade-off between host
 * share and how much of a damage claim you're on the hook for) *and* **how
 * far ahead of the trip the guest booked** (0-2, 3-13, 14-27, or 28+ days).
 * The share locks at booking time and applies to the trip price plus any
 * extra-mileage, additional-usage, and late-return fees the guest owes --
 * not just the headline daily rate.
 *
 * That is a genuinely different question from "what percent does Turo
 * take", and it is not answerable from memory or a single quoted number --
 * it needs the whole matrix, which is what this module models.
 *
 * The matrix below reflects Turo's documented "earnings plans" structure as
 * of September 2026 (help.turo.com's host earnings pages). Turo has changed
 * this exact structure more than once in one calendar year, so every number
 * here is exposed as an adjustable input, never hard-coded into the UI as a
 * fact the user cannot see or override -- treat the defaults as a starting
 * point to check against your own Turo Host Hub, not a guarantee of what
 * you will actually be paid. See index.html's disclaimer for the exact
 * wording.
 */

export const EARNINGS_PLANS = ["peace_of_mind", "balanced", "more_earnings"];

export const PLAN_LABELS = {
  peace_of_mind: "Peace of Mind",
  balanced: "Balanced",
  more_earnings: "More Earnings",
};

// Commonly cited damage-responsibility cap per plan, in USD -- the amount of
// a vehicle-damage claim a host can be on the hook for under that plan.
// Informational only: it does not enter the payout arithmetic, but it is the
// real trade-off behind picking a lower-share plan, so it is shown next to
// the payout comparison rather than left implicit.
export const DAMAGE_RESPONSIBILITY_CAP = {
  peace_of_mind: 250,
  balanced: 1500,
  more_earnings: 2750,
};

export const BOOKING_WINDOWS = ["0_2", "3_13", "14_27", "28_plus"];

export const BOOKING_WINDOW_LABELS = {
  "0_2": "0-2 days ahead (last-minute)",
  "3_13": "3-13 days ahead",
  "14_27": "14-27 days ahead",
  "28_plus": "28+ days ahead",
};

// Host share (fraction of the split-eligible amount the host keeps), by
// plan and booking window. Adjustable defaults, not a fixed standard -- see
// the module docstring.
export const HOST_SHARE = {
  peace_of_mind: { "0_2": 0.65, "3_13": 0.70, "14_27": 0.75, "28_plus": 0.80 },
  balanced: { "0_2": 0.75, "3_13": 0.80, "14_27": 0.85, "28_plus": 0.90 },
  more_earnings: { "0_2": 0.85, "3_13": 0.90, "14_27": 0.95, "28_plus": 1.00 },
};

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function num(value) {
  return Number.isFinite(value) ? value : Number(value);
}

function nonNegative(value) {
  const n = num(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizedPlan(plan) {
  return EARNINGS_PLANS.includes(plan) ? plan : "balanced";
}

function normalizedWindow(window) {
  return BOOKING_WINDOWS.includes(window) ? window : "3_13";
}

export function hostShareFor(plan, bookingWindow) {
  return HOST_SHARE[normalizedPlan(plan)][normalizedWindow(bookingWindow)];
}

/**
 * One trip's payout under one plan and one booking window.
 *
 * @param {{
 *   tripPrice: number,
 *   plan: string,
 *   bookingWindow: string,
 *   extraMileageFee?: number,
 *   lateReturnFee?: number,
 *   additionalUsageFee?: number,
 *   days?: number,
 * }} input
 */
export function computeTripPayout({
  tripPrice,
  plan,
  bookingWindow,
  extraMileageFee = 0,
  lateReturnFee = 0,
  additionalUsageFee = 0,
  days = 1,
}) {
  const price = nonNegative(tripPrice);
  const extras = round2(nonNegative(extraMileageFee) + nonNegative(lateReturnFee) + nonNegative(additionalUsageFee));
  const splitEligible = round2(price + extras);

  const usedPlan = normalizedPlan(plan);
  const usedWindow = normalizedWindow(bookingWindow);
  const hostShare = hostShareFor(usedPlan, usedWindow);

  const hostPayout = round2(splitEligible * hostShare);
  const turoCut = round2(splitEligible - hostPayout);
  const tripDays = nonNegative(days) > 0 ? nonNegative(days) : 1;
  const perDay = round2(hostPayout / tripDays);

  const findings = [];
  if (price === 0) {
    findings.push({
      id: "missing-input",
      severity: SEVERITY.INFO,
      title: "Enter a trip price",
      detail: "Use the total trip price the guest pays for the whole booking, before extra fees. The payout below is zero until a real price is entered.",
    });
  }
  if (usedWindow === "0_2") {
    findings.push({
      id: "last-minute-booking",
      severity: SEVERITY.MEDIUM,
      title: "Last-minute bookings pay the lowest host share, under every plan",
      detail: "0-2 days ahead is the bottom tier in all three earnings plans. The same trip booked 28+ days out pays a meaningfully higher share -- see the booking-window comparison below for the exact dollar swing on this trip.",
    });
  }
  if (usedPlan === "peace_of_mind" && splitEligible > 0) {
    findings.push({
      id: "lowest-cap-plan",
      severity: SEVERITY.INFO,
      title: `Peace of Mind caps your damage responsibility at $${DAMAGE_RESPONSIBILITY_CAP.peace_of_mind}, but pays the lowest share`,
      detail: `Compare against Balanced ($${DAMAGE_RESPONSIBILITY_CAP.balanced} cap) and More Earnings ($${DAMAGE_RESPONSIBILITY_CAP.more_earnings} cap) in the plan comparison below before choosing on host share alone -- the trade-off is real dollars against real risk, not just a percentage.`,
    });
  }

  return {
    plan: usedPlan,
    bookingWindow: usedWindow,
    splitEligible,
    hostShare,
    hostPayout,
    turoCut,
    perDay,
    findings,
  };
}

/**
 * The same trip, priced under all three earnings plans at the same booking
 * window, so a host can see the dollar trade-off directly rather than
 * comparing bare percentages.
 */
export function comparePlans({ tripPrice, bookingWindow, extraMileageFee = 0, lateReturnFee = 0, additionalUsageFee = 0, days = 1, selectedPlan }) {
  const usedSelected = normalizedPlan(selectedPlan);
  const rows = EARNINGS_PLANS.map((plan) => {
    const result = computeTripPayout({ tripPrice, plan, bookingWindow, extraMileageFee, lateReturnFee, additionalUsageFee, days });
    return {
      plan,
      label: PLAN_LABELS[plan],
      hostShare: result.hostShare,
      hostPayout: result.hostPayout,
      turoCut: result.turoCut,
      damageCap: DAMAGE_RESPONSIBILITY_CAP[plan],
      selected: plan === usedSelected,
    };
  });
  const payouts = rows.map((r) => r.hostPayout);
  const swing = round2(Math.max(...payouts) - Math.min(...payouts));
  return { rows, swing };
}

/**
 * The same trip under one plan, across all four booking windows, so a host
 * can see how much the timing of the guest's booking is worth.
 */
export function compareBookingWindows({ tripPrice, plan, extraMileageFee = 0, lateReturnFee = 0, additionalUsageFee = 0, days = 1, selectedWindow }) {
  const usedSelected = normalizedWindow(selectedWindow);
  const rows = BOOKING_WINDOWS.map((bookingWindow) => {
    const result = computeTripPayout({ tripPrice, plan, bookingWindow, extraMileageFee, lateReturnFee, additionalUsageFee, days });
    return {
      bookingWindow,
      label: BOOKING_WINDOW_LABELS[bookingWindow],
      hostShare: result.hostShare,
      hostPayout: result.hostPayout,
      turoCut: result.turoCut,
      selected: bookingWindow === usedSelected,
    };
  });
  const payouts = rows.map((r) => r.hostPayout);
  const swing = round2(Math.max(...payouts) - Math.min(...payouts));
  return { rows, swing };
}

/**
 * A simple monthly/annual projection from one trip's payout and a stated
 * trip frequency -- deliberately linear (no seasonality, no fleet mix), so
 * it is what it looks like: this trip's payout times how many like it you
 * expect, not a booked-calendar forecast.
 */
export function estimateMonthly(hostPayoutPerTrip, tripsPerMonth) {
  const trips = Math.max(0, Math.round(nonNegative(tripsPerMonth)));
  const perTrip = nonNegative(hostPayoutPerTrip);
  const monthly = round2(perTrip * trips);
  const annual = round2(monthly * 12);
  return { trips, monthly, annual };
}
