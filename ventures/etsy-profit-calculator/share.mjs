// A seller's fee-and-cost assumptions are the part they re-enter every visit,
// so keeping them is what turns a one-off calculation into a tool worth
// returning to. Both persistence and sharing serialize the same field set, so
// the encode/decode pair lives here as a pure, dependency-free module: no DOM,
// no storage, no network — just the mapping between an inputs object and a
// query string. `index.html` reads/writes localStorage and the URL around it;
// keeping the transform pure is what makes it testable in `node --test`.

// The calculator's fields, in the order they appear in the form. Anything not
// on this list is ignored on the way in and never emitted on the way out, so a
// crafted or stale link can only ever set known numeric fields.
//
// `targetMargin` and `targetProfit` are on the list, and were not until
// 2026-08-29. They sit in the repricing panel rather than the order form, and a
// comment in `index.html` called them "not one of the ten shared/persisted
// fields" — written when there were ten. They are not incidental: they are the
// goal the seller typed, the thing the panel exists to answer, and they feed
// the copied order summary. Leaving them out meant a seller who set a 65%
// target came back next visit to 50% and a "charge $X" sentence for a goal they
// never set, and a partner opening their link read the same wrong number. This
// is the defect `where-to-sell-calculator` shipped in the other direction (it
// dropped `quantity` and `targetMargin` from a hand-kept allowlist) — a second
// list beside the form is how a field goes missing without anything going red.
export const FIELD_IDS = [
  'price',
  'shippingCharged',
  'listingFee',
  'transactionRate',
  'paymentRate',
  'paymentFixed',
  'offsiteAdRate',
  'shippingCost',
  'materialCost',
  'otherCost',
  'targetMargin',
  'targetProfit',
  'listingsPerMonth',
  'monthlyPlusFee',
  'listingCredits',
  'adsCredit',
  'monthlyAdSpend',
  'otherPlusValue',
  'personalizationUpcharge',
  'extraMaterialCost',
  'extraTimeCost',
  'monthlyCustomOrders',
  'etsyAdsAcosPct',
  'yourTimeCost',
  'partnerUnitCost',
  'partnerHandlingCost',
  'yourMonthlyCapacity',
  'monthlyDemand',
  'partnerRejectRatePercent',
  'starSellerShippingCost',
  'starSellerMessageMinutes',
  'starSellerHourlyWage',
  'unsignedSellThroughPct',
  'starSellerSellThroughPct',
  'starSellerListings',
  'salePercent',
  'saleDollar',
  'listedSellThroughPct',
  'saleSellThroughPct',
  'saleListings',
  'freeShipPrice',
  'monthlyOrders',
  'etsyLabelCost',
  'thirdPartyLabelCost',
  'etsyLabelClaimRatePercent',
  'thirdPartyClaimRatePercent',
  'labelUploadMinutes',
  'labelUploadWage',
  'labelFeeRefundOnClaimPercent',
  'monthlyLabelShipments',
];

// A field value is only carried if it is a finite, non-negative number — the
// same contract `calculateOrder` enforces. This keeps a shared link from ever
// prefilling a field with something the calculator would reject, and drops
// blanks rather than encoding an empty string.
function usableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

// inputs object -> query string (no leading '?'). Field order follows
// FIELD_IDS so the same inputs always encode to the same string, which keeps a
// copied link stable and lets the round-trip test compare strings directly.
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  return params.toString();
}

// query string -> inputs object. Accepts a bare query string, or one with a
// leading '?' or '#', so the caller can hand it `location.hash` or
// `location.search` without trimming first. Only known, valid fields survive.
export function decodeInputs(source) {
  if (typeof source !== 'string') return {};
  const trimmed = source.replace(/^[?#]/, '');
  const params = new URLSearchParams(trimmed);
  const inputs = {};
  for (const id of FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  return inputs;
}
