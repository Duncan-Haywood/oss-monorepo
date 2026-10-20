// Shareable link for a priced teaching week. Follows the same URL-hash
// convention as this month's other share links across the portfolio: nothing
// is sent to a server, the payload rides in the fragment (never the query
// string a server or Referer header would log), and only a fixed, validated
// shape is accepted back in -- a crafted fragment cannot inject a
// non-numeric field into the form.
//
// Before this, the only way a teacher could hand their priced week to
// another teacher, a bookkeeper, or a studio partner was to read every
// field out loud -- there was no way to send the *inputs* so the recipient
// could open them, adjust one assumption, and see the result for themselves.

import { INPUT_FIELDS } from "./calc.mjs";

function usableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function encodeShare(input) {
  const payload = {};
  INPUT_FIELDS.forEach((key) => {
    const n = usableNumber(input?.[key]);
    if (n !== null) payload[key] = n;
  });
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
  INPUT_FIELDS.forEach((key) => {
    const n = usableNumber(parsed[key]);
    if (n !== null) out[key] = n;
  });
  if (Object.keys(out).length === 0) return null;
  return out;
}
