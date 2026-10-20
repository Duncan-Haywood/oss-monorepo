// Put the whole scenario in the URL, so a seller can bookmark it, send it to
// a partner, or arrive from the cross-channel comparison with the item already
// filled in.
//
// This page has 80 inputs across a dozen scenarios. Re-entering them to look
// at the same SKU tomorrow, or to ask a business partner whether the MOQ still
// pays, is enough friction that most people do not — which is why the deeper
// scenarios on this page go unread. `where-to-sell-calculator` names that
// exact problem as the thing deciding whether the portfolio's deep tools are
// ever used, and hands off to eBay and Etsy for the same reason.
//
// Nothing is uploaded. The values ride in the URL fragment, which browsers do
// not send to any server, and the page reads them out of `location.hash` in
// the reader's own browser.
//
// Two properties this module is built around:
//
// *Partial links are valid.* A handoff from another calculator knows the price
// and the cost of goods and nothing else. Any field the link omits keeps this
// page's own default rather than arriving as a zero that reads like a real
// answer, so a short link is a correct link.
//
// *The field list is not maintained here.* It is imported from `calc.mjs`,
// where the page also reads it. An allowlist kept beside the encoder is how a
// share link silently loses a field: `where-to-sell-calculator` shipped
// exactly that, dropping `quantity` and `targetMargin` from its own allowlist,
// so the recipient computed a different profit than the sender saw and nothing
// went red.

import {
  INPUT_FIELDS, TOGGLE_FIELDS, FULFILLMENT_VALUES,
  CATEGORY_PRESETS, STORAGE_PRESETS,
} from './calc.mjs';

/**
 * The two preset selects, carried by the option keys the presets themselves
 * define rather than by a list copied here.
 *
 * They were left out on the argument that the numbers they fill — the referral
 * rate and the storage rate — ride in the link anyway, so the arithmetic is
 * right either way. That is true and it is not enough: the recipient's page
 * then reads "Home & kitchen (15%)" over a referral rate of 17%, and the two
 * disagree about the job on screen. A seller who trusts the label prices the
 * wrong category.
 */
export const ENUM_FIELDS = Object.freeze({
  category: Object.freeze(Object.keys(CATEGORY_PRESETS)),
  storageSeason: Object.freeze(Object.keys(STORAGE_PRESETS)),
});

/**
 * Encode the current inputs as URL query text.
 *
 * Only finite, non-negative numbers are written. A blank optional field (the
 * page has several that mean "derive it from the size tier") is left out, so
 * the link says nothing about it rather than pinning it to zero.
 */
export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of INPUT_FIELDS) {
    const raw = input?.[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  for (const field of TOGGLE_FIELDS) {
    if (input?.[field] === undefined || input?.[field] === null) continue;
    params.set(field, input[field] ? '1' : '0');
  }
  if (FULFILLMENT_VALUES.includes(input?.fulfillmentMethod)) {
    params.set('fulfillmentMethod', input.fulfillmentMethod);
  }
  for (const [field, allowed] of Object.entries(ENUM_FIELDS)) {
    if (allowed.includes(input?.[field])) params.set(field, input[field]);
  }
  return params.toString();
}

/**
 * Read whatever a link carries, ignoring the rest.
 *
 * Returns only the fields actually present and valid, so the caller can apply
 * them over the page's defaults. A hostile or corrupted link yields an empty
 * object rather than throwing: the page still works, it just shows its own
 * numbers, which is the safe failure for a tool nobody is supervising.
 */
export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || '').replace(/^[?#]/, ''));
  const result = {};
  for (const field of INPUT_FIELDS) {
    if (!params.has(field)) continue;
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  for (const field of TOGGLE_FIELDS) {
    if (!params.has(field)) continue;
    const raw = params.get(field);
    // Only the two spellings this module writes. Anything else is a corrupted
    // link, and guessing at it would silently flip a scenario on or off.
    if (raw === '1' || raw === '0') result[field] = raw === '1';
  }
  const method = params.get('fulfillmentMethod');
  if (FULFILLMENT_VALUES.includes(method)) result.fulfillmentMethod = method;
  for (const [field, allowed] of Object.entries(ENUM_FIELDS)) {
    // Only an option the select actually offers, so a crafted link cannot name
    // a category the calculator has no referral rate for.
    const value = params.get(field);
    if (allowed.includes(value)) result[field] = value;
  }
  return result;
}
