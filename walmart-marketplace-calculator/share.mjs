// Put the whole scenario in the URL, so a seller can bookmark it, send it to
// a partner, or come back to the same WFS-vs-seller-fulfilled decision
// tomorrow without re-typing referral rate, dimensions, weight, storage,
// take rates, return mix, aged-inventory pile, ad spend, and match take.
//
// Nothing is uploaded. The values ride in the URL fragment, which browsers do
// not send to any server, and the page reads them out of `location.hash` in
// the reader's own browser.
//
// The field list is not maintained here. It is imported from `calc.mjs`,
// where the page also reads it. An allowlist kept beside the encoder is how a
// share link silently loses a field: `ebay-fee-calculator`'s own copy fell
// behind twice (batch quantity, then target margin), and
// `where-to-sell-calculator`'s dropped `quantity` and `targetMargin` outright
// — in both cases the recipient computed a different profit than the sender
// saw and nothing went red.
import {
  INPUT_FIELDS, FULFILLMENT_VALUES, CATEGORY_PRESETS, STORAGE_PRESETS,
} from './calc.mjs';

// The two preset selects, carried by the option keys the presets themselves
// define. The referral rate and storage rate they fill already ride in the
// link as their own numeric fields, so the arithmetic is right either way —
// but a recipient who sees "Electronics (8%)" over a referral rate of 15%
// would trust the label over the number it disagrees with.
export const ENUM_FIELDS = Object.freeze({
  category: Object.freeze(Object.keys(CATEGORY_PRESETS)),
  storageSeason: Object.freeze(Object.keys(STORAGE_PRESETS)),
});

// Only finite, non-negative numbers are written. A blank optional field
// (match price, or the WFS fulfillment fee while it is following the
// size-tier default) is left out, so the link says nothing about it rather
// than pinning it to zero.
export function encodeInputs(input) {
  const params = new URLSearchParams();
  for (const field of INPUT_FIELDS) {
    const raw = input?.[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) params.set(field, String(value));
  }
  if (FULFILLMENT_VALUES.includes(input?.fulfillmentMethod)) {
    params.set('fulfillmentMethod', input.fulfillmentMethod);
  }
  for (const [field, allowed] of Object.entries(ENUM_FIELDS)) {
    if (allowed.includes(input?.[field])) params.set(field, input[field]);
  }
  return params.toString();
}

// Read whatever a link carries, ignoring the rest. Returns only the fields
// actually present and valid, so the caller can layer them over the page's
// own defaults. A hostile or corrupted link yields an empty object rather
// than throwing: the page still works, it just shows its own numbers.
export function decodeInputs(value) {
  const params = new URLSearchParams(String(value || '').replace(/^[?#]/, ''));
  const result = {};
  for (const field of INPUT_FIELDS) {
    if (!params.has(field)) continue;
    const number = Number(params.get(field));
    if (Number.isFinite(number) && number >= 0) result[field] = number;
  }
  const method = params.get('fulfillmentMethod');
  if (FULFILLMENT_VALUES.includes(method)) result.fulfillmentMethod = method;
  for (const [field, allowed] of Object.entries(ENUM_FIELDS)) {
    const optionValue = params.get(field);
    if (allowed.includes(optionValue)) result[field] = optionValue;
  }
  return result;
}
