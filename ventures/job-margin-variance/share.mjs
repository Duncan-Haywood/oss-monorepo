// Shareable job-variance-review link.
//
// The page already offers "Copy review" as a plain-text report, but that
// format is meant to be read, not reopened — pasting it into a text message
// gives a foreman or bookkeeper the numbers, not a live worksheet they can
// adjust. This link encodes the eight fields the form reads into the URL
// fragment, so pasting it reopens the same estimate-vs-actual comparison,
// recalculated, for whoever opens it.
//
// Same convention as this month's other share links across the portfolio:
// the payload rides in the URL fragment, which browsers never send to a
// server or log in a Referer header, and only a fixed, validated shape is
// read back — a crafted fragment cannot inject an unexpected field into the
// form. `hourlyRate` and `bidPrice` are optional in the form itself, so a
// link built without them simply omits those two params rather than sending
// zeroes that would trip calc.mjs's own "labor rate needed" checks.

/** Every field the form reads, in calc.mjs's own `ids` order. */
export const NUMBER_FIELD_IDS = Object.freeze([
  'estimatedHours',
  'actualHours',
  'estimatedMaterials',
  'actualMaterials',
  'estimatedOther',
  'actualOther',
  'hourlyRate',
  'bidPrice',
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
 * built with the optional labor rate or job price left blank does not force
 * those fields to zero for the recipient.
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
 * thrown on, so a truncated link still opens the page on the fields that
 * survived. `calculate` in calc.mjs still validates the result on its own
 * terms (a job price needs a labor rate, for example).
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
