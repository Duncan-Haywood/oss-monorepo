// Shareable scenario link.
//
// This calculator has no save mechanism at all today — every visit starts
// from the shipped 100-subscriber example. A founder testing a price change
// with a co-founder or an investor has no way to hand over the exact scenario
// they just built; they can only describe four numbers in a message and hope
// the recipient retypes them correctly. A link that reopens the page with the
// same subscriber count, current price, proposed price and fixed costs
// already filled in removes that retyping step entirely.
//
// All four fields ride in the link — a dropped field would silently change
// the maximum-churn headline the recipient sees, with the page's own
// error-hiding behaviour on an invalid state giving no sign anything was
// missing. The payload rides in the URL fragment, which browsers never send
// to a server, matching this page's own "your numbers are never uploaded"
// promise. Subscriber counts and prices are ordinary business inputs, not
// personal or payroll data, so nothing here is more sensitive than the rest
// of this fleet's share links.

/** Mirrors the `ids` array in `index.html`. */
export const FIELD_IDS = Object.freeze(['customers', 'currentPrice', 'proposedPrice', 'monthlyCosts']);

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * Encode the page's current inputs as a URL fragment payload.
 *
 * Blank and unusable fields are omitted rather than sent as empty strings, so
 * the recipient's page keeps its own starting default for anything the
 * sender left alone instead of being handed a field it must treat as zero.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Anything unrecognised, negative, or non-numeric is dropped rather than
 * thrown: a truncated link pasted into a text message should open the page
 * on the fields that survived, not on an error.
 */
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ''));
  const inputs = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
