// Share only calculator assumptions in the URL. No saved inputs leave the
// browser except when the user explicitly copies a link.
//
// Every field the calculator reads must appear in one of these two lists. A
// field that is missing is silently dropped from the link, and the recipient
// then computes a different answer than the sender saw — the failure mode is
// a wrong number, not an error.
const SHARED_FIELDS = [
  "price", "shippingCharged", "shippingCost", "itemCost",
  "packagingCost", "otherCost", "monthlyOrders", "daysToSell",
  "horizonDays", "capitalCostPct", "unsoldRecoveryPct", "targetProfit",
];
const CHANNEL_FIELDS = [
  "price", "shippingCharged", "shippingCost", "fulfilmentCost",
  "commissionRate", "paymentRate", "paymentFixed", "perListingFee",
  "monthlyFee", "adRate", "expectedMonthlySales",
  "returnRate", "returnShippingCost", "resellableRate", "feeRefundRate",
  "sellThroughPct", "daysToSell", "listingRenewalDays",
];
// Not a number, so it rides alongside the numeric fields rather than in them.
const RANK_MODES = new Set(["profit", "profitPerDay"]);

function sharedNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function encodeComparison(shared = {}, channels = []) {
  const payload = {
    shared: Object.fromEntries(SHARED_FIELDS
      .filter((key) => shared[key] !== undefined && shared[key] !== "")
      .map((key) => [key, shared[key]])),
    includeSubscription: shared.includeSubscription !== false,
    // Carried so a link opens on the same ranking the sender was reading. A
    // link that reorders the table under the recipient answers a different
    // question from the one that was shared.
    rankBy: RANK_MODES.has(shared.rankBy) ? shared.rankBy : "profit",
    includeReturns: shared.includeReturns !== false,
    channels: channels.map((channel) => ({
      id: channel.id,
      enabled: channel.enabled !== false,
      values: Object.fromEntries(CHANNEL_FIELDS
        .filter((key) => channel[key] !== undefined && channel[key] !== "")
        .map((key) => [key, channel[key]])),
    })),
  };
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeComparison(value) {
  try {
    const parsed = JSON.parse(decodeURIComponent(String(value || "")));
    if (!parsed || typeof parsed !== "object") return null;
    const shared = {};
    for (const key of SHARED_FIELDS) {
      const number = sharedNumber(parsed.shared?.[key]);
      if (number !== null) shared[key] = number;
    }
    const channels = Array.isArray(parsed.channels) ? parsed.channels
      .filter((channel) => channel && typeof channel.id === "string")
      .map((channel) => ({
        id: channel.id,
        enabled: channel.enabled !== false,
        // Coerce, do not merely pass through: a link is untrusted input, and a
        // non-numeric value used to survive this filter and reach the
        // calculator, where it surfaced as a validation error on a field the
        // recipient never typed. Dropping it falls back to the preset instead.
        ...Object.fromEntries(CHANNEL_FIELDS.map((key) => {
          const number = sharedNumber(channel.values?.[key]);
          return [key, number];
        }).filter(([, value]) => value !== null)),
      })) : [];
    const rankBy = RANK_MODES.has(parsed.rankBy) ? parsed.rankBy : "profit";
    return {
      shared,
      includeSubscription: parsed.includeSubscription !== false,
      rankBy,
      includeReturns: parsed.includeReturns !== false,
      channels,
    };
  } catch {
    return null;
  }
}
