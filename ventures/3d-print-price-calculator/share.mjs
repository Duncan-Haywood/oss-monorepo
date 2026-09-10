// A maker pricing a print for a customer, a co-seller on the same Etsy shop,
// or their own other device has to retype fourteen numbers every time --
// filament grams, printer wattage, failure rate, and the rest -- because the
// only state this page kept was whatever was still in the tab. This module
// lets the whole pricing scenario travel: to the visitor's own browser
// between visits, and into a link they can send themselves or a co-seller.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The
// scenario travels in the URL *fragment* (`#...`), never the query string: a
// fragment is not sent in the request line a server logs, nor in a
// `Referer` header a later click would carry.
//
// The field list is imported from `calc.mjs`'s `DEFAULTS` rather than
// restated here, so a field added to the arithmetic is shareable the moment
// it exists -- this portfolio has twice paid for a copied field list going
// stale instead of being derived (see CLAUDE.md, "168 became 169").
//
// One field is not in DEFAULTS on purpose: `actualSellingPrice` is an
// optional "check a price I'm already charging" input the form keeps in its
// own slot rather than the required-fields loop, so it has no shipped
// default to leave blank. It still has to travel with the rest of the
// scenario, or a maker's real listed price silently vanishes the moment
// they share or save it -- the exact defect the catalogue's roundtrip check
// caught here. `OPTIONAL_FIELD_IDS` names it explicitly rather than folding
// it into DEFAULTS, so the "no shipped default" property stays visible
// instead of being inferred from an omission.
//
// `formValues` still clears any field a link does not carry, rather than
// leaving it unwritten: the same link could be opened on a page mid-edit or
// holding a saved draft, and leaving a stale value sitting in an unrelated
// field would silently mix the sender's price with a stranger's electricity
// rate.

import { DEFAULTS } from './calc.mjs';

export const FIELD_IDS = Object.keys(DEFAULTS);
export const OPTIONAL_FIELD_IDS = ['actualSellingPrice'];

const SHARED_FIELD_IDS = [...FIELD_IDS, ...OPTIONAL_FIELD_IDS];

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of SHARED_FIELD_IDS) {
    const value = usableNumber(input?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || '').replace(/^[?#]/, ''));
  const result = {};
  for (const id of SHARED_FIELD_IDS) {
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
  return Object.fromEntries(SHARED_FIELD_IDS.map((id) => [id, id in source ? String(source[id]) : '']));
}
