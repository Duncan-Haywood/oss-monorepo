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
  const depositPercent = num("depositPercent", "Booking deposit percentage");

  if (price < 0) errors.push("Appointment price cannot be negative.");
  if (bookingsPerWeek < 0) errors.push("Bookings per week cannot be negative.");
  if (!isFinitePercent(noShowRatePct)) errors.push("No-show / late-cancel rate must be between 0 and 100.");
  if (!isFiniteNonNegative(noticeHours)) errors.push("Required notice window cannot be negative.");
  if (!isFinitePercent(feePercent)) errors.push("Fee percentage must be between 0 and 100.");
  if (!isFinitePercent(enforcementRatePct)) errors.push("Assumed enforcement rate must be between 0 and 100.");
  if (!isFinitePercent(depositPercent)) errors.push("Booking deposit percentage must be between 0 and 100.");

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
    },
  };
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
  return {
    feeAmount,
    noShowsPerYear,
    annualLostRevenue,
    annualFeeRevenue,
    inputs: values,
  };
}

/**
 * Compares practical fee levels against the same booking exposure.
 * @param {{ price: number, bookingsPerWeek: number, noShowRatePct: number, feePercent: number, enforcementRatePct: number }} values
 */
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
 * @param {{ businessName?: string, serviceName?: string, noticeHours: number, feePercent: number, feeAmount: number, currencySymbol?: string }} args
 */
export function generatePolicyText({
  businessName,
  serviceName,
  noticeHours,
  feePercent,
  feeAmount,
  currencySymbol = "$",
}) {
  const who = businessName && businessName.trim() ? businessName.trim() : "[Your business name]";
  const what = serviceName && serviceName.trim() ? serviceName.trim() : "appointment";
  const notice = formatHours(noticeHours);
  const fee = `${currencySymbol}${feeAmount.toFixed(2)}`;

  const lines = [
    `Cancellation & No-Show Policy — ${who}`,
    "",
    `We ask for at least ${notice} of notice to cancel or reschedule your ${what}.`,
    "",
    `Cancellations or no-shows with less than ${notice} of notice will be charged ${feePercent}% of the ${what} price (${fee}).`,
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
  "businessName",
  "serviceName",
];

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
