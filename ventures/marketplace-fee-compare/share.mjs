// Allowlisted share encoding for the marketplace comparison. A shared URL
// must reconstruct the same comparison the sender saw -- silently dropping a
// field (an edited rate override, the category, the order volume that spreads
// a subscription) is how two people looking at the "same" link compute
// different net-profit rankings. Only these keys ride in the page's URL
// fragment (after the `#`); the fragment is never sent to a server by the
// browser, so a shared quote never appears in a request log.
//
// Same shape as the sibling bid calculators' share.mjs: an explicit key
// allowlist on both encode and decode, so a crafted or stale fragment cannot
// inject an unexpected field and a future field added to the item without a
// matching update here is silently excluded rather than silently wrong.

import { CHANNEL_IDS } from "./calc.mjs";

export const ITEM_FIELDS = Object.freeze([
  "price",
  "shippingCharged",
  "itemCost",
  "shippingCost",
  "otherCost",
  "monthlyOrders",
  "categoryId",
]);

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== "") {
      out[key] = object[key];
    }
  }
  return out;
}

/**
 * @param {object} item - the raw form values (strings), same shape `readItem()` builds.
 * @param {object} overrides - `{ [channelId]: rateString }`, same shape `readOverrides()` builds.
 * @param {object} adRates - `{ [channelId]: adPercentString }`, same shape `readAdRates()` builds.
 */
export function encodeShare(item, overrides = {}, adRates = {}) {
  const payload = { item: pick(item || {}, ITEM_FIELDS) };
  const rates = pick(overrides || {}, CHANNEL_IDS);
  if (Object.keys(rates).length > 0) payload.overrides = rates;
  const ads = pick(adRates || {}, CHANNEL_IDS);
  if (Object.keys(ads).length > 0) payload.adRates = ads;
  return encodeURIComponent(JSON.stringify(payload));
}

/**
 * Returns `null` for a missing, malformed, or empty fragment -- the page
 * treats that as "no shared link" and falls back to its own defaults, never
 * as an error the visitor has to see.
 */
export function decodeShare(fragment) {
  if (!fragment) return null;
  const raw = String(fragment).replace(/^#/, "");
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const item = pick(parsed.item ?? {}, ITEM_FIELDS);
  const overrides = pick(parsed.overrides ?? {}, CHANNEL_IDS);
  const adRates = pick(parsed.adRates ?? {}, CHANNEL_IDS);
  if (Object.keys(item).length === 0 && Object.keys(overrides).length === 0 && Object.keys(adRates).length === 0) return null;
  return { item, overrides, adRates };
}
