// Shareable net-sheet link.
//
// This venture's third hypothesis in `VENTURE.yaml` is that copying a
// two-offer comparison into a text message or a listing appointment changes
// whether the higher offer is accepted without a net check. The page could
// already copy the worksheet as *text*, which is what a seller reads -- but
// text is where the conversation stops. A listing agent who wants the seller
// to try their own payoff figure, or a seller who wants a second agent to
// check the assumptions, needs the recipient to land on the same worksheet
// with the same twenty-four numbers already in it. Retyping them is how that
// second look never happens.
//
// A dropped field is the failure mode that matters here, and it is not
// cosmetic: this page exists to show that the higher offer is not always the
// higher net, so a link that silently loses `bConcessionFlat` hands the
// recipient the *opposite* conclusion from the one the sender saw, with no
// visible sign anything is missing. Every field the page reads therefore
// rides in the link, and the lists below are the same ids `index.html`
// declares.
//
// The transform is pure -- no DOM, no storage, no network -- and the page
// puts the payload in the URL *fragment*, which browsers never send to a
// server. That is the same promise the rest of this venture makes: the sale
// price, the payoff, and what the seller walks away with stay on the two
// devices the link is pasted between.

import { COMMISSION_PRESETS } from "./calc.mjs";

/** Costs that apply to both offers. Mirrors `SHARED_IDS` in `index.html`. */
export const SHARED_FIELD_IDS = Object.freeze([
  "loanPayoff", "listingRate", "listingFlat", "titleFlat", "titleRate",
  "transferTaxRate", "transferTaxFlat", "recording", "hoaFees",
  "homeWarranty", "repairsCredits", "taxProration", "otherClosing", "prepCash",
]);

/** Offer A, including the target net the walk-away price solves for. */
export const OFFER_A_FIELD_IDS = Object.freeze([
  "salePrice", "buyerBrokerRate", "buyerBrokerFlat",
  "concessionRate", "concessionFlat", "targetNet",
]);

/** Offer B, the competing offer the comparison table ranks against A. */
export const OFFER_B_FIELD_IDS = Object.freeze([
  "bSalePrice", "bBuyerBrokerRate", "bBuyerBrokerFlat", "bConcessionFlat",
]);

// The estimator box that fills `taxProration`. Carried because the recipient
// should see where an unusual proration came from, not just the figure: a
// $2,400 line reads as a typo until you can see it was a $10,950 annual bill
// over 80 days. Dropping these would leave the box empty beside a filled
// field, which looks like a bug in the page rather than a missing input.
export const PRORATION_FIELD_IDS = Object.freeze([
  "prorationAnnualTax", "prorationDays",
]);

export const NUMBER_FIELD_IDS = Object.freeze([
  ...SHARED_FIELD_IDS, ...OFFER_A_FIELD_IDS, ...OFFER_B_FIELD_IDS, ...PRORATION_FIELD_IDS,
]);

// Imported from `calc.mjs`, never restated. The commission preset stamps
// three rate fields, so a link that carried a preset id this page does not
// know would either throw or silently reopen at the default split -- and
// CLAUDE.md records twice what a copied-instead-of-imported constant costs
// here once the two drift.
export const PRESET_IDS = Object.freeze(Object.keys(COMMISSION_PRESETS));

/** The query key the commission preset rides under. */
export const PRESET_FIELD_ID = "preset";

// `usageOptOut` is deliberately absent. It is the recipient's own privacy
// choice about their own browser, and a sender should not be able to switch
// counting back on -- or off -- for someone else by handing them a link.

function usableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

/**
 * Encode the page's current inputs as a URL fragment payload.
 *
 * Blank and unusable fields are omitted rather than sent as empty strings, so
 * the recipient's page keeps its own default for anything the sender left
 * alone instead of being handed a field it must treat as zero.
 */
export function encodeInputs(inputs) {
  const params = new URLSearchParams();
  for (const id of NUMBER_FIELD_IDS) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  const preset = inputs?.[PRESET_FIELD_ID];
  if (typeof preset === "string" && PRESET_IDS.includes(preset)) {
    params.set(PRESET_FIELD_ID, preset);
  }
  return params.toString();
}

/**
 * Read a fragment (or query string) back into an input map.
 *
 * Anything unrecognised, negative, or non-numeric is dropped rather than
 * throwing: a truncated link pasted into a text message should open the page
 * on the fields that survived, not on an error.
 */
export function decodeInputs(source) {
  if (typeof source !== "string") return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ""));
  const inputs = {};
  for (const id of NUMBER_FIELD_IDS) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  const preset = params.get(PRESET_FIELD_ID);
  if (preset !== null && PRESET_IDS.includes(preset)) inputs[PRESET_FIELD_ID] = preset;
  return inputs;
}
