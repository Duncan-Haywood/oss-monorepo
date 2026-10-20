// A bidder comparing this estimate with a partner, a bookkeeper, or a second
// auction has to retype eleven fields every time the page is reopened,
// because the only state this page keeps is whatever is still in the tab.
// This module lets the whole scenario travel: to the bidder's own browser
// between visits, and into a link they can send themselves or a partner.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk,
// and the link is only ever built in their browser and copied by them. The
// scenario travels in the URL *fragment* (`#...`), never the query string:
// a fragment is not sent in the request line a server logs, nor in a
// `Referer` header a later click would carry.
//
// The field list is imported from `calc.mjs`'s `DEFAULTS` rather than
// restated here, so a field added to the arithmetic is shareable the
// moment it exists -- this portfolio has previously paid for a copied
// field list going stale instead of being derived (see CLAUDE.md, "168
// became 169"). The three boolean fields are carried separately for the
// same reason `includeNiit` is in the depreciation-recapture-calculator's
// sibling module: a link with one unset must leave the checkbox
// unchecked, not default it to a stale `0`.

import { DEFAULTS } from './calc.mjs';

const BOOLEAN_FIELD_IDS = Object.freeze(['biddingOnline', 'payingByCard', 'taxExempt']);
export const NUMERIC_FIELD_IDS = Object.freeze(
  Object.keys(DEFAULTS).filter((id) => !BOOLEAN_FIELD_IDS.includes(id)),
);
export const FIELD_IDS = Object.freeze([...NUMERIC_FIELD_IDS, ...BOOLEAN_FIELD_IDS]);

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of NUMERIC_FIELD_IDS) {
    const value = usableNumber(input?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of BOOLEAN_FIELD_IDS) {
    if (input?.[id]) params.set(id, '1');
  }
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || '').replace(/^[?#]/, ''));
  const result = {};
  for (const id of NUMERIC_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) result[id] = value;
  }
  for (const id of BOOLEAN_FIELD_IDS) {
    if (params.has(id)) result[id] = params.get(id) === '1';
  }
  return result;
}

/**
 * Every field the form owns, as the string or boolean a form control
 * holds -- the shared value where the link had one, and the "nothing
 * entered" state where it did not, so reopening a link never leaves a
 * stale value from an unrelated earlier session sitting in a field.
 */
export function formValues(decoded) {
  const source = decoded || {};
  const values = {};
  for (const id of NUMERIC_FIELD_IDS) values[id] = id in source ? String(source[id]) : '';
  for (const id of BOOLEAN_FIELD_IDS) values[id] = Boolean(source[id]);
  return values;
}
