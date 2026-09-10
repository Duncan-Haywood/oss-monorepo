// Send an event quote to whoever needs the numbers on the other end -- a
// co-owner pricing the same booking from home, a planner who wants the
// figures behind the price, or the operator's own phone at the venue.
//
// Today the only way to move a quote between those people is to read out
// eighteen figures over the phone: guest count, food cost per guest, three
// time fields, drive minutes, miles, mileage rate, staff count and rate,
// four flat costs, the weekend premium, overhead, target margin, and other
// cost -- plus whatever price is already on the table. Most of the time
// nobody does, and the second person re-quotes from a half-remembered
// number instead of the operator's actual arithmetic.
//
// So the whole quote travels in a link, and the link is built and copied in
// the reader's own browser. The figures ride in the URL *fragment* (`#...`),
// never the query string: a fragment is not sent in the request line a
// server logs, nor in the `Referer` header a later click carries. A quote's
// costs and price are the numbers an operator already hands a planner or a
// festival organizer in the ordinary course of business, so putting them in
// a link is no more exposing than the quote itself.
//
// ## Absent is not the same as zero, and not the same as unchanged
//
// `proposedPrice` is the one field this venture treats as optional: it is
// only present once someone has a number on the table to check, and `''`
// (never sent yet) is a materially different state from `0` (a free
// booking). A link built before a price was proposed must therefore leave
// `proposedPrice` out entirely -- and if the page then left the recipient's
// own leftover `proposedPrice` sitting in that field, the recipient would
// check a stranger's number against this quote's breakeven while believing
// they were looking at a clean quote with nothing proposed yet. That is the
// exact silent-divergence defect `share.mjs` has shipped once already
// elsewhere in this portfolio (a link that dropped `quantity` and
// `targetMargin`, so the recipient computed a different profit than the
// sender saw).
//
// `formValues` below is therefore the supported way to open a link: it
// writes *every* field the form owns, clearing the ones the link did not
// carry (including `proposedPrice`), so what the recipient sees is the
// sender's quote and nothing of their own. `calc.mjs` treats a blank
// `proposedPrice` as "nothing to check" rather than a value to validate, so
// a cleared field fails silent in exactly the safe direction: the proposed-
// price panel just stays hidden until the recipient types their own number.
//
// The 18 required fields are `calc.mjs`'s own `DEFAULTS` keys, not restated
// here, so a field added to the arithmetic is shareable the moment it
// exists. This repository has twice paid for a copied rule going stale
// instead of being imported -- see CLAUDE.md, "168 became 169".

import { DEFAULTS } from './calc.mjs';

/** Every field `calculateQuote` requires -- calc.mjs's own DEFAULTS keys. */
export const REQUIRED_FIELD_IDS = Object.freeze(Object.keys(DEFAULTS));

/** The one field the arithmetic treats as optional. See the header comment
 * above for why a link with none proposed must leave this cleared, not
 * defaulted to 0 or left holding the recipient's own leftover figure. */
export const OPTIONAL_FIELD_IDS = Object.freeze(['proposedPrice']);

export const FIELD_IDS = Object.freeze([...REQUIRED_FIELD_IDS, ...OPTIONAL_FIELD_IDS]);

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
 * whether to open on the shared quote or on its own worked example. */
export function hasSharedInputs(decoded) {
  return Object.keys(decoded || {}).length > 0;
}

/**
 * Every field the form owns, as the string a form control holds -- the
 * shared value where the link had one, and `''` where it did not.
 *
 * Returning the cleared fields explicitly, rather than leaving the caller to
 * remember to blank them, is the whole point: see the header comment above.
 * A caller that iterates this result sets the form to exactly the sender's
 * quote, `proposedPrice` included.
 */
export function formValues(decoded) {
  return Object.fromEntries(
    FIELD_IDS.map((id) => [id, id in (decoded || {}) ? String(decoded[id]) : '']),
  );
}
