// A laundromat or route operator re-types the same wage, machine, and
// overhead numbers every time they want to check a scenario on another
// device, or hand it to a partner or a co-owner without retyping — the
// save-and-share pattern already shipped on dog-walking-route-pricing,
// whatnot-seller-payout, and childcare-tuition-calculator. This module
// keeps the whole form, restored from a link into the same draft the page
// already saves locally between visits.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The
// numbers travel in the URL *fragment* (`#...`), never the query string: a
// fragment is not sent in the request line a server logs, nor in a
// `Referer` header a later click would carry, so a shared scenario stays off
// the machines it passes through on the way to the recipient.
//
// The field list is imported from `calculator.mjs`'s `INPUT_FIELDS` rather
// than restated here, so a field added to the arithmetic is shareable the
// moment it exists.

import { INPUT_FIELDS } from "./calculator.mjs";

export const FIELD_IDS = INPUT_FIELDS;

function usableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
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
  const params = new URLSearchParams(String(source || "").replace(/^[?#]/, ""));
  const result = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) result[id] = value;
  }
  return result;
}

/**
 * Turns a decoded link into a value for every field the form owns.
 *
 * Absent is not the same as unchanged. A shop with no minimum charge, no
 * delivery leg, or no monthly profit goal leaves those boxes blank, and
 * `encodeInputs` omits a blank from the link entirely. Writing only the keys
 * a link carried therefore leaves the recipient's own saved draft sitting in
 * them, so a shared scenario is priced against a minimum charge or a delivery
 * cost the sender never had -- and the page's own promise that "the recipient
 * always sees the sender's numbers" quietly stops being true, with nothing on
 * screen to say so.
 *
 * `formValues` is the supported way to apply a decoded link: every field gets
 * written, so one the link did not carry is cleared to blank rather than left
 * showing someone else's numbers. A blank the calculator treats as zero is
 * then the sender's own blank, which is the point.
 */
export function formValues(decoded) {
  return Object.fromEntries(FIELD_IDS.map(id => [id, decoded?.[id] !== undefined ? String(decoded[id]) : ""]));
}
