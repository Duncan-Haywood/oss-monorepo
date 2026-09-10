// A seller re-enters the same category preset, rates, and lot numbers on
// every single sale — the exact retyping this venture's own kill criteria
// asks whether they will put up with twice in 90 days. This module keeps the
// whole form: restored in the visitor's own browser between visits, and
// carried into a link they can send themselves or a co-seller.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The lot
// travels in the URL *fragment* (`#...`), never the query string: a fragment
// is not sent in the request line a server logs, nor in a `Referer` header a
// later click would carry, so a shared lot stays off the machines it passes
// through on the way to the recipient.
//
// The numeric field list is imported from `calc.mjs` rather than restated
// here, so a field added to the arithmetic is shareable and restorable the
// moment it exists — the drift `page.test.mjs` guards against on every other
// calculator in this fleet.

import { INPUT_IDS, CATEGORY_PRESETS } from './calc.mjs';

const FLAG_FIELDS = Object.freeze(['giveaway']);
const CHOICE_FIELDS = Object.freeze({ categoryPreset: Object.keys(CATEGORY_PRESETS) });

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of INPUT_IDS) {
    // Blank uses the calculator's own fallback (commissionCap blank = no cap);
    // an explicit zero does not, so the two must stay distinguishable.
    if (input?.[field] === '') {
      params.set(field, '');
      continue;
    }
    const value = Number(input?.[field]);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  for (const field of FLAG_FIELDS) {
    if (input?.[field] === undefined) continue;
    // Encoded even when false — a sender who unticked "giveaway" sends a link
    // that must not re-tick it for the recipient.
    params.set(field, input[field] ? '1' : '0');
  }
  for (const [field, allowed] of Object.entries(CHOICE_FIELDS)) {
    const value = input?.[field];
    if (typeof value === 'string' && allowed.includes(value)) params.set(field, value);
  }
  return params.toString();
}

export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || '').replace(/^[?#]/, ''));
  const result = {};
  for (const field of INPUT_IDS) {
    if (!params.has(field)) continue;
    if (params.get(field) === '') {
      result[field] = '';
      continue;
    }
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  for (const field of FLAG_FIELDS) {
    if (!params.has(field)) continue;
    result[field] = params.get(field) === '1';
  }
  // A crafted link cannot select a preset id the page does not offer — only
  // one of the four rows `calc.mjs` actually knows the rates for survives.
  for (const [field, allowed] of Object.entries(CHOICE_FIELDS)) {
    if (!params.has(field)) continue;
    const raw = params.get(field);
    if (allowed.includes(raw)) result[field] = raw;
  }
  return result;
}
