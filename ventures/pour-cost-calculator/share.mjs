// A bar pricing more than one recipe re-types the same bottle costs, pour
// sizes, and target every time — with no way to hand a recipe to a partner,
// a GM, or their own other device without retyping every field. This module
// keeps the whole recipe: restored from a link into the same draft the page
// already saves locally between visits.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The
// recipe travels in the URL *fragment* (`#...`), never the query string: a
// fragment is not sent in the request line a server logs, nor in a
// `Referer` header a later click would carry, so a shared recipe stays off
// the machines it passes through on the way to the recipient.
//
// The field list is imported from `calc.mjs`'s `ALL_INPUT_IDS` rather than
// restated here, so a field added to the arithmetic is shareable the moment
// it exists.

import { ALL_INPUT_IDS } from './calc.mjs';

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of ALL_INPUT_IDS) {
    const value = usableNumber(input?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || '').replace(/^[?#]/, ''));
  const result = {};
  for (const id of ALL_INPUT_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) result[id] = value;
  }
  return result;
}
