// Share only calculator assumptions in the URL. No saved inputs leave the
// browser except when the user explicitly copies a link.

const BOOKING_FIELDS = [
  "nightlyRate",
  "nights",
  "cleaningFee",
  "extraFees",
  "taxRate",
  "securityDeposit",
  "bookingsPerYear",
];

const CHANNEL_FIELDS = [
  "hostFeeRate",
  "guestFeeRate",
  "processingRate",
  "processingFixed",
  "annualFee",
  "monthlyFee",
  "occupancyKeep",
];

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function encodeComparison(booking = {}, channels = []) {
  const payload = {
    booking: Object.fromEntries(BOOKING_FIELDS
      .map((key) => [key, finiteNumber(booking[key])])
      .filter(([, value]) => value !== null)),
    channels: channels.map((channel) => ({
      id: channel.id,
      enabled: channel.enabled !== false,
      values: Object.fromEntries(CHANNEL_FIELDS
        .map((key) => [key, finiteNumber(channel[key])])
        .filter(([, value]) => value !== null)),
    })),
  };
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeComparison(value) {
  try {
    const parsed = JSON.parse(decodeURIComponent(String(value || "")));
    if (!parsed || typeof parsed !== "object") return null;
    const booking = {};
    for (const key of BOOKING_FIELDS) {
      const number = finiteNumber(parsed.booking?.[key]);
      if (number !== null && number >= 0) booking[key] = number;
    }
    const channels = Array.isArray(parsed.channels)
      ? parsed.channels
        .filter((channel) => channel && typeof channel.id === "string")
        .map((channel) => ({
          id: channel.id,
          enabled: channel.enabled !== false,
          ...Object.fromEntries(CHANNEL_FIELDS
            .map((key) => [key, finiteNumber(channel.values?.[key])])
            .filter(([, value]) => value !== null && value >= 0)),
        }))
      : [];
    return { booking, channels };
  } catch {
    return null;
  }
}
