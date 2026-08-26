// Persistence and sharing serialize the same field set. Encode/decode stay
// pure — no DOM, no storage, no network — so share.test.mjs can lock the
// mapping. Unknown keys are dropped, so a crafted link can only ever set
// known numeric fields and the two small enums.

export const FIELD_IDS = [
  "unitWholesale",
  "quantity",
  "unitCogs",
  "openingDiscountRate",
  "shippingReimbursement",
  "shippingCost",
  "otherCost",
  "promotedRate",
  "commissionRate",
  "firstOrderFlat",
  "firstOrderExtraRate",
  "paymentRate",
  "paymentFixed",
  "targetMargin",
  "expectedReorders",
  "annualCarryRate",
  "openHouseDiscountRate",
  "openHouseCommissionRate",
  "openHouseExtraRetailers",
  "organicFirstOrders",
  "extraPromotedOrders",
  "campaignPromotedRate",
  "attributedOrganicPct",
  "returnUnits",
  "returnLabel",
  "restockablePct",
  "keepDiscountPct",
  "denyKeepPct",
  "payNowRate",
  "payNowTakePct",
  "extraPayNowOrders",
  "netWaitDays",
  "payNowWaitDays",
];

export const RETAILER_FIELD_IDS = [
  "unitWholesale",
  "quantity",
  "unitsSold",
  "openingDiscountRate",
  "shippingPaid",
  "unitRetail",
  "storePaymentRate",
  "storePaymentFixed",
  "otherCost",
  "targetMargin",
];

export const ENUM_FIELDS = {
  region: ["north_america", "outside_na"],
  payout: ["next_day", "day_30", "day_60"],
};

function usableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  return result;
}

function usableEnum(id, value) {
  const allowed = ENUM_FIELDS[id];
  if (!allowed) return null;
  return allowed.includes(value) ? value : null;
}

export function encodeInputs(inputs, fieldIds = FIELD_IDS, includeEnums = true) {
  const params = new URLSearchParams();
  for (const id of fieldIds) {
    const value = usableNumber(inputs?.[id]);
    if (value !== null) params.set(id, String(value));
  }
  if (includeEnums) {
    for (const id of Object.keys(ENUM_FIELDS)) {
      const value = usableEnum(id, inputs?.[id]);
      if (value !== null) params.set(id, value);
    }
  }
  return params.toString();
}

export function decodeInputs(source, fieldIds = FIELD_IDS, includeEnums = true) {
  if (typeof source !== "string") return {};
  const params = new URLSearchParams(source.replace(/^[?#]/, ""));
  const inputs = {};
  for (const id of fieldIds) {
    if (!params.has(id)) continue;
    const value = usableNumber(params.get(id));
    if (value !== null) inputs[id] = value;
  }
  if (includeEnums) {
    for (const id of Object.keys(ENUM_FIELDS)) {
      if (!params.has(id)) continue;
      const value = usableEnum(id, params.get(id));
      if (value !== null) inputs[id] = value;
    }
  }
  return inputs;
}
