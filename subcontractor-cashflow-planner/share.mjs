// Shareable cash-flow-scenario link.
//
// The page already offers "Export CSV" and "Save locally", but neither helps
// a subcontractor check a scenario with a bookkeeper or a client before
// committing to terms: CSV has to be opened in a spreadsheet to be read back,
// and "Save locally" never leaves the sender's own browser. This link encodes
// the eleven fields the form reads into the URL fragment, so pasting it into
// a message reopens the same scenario, recalculated, for whoever opens it.
//
// Same convention as this month's other share links across the portfolio:
// the payload rides in the URL fragment, which browsers never send to a
// server or log in a Referer header, and only a fixed, validated shape is
// read back — a crafted fragment cannot inject an unexpected field into the
// form.

/** Every numeric field the form reads, in `calc.mjs`'s own field order. */
export const NUMBER_FIELD_IDS = Object.freeze([
  'invoice', 'materials', 'weeklyBurn', 'terms', 'retention',
  'retentionRelease', 'delay', 'startingCash', 'deposit', 'supplierTerms', 'apr',
]);

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * Encode the form's current values as a URL fragment payload.
 *
 * A blank or unusable field is omitted rather than sent as zero, so a link
 * built before every field is filled in does not overwrite the recipient's
 * own defaults with zeroes.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Anything unrecognised, negative, or non-numeric is dropped rather than
 * thrown on, so a truncated link pasted into a text message still opens the
 * page on the fields that survived instead of failing outright. `planCashflow`
 * in calc.mjs still clamps the result before anything is calculated from it.
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
  return inputs;
}
