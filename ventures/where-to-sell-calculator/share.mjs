// Share only calculator assumptions in the URL. No saved inputs leave the
// browser except when the user explicitly copies a link.
const SHARED_FIELDS = [
  "price", "shippingCharged", "shippingCost", "itemCost",
  "packagingCost", "otherCost", "monthlyOrders",
];
const CHANNEL_FIELDS = [
  "price", "shippingCharged", "shippingCost", "fulfilmentCost",
  "commissionRate", "paymentRate", "paymentFixed", "perListingFee",
  "monthlyFee", "adRate",
];

export function encodeComparison(shared = {}, channels = []) {
  const payload = {
    shared: Object.fromEntries(SHARED_FIELDS
      .filter((key) => shared[key] !== undefined)
      .map((key) => [key, shared[key]])),
    includeSubscription: shared.includeSubscription !== false,
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
      const number = Number(parsed.shared?.[key]);
      if (Number.isFinite(number) && number >= 0) shared[key] = number;
    }
    const channels = Array.isArray(parsed.channels) ? parsed.channels
      .filter((channel) => channel && typeof channel.id === "string")
      .map((channel) => ({
        id: channel.id,
        enabled: channel.enabled !== false,
        ...Object.fromEntries(CHANNEL_FIELDS.map((key) => [key, channel.values?.[key]])
          .filter(([, value]) => value !== undefined && value !== "")),
      })) : [];
    return { shared, includeSubscription: parsed.includeSubscription !== false, channels };
  } catch {
    return null;
  }
}
