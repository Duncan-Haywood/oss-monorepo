/**
 * Sign language (ASL) interpreter assignment rate calculator, as a
 * deterministic module.
 *
 * Freelance/contract sign language interpreters price a single assignment
 * against a handful of industry conventions that a flat hourly rate does not
 * capture on its own:
 *
 *  - **A booking minimum.** A two-hour minimum for a freelance/contract
 *    assignment is the most commonly cited floor in the field (an interpreter
 *    who blocks off travel and prep time for a 45-minute appointment cannot
 *    sell that hour to anyone else) -- exposed here as an adjustable input,
 *    not a fixed rule, because agencies and individual contracts vary.
 *  - **Portal-to-portal travel.** Drive time to and from the assignment is
 *    commonly billed, in whole or in part, because it is time the interpreter
 *    cannot rebook -- same shape as notary-trip-quote and
 *    court-reporter-transcript-calculator, just for interpreting instead of a
 *    signing appointment or a deposition.
 *  - **An after-hours/weekend/holiday differential.** Evening, weekend, and
 *    holiday bookings commonly carry a time-and-a-half or double-time
 *    surcharge, the same convention overtime-pay-calculator documents for
 *    hourly employees, applied here to a contracted interpreting rate.
 *  - **Team interpreting.** RID's own Standard Practice Papers recommend a
 *    two-interpreter team, splitting turns roughly every 20-30 minutes, for
 *    assignments running past about two hours or carrying high cognitive
 *    load (legal, medical, and mental-health settings are the settings most
 *    often named) -- both to prevent the accuracy drop that comes with
 *    interpreter fatigue and because sign language interpreting is
 *    bidirectional simultaneous cognitive work with no natural pause. This
 *    calculator flags when a booking matches that shape rather than silently
 *    pricing a single interpreter for a six-hour deposition; it never forces
 *    the team rate on, because the actual decision depends on the specific
 *    venue, funder, and interpreters involved.
 *  - **A late-cancellation fee.** Freelance interpreting contracts commonly
 *    carry a tiered cancellation policy, because a cancelled booking is
 *    unsold time the interpreter already turned other work away for. The
 *    three-tier schedule here (full fee inside 24 hours, half fee 24-48
 *    hours, no fee beyond that) is a commonly cited starting shape, not a
 *    standard -- exposed as adjustable tiers.
 *
 * Every multiplier, minimum, and cancellation tier here is a widely cited
 * industry convention or rule of thumb, not a fixed or authoritative
 * standard, and every result is a starting point for a negotiation or an
 * invoice draft -- never a quote, guarantee, or valuation performed on the
 * interpreter's behalf, and never legal or medical advice about the
 * underlying assignment. See index.html's disclaimer for the exact wording.
 */

export const SETTINGS = ["general", "educational", "medical", "legal", "mental_health"];

export const SETTING_LABELS = {
  general: "General / business / community",
  educational: "Educational (K-12 or postsecondary)",
  medical: "Medical / healthcare",
  legal: "Legal (deposition, hearing, courtroom)",
  mental_health: "Mental health / counseling",
};

// Settings RID's own Standard Practice Papers most often name as carrying the
// cognitive load and stakes that justify a team, when the booking also runs
// past the team-interpreting length threshold below.
export const TEAM_RECOMMENDED_SETTINGS = new Set(["medical", "legal", "mental_health"]);

export const DIFFERENTIALS = ["none", "evening_weekend", "holiday"];

export const DIFFERENTIAL_LABELS = {
  none: "Standard business hours",
  evening_weekend: "Evening or weekend",
  holiday: "Recognized holiday",
};

export const DEFAULT_MINIMUM_HOURS = 2; // commonly cited freelance/contract booking minimum
export const DEFAULT_MILEAGE_RATE = 0.67; // commonly cited standard mileage rate -- check the current published rate
export const EVENING_WEEKEND_MULTIPLIER = 1.5; // commonly cited after-hours/weekend differential
export const HOLIDAY_MULTIPLIER = 2; // commonly cited holiday differential
export const TEAM_INTERPRETING_MULTIPLIER = 2; // a second interpreter billed for the same block
export const TEAM_RECOMMENDED_HOURS = 2; // RID SPP guidance: consider a team past roughly this length

export const DIFFERENTIAL_MULTIPLIERS = {
  none: 1,
  evening_weekend: EVENING_WEEKEND_MULTIPLIER,
  holiday: HOLIDAY_MULTIPLIER,
};

// A commonly used three-tier late-cancellation schedule, sorted by
// descending notice. Adjust to match your own contract -- agencies and
// individual interpreters set their own thresholds and percentages.
export const DEFAULT_CANCELLATION_TIERS = [
  { minHoursNotice: 48, feePercentage: 0, label: "48+ hours notice" },
  { minHoursNotice: 24, feePercentage: 50, label: "24-47.9 hours notice" },
  { minHoursNotice: 0, feePercentage: 100, label: "Under 24 hours notice" },
];

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function num(value) {
  return Number.isFinite(value) ? value : Number(value);
}

function nonNegative(value) {
  const n = num(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function positiveOrDefault(value, fallback) {
  const n = num(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clamp01(value) {
  const n = num(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Price a single interpreting assignment.
 *
 * @param {{
 *   hoursRequested: number,
 *   minimumHours?: number,
 *   hourlyRate: number,
 *   setting?: string,
 *   differential?: "none" | "evening_weekend" | "holiday",
 *   teamInterpreting?: boolean,
 *   travelMinutesEachWay?: number,
 *   travelBillingFraction?: number,
 *   travelMilesRoundTrip?: number,
 *   mileageRate?: number,
 * }} input
 */
export function computeAssignmentQuote({
  hoursRequested,
  minimumHours = DEFAULT_MINIMUM_HOURS,
  hourlyRate,
  setting = "general",
  differential = "none",
  teamInterpreting = false,
  travelMinutesEachWay = 0,
  travelBillingFraction = 1,
  travelMilesRoundTrip = 0,
  mileageRate = DEFAULT_MILEAGE_RATE,
}) {
  const requestedHours = nonNegative(hoursRequested);
  const minHours = positiveOrDefault(minimumHours, DEFAULT_MINIMUM_HOURS);
  const billableHours = Math.max(requestedHours, requestedHours > 0 ? minHours : 0);

  const rate = nonNegative(hourlyRate);
  const diffKey = DIFFERENTIALS.includes(differential) ? differential : "none";
  const differentialMultiplier = DIFFERENTIAL_MULTIPLIERS[diffKey];

  const baseInterpretingFee = billableHours * rate * differentialMultiplier;
  const teamMultiplier = teamInterpreting ? TEAM_INTERPRETING_MULTIPLIER : 1;
  const interpretingFee = round2(baseInterpretingFee * teamMultiplier);

  const travelHoursRoundTrip = (nonNegative(travelMinutesEachWay) * 2) / 60;
  const billedFraction = clamp01(travelBillingFraction);
  const travelTimeFee = round2(travelHoursRoundTrip * rate * billedFraction);

  const mileageFee = round2(nonNegative(travelMilesRoundTrip) * nonNegative(mileageRate));

  const total = round2(interpretingFee + travelTimeFee + mileageFee);
  const effectiveHourlyOnAssignment = billableHours > 0 ? round2(interpretingFee / billableHours) : 0;

  const findings = [];

  if (requestedHours === 0 || rate === 0) {
    findings.push({
      id: "missing-input",
      severity: SEVERITY.INFO,
      title: "Enter the hours requested and your hourly rate",
      detail:
        "Both come from the assignment request and your own rate. The quote below is zero until real numbers are entered.",
    });
  }

  if (requestedHours > 0 && requestedHours < minHours) {
    findings.push({
      id: "minimum-applied",
      severity: SEVERITY.INFO,
      title: `Booking minimum applied: billing ${minHours} hour(s), not ${requestedHours}`,
      detail:
        "A two-hour (or contract-specific) minimum is the most commonly cited floor for a freelance interpreting booking -- the time is blocked off and cannot be resold, regardless of how long the actual assignment runs.",
    });
  }

  if (
    billableHours > TEAM_RECOMMENDED_HOURS &&
    TEAM_RECOMMENDED_SETTINGS.has(setting) &&
    !teamInterpreting
  ) {
    findings.push({
      id: "team-interpreting-recommended",
      severity: SEVERITY.MEDIUM,
      title: "Consider a two-interpreter team for this booking",
      detail:
        `RID's Standard Practice Papers recommend a team of two interpreters, splitting turns roughly every 20-30 minutes, for assignments past about ${TEAM_RECOMMENDED_HOURS} hours in a ${SETTING_LABELS[setting] ?? setting} setting -- interpreter fatigue on a long, cognitively demanding assignment measurably increases errors. This quote is priced for a single interpreter; check "Team interpreting" above to price both.`,
    });
  }

  if (teamInterpreting) {
    findings.push({
      id: "team-interpreting-priced",
      severity: SEVERITY.INFO,
      title: "Team interpreting doubles the interpreting fee",
      detail:
        "This estimate doubles only the interpreting fee, on the assumption both interpreters share the same booking block. If the two interpreters travel separately, add a second travel-time and mileage estimate on top of this total.",
    });
  }

  return {
    billableHours: round2(billableHours),
    minimumApplied: requestedHours > 0 && requestedHours < minHours,
    differentialMultiplier,
    interpretingFee,
    travelTimeFee,
    mileageFee,
    total,
    effectiveHourlyOnAssignment,
    findings,
  };
}

/**
 * Late-cancellation fee for a previously scheduled assignment.
 *
 * @param {{
 *   scheduledFee: number,
 *   hoursNotice: number,
 *   tiers?: Array<{ minHoursNotice: number, feePercentage: number, label?: string }>,
 * }} input
 */
export function computeCancellationFee({ scheduledFee, hoursNotice, tiers = DEFAULT_CANCELLATION_TIERS }) {
  const fee = nonNegative(scheduledFee);
  const notice = nonNegative(hoursNotice);

  const sortedTiers = [...tiers].sort((a, b) => b.minHoursNotice - a.minHoursNotice);
  const tier =
    sortedTiers.find((t) => notice >= t.minHoursNotice) ?? sortedTiers[sortedTiers.length - 1];

  const feeOwed = round2((fee * (tier?.feePercentage ?? 0)) / 100);

  const findings = [];
  if (fee === 0) {
    findings.push({
      id: "missing-input",
      severity: SEVERITY.INFO,
      title: "Enter the fee that was scheduled for this booking",
      detail: "The cancellation fee is a percentage of the fee that was originally scheduled.",
    });
  }
  if (fee > 0 && (tier?.feePercentage ?? 0) === 0) {
    findings.push({
      id: "no-fee-owed",
      severity: SEVERITY.INFO,
      title: "No cancellation fee under this schedule",
      detail: "The notice given clears every tier's threshold in the schedule above.",
    });
  } else if (fee > 0 && (tier?.feePercentage ?? 0) < 100) {
    findings.push({
      id: "partial-fee-owed",
      severity: SEVERITY.LOW,
      title: `${tier?.feePercentage ?? 0}% cancellation fee applies`,
      detail: tier?.label ? `Notice given falls in the "${tier.label}" tier.` : undefined,
    });
  }

  return {
    feePercentage: tier?.feePercentage ?? 0,
    tierLabel: tier?.label ?? null,
    feeOwed,
    findings,
  };
}
