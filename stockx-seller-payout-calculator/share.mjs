// A seller re-types the same fee assumptions -- sale price, cost basis,
// seller fee, Fast Shipping discount, payment processing, shipping cost --
// for every item they price. This module keeps that one-sale form, plus the
// one month-wide setting (target monthly profit) that shapes the "Your month
// on StockX" summary: restored in the visitor's own browser between
// sessions, and carried into a link they can send themselves or a co-seller.
//
// Deliberately out of scope: the per-sale rows in that same table. Their own
// copy promises the sales list is never saved anywhere, and this module must
// not quietly break that promise -- so it only ever touches the fields in
// calc.mjs's DEFAULTS below, never a sale-row value.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The visit
// travels in the URL *fragment* (`#...`), never the query string: a fragment
// is not sent in the request line a server logs, nor in a `Referer` header a
// later click would carry, so a shared visit stays off the machines it
// passes through on the way to the recipient.
//
// The field list is imported from `calc.mjs`'s `DEFAULTS` rather than
// restated here, so a field added to the arithmetic is shareable and
// restorable the moment it exists.

import { DEFAULTS } from './calc.mjs';

export const FIELD_IDS = Object.keys(DEFAULTS);

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

// The supported way to apply a decoded link: every field the form owns gets
// written, so a field the sender left blank is cleared rather than left
// showing whatever the *recipient's own saved draft* put there. Applying a
// decoded link with a plain object spread (`{ ...saved, ...fromLink }`) looks
// like the link wins and is not -- a key fromLink omits still falls through
// to saved's value for that key. See platform/ci/check_shared_link_clears.py.
export function formValues(decoded) {
  return Object.fromEntries(FIELD_IDS.map(id => [id, decoded?.[id] !== undefined ? String(decoded[id]) : '']));
}
