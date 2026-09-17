// A technician quoting a job with a partner, or re-opening this tool on a
// different device, has to retype thirteen numbers every time -- techs,
// hours, PPE cost, waste pounds, and the rest -- because the only state this
// page kept was whatever was still in the tab. This module lets the whole
// bid scenario travel: to the visitor's own browser between visits, and into
// a link they can send themselves or a partner.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The
// scenario travels in the URL *fragment* (`#...`), never the query string: a
// fragment is not sent in the request line a server logs, nor in a
// `Referer` header a later click would carry.
//
// The required field list is imported from `calc.mjs`'s `DEFAULTS` rather
// than restated here, so a field added to the arithmetic is shareable the
// moment it exists -- this portfolio has twice paid for a copied field list
// going stale instead of being derived (see CLAUDE.md, "168 became 169").
//
// `proposedPrice` is the one field that is not: it is only present once a
// technician has a real quote to check, and `''` (nothing typed yet) is a
// materially different state from `0` (a giveaway job). Leaving it out of
// the link would ship the exact silent-divergence defect this portfolio has
// shipped before (a link that dropped fields, so the recipient computed a
// different profit than the sender saw) -- here a partner who opens a
// shared link would no longer see the price the sender was checking, and
// the "check a quoted price" panel would go quiet with nothing on screen to
// say why. `formValues` still clears any field a link does not carry,
// rather than leaving it unwritten: the same link could be opened on a page
// mid-edit or holding a saved draft, and leaving a stale value sitting in an
// unrelated field would silently mix the sender's price with a stranger's
// labor rate.

import { DEFAULTS } from './calc.mjs';

/** Every field `computeJobBid` requires -- calc.mjs's own DEFAULTS keys. */
export const REQUIRED_FIELD_IDS = Object.freeze(Object.keys(DEFAULTS));

/** The one field the arithmetic treats as optional. See the header comment
 * above for why a link with nothing checked must leave this cleared, not
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

/**
 * Every field the form owns, as the string a form control holds -- the
 * shared value where the link had one, and `''` where it did not.
 */
export function formValues(decoded) {
  const source = decoded || {};
  return Object.fromEntries(FIELD_IDS.map((id) => [id, id in source ? String(source[id]) : '']));
}
