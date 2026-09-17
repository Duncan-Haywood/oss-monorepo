// Shareable payment-terms link. A freelancer comparing an invoice's cash-flow
// math with a bookkeeper, a business partner, or a client during a terms
// negotiation needs the recipient to see the exact same numbers -- the
// amount, the pay-run assumption, the late-fee rate, the early-pay and
// factoring terms, and the billing-schedule inputs -- not just a screenshot
// of the headline due date. Retyping twenty-plus fields is how that
// comparison never happens, and a silently dropped field is how the
// recipient computes a different cash date than the sender saw. The
// transform is pure: no DOM, no storage, no network, and everything after
// the # never reaches a server.
//
// The three field kinds mirror `index.html`'s own `ids` and `scheduleIds`
// arrays and its `<select id="payRun">` options, rather than a
// hand-duplicated list -- a field added to either array tomorrow rides in
// the link with no edit here needed beyond adding its id to the matching
// list below.

/** Every numeric field the form reads, across both the invoice and schedule sections. */
export const NUMBER_FIELD_IDS = Object.freeze([
  'amount', 'termsDays', 'annualLateRate', 'graceDays', 'monthlyBurn', 'outstanding',
  'earlyPayDays', 'earlyPayDiscountPct', 'annualCarryRate', 'takeRatePct',
  'factorFeePct', 'advancePct', 'reserveDays', 'payRunDay', 'payRunWeekday',
  'projectValue', 'projectDays', 'avgDaysLate', 'depositCollectionDays',
  'depositPct', 'exposureCeiling',
]);

/** Mirrors the `<select id="payRun">` options in index.html. */
export const ENUM_FIELDS = Object.freeze({
  payRun: Object.freeze(['weekdays', 'semimonthly', 'monthly', 'weekly', 'on-due']),
});

/** The one date field on the form, an `<input type="date">`. */
export const DATE_FIELD_IDS = Object.freeze(['invoiceDate']);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableEnum(value, allowed) {
  return allowed.includes(value) ? value : null;
}

// Shape-checked rather than calendar-checked: a link carrying "2026-13-40"
// is passed through to calc.mjs, which already rejects an unusable date the
// same way it rejects one typed by hand. This only guards against a
// fragment that is not a date-shaped string at all.
function usableDate(value) {
  return typeof value === 'string' && ISO_DATE_RE.test(value) ? value : null;
}

/**
 * Encode the form's current values as a URL fragment payload.
 *
 * A blank or unusable field is omitted rather than sent as zero (or, for
 * `invoiceDate`, today's date), so a link built with a field left blank
 * does not silently force a value the sender never chose onto the
 * recipient's page.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
    const value = usableEnum(inputs?.[id], allowed);
    if (value !== null) params.set(id, value);
  }
  for (const id of DATE_FIELD_IDS) {
    const value = usableDate(inputs?.[id]);
    if (value !== null) params.set(id, value);
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Anything unrecognised, negative, non-numeric, or not one of the form's own
 * select options is dropped rather than thrown on, so a truncated or
 * crafted link still opens the page on the fields that survived. `calc.mjs`
 * and `schedule.mjs` still validate the result on their own terms.
 */
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  for (const [id, allowed] of Object.entries(ENUM_FIELDS)) {
    if (!params.has(id)) continue;
    const value = usableEnum(params.get(id), allowed);
    if (value !== null) inputs[id] = value;
  }
  for (const id of DATE_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableDate(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
