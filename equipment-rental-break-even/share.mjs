// Shareable link for a rental-booking scenario. Follows the same URL-hash
// convention as this month's other share links across the portfolio:
// nothing is sent to a server, the payload rides in the fragment (never the
// query string a server or Referer header would log), and only a fixed,
// validated shape is accepted back in -- a crafted fragment cannot inject a
// non-numeric cost or an unbounded currency label into the form.
//
// Before this, the only way to hand a priced booking to a partner or
// customer was "Download quote snapshot" (a one-way, read-only text file)
// or naming every field out loud -- there was no way to send the *inputs*
// so the recipient could open them, adjust one assumption, and see the
// result for themselves the way "Save draft" already lets the same browser
// do for itself.

const NUMERIC_FIELDS = [
  "booking",
  "rental_days",
  "delivery",
  "cleaning",
  "damage",
  "purchase",
  "life",
  "fixed_monthly",
  "available",
  "target_margin",
];

function usableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function usableCurrency(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 8);
  return trimmed || null;
}

export function encodeShare(input) {
  const payload = {};
  NUMERIC_FIELDS.forEach((key) => {
    const n = usableNumber(input?.[key]);
    if (n !== null) payload[key] = n;
  });
  const currency = usableCurrency(input?.currency);
  if (currency !== null) payload.currency = currency;
  return encodeURIComponent(JSON.stringify(payload));
}

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

  const out = {};
  NUMERIC_FIELDS.forEach((key) => {
    const n = usableNumber(parsed[key]);
    if (n !== null) out[key] = n;
  });
  const currency = usableCurrency(parsed.currency);
  if (currency !== null) out.currency = currency;
  if (Object.keys(out).length === 0) return null;
  return out;
}
