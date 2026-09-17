// Shareable deposit-plan link.
//
// This page already offers "Copy policy" — a text copy of the drafted
// wording — but that copy carries none of the numbers behind it. A business
// owner checking this with a bookkeeper, a business partner, or a
// franchisor has to read out ten fields (price, deposit percent, bookings
// per week, both booking-rate and no-show assumptions, the notice window,
// plus the business and service names) for the other person to retype
// before they can see the same plan, let alone try a different assumption
// against it. This link reopens the calculator with every field already
// filled in and the plan recalculated, so the recipient can verify the
// numbers or change one assumption and see what moves.
//
// Same convention as this month's other share links across the portfolio:
// the payload rides in the URL fragment, which browsers never send to a
// server or log in a Referer header, and only a fixed, validated shape is
// read back — a crafted fragment cannot inject an unexpected field into the
// form.

/** Every numeric field the calculator reads. */
export const NUMBER_FIELD_IDS = Object.freeze([
  'price', 'depositPercent', 'bookingsPerWeek', 'bookingRate',
  'noShowWithout', 'noShowWith', 'noticeHours',
]);

/** Currency and the optional policy-wording names: free text, not numbers. */
export const TEXT_FIELD_IDS = Object.freeze(['currency', 'businessName', 'serviceName']);

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * Encode the form's current values as a URL fragment payload.
 *
 * A blank or unusable numeric field is omitted rather than sent as zero, so
 * a link built before every field is filled in does not overwrite the
 * recipient's own defaults with zeroes. A blank text field is omitted for
 * the same reason.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of TEXT_FIELD_IDS) {
    const value = inputs?.[id];
    if (typeof value === 'string' && value !== '') params.set(id, value);
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Anything unrecognised, negative, or non-numeric in a numeric field is
 * dropped rather than throwing, so a truncated link pasted into a text
 * message still opens the page on the fields that survived instead of
 * failing outright. `parseInputs` in calc.mjs still validates the result
 * before anything is calculated from it.
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
  for (const id of TEXT_FIELD_IDS) {
    if (params.has(id)) inputs[id] = params.get(id);
  }
  return inputs;
}
