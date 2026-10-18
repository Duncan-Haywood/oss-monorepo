// A director pricing more than one classroom re-types the same ratio,
// staffing, and overhead numbers for every room, and the "Reset saved
// inputs" control already shows the browser-local draft was never enough by
// itself -- a director cannot hand a room's numbers to a co-director, a
// board member, or their own other device without retyping them. This
// module keeps the whole classroom: restored from a link into the same
// draft the page already saves locally between visits.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The
// classroom travels in the URL *fragment* (`#...`), never the query string:
// a fragment is not sent in the request line a server logs, nor in a
// `Referer` header a later click would carry, so a shared classroom stays
// off the machines it passes through on the way to the recipient.
//
// The field list is imported from `calc.mjs`'s `INPUT_FIELDS` rather than
// restated here, so a field added to the arithmetic is shareable the moment
// it exists.

import { INPUT_FIELDS } from './calc.mjs';

export const FIELD_IDS = INPUT_FIELDS;

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
    const value = usableNumber(input?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || '').replace(/^[?#]/, ''));
  const result = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) result[id] = value;
  }
  return result;
}
