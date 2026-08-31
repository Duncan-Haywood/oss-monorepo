// Pure calculation functions for the no-show / late-cancellation fee calculator.
// No I/O, no DOM, no randomness — safe to import from the browser or from tests.

/**
 * @param {number} n
 * @returns {boolean}
 */
function isFiniteNonNegative(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/**
 * @param {number} n
 * @returns {boolean}
 */
function isFinitePercent(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
}

/**
 * Validates the calculator's raw form inputs and coerces them to numbers.
 * Returns { ok: true, values } or { ok: false, errors }.
 *
 * @param {Record<string, unknown>} raw
 */
export function parseInputs(raw) {
  const errors = [];
  const num = (key, label) => {
    // `Number("")` and `Number("   ")` are both 0, and 0 passes every range
    // check below. A cleared field therefore used to validate as a deliberate
    // zero and the calculator answered "$0.00 suggested fee" with no error --
    // the wrong answer stated confidently, which is worse than no answer. An
    // absent field is missing input, not the number zero.
    const rawValue = raw[key];
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
      errors.push(`${label} is required.`);
      return 0;
    }
    const v = Number(rawValue);
    if (!Number.isFinite(v)) {
      errors.push(`${label} must be a number.`);
      return 0;
    }
    return v;
  };

  const price = num("price", "Appointment price");
  const bookingsPerWeek = num("bookingsPerWeek", "Bookings per week");
  const noShowRatePct = num("noShowRatePct", "No-show / late-cancel rate");
  const noticeHours = num("noticeHours", "Required notice window");
  const feePercent = num("feePercent", "Fee percentage");
  const enforcementRatePct = num("enforcementRatePct", "Assumed enforcement rate");
  // Blank deposit uses the shipped 50% default so existing share links
  // (and a cleared field) still parse; a typed value is validated.
  const depositPercent = optionalPercent(raw, "depositPercent", 50, "Booking deposit percentage", errors);

  if (price < 0) errors.push("Appointment price cannot be negative.");
  if (bookingsPerWeek < 0) errors.push("Bookings per week cannot be negative.");
  if (!isFinitePercent(noShowRatePct)) errors.push("No-show / late-cancel rate must be between 0 and 100.");
  if (!isFiniteNonNegative(noticeHours)) errors.push("Required notice window cannot be negative.");
  if (!isFinitePercent(feePercent)) errors.push("Fee percentage must be between 0 and 100.");
  if (!isFinitePercent(enforcementRatePct)) errors.push("Assumed enforcement rate must be between 0 and 100.");

  // Overflow cost is optional: a cleared field means "cost one session,"
  // which is the conservative default for a double-booked chair. An
  // explicit zero is allowed — some operators treat overflow as free.
  let overflowCost = price;
  const overflowRaw = raw.overflowCost;
  if (overflowRaw !== undefined && overflowRaw !== null && String(overflowRaw).trim() !== "") {
    const overflowValue = Number(overflowRaw);
    if (!Number.isFinite(overflowValue)) {
      errors.push("Double-book / overflow cost must be a number.");
    } else if (overflowValue < 0) {
      errors.push("Double-book / overflow cost cannot be negative.");
    } else {
      overflowCost = overflowValue;
    }
  }

  // Fill rates are assumptions about waitlist refill, not required inputs.
  // Empty means "use the shipped default" so existing share links still parse.
  const fillSameDayPct = optionalPercent(raw, "fillSameDayPct", 10, "Same-day waitlist fill rate", errors);
  const fillDayAheadPct = optionalPercent(raw, "fillDayAheadPct", 40, "24-hour waitlist fill rate", errors);
  const fillTwoDayPct = optionalPercent(raw, "fillTwoDayPct", 65, "48-hour waitlist fill rate", errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    values: {
      price,
      bookingsPerWeek,
      noShowRatePct,
      noticeHours,
      feePercent,
      enforcementRatePct,
      depositPercent,
      overflowCost,
      fillSameDayPct,
      fillDayAheadPct,
      fillTwoDayPct,
    },
  };
}

/**
 * Optional 0–100 percent. Blank uses `fallback`; a typed value is validated.
 * @param {Record<string, unknown>} raw
 * @param {string} key
 * @param {number} fallback
 * @param {string} label
 * @param {string[]} errors
 */
function optionalPercent(raw, key, fallback, label, errors) {
  const rawValue = raw[key];
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return fallback;
  }
  const v = Number(rawValue);
  if (!Number.isFinite(v)) {
    errors.push(`${label} must be a number.`);
    return fallback;
  }
  if (!isFinitePercent(v)) {
    errors.push(`${label} must be between 0 and 100.`);
    return fallback;
  }
  return v;
}

const WEEKS_PER_YEAR = 52;

/**
 * The fee amount charged per violation, in the same currency unit as `price`.
 * @param {{ price: number, feePercent: number }} args
 */
export function computeFeeAmount({ price, feePercent }) {
  return round2((price * feePercent) / 100);
}

/**
 * How many no-shows / late cancellations happen in a year at the given rate,
 * and how much billable time that represents if nothing were ever charged.
 *
 * @param {{ price: number, bookingsPerWeek: number, noShowRatePct: number }} args
 */
export function computeAnnualExposure({ price, bookingsPerWeek, noShowRatePct }) {
  const noShowsPerYear = bookingsPerWeek * (noShowRatePct / 100) * WEEKS_PER_YEAR;
  const annualLostRevenue = round2(noShowsPerYear * price);
  return { noShowsPerYear: round2(noShowsPerYear), annualLostRevenue };
}

/**
 * Estimated fee revenue collectable per year if the policy is enforced at
 * `enforcementRatePct` of violations. This is deliberately a *modeled
 * estimate*, not a promise — the enforcement rate is a user-supplied
 * assumption, not measured.
 *
 * @param {{ feeAmount: number, noShowsPerYear: number, enforcementRatePct: number }} args
 */
export function computeAnnualFeeRevenue({ feeAmount, noShowsPerYear, enforcementRatePct }) {
  return round2(feeAmount * noShowsPerYear * (enforcementRatePct / 100));
}

/**
 * Shows how much of the appointment revenue represented by missed slots the
 * modeled fee revenue recovers, and how many collected fees would cover all of
 * that exposure. Zero exposure is a valid result; a zero fee cannot recover a
 * non-zero exposure.
 *
 * @param {{ feeAmount: number, annualLostRevenue: number, annualFeeRevenue: number }} args
 */
export function computeRecovery({ feeAmount, annualLostRevenue, annualFeeRevenue }) {
  const recoveryRatePct = annualLostRevenue === 0
    ? 0
    : round2((annualFeeRevenue / annualLostRevenue) * 100);
  const collectionsToBreakEven = annualLostRevenue === 0
    ? 0
    : feeAmount === 0
      ? null
      : Math.ceil(annualLostRevenue / feeAmount);

  // The same figures at the cadence an owner actually plans on. An annual
  // exposure is easy to wave off as a big abstract number; the monthly slice is
  // the one that sits next to rent. Derived here rather than divided at the
  // render site so the rounding is stated once.
  const monthlyExposure = round2(annualLostRevenue / 12);
  const monthlyFeeRevenue = round2(annualFeeRevenue / 12);
  const monthlyUnrecovered = round2(monthlyExposure - monthlyFeeRevenue);

  return {
    recoveryRatePct,
    collectionsToBreakEven,
    monthlyExposure,
    monthlyFeeRevenue,
    monthlyUnrecovered,
  };
}

/**
 * Models how much of the appointment value represented by no-shows is
 * recovered by the fee policy, and the annual dollar exposure still
 * unrecovered at that rate. This is intentionally an estimate based on
 * the user's enforcement assumption, not a claim about actual collections.
 *
 * `recoveredPct` is the same ratio as `computeRecovery`'s `recoveryRatePct`
 * (kept as a separate export because both shipped independently and other
 * call sites already depend on each name); `remainingAnnualExposure` is the
 * one figure `computeRecovery` does not already surface at annual
 * cadence — it clamps at zero so an enforcement rate that overshoots the
 * modeled exposure never reads as negative "recovered more than possible".
 *
 * @param {{ annualFeeRevenue: number, annualLostRevenue: number }} args
 */
export function computeRecoveryEstimate({ annualFeeRevenue, annualLostRevenue }) {
  const recoveredPct = annualLostRevenue > 0
    ? round2((annualFeeRevenue / annualLostRevenue) * 100)
    : 0;
  return {
    recoveredPct,
    remainingAnnualExposure: round2(Math.max(0, annualLostRevenue - annualFeeRevenue)),
  };
}

/**
 * Runs every calculation from a single validated input set.
 * @param {{ price: number, bookingsPerWeek: number, noShowRatePct: number, noticeHours: number, feePercent: number, enforcementRatePct: number, depositPercent?: number }} values
 */
export function computeAll(values) {
  const feeAmount = computeFeeAmount(values);
  const { noShowsPerYear, annualLostRevenue } = computeAnnualExposure(values);
  const annualFeeRevenue = computeAnnualFeeRevenue({
    feeAmount,
    noShowsPerYear,
    enforcementRatePct: values.enforcementRatePct,
  });
  const {
    recoveryRatePct,
    collectionsToBreakEven,
    monthlyExposure,
    monthlyFeeRevenue,
    monthlyUnrecovered,
  } = computeRecovery({
    feeAmount,
    annualLostRevenue,
    annualFeeRevenue,
  });
  const { recoveredPct, remainingAnnualExposure } = computeRecoveryEstimate({ annualFeeRevenue, annualLostRevenue });
  return {
    feeAmount,
    noShowsPerYear,
    annualLostRevenue,
    annualFeeRevenue,
    recoveryRatePct,
    collectionsToBreakEven,
    monthlyExposure,
    monthlyFeeRevenue,
    monthlyUnrecovered,
    recoveredPct,
    remainingAnnualExposure,
    inputs: values,
  };
}

/**
 * Compares practical fee levels against the same booking exposure.
 * @param {{ price: number, bookingsPerWeek: number, noShowRatePct: number, feePercent: number, enforcementRatePct: number }} values
 */
/**
 * Standard notice windows trainers and salons actually debate. Same-day is
 * the honest baseline: almost nobody refills a slot that opens in four hours.
 */
export const NOTICE_WINDOWS = [
  { hours: 4, key: "fillSameDayPct", label: "Same day (4 hours)" },
  { hours: 24, key: "fillDayAheadPct", label: "1 day (24 hours)" },
  { hours: 48, key: "fillTwoDayPct", label: "2 days (48 hours)" },
];

/**
 * Compares how much of the no-show hole closes if a cancelled slot can be
 * refilled from a waitlist at each notice window.
 *
 * Fee revenue is left out on purpose. A fee can still be collected on a late
 * cancel even if the slot is refilled; mixing the two would double-count cash
 * and hide the empty-chair problem the longer window is meant to solve.
 *
 * @param {{
 *   price: number,
 *   bookingsPerWeek: number,
 *   noShowRatePct: number,
 *   noticeHours: number,
 *   fillSameDayPct: number,
 *   fillDayAheadPct: number,
 *   fillTwoDayPct: number,
 * }} values
 */
export function compareNoticeWindows(values) {
  const { noShowsPerYear, annualLostRevenue } = computeAnnualExposure(values);
  const sameDay = NOTICE_WINDOWS[0];
  const sameDayFill = values[sameDay.key];
  const sameDayRecovered = round2(annualLostRevenue * (sameDayFill / 100));

  return NOTICE_WINDOWS.map((window) => {
    const fillPct = values[window.key];
    const slotsFilled = round2(noShowsPerYear * (fillPct / 100));
    const slotsEmpty = round2(noShowsPerYear - slotsFilled);
    const recoveredByRefill = round2(annualLostRevenue * (fillPct / 100));
    const leftoverLost = round2(annualLostRevenue - recoveredByRefill);
    return {
      hours: window.hours,
      key: window.key,
      label: window.label,
      fillPct,
      slotsFilled,
      slotsEmpty,
      recoveredByRefill,
      leftoverLost,
      extraVsSameDay: round2(recoveredByRefill - sameDayRecovered),
      selected: values.noticeHours === window.hours,
      nearest: nearestNoticeHours(values.noticeHours) === window.hours,
    };
  });
}

/**
 * @param {number} noticeHours
 * @returns {number}
 */
export function nearestNoticeHours(noticeHours) {
  return NOTICE_WINDOWS.reduce((best, window) => (
    Math.abs(window.hours - noticeHours) < Math.abs(best - noticeHours) ? window.hours : best
  ), NOTICE_WINDOWS[0].hours);
}

/**
 * One sentence naming the extra cash a longer window recovers vs same-day,
 * using the user's own fill assumptions. Arithmetic only — it does not tell
 * them which policy to publish.
 *
 * @param {ReturnType<typeof compareNoticeWindows>} rows
 */
export function noticeWindowSummary(rows) {
  const sameDay = rows.find((row) => row.hours === 4);
  const dayAhead = rows.find((row) => row.hours === 24);
  const twoDay = rows.find((row) => row.hours === 48);
  if (!sameDay || !dayAhead || !twoDay) {
    return "Enter waitlist fill rates to compare notice windows.";
  }
  if (twoDay.extraVsSameDay <= 0 && dayAhead.extraVsSameDay <= 0) {
    return `At a ${sameDay.fillPct}% same-day fill rate, a longer notice window does not recover more of the empty slots unless you can actually refill more of them.`;
  }
  return `If you can refill ${twoDay.fillPct}% of late cancels with 48 hours of notice versus ${sameDay.fillPct}% same-day, the longer window recovers ${formatPlainMoney(twoDay.extraVsSameDay)} more of the empty-slot cash per year. A 24-hour window at ${dayAhead.fillPct}% fill recovers ${formatPlainMoney(dayAhead.extraVsSameDay)} more than same-day. The cancellation fee is separate — it does not refill the chair.`;
}

function formatPlainMoney(amount) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export function compareFeeScenarios(values) {
  const percentages = [50, 75, 100];
  if (!percentages.includes(values.feePercent)) percentages.push(values.feePercent);
  const { noShowsPerYear } = computeAnnualExposure(values);

  return percentages
    .sort((a, b) => a - b)
    .map((feePercent) => {
      const feeAmount = computeFeeAmount({ price: values.price, feePercent });
      return {
        feePercent,
        feeAmount,
        annualFeeRevenue: computeAnnualFeeRevenue({
          feeAmount,
          noShowsPerYear,
          enforcementRatePct: values.enforcementRatePct,
        }),
      };
    });
}

/**
 * Compares how much cash the same no-shows return under three collection
 * policies. After-the-fact fees use the user's enforcement-rate assumption.
 * A booking deposit is treated as already collected, so a no-show keeps that
 * amount without a second collection step. "Deposit plus remaining fee"
 * keeps the deposit and then applies the same enforcement rate to the
 * unpaid remainder — the usual hybrid booking-system setup.
 *
 * This is a modeled comparison, not a recommendation to adopt a policy
 * and not a claim about what is lawful in a given place.
 *
 * @param {{ price: number, bookingsPerWeek: number, noShowRatePct: number, feePercent: number, enforcementRatePct: number, depositPercent: number }} values
 */
export function compareCollectionPolicies(values) {
  const { noShowsPerYear, annualLostRevenue } = computeAnnualExposure(values);
  const feeAmount = computeFeeAmount({ price: values.price, feePercent: values.feePercent });
  const depositAmount = computeFeeAmount({ price: values.price, feePercent: values.depositPercent });
  const remainderAmount = round2(Math.max(0, values.price - depositAmount));

  const feeRecoveredPerNoShow = round2(feeAmount * (values.enforcementRatePct / 100));
  const depositRecoveredPerNoShow = depositAmount;
  const combinedRecoveredPerNoShow = round2(
    depositAmount + remainderAmount * (values.enforcementRatePct / 100),
  );

  const policies = [
    {
      id: "after-the-fact-fee",
      label: "Charge a no-show fee after the fact",
      recoveredPerNoShow: feeRecoveredPerNoShow,
      annualRecovered: computeAnnualFeeRevenue({
        feeAmount,
        noShowsPerYear,
        enforcementRatePct: values.enforcementRatePct,
      }),
    },
    {
      id: "require-deposit",
      label: "Keep a booking deposit on no-shows",
      recoveredPerNoShow: depositRecoveredPerNoShow,
      annualRecovered: round2(depositAmount * noShowsPerYear),
    },
    {
      id: "deposit-plus-remainder",
      label: "Deposit plus remaining no-show fee",
      recoveredPerNoShow: combinedRecoveredPerNoShow,
      annualRecovered: round2(combinedRecoveredPerNoShow * noShowsPerYear),
    },
  ].map((policy) => ({
    ...policy,
    annualStillLost: round2(annualLostRevenue - policy.annualRecovered),
  }));

  const recommended = policies.reduce((best, policy) => {
    if (policy.annualRecovered > best.annualRecovered) return policy;
    // When recoveries tie, prefer the policy that does not depend on a
    // second collection attempt after the missed appointment.
    if (policy.annualRecovered === best.annualRecovered && policy.id !== "after-the-fact-fee" && best.id === "after-the-fact-fee") {
      return policy;
    }
    return best;
  });

  const runnerUp = policies
    .filter((policy) => policy.id !== recommended.id)
    .reduce((best, policy) => (policy.annualRecovered > best.annualRecovered ? policy : best));

  return {
    depositAmount,
    remainderAmount,
    noShowsPerYear,
    annualLostRevenue,
    policies,
    recommendedId: recommended.id,
    annualAdvantage: round2(recommended.annualRecovered - runnerUp.annualRecovered),
  };
}

/**
 * How many extra names to put on a weekly book as a fraction of the
 * expected no-shows. 0 is "book only the chairs you have." 1 is the
 * classic match-the-no-show-rate rule. 1.5 is the aggressive book that
 * starts to collide on the mean.
 */
export const OVERBOOK_FACTORS = [0, 0.5, 1, 1.5];

/**
 * Expected weekly chair use if `extraBookingsPerWeek` names are added
 * on top of capacity. This is a mean-value model, not a Poisson busy-day
 * simulation: even a week whose average fits can still overflow on a
 * high-show day. The overflow cost is how that risk is priced.
 *
 * @param {{ bookingsPerWeek: number, noShowRatePct: number }} values
 * @param {number} extraBookingsPerWeek
 */
export function weeklyBook(values, extraBookingsPerWeek) {
  const capacity = values.bookingsPerWeek;
  const extra = extraBookingsPerWeek;
  if (!isFiniteNonNegative(extra)) {
    throw new Error("Extra bookings per week cannot be negative.");
  }
  const booked = capacity + extra;
  const showRate = 1 - values.noShowRatePct / 100;
  const expectedArrivals = booked * showRate;
  const served = Math.min(expectedArrivals, capacity);
  const overflow = Math.max(0, expectedArrivals - capacity);
  const empty = Math.max(0, capacity - expectedArrivals);
  const noShows = booked * (values.noShowRatePct / 100);
  return {
    capacity,
    extraBookingsPerWeek: extra,
    booked,
    showRate,
    expectedArrivals,
    served,
    overflow,
    empty,
    noShows,
  };
}

/**
 * Annual cash from one booking policy: service on served chairs, optional
 * no-show fees on the names that did not arrive, minus overflow cost on
 * the chairs that could not be sat.
 *
 * @param {{ price: number, bookingsPerWeek: number, noShowRatePct: number, feePercent: number, enforcementRatePct: number, overflowCost: number }} values
 * @param {{ extraBookingsPerWeek: number, collectFee: boolean }} policy
 */
export function annualOverbookOutcome(values, { extraBookingsPerWeek, collectFee }) {
  const week = weeklyBook(values, extraBookingsPerWeek);
  const overflowCost = isFiniteNonNegative(values.overflowCost) ? values.overflowCost : values.price;
  const feeAmount = computeFeeAmount(values);
  const serviceRevenue = round2(week.served * values.price * WEEKS_PER_YEAR);
  const noShowsPerYear = week.noShows * WEEKS_PER_YEAR;
  const feeRevenue = collectFee
    ? computeAnnualFeeRevenue({
        feeAmount,
        noShowsPerYear,
        enforcementRatePct: values.enforcementRatePct,
      })
    : 0;
  const overflowCostAnnual = round2(week.overflow * overflowCost * WEEKS_PER_YEAR);
  return {
    ...week,
    collectFee,
    feeAmount,
    overflowCost,
    serviceRevenue,
    feeRevenue,
    overflowCostAnnual,
    netKept: round2(serviceRevenue + feeRevenue - overflowCostAnnual),
  };
}

function overbookRowId(factor) {
  return factor === 0 ? "fee_only" : `overbook_${String(factor).replace(".", "_")}`;
}

function overbookRowLabel(factor, { collectFee }) {
  if (factor === 0) return "Capacity only, collect fee";
  const pct = Math.round(factor * 100);
  return collectFee
    ? `Overbook ${pct}% of expected no-shows + fee`
    : `Overbook ${pct}% of expected no-shows, drop the fee`;
}

/**
 * One-line arithmetic observation. It names which policy kept more on
 * these inputs; it does not tell the operator to overbook or to charge.
 */
export function overbookingSummary(comparison) {
  const money = (n) => {
    const abs = Math.abs(n).toFixed(2);
    return n < 0 ? `-$${abs}` : `$${abs}`;
  };
  const gap = money(Math.abs(comparison.extraVsFeeOnly));
  if (comparison.expectedNoShowsPerWeek === 0) {
    return "No-show rate is 0%, so extra names only add overflow risk. The fee-only book and the overbook rows are the same full book.";
  }
  if (comparison.winner === "fee_only") {
    return `Keeping the book at capacity and collecting the fee keeps ${gap} more per year than the best overbook row on these rates.`;
  }
  if (comparison.winner === "overbook_drop_fee") {
    return `Overbooking to match the no-show rate and dropping the fee keeps ${gap} more per year than the fee alone. Overflow cost is priced at ${money(comparison.overflowCost)} per collided chair.`;
  }
  return `${comparison.winnerLabel} keeps ${gap} more per year than the fee alone. Overflow cost is priced at ${money(comparison.overflowCost)} per collided chair.`;
}

/**
 * Compare a fee-only book against overbooking 50/100/150% of expected
 * no-shows (still collecting the fee), plus matching no-shows and
 * dropping the fee. The last row is the policy many salons actually
 * try: fill the empty chairs and skip the awkward charge.
 *
 * @param {{ price: number, bookingsPerWeek: number, noShowRatePct: number, feePercent: number, enforcementRatePct: number, overflowCost?: number }} values
 */
export function compareOverbooking(values) {
  const overflowCost = isFiniteNonNegative(values.overflowCost) ? values.overflowCost : values.price;
  const input = { ...values, overflowCost };
  const expectedNoShowsPerWeek = round2(values.bookingsPerWeek * (values.noShowRatePct / 100));

  const rows = OVERBOOK_FACTORS.map((factor) => {
    const extraBookingsPerWeek = round2(expectedNoShowsPerWeek * factor);
    const withFee = annualOverbookOutcome(input, {
      extraBookingsPerWeek,
      collectFee: true,
    });
    return {
      id: overbookRowId(factor),
      factor,
      label: overbookRowLabel(factor, { collectFee: true }),
      extraBookingsPerWeek,
      withFee,
    };
  });

  const matchNoFee = annualOverbookOutcome(input, {
    extraBookingsPerWeek: expectedNoShowsPerWeek,
    collectFee: false,
  });

  const candidates = [
    ...rows.map((row) => ({
      id: row.id,
      label: row.label,
      netKept: row.withFee.netKept,
    })),
    {
      id: "overbook_drop_fee",
      label: overbookRowLabel(1, { collectFee: false }),
      netKept: matchNoFee.netKept,
    },
  ];

  let winner = candidates[0];
  for (const candidate of candidates) {
    if (candidate.netKept > winner.netKept + 1e-9) winner = candidate;
  }

  const feeOnly = rows[0].withFee;
  const extraVsFeeOnly = round2(winner.netKept - feeOnly.netKept);
  const comparison = {
    overflowCost,
    expectedNoShowsPerWeek,
    rows,
    matchNoFee,
    feeOnly,
    winner: winner.id,
    winnerLabel: winner.label,
    extraVsFeeOnly,
  };
  comparison.summary = overbookingSummary(comparison);
  return comparison;
}

/**
 * Copy-paste booking-deposit wording. Same non-warranty close as the
 * cancellation policy — callers should not strip it.
 *
 * @param {{ businessName?: string, serviceName?: string, noticeHours: number, depositPercent: number, depositAmount: number, remainderAmount: number, currencySymbol?: string }} args
 */
export function generateDepositPolicyText({
  businessName,
  serviceName,
  noticeHours,
  depositPercent,
  depositAmount,
  remainderAmount,
  currencySymbol = "$",
}) {
  const who = businessName && businessName.trim() ? businessName.trim() : "[Your business name]";
  const what = serviceName && serviceName.trim() ? serviceName.trim() : "appointment";
  const notice = formatHours(noticeHours);
  const deposit = `${currencySymbol}${depositAmount.toFixed(2)}`;
  const remainder = `${currencySymbol}${remainderAmount.toFixed(2)}`;

  const lines = [
    `Booking Deposit Policy — ${who}`,
    "",
    `A ${depositPercent}% deposit (${deposit}) is required to reserve your ${what}. The deposit is applied to the ${what} total; the remaining ${remainder} is due at the ${what}.`,
    "",
    `Cancellations made with at least ${notice} of notice may have the deposit refunded or transferred to a new date, subject to our booking terms. Cancellations or no-shows with less than ${notice} of notice forfeit the deposit.`,
    "",
    "Taking a deposit is not the same as charging a no-show fee after the fact. The deposit is collected when the slot is reserved, so a late cancel does not require a second collection attempt.",
    "",
    "This is a draft starting point, not a finished legal document. Review it against your own booking system's terms, your payment processor's rules, and any local consumer-protection or industry-specific requirements (for example, some regions treat medical or dental deposits and cancellation fees differently) before publishing it to clients.",
  ];
  return lines.join("\n");
}

/**
 * Generates a plain-language, copy-paste cancellation / no-show policy.
 * Always returns text ending in the non-warranty note — callers should not
 * strip it.
 *
 * @param {{ businessName?: string, serviceName?: string, collectionMethod?: string, noticeHours: number, feePercent: number, feeAmount: number, currencySymbol?: string }} args
 */
export function generatePolicyText({
  businessName,
  serviceName,
  collectionMethod = "payment-method",
  noticeHours,
  feePercent,
  feeAmount,
  currencySymbol = "$",
}) {
  const who = businessName && businessName.trim() ? businessName.trim() : "[Your business name]";
  const what = serviceName && serviceName.trim() ? serviceName.trim() : "appointment";
  const notice = formatHours(noticeHours);
  const fee = `${currencySymbol}${feeAmount.toFixed(2)}`;
  const collection = {
    "payment-method": "We will charge the payment method you provided for the booking.",
    invoice: "We will send an invoice for the cancellation or no-show fee, payable according to its terms.",
    booking: "The fee will be collected when the booking is made, using the payment method offered at checkout.",
    contact: "We will contact you to arrange payment of the cancellation or no-show fee.",
  }[collectionMethod] ?? "We will contact you to arrange payment of the cancellation or no-show fee.";

  const lines = [
    `Cancellation & No-Show Policy — ${who}`,
    "",
    `We ask for at least ${notice} of notice to cancel or reschedule your ${what}.`,
    "",
    `Cancellations or no-shows with less than ${notice} of notice will be charged ${feePercent}% of the ${what} price (${fee}).`,
    "",
    collection,
    "",
    "This isn't a penalty — a reserved slot that opens up with little notice usually can't be rebooked, so the fee covers that lost time.",
    "",
    "[Optional: first-time cancellations may be waived once per client as a courtesy — remove this line if you don't want to offer that.]",
    "",
    "This is a draft starting point, not a finished legal document. Review it against your own booking system's terms, your payment processor's rules, and any local consumer-protection or industry-specific requirements (for example, some regions treat medical or dental no-show fees differently) before publishing it to clients.",
  ];
  return lines.join("\n");
}

const SHARE_FIELDS = [
  "currency",
  "price",
  "bookingsPerWeek",
  "noShowRatePct",
  "noticeHours",
  "feePercent",
  "enforcementRatePct",
  "depositPercent",
  "overflowCost",
  "fillSameDayPct",
  "fillDayAheadPct",
  "fillTwoDayPct",
  "businessName",
  "serviceName",
  "collectionMethod",
];

export const DRAFT_STORAGE_KEY = "no-show-fee-calculator:draft:v1";

// The draft is exactly the shareable field set: anything worth putting in a
// link is worth getting back after a reload. Deriving it keeps the two from
// drifting apart, which is how a shared link and a restored draft end up
// disagreeing about what the user typed.
export const DRAFT_FIELDS = [...SHARE_FIELDS];

/**
 * Persist the form's raw values, keeping only known fields as strings.
 *
 * Storage is injected rather than reached for so this stays testable and so a
 * browser with storage disabled degrades to a no-op instead of throwing --
 * draft recovery is a convenience and must never block a calculation.
 *
 * @param {Record<string, unknown>} raw @param {Storage|undefined|null} storage
 */
export function saveDraft(raw, storage) {
  try {
    storage?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(
      Object.fromEntries(DRAFT_FIELDS.map((field) => [field, String(raw[field] ?? "")])),
    ));
    return Boolean(storage);
  } catch {
    return false;
  }
}

/** @param {Storage|undefined|null} storage @returns {Record<string, string>} */
export function readDraft(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(DRAFT_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      DRAFT_FIELDS
        .filter((field) => typeof parsed[field] === "string")
        .map((field) => [field, parsed[field]]),
    );
  } catch {
    return {};
  }
}

/** @param {Storage|undefined|null} storage */
export function clearDraft(storage) {
  try {
    storage?.removeItem(DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** @param {Record<string, unknown>} raw @param {string} baseUrl */
export function buildShareUrl(raw, baseUrl) {
  const url = new URL(baseUrl);
  for (const field of SHARE_FIELDS) {
    const value = String(raw[field] ?? "").trim();
    if (value) url.searchParams.set(field, value);
  }
  return url.toString();
}

/** @param {string} urlString */
export function readShareValues(urlString) {
  const params = new URL(urlString).searchParams;
  /** @type {Record<string, string>} */
  const values = {};
  for (const field of SHARE_FIELDS) {
    const value = params.get(field);
    if (value !== null) values[field] = value;
  }
  return values;
}

function formatHours(hours) {
  if (hours % 24 === 0 && hours > 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function policyDownloadFilename(businessName) {
  const safeName = (String(businessName ?? "").trim() || "cancellation-policy")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "cancellation-policy";
  return `${safeName}-policy.txt`;
}
