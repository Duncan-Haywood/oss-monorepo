// A host re-types the same trip, plan and booking-window assumptions every
// time they price a new request. This module keeps that form -- trip price,
// length, earnings plan, booking window, extra fees and trips per month --
// restored in the visitor's own browser between sessions, and carried into a
// link they can send themselves or a co-host.
//
// Nothing here is transmitted. `localStorage` is the visitor's own disk, and
// the link is only ever built in their browser and copied by them. The visit
// travels in the URL *fragment* (`#...`), never the query string: a fragment
// is not sent in the request line a server logs, nor in a `Referer` header a
// later click would carry.
//
// The plan and booking-window choices are validated against calc.mjs's own
// lists, so a crafted link cannot put an unknown value into the selects.

import { EARNINGS_PLANS, BOOKING_WINDOWS } from './calc.mjs';

export const NUMBER_FIELDS = ['tripPrice', 'days', 'extraMileageFee', 'lateReturnFee', 'additionalUsageFee', 'tripsPerMonth'];
export const CHOICE_FIELDS = { plan: EARNINGS_PLANS, bookingWindow: BOOKING_WINDOWS };
export const FIELD_IDS = [...NUMBER_FIELDS, ...Object.keys(CHOICE_FIELDS)];

function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function usableChoice(id, value) {
  return CHOICE_FIELDS[id].includes(value) ? value : null;
}

export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELDS) {
    const value = usableNumber(input?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  for (const id of Object.keys(CHOICE_FIELDS)) {
    const value = usableChoice(id, input?.[id]);
    if (value !== null) params.set(id, value);
  }
  return params.toString();
}

export function decodeInputs(source) {
  const params = new URLSearchParams(String(source || '').replace(/^[?#]/, ''));
  const result = {};
  for (const id of NUMBER_FIELDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) result[id] = value;
  }
  for (const id of Object.keys(CHOICE_FIELDS)) {
    if (!params.has(id)) continue;
    const value = usableChoice(id, params.get(id));
    if (value !== null) result[id] = value;
  }
  return result;
}

// The supported way to apply a decoded link: every field the form owns gets
// written, so a field the sender left blank is cleared rather than left
// showing whatever the recipient's own saved draft put there. A plain object
// spread (`{ ...saved, ...fromLink }`) would let the saved value through.
export function formValues(decoded) {
  return Object.fromEntries(FIELD_IDS.map(id => [id, decoded?.[id] !== undefined ? String(decoded[id]) : '']));
}
