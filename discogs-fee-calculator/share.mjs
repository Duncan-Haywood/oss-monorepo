// A seller pricing more than one listing has no way to hand a sale's numbers
// to a co-seller or their own other device without retyping every field --
// the "Save" button already shows the browser-local draft was never enough
// by itself. This module keeps the whole form: restored from a link into the
// same draft the page already saves locally between visits.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The
// numbers travel in the URL *fragment* (`#...`), never the query string: a
// fragment is not sent in the request line a server logs, nor in a
// `Referer` header a later click would carry, so a shared sale stays off
// the machines it passes through on the way to the recipient.
//
// The field list is imported from `calc.mjs`'s `INPUT_IDS` and `TOGGLE_IDS`
// rather than restated here, so a field added to the arithmetic is
// shareable the moment it exists.

import { INPUT_IDS, TOGGLE_IDS } from './calc.mjs';

export const FIELD_IDS = Object.freeze([...INPUT_IDS]);

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
  for (const id of TOGGLE_IDS) {
    if (input?.[id] === undefined || input?.[id] === null) continue;
    params.set(id, input[id] ? '1' : '0');
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
  for (const id of TOGGLE_IDS) {
    if (!params.has(id)) continue;
    const raw = params.get(id);
    // Only the two spellings this module writes. Anything else is a
    // corrupted link, and guessing at it would silently flip the value.
    if (raw === '1' || raw === '0') result[id] = raw === '1';
  }
  return result;
}

/**
 * Turns a decoded link into a value for every field the form owns.
 *
 * Absent is not the same as unchanged: a link that did not carry a field
 * clears it to blank (or off, for the toggle) rather than leaving the
 * recipient's own saved draft sitting in that box, so a plain sale never
 * opens showing a toggle, or an item cost, the sender never
 * sent.
 */
export function formValues(decoded) {
  const values = Object.fromEntries(FIELD_IDS.map(id => [id, decoded?.[id] !== undefined ? String(decoded[id]) : '']));
  for (const id of TOGGLE_IDS) {
    values[id] = decoded?.[id] === true;
  }
  return values;
}
