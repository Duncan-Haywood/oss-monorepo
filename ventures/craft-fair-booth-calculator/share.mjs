// Move one event's numbers between the people who decide on it — a partner
// at home looking at the same application, a studio-mate comparing the same
// show, or the maker's own phone in the van at 6am.
//
// The alternative is reading twenty figures down the phone: booth fee, jury
// fee, miles, mileage rate, lodging, parking, display, other, average order
// value, material percent, stock brought, card share, card percent, card
// fixed, four time fields, target rate, and expected sales. Nobody does
// that, so the second person re-decides from a half-remembered booth fee and
// the arithmetic that made the case never crosses the room.
//
// So the whole event travels in a link, built and copied in the reader's own
// browser. The figures ride in the URL *fragment* (`#...`) and never the
// query string: a fragment is not sent in the request line a server logs,
// nor in the `Referer` header a later click carries. What a maker's booth
// fee and expected sales are is the sort of thing they already discuss with
// a partner; putting it in a link they choose to send is no more exposing
// than saying it out loud.
//
// ## Every field, every time
//
// This venture has no optional inputs: `calculateEvent` requires all twenty,
// and each has a working default, so a link either carries a field or the
// recipient's own leftover value would sit in it. `formValues` below is
// therefore the supported way to open a link — it writes *every* field the
// form owns, clearing the ones the link did not carry, so what the recipient
// sees is the sender's event and nothing of their own.
//
// The alternative — iterating the decoded object and setting only what it
// held — is the exact silent-divergence defect this portfolio has already
// shipped once (a `share.mjs` elsewhere dropped `quantity` and
// `targetMargin`, so the recipient computed a different profit than the
// sender saw, with nothing on screen to say so). A wrong number that looks
// like a right number is worse than an error.
//
// The field list is `calc.mjs`'s own `DEFAULTS` keys rather than a copy, so
// a field added to the arithmetic becomes shareable the moment it exists.
// This repository has twice paid for a copied rule going stale instead of
// being imported — see CLAUDE.md, "168 became 169".

import { DEFAULTS } from './calc.mjs';

/** Every field `calculateEvent` requires — calc.mjs's own DEFAULTS keys. */
export const FIELD_IDS = Object.freeze(Object.keys(DEFAULTS));

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (String(value).trim() === '') return null;
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

/** Whether a link carried anything at all. The page uses this to decide
 * whether to open on the shared event or on its own worked example. */
export function hasSharedInputs(decoded) {
  return Object.keys(decoded || {}).length > 0;
}

/**
 * Every field the form owns, as the string a form control holds — the shared
 * value where the link had one, and `''` where it did not.
 *
 * Returning the cleared fields explicitly, rather than leaving the caller to
 * remember to blank them, is the whole point: see the header comment above.
 */
export function formValues(decoded) {
  return Object.fromEntries(
    FIELD_IDS.map((id) => [id, id in (decoded || {}) ? String(decoded[id]) : '']),
  );
}
