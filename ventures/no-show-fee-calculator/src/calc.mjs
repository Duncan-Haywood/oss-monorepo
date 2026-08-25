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

  if (price < 0) errors.push("Appointment price cannot be negative.");
  if (bookingsPerWeek < 0) errors.push("Bookings per week cannot be negative.");
  if (!isFinitePercent(noShowRatePct)) errors.push("No-show / late-cancel rate must be between 0 and 100.");
  if (!isFiniteNonNegative(noticeHours)) errors.push("Required notice window cannot be negative.");
  if (!isFinitePercent(feePercent)) errors.push("Fee percentage must be between 0 and 100.");
  if (!isFinitePercent(enforcementRatePct)) errors.push("Assumed enforcement rate must be between 0 and 100.");

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
 * Runs every calculation from a single validated input set.
 * @param {{ price: number, bookingsPerWeek: number, noShowRatePct: number, noticeHours: number, feePercent: number, enforcementRatePct: number }} values
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
 * The existing calculator treats `noticeHours` as policy wording only. This
 * table is the money question: 24 hours vs 48 hours is not a legal nicety,
 * it is how often you can actually sell the hour again. Fill rates are the
 * user's assumption, same as the enforcement rate — the tool does not invent
 * a waitlist.
 *
 * Fee revenue is left out of this comparison on purpose. A fee can still be
 * collected on a late cancel even if the slot is refilled; mixing the two
 * would double-count cash and hide the empty-chair problem the longer
 * window is meant to solve.
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
  "fillSameDayPct",
  "fillDayAheadPct",
  "fillTwoDayPct",
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
